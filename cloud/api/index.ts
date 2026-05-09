// Vercel Function entry. Re-exports the Hono app's fetch handler so
// vercel.json's rewrite (/* → /api/index) hits it for every request.

import app from "../src/index.ts";

export default async function handler(req: Request): Promise<Response> {
  return app.fetch(req);
}
