// Self-serve signup. Email in → free org + API key out.
//
// v0.4 deliberately keeps this minimal: no email verification, no captcha,
// no password. The API key IS the credential. If signup spam becomes an
// issue, add Turnstile or email-verify in v0.5.

import type { Context } from "hono";
import { ensureSchema, createOrg, createApiKey, getOrg } from "./db.ts";

const C = {
  bg: "#0a0a0c",
  surface: "#16161e",
  border: "#27262e",
  fg: "#fafafa",
  fgDim: "#a1a1aa",
  fgFaint: "#71717a",
  brand: "#dc143c",
  brandDark: "#9f0d2c",
  success: "#22c55e",
};

const STYLE = `
  *{box-sizing:border-box}html,body{margin:0;padding:0}
  body{background:${C.bg};color:${C.fg};font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;line-height:1.55;-webkit-font-smoothing:antialiased}
  .container{max-width:540px;margin:5rem auto;padding:0 1.25rem}
  a{color:${C.brand};text-decoration:none}
  code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.85em;background:#1a1922;padding:1px 6px;border-radius:4px;color:${C.fg}}
  .card{background:${C.surface};border:1px solid ${C.border};border-radius:14px;padding:2rem}
  .brand{display:flex;align-items:center;gap:.75rem;margin-bottom:1.5rem}
  .brand .mark{width:36px;height:36px;border-radius:9px;background:${C.brand};display:grid;place-items:center;color:#fff;font-weight:800}
  .brand h1{margin:0;font-size:1.25rem}
  h2{margin:0 0 .5rem;font-size:1.15rem}
  p.lede{color:${C.fgDim};margin:0 0 1.5rem;font-size:.95rem}
  form{display:flex;flex-direction:column;gap:.85rem}
  label{color:${C.fg};font-size:.85rem;font-weight:600}
  input{padding:.7rem .9rem;background:${C.bg};border:1px solid ${C.border};border-radius:8px;color:${C.fg};font-size:.95rem}
  input:focus{outline:none;border-color:${C.brand}}
  .hint{color:${C.fgFaint};font-size:.78rem;margin-top:-.4rem}
  button{padding:.7rem 1.1rem;background:${C.brand};color:#fff;border:0;border-radius:8px;font-weight:600;font-size:.95rem;cursor:pointer;margin-top:.5rem}
  button:hover{background:${C.brandDark}}
  .alert{padding:.75rem 1rem;border-radius:8px;margin-bottom:1rem;font-size:.88rem}
  .alert.error{background:rgba(220,20,60,.1);color:${C.brand};border:1px solid rgba(220,20,60,.3)}
  .limits{margin-top:1.25rem;padding:1rem;background:#1a1922;border-radius:8px;font-size:.85rem;color:${C.fgDim}}
  .limits strong{color:${C.fg}}
  /* success screen */
  .key{padding:.85rem 1rem;background:${C.bg};border:1px solid ${C.border};border-radius:8px;font-family:ui-monospace,monospace;font-size:.85rem;word-break:break-all;margin:1rem 0}
  .next ol{margin:1rem 0 0;padding-left:1.5rem;color:${C.fgDim};font-size:.9rem;line-height:1.7}
  .next ol li{margin-bottom:.5rem}
  .next code{display:inline-block;padding:1px 6px}
`;

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ESC[c] ?? c);

function shell(title: string, body: string): string {
  return `<!doctype html>
<html><head>
  <meta charset="utf-8"/>
  <title>${esc(title)}</title>
  <meta name="theme-color" content="${C.brand}"/>
  <style>${STYLE}</style>
</head><body><div class="container">
  <div class="brand">
    <div class="mark">T</div>
    <h1>Trabecc Cloud</h1>
  </div>
  ${body}
</div></body></html>`;
}

export function pageSignup(c: Context): Response {
  return c.html(shell(
    "Sign up — Trabecc Cloud",
    `<div class="card">
      <h2>Start free</h2>
      <p class="lede">No credit card. Get a Trabecc Cloud API key in 10 seconds — wire it into your local <code>trabecc.yaml</code> and your gateway starts pushing audit events to your dashboard.</p>
      <form method="post" action="/signup">
        <label for="email">Work email</label>
        <input type="email" name="email" id="email" required autofocus placeholder="you@yourcompany.com"/>
        <label for="name">Organization name <span style="color:${C.fgFaint};font-weight:400">(optional)</span></label>
        <input type="text" name="name" id="name" placeholder="Acme Inc"/>
        <p class="hint">We use the email only to contact you about your account. No marketing emails.</p>
        <button type="submit">Create my free account</button>
      </form>
      <div class="limits">
        <strong>Free tier:</strong> 1 host · 1,000 events/day · 7-day retention · cloud policy UI.
        Need more? Upgrade to Pro ($29/seat/month) from the dashboard once you're in.
      </div>
    </div>
    <p style="text-align:center;margin-top:1.5rem;color:${C.fgFaint};font-size:.85rem">
      Already have an API key? <a href="/?key=tk_live_">Open your dashboard</a>
    </p>`,
  ));
}

export async function postSignup(c: Context): Promise<Response> {
  const form = await c.req.parseBody();
  const email = String(form["email"] ?? "").trim().toLowerCase();
  const name = String(form["name"] ?? "").trim() || (email ? email.split("@")[0] ?? "My Org" : "My Org");

  if (!email || !email.includes("@")) {
    return c.html(shell(
      "Sign up — Trabecc Cloud",
      `<div class="card"><div class="alert error">A valid email is required.</div><p><a href="/signup">Try again</a></p></div>`,
    ), 400);
  }

  await ensureSchema();

  // Create a free org + a default API key. Show the key exactly once.
  const { id: orgId } = await createOrg(name, "free", email);
  const { plaintext } = await createApiKey(orgId, "default");
  const org = await getOrg(orgId);

  return c.html(shell(
    "Welcome — Trabecc Cloud",
    `<div class="card">
      <h2 style="color:${C.success}">✓ You're in</h2>
      <p class="lede">Your org <code>${esc(org?.name ?? name)}</code> is on the <strong>free</strong> plan.</p>

      <label style="margin-top:.5rem">Your API key</label>
      <div class="key">${esc(plaintext)}</div>
      <p class="hint">⚠️ This is shown exactly once. Save it now (1Password / paper / commit to your secrets manager).</p>

      <div class="next">
        <h2 style="margin-top:2rem">Next steps</h2>
        <ol>
          <li>Open your local <code>~/.trabecc/config.yaml</code>. Under <code>cloud:</code> set <code>enabled: true</code> and <code>apiKey:</code> to the key above. Save.</li>
          <li>Restart your MCP client (Claude Desktop, Cursor, etc.). The gateway will start pushing audit events to the cloud within a few seconds.</li>
          <li>Open your dashboard: <a href="/?key=${esc(plaintext)}">dashboard →</a></li>
        </ol>
      </div>

      <div class="limits">
        <strong>Free tier limits:</strong> 1 host, 1,000 events/day, 7-day retention. The cloud will start returning <code>402 Payment Required</code> with an upgrade link if you exceed them — your local OSS gateway keeps running either way.
      </div>
    </div>`,
  ));
}
