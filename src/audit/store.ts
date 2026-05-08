// SQLite-backed audit store. Uses the built-in node:sqlite module (Node 22+),
// so Trabecc ships without native compilation steps.
//
// Design notes:
//   * Writes are synchronous. SQLite is fast enough that a single-threaded
//     gateway proxying MCP calls will not be bottlenecked here in v0.
//   * We expose a `prune` operation rather than triggers — easier to reason
//     about, and the gateway runs a background pruner once per minute.
//   * The store is also opened read-only by the admin process. SQLite handles
//     multi-reader/single-writer correctly with WAL mode enabled.

import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { resolve as resolvePath } from "node:path";
import type { AuditRecord } from "../types.ts";

const SCHEMA_PATH = resolvePath(dirname(fileURLToPath(import.meta.url)), "schema.sql");

export class AuditStore {
  private db: DatabaseSync;
  private insertStmt: ReturnType<DatabaseSync["prepare"]>;
  private pruneStmt: ReturnType<DatabaseSync["prepare"]>;
  private readonly path: string;
  private readonly opts: { maxRecords: number; readOnly?: boolean };

  constructor(
    path: string,
    opts: { maxRecords: number; readOnly?: boolean } = { maxRecords: 100_000 },
  ) {
    this.path = path;
    this.opts = opts;
    // Always ensure the parent dir exists — even read-only callers (the
    // admin server) need the dir on disk for the bootstrap path below.
    mkdirSync(dirname(path), { recursive: true });

    // Read-only first-run: SQLite refuses to create files in read-only
    // mode, but it's legitimate to ask for the dashboard before the
    // gateway has ever run. Bootstrap an empty schema in write mode, close,
    // then continue to the read-only open path below.
    if (opts.readOnly && !existsSync(path)) {
      const bootstrap = new DatabaseSync(path, { readOnly: false });
      try {
        bootstrap.exec("PRAGMA journal_mode = WAL;");
        bootstrap.exec("PRAGMA synchronous = NORMAL;");
        bootstrap.exec(readFileSync(SCHEMA_PATH, "utf8"));
      } finally {
        bootstrap.close();
      }
    }

    this.db = new DatabaseSync(path, { readOnly: opts.readOnly ?? false });
    // WAL gives us concurrent readers + a single writer without blocking.
    if (!opts.readOnly) {
      this.db.exec("PRAGMA journal_mode = WAL;");
      this.db.exec("PRAGMA synchronous = NORMAL;");
      const schema = readFileSync(SCHEMA_PATH, "utf8");
      this.db.exec(schema);
    }
    this.insertStmt = this.db.prepare(
      `INSERT INTO audit_log
        (ts, agent_id, server, tool, qualified_name, args_json, outcome, reason, duration_ms, result_bytes, error_message)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    this.pruneStmt = this.db.prepare(
      `DELETE FROM audit_log
       WHERE id IN (
         SELECT id FROM audit_log ORDER BY id ASC LIMIT ?
       )`,
    );
  }

  record(rec: AuditRecord): number {
    const result = this.insertStmt.run(
      rec.ts,
      rec.agentId,
      rec.server,
      rec.tool,
      rec.qualifiedName,
      rec.argsJson,
      rec.outcome,
      rec.reason,
      rec.durationMs,
      rec.resultBytes,
      rec.errorMessage,
    );
    return Number(result.lastInsertRowid);
  }

  /** Drop oldest rows until the table holds at most `maxRecords`. */
  prune(): number {
    if (this.opts.maxRecords <= 0) return 0;
    const row = this.db.prepare("SELECT COUNT(*) AS c FROM audit_log").get() as { c: number };
    const excess = row.c - this.opts.maxRecords;
    if (excess <= 0) return 0;
    const result = this.pruneStmt.run(excess);
    return Number(result.changes);
  }

  recent(limit = 100, offset = 0): AuditRecord[] {
    const rows = this.db
      .prepare(
        `SELECT id, ts, agent_id, server, tool, qualified_name, args_json,
                outcome, reason, duration_ms, result_bytes, error_message
         FROM audit_log ORDER BY id DESC LIMIT ? OFFSET ?`,
      )
      .all(limit, offset) as Array<{
      id: number;
      ts: number;
      agent_id: string | null;
      server: string;
      tool: string;
      qualified_name: string;
      args_json: string;
      outcome: AuditRecord["outcome"];
      reason: string | null;
      duration_ms: number | null;
      result_bytes: number | null;
      error_message: string | null;
    }>;
    return rows.map((r) => ({
      id: r.id,
      ts: r.ts,
      agentId: r.agent_id,
      server: r.server,
      tool: r.tool,
      qualifiedName: r.qualified_name,
      argsJson: r.args_json,
      outcome: r.outcome,
      reason: r.reason,
      durationMs: r.duration_ms,
      resultBytes: r.result_bytes,
      errorMessage: r.error_message,
    }));
  }

  stats(sinceMs: number): {
    total: number;
    byOutcome: Record<AuditRecord["outcome"], number>;
    topTools: Array<{ qualifiedName: string; count: number }>;
  } {
    const total = (
      this.db.prepare("SELECT COUNT(*) AS c FROM audit_log WHERE ts >= ?").get(sinceMs) as { c: number }
    ).c;

    const byOutcomeRows = this.db
      .prepare("SELECT outcome, COUNT(*) AS c FROM audit_log WHERE ts >= ? GROUP BY outcome")
      .all(sinceMs) as Array<{ outcome: AuditRecord["outcome"]; c: number }>;
    const byOutcome: Record<AuditRecord["outcome"], number> = {
      allowed: 0,
      denied: 0,
      rate_limited: 0,
      error: 0,
    };
    for (const row of byOutcomeRows) byOutcome[row.outcome] = row.c;

    const topTools = (
      this.db
        .prepare(
          `SELECT qualified_name AS qualifiedName, COUNT(*) AS count
           FROM audit_log WHERE ts >= ?
           GROUP BY qualified_name ORDER BY count DESC LIMIT 10`,
        )
        .all(sinceMs) as Array<{ qualifiedName: string; count: number }>
    );

    return { total, byOutcome, topTools };
  }

  close(): void {
    this.db.close();
  }
}
