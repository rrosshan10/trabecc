// Policy evaluation. Rules are checked top-to-bottom; first match wins.
// If nothing matches, the configured defaultPolicy is applied.
//
// `when` clauses gate by argument values. Each clause key is an argument
// name; the value is either:
//   * a string  → glob match against the argument's stringified value
//   * an object → operator-style matcher with one of:
//       glob:        glob match (same as the string form)
//       contains:    case-insensitive substring search
//       containsAny: array of substrings; any match counts
//       notContains: case-insensitive substring; rule applies only if absent
//       matches:     JS regex source string, evaluated case-insensitive
//
// The object form unlocks content-safety policies — block tools whose
// `prompt` argument contains a banned keyword, or whose `content` doesn't
// contain a required compliance string, etc. The string form is kept for
// backward compatibility with existing YAML.

import type { Rule, WhenClause } from "../config.ts";

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

type CompiledMatcher = {
  key: string;
  test: (value: unknown) => boolean;
};

type CompiledRule = {
  rule: Rule;
  re: RegExp;
  whenChecks: CompiledMatcher[];
};

/** Stringify any argument value so substring/regex/glob matchers can run. */
function valueAsString(v: unknown): string {
  if (typeof v === "string") return v;
  if (v === null || v === undefined) return "";
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/** Compile a single `when` clause into a fast value tester. */
function compileWhenClause(clause: WhenClause): (value: unknown) => boolean {
  if (typeof clause === "string") {
    const re = compileGlob(clause);
    return (v) => re.test(valueAsString(v));
  }

  const tests: Array<(s: string) => boolean> = [];

  if (clause.glob !== undefined) {
    const re = compileGlob(clause.glob);
    tests.push((s) => re.test(s));
  }
  if (clause.contains !== undefined) {
    const needle = clause.contains.toLowerCase();
    tests.push((s) => s.toLowerCase().includes(needle));
  }
  if (clause.containsAny !== undefined && clause.containsAny.length > 0) {
    const needles = clause.containsAny.map((n) => n.toLowerCase());
    tests.push((s) => {
      const lower = s.toLowerCase();
      return needles.some((n) => lower.includes(n));
    });
  }
  if (clause.notContains !== undefined) {
    const needle = clause.notContains.toLowerCase();
    tests.push((s) => !s.toLowerCase().includes(needle));
  }
  if (clause.matches !== undefined) {
    let re: RegExp | null = null;
    try {
      re = new RegExp(clause.matches, "i");
    } catch {
      // invalid regex — clause never matches (fail-closed)
      return () => false;
    }
    const compiled = re;
    tests.push((s) => compiled.test(s));
  }

  // No operators set → clause never matches anything (defensive default).
  if (tests.length === 0) return () => false;

  return (v) => {
    const s = valueAsString(v);
    return tests.every((t) => t(s));
  };
}

export class PolicyEngine {
  private compiled: CompiledRule[];
  private readonly defaultPolicy: "allow" | "deny";

  constructor(rules: Rule[], defaultPolicy: "allow" | "deny") {
    this.defaultPolicy = defaultPolicy;
    this.compiled = rules.map((rule) => ({
      rule,
      re: compileGlob(rule.match),
      whenChecks: rule.when
        ? Object.entries(rule.when).map(([key, clause]) => ({
            key,
            test: compileWhenClause(clause),
          }))
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
        const allMatch = whenChecks.every(({ key, test }) => test(args[key]));
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
