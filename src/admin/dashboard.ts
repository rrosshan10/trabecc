// Server-rendered HTML dashboard. Plain template strings so we stay
// zero-build (Node 24 strips TS types but does not transform JSX).
//
// Deliberately small: the cloud product owns the polished UX. The OSS
// dashboard exists to make `trabecc admin` immediately legible to a
// first-time user without booting a separate frontend.

import type { Config } from "../config.ts";
import type { AuditRecord } from "../types.ts";

const STYLE = `
  * { box-sizing: border-box; }
  body { font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
         max-width: 1200px; margin: 1.5rem auto; padding: 0 1.25rem; color: #e5e7eb; background: #0b0d10; }
  h1 { font-size: 1.5rem; margin: 0 0 .25rem; color: #fff; letter-spacing: -.01em; }
  h2 { font-size: 1rem; margin: 1.5rem 0 .75rem; color: #93c5fd; text-transform: uppercase; letter-spacing: .08em; }
  .sub { color: #9ca3af; font-size: .85rem; margin-bottom: 1.25rem; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: .75rem; margin-bottom: 1.5rem; }
  .card { background: #11151a; border: 1px solid #1f2937; border-radius: 8px; padding: 1rem; }
  .stat-num { font-size: 1.75rem; font-weight: 600; color: #fff; line-height: 1; }
  .stat-label { font-size: .75rem; color: #9ca3af; margin-top: .35rem; text-transform: uppercase; letter-spacing: .06em; }
  .stat-allowed .stat-num { color: #34d399; }
  .stat-denied .stat-num { color: #f87171; }
  .stat-rl .stat-num { color: #fbbf24; }
  .stat-error .stat-num { color: #fb7185; }
  table { width: 100%; border-collapse: collapse; font-size: .85rem; }
  th { text-align: left; padding: .5rem .75rem; color: #9ca3af; font-weight: 500; border-bottom: 1px solid #1f2937; }
  td { padding: .5rem .75rem; border-bottom: 1px solid #11151a; vertical-align: top; }
  tr:hover td { background: #0f1318; }
  .badge { display: inline-block; padding: .15rem .5rem; border-radius: 4px; font-size: .7rem; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; }
  .b-allowed { background: rgba(52, 211, 153, .15); color: #34d399; }
  .b-denied { background: rgba(248, 113, 113, .15); color: #f87171; }
  .b-rate_limited { background: rgba(251, 191, 36, .15); color: #fbbf24; }
  .b-error { background: rgba(251, 113, 133, .15); color: #fb7185; }
  code, .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .8rem; }
  .args { color: #6b7280; max-width: 360px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  header { display: flex; justify-content: space-between; align-items: baseline; }
  .footer { margin-top: 2rem; color: #6b7280; font-size: .8rem; text-align: center; }
  .empty { color: #6b7280; padding: 1rem; text-align: center; font-style: italic; }
`;

export type DashboardStats = {
  total: number;
  byOutcome: Record<AuditRecord["outcome"], number>;
  topTools: Array<{ qualifiedName: string; count: number }>;
};

const ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ESCAPE_MAP[c] ?? c);
}

export function renderDashboard(props: {
  config: Config;
  records: AuditRecord[];
  stats: DashboardStats;
  windowMinutes: number;
  refreshSeconds: number;
}): string {
  const { config, records, stats, windowMinutes, refreshSeconds } = props;

  const statCards = [
    { label: "Total calls", value: stats.total, cls: "" },
    { label: "Allowed", value: stats.byOutcome.allowed, cls: "stat-allowed" },
    { label: "Denied", value: stats.byOutcome.denied, cls: "stat-denied" },
    { label: "Rate limited", value: stats.byOutcome.rate_limited, cls: "stat-rl" },
    { label: "Errored", value: stats.byOutcome.error, cls: "stat-error" },
  ]
    .map(
      (s) => `<div class="card ${s.cls}"><div class="stat-num">${escapeHtml(s.value)}</div><div class="stat-label">${escapeHtml(s.label)}</div></div>`,
    )
    .join("");

  const topToolsTable = stats.topTools.length === 0
    ? `<div class="card empty">no calls in this window</div>`
    : `<div class="card"><table>
        <thead><tr><th>Tool</th><th style="text-align:right; width:100px;">Calls</th></tr></thead>
        <tbody>${stats.topTools
          .map(
            (t) =>
              `<tr><td><code>${escapeHtml(t.qualifiedName)}</code></td><td style="text-align:right;" class="mono">${escapeHtml(t.count)}</td></tr>`,
          )
          .join("")}</tbody>
      </table></div>`;

  const recentTable = records.length === 0
    ? `<div class="card empty">no audit records yet — make some MCP tool calls and they'll show up here</div>`
    : `<div class="card"><table>
        <thead><tr>
          <th style="width:130px;">Time</th>
          <th>Tool</th>
          <th>Agent</th>
          <th>Args</th>
          <th style="width:100px;">Outcome</th>
          <th style="width:70px; text-align:right;">ms</th>
        </tr></thead>
        <tbody>${records
          .map(
            (r) =>
              `<tr>
                <td class="mono">${escapeHtml(formatTime(r.ts))}</td>
                <td><code>${escapeHtml(r.qualifiedName)}</code></td>
                <td class="mono">${escapeHtml(r.agentId ?? "—")}</td>
                <td class="args mono" title="${escapeHtml(r.argsJson)}">${escapeHtml(r.argsJson)}</td>
                <td><span class="badge b-${escapeHtml(r.outcome)}">${escapeHtml(r.outcome.replace("_", " "))}</span></td>
                <td style="text-align:right;" class="mono">${escapeHtml(r.durationMs ?? "—")}</td>
              </tr>`,
          )
          .join("")}</tbody>
      </table></div>`;

  return `<!doctype html>
<html><head>
  <meta charset="utf-8" />
  <meta http-equiv="refresh" content="${refreshSeconds}" />
  <title>Trabecc</title>
  <style>${STYLE}</style>
</head><body>
  <header>
    <div style="display:flex; align-items:center; gap:0.75rem;">
      <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style="width:36px; height:36px; flex-shrink:0;">
        <rect width="64" height="64" rx="14" fill="#11151a" stroke="#1f2937" stroke-width="1"/>
        <rect x="12" y="14" width="40" height="7" rx="2" fill="#93c5fd"/>
        <rect x="28.5" y="14" width="7" height="36" rx="1.5" fill="#93c5fd"/>
        <rect x="20" y="46" width="24" height="5" rx="1.5" fill="#93c5fd" opacity="0.65"/>
      </svg>
      <div>
        <h1 style="margin:0;">Trabecc</h1>
        <div class="sub" style="margin:0;">
          gateway for MCP · default policy: <code>${escapeHtml(config.defaultPolicy)}</code> ·
          ${config.servers.length} upstream${config.servers.length === 1 ? "" : "s"} ·
          ${config.rules.length} rule${config.rules.length === 1 ? "" : "s"}
        </div>
      </div>
    </div>
    <div class="sub">last ${windowMinutes}m · refreshing every ${refreshSeconds}s</div>
  </header>

  <h2>Activity (last ${windowMinutes}m)</h2>
  <div class="grid">${statCards}</div>

  <h2>Top tools</h2>
  ${topToolsTable}

  <h2>Recent calls</h2>
  ${recentTable}

  <div class="footer">Trabecc v0.1.0 · MIT · <a style="color:#9ca3af;" href="/api/audit">/api/audit</a></div>
</body></html>`;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toTimeString().slice(0, 8) + "." + String(d.getMilliseconds()).padStart(3, "0");
}
