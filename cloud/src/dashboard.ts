// Cloud dashboard — multi-host view of an org's audit data.
// Auth: same Bearer token API key, passed as ?key=... in the URL for
// browser bookmarking convenience (NOT secure for shared links — v0.3
// will swap this for a proper session cookie + login).

import type { Context } from "hono";
import {
  ensureSchema,
  findOrgByApiKey,
  recentEvents,
  statsForOrg,
  getOrg,
  countActiveHosts,
  countEventsToday,
  type Outcome,
} from "./db.ts";
import { PLANS, nextTierUpgradeUrl } from "./plans.ts";

const C = {
  bg: "#0a0a0c",
  surface: "#16161e",
  border: "#27262e",
  fg: "#fafafa",
  fgDim: "#a1a1aa",
  fgFaint: "#71717a",
  brand: "#dc143c",
  success: "#22c55e",
  warning: "#f59e0b",
  error: "#f97316",
};
const OUTCOME_COLOR: Record<Outcome, string> = {
  allowed: C.success,
  denied: C.brand,
  rate_limited: C.warning,
  error: C.error,
};

const STYLE = `
  *{box-sizing:border-box}html,body{margin:0;padding:0}
  body{background:${C.bg};color:${C.fg};font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;line-height:1.5;-webkit-font-smoothing:antialiased}
  .container{max-width:1320px;margin:0 auto;padding:1.5rem 1.25rem 4rem}
  a{color:${C.brand};text-decoration:none}
  code,.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.85em}
  header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:1.5rem;border-bottom:1px solid ${C.border};margin-bottom:1.75rem}
  .brand{display:flex;gap:.85rem;align-items:center}
  .brand .mark{width:40px;height:40px;border-radius:10px;background:${C.brand};display:grid;place-items:center;color:#fff;font-weight:800;font-size:1.4rem}
  .brand h1{margin:0;font-size:1.4rem;letter-spacing:-.015em}
  .brand .sub{color:${C.fgDim};font-size:.85rem;margin-top:.15rem}
  .brand .sub code{background:#1a1922;padding:1px 6px;border-radius:4px;color:${C.fg}}
  .meta{color:${C.fgFaint};font-size:.8rem;text-align:right;line-height:1.7}
  .meta .live{display:inline-flex;align-items:center;gap:.35rem;color:${C.success}}
  .meta .live::before{content:"";width:6px;height:6px;border-radius:50%;background:${C.success};animation:pulse 2s ease-in-out infinite}
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}
  h2.section{font-size:.75rem;font-weight:700;color:${C.brand};text-transform:uppercase;letter-spacing:.14em;margin:2rem 0 .85rem}
  .stat-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:.75rem}
  @media(min-width:720px){.stat-grid{grid-template-columns:repeat(5,1fr)}}
  .stat{padding:1.1rem 1.25rem;border-radius:12px;background:${C.surface};border:1px solid ${C.border}}
  .stat .num{font-size:1.85rem;font-weight:700;letter-spacing:-.02em;line-height:1.05}
  .stat .label{font-size:.7rem;color:${C.fgDim};margin-top:.35rem;text-transform:uppercase;letter-spacing:.08em}
  .stat.allowed .num{color:${C.success}}.stat.denied .num{color:${C.brand}}.stat.rate_limited .num{color:${C.warning}}.stat.hosts .num{color:${C.fg}}
  .card{background:${C.surface};border:1px solid ${C.border};border-radius:12px;padding:1.5rem}
  .card-title{font-size:.9rem;font-weight:600;color:#d4d4d8;margin-bottom:1rem}
  .empty{color:${C.fgFaint};padding:2rem;text-align:center;font-style:italic;font-size:.9rem}
  .logs{width:100%;border-collapse:collapse;font-size:.82rem}
  .logs th{text-align:left;padding:.65rem .85rem;color:${C.fgFaint};font-size:.7rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;border-bottom:1px solid ${C.border}}
  .logs td{padding:.7rem .85rem;border-bottom:1px solid #1a1922;vertical-align:middle}
  .logs tr:hover td{background:#1a1922}
  .logs td.mono{font-family:ui-monospace,monospace}
  .logs td.args{color:${C.fgFaint};max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .badge{display:inline-block;padding:.12rem .55rem;border-radius:4px;font-size:.65rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase}
  .badge.allowed{background:rgba(34,197,94,.15);color:${C.success}}
  .badge.denied{background:rgba(220,20,60,.18);color:${C.brand}}
  .badge.rate_limited{background:rgba(245,158,11,.15);color:${C.warning}}
  .badge.error{background:rgba(249,115,22,.15);color:${C.error}}
  .footer{margin-top:3rem;padding-top:1.5rem;border-top:1px solid ${C.border};color:${C.fgFaint};font-size:.8rem;display:flex;justify-content:space-between}
`;

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ESC[c] ?? c);
const fmtTime = (ts: number) => {
  const d = new Date(ts);
  return d.toISOString().slice(11, 23).replace("T", "");
};
const fmtMs = (ms: number | null) => ms === null ? "—" : ms < 1 ? "<1ms" : ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(2)}s`;

function renderDonut(byOutcome: Record<Outcome, number>, size = 200): string {
  const total = byOutcome.allowed + byOutcome.denied + byOutcome.rate_limited + byOutcome.error;
  const cx = size / 2, cy = size / 2;
  const rOuter = size / 2 - 8, rInner = rOuter - 22;
  if (total === 0) {
    return `<svg viewBox="0 0 ${size} ${size}" style="max-width:${size}px;display:block;margin:0 auto"><circle cx="${cx}" cy="${cy}" r="${rOuter}" fill="none" stroke="${C.border}" stroke-width="22"/><text x="${cx}" y="${cy + 4}" text-anchor="middle" fill="${C.fgFaint}" font-size="12">no data</text></svg>`;
  }
  const order: Outcome[] = ["allowed", "denied", "rate_limited", "error"];
  let angle = -Math.PI / 2;
  let arcs = "";
  for (const o of order) {
    const count = byOutcome[o];
    if (count === 0) continue;
    const span = (count / total) * 2 * Math.PI;
    const end = angle + span;
    const largeArc = span > Math.PI ? 1 : 0;
    const x1 = cx + rOuter * Math.cos(angle), y1 = cy + rOuter * Math.sin(angle);
    const x2 = cx + rOuter * Math.cos(end), y2 = cy + rOuter * Math.sin(end);
    const x3 = cx + rInner * Math.cos(end), y3 = cy + rInner * Math.sin(end);
    const x4 = cx + rInner * Math.cos(angle), y4 = cy + rInner * Math.sin(angle);
    arcs += `<path d="M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} L ${x3.toFixed(2)} ${y3.toFixed(2)} A ${rInner} ${rInner} 0 ${largeArc} 0 ${x4.toFixed(2)} ${y4.toFixed(2)} Z" fill="${OUTCOME_COLOR[o]}"/>`;
    angle = end;
  }
  return `<svg viewBox="0 0 ${size} ${size}" style="max-width:${size}px;display:block;margin:0 auto">${arcs}<text x="${cx}" y="${cy - 4}" text-anchor="middle" fill="${C.fg}" font-size="26" font-weight="700">${total}</text><text x="${cx}" y="${cy + 16}" text-anchor="middle" fill="${C.fgDim}" font-size="10" letter-spacing="1.5">CALLS</text></svg>`;
}

export async function handleDashboard(c: Context): Promise<Response> {
  const key = c.req.query("key");
  if (!key) {
    return c.html(loginPage(), 401);
  }
  const auth = await findOrgByApiKey(key);
  if (!auth) {
    return c.html(loginPage("Invalid API key. Get one from the CLI: <code>npx trabecc-cloud-admin create-key</code>"), 401);
  }

  await ensureSchema();
  // Plan-cap the dashboard window so free-tier users can't accidentally
  // query the whole 90-day Pro retention window for free.
  const org = await getOrg(auth.orgId);
  const plan = org?.plan ?? "free";
  const limits = PLANS[plan];
  const requestedWindow = Math.max(1, Number(c.req.query("windowMinutes") ?? 60));
  const windowMinutes = Math.min(requestedWindow, limits.maxQueryWindowMinutes);
  const windowCapped = windowMinutes < requestedWindow;
  const sinceMs = Date.now() - windowMinutes * 60_000;

  const [stats, events, hosts, eventsToday] = await Promise.all([
    statsForOrg(auth.orgId, sinceMs),
    recentEvents(auth.orgId, 50),
    countActiveHosts(auth.orgId),
    countEventsToday(auth.orgId),
  ]);

  const hostsPct = Math.min(100, Math.round((hosts / limits.maxHosts) * 100));
  const eventsPct = Math.min(100, Math.round((eventsToday / limits.maxEventsPerDay) * 100));
  const showUpgrade = plan !== "enterprise" && (hostsPct >= 70 || eventsPct >= 70 || windowCapped);
  const upgrade = nextTierUpgradeUrl(plan);
  // Append client_reference_id to Stripe Payment Links so the webhook can
  // match the payment back to this org without an email lookup. mailto:
  // upgrade URLs (team/enterprise) are left untouched.
  const upgradeHref = upgrade.url.startsWith("https://buy.stripe.com/")
    ? `${upgrade.url}?client_reference_id=${encodeURIComponent(auth.orgId)}${org?.email ? `&prefilled_email=${encodeURIComponent(org.email)}` : ""}`
    : upgrade.url;

  const planBanner = `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:1rem;padding:.85rem 1.25rem;margin-bottom:1.5rem;background:${showUpgrade ? "rgba(220,20,60,.08)" : C.surface};border:1px solid ${showUpgrade ? "rgba(220,20,60,.3)" : C.border};border-radius:10px;font-size:.85rem;flex-wrap:wrap">
      <div style="display:flex;gap:1.5rem;align-items:center;flex-wrap:wrap">
        <span style="background:${plan === "free" ? C.fgFaint : C.brand};color:#fff;padding:.2rem .6rem;border-radius:4px;font-size:.7rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase">${esc(plan)}</span>
        <span style="color:${C.fgDim}"><strong style="color:${C.fg}">${hosts}/${limits.maxHosts}</strong> hosts (7d)</span>
        <span style="color:${C.fgDim}"><strong style="color:${C.fg}">${eventsToday.toLocaleString()}/${limits.maxEventsPerDay.toLocaleString()}</strong> events today</span>
        <span style="color:${C.fgDim}">retention: <strong style="color:${C.fg}">${limits.retentionDays}d</strong></span>
      </div>
      ${plan !== "enterprise" ? `<a href="${esc(upgradeHref)}" style="background:${C.brand};color:#fff;padding:.4rem .9rem;border-radius:6px;font-weight:600;font-size:.8rem;text-decoration:none">${showUpgrade ? "Upgrade to " + upgrade.toPlan + " →" : "Manage plan"}</a>` : ""}
    </div>
    ${windowCapped ? `<div style="padding:.6rem 1rem;margin-bottom:1rem;background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.3);border-radius:8px;font-size:.8rem;color:#f59e0b">Showing capped to ${limits.retentionDays}d (${plan} plan limit). <a href="${esc(upgradeHref)}" style="color:#f59e0b;text-decoration:underline">Upgrade</a> to query further back.</div>` : ""}
  `;

  const statCards = [
    { label: "Total calls", value: String(stats.total), cls: "" },
    { label: "Allowed", value: String(stats.byOutcome.allowed), cls: "allowed" },
    { label: "Denied", value: String(stats.byOutcome.denied), cls: "denied" },
    { label: "Rate limited", value: String(stats.byOutcome.rate_limited), cls: "rate_limited" },
    { label: "Hosts", value: String(stats.hostCount), cls: "hosts" },
  ].map((s) => `<div class="stat ${s.cls}"><div class="num">${esc(s.value)}</div><div class="label">${esc(s.label)}</div></div>`).join("");

  const recentBlock = events.length === 0
    ? `<div class="empty">no events received yet — start the OSS gateway with cloud.apiKey set</div>`
    : `<table class="logs">
        <thead><tr><th>Time</th><th>Tool</th><th>Host</th><th>Agent</th><th>Args</th><th>Outcome</th><th style="text-align:right">Duration</th></tr></thead>
        <tbody>${events.map((e) => `<tr>
          <td class="mono">${esc(fmtTime(e.ts))}</td>
          <td><code>${esc(e.qualifiedName)}</code></td>
          <td class="mono" style="color:${C.fgDim}">${esc(e.hostId.slice(0, 12))}</td>
          <td class="mono">${esc(e.agentId ?? "—")}</td>
          <td class="args mono" title="${esc(e.argsJson)}">${esc(e.argsJson)}</td>
          <td><span class="badge ${esc(e.outcome)}">${esc(e.outcome.replace("_", " "))}</span></td>
          <td class="mono" style="text-align:right">${esc(fmtMs(e.durationMs))}</td>
        </tr>`).join("")}</tbody>
      </table>`;

  const html = `<!doctype html>
<html><head>
  <meta charset="utf-8"/>
  <meta http-equiv="refresh" content="10"/>
  <meta name="theme-color" content="#dc143c"/>
  <title>Trabecc Cloud — admin</title>
  <style>${STYLE}</style>
</head><body><div class="container">
  <header>
    <div class="brand">
      <div class="mark">T</div>
      <div>
        <h1>Trabecc Cloud</h1>
        <div class="sub">multi-host audit · org <code>${esc(auth.orgId)}</code></div>
      </div>
    </div>
    <div class="meta">
      <div class="live">live</div>
      <div>refreshing every 10s</div>
    </div>
  </header>

  ${planBanner}

  <h2 class="section">Last ${windowMinutes >= 1440 ? `${windowMinutes / 1440}d` : windowMinutes >= 60 ? `${windowMinutes / 60}h` : `${windowMinutes}m`} across all hosts</h2>
  <div class="stat-grid">${statCards}</div>

  <h2 class="section">Outcome distribution</h2>
  <div class="card">${renderDonut(stats.byOutcome)}</div>

  <h2 class="section">Recent events (across all hosts)</h2>
  <div class="card" style="padding:.25rem .5rem">${recentBlock}</div>

  <div class="footer">
    <div>Trabecc Cloud · v0.2.0</div>
    <div><a href="?windowMinutes=60&key=${esc(key)}">1H</a> · <a href="?windowMinutes=360&key=${esc(key)}">6H</a> · <a href="?windowMinutes=1440&key=${esc(key)}">24H</a> · <a href="?windowMinutes=10080&key=${esc(key)}">7D</a></div>
  </div>
</div></body></html>`;

  return c.html(html);
}

function loginPage(error?: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"/><title>Trabecc Cloud — sign in</title><style>${STYLE}
  .login{max-width:480px;margin:6rem auto;padding:2.5rem;background:${C.surface};border:1px solid ${C.border};border-radius:14px}
  .login h1{margin:0 0 .5rem;font-size:1.4rem}
  .login p{color:${C.fgDim};margin:0 0 1.5rem;font-size:.95rem}
  .login .err{color:${C.brand};background:rgba(220,20,60,.1);padding:.75rem 1rem;border-radius:8px;margin-bottom:1rem;font-size:.9rem}
  .login form{display:flex;gap:.5rem}
  .login input{flex:1;padding:.7rem 1rem;background:#0d0c12;border:1px solid ${C.border};border-radius:8px;color:${C.fg};font-family:ui-monospace,monospace;font-size:.85rem}
  .login input:focus{outline:none;border-color:${C.brand}}
  .login button{padding:.7rem 1.25rem;background:${C.brand};color:#fff;border:0;border-radius:8px;font-weight:600;cursor:pointer}
  .login button:hover{background:#9f0d2c}
  </style></head><body><div class="login">
  <h1>Trabecc Cloud</h1>
  <p>Enter your API key to view your org's audit dashboard.</p>
  ${error ? `<div class="err">${error}</div>` : ""}
  <form method="get">
    <input type="text" name="key" placeholder="tk_live_..." autofocus required/>
    <button type="submit">Sign in</button>
  </form>
  </div></body></html>`;
}
