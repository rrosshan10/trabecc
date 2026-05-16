// Bearer-token auth middleware. Looks up the org for the API key and stashes
// it on the Hono context. All API routes that need tenancy mount this.

import type { Context, MiddlewareHandler } from "hono";
import { findOrgByApiKey } from "./db.js";

export type AuthContext = {
  orgId: string;
  keyId: string;
};

export function getAuth(c: Context): AuthContext {
  const auth = c.get("auth") as AuthContext | undefined;
  if (!auth) throw new Error("requireAuth middleware not mounted");
  return auth;
}

export const requireAuth: MiddlewareHandler = async (c, next) => {
  const header = c.req.header("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return c.json({ error: "missing or malformed Authorization header" }, 401);
  }
  const key = match[1]!.trim();
  if (!key.startsWith("tk_live_")) {
    return c.json({ error: "invalid API key format" }, 401);
  }
  const result = await findOrgByApiKey(key);
  if (!result) {
    return c.json({ error: "invalid or revoked API key" }, 401);
  }
  c.set("auth", result);
  await next();
  return;
};
