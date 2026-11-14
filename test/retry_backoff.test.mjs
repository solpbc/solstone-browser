// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

// A saved batch the app doesn't take is offered again under the same identity,
// waiting twice as long each time the same batch isn't taken, up to five
// minutes. Taking it, or a new state from the app, starts the wait over.

import assert from "node:assert/strict";
import test from "node:test";
import "fake-indexeddb/auto";

await import(new URL("../extension/native-browser/constants.js", import.meta.url));
await import(new URL("../extension/native-browser/schemas.js", import.meta.url));
await import(new URL("../extension/native-browser/schema-validator.js", import.meta.url));
await import(new URL("../extension/native-browser/codec.js", import.meta.url));
await import(new URL("../extension/lib/uuid.js", import.meta.url));
await import(new URL("../extension/lib/db.js", import.meta.url));
await import(new URL("../extension/lib/blocks.js", import.meta.url));
await import(new URL("../extension/lib/hosts.js", import.meta.url));
await import(new URL("../extension/lib/segment.js", import.meta.url));
await import(new URL("../extension/lib/gate.js", import.meta.url));
await import(new URL("../extension/lib/native_outbox.js", import.meta.url));
await import(new URL("../extension/lib/native_port.js", import.meta.url));

const DB = globalThis.SolstoneDB;
const Outbox = globalThis.SolstoneNativeOutbox;
const PortController = globalThis.SolstoneNativePort;
const INST = "00000000-0000-0000-0000-000000000001";

class MockPort {
  sent = [];
  messageHandlers = [];
  disconnectHandlers = [];
  onMessage = { addListener: (h) => this.messageHandlers.push(h) };
  onDisconnect = { addListener: (h) => this.disconnectHandlers.push(h) };
  postMessage(m) { this.sent.push(m); }
  disconnect() { for (const h of this.disconnectHandlers) h(); }
  async receive(m) { for (const h of this.messageHandlers) await h(m); }
  batches() { return this.sent.filter((m) => m.type === "batch"); }
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

function state(over = {}) {
  return { type: "state", capture: "permitted", delivery: "kept_locally", freshness_ms: 15000,
    destination_generation: "A", period_id: "p1", ...over };
}

async function world() {
  for (const store of ["meta", "outbox", "producer"]) await DB.clear(store);
  let clock = 1000;
  let seq = 0;
  const timers = [];
  const ports = [];
  const controller = new PortController({
    inst: INST,
    runtimeId: "fgfnkcefedeheoeamppkiiloncfekakf",
    now: () => clock,
    schedule: (fn, ms) => { const t = { at: clock + Math.max(0, ms), seq: ++seq, fn }; timers.push(t); return t; },
    clearSchedule: (t) => { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); },
    connectNative: () => { const p = new MockPort(); ports.push(p); return p; },
  });
  controller.consentVersion = 1;
  controller.everConnected = true;
  controller.livePatterns = ["*://example.com/*"];
  controller.fence = null;
  const advanceTo = async (at) => {
    for (;;) {
      await settle();
      timers.sort((a, b) => a.at - b.at || a.seq - b.seq);
      const next = timers[0];
      if (!next || next.at > at) break;
      timers.shift();
      clock = next.at;
      await next.fn();
    }
    clock = at;
    await settle();
  };
  // Times at which batches went out, relative to the start.
  const sendTimes = (start) => {
    const out = [];
    const port = ports.at(-1);
    const original = port.postMessage.bind(port);
    port.postMessage = (m) => { if (m.type === "batch") out.push(clock - start); original(m); };
    return out;
  };
  return { controller, advanceTo, sendTimes, port: () => ports.at(-1), get now() { return clock; } };
}

async function enqueue(text = "synthetic") {
  return Outbox.enqueueSkim({
    inst: INST, ctx: "ctx-" + text, destinationGeneration: "A",
    senderUrl: "https://example.com/page", site: "example.com", title: "Page", adapter: "generic",
    blocks: [{ id: "1", type: "text", depth: 0, text }], nowMs: Date.now(),
  });
}

function refusal(batchId, reason = "queue_full") {
  return { type: "accepted", result: "rejected", class: "retryable", reason, batch_id: batchId, inst: INST,
    destination_generation: "A" };
}

// The app refuses every offer of the batch at once, for ten minutes, while it
// keeps renewing an unchanged state.
async function refuseFor(w, batchId, ms) {
  const start = w.now;
  const times = w.sendTimes(start);
  let answered = 0;
  for (let t = 0; t <= ms; t += 100) {
    await w.advanceTo(start + t);
    if (t > 0 && t % 5000 === 0) await w.port().receive(state());
    const sent = w.port().batches();
    while (answered < sent.length) {
      await w.port().receive(refusal(sent[answered].batch_id));
      answered++;
    }
  }
  return times;
}

test("a batch refused for ten minutes is offered with a doubling wait, not every 5 s", async () => {
  const w = await world();
  const item = await enqueue();
  w.controller.connect();
  await w.port().receive(state({ type: "hello_ack" }));
  // The first offer goes out on the grant.
  assert.equal(w.port().batches().length, 1);
  await w.port().receive(refusal(item.batchId));
  const times = await refuseFor(w, item.batchId, 600000);
  assert.deepEqual(times, [5000, 15000, 35000, 75000, 155000, 315000, 615000].filter((t) => t <= 600000));
  for (const batch of w.port().batches()) assert.equal(batch.batch_id, item.batchId);
});

test("taking the batch starts the wait over for the next one", async () => {
  const w = await world();
  const first = await enqueue("first");
  w.controller.connect();
  await w.port().receive(state({ type: "hello_ack" }));
  await w.port().receive(refusal(first.batchId));
  await w.advanceTo(w.now + 5000);
  await w.port().receive(state());
  await w.port().receive(refusal(first.batchId));
  await w.advanceTo(w.now + 5000);
  await w.port().receive(state());
  await w.advanceTo(w.now + 5000);
  await w.port().receive(state());
  assert.equal(w.port().batches().length, 3);
  const second = await enqueue("second");
  await w.port().receive({ type: "accepted", result: "accepted", batch_id: first.batchId, inst: INST,
    destination_generation: "A", period_id: "p1" });
  await w.advanceTo(w.now);
  assert.equal(w.port().batches().at(-1).batch_id, second.batchId);
  const start = w.now;
  const times = w.sendTimes(start);
  await w.port().receive(refusal(second.batchId));
  await w.advanceTo(start + 5000);
  assert.deepEqual(times, [5000]);
});

test("a new state from the app cuts a long wait short", async () => {
  const w = await world();
  const item = await enqueue();
  w.controller.connect();
  await w.port().receive(state({ type: "hello_ack" }));
  await w.port().receive(refusal(item.batchId));
  const times = await refuseFor(w, item.batchId, 160000);
  assert.deepEqual(times, [5000, 15000, 35000, 75000, 155000]);
  // Now waiting 160 s. The app says it has room again.
  const start = w.now;
  const after = w.sendTimes(start);
  await w.port().receive(state({ delivery: "delivered" }));
  await w.advanceTo(start + 5000);
  assert.deepEqual(after, [5000]);
});

test("an unanswered batch is offered again at once, then with a doubling wait", async () => {
  const w = await world();
  const item = await enqueue();
  w.controller.connect();
  const start = w.now;
  const times = w.sendTimes(start);
  await w.port().receive(state({ type: "hello_ack" }));
  // The app never answers, but keeps renewing.
  for (let t = 5000; t <= 200000; t += 5000) {
    await w.advanceTo(start + t);
    await w.port().receive(state());
  }
  // Offered at 0; 5 s later unanswered and offered again at once; then 10 s,
  // 20 s, 40 s, 80 s after each offer.
  assert.deepEqual(times, [0, 5000, 15000, 35000, 75000, 155000]);
  for (const batch of w.port().batches()) assert.equal(batch.batch_id, item.batchId);
});
