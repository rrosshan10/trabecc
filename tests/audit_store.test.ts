import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AuditStore } from "../src/audit/store.ts";

describe("AuditStore", () => {
  it("read-only mode bootstraps an empty schema if the file doesn't exist", () => {
    // Regression for: `trabecc admin` failing with "unable to open database
    // file" on a fresh install where the gateway hasn't yet created audit.db.
    const dir = mkdtempSync(join(tmpdir(), "trabecc-store-"));
    const path = join(dir, "audit.db");
    assert.equal(existsSync(path), false);

    const store = new AuditStore(path, { maxRecords: 100, readOnly: true });
    try {
      // The file should now exist — created by the bootstrap path.
      assert.equal(existsSync(path), true);
      // Schema applied → reading from an empty audit_log returns 0 rows.
      assert.deepEqual(store.recent(10, 0), []);
      // Stats also work.
      assert.equal(store.stats(0).total, 0);
    } finally {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("read-only mode against an existing populated db reads rows", () => {
    const dir = mkdtempSync(join(tmpdir(), "trabecc-store-"));
    const path = join(dir, "audit.db");
    // Write a row in write mode first.
    const writer = new AuditStore(path, { maxRecords: 100 });
    writer.record({
      ts: 1000,
      agentId: "test@1",
      server: "fs",
      tool: "read",
      qualifiedName: "fs__read",
      argsJson: "{}",
      outcome: "allowed",
      reason: null,
      durationMs: 1,
      resultBytes: 0,
      errorMessage: null,
    });
    writer.close();

    // Now open read-only — should see the row.
    const reader = new AuditStore(path, { maxRecords: 100, readOnly: true });
    try {
      const rows = reader.recent(10, 0);
      assert.equal(rows.length, 1);
      assert.equal(rows[0]!.qualifiedName, "fs__read");
    } finally {
      reader.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
