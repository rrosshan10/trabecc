import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildRedactor } from "../src/audit/redact.ts";

describe("redactor", () => {
  it("redacts default credential keys", () => {
    const r = buildRedactor();
    const out = r({
      username: "alice",
      password: "hunter2",
      api_key: "sk-abc",
      Authorization: "Bearer xyz",
    });
    assert.deepEqual(out, {
      username: "alice",
      password: "[REDACTED]",
      api_key: "[REDACTED]",
      Authorization: "[REDACTED]",
    });
  });

  it("redacts substrings of keys (e.g. github_token)", () => {
    const r = buildRedactor();
    const out = r({ github_token: "ghp_xyz", harmless: 1 });
    assert.deepEqual(out, { github_token: "[REDACTED]", harmless: 1 });
  });

  it("walks nested structures", () => {
    const r = buildRedactor();
    const out = r({
      headers: { Authorization: "Bearer xyz", "Content-Type": "application/json" },
      body: { password: "p", inner: { token: "t", name: "x" } },
      list: [{ secret: "s" }, { ok: true }],
    });
    assert.deepEqual(out, {
      headers: { Authorization: "[REDACTED]", "Content-Type": "application/json" },
      body: { password: "[REDACTED]", inner: { token: "[REDACTED]", name: "x" } },
      list: [{ secret: "[REDACTED]" }, { ok: true }],
    });
  });

  it("honors extra user keywords", () => {
    const r = buildRedactor(["zip_code"]);
    const out = r({ zip_code: "94110", name: "alice" });
    assert.deepEqual(out, { zip_code: "[REDACTED]", name: "alice" });
  });

  it("does not redact innocuous keys", () => {
    const r = buildRedactor();
    const out = r({ username: "alice", message: "hi", count: 3 });
    assert.deepEqual(out, { username: "alice", message: "hi", count: 3 });
  });

  it("does not redact 'path' (regression: 'pat' substring)", () => {
    const r = buildRedactor();
    assert.deepEqual(r({ path: "/etc/hosts" }), { path: "/etc/hosts" });
  });

  it("does redact 'github_pat' as a multi-segment phrase", () => {
    const r = buildRedactor();
    assert.deepEqual(r({ github_pat: "ghp_xyz" }), { github_pat: "[REDACTED]" });
  });

  it("does not redact 'public_key' or 'primary_key'", () => {
    const r = buildRedactor();
    const out = r({ public_key: "abc", primary_key: 42 });
    assert.deepEqual(out, { public_key: "abc", primary_key: 42 });
  });

  it("does redact 'api_key' as a phrase", () => {
    const r = buildRedactor();
    assert.deepEqual(r({ api_key: "k", apiKey: "k2" }), {
      api_key: "[REDACTED]",
      apiKey: "[REDACTED]",
    });
  });
});
