// Manages a single upstream MCP server: spawn, initialize, list tools,
// forward calls. Each upstream lives in its own child process; if one
// crashes we mark it down and the gateway keeps serving the rest.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { Tool, CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ServerConfig } from "../config.ts";
import { createLogger } from "../log.ts";

const log = createLogger("upstream");

export type UpstreamStatus = "starting" | "ready" | "down";

export class Upstream {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private toolsCache: Tool[] = [];
  status: UpstreamStatus = "starting";
  lastError: string | null = null;
  readonly config: ServerConfig;

  constructor(config: ServerConfig) {
    this.config = config;
  }

  async start(): Promise<void> {
    if (!this.config.enabled) {
      this.status = "down";
      this.lastError = "disabled in config";
      return;
    }
    try {
      this.transport = new StdioClientTransport({
        command: this.config.command,
        args: this.config.args,
        env: { ...process.env, ...this.config.env } as Record<string, string>,
        cwd: this.config.cwd,
      });

      this.client = new Client(
        { name: "trabecc", version: "0.1.0" },
        { capabilities: {} },
      );

      this.client.onerror = (err) => {
        log.warn(`upstream "${this.config.name}" client error`, { err: String(err) });
        this.status = "down";
        this.lastError = String(err);
      };

      await this.client.connect(this.transport);

      const tools = await this.client.listTools();
      this.toolsCache = tools.tools;
      this.status = "ready";
      this.lastError = null;
      log.info(`upstream "${this.config.name}" ready`, { tools: this.toolsCache.length });
    } catch (err) {
      this.status = "down";
      this.lastError = err instanceof Error ? err.message : String(err);
      log.error(`upstream "${this.config.name}" failed to start`, { err: this.lastError });
      // Best-effort cleanup
      try {
        await this.transport?.close();
      } catch {
        /* noop */
      }
      this.client = null;
      this.transport = null;
    }
  }

  tools(): Tool[] {
    return this.toolsCache;
  }

  async callTool(name: string, args: Record<string, unknown> | undefined): Promise<CallToolResult> {
    if (this.status !== "ready" || !this.client) {
      throw new Error(`upstream "${this.config.name}" is not ready: ${this.lastError ?? "unknown reason"}`);
    }
    return await this.client.callTool(
      { name, arguments: args },
      undefined,
      { timeout: this.config.timeoutMs },
    ) as CallToolResult;
  }

  async refreshTools(): Promise<void> {
    if (!this.client || this.status !== "ready") return;
    try {
      const tools = await this.client.listTools();
      this.toolsCache = tools.tools;
    } catch (err) {
      log.warn(`refreshTools failed for "${this.config.name}"`, { err: String(err) });
    }
  }

  async close(): Promise<void> {
    try {
      await this.client?.close();
    } catch {
      /* noop */
    }
    try {
      await this.transport?.close();
    } catch {
      /* noop */
    }
    this.client = null;
    this.transport = null;
    this.status = "down";
  }
}
