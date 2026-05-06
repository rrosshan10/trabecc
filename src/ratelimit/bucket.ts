// Token-bucket rate limiter, keyed by qualified tool name. Buckets are
// matched against the same glob syntax as policy rules; the first matching
// rate-limit definition wins. Buckets are lazily instantiated per concrete
// tool name — that way "github.*" with perMinute=60 means each individual
// github tool gets its own 60/min budget rather than sharing one.

import type { RateLimitRule } from "../config.ts";
import { compileGlob } from "../policy/engine.ts";

type Bucket = {
  capacity: number;
  refillPerMs: number;
  tokens: number;
  lastRefillMs: number;
};

export class RateLimiter {
  private compiledRules: Array<{ rule: RateLimitRule; re: RegExp }>;
  private buckets = new Map<string, Bucket>();

  constructor(rules: RateLimitRule[]) {
    this.compiledRules = rules.map((rule) => ({ rule, re: compileGlob(rule.match) }));
  }

  /** Returns true if the call is allowed; false if rate-limited. */
  consume(qualifiedName: string, now: number = Date.now()): { allowed: boolean; matchedRule: RateLimitRule | null } {
    const matched = this.compiledRules.find(({ re }) => re.test(qualifiedName));
    if (!matched) return { allowed: true, matchedRule: null };

    let bucket = this.buckets.get(qualifiedName);
    if (!bucket) {
      const capacity = matched.rule.burst ?? matched.rule.perMinute;
      bucket = {
        capacity,
        refillPerMs: matched.rule.perMinute / 60_000,
        tokens: capacity,
        lastRefillMs: now,
      };
      this.buckets.set(qualifiedName, bucket);
    } else {
      const elapsed = now - bucket.lastRefillMs;
      bucket.tokens = Math.min(bucket.capacity, bucket.tokens + elapsed * bucket.refillPerMs);
      bucket.lastRefillMs = now;
    }

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return { allowed: true, matchedRule: matched.rule };
    }
    return { allowed: false, matchedRule: matched.rule };
  }
}
