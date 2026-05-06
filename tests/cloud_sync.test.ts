import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CloudSync } from "../src/audit/sync.ts";
import type { AuditRecord } from "../src/types.ts";

function makeRecord(qualifiedName: string): AuditRecord {
  return {
    ts: 1,
    agentId: "test-client@1",
    server: "fs",
    tool: qualifiedName.split("__")[1] ?? qualifiedName,
    qualifiedName,
    argsJson: "{}",
    outcome: "allowed",
    reason: null,
    durationMs: 1,
    resultBytes: 0,
    errorMessage: null,
  };
}

function fakeFetch(captured: Array<{ url: string; body: unknown }>, fail = false): typeof fetch {
  return (async (url: unknown, init?: RequestInit) => {
    captured.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
    if (fail) throw new Error("network down");
    return new Response(null, { status: 202 });
  }) as typeof fetch;
}

describe("CloudSync", () => {
  it("flushes events on size threshold", async () => {
    const captured: Array<{ url: string; body: unknown }> = [];
    const sync = new CloudSync({
      endpoint: "https://x/",
      apiKey: "k",
      flushIntervalMs: 60_000,
      batchSize: 3,
      dropOnOverflow: true,
      maxBuffer: 100,
      fetchImpl: fakeFetch(captured),
    });
    sync.enqueue(makeRecord("fs__a"));
    sync.enqueue(makeRecord("fs__b"));
    sync.enqueue(makeRecord("fs__c")); // triggers flush
    // flush is async; wait a tick.
    await new Promise((r) => setImmediate(r));
    assert.equal(captured.length, 1);
    const body = captured[0]!.body as { events: unknown[] };
    assert.equal(body.events.length, 3);
  });

  it("drops oldest when buffer exceeds maxBuffer", async () => {
    const captured: Array<{ url: string; body: unknown }> = [];
    const sync = new CloudSync({
      endpoint: "https://x/",
      apiKey: "k",
      flushIntervalMs: 60_000,
      batchSize: 1000,
      dropOnOverflow: true,
      maxBuffer: 3,
      fetchImpl: fakeFetch(captured),
    });
    for (let i = 0; i < 5; i++) sync.enqueue(makeRecord(`fs__t${i}`));
    await sync.flush();
    const body = captured[0]!.body as { events: Array<{ qualifiedName: string }>; droppedSinceLastFlush: number };
    // 5 enqueued, buffer max 3 → 2 dropped. Remaining: t2, t3, t4.
    assert.equal(body.events.length, 3);
    assert.deepEqual(body.events.map((e) => e.qualifiedName), ["fs__t2", "fs__t3", "fs__t4"]);
    assert.equal(body.droppedSinceLastFlush, 2);
  });

  it("requeues on transient failure and stops retrying after 5 attempts", async () => {
    const captured: Array<{ url: string; body: unknown }> = [];
    const sync = new CloudSync({
      endpoint: "https://x/",
      apiKey: "k",
      flushIntervalMs: 60_000,
      batchSize: 1,
      dropOnOverflow: true,
      maxBuffer: 100,
      fetchImpl: fakeFetch(captured, true),
    });
    sync.enqueue(makeRecord("fs__retry"));
    for (let i = 0; i < 6; i++) await sync.flush();
    // 6 attempts; the 6th should observe the event has hit retry cap and drop.
    assert.equal(captured.length, 6);
  });

  it("sends required auth + identification headers", async () => {
    const headers: Record<string, string>[] = [];
    const sync = new CloudSync({
      endpoint: "https://api.test/v1/ingest",
      apiKey: "secret-123",
      flushIntervalMs: 60_000,
      batchSize: 1,
      dropOnOverflow: true,
      maxBuffer: 100,
      fetchImpl: (async (_url: unknown, init?: RequestInit) => {
        headers.push(Object.fromEntries(new Headers(init?.headers).entries()));
        return new Response(null, { status: 202 });
      }) as typeof fetch,
    });
    sync.enqueue(makeRecord("fs__a"));
    await new Promise((r) => setImmediate(r));
    const h = headers[0]!;
    assert.equal(h["authorization"], "Bearer secret-123");
    assert.equal(h["x-trabecc-version"], "0.1.0");
    assert.match(h["x-trabecc-install"]!, /^[0-9a-f]{8}$/);
  });
});
