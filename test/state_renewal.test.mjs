// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

// The app repeats its state every few seconds. A repeat of the state in force
// only moves its deadline: the background keeps the grant it holds, and a page
// already being read keeps reading without being read again. Any real change
// still withdraws first. One clock drives the background, the router and a
// content script, so timers run only when the trace moves time.

import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import vm from "node:vm";
import "fake-indexeddb/auto";

await import(new URL("../extension/native-browser/constants.js", import.meta.url));
await import(new URL("../extension/native-browser/schemas.js", import.meta.url));
await import(new URL("../extension/native-browser/schema-validator.js", import.meta.url));
await import(new URL("../extension/native-browser/codec.js", import.meta.url));
await import(new URL("../extension/lib/uuid.js", import.meta.url));
await import(new URL("../extension/lib/db.js", import.meta.url));
await import(new URL("../extension/lib/blocks.js", import.meta.url));
await import(new URL("../extension/lib/segment.js", import.meta.url));
await import(new URL("../extension/lib/hosts.js", import.meta.url));
await import(new URL("../extension/lib/gate.js", import.meta.url));
await import(new URL("../extension/lib/left_out.js", import.meta.url));
await import(new URL("../extension/lib/native_outbox.js", import.meta.url));
await import(new URL("../extension/lib/native_port.js", import.meta.url));
await import(new URL("../extension/lib/router.js", import.meta.url));

const DB = globalThis.SolstoneDB;
const Outbox = globalThis.SolstoneNativeOutbox;
const PortController = globalThis.SolstoneNativePort;
const Router = globalThis.SolstoneRouter;
const Gate = globalThis.SolstoneCaptureGate;
const ROOT = new URL("..", import.meta.url);

class MockPort {
  constructor() { this.messageHandlers = []; this.disconnectHandlers = []; this.disconnected = false; }
  postMessage() { if (this.disconnected) throw new Error("Port disconnected"); }
  disconnect() {
    if (this.disconnected) return;
    this.disconnected = true;
    for (const h of this.disconnectHandlers) h();
  }
  onMessage = { addListener: (h) => this.messageHandlers.push(h) };
  onDisconnect = { addListener: (h) => this.disconnectHandlers.push(h) };
  async receive(msg) { for (const h of this.messageHandlers) await h(msg); }
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

function frame(over = {}) {
  return { type: "state", capture: "permitted", delivery: "idle", freshness_ms: 15000,
    destination_generation: "gen-a", period_id: "p1", custody: { full: false, stale: false }, ...over };
}

// A background, a router and one reading frame on a shared clock.
async function world() {
  await DB.clear("outbox");
  await DB.clear("producer");
  await DB.clear("meta");
  Router.frameBindings.clear();
  let clock = 1000;
  let timerSeq = 0;
  const timers = [];
  const ports = [];
  const statuses = [];
  const skims = [];
  const asks = [];
  let reads = 0;
  let content = null;
  const held = { renewals: false };
  const observers = new Set();

  const schedule = (fn, ms) => { const t = { at: clock + Math.max(0, ms), seq: ++timerSeq, fn }; timers.push(t); return t; };
  const cancel = (t) => { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); };

  const controller = new PortController({
    inst: "00000000-0000-0000-0000-000000000001",
    runtimeId: "fgfnkcefedeheoeamppkiiloncfekakf",
    now: () => clock,
    schedule,
    clearSchedule: cancel,
    connectNative: () => { const p = new MockPort(); ports.push(p); return p; },
    // As the background does: every status change goes to every reading tab.
    onStatusChange: (status) => {
      statuses.push(status);
      content?.({
        kind: "leaseUpdate",
        captureEpoch: status.captureEpoch,
        lease: status.lease,
        paused: status.paused,
        consentVersion: status.consentVersion,
        livePatterns: status.livePatterns || [],
        fence: status.fence || null,
        broadGrant: status.broadGrant === true,
        excludedHosts: status.excludedHosts || [],
        appLeftOut: status.appLeftOut || [],
        hostCapture: status.hostCapture,
        capturePermitted: status.capturePermitted === true,
        pressure: status.pressure,
        destinationGeneration: status.destinationGeneration,
        connectionGeneration: status.connectionGeneration || 0,
      });
    },
  });
  controller.consentVersion = 1;
  controller.everConnected = true;
  controller.livePatterns = ["*://example.com/*"];
  controller.fence = null;

  const sender = { id: "ext", tab: { id: 7 }, frameId: 0, url: "https://example.com/page", origin: "https://example.com" };
  const deps = { port: controller, runtimeId: "ext", confirmRealm: async () => true };

  const ctx = {
    crypto,
    console,
    URL,
    performance: { now: () => clock },
    location: { origin: "https://example.com", host: "example.com" },
    document: {
      readyState: "complete",
      visibilityState: "visible",
      title: "Example",
      addEventListener() {},
      getElementById() { return null; },
    },
    window: { addEventListener() {} },
    chrome: {
      runtime: {
        id: "ext",
        sendMessage(m, cb) {
          asks.push(m.kind);
          if (m.kind === "skim") {
            skims.push(m);
            cb?.({ ok: true });
            return;
          }
          // A throttled page whose asks go unanswered for a while.
          if (m.kind === "renew" && held.renewals) return;
          Router.route(m, sender, deps).then((r) => cb?.(r), () => cb?.({ ok: false }));
        },
        onMessage: { addListener(fn) { content = (m) => fn(m, { id: "ext" }, () => {}); } },
      },
    },
    setTimeout: (fn, ms) => schedule(fn, ms || 0),
    clearTimeout: (t) => { if (t) cancel(t); },
    setInterval: (fn, ms) => {
      const handle = {};
      const tick = () => { handle.timer = schedule(tick, ms); fn(); };
      handle.timer = schedule(tick, ms);
      return handle;
    },
    clearInterval: (handle) => { if (handle?.timer) cancel(handle.timer); },
    MutationObserver: class {
      constructor(fn) { this.fn = fn; }
      observe() { observers.add(this); }
      disconnect() { observers.delete(this); }
    },
    SolstoneCaptureGate: Gate,
    SolstoneAdapters: {
      adapterForHost() { return { name: "generic" }; },
      pickRoot() { reads++; return { tagName: "DIV", children: [{}] }; },
    },
    SolstoneSkim: { skim() { return [{ id: "1", type: "text", depth: 0, text: "Hello" }]; } },
  };
  vm.runInNewContext(fs.readFileSync(new URL("extension/lib/hosts.js", ROOT), "utf8"), ctx);

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

  return {
    controller, statuses, skims, asks, advanceTo, held,
    get reads() { return reads; },
    get now() { return clock; },
    port: () => ports.at(-1),
    startPage() {
      vm.runInNewContext(fs.readFileSync(new URL("extension/content.js", ROOT), "utf8"), ctx);
    },
    // The page's text changes once.
    mutate() {
      for (const o of [...observers]) o.fn([{ type: "characterData" }]);
    },
    reading() {
      return Gate.computeDecision({ ...controller.getStatus(), originGranted: true, now: clock }).open;
    },
  };
}

// Connected and settled on one state, with the app renewing it every 5 s.
async function connected(w, state = frame()) {
  w.controller.connect();
  await w.port().receive({ ...state, type: "hello_ack" });
  await w.advanceTo(w.now);
}

test("an unchanged renewal for a minute keeps the grant and publishes nothing", async () => {
  const w = await world();
  await connected(w);
  const epoch = w.controller.captureEpoch;
  const revision = w.controller.stateRevision;
  const published = w.statuses.length;
  let promotions = 0;
  const original = Outbox.promoteHeldForGeneration;
  Outbox.promoteHeldForGeneration = async (...args) => { promotions++; return original(...args); };
  try {
    const start = w.now;
    for (let t = 5000; t <= 60000; t += 5000) {
      await w.advanceTo(start + t);
      await w.port().receive(frame());
      assert.equal(w.reading(), true, `reading at ${t} ms`);
    }
  } finally {
    Outbox.promoteHeldForGeneration = original;
  }
  assert.equal(w.controller.captureEpoch, epoch);
  assert.equal(w.controller.stateRevision, revision);
  assert.equal(w.statuses.length, published, "no status change to publish");
  assert.equal(promotions, 0);
  // The last renewal still carries the full lease from its own arrival.
  await w.advanceTo(w.now + 14999);
  assert.equal(w.reading(), true);
  await w.advanceTo(w.now + 1);
  assert.equal(w.reading(), false, "a renewal that stops coming still lapses on time");
});

test("a static page being read for a minute of renewals is read once", async () => {
  const w = await world();
  await connected(w);
  w.startPage();
  await w.advanceTo(w.now + 1000);
  assert.equal(w.skims.length, 1);
  const readsAfterStart = w.reads;
  const start = w.now;
  for (let t = 5000; t <= 60000; t += 5000) {
    await w.advanceTo(start + t);
    await w.port().receive(frame());
  }
  await w.advanceTo(start + 62000);
  assert.equal(w.skims.length, 1, "no page restarts");
  assert.equal(w.reads, readsAfterStart);
  assert.equal(w.asks.filter((k) => k === "hello").length, 1);
  assert.ok(w.asks.filter((k) => k === "renew").length >= 6, "the page keeps its own lease current");
});

for (const [name, change] of [
  ["destination generation", { destination_generation: "gen-b" }],
  ["capture value", { capture: "paused" }],
  ["custody that refuses reading", { custody: { full: true, stale: false } }],
  ["delivery fact", { delivery: "delivered" }],
  ["lease length", { freshness_ms: 12000 }],
]) {
  test(`a changed ${name} still withdraws before anything else`, async () => {
    const w = await world();
    await connected(w);
    await w.advanceTo(w.now + 5000);
    await w.port().receive(frame());
    const epoch = w.controller.captureEpoch;
    const published = w.statuses.length;
    await w.advanceTo(w.now + 5000);
    await w.port().receive(frame(change));
    const after = w.statuses.slice(published);
    assert.ok(after.length >= 2, "the change is published");
    assert.equal(after[0].lease, null, "the first status after a change carries no lease");
    assert.equal(after[0].capturePermitted, false);
    assert.notEqual(w.controller.captureEpoch, epoch);
  });
}

test("the same state on a new connection withdraws first", async () => {
  const w = await world();
  await connected(w);
  const epoch = w.controller.captureEpoch;
  const published = w.statuses.length;
  w.port().disconnect();
  w.controller.connect();
  await w.port().receive(frame({ type: "hello_ack" }));
  await w.port().receive(frame());
  const after = w.statuses.slice(published);
  assert.ok(after.some((s) => s.lease == null));
  assert.notEqual(w.controller.captureEpoch, epoch);
  assert.equal(w.reading(), true);
});

test("the same state after it lapsed is granted again from the start", async () => {
  const w = await world();
  await connected(w);
  await w.advanceTo(w.now + 15000);
  assert.equal(w.reading(), false);
  const epoch = w.controller.captureEpoch;
  const published = w.statuses.length;
  await w.port().receive(frame());
  assert.equal(w.statuses.slice(published)[0].lease, null);
  assert.notEqual(w.controller.captureEpoch, epoch);
  assert.equal(w.reading(), true);
});

test("changing whether reading follows the app's pause re-applies the state", async () => {
  const w = await world();
  await connected(w, frame({ capture: "paused", away: false }));
  assert.equal(w.reading(), false);
  w.controller.pauseWithApp = false;
  await w.controller.reapplyLastCapture();
  assert.equal(w.reading(), true);
  const epoch = w.controller.captureEpoch;
  await w.advanceTo(w.now + 5000);
  await w.port().receive(frame({ capture: "paused", away: false }));
  assert.equal(w.controller.captureEpoch, epoch, "a renewal of the re-applied state changes nothing");
  w.controller.pauseWithApp = true;
  await w.controller.reapplyLastCapture();
  assert.equal(w.reading(), false);
});

test("a reading page stops when the grant changes and reads again under the new one", async () => {
  const w = await world();
  await connected(w);
  w.startPage();
  await w.advanceTo(w.now + 5000);
  await w.port().receive(frame());
  assert.equal(w.skims.length, 1);
  await w.advanceTo(w.now + 5000);
  await w.port().receive(frame({ destination_generation: "gen-b" }));
  await w.advanceTo(w.now + 100);
  assert.equal(w.skims.length, 2);
  assert.equal(w.skims[1].destinationGeneration, "gen-b");
});

test("a reading page stops when the app stops renewing", async () => {
  const w = await world();
  await connected(w);
  w.startPage();
  await w.advanceTo(w.now + 1000);
  const start = w.now;
  await w.advanceTo(start + 15000);
  assert.equal(w.reading(), false);
  const renews = w.asks.filter((k) => k === "renew").length;
  // Nothing more is asked or read once the grant has lapsed.
  await w.advanceTo(start + 60000);
  assert.equal(w.asks.filter((k) => k === "renew").length, renews);
  assert.equal(w.skims.length, 1);
});

test("a page whose lease ran out just before a late renewal picks the grant up again", async () => {
  const w = await world();
  await connected(w);
  const granted = w.now;
  w.startPage();
  await w.advanceTo(granted + 1000);
  assert.equal(w.skims.length, 1);
  // The app goes quiet, then renews just before its own deadline, after the
  // page's last ask: the page's lease runs out, and one more ask finds the
  // renewed grant.
  await w.advanceTo(granted + 14800);
  await w.port().receive(frame());
  await w.advanceTo(granted + 16000);
  assert.equal(w.reading(), true);
  assert.equal(w.skims.length, 2, "one fresh read after the lapse");
  const renews = w.asks.filter((k) => k === "renew").length;
  for (let t = 19800; t <= 64800; t += 5000) {
    await w.advanceTo(granted + t);
    await w.port().receive(frame());
  }
  assert.equal(w.skims.length, 2);
  assert.ok(w.asks.filter((k) => k === "renew").length > renews, "the page keeps renewing after it picked the grant up");
});

test("router: renew reports the bound frame's remaining lease and refuses an unbound one", async () => {
  const w = await world();
  await connected(w);
  const sender = { id: "ext", tab: { id: 9 }, frameId: 0, url: "https://example.com/x", origin: "https://example.com" };
  const deps = { port: w.controller, runtimeId: "ext", confirmRealm: async () => true };
  const ids = { realmToken: "r".repeat(32), documentKey: "a".repeat(32) };
  assert.equal((await Router.route({ kind: "renew", ...ids }, sender, deps)).error, "challenge_mismatch");
  const hello = await Router.route({ kind: "hello", ...ids }, sender, deps);
  assert.equal(hello.ok, true);
  await w.advanceTo(w.now + 4000);
  const renewed = await Router.route({ kind: "renew", ...ids }, sender, deps);
  assert.equal(renewed.ok, true);
  assert.equal(renewed.captureEpoch, hello.captureEpoch);
  assert.equal(renewed.lease.token, hello.lease.token);
  assert.equal(renewed.lease.freshnessMs, 11000);
});

test("held pages are promoted once per destination, not on every state change", async () => {
  const w = await world();
  const promoted = [];
  const original = Outbox.promoteHeldForGeneration;
  Outbox.promoteHeldForGeneration = async (generation, authorize) => { promoted.push(generation); return original(generation, authorize); };
  try {
    await connected(w);
    for (const delivery of ["kept_locally", "delivered", "idle", "delivered"]) {
      await w.advanceTo(w.now + 5000);
      await w.port().receive(frame({ delivery }));
    }
    assert.deepEqual(promoted, ["gen-a"]);
    await w.port().receive(frame({ destination_generation: "gen-b" }));
    assert.deepEqual(promoted, ["gen-a", "gen-b"]);
    await w.port().receive(frame({ capture: "not_paired", destination_generation: null, period_id: null, freshness_ms: 0 }));
    await w.port().receive(frame({ destination_generation: "gen-b" }));
    assert.deepEqual(promoted, ["gen-a", "gen-b", "gen-b"], "a destination that comes back is promoted again");
    w.port().disconnect();
    w.controller.connect();
    await w.port().receive(frame({ type: "hello_ack", destination_generation: "gen-b" }));
    assert.deepEqual(promoted, ["gen-a", "gen-b", "gen-b", "gen-b"], "a new connection promotes again");
  } finally {
    Outbox.promoteHeldForGeneration = original;
  }
});

test("a promotion cut short by a newer state is done again", async () => {
  const w = await world();
  await connected(w);
  const promoted = [];
  const original = Outbox.promoteHeldForGeneration;
  let release;
  Outbox.promoteHeldForGeneration = (generation) => { promoted.push(generation); return new Promise((resolve) => { release = resolve; }); };
  try {
    const first = w.port().receive(frame({ destination_generation: "gen-b" }));
    const stalled = release;
    const second = w.port().receive(frame({ destination_generation: "gen-b", delivery: "delivered" }));
    stalled({ count: 0 });
    release({ count: 0 });
    await Promise.all([first, second]);
    assert.deepEqual(promoted, ["gen-b", "gen-b"]);
  } finally {
    Outbox.promoteHeldForGeneration = original;
  }
});

test("the minute poll looks at the store's size only while it is full", async () => {
  const w = await world();
  await connected(w);
  let scans = 0;
  const original = Outbox.getCapacityStatus;
  Outbox.getCapacityStatus = async () => { scans++; return original(); };
  try {
    for (let i = 0; i < 5; i++) await w.controller.poll();
    assert.equal(scans, 0);
    w.controller.pressure = { active: true };
    await w.controller.poll();
    assert.equal(scans, 1);
    assert.equal(w.controller.pressure.active, false, "a store with room again is noticed");
  } finally {
    Outbox.getCapacityStatus = original;
  }
});

test("a page whose lease ran out with the grant about to lapse asks again, and resumes when it was renewed", async () => {
  const w = await world();
  await connected(w);
  const granted = w.now;
  w.startPage();
  await w.advanceTo(granted + 1000);
  assert.equal(w.skims.length, 1);
  // The app renews once early; the page's asks go unanswered until its own
  // lease has run out with about 4 s of the app's grant left.
  await w.advanceTo(granted + 4000);
  await w.port().receive(frame());
  w.held.renewals = true;
  await w.advanceTo(granted + 14000);
  w.held.renewals = false;
  await w.advanceTo(granted + 15500);
  assert.equal(w.skims.length, 1);
  // An identical renewal tells nobody, yet the page picks the grant up.
  await w.advanceTo(granted + 17000);
  await w.port().receive(frame());
  await w.advanceTo(granted + 20000);
  assert.equal(w.skims.length, 2, "the page resumed with one fresh read");
  const renews = w.asks.filter((k) => k === "renew").length;
  for (let t = 22000; t <= 62000; t += 5000) {
    await w.advanceTo(granted + t);
    await w.port().receive(frame());
  }
  assert.equal(w.skims.length, 2);
  assert.ok(w.asks.filter((k) => k === "renew").length > renews);
});

test("a page whose last ask finds the grant about to lapse stops asking once it lapses", async () => {
  const w = await world();
  await connected(w);
  const granted = w.now;
  w.startPage();
  await w.advanceTo(granted + 1000);
  await w.advanceTo(granted + 4000);
  await w.port().receive(frame());
  w.held.renewals = true;
  await w.advanceTo(granted + 14000);
  w.held.renewals = false;
  // No further renewal: the app's grant lapses at 19 s.
  await w.advanceTo(granted + 25000);
  const renews = w.asks.filter((k) => k === "renew").length;
  await w.advanceTo(granted + 90000);
  assert.equal(w.asks.filter((k) => k === "renew").length, renews);
  assert.equal(w.skims.length, 1);
});

// The app renews every 5 s throughout, as it does.
async function runPage(w, until, onTick) {
  const start = w.now;
  for (let t = 100; t <= until; t += 100) {
    await w.advanceTo(start + t);
    if (t % 5000 === 0) await w.port().receive(frame());
    onTick?.(t);
  }
}

const changeReads = (w) => w.skims.filter((m) => m.reason === "change").length;

test("a page whose text changes every second for a minute is read at most once every 5 s", async () => {
  const w = await world();
  await connected(w);
  w.startPage();
  await w.advanceTo(w.now + 1000);
  assert.equal(w.skims.length, 1);
  const before = changeReads(w);
  await runPage(w, 60000, (t) => { if (t % 1000 === 0) w.mutate(); });
  const reads = changeReads(w) - before;
  assert.ok(reads >= 10 && reads <= 12, `${reads} change reads in a minute`);
});

test("a page whose text changes every 300 ms is still read, within about 5 s", async () => {
  const w = await world();
  await connected(w);
  w.startPage();
  await w.advanceTo(w.now + 1000);
  const before = changeReads(w);
  let firstAt = null;
  await runPage(w, 20000, (t) => {
    if (t % 300 === 0) w.mutate();
    if (firstAt == null && changeReads(w) > before) firstAt = t;
  });
  assert.ok(firstAt != null && firstAt <= 5400, `first read at ${firstAt} ms`);
  assert.ok(changeReads(w) - before >= 3, "and keeps being read while it keeps changing");
});

test("a quiet page is read 500 ms after a change", async () => {
  const w = await world();
  await connected(w);
  w.startPage();
  await w.advanceTo(w.now + 1000);
  const before = changeReads(w);
  const start = w.now;
  w.mutate();
  await w.advanceTo(start + 499);
  assert.equal(changeReads(w), before);
  await w.advanceTo(start + 500);
  assert.equal(changeReads(w), before + 1);
});
