// Trabecc Cloud — database layer.
//
// Three tables. Raw SQL via postgres.js. No ORM — at this scale Drizzle
// adds more friction than safety. We tighten this when the cloud product
// has 5+ paying customers and the schema starts evolving.

import postgres from "postgres";

const url = process.env["DATABASE_URL"];
if (!url) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env and configure it.");
  process.exit(1);
}

export const sql = postgres(url, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
  prepare: false, // Neon's pooled pgbouncer doesn't support prepared statements
  // Suppress NOTICE-level chatter from idempotent CREATE TABLE IF NOT EXISTS
  // calls. Real warnings/errors still surface via thrown promises.
  onnotice: () => {},
});

// ============================================================
// SCHEMA — applied idempotently on first connect
// ============================================================

export const SCHEMA_SQL = /* sql */ `
  CREATE TABLE IF NOT EXISTS organizations (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    plan          TEXT NOT NULL DEFAULT 'pro' CHECK (plan IN ('pro','team','enterprise')),
    retention_days INTEGER NOT NULL DEFAULT 90,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS api_keys (
    id            TEXT PRIMARY KEY,
    org_id        TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    -- We store a SHA-256 hash of the key, never the key itself. The plaintext
    -- is shown to the user exactly once at creation time (matches the npm /
    -- GitHub token UX). Plaintext key prefix 'tk_live_<install>_<random>'.
    key_hash      TEXT NOT NULL UNIQUE,
    -- Last 4 chars of the plaintext, used for human identification in the UI
    last_four     CHAR(4) NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at  TIMESTAMPTZ,
    revoked_at    TIMESTAMPTZ
  );
  CREATE INDEX IF NOT EXISTS idx_api_keys_org ON api_keys(org_id);

  CREATE TABLE IF NOT EXISTS audit_events (
    id              BIGSERIAL PRIMARY KEY,
    org_id          TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    install_id      TEXT NOT NULL,           -- hash of host+home from src/audit/sync.ts
    host_id         TEXT NOT NULL,           -- machine hostname (low cardinality)
    ts              BIGINT NOT NULL,         -- epoch ms from the gateway (NOT received-at)
    received_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    agent_id        TEXT,
    server          TEXT NOT NULL,
    tool            TEXT NOT NULL,
    qualified_name  TEXT NOT NULL,
    args_json       JSONB,
    outcome         TEXT NOT NULL CHECK (outcome IN ('allowed','denied','rate_limited','error')),
    reason          TEXT,
    duration_ms     INTEGER,
    result_bytes    INTEGER,
    error_message   TEXT
  );
  -- The hot index: tenant + time. Most dashboard queries filter by these two.
  CREATE INDEX IF NOT EXISTS idx_events_org_ts ON audit_events(org_id, ts DESC);
  CREATE INDEX IF NOT EXISTS idx_events_org_outcome_ts ON audit_events(org_id, outcome, ts DESC);
  CREATE INDEX IF NOT EXISTS idx_events_org_qname_ts ON audit_events(org_id, qualified_name, ts DESC);
  CREATE INDEX IF NOT EXISTS idx_events_install ON audit_events(install_id);

  -- Track per-flush drops reported by the OSS gateway. Useful for "are we
  -- losing events?" alerting without polluting the events table itself.
  CREATE TABLE IF NOT EXISTS ingest_drops (
    id           BIGSERIAL PRIMARY KEY,
    org_id       TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    install_id   TEXT NOT NULL,
    received_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    dropped      INTEGER NOT NULL
  );

  -- Cloud-managed policies. Users create these via the dashboard UI; OSS
  -- gateways pull them via GET /v1/policies and merge with YAML rules.
  -- match_glob + when_clauses match the OSS PolicyEngine wire format
  -- exactly so the OSS can construct a Rule from a row with no translation.
  CREATE TABLE IF NOT EXISTS policies (
    id            TEXT PRIMARY KEY,
    org_id        TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    description   TEXT,
    match_glob    TEXT NOT NULL,
    when_clauses  JSONB,
    effect        TEXT NOT NULL CHECK (effect IN ('allow','deny')),
    reason        TEXT,
    enabled       BOOLEAN NOT NULL DEFAULT TRUE,
    template      TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_policies_org ON policies(org_id, enabled);
`;

let schemaApplied = false;
export async function ensureSchema(): Promise<void> {
  if (schemaApplied) return;
  await sql.unsafe(SCHEMA_SQL);
  schemaApplied = true;
}

// ============================================================
// QUERIES
// ============================================================

export type Outcome = "allowed" | "denied" | "rate_limited" | "error";

export type AuditEvent = {
  ts: number;
  agentId: string | null;
  server: string;
  tool: string;
  qualifiedName: string;
  argsJson: string;
  outcome: Outcome;
  reason: string | null;
  durationMs: number | null;
  resultBytes: number | null;
  errorMessage: string | null;
};

export type IngestPayload = {
  installId: string;
  hostId: string;
  droppedSinceLastFlush: number;
  events: AuditEvent[];
};

/** Insert a batch of events for a tenant. */
export async function insertEvents(
  orgId: string,
  installId: string,
  hostId: string,
  events: AuditEvent[],
): Promise<number> {
  if (events.length === 0) return 0;
  // postgres.js wants a homogeneous primitive shape for bulk inserts; we
  // serialize args_json to a string and let the JSONB column parse it
  // server-side. (The alternative — passing a plain object as `unknown` —
  // doesn't satisfy the library's type constraints.)
  const rows = events.map((e) => ({
    org_id: orgId,
    install_id: installId,
    host_id: hostId,
    ts: e.ts,
    agent_id: e.agentId,
    server: e.server,
    tool: e.tool,
    qualified_name: e.qualifiedName,
    args_json: e.argsJson, // already a JSON string from the OSS sender
    outcome: e.outcome,
    reason: e.reason,
    duration_ms: e.durationMs,
    result_bytes: e.resultBytes,
    error_message: e.errorMessage,
  }));
  const result = await sql`INSERT INTO audit_events ${sql(rows)}`;
  return result.count ?? rows.length;
}

export async function recordDrops(
  orgId: string,
  installId: string,
  dropped: number,
): Promise<void> {
  if (dropped <= 0) return;
  await sql`INSERT INTO ingest_drops ${sql({ org_id: orgId, install_id: installId, dropped })}`;
}

/** Look up an org by API key (constant-time hash compare). */
export async function findOrgByApiKey(plaintextKey: string): Promise<{ orgId: string; keyId: string } | null> {
  const hash = await hashKey(plaintextKey);
  const rows = await sql<Array<{ id: string; org_id: string }>>`
    SELECT id, org_id FROM api_keys
    WHERE key_hash = ${hash} AND revoked_at IS NULL
    LIMIT 1
  `;
  if (rows.length === 0) return null;
  // Update last_used_at (fire-and-forget; not awaited)
  void sql`UPDATE api_keys SET last_used_at = NOW() WHERE id = ${rows[0]!.id}`;
  return { orgId: rows[0]!.org_id, keyId: rows[0]!.id };
}

export async function recentEvents(
  orgId: string,
  limit = 100,
): Promise<Array<AuditEvent & { id: number; receivedAt: Date; installId: string; hostId: string }>> {
  const rows = await sql<
    Array<{
      id: number;
      install_id: string;
      host_id: string;
      ts: string;
      received_at: Date;
      agent_id: string | null;
      server: string;
      tool: string;
      qualified_name: string;
      args_json: unknown;
      outcome: Outcome;
      reason: string | null;
      duration_ms: number | null;
      result_bytes: number | null;
      error_message: string | null;
    }>
  >`
    SELECT id, install_id, host_id, ts, received_at, agent_id, server, tool,
           qualified_name, args_json, outcome, reason, duration_ms, result_bytes, error_message
    FROM audit_events
    WHERE org_id = ${orgId}
    ORDER BY ts DESC
    LIMIT ${limit}
  `;
  return rows.map((r) => ({
    id: r.id,
    installId: r.install_id,
    hostId: r.host_id,
    ts: Number(r.ts),
    receivedAt: r.received_at,
    agentId: r.agent_id,
    server: r.server,
    tool: r.tool,
    qualifiedName: r.qualified_name,
    argsJson: typeof r.args_json === "string" ? r.args_json : JSON.stringify(r.args_json ?? {}),
    outcome: r.outcome,
    reason: r.reason,
    durationMs: r.duration_ms,
    resultBytes: r.result_bytes,
    errorMessage: r.error_message,
  }));
}

export async function statsForOrg(
  orgId: string,
  sinceMs: number,
): Promise<{
  total: number;
  byOutcome: Record<Outcome, number>;
  topTools: Array<{ qualifiedName: string; count: number }>;
  hostCount: number;
}> {
  const [totalRow] = await sql<Array<{ c: string; hosts: string }>>`
    SELECT COUNT(*) AS c, COUNT(DISTINCT install_id) AS hosts
    FROM audit_events WHERE org_id = ${orgId} AND ts >= ${sinceMs}
  `;
  const total = Number(totalRow?.c ?? 0);
  const hostCount = Number(totalRow?.hosts ?? 0);

  const byOutcomeRows = await sql<Array<{ outcome: Outcome; c: string }>>`
    SELECT outcome, COUNT(*) AS c FROM audit_events
    WHERE org_id = ${orgId} AND ts >= ${sinceMs}
    GROUP BY outcome
  `;
  const byOutcome: Record<Outcome, number> = {
    allowed: 0, denied: 0, rate_limited: 0, error: 0,
  };
  for (const r of byOutcomeRows) byOutcome[r.outcome] = Number(r.c);

  const topToolsRows = await sql<Array<{ qualified_name: string; c: string }>>`
    SELECT qualified_name, COUNT(*) AS c FROM audit_events
    WHERE org_id = ${orgId} AND ts >= ${sinceMs}
    GROUP BY qualified_name ORDER BY c DESC LIMIT 10
  `;

  return {
    total,
    byOutcome,
    topTools: topToolsRows.map((r) => ({ qualifiedName: r.qualified_name, count: Number(r.c) })),
    hostCount,
  };
}

// ============================================================
// ADMIN OPERATIONS — used by src/admin.ts CLI
// ============================================================

export async function createOrg(name: string, plan: "pro" | "team" | "enterprise" = "pro"): Promise<{ id: string }> {
  const id = `org_${randomId(16)}`;
  const retentionDays = plan === "team" ? 365 : plan === "enterprise" ? 3650 : 90;
  await sql`INSERT INTO organizations ${sql({ id, name, plan, retention_days: retentionDays })}`;
  return { id };
}

export async function createApiKey(orgId: string, name: string): Promise<{ id: string; plaintext: string }> {
  const id = `key_${randomId(12)}`;
  const plaintext = `tk_live_${randomId(8)}_${randomId(28)}`;
  const keyHash = await hashKey(plaintext);
  const lastFour = plaintext.slice(-4);
  await sql`INSERT INTO api_keys ${sql({
    id, org_id: orgId, name, key_hash: keyHash, last_four: lastFour,
  })}`;
  return { id, plaintext };
}

export async function listOrgs(): Promise<Array<{ id: string; name: string; plan: string; createdAt: Date }>> {
  const rows = await sql<Array<{ id: string; name: string; plan: string; created_at: Date }>>`
    SELECT id, name, plan, created_at FROM organizations ORDER BY created_at DESC
  `;
  return rows.map((r) => ({ id: r.id, name: r.name, plan: r.plan, createdAt: r.created_at }));
}

export async function listKeysForOrg(orgId: string): Promise<Array<{ id: string; name: string; lastFour: string; createdAt: Date; lastUsedAt: Date | null; revoked: boolean }>> {
  const rows = await sql<Array<{ id: string; name: string; last_four: string; created_at: Date; last_used_at: Date | null; revoked_at: Date | null }>>`
    SELECT id, name, last_four, created_at, last_used_at, revoked_at FROM api_keys
    WHERE org_id = ${orgId}
    ORDER BY created_at DESC
  `;
  return rows.map((r) => ({
    id: r.id, name: r.name, lastFour: r.last_four,
    createdAt: r.created_at, lastUsedAt: r.last_used_at, revoked: r.revoked_at !== null,
  }));
}

// ============================================================
// POLICIES — CRUD
// ============================================================

export type WhenClauseObject = {
  glob?: string;
  contains?: string;
  containsAny?: string[];
  notContains?: string;
  matches?: string;
};
export type WhenClause = string | WhenClauseObject;

export type PolicyRecord = {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  matchGlob: string;
  whenClauses: Record<string, WhenClause> | null;
  effect: "allow" | "deny";
  reason: string | null;
  enabled: boolean;
  template: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PolicyInput = {
  name: string;
  description?: string | null;
  matchGlob: string;
  whenClauses?: Record<string, WhenClause> | null;
  effect: "allow" | "deny";
  reason?: string | null;
  enabled?: boolean;
  template?: string | null;
};

type PolicyRow = {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  match_glob: string;
  when_clauses: unknown;
  effect: "allow" | "deny";
  reason: string | null;
  enabled: boolean;
  template: string | null;
  created_at: Date;
  updated_at: Date;
};

function rowToPolicy(r: PolicyRow): PolicyRecord {
  // postgres.js's JSONB handling is version-dependent — sometimes the driver
  // hands us a parsed object, sometimes a raw JSON string. Normalize both.
  let whenClauses: Record<string, WhenClause> | null = null;
  if (r.when_clauses !== null && r.when_clauses !== undefined) {
    if (typeof r.when_clauses === "string") {
      try {
        whenClauses = JSON.parse(r.when_clauses) as Record<string, WhenClause>;
      } catch {
        whenClauses = null;
      }
    } else {
      whenClauses = r.when_clauses as Record<string, WhenClause>;
    }
  }
  return {
    id: r.id,
    orgId: r.org_id,
    name: r.name,
    description: r.description,
    matchGlob: r.match_glob,
    whenClauses,
    effect: r.effect,
    reason: r.reason,
    enabled: r.enabled,
    template: r.template,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function listPolicies(orgId: string, onlyEnabled = false): Promise<PolicyRecord[]> {
  const rows = onlyEnabled
    ? await sql<PolicyRow[]>`
        SELECT * FROM policies WHERE org_id = ${orgId} AND enabled = TRUE
        ORDER BY created_at DESC`
    : await sql<PolicyRow[]>`
        SELECT * FROM policies WHERE org_id = ${orgId}
        ORDER BY created_at DESC`;
  return rows.map(rowToPolicy);
}

export async function getPolicy(orgId: string, id: string): Promise<PolicyRecord | null> {
  const rows = await sql<PolicyRow[]>`
    SELECT * FROM policies WHERE org_id = ${orgId} AND id = ${id} LIMIT 1`;
  return rows[0] ? rowToPolicy(rows[0]) : null;
}

export async function createPolicy(orgId: string, input: PolicyInput): Promise<PolicyRecord> {
  const id = `pol_${randomId(14)}`;
  const row = {
    id,
    org_id: orgId,
    name: input.name,
    description: input.description ?? null,
    match_glob: input.matchGlob,
    when_clauses: input.whenClauses ? JSON.stringify(input.whenClauses) : null,
    effect: input.effect,
    reason: input.reason ?? null,
    enabled: input.enabled ?? true,
    template: input.template ?? null,
  };
  await sql`INSERT INTO policies ${sql(row)}`;
  const created = await getPolicy(orgId, id);
  if (!created) throw new Error("policy insert returned but row not visible");
  return created;
}

export async function updatePolicy(
  orgId: string,
  id: string,
  patch: Partial<PolicyInput>,
): Promise<PolicyRecord | null> {
  const fields: Record<string, unknown> = { updated_at: sql`NOW()` };
  if (patch.name !== undefined) fields["name"] = patch.name;
  if (patch.description !== undefined) fields["description"] = patch.description;
  if (patch.matchGlob !== undefined) fields["match_glob"] = patch.matchGlob;
  if (patch.whenClauses !== undefined)
    fields["when_clauses"] = patch.whenClauses ? JSON.stringify(patch.whenClauses) : null;
  if (patch.effect !== undefined) fields["effect"] = patch.effect;
  if (patch.reason !== undefined) fields["reason"] = patch.reason;
  if (patch.enabled !== undefined) fields["enabled"] = patch.enabled;
  if (patch.template !== undefined) fields["template"] = patch.template;

  if (Object.keys(fields).length === 1) {
    // only updated_at — nothing to actually patch
    return getPolicy(orgId, id);
  }
  await sql`UPDATE policies SET ${sql(fields)} WHERE org_id = ${orgId} AND id = ${id}`;
  return getPolicy(orgId, id);
}

export async function deletePolicy(orgId: string, id: string): Promise<boolean> {
  const result = await sql`DELETE FROM policies WHERE org_id = ${orgId} AND id = ${id}`;
  return (result.count ?? 0) > 0;
}

// ============================================================
// HELPERS
// ============================================================

async function hashKey(plaintext: string): Promise<string> {
  const data = new TextEncoder().encode(plaintext);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomId(len: number): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let out = "";
  for (let i = 0; i < len; i++) out += chars[bytes[i]! % chars.length];
  return out;
}

function tryParseJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return { _raw: s };
  }
}
