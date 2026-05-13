// The MCP fan-out gateway. Presents a single MCP server interface to the
// downstream client (Claude Desktop / Cursor / Claude Code). Internally it
// spawns and multiplexes N upstream MCP servers, applies policy and rate
// limits, and writes every attempted call to the audit log.
//
// Why a single Server with explicit request handlers (instead of the higher-
// level McpServer): the fan-out is the whole point — we need to override
// tools/list and tools/call to interpose, not just register tools.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";

import type { Config, Rule } from "../config.ts";
import { Upstream } from "./upstream.ts";
import { qualify, unqualify } from "./namespace.ts";
import { PolicyEngine } from "../policy/engine.ts";
import {
  CloudPolicyPuller,
  derivePoliciesEndpoint,
  mergePolicies,
} from "../policy/cloud-pull.ts";
import { RateLimiter } from "../ratelimit/bucket.ts";
import { AuditStore } from "../audit/store.ts";
import { buildRedactor } from "../audit/redact.ts";
import { CloudSync } from "../audit/sync.ts";
import { expandHome } from "../config.ts";
import { createLogger } from "../log.ts";
import type { AuditRecord, CallOutcome } from "../types.ts";

const log = createLogger("gateway");

export class McpGateway {
  private upstreams: Map<string, Upstream> = new Map();
  private server: Server;
  private policy: PolicyEngine;
  private limiter: RateLimiter;
  private audit: AuditStore;
  private cloud: CloudSync | null = null;
  private policyPuller: CloudPolicyPuller | null = null;
  /** Most recent set of rules fetched from the cloud; merged with YAML on rebuild. */
  private cloudRules: Rule[] = [];
  private pruneTimer: NodeJS.Timeout | null = null;
  private readonly cfg: Config;
  private readonly redact: (value: unknown) => unknown;

  constructor(cfg: Config) {
    this.cfg = cfg;
    this.redact = buildRedactor(cfg.audit.redactKeys);
    this.policy = new PolicyEngine(cfg.rules, cfg.defaultPolicy);
    this.limiter = new RateLimiter(cfg.rateLimits);
    this.audit = new AuditStore(expandHome(cfg.audit.path), {
      maxRecords: cfg.audit.maxRecords,
    });
    if (cfg.cloud.enabled && cfg.cloud.apiKey) {
      this.cloud = new CloudSync({
        endpoint: cfg.cloud.endpoint,
        apiKey: cfg.cloud.apiKey,
        flushIntervalMs: cfg.cloud.flushIntervalMs,
        batchSize: cfg.cloud.batchSize,
        dropOnOverflow: cfg.cloud.dropOnOverflow,
        maxBuffer: cfg.cloud.maxBuffer,
      });
    }
    if (cfg.cloud.pullPolicies && cfg.cloud.apiKey) {
      const policiesEndpoint =
        cfg.cloud.policiesEndpoint ?? derivePoliciesEndpoint(cfg.cloud.endpoint);
      this.policyPuller = new CloudPolicyPuller({
        endpoint: policiesEndpoint,
        apiKey: cfg.cloud.apiKey,
        intervalMs: cfg.cloud.policyPullIntervalMs,
        onChange: (cloudRules) => this.onCloudPolicyChange(cloudRules),
      });
    }

    this.server = new Server(
      { name: "trabecc", version: "0.1.0" },
      { capabilities: { tools: {} } },
    );

    this.server.setRequestHandler(ListToolsRequestSchema, async () => this.handleListTools());
    this.server.setRequestHandler(CallToolRequestSchema, async (req) =>
      this.handleCallTool(req.params.name, req.params.arguments),
    );
  }

  async start(): Promise<void> {
    // Bring up upstreams in parallel; tolerate individual failures.
    await Promise.all(
      this.cfg.servers.map(async (sc) => {
        const up = new Upstream(sc);
        this.upstreams.set(sc.name, up);
        await up.start();
      }),
    );

    // Background pruning so the audit table doesn't grow unbounded.
    this.pruneTimer = setInterval(() => {
      try {
        this.audit.prune();
      } catch (err) {
        log.warn("audit prune failed", { err: String(err) });
      }
    }, 60_000);
    this.pruneTimer.unref();

    this.cloud?.start();
    // The puller fires its first fetch synchronously inside start(); we
    // don't await it because the gateway must be reachable on stdio first
    // so MCP clients don't time out waiting for connect().
    void this.policyPuller?.start();

    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    log.info("gateway connected on stdio", {
      upstreams: [...this.upstreams.values()].map((u) => ({ name: u.config.name, status: u.status })),
    });
  }

  async stop(): Promise<void> {
    if (this.pruneTimer) clearInterval(this.pruneTimer);
    await this.cloud?.stop();
    await this.policyPuller?.stop();
    await Promise.all([...this.upstreams.values()].map((u) => u.close()));
    await this.server.close();
    this.audit.close();
  }

  /**
   * Cloud puller callback. Stores the new cloud rule set, rebuilds the
   * PolicyEngine with cloud-first precedence over YAML, then notifies any
   * connected MCP client that the tool catalog may have changed (newly
   * denied tools disappear from /tools/list).
   *
   * The MCP spec exposes notifications/tools/list_changed for exactly this
   * — clients that honor it refresh their cached tool list automatically.
   * Clients that ignore it just see the new policy on their next
   * tools/list call, which is fine.
   */
  private onCloudPolicyChange(cloudRules: Rule[]): void {
    this.cloudRules = cloudRules;
    const merged = mergePolicies(cloudRules, this.cfg.rules);
    this.policy = new PolicyEngine(merged, this.cfg.defaultPolicy);
    log.info("policy engine rebuilt", {
      cloudRules: cloudRules.length,
      yamlRules: this.cfg.rules.length,
      total: merged.length,
    });
    // Best-effort notification. If no client is connected yet (e.g. the
    // puller's first fetch raced ahead of the stdio handshake), this
    // throws — swallow it; the next call to tools/list will pick up the
    // new policy regardless.
    try {
      this.server.sendToolListChanged();
    } catch (err) {
      log.debug("sendToolListChanged not yet deliverable", { err: String(err) });
    }
  }

  private handleListTools(): { tools: Tool[] } {
    const allTools: Tool[] = [];
    for (const up of this.upstreams.values()) {
      if (up.status !== "ready") continue;
      for (const t of up.tools()) {
        const qualified = qualify(up.config.name, t.name);
        const decision = this.policy.evaluate(qualified);
        if (decision.effect === "deny") continue; // hide denied tools rather than advertising and refusing
        allTools.push({
          ...t,
          name: qualified,
          description: t.description ? `[${up.config.name}] ${t.description}` : `[${up.config.name}]`,
        });
      }
    }
    return { tools: allTools };
  }

  private async handleCallTool(
    qualifiedName: string,
    args: Record<string, unknown> | undefined,
  ): Promise<CallToolResult> {
    const startedAt = Date.now();
    const ref = unqualify(qualifiedName);

    const recordAndReturn = (
      outcome: CallOutcome,
      reason: string | null,
      result: CallToolResult,
      errorMessage: string | null = null,
      resultBytes: number | null = null,
    ): CallToolResult => {
      const rec: AuditRecord = {
        ts: startedAt,
        agentId: this.currentAgentId(),
        server: ref?.server ?? "unknown",
        tool: ref?.tool ?? qualifiedName,
        qualifiedName,
        argsJson: this.serializeArgs(args),
        outcome,
        reason,
        durationMs: Date.now() - startedAt,
        resultBytes,
        errorMessage,
      };
      try {
        this.audit.record(rec);
      } catch (err) {
        log.warn("audit record failed", { err: String(err) });
      }
      this.cloud?.enqueue(rec);
      return result;
    };

    if (!ref) {
      return recordAndReturn(
        "error",
        "malformed qualified tool name",
        errorResult(`tool name "${qualifiedName}" is not in <server>__<tool> form`),
        "malformed qualified tool name",
      );
    }

    const up = this.upstreams.get(ref.server);
    if (!up) {
      return recordAndReturn(
        "error",
        `unknown server "${ref.server}"`,
        errorResult(`unknown upstream server "${ref.server}"`),
        `unknown server "${ref.server}"`,
      );
    }

    const decision = this.policy.evaluate(qualifiedName, args);
    if (decision.effect === "deny") {
      log.info("denied by policy", { tool: qualifiedName, reason: decision.reason });
      return recordAndReturn(
        "denied",
        decision.reason,
        errorResult(`policy denied tool "${qualifiedName}": ${decision.reason}`),
      );
    }

    const rl = this.limiter.consume(qualifiedName);
    if (!rl.allowed) {
      const reason = `rate limit exceeded (${rl.matchedRule?.perMinute}/min)`;
      log.warn("rate limited", { tool: qualifiedName });
      return recordAndReturn(
        "rate_limited",
        reason,
        errorResult(`rate limit exceeded for "${qualifiedName}" (${rl.matchedRule?.perMinute}/min)`),
      );
    }

    try {
      const result = await up.callTool(ref.tool, args);
      const resultStr = JSON.stringify(result);
      return recordAndReturn(
        "allowed",
        decision.reason,
        result,
        null,
        Buffer.byteLength(resultStr, "utf8"),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error("upstream call failed", { tool: qualifiedName, err: msg });
      return recordAndReturn(
        "error",
        "upstream call failed",
        errorResult(`upstream call failed: ${msg}`),
        msg,
      );
    }
  }

  /** Returns "<clientName>@<version>" if known, else null. Set during MCP initialize. */
  private currentAgentId(): string | null {
    const impl = this.server.getClientVersion();
    if (!impl) return null;
    return impl.version ? `${impl.name}@${impl.version}` : impl.name;
  }

  private serializeArgs(args: Record<string, unknown> | undefined): string {
    if (!args) return "{}";
    if (this.cfg.audit.recordArgs) {
      try {
        return JSON.stringify(this.redact(args));
      } catch {
        return JSON.stringify({ _unserializable: true, keys: Object.keys(args) });
      }
    }
    return JSON.stringify({ _keysOnly: Object.keys(args) });
  }

  /** Snapshot of upstream status for the admin API. */
  describe(): Array<{ name: string; status: string; tools: number; lastError: string | null }> {
    return [...this.upstreams.values()].map((u) => ({
      name: u.config.name,
      status: u.status,
      tools: u.tools().length,
      lastError: u.lastError,
    }));
  }
}

function errorResult(message: string): CallToolResult {
  return {
    isError: true,
    content: [{ type: "text", text: message }],
  };
}
