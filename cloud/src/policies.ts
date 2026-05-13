// /v1/policies CRUD endpoints. All authenticated; all scoped to the caller's
// org_id via the auth middleware that ran upstream.

import type { Context } from "hono";
import { z } from "zod";
import {
  ensureSchema,
  listPolicies,
  getPolicy,
  createPolicy,
  updatePolicy,
  deletePolicy,
  type WhenClause,
} from "./db.ts";
import { getAuth } from "./auth.ts";

// ---------- input schemas ----------

const WhenClauseObjectSchema = z.object({
  glob: z.string().optional(),
  contains: z.string().optional(),
  containsAny: z.array(z.string()).optional(),
  notContains: z.string().optional(),
  matches: z.string().optional(),
});

const WhenClauseSchema = z.union([z.string(), WhenClauseObjectSchema]);

const PolicyCreateSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional().nullable(),
  matchGlob: z.string().min(1).max(200),
  whenClauses: z.record(z.string(), WhenClauseSchema).optional().nullable(),
  effect: z.enum(["allow", "deny"]),
  reason: z.string().max(500).optional().nullable(),
  enabled: z.boolean().optional(),
  template: z.string().max(40).optional().nullable(),
});

const PolicyUpdateSchema = PolicyCreateSchema.partial();

// ---------- handlers ----------

export async function handleList(c: Context): Promise<Response> {
  const auth = getAuth(c);
  await ensureSchema();
  const onlyEnabled = c.req.query("enabled") === "true";
  const policies = await listPolicies(auth.orgId, onlyEnabled);
  return c.json({ policies });
}

export async function handleGet(c: Context): Promise<Response> {
  const auth = getAuth(c);
  await ensureSchema();
  const id = c.req.param("id");
  if (!id) return c.json({ error: "missing id" }, 400);
  const policy = await getPolicy(auth.orgId, id);
  if (!policy) return c.json({ error: "policy not found" }, 404);
  return c.json({ policy });
}

export async function handleCreate(c: Context): Promise<Response> {
  const auth = getAuth(c);
  await ensureSchema();
  const body = await safeJson(c);
  const parsed = PolicyCreateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation failed", issues: parsed.error.issues.slice(0, 5) }, 400);
  }
  const policy = await createPolicy(auth.orgId, {
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    matchGlob: parsed.data.matchGlob,
    whenClauses: parsed.data.whenClauses as Record<string, WhenClause> | null | undefined,
    effect: parsed.data.effect,
    reason: parsed.data.reason ?? null,
    enabled: parsed.data.enabled ?? true,
    template: parsed.data.template ?? null,
  });
  return c.json({ policy }, 201);
}

export async function handleUpdate(c: Context): Promise<Response> {
  const auth = getAuth(c);
  await ensureSchema();
  const id = c.req.param("id");
  if (!id) return c.json({ error: "missing id" }, 400);
  const existing = await getPolicy(auth.orgId, id);
  if (!existing) return c.json({ error: "policy not found" }, 404);

  const body = await safeJson(c);
  const parsed = PolicyUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: "validation failed", issues: parsed.error.issues.slice(0, 5) }, 400);
  }
  const policy = await updatePolicy(auth.orgId, id, {
    ...(parsed.data.name !== undefined && { name: parsed.data.name }),
    ...(parsed.data.description !== undefined && { description: parsed.data.description }),
    ...(parsed.data.matchGlob !== undefined && { matchGlob: parsed.data.matchGlob }),
    ...(parsed.data.whenClauses !== undefined && {
      whenClauses: parsed.data.whenClauses as Record<string, WhenClause> | null,
    }),
    ...(parsed.data.effect !== undefined && { effect: parsed.data.effect }),
    ...(parsed.data.reason !== undefined && { reason: parsed.data.reason }),
    ...(parsed.data.enabled !== undefined && { enabled: parsed.data.enabled }),
    ...(parsed.data.template !== undefined && { template: parsed.data.template }),
  });
  return c.json({ policy });
}

export async function handleDelete(c: Context): Promise<Response> {
  const auth = getAuth(c);
  await ensureSchema();
  const id = c.req.param("id");
  if (!id) return c.json({ error: "missing id" }, 400);
  const deleted = await deletePolicy(auth.orgId, id);
  if (!deleted) return c.json({ error: "policy not found" }, 404);
  return c.body(null, 204);
}

async function safeJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch {
    return undefined;
  }
}
