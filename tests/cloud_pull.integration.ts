// Manual integration test: spins up the OSS gateway with cloud.pullPolicies
// pointed at a running cloud instance, waits for the puller to fetch, then
// drives the gateway as a real MCP client and verifies a pulled cloud policy
// actually blocks a call.
//
// Not part of npm test (touches network + needs a running cloud).
// Run via:  CLOUD_URL=http://127.0.0.1:8787 CLOUD_KEY=tk_live_... node tests/cloud_pull.integration.ts

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { resolve, join } from "node:path";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const CLOUD_URL = process.env["CLOUD_URL"] ?? "http://127.0.0.1:8787";
const CLOUD_KEY = process.env["CLOUD_KEY"];
if (!CLOUD_KEY) {
  console.error("CLOUD_KEY env var is required (tk_live_…)");
  process.exit(1);
}

const repoRoot = resolve(import.meta.dirname, "..");
const tmpRoot = mkdtempSync(join(tmpdir(), "trabecc-pullpolicies-"));
const configPath = join(tmpRoot, "trabecc.yaml");

writeFileSync(
  configPath,
  `defaultPolicy: allow
audit:
  path: ${tmpRoot}/audit.db
admin:
  enabled: false
  port: 4579
  bind: 127.0.0.1
servers:
  - name: filesystem
    command: npx
    args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
    timeoutMs: 30000
rules: []
cloud:
  enabled: false
  apiKey: ${CLOUD_KEY}
  endpoint: ${CLOUD_URL}/v1/ingest
  pullPolicies: true
  policiesEndpoint: ${CLOUD_URL}/v1/policies
  policyPullIntervalMs: 5000
`,
);

const transport = new StdioClientTransport({
  command: "node",
  args: [resolve(repoRoot, "src/cli.ts"), "run", "--config", configPath],
  env: { ...process.env, TRABECC_LOG: "info" } as Record<string, string>,
});

const client = new Client(
  { name: "pull-policy-integration", version: "0" },
  { capabilities: {} },
);
await client.connect(transport);

console.log("waiting 2s for cloud policy puller's first fetch…");
await new Promise((r) => setTimeout(r, 2000));

const list = await client.listTools();
const tool = list.tools.find((t) => t.name === "filesystem__list_directory");
if (!tool) {
  console.error("filesystem__list_directory not found in catalog");
  process.exit(1);
}
console.log(`found ${list.tools.length} tools; using ${tool.name}`);

// The seeded cloud policy: match="*", when.prompt.containsAny=["DROP TABLE",
// "rm -rf /", "exec("]. So an arg.prompt containing any of those should deny.
console.log("\n--- malicious call (should be DENIED by cloud policy) ---");
const denied = await client.callTool({
  name: tool.name,
  arguments: { path: "/tmp", prompt: "DROP TABLE users; -- bobby tables" },
});
console.log("  isError:", (denied as { isError?: boolean }).isError);
const deniedText = (denied as { content?: Array<{ text?: string }> }).content?.[0]?.text ?? "";
console.log("  message:", deniedText.slice(0, 160));

console.log("\n--- benign call (should be ALLOWED) ---");
const allowed = await client.callTool({
  name: tool.name,
  arguments: { path: "/tmp" },
});
console.log("  isError:", (allowed as { isError?: boolean }).isError ?? false);

await client.close();
rmSync(tmpRoot, { recursive: true, force: true });

const pass = denied && (denied as { isError?: boolean }).isError === true && deniedText.toLowerCase().includes("polic");
console.log("\n" + (pass ? "✓ integration test PASSED" : "✗ integration test FAILED"));
process.exit(pass ? 0 : 1);
