// Stripe webhook handler.
//
// Stripe POSTs here when subscriptions are created, updated, or cancelled.
// On `checkout.session.completed` we look up the org (by client_reference_id
// from the Payment Link URL, falling back to the customer email) and flip
// its plan to `pro`. On `customer.subscription.deleted` we revert to free.
//
// Idempotency: every Stripe event has a unique id (evt_xxx). We record the
// id in `stripe_events` after processing, and skip on re-entry. Stripe will
// retry any non-2xx response, so this matters in practice.
//
// Signature verification uses the raw request body — Hono's c.req.text()
// returns it unparsed, which is what stripe.webhooks.constructEvent requires.

import type { Context } from "hono";
import Stripe from "stripe";
import { PLANS, isValidPlan, type Plan } from "./plans.js";
import {
  ensureSchema,
  findOrgByStripeCustomer,
  findOrgByEmail,
  getOrg,
  setOrgStripeCustomer,
  updateOrgPlan,
  stripeEventAlreadySeen,
  recordStripeEvent,
} from "./db.js";

const stripeSecret = process.env["STRIPE_SECRET_KEY"];
const webhookSecret = process.env["STRIPE_WEBHOOK_SECRET"];

// Lazy-init: keeping the module importable even when the env vars aren't
// set (e.g. local dev where the user just wants to run the dashboard).
let stripeClient: Stripe | null = null;
function getStripe(): Stripe {
  if (!stripeClient) {
    if (!stripeSecret) throw new Error("STRIPE_SECRET_KEY is not configured");
    stripeClient = new Stripe(stripeSecret, { apiVersion: "2025-09-30.clover" as Stripe.LatestApiVersion });
  }
  return stripeClient;
}

export async function handleStripeWebhook(c: Context): Promise<Response> {
  if (!webhookSecret) {
    console.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET not set");
    return c.json({ error: "webhook not configured" }, 500);
  }

  const signature = c.req.header("stripe-signature");
  if (!signature) return c.json({ error: "missing stripe-signature header" }, 400);

  const rawBody = await c.req.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error("[stripe-webhook] signature verify failed", err);
    return c.json({ error: "invalid signature" }, 400);
  }

  await ensureSchema();

  // Idempotency: Stripe retries on any non-2xx, so we may receive the same
  // event multiple times. Skip if we've already processed it.
  if (await stripeEventAlreadySeen(event.id)) {
    return c.json({ received: true, duplicate: true });
  }

  let orgId: string | null = null;
  let note: string | null = null;

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const result = await handleCheckoutCompleted(session);
        orgId = result.orgId;
        note = result.note;
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const result = await handleSubscriptionChange(sub);
        orgId = result.orgId;
        note = result.note;
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const result = await handleSubscriptionDeleted(sub);
        orgId = result.orgId;
        note = result.note;
        break;
      }
      default: {
        // We acknowledge unknown event types — Stripe sends many, and we
        // only care about a subset. Recording them prevents redelivery.
        note = `ignored ${event.type}`;
      }
    }
  } catch (err) {
    console.error(`[stripe-webhook] error handling ${event.type}`, err);
    // Return 500 so Stripe retries — and DO NOT record the event, so the
    // retry will reprocess it.
    return c.json({ error: "handler failed" }, 500);
  }

  await recordStripeEvent(event.id, event.type, orgId, note);
  return c.json({ received: true, orgId, note });
}

// ============================================================
// EVENT HANDLERS
// ============================================================

async function handleCheckoutCompleted(
  session: Stripe.Checkout.Session,
): Promise<{ orgId: string | null; note: string }> {
  // Three ways to resolve which org bought this:
  //   1. client_reference_id on the Checkout Session (set by our dashboard
  //      upgrade button — most reliable, present for every signed-in user)
  //   2. existing stripe_customer_id on an org (re-subscription)
  //   3. customer email match (fallback for users who paid via the public
  //      Payment Link link without going through the dashboard)
  const clientRef = session.client_reference_id;
  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id ?? null;
  const email = session.customer_details?.email ?? session.customer_email ?? null;

  let org = clientRef ? await getOrg(clientRef) : null;
  if (!org && customerId) org = await findOrgByStripeCustomer(customerId);
  if (!org && email) org = await findOrgByEmail(email);

  if (!org) {
    return {
      orgId: null,
      note: `no org matched (ref=${clientRef ?? "-"} cust=${customerId ?? "-"} email=${email ?? "-"})`,
    };
  }

  // Link the stripe customer to the org if we haven't already, so future
  // subscription events resolve cleanly.
  if (customerId && org.stripeCustomerId !== customerId) {
    await setOrgStripeCustomer(org.id, customerId);
  }

  // Promote to pro. (We don't infer team/enterprise from price ids yet —
  // those tiers are sales-led, not self-serve.)
  await updateOrgPlan(org.id, "pro", PLANS.pro.retentionDays);
  return { orgId: org.id, note: `upgraded ${org.id} to pro via checkout` };
}

async function handleSubscriptionChange(
  sub: Stripe.Subscription,
): Promise<{ orgId: string | null; note: string }> {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const org = await findOrgByStripeCustomer(customerId);
  if (!org) return { orgId: null, note: `no org for customer ${customerId}` };

  // Status can be: active, trialing, past_due, canceled, incomplete, etc.
  // We treat anything other than active/trialing as "downgrade to free".
  const active = sub.status === "active" || sub.status === "trialing";
  const targetPlan: Plan = active ? "pro" : "free";

  if (org.plan === targetPlan) {
    return { orgId: org.id, note: `no-op: already on ${targetPlan} (status=${sub.status})` };
  }

  await updateOrgPlan(org.id, targetPlan, PLANS[targetPlan].retentionDays);
  return { orgId: org.id, note: `subscription.${sub.status} → ${targetPlan}` };
}

async function handleSubscriptionDeleted(
  sub: Stripe.Subscription,
): Promise<{ orgId: string | null; note: string }> {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const org = await findOrgByStripeCustomer(customerId);
  if (!org) return { orgId: null, note: `no org for customer ${customerId}` };

  await updateOrgPlan(org.id, "free", PLANS.free.retentionDays);
  return { orgId: org.id, note: `subscription deleted → free` };
}

// Re-export for tests/admin
export { isValidPlan };
