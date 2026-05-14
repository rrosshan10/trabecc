// POST /v1/ingest — receives audit events from the OSS gateway.
// Wire-format must match src/audit/sync.ts in the OSS package exactly.

import type { Context } from "hono";
import { z } from "zod";
import {
  ensureSchema,
  insertEvents,
  recordDrops,
  getOrg,
  countActiveHosts,
  countEventsToday,
  type IngestPayload,
} from "./db.ts";
import { getAuth } from "./auth.ts";
import { PLANS, nextTierUpgradeUrl } from "./plans.ts";

const EventSchema = z.object({
  ts: z.number().int(),
  agentId: z.string().nullable(),
  server: z.string().min(1).max(64),
  tool: z.string().min(1).max(128),
  qualifiedName: z.string().min(1).max(200),
  argsJson: z.string(),
  outcome: z.enum(["allowed", "denied", "rate_limited", "error"]),
  reason: z.string().nullable(),
  durationMs: z.number().int().nullable(),
  resultBytes: z.number().int().nullable(),
  errorMessage: z.string().nullable(),
});

const PayloadSchema = z.object({
  installId: z.string().min(1).max(64),
  hostId: z.string().min(1).max(128),
  droppedSinceLastFlush: z.number().int().nonnegative().default(0),
  events: z.array(EventSchema).max(1000),
});

export async function handleIngest(c: Context): Promise<Response> {
  const auth = getAuth(c);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "invalid JSON body" }, 400);
  }

  const parsed = PayloadSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: "validation failed", issues: parsed.error.issues.slice(0, 5) },
      400,
    );
  }
  const payload = parsed.data as IngestPayload;

  await ensureSchema();

  // ---- PLAN ENFORCEMENT ----
  // The free tier exists so anyone can run trabecc cloud with no commitment;
  // limits kick in only once usage is meaningful. Two checks here:
  //   1. Distinct hosts in 7-day window — additional machines mean a team,
  //      and a team should be on Pro.
  //   2. Events ingested today — protects against runaway agent loops and
  //      gives us a sustainable per-customer cost ceiling.
  // Both return 402 Payment Required with the upgrade URL embedded so the
  // OSS gateway can log it and the user can act on it from their dashboard.
  const org = await getOrg(auth.orgId);
  if (!org) {
    return c.json({ error: "org not found" }, 404);
  }
  const limits = PLANS[org.plan];

  // Cheap pre-check: only count hosts if the incoming install_id isn't
  // already in our recent window. This avoids a COUNT DISTINCT on every
  // ingest call from a known host.
  const [activeHostCount, eventsToday] = await Promise.all([
    countActiveHosts(auth.orgId),
    countEventsToday(auth.orgId),
  ]);

  const wouldExceedHosts =
    activeHostCount + (await isNewInstall(auth.orgId, payload.installId) ? 1 : 0) >
    limits.maxHosts;
  if (wouldExceedHosts) {
    const { url, toPlan } = nextTierUpgradeUrl(org.plan);
    return c.json(
      {
        error: "host_limit_exceeded",
        message: `Your ${org.plan} plan allows ${limits.maxHosts} host${limits.maxHosts === 1 ? "" : "s"} in a 7-day window. You're at ${activeHostCount} and this ingest is from a new host.`,
        currentHosts: activeHostCount,
        limit: limits.maxHosts,
        upgrade: { plan: toPlan, url: withCheckoutRef(url, org.id, org.email) },
      },
      402,
    );
  }

  if (eventsToday >= limits.maxEventsPerDay) {
    const { url, toPlan } = nextTierUpgradeUrl(org.plan);
    return c.json(
      {
        error: "daily_event_limit_exceeded",
        message: `Your ${org.plan} plan allows ${limits.maxEventsPerDay.toLocaleString()} events per day. You've sent ${eventsToday.toLocaleString()} today.`,
        eventsToday,
        limit: limits.maxEventsPerDay,
        upgrade: { plan: toPlan, url: withCheckoutRef(url, org.id, org.email) },
      },
      402,
    );
  }

  // ---- ACTUALLY PERSIST ----
  const [count] = await Promise.all([
    insertEvents(auth.orgId, payload.installId, payload.hostId, payload.events),
    recordDrops(auth.orgId, payload.installId, payload.droppedSinceLastFlush).catch(() => undefined),
  ]);

  return c.json({ ok: true, accepted: count }, 202);
}

/** Append client_reference_id (and prefilled_email when known) to Stripe
 *  Payment Links so the webhook can match the payment back to this org
 *  without needing an email lookup. mailto: URLs are returned unchanged. */
function withCheckoutRef(url: string, orgId: string, email: string | null): string {
  if (!url.startsWith("https://buy.stripe.com/")) return url;
  const sep = url.includes("?") ? "&" : "?";
  const emailPart = email ? `&prefilled_email=${encodeURIComponent(email)}` : "";
  return `${url}${sep}client_reference_id=${encodeURIComponent(orgId)}${emailPart}`;
}

/** Was this install_id seen for the org in the recent (7-day) window? */
async function isNewInstall(orgId: string, installId: string): Promise<boolean> {
  const { sql } = await import("./db.ts");
  const sinceMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const rows = await sql<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1 FROM audit_events
      WHERE org_id = ${orgId} AND install_id = ${installId} AND ts >= ${sinceMs}
    ) AS exists
  `;
  return !(rows[0]?.exists ?? false);
}
