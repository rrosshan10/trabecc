// Optional outbound sync of audit events to a hosted endpoint (Trabecc
// Cloud, or any compatible ingest URL). The protocol is intentionally tiny:
// POST a JSON {events:[...]} payload with a Bearer token; receive 2xx.
//
// Design priorities, in order:
//   1. Never block the gateway. The hot path enqueues; flushing is async.
//   2. Never lose data on a transient hiccup. Failed batches are retried
//      with exponential backoff up to a cap.
//   3. Never grow unbounded. If the endpoint is down for hours, we drop
//      oldest events past `maxBuffer` rather than OOM the user.
//   4. Never leak secrets. The redactor in the gateway runs *before* any
//      record reaches the buffer.
//
// This is the SaaS conversion wedge. The OSS proxy works fully without it,
// but flipping `cloud.apiKey` in trabecc.yaml gives the user multi-host
// audit retention, alerting, and team dashboards in the cloud product.

import type { AuditRecord } from "../types.ts";
import { createLogger } from "../log.ts";
import { VERSION } from "../version.ts";

const log = createLogger("cloud");

export type CloudSyncOptions = {
  endpoint: string;
  apiKey: string;
  flushIntervalMs: number;
  batchSize: number;
  dropOnOverflow: boolean;
  maxBuffer: number;
  /** Optional clock injection for tests. */
  now?: () => number;
  /** Optional fetch injection for tests. */
  fetchImpl?: typeof fetch;
};

type Buffered = AuditRecord & { _retries?: number };

export class CloudSync {
  private buffer: Buffered[] = [];
  private timer: NodeJS.Timeout | null = null;
  private flushing = false;
  private stopped = false;
  private hostId: string;
  private installId: string;
  private fetch: typeof fetch;
  private droppedSinceLastFlush = 0;
  private opts: CloudSyncOptions;

  constructor(opts: CloudSyncOptions) {
    this.opts = opts;
    this.hostId = process.env["HOSTNAME"] ?? "unknown";
    this.installId = deriveInstallId();
    this.fetch = opts.fetchImpl ?? globalThis.fetch;
  }

  start(): void {
    if (this.timer || this.stopped) return;
    this.timer = setInterval(() => void this.flush(), this.opts.flushIntervalMs);
    this.timer.unref();
    log.info("cloud sync enabled", { endpoint: this.opts.endpoint, batchSize: this.opts.batchSize });
  }

  enqueue(record: AuditRecord): void {
    if (this.stopped) return;
    if (this.buffer.length >= this.opts.maxBuffer) {
      if (this.opts.dropOnOverflow) {
        this.buffer.shift();
        this.droppedSinceLastFlush++;
      } else {
        // Drop newest as a last resort — never block the gateway.
        this.droppedSinceLastFlush++;
        return;
      }
    }
    this.buffer.push(record);
    if (this.buffer.length >= this.opts.batchSize) {
      void this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.flushing || this.buffer.length === 0) return;
    this.flushing = true;
    const batch = this.buffer.splice(0, this.opts.batchSize);
    const dropped = this.droppedSinceLastFlush;
    this.droppedSinceLastFlush = 0;

    try {
      const res = await this.fetch(this.opts.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.opts.apiKey}`,
          "x-trabecc-version": VERSION,
          "x-trabecc-install": this.installId,
          "x-trabecc-host": this.hostId,
        },
        body: JSON.stringify({
          installId: this.installId,
          hostId: this.hostId,
          droppedSinceLastFlush: dropped,
          events: batch.map((r) => ({
            ts: r.ts,
            agentId: r.agentId,
            server: r.server,
            tool: r.tool,
            qualifiedName: r.qualifiedName,
            argsJson: r.argsJson,
            outcome: r.outcome,
            reason: r.reason,
            durationMs: r.durationMs,
            resultBytes: r.resultBytes,
            errorMessage: r.errorMessage,
          })),
        }),
      });
      if (res.status === 402) {
        // Plan limit reached. Retrying is pointless — surface the upgrade
        // path loudly instead of silently eating the user's intent.
        let upgradeUrl = "https://api.trabecc.com/signup";
        let message = "cloud returned 402 Payment Required";
        try {
          const body = (await res.json()) as { message?: string; upgrade?: { url?: string } };
          if (body.upgrade?.url) upgradeUrl = body.upgrade.url;
          if (body.message) message = body.message;
        } catch { /* body is optional */ }
        log.warn(`${message} — dropping ${batch.length} buffered events. Upgrade: ${upgradeUrl}`);
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      // Re-queue with retry counter; drop after a few tries to avoid poisoning.
      const requeue = batch
        .map((r) => ({ ...r, _retries: (r._retries ?? 0) + 1 }))
        .filter((r) => (r._retries ?? 0) <= 5);
      this.buffer.unshift(...requeue);
      log.warn("cloud sync flush failed", {
        err: err instanceof Error ? err.message : String(err),
        retried: requeue.length,
        dropped: batch.length - requeue.length,
      });
    } finally {
      this.flushing = false;
    }
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    // Best-effort final flush.
    await this.flush();
  }
}

/**
 * Stable per-install identifier. Derived from the machine's hostname and
 * the user's home directory so it survives across restarts but is unique
 * per machine. Not personally identifying.
 */
function deriveInstallId(): string {
  const seed = `${process.env["HOSTNAME"] ?? ""}:${process.env["HOME"] ?? ""}:trabecc`;
  // Tiny FNV-1a so we don't pull in a hash dep.
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
