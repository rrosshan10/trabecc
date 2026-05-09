// Trabecc Cloud — main entry. Hono app exposing:
//   GET  /                       login form / dashboard (browser)
//   GET  /v1/health               unauthenticated health check
//   POST /v1/ingest               authenticated; accepts audit events from OSS
//   GET  /v1/audit                authenticated; recent events as JSON
//   GET  /v1/stats                authenticated; aggregated counts as JSON
//
// Runs locally via `npm run dev`; deployed to Vercel as a single Function
// (see vercel.json).

import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { ensureSchema, recentEvents, statsForOrg } from "./db.ts";
import { requireAuth, getAuth } from "./auth.ts";
import { handleIngest } from "./ingest.ts";
import { handleDashboard } from "./dashboard.ts";

const app = new Hono();

// Permissive CORS for the OSS ingest path. The OSS gateway always sends from
// localhost so CORS doesn't normally apply, but we allow it for browser-based
// debugging.
app.use("*", async (c, next) => {
  c.header("Access-Control-Allow-Origin", "*");
  c.header("Access-Control-Allow-Headers", "authorization, content-type, x-trabecc-version, x-trabecc-install, x-trabecc-host");
  c.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (c.req.method === "OPTIONS") return c.body(null, 204);
  await next();
});

// ============================================================
// PUBLIC ENDPOINTS
// ============================================================

app.get("/v1/health", (c) =>
  c.json({ ok: true, version: "0.2.0", service: "trabecc-cloud" }),
);

// Browser dashboard (auth via ?key=)
app.get("/", handleDashboard);

// ============================================================
// AUTHENTICATED API
// ============================================================

const v1 = new Hono();
v1.use("*", requireAuth);

v1.post("/ingest", handleIngest);

v1.get("/audit", async (c) => {
  const auth = getAuth(c);
  await ensureSchema();
  const limit = Math.min(1000, Number(c.req.query("limit") ?? 100));
  return c.json({ events: await recentEvents(auth.orgId, limit) });
});

v1.get("/stats", async (c) => {
  const auth = getAuth(c);
  await ensureSchema();
  const windowMinutes = Math.max(1, Number(c.req.query("windowMinutes") ?? 60));
  const sinceMs = Date.now() - windowMinutes * 60_000;
  return c.json(await statsForOrg(auth.orgId, sinceMs));
});

app.route("/v1", v1);

// ============================================================
// 404
// ============================================================

app.notFound((c) => c.json({ error: "not found" }, 404));

app.onError((err, c) => {
  console.error("[trabecc-cloud] unhandled", err);
  return c.json({ error: "internal server error" }, 500);
});

// ============================================================
// LOCAL DEV — runs the server on PORT (default 8787).
// On Vercel, the function entry (api/index.ts) imports the default export
// of this file but doesn't run it as the entry script — so we detect "am
// I the script being run directly?" via process.argv[1] resolved to a
// file:// URL and compared against import.meta.url. Both --watch (relative
// argv) and `node src/index.ts` (relative or absolute) end up matching
// this way; Vercel's import path does not.
// ============================================================

import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve as resolvePath } from "node:path";

const argvPath = process.argv[1];
const isDirectRun = argvPath
  ? pathToFileURL(resolvePath(argvPath)).href === import.meta.url
  : false;

if (isDirectRun) {
  const port = Number(process.env["PORT"] ?? 8787);
  serve({ fetch: app.fetch, port }, (info) => {
    console.log(`[trabecc-cloud] listening on http://localhost:${info.port}`);
  });
}

// expose for testing
export { fileURLToPath };
export default app;
