// Server-rendered HTML dashboard. Plain template strings + inline SVG charts.
// No JS framework, no client-side rendering — page reloads via meta-refresh.
//
// Sections:
//   1. Header (logo, status, time range)
//   2. Stat cards (totals + p95 latency)
//   3. Activity over time (stacked bar chart by outcome)
//   4. Outcome donut + Top tools bar chart (side-by-side)
//   5. Latency histogram (calls bucketed by duration)
//   6. Recent calls (logs table) with inline duration bars (lightweight trace)

import type { Config } from "../config.ts";
import type { AuditRecord } from "../types.ts";

const STYLE = `
  :root {
    --bg: #0a0a0c;
    --bg-2: #131218;
    --bg-3: #1a1922;
    --surface: #16161e;
    --border: #27262e;
    --border-strong: #3a3942;
    --fg: #fafafa;
    --fg-2: #d4d4d8;
    --fg-dim: #a1a1aa;
    --fg-faint: #71717a;
    --brand: #dc143c;
    --brand-dark: #9f0d2c;
    --brand-glow: rgba(220, 20, 60, 0.18);
    --brand-soft: rgba(220, 20, 60, 0.08);
    --success: #22c55e;
    --warning: #f59e0b;
    --error: #f97316;
    --code-bg: #0d0c12;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif;
    background: var(--bg); color: var(--fg);
    -webkit-font-smoothing: antialiased;
    line-height: 1.5;
  }
  .container { max-width: 1320px; margin: 0 auto; padding: 1.5rem 1.25rem 4rem; }
  a { color: var(--brand); text-decoration: none; }
  a:hover { color: #ec4664; }
  code, .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .85em; }

  /* HEADER */
  header.dash-head {
    display: flex; justify-content: space-between; align-items: flex-start;
    padding-bottom: 1.5rem; border-bottom: 1px solid var(--border); margin-bottom: 1.75rem;
  }
  .head-brand { display: flex; align-items: center; gap: .85rem; }
  .head-brand .mark {
    width: 40px; height: 40px; border-radius: 10px; background: var(--brand);
    display: grid; place-items: center; font-weight: 800; color: #fff;
    font-size: 1.4rem; flex-shrink: 0;
  }
  .head-brand h1 { margin: 0; font-size: 1.4rem; font-weight: 700; letter-spacing: -.015em; color: #fff; }
  .head-brand .sub { color: var(--fg-dim); font-size: .85rem; margin-top: .15rem; }
  .head-brand .sub code { color: var(--fg-2); background: var(--bg-3); padding: 1px 6px; border-radius: 4px; }
  .head-meta { color: var(--fg-faint); font-size: .8rem; text-align: right; line-height: 1.7; }
  .head-meta .live { display: inline-flex; align-items: center; gap: .35rem; color: var(--success); }
  .head-meta .live::before {
    content: ""; width: 6px; height: 6px; border-radius: 50%;
    background: var(--success); animation: pulse 2s ease-in-out infinite;
    box-shadow: 0 0 6px var(--success);
  }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: .35; } }

  /* SECTION HEADER */
  h2.section { font-size: .75rem; font-weight: 700; color: var(--brand);
    text-transform: uppercase; letter-spacing: .14em; margin: 2rem 0 .85rem; }

  /* STAT CARDS */
  .stat-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: .75rem; }
  @media (min-width: 720px) { .stat-grid { grid-template-columns: repeat(5, 1fr); } }
  .stat {
    padding: 1.1rem 1.25rem; border-radius: 12px;
    background: var(--surface); border: 1px solid var(--border);
    transition: border-color .15s ease;
  }
  .stat:hover { border-color: var(--border-strong); }
  .stat .num { font-size: 1.85rem; font-weight: 700; color: var(--fg); letter-spacing: -.02em; line-height: 1.05; }
  .stat .label { font-size: .7rem; color: var(--fg-dim); margin-top: .35rem;
    text-transform: uppercase; letter-spacing: .08em; }
  .stat.allowed .num { color: var(--success); }
  .stat.denied .num { color: var(--brand); }
  .stat.rate_limited .num { color: var(--warning); }
  .stat.error .num { color: var(--error); }

  /* CHART CARDS */
  .card {
    background: var(--surface); border: 1px solid var(--border);
    border-radius: 12px; padding: 1.5rem;
  }
  .card .card-head { display: flex; justify-content: space-between; align-items: baseline;
    margin-bottom: 1.1rem; }
  .card .card-title { font-size: .9rem; font-weight: 600; color: var(--fg-2); }
  .card .card-sub { font-size: .75rem; color: var(--fg-faint); }
  .empty { color: var(--fg-faint); padding: 2rem; text-align: center; font-style: italic; font-size: .9rem; }

  .chart-row { display: grid; grid-template-columns: 1fr; gap: .75rem; }
  @media (min-width: 1024px) { .chart-row.split { grid-template-columns: 1fr 1.4fr; } }

  /* CHART SVGs */
  svg.chart { width: 100%; height: auto; display: block; }

  /* DONUT LEGEND */
  .legend { display: flex; flex-direction: column; gap: .5rem; margin-top: 1rem; font-size: .8rem; }
  .legend .item { display: flex; align-items: center; gap: .5rem; color: var(--fg-2); }
  .legend .swatch { width: 10px; height: 10px; border-radius: 2px; flex-shrink: 0; }
  .legend .count { margin-left: auto; color: var(--fg-dim); font-family: ui-monospace, monospace; }

  /* TOP TOOLS LIST */
  .tools-list { display: flex; flex-direction: column; gap: .55rem; }
  .tool-row { display: grid; grid-template-columns: 1fr auto; gap: .5rem;
    align-items: center; font-size: .85rem; }
  .tool-row .name { color: var(--fg-2); font-family: ui-monospace, monospace; font-size: .8rem;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tool-row .meter {
    grid-column: 1 / -1;
    height: 6px; background: var(--bg-3); border-radius: 3px; overflow: hidden;
  }
  .tool-row .meter > span {
    display: block; height: 100%;
    background: linear-gradient(90deg, var(--brand) 0%, #ec4664 100%);
    border-radius: 3px;
  }
  .tool-row .count { color: var(--fg-dim); font-family: ui-monospace, monospace; font-size: .8rem; }

  /* LOGS TABLE */
  .logs { width: 100%; border-collapse: collapse; font-size: .82rem; }
  .logs th { text-align: left; padding: .65rem .85rem;
    color: var(--fg-faint); font-size: .7rem; font-weight: 600; letter-spacing: .08em;
    text-transform: uppercase; border-bottom: 1px solid var(--border); }
  .logs th.right { text-align: right; }
  .logs td { padding: .7rem .85rem; border-bottom: 1px solid var(--bg-3); vertical-align: middle; }
  .logs tr:hover td { background: var(--bg-3); }
  .logs td.mono { font-family: ui-monospace, monospace; }
  .logs td.args { color: var(--fg-faint); max-width: 320px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .logs td.right { text-align: right; }

  /* DURATION TRACE BAR (mini per-row "trace") */
  .duration-bar {
    display: inline-flex; align-items: center; gap: .35rem;
    width: 90px; justify-content: flex-end;
  }
  .duration-bar .bar {
    flex: 1; height: 4px; background: var(--bg-3); border-radius: 2px; overflow: hidden;
  }
  .duration-bar .bar > span {
    display: block; height: 100%;
    background: var(--success); border-radius: 2px;
  }
  .duration-bar.slow .bar > span { background: var(--warning); }
  .duration-bar.slower .bar > span { background: var(--error); }
  .duration-bar .ms { font-family: ui-monospace, monospace; font-size: .75rem;
    color: var(--fg-dim); min-width: 42px; text-align: right; }

  /* OUTCOME BADGES */
  .badge { display: inline-block; padding: .12rem .55rem; border-radius: 4px;
    font-size: .65rem; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
  .badge.allowed { background: rgba(34, 197, 94, .15); color: var(--success); }
  .badge.denied { background: var(--brand-glow); color: var(--brand); }
  .badge.rate_limited { background: rgba(245, 158, 11, .15); color: var(--warning); }
  .badge.error { background: rgba(249, 115, 22, .15); color: var(--error); }

  /* TIME RANGE PILL */
  .time-range { display: inline-flex; gap: 0; border: 1px solid var(--border);
    border-radius: 8px; overflow: hidden; background: var(--surface); }
  .time-range a {
    padding: .35rem .85rem; color: var(--fg-dim);
    font-size: .75rem; font-weight: 600;
    border-right: 1px solid var(--border);
    transition: background .12s ease, color .12s ease;
  }
  .time-range a:last-child { border-right: 0; }
  .time-range a:hover { background: var(--bg-3); color: var(--fg); }
  .time-range a.active { background: var(--brand); color: #fff; }

  .footer { margin-top: 3rem; padding-top: 1.5rem; border-top: 1px solid var(--border);
    color: var(--fg-faint); font-size: .8rem; display: flex; justify-content: space-between; }
`;

// ---------- color tokens used in inline SVG ----------
const C = {
  bg3: "#1a1922",
  border: "#27262e",
  borderStrong: "#3a3942",
  fg: "#fafafa",
  fgDim: "#a1a1aa",
  fgFaint: "#71717a",
  brand: "#dc143c",
  success: "#22c55e",
  warning: "#f59e0b",
  error: "#f97316",
};
const OUTCOME_COLORS: Record<AuditRecord["outcome"], string> = {
  allowed: C.success,
  denied: C.brand,
  rate_limited: C.warning,
  error: C.error,
};
const OUTCOME_LABELS: Record<AuditRecord["outcome"], string> = {
  allowed: "Allowed",
  denied: "Denied",
  rate_limited: "Rate limited",
  error: "Errored",
};

// ---------- types passed in from server.ts ----------

export type DashboardStats = {
  total: number;
  byOutcome: Record<AuditRecord["outcome"], number>;
  topTools: Array<{ qualifiedName: string; count: number }>;
};

export type DashboardData = {
  config: Config;
  records: AuditRecord[];
  stats: DashboardStats;
  timeSeries: Array<{
    bucketStart: number;
    allowed: number;
    denied: number;
    rate_limited: number;
    error: number;
  }>;
  latencyHistogram: Array<{ minMs: number; maxMs: number | null; count: number }>;
  latency: { p50: number; p95: number; p99: number; count: number };
  windowMinutes: number;
  refreshSeconds: number;
};

// ---------- HTML escape ----------
const ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
};
export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ESCAPE_MAP[c] ?? c);
}

// ---------- helpers ----------
function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toTimeString().slice(0, 8) + "." + String(d.getMilliseconds()).padStart(3, "0");
}
function formatMs(ms: number | null): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1) return "<1ms";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}
function formatBucket(b: { minMs: number; maxMs: number | null }): string {
  if (b.maxMs === null) return `≥${b.minMs}ms`;
  if (b.minMs === 0) return `<${b.maxMs}ms`;
  return `${b.minMs}-${b.maxMs}ms`;
}

// ============================================================
// CHART RENDERERS — pure SVG, server-side math
// ============================================================

/** Stacked bar chart of calls/bucket, segmented by outcome. */
function renderTimeSeriesChart(
  series: DashboardData["timeSeries"],
  width = 1200,
  height = 240,
): string {
  const padL = 44, padR = 16, padT = 24, padB = 28;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const totals = series.map((p) => p.allowed + p.denied + p.rate_limited + p.error);
  const max = Math.max(1, ...totals);
  const niceMax = Math.ceil(max / 5) * 5 || 1;

  const slot = plotW / Math.max(1, series.length);
  const barW = Math.max(1, slot * 0.78);
  const barOff = (slot - barW) / 2;

  let bars = "";
  series.forEach((p, i) => {
    const x = padL + i * slot + barOff;
    let yBottom = padT + plotH;
    const segs: Array<[AuditRecord["outcome"], number]> = [
      ["allowed", p.allowed],
      ["denied", p.denied],
      ["rate_limited", p.rate_limited],
      ["error", p.error],
    ];
    for (const [outcome, count] of segs) {
      if (count <= 0) continue;
      const segH = (count / niceMax) * plotH;
      bars += `<rect x="${x.toFixed(1)}" y="${(yBottom - segH).toFixed(1)}" width="${barW.toFixed(1)}" height="${segH.toFixed(1)}" fill="${OUTCOME_COLORS[outcome]}" rx="1"/>`;
      yBottom -= segH;
    }
  });

  // Y-axis grid + labels (3 levels: 0, mid, max)
  const grid = [0, niceMax / 2, niceMax]
    .map((v) => {
      const y = padT + plotH - (v / niceMax) * plotH;
      return `
        <line x1="${padL}" y1="${y}" x2="${padL + plotW}" y2="${y}" stroke="${C.border}" stroke-dasharray="2 3" opacity="0.6"/>
        <text x="${padL - 8}" y="${y + 3}" text-anchor="end" fill="${C.fgFaint}" font-size="10" font-family="ui-monospace, monospace">${v}</text>
      `;
    })
    .join("");

  // X-axis labels (now-Nm)
  const ticks = [0, Math.floor(series.length / 2), series.length - 1]
    .filter((i) => i >= 0 && i < series.length)
    .map((i) => {
      const x = padL + i * slot + slot / 2;
      const minutesAgo = Math.round((Date.now() - series[i]!.bucketStart) / 60000);
      return `<text x="${x}" y="${padT + plotH + 18}" text-anchor="middle" fill="${C.fgFaint}" font-size="10" font-family="ui-monospace, monospace">${minutesAgo === 0 ? "now" : `-${minutesAgo}m`}</text>`;
    })
    .join("");

  return `<svg class="chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
    ${grid}
    ${bars}
    ${ticks}
  </svg>`;
}

/** Outcome distribution donut chart. */
function renderDonut(byOutcome: Record<AuditRecord["outcome"], number>, size = 200): string {
  const total = byOutcome.allowed + byOutcome.denied + byOutcome.rate_limited + byOutcome.error;
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = size / 2 - 8;
  const rInner = rOuter - 22;

  if (total === 0) {
    return `<svg class="chart" viewBox="0 0 ${size} ${size}" style="max-width:${size}px;">
      <circle cx="${cx}" cy="${cy}" r="${rOuter}" fill="none" stroke="${C.border}" stroke-width="22"/>
      <text x="${cx}" y="${cy + 4}" text-anchor="middle" fill="${C.fgFaint}" font-size="12">no data</text>
    </svg>`;
  }

  const order: AuditRecord["outcome"][] = ["allowed", "denied", "rate_limited", "error"];
  let angle = -Math.PI / 2;
  let arcs = "";
  for (const outcome of order) {
    const count = byOutcome[outcome];
    if (count === 0) continue;
    const span = (count / total) * 2 * Math.PI;
    const end = angle + span;
    const largeArc = span > Math.PI ? 1 : 0;

    const x1 = cx + rOuter * Math.cos(angle);
    const y1 = cy + rOuter * Math.sin(angle);
    const x2 = cx + rOuter * Math.cos(end);
    const y2 = cy + rOuter * Math.sin(end);
    const x3 = cx + rInner * Math.cos(end);
    const y3 = cy + rInner * Math.sin(end);
    const x4 = cx + rInner * Math.cos(angle);
    const y4 = cy + rInner * Math.sin(angle);

    const d =
      `M ${x1.toFixed(2)} ${y1.toFixed(2)} ` +
      `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} ` +
      `L ${x3.toFixed(2)} ${y3.toFixed(2)} ` +
      `A ${rInner} ${rInner} 0 ${largeArc} 0 ${x4.toFixed(2)} ${y4.toFixed(2)} Z`;
    arcs += `<path d="${d}" fill="${OUTCOME_COLORS[outcome]}"/>`;
    angle = end;
  }

  return `<svg class="chart" viewBox="0 0 ${size} ${size}" style="max-width:${size}px; margin: 0 auto; display:block;">
    ${arcs}
    <text x="${cx}" y="${cy - 4}" text-anchor="middle" fill="${C.fg}" font-size="26" font-weight="700" letter-spacing="-0.5">${total}</text>
    <text x="${cx}" y="${cy + 16}" text-anchor="middle" fill="${C.fgDim}" font-size="10" letter-spacing="1.5">CALLS</text>
  </svg>`;
}

/** Vertical-bar latency histogram. */
function renderLatencyHistogram(
  histogram: DashboardData["latencyHistogram"],
  width = 1200,
  height = 200,
): string {
  const padL = 44, padR = 16, padT = 20, padB = 36;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const max = Math.max(1, ...histogram.map((b) => b.count));
  const niceMax = Math.ceil(max / 5) * 5 || 1;

  const slot = plotW / histogram.length;
  const barW = slot * 0.7;
  const barOff = (slot - barW) / 2;

  let bars = "";
  let labels = "";
  histogram.forEach((b, i) => {
    const x = padL + i * slot + barOff;
    const h = (b.count / niceMax) * plotH;
    const y = padT + plotH - h;
    // Color bars by latency band: green → amber → orange → red as they get slower
    const color = b.maxMs === null
      ? C.brand
      : b.maxMs <= 1
        ? C.success
        : b.maxMs <= 100
          ? C.success
          : b.maxMs <= 1000
            ? C.warning
            : C.error;
    bars += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" fill="${color}" rx="2"/>`;
    if (b.count > 0) {
      bars += `<text x="${(x + barW / 2).toFixed(1)}" y="${(y - 6).toFixed(1)}" text-anchor="middle" fill="${C.fg}" font-size="11" font-family="ui-monospace, monospace" font-weight="600">${b.count}</text>`;
    }
    labels += `<text x="${(padL + i * slot + slot / 2).toFixed(1)}" y="${(padT + plotH + 18).toFixed(1)}" text-anchor="middle" fill="${C.fgDim}" font-size="10.5" font-family="ui-monospace, monospace">${formatBucket(b)}</text>`;
  });

  return `<svg class="chart" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
    <line x1="${padL}" y1="${padT + plotH}" x2="${padL + plotW}" y2="${padT + plotH}" stroke="${C.border}"/>
    ${bars}
    ${labels}
  </svg>`;
}

/** Per-row "trace" mini-bar showing this call's duration relative to p99. */
function renderDurationTrace(durationMs: number | null, p99: number): string {
  if (durationMs === null || durationMs === undefined)
    return `<div class="duration-bar"><span class="bar"><span style="width:0%"></span></span><span class="ms">—</span></div>`;
  const max = Math.max(p99, 1);
  const widthPct = Math.min(100, (durationMs / max) * 100);
  const cls = durationMs >= 1000 ? "slower" : durationMs >= 100 ? "slow" : "";
  return `<div class="duration-bar ${cls}"><span class="bar"><span style="width:${widthPct.toFixed(1)}%"></span></span><span class="ms">${escapeHtml(formatMs(durationMs))}</span></div>`;
}

// ============================================================
// MAIN RENDER
// ============================================================

export function renderDashboard(props: DashboardData): string {
  const { config, records, stats, timeSeries, latencyHistogram, latency, windowMinutes, refreshSeconds } = props;

  const statCards = [
    { label: "Total calls", value: String(stats.total), cls: "" },
    { label: "Allowed", value: String(stats.byOutcome.allowed), cls: "allowed" },
    { label: "Denied", value: String(stats.byOutcome.denied), cls: "denied" },
    { label: "Rate limited", value: String(stats.byOutcome.rate_limited), cls: "rate_limited" },
    { label: `p95 latency`, value: formatMs(latency.p95), cls: "" },
  ]
    .map(
      (s) =>
        `<div class="stat ${s.cls}"><div class="num">${escapeHtml(s.value)}</div><div class="label">${escapeHtml(s.label)}</div></div>`,
    )
    .join("");

  // Time-range buttons (sets ?windowMinutes=)
  const ranges = [
    { label: "1H", minutes: 60 },
    { label: "6H", minutes: 360 },
    { label: "24H", minutes: 1440 },
    { label: "7D", minutes: 10080 },
  ];
  const rangeButtons = ranges
    .map(
      (r) =>
        `<a href="?windowMinutes=${r.minutes}" class="${r.minutes === windowMinutes ? "active" : ""}">${r.label}</a>`,
    )
    .join("");

  // Donut + legend block
  const totalForDonut = stats.byOutcome.allowed + stats.byOutcome.denied +
    stats.byOutcome.rate_limited + stats.byOutcome.error;
  const legendItems = (["allowed", "denied", "rate_limited", "error"] as const)
    .map((o) => {
      const count = stats.byOutcome[o];
      const pct = totalForDonut > 0 ? Math.round((count / totalForDonut) * 100) : 0;
      return `<div class="item">
        <span class="swatch" style="background:${OUTCOME_COLORS[o]};"></span>
        <span>${OUTCOME_LABELS[o]}</span>
        <span class="count">${count} · ${pct}%</span>
      </div>`;
    })
    .join("");

  // Top tools list
  const maxToolCount = Math.max(1, ...stats.topTools.map((t) => t.count));
  const toolsBlock = stats.topTools.length === 0
    ? `<div class="empty">no calls in this window</div>`
    : `<div class="tools-list">${stats.topTools
        .slice(0, 8)
        .map(
          (t) => {
            const pct = (t.count / maxToolCount) * 100;
            return `<div class="tool-row">
              <span class="name">${escapeHtml(t.qualifiedName)}</span>
              <span class="count">${t.count}</span>
              <span class="meter"><span style="width:${pct.toFixed(1)}%"></span></span>
            </div>`;
          },
        )
        .join("")}</div>`;

  // Recent calls table
  const recentBlock = records.length === 0
    ? `<div class="empty">no audit records yet — make some MCP tool calls and they'll show up here</div>`
    : `<table class="logs">
        <thead>
          <tr>
            <th style="width: 110px;">Time</th>
            <th>Tool</th>
            <th style="width: 130px;">Agent</th>
            <th>Args</th>
            <th style="width: 100px;">Outcome</th>
            <th class="right" style="width: 110px;">Duration</th>
          </tr>
        </thead>
        <tbody>${records
          .map(
            (r) =>
              `<tr>
                <td class="mono">${escapeHtml(formatTime(r.ts))}</td>
                <td><code>${escapeHtml(r.qualifiedName)}</code></td>
                <td class="mono">${escapeHtml(r.agentId ?? "—")}</td>
                <td class="args mono" title="${escapeHtml(r.argsJson)}">${escapeHtml(r.argsJson)}</td>
                <td><span class="badge ${escapeHtml(r.outcome)}">${escapeHtml(r.outcome.replace("_", " "))}</span></td>
                <td class="right">${renderDurationTrace(r.durationMs, latency.p99 || 1)}</td>
              </tr>`,
          )
          .join("")}</tbody>
      </table>`;

  return `<!doctype html>
<html><head>
  <meta charset="utf-8" />
  <meta http-equiv="refresh" content="${refreshSeconds}" />
  <meta name="theme-color" content="#dc143c" />
  <title>Trabecc — admin</title>
  <style>${STYLE}</style>
</head><body>
  <div class="container">
    <header class="dash-head">
      <div class="head-brand">
        <div class="mark">T</div>
        <div>
          <h1>Trabecc</h1>
          <div class="sub">
            gateway for MCP · default policy: <code>${escapeHtml(config.defaultPolicy)}</code> ·
            ${config.servers.length} upstream${config.servers.length === 1 ? "" : "s"} ·
            ${config.rules.length} rule${config.rules.length === 1 ? "" : "s"}
          </div>
        </div>
      </div>
      <div class="head-meta">
        <div class="live">live</div>
        <div>refreshing every ${refreshSeconds}s</div>
        <div style="margin-top: .5rem;" class="time-range">${rangeButtons}</div>
      </div>
    </header>

    <h2 class="section">Metrics — last ${windowMinutes >= 1440 ? `${windowMinutes / 1440}d` : windowMinutes >= 60 ? `${windowMinutes / 60}h` : `${windowMinutes}m`}</h2>
    <div class="stat-grid">${statCards}</div>

    <h2 class="section">Activity over time</h2>
    <div class="card">
      <div class="card-head">
        <div class="card-title">Calls per minute, segmented by outcome</div>
        <div class="card-sub">${timeSeries.length} buckets</div>
      </div>
      ${stats.total === 0 ? `<div class="empty">no calls yet — chart will populate as your agent calls tools</div>` : renderTimeSeriesChart(timeSeries)}
    </div>

    <h2 class="section">Distribution &amp; top tools</h2>
    <div class="chart-row split">
      <div class="card">
        <div class="card-head">
          <div class="card-title">Outcome distribution</div>
        </div>
        ${renderDonut(stats.byOutcome)}
        <div class="legend">${legendItems}</div>
      </div>
      <div class="card">
        <div class="card-head">
          <div class="card-title">Top tools by volume</div>
          <div class="card-sub">top ${Math.min(8, stats.topTools.length)}</div>
        </div>
        ${toolsBlock}
      </div>
    </div>

    <h2 class="section">Latency</h2>
    <div class="card">
      <div class="card-head">
        <div class="card-title">Duration histogram</div>
        <div class="card-sub">p50 ${formatMs(latency.p50)} · p95 ${formatMs(latency.p95)} · p99 ${formatMs(latency.p99)} · n=${latency.count}</div>
      </div>
      ${latency.count === 0 ? `<div class="empty">no timing data yet</div>` : renderLatencyHistogram(latencyHistogram)}
    </div>

    <h2 class="section">Recent calls</h2>
    <div class="card" style="padding: .25rem .5rem;">${recentBlock}</div>

    <div class="footer">
      <div>Trabecc v0.1.1 · MIT</div>
      <div><a href="/api/audit">/api/audit</a> · <a href="/api/stats">/api/stats</a> · <a href="/api/health">/api/health</a></div>
    </div>
  </div>
</body></html>`;
}
