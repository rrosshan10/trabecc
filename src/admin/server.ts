// Admin HTTP API. Runs in a separate process from the proxy so a noisy
// MCP client can't slow down the dashboard. Reads the audit DB directly
// in read-only mode (SQLite WAL handles the concurrency).
//
// v0 surface:
//   GET  /api/health
//   GET  /api/config         — sanitized config
//   GET  /api/audit?limit=&offset=
//   GET  /api/stats?windowMinutes=
//   GET  /api/policy/test?tool=<qualified>
//
// Bound to 127.0.0.1 by default; never exposed publicly without auth.

import { Hono } from "hono";
import { serve } from "@hono/node-server";
import type { Config } from "../config.ts";
import { expandHome } from "../config.ts";
import { AuditStore } from "../audit/store.ts";
import { PolicyEngine } from "../policy/engine.ts";
import { createLogger } from "../log.ts";
import { renderDashboard } from "./dashboard.ts";

const log = createLogger("admin");

export function startAdminServer(cfg: Config): { stop: () => Promise<void> } {
  const audit = new AuditStore(expandHome(cfg.audit.path), {
    maxRecords: cfg.audit.maxRecords,
    readOnly: true,
  });
  const policy = new PolicyEngine(cfg.rules, cfg.defaultPolicy);

  const app = new Hono();

  app.get("/api/health", (c) => c.json({ ok: true, version: "0.1.1" }));

  app.get("/api/timeseries", (c) => {
    const windowMinutes = Math.max(1, Number(c.req.query("windowMinutes") ?? 60));
    const sinceMs = Date.now() - windowMinutes * 60_000;
    const bucketMs = pickBucketMs(windowMinutes);
    return c.json({ bucketMs, series: audit.timeSeriesByOutcome(sinceMs, bucketMs) });
  });

  app.get("/api/latency", (c) => {
    const windowMinutes = Math.max(1, Number(c.req.query("windowMinutes") ?? 60));
    const sinceMs = Date.now() - windowMinutes * 60_000;
    return c.json({
      percentiles: audit.latencyPercentiles(sinceMs),
      histogram: audit.latencyHistogram(sinceMs, [1, 10, 100, 1000]),
    });
  });

  app.get("/api/config", (c) => {
    return c.json({
      defaultPolicy: cfg.defaultPolicy,
      servers: cfg.servers.map((s) => ({
        name: s.name,
        command: s.command,
        args: s.args,
        enabled: s.enabled,
        timeoutMs: s.timeoutMs,
      })),
      rules: cfg.rules,
      rateLimits: cfg.rateLimits,
    });
  });

  app.get("/api/audit", (c) => {
    const limit = Math.min(1000, Number(c.req.query("limit") ?? 100));
    const offset = Math.max(0, Number(c.req.query("offset") ?? 0));
    return c.json({ records: audit.recent(limit, offset) });
  });

  app.get("/api/stats", (c) => {
    const windowMinutes = Math.max(1, Number(c.req.query("windowMinutes") ?? 60));
    const sinceMs = Date.now() - windowMinutes * 60_000;
    return c.json(audit.stats(sinceMs));
  });

  app.get("/api/policy/test", (c) => {
    const tool = c.req.query("tool");
    if (!tool) return c.json({ error: "missing 'tool' query parameter" }, 400);
    return c.json(policy.evaluate(tool));
  });

  app.get("/", (c) => {
    const windowMinutes = Math.max(1, Number(c.req.query("windowMinutes") ?? 60));
    const limit = Math.min(500, Number(c.req.query("limit") ?? 50));
    const refreshSeconds = Math.max(2, Number(c.req.query("refresh") ?? 5));
    const sinceMs = Date.now() - windowMinutes * 60_000;
    const bucketMs = pickBucketMs(windowMinutes);
    return c.html(
      renderDashboard({
        config: cfg,
        records: audit.recent(limit, 0),
        stats: audit.stats(sinceMs),
        timeSeries: audit.timeSeriesByOutcome(sinceMs, bucketMs),
        latencyHistogram: audit.latencyHistogram(sinceMs, [1, 10, 100, 1000]),
        latency: audit.latencyPercentiles(sinceMs),
        windowMinutes,
        refreshSeconds,
      }),
    );
  });

  const server = serve(
    {
      fetch: app.fetch,
      port: cfg.admin.port,
      hostname: cfg.admin.bind,
    },
    (info) => log.info(`admin listening on http://${info.address}:${info.port}`),
  );

  return {
    stop: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      audit.close();
    },
  };
}

/**
 * Pick a sensible time-series bucket size for the requested window. Targets
 * ~60 buckets in the chart so it always reads as a continuous trend.
 *   ≤1h   →  1-minute buckets
 *   ≤6h   →  6-minute buckets
 *   ≤24h  →  15-minute buckets
 *   ≤7d   →  1-hour buckets
 *   else  →  6-hour buckets
 */
function pickBucketMs(windowMinutes: number): number {
  if (windowMinutes <= 60) return 60_000;
  if (windowMinutes <= 360) return 6 * 60_000;
  if (windowMinutes <= 1440) return 15 * 60_000;
  if (windowMinutes <= 10080) return 60 * 60_000;
  return 6 * 60 * 60_000;
}
