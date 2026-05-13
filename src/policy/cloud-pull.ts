// Periodically fetches policy rules from Trabecc Cloud and surfaces them
// via an onChange callback. Designed to fail safely: network errors keep
// the last-known-good rule set in memory; nothing in this file ever
// blocks the gateway's hot path. The actual swap of the PolicyEngine
// happens in McpGateway when it consumes the callback.

import type { Rule, WhenClause } from "../config.ts";
import { createLogger } from "../log.ts";

const log = createLogger("cloud-pull");

/** Cloud's wire-format policy record (matches cloud/src/db.ts PolicyRecord). */
type CloudPolicy = {
  id: string;
  name: string;
  matchGlob: string;
  whenClauses: Record<string, WhenClause> | null;
  effect: "allow" | "deny";
  reason: string | null;
  enabled: boolean;
};

export type CloudPullerOptions = {
  endpoint: string;
  apiKey: string;
  intervalMs: number;
  onChange: (rules: Rule[]) => void;
  /** Test injection points. */
  now?: () => number;
  fetchImpl?: typeof fetch;
};

export class CloudPolicyPuller {
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;
  private fetch: typeof fetch;
  /** Last-known-good rule set; survives transient fetch failures. */
  private lastRules: Rule[] = [];
  private lastFetchOk = false;
  private opts: CloudPullerOptions;

  constructor(opts: CloudPullerOptions) {
    this.opts = opts;
    this.fetch = opts.fetchImpl ?? globalThis.fetch;
  }

  /** Fetch once immediately, then schedule recurring pulls. */
  async start(): Promise<void> {
    if (this.stopped) return;
    // Best-effort first fetch; failure here is logged but never thrown.
    await this.pullOnce();
    this.timer = setInterval(() => void this.pullOnce(), this.opts.intervalMs);
    this.timer.unref();
    log.info("cloud policy pull enabled", {
      endpoint: this.opts.endpoint,
      intervalMs: this.opts.intervalMs,
    });
  }

  async pullOnce(): Promise<void> {
    if (this.stopped) return;
    try {
      const res = await this.fetch(this.opts.endpoint + "?enabled=true", {
        headers: {
          authorization: `Bearer ${this.opts.apiKey}`,
          "x-trabecc-version": "0.3.1",
        },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const body = (await res.json()) as { policies?: CloudPolicy[] };
      const rules = parsePoliciesToRules(body.policies ?? []);

      // Skip the onChange call if the rule set is unchanged — avoids
      // pointless PolicyEngine rebuilds and spurious tool-list-changed
      // notifications to the MCP client.
      if (!this.lastFetchOk || !rulesEqual(this.lastRules, rules)) {
        this.lastRules = rules;
        this.lastFetchOk = true;
        log.info("cloud policy set updated", { count: rules.length });
        this.opts.onChange(rules);
      }
    } catch (err) {
      // Network / auth / parsing failures — keep using the last-known set.
      log.warn("cloud policy pull failed; keeping last-known rules", {
        err: err instanceof Error ? err.message : String(err),
        lastKnownCount: this.lastRules.length,
      });
    }
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

/**
 * Translate cloud policy records into the OSS Rule shape. The schemas
 * are intentionally close — this is mostly field renames.
 */
export function parsePoliciesToRules(policies: CloudPolicy[]): Rule[] {
  return policies
    .filter((p) => p.enabled)
    .map((p) => {
      const rule: Rule = {
        match: p.matchGlob,
        effect: p.effect,
        ...(p.reason !== null && p.reason !== undefined && { reason: p.reason }),
        ...(p.whenClauses && Object.keys(p.whenClauses).length > 0 && { when: p.whenClauses }),
      };
      return rule;
    });
}

/** Cheap deep-equal for rule arrays — used to skip identity re-renders. */
function rulesEqual(a: Rule[], b: Rule[]): boolean {
  if (a.length !== b.length) return false;
  // Reasonable: JSON.stringify with stable-ish key order from object literals.
  // Rules are small flat shapes; cost is bounded.
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Merge cloud rules and YAML rules into a single Rule[]. Cloud rules are
 * placed FIRST so they take precedence under the engine's first-match-wins
 * semantics. YAML is the fallback / bootstrap path that always works even
 * when cloud is unreachable.
 */
export function mergePolicies(cloudRules: Rule[], yamlRules: Rule[]): Rule[] {
  return [...cloudRules, ...yamlRules];
}

/**
 * Derive the policies endpoint from the ingest endpoint by string-replacing
 * the path component. Most users set only `cloud.endpoint`; this avoids
 * forcing them to set both.
 */
export function derivePoliciesEndpoint(ingestEndpoint: string): string {
  if (ingestEndpoint.endsWith("/v1/ingest")) {
    return ingestEndpoint.slice(0, -"/v1/ingest".length) + "/v1/policies";
  }
  // If the user configured a non-standard ingest path, fall back to the
  // default and let them override via policiesEndpoint explicitly.
  return new URL("/v1/policies", ingestEndpoint).toString();
}
