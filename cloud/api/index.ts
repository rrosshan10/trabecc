// Vercel Function entry. vercel.json rewrites every path here, so this one
// handler serves the whole Hono app.
//
// Why hand-rolled instead of an off-the-shelf adapter:
//   - hono/vercel's handle is just app.fetch(req); Vercel's Node runtime
//     passes (req,res), not a Web Request, so that returns a Response that
//     never gets written → FUNCTION_INVOCATION_TIMEOUT on every route.
//   - @hono/node-server/vercel writes to res (GET works) but attaches its
//     request-body stream listeners a tick late; on Vercel the incoming
//     stream is already flowing, so POST bodies are lost and c.req.text()
//     hangs until the 504.
//
// So we buffer the raw body ourselves, synchronously, as the very first
// thing — before any await — then build a Web Request from that buffer and
// hand it to app.fetch. Buffering the exact bytes also gives the Stripe
// webhook the raw payload its signature check requires.
//
// The handler is dual-mode: if Vercel ever invokes it Web-style (Edge /
// Fluid passing a single Request), we detect that and just app.fetch it.

import type { IncomingMessage, ServerResponse } from "node:http";
import app from "../src/index.js";

// Tell @vercel/node not to buffer/parse the body for us — we need it raw.
export const config = { api: { bodyParser: false } };

export default async function handler(
  req: IncomingMessage | Request,
  res: ServerResponse,
): Promise<Response | void> {
  // Web-style invocation (single Request arg, no Node res): just fetch.
  if (typeof (req as Request).arrayBuffer === "function" && !res?.setHeader) {
    return app.fetch(req as Request);
  }

  const nodeReq = req as IncomingMessage;
  const method = nodeReq.method ?? "GET";

  // Drain the body NOW, before awaiting anything else.
  let bodyBuffer: Buffer | undefined;
  if (method !== "GET" && method !== "HEAD") {
    const chunks: Buffer[] = [];
    for await (const chunk of nodeReq) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    bodyBuffer = Buffer.concat(chunks);
  }

  const host = nodeReq.headers.host ?? "api.trabecc.com";
  const url = `https://${host}${nodeReq.url ?? "/"}`;

  const headers = new Headers();
  for (const [k, v] of Object.entries(nodeReq.headers)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) for (const item of v) headers.append(k, item);
    else headers.set(k, v);
  }

  const init: RequestInit = { method, headers };
  if (bodyBuffer && bodyBuffer.length > 0) {
    init.body = new Uint8Array(bodyBuffer);
  }

  const response = await app.fetch(new Request(url, init));

  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") return; // handled below
    res.setHeader(key, value);
  });
  const setCookie = response.headers.getSetCookie?.();
  if (setCookie && setCookie.length > 0) res.setHeader("set-cookie", setCookie);

  const ab = await response.arrayBuffer();
  res.end(Buffer.from(ab));
}
