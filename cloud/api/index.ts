// Vercel Function entry. vercel.json rewrites every path to /api/index,
// so this single handler serves the whole Hono app.
//
// We use @hono/node-server's Vercel adapter rather than returning
// app.fetch(req) directly: Vercel's Node runtime hands the function an
// (req, res) pair and expects the response written to `res`. Returning a
// Web `Response` would never be flushed, so the request hangs until a 504.
// The adapter bridges Node req/res ↔ Hono's fetch handler.

import { handle } from "@hono/node-server/vercel";
import app from "../src/index.js";

export default handle(app);
