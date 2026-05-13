import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, isAbsolute } from "node:path";
import { homedir } from "node:os";
import YAML from "yaml";
import { z } from "zod";

const ServerSchema = z.object({
  name: z
    .string()
    .min(1)
    .regex(/^[a-z0-9_-]+$/i, "server name must be alphanumeric, dash, or underscore"),
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  env: z.record(z.string(), z.string()).default({}),
  cwd: z.string().optional(),
  /** Soft timeout (ms) for tool calls forwarded to this server. */
  timeoutMs: z.number().int().positive().default(30_000),
  /** If false, server is loaded but no tools are exposed (useful for staging). */
  enabled: z.boolean().default(true),
});

/**
 * A single `when` clause value. Two forms are accepted:
 *   * string  → treated as a glob over the argument's stringified value
 *               (e.g. `path: "/etc/*"`)
 *   * object  → operator-style matcher with one or more of:
 *               { glob, contains, containsAny, notContains, matches }
 *
 * The object form unlocks content-safety policies (e.g. block tools whose
 * `prompt` argument contains a banned keyword). The string form is kept
 * for backward compatibility with existing YAML.
 */
const WhenClauseObjectSchema = z.object({
  glob: z.string().optional(),
  contains: z.string().optional(),
  containsAny: z.array(z.string()).optional(),
  notContains: z.string().optional(),
  matches: z.string().optional(),
});
const WhenClauseSchema = z.union([z.string(), WhenClauseObjectSchema]);
export type WhenClause = z.infer<typeof WhenClauseSchema>;

const RuleSchema = z.object({
  /** Glob over qualified tool name, e.g. "github__*" or "fs__write_*" */
  match: z.string().min(1),
  effect: z.enum(["allow", "deny"]),
  /** Optional human-facing reason surfaced in audit + denial errors. */
  reason: z.string().optional(),
  /**
   * Optional argument predicates. Keys are top-level argument names; values
   * are either globs (string) or operator objects. ALL listed keys must
   * match for the rule to apply. Rules with a `when` clause are skipped
   * during catalog (tools/list) evaluation since args aren't known
   * there — they only affect actual tools/call decisions.
   */
  when: z.record(z.string(), WhenClauseSchema).optional(),
});

const RateLimitSchema = z.object({
  match: z.string().min(1),
  /** Sustained rate, calls per minute. */
  perMinute: z.number().int().positive(),
  /** Burst (token bucket capacity). Defaults to perMinute. */
  burst: z.number().int().positive().optional(),
});

const ConfigSchema = z.object({
  /**
   * Default policy applied when no explicit rule matches a tool.
   * "deny" is the secure default — opt in to tools, don't opt out.
   */
  defaultPolicy: z.enum(["allow", "deny"]).default("deny"),

  /** Where to keep the audit DB. Supports ~ expansion. */
  audit: z
    .object({
      path: z.string().default("~/.trabecc/audit.db"),
      /** Keep at most this many records. 0 = unlimited. */
      maxRecords: z.number().int().nonnegative().default(100_000),
      /** Whether to record full request args. False = record only arg keys. */
      recordArgs: z.boolean().default(true),
      /** Extra key substrings to redact (in addition to the built-in list). */
      redactKeys: z.array(z.string()).default([]),
    })
    .default({}),

  servers: z.array(ServerSchema).default([]),
  rules: z.array(RuleSchema).default([]),
  rateLimits: z.array(RateLimitSchema).default([]),

  admin: z
    .object({
      enabled: z.boolean().default(true),
      port: z.number().int().min(1).max(65535).default(4577),
      bind: z.string().default("127.0.0.1"),
    })
    .default({}),

  /**
   * Optional outbound sync to Trabecc Cloud (or any compatible endpoint).
   * Audit events are buffered and POSTed in batches. Disabled unless apiKey
   * is set. The endpoint defaults to the hosted service.
   */
  cloud: z
    .object({
      enabled: z.boolean().default(false),
      endpoint: z.string().url().default("https://api.trabecc.com/v1/ingest"),
      apiKey: z.string().optional(),
      /** Batch flush interval in ms. */
      flushIntervalMs: z.number().int().positive().default(5_000),
      /** Max events buffered before forced flush. */
      batchSize: z.number().int().positive().default(100),
      /** If true, drop oldest events when buffer overflows; else apply backpressure. */
      dropOnOverflow: z.boolean().default(true),
      /** Max buffer size before drop/backpressure kicks in. */
      maxBuffer: z.number().int().positive().default(10_000),

      /**
       * If true, periodically GET <policiesEndpoint> with the same apiKey
       * and merge the returned rules into the in-memory PolicyEngine.
       * Cloud rules take precedence over local YAML rules (first match
       * wins, cloud rules are evaluated first). Requires apiKey to be set.
       */
      pullPolicies: z.boolean().default(false),

      /**
       * Where the gateway fetches cloud policies from. By default we derive
       * this from `endpoint` (replacing `/v1/ingest` with `/v1/policies`).
       * Override only when you self-host a different control plane.
       */
      policiesEndpoint: z.string().url().optional(),

      /** How often to refetch cloud policies. Defaults to 60s. */
      policyPullIntervalMs: z.number().int().positive().default(60_000),
    })
    .default({}),
});

export type Config = z.infer<typeof ConfigSchema>;
export type ServerConfig = z.infer<typeof ServerSchema>;
export type Rule = z.infer<typeof RuleSchema>;
export type RateLimitRule = z.infer<typeof RateLimitSchema>;

export function expandHome(p: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/")) return resolve(homedir(), p.slice(2));
  return p;
}

export function defaultConfigPaths(): string[] {
  return [
    resolve(process.cwd(), "trabecc.yaml"),
    resolve(process.cwd(), "trabecc.yml"),
    resolve(homedir(), ".trabecc", "config.yaml"),
    resolve(homedir(), ".config", "trabecc", "config.yaml"),
  ];
}

export function findConfig(explicit?: string): string | null {
  if (explicit) {
    const abs = isAbsolute(explicit) ? explicit : resolve(process.cwd(), explicit);
    return existsSync(abs) ? abs : null;
  }
  for (const candidate of defaultConfigPaths()) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export function loadConfig(path: string): { config: Config; sourcePath: string; baseDir: string } {
  const raw = readFileSync(path, "utf8");
  const parsed = YAML.parse(raw);
  const config = ConfigSchema.parse(parsed ?? {});

  // Server name uniqueness is a load-time invariant, not a schema rule.
  const seen = new Set<string>();
  for (const s of config.servers) {
    if (seen.has(s.name)) throw new Error(`duplicate server name in config: "${s.name}"`);
    seen.add(s.name);
  }

  return { config, sourcePath: path, baseDir: dirname(path) };
}
