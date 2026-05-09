// POST /v1/ingest — receives audit events from the OSS gateway.
// Wire-format must match src/audit/sync.ts in the OSS package exactly.

import type { Context } from "hono";
import { z } from "zod";
import { ensureSchema, insertEvents, recordDrops, type IngestPayload } from "./db.ts";
import { getAuth } from "./auth.ts";

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

  // Persist events + drops in parallel. Drops aren't critical-path; we don't
  // fail the request if the drops insert errors.
  const [count] = await Promise.all([
    insertEvents(auth.orgId, payload.installId, payload.hostId, payload.events),
    recordDrops(auth.orgId, payload.installId, payload.droppedSinceLastFlush).catch(() => undefined),
  ]);

  return c.json({ ok: true, accepted: count }, 202);
}
