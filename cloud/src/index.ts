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
import { ensureSchema, recentEvents, statsForOrg, getOrg, countActiveHosts, countEventsToday } from "./db.js";
import { requireAuth, getAuth } from "./auth.js";
import { PLANS, nextTierUpgradeUrl, PRO_UPGRADE_URL } from "./plans.js";
import { handleIngest } from "./ingest.js";
import { handleDashboard } from "./dashboard.js";
import { pageSignup, postSignup } from "./signup.js";
import { handleStripeWebhook } from "./stripe-webhook.js";
import {
  handleList as policiesList,
  handleGet as policiesGet,
  handleCreate as policiesCreate,
  handleUpdate as policiesUpdate,
  handleDelete as policiesDelete,
} from "./policies.js";
import {
  pageList as policiesPageList,
  pageNew as policiesPageNew,
  pageEdit as policiesPageEdit,
  postCreate as policiesPostCreate,
  postUpdate as policiesPostUpdate,
  postDelete as policiesPostDelete,
} from "./policies-ui.js";

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

// ============================================================
// STRIPE WEBHOOK
// ============================================================
// Stripe-signed; mounted outside the requireAuth guard. Must be defined
// before the catch-all CORS branch otherwise the signed-body integrity
// could be perturbed by Hono's automatic body parsing on later middleware.
app.post("/v1/stripe/webhook", handleStripeWebhook);

// ============================================================
// BROWSER UI (?key= auth)
// ============================================================
app.get("/", handleDashboard);
app.get("/signup", pageSignup);
app.post("/signup", postSignup);
app.get("/policies", policiesPageList);
app.get("/policies/new", policiesPageNew);
app.post("/policies/new", policiesPostCreate);
app.get("/policies/:id", policiesPageEdit);
app.post("/policies/:id", policiesPostUpdate);
app.post("/policies/:id/delete", policiesPostDelete);

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
  // Plan-cap on the time window: free tier can't query beyond its
  // retention period (7 days) even if the rows happen to still be there.
  const org = await getOrg(auth.orgId);
  if (!org) return c.json({ error: "org not found" }, 404);
  const limits = PLANS[org.plan];
  const requestedWindow = Math.max(1, Number(c.req.query("windowMinutes") ?? 60));
  const cappedWindow = Math.min(requestedWindow, limits.maxQueryWindowMinutes);
  const sinceMs = Date.now() - cappedWindow * 60_000;
  const data = await statsForOrg(auth.orgId, sinceMs);
  return c.json({
    ...data,
    windowMinutes: cappedWindow,
    capped: cappedWindow < requestedWindow,
    plan: org.plan,
  });
});

// /v1/plan — current usage, limits, and the upgrade target. Used by the
// dashboard banner and by external integrations (Stripe webhook later).
v1.get("/plan", async (c) => {
  const auth = getAuth(c);
  await ensureSchema();
  const org = await getOrg(auth.orgId);
  if (!org) return c.json({ error: "org not found" }, 404);
  const limits = PLANS[org.plan];
  const [hosts, eventsToday] = await Promise.all([
    countActiveHosts(auth.orgId),
    countEventsToday(auth.orgId),
  ]);
  const upgrade = nextTierUpgradeUrl(org.plan);
  return c.json({
    org: { id: org.id, name: org.name, plan: org.plan },
    limits,
    usage: {
      hosts,
      eventsToday,
      hostsPct: Math.round((hosts / limits.maxHosts) * 100),
      eventsPct: Math.round((eventsToday / limits.maxEventsPerDay) * 100),
    },
    upgrade,
  });
});

// Policies — REST API used by the OSS gateway (v0.3.1) to pull rules.
v1.get("/policies", policiesList);
v1.get("/policies/:id", policiesGet);
v1.post("/policies", policiesCreate);
v1.patch("/policies/:id", policiesUpdate);
v1.delete("/policies/:id", policiesDelete);

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
