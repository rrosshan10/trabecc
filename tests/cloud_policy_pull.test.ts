import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CloudPolicyPuller,
  parsePoliciesToRules,
  mergePolicies,
  derivePoliciesEndpoint,
} from "../src/policy/cloud-pull.ts";
import type { Rule } from "../src/config.ts";

function fakeFetch(
  responder: (url: string, init: RequestInit | undefined) => Response | Promise<Response>,
): typeof fetch {
  return (async (url: unknown, init?: RequestInit) =>
    await responder(String(url), init)) as typeof fetch;
}

describe("parsePoliciesToRules", () => {
  it("translates cloud policy records into OSS Rule objects", () => {
    const rules = parsePoliciesToRules([
      {
        id: "pol_1",
        name: "Block /etc",
        matchGlob: "fs__write_*",
        whenClauses: { path: "/etc/*" },
        effect: "deny",
        reason: "no writes under /etc",
        enabled: true,
      },
    ]);
    assert.equal(rules.length, 1);
    assert.deepEqual(rules[0], {
      match: "fs__write_*",
      effect: "deny",
      reason: "no writes under /etc",
      when: { path: "/etc/*" },
    });
  });

  it("filters disabled policies out", () => {
    const rules = parsePoliciesToRules([
      { id: "1", name: "on", matchGlob: "a__*", whenClauses: null, effect: "allow", reason: null, enabled: true },
      { id: "2", name: "off", matchGlob: "b__*", whenClauses: null, effect: "deny", reason: null, enabled: false },
    ]);
    assert.equal(rules.length, 1);
    assert.equal(rules[0]!.match, "a__*");
  });

  it("omits when/reason from the rule when they're absent", () => {
    const rules = parsePoliciesToRules([
      { id: "1", name: "x", matchGlob: "img__*", whenClauses: null, effect: "deny", reason: null, enabled: true },
    ]);
    assert.deepEqual(rules[0], { match: "img__*", effect: "deny" });
  });

  it("omits when when whenClauses is an empty object", () => {
    const rules = parsePoliciesToRules([
      { id: "1", name: "x", matchGlob: "*", whenClauses: {}, effect: "allow", reason: null, enabled: true },
    ]);
    assert.equal("when" in rules[0]!, false);
  });
});

describe("mergePolicies", () => {
  it("places cloud rules FIRST so first-match-wins gives them precedence", () => {
    const cloud: Rule[] = [{ match: "fs__write_*", effect: "deny", reason: "cloud-deny" }];
    const yaml: Rule[] = [{ match: "fs__write_*", effect: "allow", reason: "yaml-allow" }];
    const merged = mergePolicies(cloud, yaml);
    assert.equal(merged[0]!.reason, "cloud-deny");
    assert.equal(merged[1]!.reason, "yaml-allow");
  });

  it("keeps YAML rules as a fallback when cloud is empty", () => {
    const yaml: Rule[] = [{ match: "fs__*", effect: "allow" }];
    assert.deepEqual(mergePolicies([], yaml), yaml);
  });
});

describe("derivePoliciesEndpoint", () => {
  it("rewrites /v1/ingest → /v1/policies", () => {
    assert.equal(
      derivePoliciesEndpoint("https://api.trabecc.com/v1/ingest"),
      "https://api.trabecc.com/v1/policies",
    );
  });
  it("preserves a custom hostname", () => {
    assert.equal(
      derivePoliciesEndpoint("http://localhost:8787/v1/ingest"),
      "http://localhost:8787/v1/policies",
    );
  });
  it("falls back gracefully for non-standard paths", () => {
    const out = derivePoliciesEndpoint("https://api.example.com/custom/path");
    assert.ok(out.endsWith("/v1/policies"));
  });
});

describe("CloudPolicyPuller", () => {
  it("invokes onChange with the parsed rules on a successful fetch", async () => {
    let captured: Rule[] | null = null;
    const puller = new CloudPolicyPuller({
      endpoint: "https://api.example.com/v1/policies",
      apiKey: "secret",
      intervalMs: 60_000,
      onChange: (r) => { captured = r; },
      fetchImpl: fakeFetch(async () =>
        new Response(JSON.stringify({
          policies: [
            { id: "1", name: "n", matchGlob: "fs__*", whenClauses: null, effect: "deny", reason: null, enabled: true },
          ],
        }), { status: 200, headers: { "content-type": "application/json" } }),
      ),
    });
    await puller.pullOnce();
    assert.ok(captured !== null);
    assert.equal((captured as Rule[]).length, 1);
    assert.equal((captured as Rule[])[0]!.match, "fs__*");
    await puller.stop();
  });

  it("does NOT call onChange when the rule set is unchanged across pulls", async () => {
    let changeCount = 0;
    const response = new Response(JSON.stringify({
      policies: [
        { id: "1", name: "n", matchGlob: "fs__*", whenClauses: null, effect: "deny", reason: null, enabled: true },
      ],
    }), { status: 200, headers: { "content-type": "application/json" } });
    const puller = new CloudPolicyPuller({
      endpoint: "https://api.example.com/v1/policies",
      apiKey: "secret",
      intervalMs: 60_000,
      onChange: () => { changeCount++; },
      fetchImpl: fakeFetch(async () => response.clone()),
    });
    await puller.pullOnce();
    await puller.pullOnce();
    await puller.pullOnce();
    assert.equal(changeCount, 1, "onChange should fire once on first success, then deduplicate");
    await puller.stop();
  });

  it("keeps last-known rules when a fetch fails (no onChange call)", async () => {
    let changeCount = 0;
    let attempt = 0;
    const puller = new CloudPolicyPuller({
      endpoint: "https://api.example.com/v1/policies",
      apiKey: "secret",
      intervalMs: 60_000,
      onChange: () => { changeCount++; },
      fetchImpl: fakeFetch(async () => {
        attempt++;
        if (attempt === 1) {
          return new Response(JSON.stringify({
            policies: [{ id: "1", name: "n", matchGlob: "a__*", whenClauses: null, effect: "allow", reason: null, enabled: true }],
          }), { status: 200 });
        }
        // Subsequent attempts fail
        throw new Error("network down");
      }),
    });
    await puller.pullOnce();
    assert.equal(changeCount, 1);
    await puller.pullOnce();
    await puller.pullOnce();
    // Failures don't replace last-known; onChange not called again
    assert.equal(changeCount, 1);
    await puller.stop();
  });

  it("sends Authorization Bearer header", async () => {
    let capturedAuth: string | undefined;
    const puller = new CloudPolicyPuller({
      endpoint: "https://api.example.com/v1/policies",
      apiKey: "secret-key-xyz",
      intervalMs: 60_000,
      onChange: () => {},
      fetchImpl: fakeFetch(async (_url, init) => {
        capturedAuth = new Headers(init?.headers).get("authorization") ?? undefined;
        return new Response(JSON.stringify({ policies: [] }), { status: 200 });
      }),
    });
    await puller.pullOnce();
    assert.equal(capturedAuth, "Bearer secret-key-xyz");
    await puller.stop();
  });

  it("appends ?enabled=true to the endpoint", async () => {
    let capturedUrl: string | undefined;
    const puller = new CloudPolicyPuller({
      endpoint: "https://api.example.com/v1/policies",
      apiKey: "x",
      intervalMs: 60_000,
      onChange: () => {},
      fetchImpl: fakeFetch(async (url) => {
        capturedUrl = url;
        return new Response(JSON.stringify({ policies: [] }), { status: 200 });
      }),
    });
    await puller.pullOnce();
    assert.equal(capturedUrl, "https://api.example.com/v1/policies?enabled=true");
    await puller.stop();
  });
});
