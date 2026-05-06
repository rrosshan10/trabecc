-- Trabecc audit log. One row per attempted tool call.
-- Outcome captures whether the call was allowed, denied by policy,
-- rate-limited, or errored during forwarding.

CREATE TABLE IF NOT EXISTS audit_log (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  ts              INTEGER NOT NULL,
  agent_id        TEXT,
  server          TEXT NOT NULL,
  tool            TEXT NOT NULL,
  qualified_name  TEXT NOT NULL,
  args_json       TEXT NOT NULL,
  outcome         TEXT NOT NULL CHECK (outcome IN ('allowed','denied','rate_limited','error')),
  reason          TEXT,
  duration_ms     INTEGER,
  result_bytes    INTEGER,
  error_message   TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(ts DESC);
CREATE INDEX IF NOT EXISTS idx_audit_qualified ON audit_log(qualified_name, ts DESC);
CREATE INDEX IF NOT EXISTS idx_audit_outcome ON audit_log(outcome, ts DESC);
