import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { RateLimiter } from "../src/ratelimit/bucket.ts";

describe("RateLimiter", () => {
  it("allows calls when no rule matches", () => {
    const rl = new RateLimiter([]);
    for (let i = 0; i < 100; i++) assert.equal(rl.consume("github__search").allowed, true);
  });

  it("enforces burst capacity", () => {
    const rl = new RateLimiter([{ match: "fs__*", perMinute: 60, burst: 3 }]);
    const now = 1_000_000;
    assert.equal(rl.consume("fs__read", now).allowed, true);
    assert.equal(rl.consume("fs__read", now).allowed, true);
    assert.equal(rl.consume("fs__read", now).allowed, true);
    assert.equal(rl.consume("fs__read", now).allowed, false);
  });

  it("refills tokens over time", () => {
    const rl = new RateLimiter([{ match: "fs__*", perMinute: 60, burst: 1 }]);
    const t0 = 1_000_000;
    assert.equal(rl.consume("fs__read", t0).allowed, true);
    assert.equal(rl.consume("fs__read", t0).allowed, false);
    // One token regenerates per second at 60/min. Wait 1100ms.
    assert.equal(rl.consume("fs__read", t0 + 1100).allowed, true);
  });

  it("buckets are per qualified tool", () => {
    const rl = new RateLimiter([{ match: "fs__*", perMinute: 60, burst: 1 }]);
    const t0 = 1_000_000;
    assert.equal(rl.consume("fs__read", t0).allowed, true);
    // Different tool — gets its own bucket.
    assert.equal(rl.consume("fs__write", t0).allowed, true);
  });
});
