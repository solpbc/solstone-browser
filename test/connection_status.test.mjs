// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

// When the toolbar, popup and settings page say the solstone app is reached,
// connecting or not reached, on scripted traces with an injected clock. The
// evidence is the app's own frames; the timing is SolstoneStatus.present().

import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import "fake-indexeddb/auto";

await import(new URL("../extension/native-browser/constants.js", import.meta.url));
await import(new URL("../extension/native-browser/schemas.js", import.meta.url));
await import(new URL("../extension/native-browser/schema-validator.js", import.meta.url));
await import(new URL("../extension/native-browser/codec.js", import.meta.url));
await import(new URL("../extension/lib/uuid.js", import.meta.url));
await import(new URL("../extension/lib/db.js", import.meta.url));
await import(new URL("../extension/lib/hosts.js", import.meta.url));
await import(new URL("../extension/lib/gate.js", import.meta.url));
await import(new URL("../extension/lib/left_out.js", import.meta.url));
await import(new URL("../extension/lib/native_outbox.js", import.meta.url));
await import(new URL("../extension/lib/native_port.js", import.meta.url));
await import(new URL("../extension/lib/copy.js", import.meta.url));
await import(new URL("../extension/lib/status.js", import.meta.url));

const S = globalThis.SolstoneStatus;
const DB = globalThis.SolstoneDB;
const Outbox = globalThis.SolstoneNativeOutbox;
const PortController = globalThis.SolstoneNativePort;
const ORIGIN = "https://example.com";

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

// A background with its own clock: timers run only when the trace moves time.
async function background() {
  await DB.clear("outbox");
  await DB.clear("meta");
  let clock = 0;
  const timers = [];
  const ports = [];
  const controller = new PortController({
    inst: "00000000-0000-0000-0000-000000000001",
    runtimeId: "fgfnkcefedeheoeamppkiiloncfekakf",
    now: () => clock,
    schedule: (fn, ms) => { const t = { at: clock + ms, fn }; timers.push(t); return t; },
    clearSchedule: (t) => { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); },
    connectNative: () => { const p = new MockPort(); ports.push(p); return p; },
  });
  controller.consentVersion = 1;
  controller.everConnected = true;
  controller.chosenOrigins = new Set([ORIGIN]);
  controller.grantedOrigins = new Set([ORIGIN]);
  const advanceTo = async (at) => {
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      const next = timers[0];
      if (!next || next.at > at) break;
      timers.shift();
      clock = next.at;
      await next.fn();
    }
    clock = at;
  };
  return { controller, advanceTo, port: () => ports.at(-1), get now() { return clock; } };
}

function frame(type, freshness = 15000) {
  return { type, capture: "permitted", delivery: "idle", freshness_ms: freshness,
    destination_generation: "gen-a", period_id: "p1" };
}

const on = (status) => ["on", "idle"].includes(S.derive(status).kind);
const shownKind = (memo) => memo.status ? S.derive(memo.status).kind : null;

const up = { connected: true, handshake: "ready", connectionGeneration: 1, everConnected: true, consentVersion: 1,
  hostCapture: "permitted", hostDelivery: "idle", capturePermitted: true, custody: { full: false, stale: false },
  lease: { token: "t", freshnessMs: 15000, receivedAt: 0 }, chosenOrigins: [ORIGIN], grantedOrigins: [ORIGIN],
  pressure: { active: false }, brand: "chrome", platform: "mac" };
const down = S.withdrawn(up, false);
const connecting = { ...down, connected: true, handshake: "pending" };

test("I1: a hard drop is shown within one evaluation", () => {
  let memo = S.present(null, up, undefined, 0);
  assert.equal(shownKind(memo), "on");
  memo = S.present(memo, down, undefined, 10);
  assert.equal(shownKind(memo), "cant-reach-app");
  // A port that drops and is retried at once shows the drop at once, too.
  memo = S.present(S.present(null, up, undefined, 0), connecting, undefined, 10);
  assert.equal(shownKind(memo), "connecting");
});

test("I2: on is never shown without an app frame within its lease", async () => {
  const bg = await background();
  bg.controller.connect();
  await bg.port().receive(frame("hello_ack"));
  let memo = null;
  for (let t = 0; t <= 20000; t += 250) {
    await bg.advanceTo(t);
    const status = bg.controller.getStatus();
    memo = S.present(memo, status, undefined, t);
    if (memo.status && on(memo.status)) {
      assert.ok(t < 15000, `on shown ${t} ms after the only frame`);
      assert.ok(on(status), "on is never a held state");
    }
  }
  assert.equal(shownKind(memo), "cant-reach-app");
});

test("I3: a drop from on stays shown for at least the dwell before on returns", () => {
  let memo = S.present(null, up, undefined, 0);
  memo = S.present(memo, down, undefined, 1000);
  memo = S.present(memo, up, undefined, 1200);
  assert.equal(shownKind(memo), "cant-reach-app");
  assert.equal(memo.wakeAt, 1000 + S.LINK.downDwellMs);
  memo = S.present(memo, up, undefined, 1000 + S.LINK.downDwellMs);
  assert.equal(shownKind(memo), "on");
  // On arriving after the dwell shows at once, with no confirm timer.
  memo = S.present(memo, down, undefined, 5000);
  memo = S.present(memo, up, undefined, 7000);
  assert.equal(shownKind(memo), "on");
  assert.equal(memo.wakeAt, null);
});

test("I4: one missed renewal inside the lease changes nothing", async () => {
  const bg = await background();
  bg.controller.connect();
  await bg.port().receive(frame("hello_ack"));
  let memo = null;
  for (let t = 0; t <= 19000; t += 250) {
    await bg.advanceTo(t);
    // The app renews every 5 s; the renewal due at 10 s never comes.
    if (t === 5000 || t === 15000) await bg.port().receive(frame("state"));
    memo = S.present(memo, bg.controller.getStatus(), undefined, t);
    assert.equal(shownKind(memo), "on", `at ${t} ms`);
  }
});

test("I6: a fresh launch never shows on before the app answers", async () => {
  const manifest = JSON.parse(fs.readFileSync(new URL("../extension/manifest.json", import.meta.url), "utf8"));
  const onIcon = `icons/${S.iconState(up).prefix}16.png`;
  assert.notEqual(manifest.action.default_icon["16"], onIcon, "the toolbar's first look isn't on");

  const bg = await background();
  // Remembered from an earlier session: counts for nothing.
  assert.equal(bg.controller.everConnected, true);
  let memo = S.present(null, bg.controller.getStatus(), undefined, 0);
  assert.equal(memo.status, null, "nothing to paint before the first try");
  bg.controller.connect();
  memo = S.present(memo, bg.controller.getStatus(), undefined, 100);
  assert.equal(memo.status, null);
  memo = S.present(memo, bg.controller.getStatus(), undefined, S.LINK.graceMs);
  assert.equal(shownKind(memo), "connecting");
  await bg.port().receive(frame("hello_ack"));
  memo = S.present(memo, bg.controller.getStatus(), undefined, 700);
  assert.equal(shownKind(memo), "on", "the first frame shows on at once");
});

test("a retry from can't reach that fails at once never flashes connecting", () => {
  let memo = S.present(null, down, undefined, 0);
  for (let t = 60000; t < 60000 + 10 * 5000; t += 5000) {
    memo = S.present(memo, connecting, undefined, t);
    assert.equal(shownKind(memo), "cant-reach-app");
    memo = S.present(memo, down, undefined, t + 40);
    assert.equal(shownKind(memo), "cant-reach-app");
  }
  // A try still waiting after the grace says so.
  memo = S.present(memo, connecting, undefined, 200000);
  memo = S.present(memo, connecting, undefined, 200000 + S.LINK.graceMs);
  assert.equal(shownKind(memo), "connecting");
});

test("a resumed surface holds what it shows while its background answers", () => {
  let memo = S.present(null, up, undefined, 0);
  memo = S.resume(memo, 1000);
  const restarted = S.withdrawn(up, true);
  memo = S.present(memo, restarted, undefined, 1000);
  assert.equal(shownKind(memo), "on");
  assert.equal(memo.wakeAt, 1000 + S.LINK.graceMs);
  // Answered within the hold: on, never a flash of anything else.
  assert.equal(shownKind(S.present(memo, up, undefined, 1200)), "on");
  // Not answered: after the hold, the truth, and never "can't reach".
  memo = S.present(memo, restarted, undefined, 1000 + S.LINK.graceMs);
  assert.equal(shownKind(memo), "connecting");
});

test("connecting with no lease ends as can't reach after the offline timer", async () => {
  const bg = await background();
  bg.controller.connect();
  // The app permits but leases nothing, every renewal.
  await bg.port().receive(frame("hello_ack", 0));
  let memo = null;
  for (let t = 0; t <= 40000; t += 500) {
    await bg.advanceTo(t);
    if (t > 0 && t % 5000 === 0) await bg.port().receive(frame("state", 0));
    const status = bg.controller.getStatus();
    assert.equal(S.derive(status).kind, "connecting");
    memo = S.present(memo, status, undefined, t);
    const kind = shownKind(memo);
    if (t >= S.LINK.offlineAfterMs) assert.equal(kind, "cant-reach-app", `at ${t} ms`);
    else if (t >= S.LINK.graceMs) assert.equal(kind, "connecting", `at ${t} ms`);
  }
});

test("a renewal that never settles holds the surfaces only while the last state is earned", async (t) => {
  const bg = await background();
  bg.controller.connect();
  await bg.port().receive(frame("hello_ack"));
  const original = Outbox.promoteHeldForGeneration;
  t.after(() => { Outbox.promoteHeldForGeneration = original; });
  Outbox.promoteHeldForGeneration = () => new Promise(() => {});

  await bg.advanceTo(12000);
  bg.port().receive(frame("state"));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(bg.controller.getStatus().hostSettling, true);
  let answered = null;
  bg.controller.settledStatus().then((status) => { answered = status; });
  // Another renewal while still settling doesn't extend the hold.
  await bg.advanceTo(14000);
  bg.port().receive(frame("state"));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(bg.controller.getStatus().hostSettling, true);
  // The last settled frame came at 0 with a 15 s lease.
  await bg.advanceTo(15000);
  await new Promise((resolve) => setImmediate(resolve));
  const status = bg.controller.getStatus();
  assert.equal(status.hostSettling, false);
  assert.equal(on(status), false);
  assert.ok(answered, "a surface waiting for the settled state gets an answer");
  assert.equal(answered.hostSettling, false);
});
