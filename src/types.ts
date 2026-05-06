// Shared types for Trabecc. The wire format is MCP; these types are the
// internal model the gateway operates on.

export type ToolRef = {
  /** Upstream server logical name, e.g. "github" */
  server: string;
  /** Upstream tool name as advertised by that server, e.g. "search_issues" */
  tool: string;
};

/** Stable wire identifier exposed to clients: "github.search_issues" */
export type QualifiedToolName = string;

export type CallOutcome = "allowed" | "denied" | "rate_limited" | "error";

export type AuditRecord = {
  id?: number;
  ts: number; // epoch ms
  agentId: string | null;
  server: string;
  tool: string;
  qualifiedName: QualifiedToolName;
  argsJson: string; // serialized request params, possibly redacted
  outcome: CallOutcome;
  reason: string | null;
  durationMs: number | null;
  resultBytes: number | null;
  errorMessage: string | null;
};
