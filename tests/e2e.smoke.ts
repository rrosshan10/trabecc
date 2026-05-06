// End-to-end smoke test: spawn `trabecc run` as a child process and
// drive it as a real MCP client. Exercises listTools, an allowed call,
// and a denied call. Not part of the unit test suite (touches network/
// child processes), run manually via:  node tests/e2e.smoke.ts

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { resolve } from "node:path";
import { writeFileSync } from "node:fs";

async function main() {
  const repoRoot = resolve(import.meta.dirname, "..");

  // Seed a known file so we can exercise read_file.
  writeFileSync("/tmp/trabecc-smoke.txt", "hello from trabecc\n", "utf8");

  const transport = new StdioClientTransport({
    command: "node",
    args: [resolve(repoRoot, "src/cli.ts"), "run", "--config", resolve(repoRoot, "trabecc.yaml")],
    env: { ...process.env, TRABECC_LOG: "warn" } as Record<string, string>,
  });

  const client = new Client({ name: "smoke-test", version: "0" }, { capabilities: {} });
  await client.connect(transport);

  const list = await client.listTools();
  console.log(`gateway exposes ${list.tools.length} tools`);
  const readTool = list.tools.find((t) => t.name === "filesystem__read_text_file" || t.name === "filesystem__read_file");
  if (!readTool) {
    console.error("expected filesystem__read_(text_)file to be exposed");
    process.exit(1);
  }
  console.log(`found allowed tool: ${readTool.name}`);

  // Allowed call
  const result = await client.callTool({
    name: readTool.name,
    arguments: { path: "/tmp/trabecc-smoke.txt" },
  });
  console.log("allowed call result.isError:", (result as { isError?: boolean }).isError ?? false);

  // Denied call (write_file is denied by policy)
  const denied = await client.callTool({
    name: "filesystem__write_file",
    arguments: { path: "/tmp/trabecc-smoke-denied.txt", content: "should not write" },
  });
  const deniedResult = denied as { isError?: boolean; content?: Array<{ type: string; text: string }> };
  console.log("denied call result.isError:", deniedResult.isError ?? false);
  console.log("denied call message:", deniedResult.content?.[0]?.text);

  await client.close();
  console.log("\nsmoke test passed");
}

main().catch((err) => {
  console.error("smoke test failed", err);
  process.exit(1);
});
