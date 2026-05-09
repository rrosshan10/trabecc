#!/usr/bin/env node
// Trabecc Cloud admin CLI. Only used by you (the founder) to provision
// orgs and API keys. There is no signup UI in v0.2 — first ~10 customers
// are manually onboarded; you'll automate this when there are >10.
//
// Usage:
//   npm run admin -- create-org "Webflow Inc"
//   npm run admin -- create-key org_abc123 "production install"
//   npm run admin -- list-orgs
//   npm run admin -- list-keys org_abc123
//   npm run admin -- migrate

import { ensureSchema, createOrg, createApiKey, listOrgs, listKeysForOrg, sql } from "./db.ts";

async function main(): Promise<void> {
  const [cmd, ...args] = process.argv.slice(2);
  if (!cmd || cmd === "help" || cmd === "--help") return printHelp();

  switch (cmd) {
    case "migrate": {
      await ensureSchema();
      console.log("schema applied");
      break;
    }

    case "create-org": {
      const name = args[0];
      const plan = (args[1] ?? "pro") as "pro" | "team" | "enterprise";
      if (!name) return fail("usage: create-org <name> [pro|team|enterprise]");
      await ensureSchema();
      const { id } = await createOrg(name, plan);
      console.log(`created org "${name}"`);
      console.log(`  id:   ${id}`);
      console.log(`  plan: ${plan}`);
      console.log(`\nnext: create-key ${id} "<key name>"`);
      break;
    }

    case "create-key": {
      const orgId = args[0];
      const name = args[1] ?? "default";
      if (!orgId) return fail("usage: create-key <orgId> [name]");
      await ensureSchema();
      const { id, plaintext } = await createApiKey(orgId, name);
      console.log(`created API key "${name}" for ${orgId}`);
      console.log(`  id:        ${id}`);
      console.log(`  key:       ${plaintext}`);
      console.log("\n⚠️  Save this key now — it will not be shown again.");
      console.log("\nGive it to your customer; they set it in their trabecc.yaml as:");
      console.log("    cloud:");
      console.log("      enabled: true");
      console.log("      apiKey: " + plaintext);
      break;
    }

    case "list-orgs": {
      await ensureSchema();
      const orgs = await listOrgs();
      if (orgs.length === 0) { console.log("(no orgs)"); break; }
      for (const o of orgs) {
        console.log(`${o.id}  ${o.plan.padEnd(10)}  ${o.name}  (${o.createdAt.toISOString().slice(0, 10)})`);
      }
      break;
    }

    case "list-keys": {
      const orgId = args[0];
      if (!orgId) return fail("usage: list-keys <orgId>");
      await ensureSchema();
      const keys = await listKeysForOrg(orgId);
      if (keys.length === 0) { console.log("(no keys)"); break; }
      for (const k of keys) {
        const status = k.revoked ? "revoked" : "active";
        const lastUsed = k.lastUsedAt ? `last used ${k.lastUsedAt.toISOString().slice(0, 10)}` : "never used";
        console.log(`${k.id}  …${k.lastFour}  ${status.padEnd(8)}  ${k.name}  (${lastUsed})`);
      }
      break;
    }

    case "revoke-key": {
      const keyId = args[0];
      if (!keyId) return fail("usage: revoke-key <keyId>");
      await sql`UPDATE api_keys SET revoked_at = NOW() WHERE id = ${keyId}`;
      console.log(`revoked ${keyId}`);
      break;
    }

    default:
      console.error(`unknown command: ${cmd}`);
      printHelp();
      process.exit(1);
  }

  await sql.end();
}

function printHelp(): void {
  console.log(`Trabecc Cloud admin

Commands:
  migrate                          Apply schema (idempotent).
  create-org <name> [plan]         Create an org. plan: pro | team | enterprise (default: pro).
  create-key <orgId> [name]        Create an API key for an org. The key is shown ONCE.
  list-orgs                        List all orgs.
  list-keys <orgId>                List all keys for an org.
  revoke-key <keyId>               Revoke a key (soft-delete; tenant immediately rejects further ingest).

Env:
  DATABASE_URL                     Required. Postgres connection string.

Examples:
  npm run admin -- create-org "Webflow Inc" pro
  npm run admin -- create-key org_abc123 "production"
`);
}

function fail(msg: string): void {
  console.error(msg);
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
