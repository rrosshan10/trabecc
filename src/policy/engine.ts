// Policy evaluation. Rules are checked top-to-bottom; first match wins.
// If nothing matches, the configured defaultPolicy is applied.
//
// Match syntax is a tiny glob (just `*` and `?`), deliberately restricted —
// regex would be more powerful but harder for a non-engineer reviewer to
// audit, and policy files exist to be auditable.

import type { Rule } from "../config.ts";

export type Decision = {
  effect: "allow" | "deny";
  reason: string | null;
  matchedRule: Rule | null;
};

/** Compile a glob like "github.*" or "fs.write_?" into a RegExp. */
export function compileGlob(glob: string): RegExp {
  let out = "^";
  for (const ch of glob) {
    if (ch === "*") out += ".*";
    else if (ch === "?") out += ".";
    else if (/[a-zA-Z0-9_-]/.test(ch)) out += ch;
    else out += "\\" + ch;
  }
  out += "$";
  return new RegExp(out);
}

type CompiledRule = {
  rule: Rule;
  re: RegExp;
  whenChecks: Array<{ key: string; re: RegExp }>;
};

export class PolicyEngine {
  private compiled: CompiledRule[];
  private readonly defaultPolicy: "allow" | "deny";

  constructor(rules: Rule[], defaultPolicy: "allow" | "deny") {
    this.defaultPolicy = defaultPolicy;
    this.compiled = rules.map((rule) => ({
      rule,
      re: compileGlob(rule.match),
      whenChecks: rule.when
        ? Object.entries(rule.when).map(([key, glob]) => ({ key, re: compileGlob(glob) }))
        : [],
    }));
  }

  /**
   * Evaluate a tool against the policy.
   *
   * `args` is the call's arguments at request time. If undefined (catalog
   * listing), rules with a `when` clause are skipped — the tool is judged
   * by its name alone, since per-call argument predicates can't be checked
   * without a call.
   */
  evaluate(qualifiedName: string, args?: Record<string, unknown>): Decision {
    for (const { rule, re, whenChecks } of this.compiled) {
      if (!re.test(qualifiedName)) continue;

      if (whenChecks.length > 0) {
        if (!args) continue; // list-time: skip argument-conditional rules
        const allMatch = whenChecks.every(({ key, re: argRe }) => {
          const v = args[key];
          return typeof v === "string" && argRe.test(v);
        });
        if (!allMatch) continue;
      }

      return {
        effect: rule.effect,
        reason: rule.reason ?? `matched rule "${rule.match}"`,
        matchedRule: rule,
      };
    }
    return {
      effect: this.defaultPolicy,
      reason: this.defaultPolicy === "deny" ? "no rule matched; default-deny" : "no rule matched; default-allow",
      matchedRule: null,
    };
  }
}
