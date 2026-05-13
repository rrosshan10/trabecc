import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { compileGlob, PolicyEngine } from "../src/policy/engine.ts";

describe("compileGlob", () => {
  it("matches plain names", () => {
    assert.match("github__search", compileGlob("github__search"));
    assert.doesNotMatch("github__search_issues", compileGlob("github__search"));
  });
  it("matches with star", () => {
    assert.match("github__search_issues", compileGlob("github__*"));
    assert.doesNotMatch("gitlab__search", compileGlob("github__*"));
  });
  it("matches mid-string star", () => {
    assert.match("fs__write_file", compileGlob("fs__write_*"));
    assert.doesNotMatch("fs__read_file", compileGlob("fs__write_*"));
  });
  it("escapes regex specials", () => {
    // The dot is not a regex metacharacter in the glob; it must match literally.
    assert.doesNotMatch("axyzb", compileGlob("a.b"));
    assert.match("a.b", compileGlob("a.b"));
  });
  it("? matches a single character", () => {
    assert.match("fs__a", compileGlob("fs__?"));
    assert.doesNotMatch("fs__ab", compileGlob("fs__?"));
  });
});

describe("PolicyEngine", () => {
  it("first matching rule wins", () => {
    const engine = new PolicyEngine(
      [
        { match: "fs__write_*", effect: "deny" },
        { match: "fs__*", effect: "allow" },
      ],
      "deny",
    );
    assert.equal(engine.evaluate("fs__write_file").effect, "deny");
    assert.equal(engine.evaluate("fs__read_file").effect, "allow");
  });

  it("falls back to defaultPolicy when no rule matches", () => {
    const denyDefault = new PolicyEngine([{ match: "fs__*", effect: "allow" }], "deny");
    assert.equal(denyDefault.evaluate("github__search").effect, "deny");

    const allowDefault = new PolicyEngine([{ match: "fs__write_*", effect: "deny" }], "allow");
    assert.equal(allowDefault.evaluate("github__search").effect, "allow");
  });

  it("argument-level 'when' clauses gate by call args", () => {
    const engine = new PolicyEngine(
      [
        { match: "fs__write_*", effect: "deny", when: { path: "/etc/*" }, reason: "no /etc writes" },
        { match: "fs__write_*", effect: "deny", when: { path: "*~/.ssh*" }, reason: "no ssh writes" },
        { match: "fs__write_*", effect: "allow" },
      ],
      "deny",
    );
    // matches a `when` rule -> deny
    assert.equal(
      engine.evaluate("fs__write_file", { path: "/etc/hosts" }).effect,
      "deny",
    );
    // doesn't match any when rule -> falls through to allow
    assert.equal(
      engine.evaluate("fs__write_file", { path: "/tmp/foo" }).effect,
      "allow",
    );
    // list-time evaluation skips when-rules; default-deny would apply but the
    // unconditional allow rule matches the name -> allow
    assert.equal(engine.evaluate("fs__write_file").effect, "allow");
  });

  it("'contains' operator blocks args containing a substring (case-insensitive)", () => {
    const engine = new PolicyEngine(
      [
        { match: "*", effect: "deny", when: { prompt: { contains: "drop table" } }, reason: "SQL-y prompt" },
        { match: "*", effect: "allow" },
      ],
      "deny",
    );
    assert.equal(engine.evaluate("db__query", { prompt: "please DROP TABLE users" }).effect, "deny");
    assert.equal(engine.evaluate("db__query", { prompt: "list the tables" }).effect, "allow");
  });

  it("'containsAny' operator matches if any keyword is present", () => {
    const engine = new PolicyEngine(
      [
        {
          match: "*",
          effect: "deny",
          when: { content: { containsAny: ["password", "ssn", "api_key"] } },
          reason: "PII",
        },
      ],
      "allow",
    );
    assert.equal(engine.evaluate("any__tool", { content: "here is my SSN: 123" }).effect, "deny");
    assert.equal(engine.evaluate("any__tool", { content: "nothing sensitive" }).effect, "allow");
  });

  it("'notContains' only fires when the substring is ABSENT", () => {
    const engine = new PolicyEngine(
      [{ match: "*", effect: "deny", when: { agreement: { notContains: "I accept" } } }],
      "allow",
    );
    assert.equal(engine.evaluate("any__tool", { agreement: "" }).effect, "deny");
    assert.equal(engine.evaluate("any__tool", { agreement: "I accept the terms" }).effect, "allow");
  });

  it("'matches' operator runs a case-insensitive regex", () => {
    const engine = new PolicyEngine(
      [
        {
          match: "image__*",
          effect: "deny",
          when: { description: { matches: "\\b(nude|nsfw|gore)\\b" } },
          reason: "content-safety",
        },
      ],
      "allow",
    );
    assert.equal(engine.evaluate("image__generate", { description: "NSFW please" }).effect, "deny");
    assert.equal(engine.evaluate("image__generate", { description: "a sunset" }).effect, "allow");
  });

  it("invalid regex in 'matches' fails closed (clause never matches)", () => {
    const engine = new PolicyEngine(
      [
        { match: "*", effect: "deny", when: { x: { matches: "[unclosed" } } },
        { match: "*", effect: "allow" },
      ],
      "deny",
    );
    // The deny rule never fires because its regex is invalid, so the next rule applies.
    assert.equal(engine.evaluate("any__tool", { x: "[unclosed" }).effect, "allow");
  });

  it("operators stringify non-string args (so JSON values can be searched)", () => {
    const engine = new PolicyEngine(
      [{ match: "*", effect: "deny", when: { payload: { contains: "admin" } } }],
      "allow",
    );
    assert.equal(
      engine.evaluate("any__tool", { payload: { role: "admin", id: 42 } }).effect,
      "deny",
    );
  });

  it("backward-compat: string form of 'when' still means glob match", () => {
    const engine = new PolicyEngine(
      [{ match: "fs__write_*", effect: "deny", when: { path: "/etc/*" } }],
      "allow",
    );
    assert.equal(engine.evaluate("fs__write_file", { path: "/etc/hosts" }).effect, "deny");
    assert.equal(engine.evaluate("fs__write_file", { path: "/tmp/foo" }).effect, "allow");
  });

  it("populates reason and matched rule", () => {
    const engine = new PolicyEngine(
      [{ match: "fs__write_*", effect: "deny", reason: "writes require review" }],
      "deny",
    );
    const decision = engine.evaluate("fs__write_file");
    assert.equal(decision.reason, "writes require review");
    assert.equal(decision.matchedRule?.match, "fs__write_*");

    const noMatch = engine.evaluate("github__search");
    assert.equal(noMatch.matchedRule, null);
    assert.match(noMatch.reason ?? "", /default-deny/);
  });
});
