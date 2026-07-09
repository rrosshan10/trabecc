// Trabecc CLI implementation. The `cli.ts` shim suppresses Node's SQLite
// experimental warning before this module is dynamic-imported, so static
// imports of node:sqlite below are safe.
//
// Subcommands:
//   run                 — start the MCP fan-out gateway on stdio (this is what
//                         a Claude Desktop / Cursor / Claude Code mcpServer
//                         entry invokes).
//   admin               — start the HTTP admin API in the foreground.
//   init                — write an example config to ./trabecc.yaml.
//   policy check <tool> — evaluate a qualified tool name against the policy
//                         and print the decision.
//   doctor              — load the config, attempt to start every upstream,
//                         and report status; useful for "why can't my client
//                         see any tools?" debugging.
//
// Stdout discipline: in `run`, stdout is owned by MCP. Every other code path
// is free to write to stdout for human consumption.

import { writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import pc from "picocolors";

import { findConfig, loadConfig } from "./config.ts";
import { McpGateway } from "./proxy/gateway.ts";
import { startAdminServer } from "./admin/server.ts";
import { PolicyEngine } from "./policy/engine.ts";
import { Upstream } from "./proxy/upstream.ts";
import { createLogger } from "./log.ts";

const log = createLogger("cli");

const EXAMPLE_CONFIG = `# Trabecc configuration.
# https://github.com/rrosshan10/trabecc
#
# defaultPolicy: deny (recommended) means tools are hidden unless explicitly
# allowed by a rule below. Switch to "allow" if you'd rather opt out.

defaultPolicy: deny

audit:
  path: ~/.trabecc/audit.db
  maxRecords: 100000
  recordArgs: true
  # Extra key substrings to redact (the default list already covers
  # password, token, api_key, authorization, private_key, pat, etc.)
  redactKeys: []

admin:
  enabled: true
  port: 4577
  bind: 127.0.0.1

# Each entry here is an upstream MCP server. Trabecc spawns it as a child
# process and forwards calls to it. Tools are exposed to your agent under a
# "<server>__<tool>" namespace.
servers:
  - name: filesystem
    command: npx
    args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
    timeoutMs: 30000

  # Uncomment and set GITHUB_TOKEN in env to enable.
  # - name: github
  #   command: npx
  #   args: ["-y", "@modelcontextprotocol/server-github"]
  #   env:
  #     GITHUB_PERSONAL_ACCESS_TOKEN: \${GITHUB_TOKEN}

# Policy rules are evaluated top-to-bottom; first match wins. Patterns are
# globs over the qualified tool name (server__tool). Optional 'when:'
# predicates gate by call arguments.
rules:
  - match: "filesystem__read_*"
    effect: allow
    reason: "read-only filesystem access is fine"
  # Argument-level: deny writes to sensitive paths.
  - match: "filesystem__write_*"
    effect: deny
    when:
      path: "/etc/*"
    reason: "no writes under /etc"
  - match: "filesystem__write_*"
    effect: deny
    reason: "writes require human review"
  - match: "filesystem__*"
    effect: allow

# Rate limits are per-tool, token-bucket. Burst defaults to perMinute.
rateLimits:
  - match: "filesystem__*"
    perMinute: 120
    burst: 30
`;

async function cmdRun(configPath: string | undefined): Promise<void> {
  const found = findConfig(configPath);
  if (!found) {
    log.error("no config found", { searched: configPath ?? "default locations" });
    process.exit(2);
  }
  const { config } = loadConfig(found);
  log.info(`loaded config from ${found}`, {
    servers: config.servers.length,
    rules: config.rules.length,
  });

  const gateway = new McpGateway(config);
  await gateway.start();

  const shutdown = async (signal: string) => {
    log.info(`received ${signal}; shutting down`);
    await gateway.stop();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

async function cmdAdmin(configPath: string | undefined): Promise<void> {
  const found = findConfig(configPath);
  if (!found) {
    console.error(pc.red("no config found"));
    process.exit(2);
  }
  const { config } = loadConfig(found);
  const admin = startAdminServer(config);
  const shutdown = async () => {
    await admin.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

function cmdInit(): void {
  const target = resolve(process.cwd(), "trabecc.yaml");
  if (existsSync(target)) {
    console.error(pc.yellow(`refusing to overwrite existing ${target}`));
    process.exit(1);
  }
  writeFileSync(target, EXAMPLE_CONFIG, "utf8");
  console.log(pc.green(`wrote ${target}`));
  console.log("\nNext steps:");
  console.log("  1. Edit trabecc.yaml to add the upstream MCP servers you use.");
  console.log("  2. Wire your client to Trabecc. For Claude Desktop, add to claude_desktop_config.json:\n");
  console.log(
    pc.dim(
      JSON.stringify(
        {
          mcpServers: {
            trabecc: {
              command: "npx",
              args: ["trabecc", "run"],
            },
          },
        },
        null,
        2,
      ),
    ),
  );
  console.log(`\n  3. ${pc.cyan("trabecc admin")} for the dashboard at http://127.0.0.1:4577`);
  console.log(`  4. Optional — free multi-host cloud dashboard: ${pc.cyan("https://api.trabecc.com/signup")} (1 host, 1k events/day, no card)`);
}

function cmdPolicyCheck(tool: string | undefined, configPath: string | undefined): void {
  if (!tool) {
    console.error(pc.red("usage: trabecc policy check <qualifiedToolName>"));
    process.exit(1);
  }
  const found = findConfig(configPath);
  if (!found) {
    console.error(pc.red("no config found"));
    process.exit(2);
  }
  const { config } = loadConfig(found);
  const engine = new PolicyEngine(config.rules, config.defaultPolicy);
  const decision = engine.evaluate(tool);
  const color = decision.effect === "allow" ? pc.green : pc.red;
  console.log(`${color(decision.effect.toUpperCase())} ${tool}`);
  console.log(`  reason: ${decision.reason}`);
  if (decision.matchedRule) console.log(`  rule:   ${decision.matchedRule.match}`);
}

async function cmdDoctor(configPath: string | undefined): Promise<void> {
  const found = findConfig(configPath);
  if (!found) {
    console.error(pc.red("no config found"));
    process.exit(2);
  }
  const { config } = loadConfig(found);
  console.log(pc.bold(`config: ${found}`));
  console.log(`defaultPolicy: ${config.defaultPolicy}`);
  console.log(`servers: ${config.servers.length}, rules: ${config.rules.length}, rate limits: ${config.rateLimits.length}\n`);

  for (const sc of config.servers) {
    process.stdout.write(`  ${pc.cyan(sc.name)} ${pc.dim("(" + sc.command + " " + sc.args.join(" ") + ")")} ... `);
    const up = new Upstream(sc);
    await up.start();
    if (up.status === "ready") {
      console.log(`${pc.green("ready")} (${up.tools().length} tools)`);
    } else {
      console.log(`${pc.red(up.status)} ${pc.dim(up.lastError ?? "")}`);
    }
    await up.close();
  }
}

function printHelp(): void {
  console.log(`${pc.bold("trabecc")} — gateway and governance for MCP

Usage:
  trabecc run [--config path]              Start the MCP fan-out gateway (stdio).
  trabecc admin [--config path]            Start the HTTP admin server.
  trabecc init                             Write an example trabecc.yaml.
  trabecc policy check <tool> [--config p] Evaluate a tool name against policy.
  trabecc doctor [--config path]           Bring up every upstream, report status.
  trabecc --help                           Show this message.

Env:
  TRABECC_LOG=debug|info|warn|error        Log verbosity (stderr only). Default: info.
`);
}

function parseArgs(argv: string[]): { command: string; positional: string[]; flags: Record<string, string | true> } {
  const [command = "help", ...rest] = argv;
  const positional: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i]!;
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = rest[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(a);
    }
  }
  return { command, positional, flags };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "-h" || argv[0] === "help") {
    printHelp();
    return;
  }
  const { command, positional, flags } = parseArgs(argv);
  const configFlag = typeof flags["config"] === "string" ? (flags["config"] as string) : undefined;

  switch (command) {
    case "run":
      await cmdRun(configFlag);
      return;
    case "admin":
      await cmdAdmin(configFlag);
      return;
    case "init":
      cmdInit();
      return;
    case "doctor":
      await cmdDoctor(configFlag);
      return;
    case "policy": {
      const sub = positional[0];
      if (sub === "check") {
        cmdPolicyCheck(positional[1], configFlag);
        return;
      }
      console.error(pc.red(`unknown 'policy' subcommand: ${sub}`));
      process.exit(1);
    }
    default:
      console.error(pc.red(`unknown command: ${command}`));
      printHelp();
      process.exit(1);
  }
}

main().catch((err) => {
  log.error("fatal", { err: err instanceof Error ? err.stack : String(err) });
  process.exit(1);
});
