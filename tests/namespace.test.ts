import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { qualify, unqualify } from "../src/proxy/namespace.ts";

describe("namespace", () => {
  it("qualify joins server and tool with __", () => {
    assert.equal(qualify("github", "search_issues"), "github__search_issues");
  });
  it("unqualify is the inverse", () => {
    assert.deepEqual(unqualify("github__search_issues"), { server: "github", tool: "search_issues" });
  });
  it("unqualify handles tools containing underscores", () => {
    assert.deepEqual(unqualify("fs__read_file_safe"), { server: "fs", tool: "read_file_safe" });
  });
  it("unqualify rejects malformed names", () => {
    assert.equal(unqualify("nodelimiter"), null);
    assert.equal(unqualify("__leading"), null);
    assert.equal(unqualify("trailing__"), null);
  });
});
