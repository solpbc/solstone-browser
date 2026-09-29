// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import fs from "node:fs";

import "fake-indexeddb/auto";
await import(new URL("../extension/native-browser/constants.js", import.meta.url));
await import(new URL("../extension/native-browser/schemas.js", import.meta.url));
await import(new URL("../extension/native-browser/schema-validator.js", import.meta.url));
await import(new URL("../extension/native-browser/codec.js", import.meta.url));
await import(new URL("../extension/lib/uuid.js", import.meta.url));
await import(new URL("../extension/lib/blocks.js", import.meta.url));
await import(new URL("../extension/lib/segment.js", import.meta.url));
await import(new URL("../extension/lib/db.js", import.meta.url));
await import(new URL("../extension/lib/gate.js", import.meta.url));
await import(new URL("../extension/lib/native_outbox.js", import.meta.url));

const DB = globalThis.SolstoneDB;
const Outbox = globalThis.SolstoneNativeOutbox;
const Gate = globalThis.SolstoneCaptureGate;

async function resetDB() {
  await DB.clear("outbox");
  await DB.clear("producer");
  await DB.clear("meta");
}

test("computeDecision: closed when extension is paused", () => {
  const res = Gate.computeDecision({
    paused: true,
    consentVersion: Gate.CONSENT_VERSION,
    originGranted: true,
    lease: { token: "tok", generation: "gen", receivedAt: Date.now(), freshnessMs: 5000 },
  });
  assert.deepEqual(res, { open: false, reason: "extension-paused" });
});

test("computeDecision: closed when consent version does not match", () => {
  const res = Gate.computeDecision({
    paused: false,
    consentVersion: 0,
    originGranted: true,
    lease: { token: "tok", generation: "gen", receivedAt: Date.now(), freshnessMs: 5000 },
  });
  assert.deepEqual(res, { open: false, reason: "missing-consent" });
});

test("computeDecision: closed when origin is not granted", () => {
  const res = Gate.computeDecision({
    paused: false,
    consentVersion: Gate.CONSENT_VERSION,
    originGranted: false,
    lease: { token: "tok", generation: "gen", receivedAt: Date.now(), freshnessMs: 5000 },
  });
  assert.deepEqual(res, { open: false, reason: "origin" });
});

test("computeDecision: closed when pressure is active", () => {
  const res = Gate.computeDecision({
    paused: false,
    consentVersion: Gate.CONSENT_VERSION,
    originGranted: true,
    pressure: { active: true },
    hostCapture: "permitted",
    capturePermitted: true,
    lease: { token: "tok", generation: "gen", receivedAt: Date.now(), freshnessMs: 5000 },
  });
  assert.deepEqual(res, { open: false, reason: "pressure" });
});

test("computeDecision: closed when capturePermitted is false (e.g. custody full)", () => {
  const res = Gate.computeDecision({
    paused: false,
    consentVersion: Gate.CONSENT_VERSION,
    originGranted: true,
    hostCapture: "permitted",
    capturePermitted: false,
    lease: { token: "tok", generation: "gen", receivedAt: Date.now(), freshnessMs: 5000 },
  });
  assert.deepEqual(res, { open: false, reason: "custody-full" });
});

test("computeDecision: closed when hostCapture is intake_off", () => {
  const res = Gate.computeDecision({
    paused: false,
    consentVersion: Gate.CONSENT_VERSION,
    originGranted: true,
    hostCapture: "intake_off",
    capturePermitted: false,
    lease: { token: "tok", generation: "gen", receivedAt: Date.now(), freshnessMs: 5000 },
  });
  assert.deepEqual(res, { open: false, reason: "intake-off" });
});

test("computeDecision: closed when hostCapture is not_paired", () => {
  const res = Gate.computeDecision({
    paused: false,
    consentVersion: Gate.CONSENT_VERSION,
    originGranted: true,
    hostCapture: "not_paired",
    capturePermitted: false,
    lease: { token: "tok", generation: "gen", receivedAt: Date.now(), freshnessMs: 5000 },
  });
  assert.deepEqual(res, { open: false, reason: "not-paired" });
});

test("computeDecision: closed when hostCapture is paused", () => {
  const res = Gate.computeDecision({
    paused: false,
    consentVersion: Gate.CONSENT_VERSION,
    originGranted: true,
    hostCapture: "paused",
    capturePermitted: false,
    lease: { token: "tok", generation: "gen", receivedAt: Date.now(), freshnessMs: 5000 },
  });
  assert.deepEqual(res, { open: false, reason: "host-paused" });
});

test("computeDecision: closed when hostCapture is unavailable", () => {
  const res = Gate.computeDecision({
    paused: false,
    consentVersion: Gate.CONSENT_VERSION,
    originGranted: true,
    hostCapture: "unavailable",
    capturePermitted: false,
    lease: { token: "tok", generation: "gen", receivedAt: Date.now(), freshnessMs: 5000 },
  });
  assert.deepEqual(res, { open: false, reason: "host-unavailable" });
});

test("computeDecision: closed when disconnected / no lease", () => {
  const res = Gate.computeDecision({
    paused: false,
    consentVersion: Gate.CONSENT_VERSION,
    originGranted: true,
    hostCapture: "permitted",
    capturePermitted: true,
    lease: null,
  });
  assert.deepEqual(res, { open: false, reason: "disconnected" });
});

test("computeDecision: closed when lease is stale", () => {
  const now = 10000;
  const res = Gate.computeDecision({
    paused: false,
    consentVersion: Gate.CONSENT_VERSION,
    originGranted: true,
    hostCapture: "permitted",
    capturePermitted: true,
    lease: { token: "tok", generation: "gen", receivedAt: 1000, freshnessMs: 5000 },
    now,
  });
  assert.deepEqual(res, { open: false, reason: "stale" });
});

test("computeDecision: open when all conditions are satisfied", () => {
  const now = 3000;
  const res = Gate.computeDecision({
    paused: false,
    consentVersion: Gate.CONSENT_VERSION,
    originGranted: true,
    hostCapture: "permitted",
    capturePermitted: true,
    lease: { token: "tok", generation: "gen", receivedAt: 1000, freshnessMs: 5000 },
    now,
  });
  assert.deepEqual(res, { open: true, reason: "open" });
});

test("runIfPermitted: executes 0 hooks when decision is closed", () => {
  let discoverCalled = false;
  let readMetaCalled = false;
  let skimCalled = false;

  const result = Gate.runIfPermitted({ open: false, reason: "extension-paused" }, {
    discover: () => { discoverCalled = true; return "root"; },
    readMeta: () => { readMetaCalled = true; return {}; },
    skim: () => { skimCalled = true; return []; },
  });

  assert.equal(result, null);
  assert.equal(discoverCalled, false);
  assert.equal(readMetaCalled, false);
  assert.equal(skimCalled, false);
});

test("runIfPermitted: executes hooks in sequence when decision is open", () => {
  const callOrder = [];

  const result = Gate.runIfPermitted({ open: true, reason: "open" }, {
    discover: () => { callOrder.push("discover"); return "fake-root"; },
    readMeta: () => { callOrder.push("readMeta"); return { title: "Test" }; },
    skim: (root) => { callOrder.push(`skim:${root}`); return [{ id: "1", text: "hi" }]; },
  });

  assert.deepEqual(callOrder, ["discover", "readMeta", "skim:fake-root"]);
  assert.deepEqual(result, {
    root: "fake-root",
    meta: { title: "Test" },
    blocks: [{ id: "1", text: "hi" }],
  });
});

test("gate: deferred callbacks stay closed", async () => {
  let discoverCount = 0;
  let skimCount = 0;
  let sentMessages = [];
  const messageListeners = [];
  const windowListeners = {};
  const docListeners = {};
  let idleCallback = null;

  const fakeLocation = { origin: "https://mail.google.com", host: "mail.google.com" };
  const fakeDoc = {
    readyState: "loading",
    title: "Inbox",
    addEventListener: (type, fn) => { docListeners[type] = fn; },
    visibilityState: "visible",
  };
  const fakeWin = {
    addEventListener: (type, fn) => { windowListeners[type] = fn; },
  };

  const fakeAdapters = {
    adapterForHost: () => ({ name: "gmail" }),
    pickRoot: () => {
      discoverCount++;
      return { tagName: "DIV", children: [{ nodeType: 3, nodeValue: "msg" }] };
    },
  };
  const fakeSkim = {
    skim: () => {
      skimCount++;
      return [{ id: "1", type: "message", depth: 0, text: "msg" }];
    },
  };
  const fakeIndicator = {
    show: () => {},
    remove: () => {},
  };

  const fakeChrome = {
    runtime: {
      id: "fake-runtime-id",
      sendMessage: (msg, cb) => {
        sentMessages.push(msg);
        if (msg.kind === "hello" && typeof cb === "function") {
          cb({
            ok: true,
            lease: { token: "t1", generation: "gen-1", freshnessMs: 10000 },
            paused: false,
            consentVersion: 1,
            grantedOrigins: ["https://mail.google.com"],
            showPageIndicator: false,
            hostCapture: "permitted",
            capturePermitted: true,
          });
        }
      },
      onMessage: {
        addListener: (fn) => messageListeners.push(fn),
      },
    },
  };

  const sandbox = {
    globalThis: null,
    console,
    crypto,
    performance: { now: () => 1000 },
    location: fakeLocation,
    document: fakeDoc,
    window: fakeWin,
    chrome: fakeChrome,
    requestIdleCallback: (cb) => { idleCallback = cb; },
    setTimeout: (fn, ms) => { if (ms <= 1000) fn(); return 1; },
    clearTimeout: () => {},
    setInterval: (fn) => { fn(); return 1; },
    clearInterval: () => {},
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    SolstoneAdapters: fakeAdapters,
    SolstoneSkim: fakeSkim,
    SolstoneIndicator: fakeIndicator,
    SolstoneCaptureGate: Gate,
    SolstoneNativeBrowserConstants: globalThis.SolstoneNativeBrowserConstants,
    SolstoneNativeBrowser: globalThis.SolstoneNativeBrowser,
  };
  sandbox.globalThis = sandbox;

  const contentCode = fs.readFileSync(new URL("../extension/content.js", import.meta.url), "utf-8");
  vm.runInNewContext(contentCode, sandbox);

  // Trigger DOMContentLoaded boot
  if (windowListeners["DOMContentLoaded"]) {
    windowListeners["DOMContentLoaded"]();
  } else if (docListeners["DOMContentLoaded"]) {
    docListeners["DOMContentLoaded"]();
  }
  await new Promise((r) => queueMicrotask(r));

  assert.ok(discoverCount > 0);
  assert.ok(skimCount > 0);

  // Reset counters
  discoverCount = 0;
  skimCount = 0;

  // Revoke origin through a worker sender (no sender.tab)
  for (const listener of messageListeners) {
    listener(
      {
        kind: "leaseUpdate",
        lease: null,
        paused: false,
        consentVersion: 1,
        grantedOrigins: [],
        showIndicator: false,
        hostCapture: "permitted",
      },
      { id: "fake-runtime-id" }, // worker sender: no tab
      () => {}
    );
  }

  // Fire deferred callbacks (idle callback and resume listener)
  if (idleCallback) idleCallback();
  if (windowListeners["resume"]) windowListeners["resume"]();

  // Both counters MUST remain 0 because gate is closed!
  assert.equal(discoverCount, 0);
  assert.equal(skimCount, 0);

  // A sender that HAS a tab cannot open the gate with leaseUpdate
  for (const listener of messageListeners) {
    listener(
      {
        kind: "leaseUpdate",
        lease: { token: "t2", generation: "gen-2", freshnessMs: 10000 },
        paused: false,
        consentVersion: 1,
        grantedOrigins: ["https://mail.google.com"],
        showIndicator: false,
        hostCapture: "permitted",
      },
      { id: "fake-runtime-id", tab: { id: 99 } }, // sender with tab
      () => {}
    );
  }

  if (idleCallback) idleCallback();
  if (windowListeners["resume"]) windowListeners["resume"]();

  assert.equal(discoverCount, 0);
  assert.equal(skimCount, 0);
});

test("gate: withdrawal closes a scheduled hello while getAll is pending", async () => {
  for (const rejectSnapshot of [false, true]) {
    let reads = 0;
    const helloCallbacks = [];
    const messageListeners = [];
    let settlePermissions;
    const permissionSnapshot = new Promise((resolve, reject) => {
      settlePermissions = {resolve, reject};
    });
    const fakeChrome = {
      runtime: {
        id: "fake-runtime-id",
        sendMessage: (msg, cb) => { if (msg.kind === "hello") helloCallbacks.push(cb); },
        onMessage: { addListener: (fn) => messageListeners.push(fn) },
      },
    };
    const sandbox = {
      globalThis: null,
      console,
      crypto,
      performance: {now: () => 1000},
      location: {origin:"https://mail.google.com", host:"mail.google.com"},
      document: {readyState:"complete", title:"Inbox", addEventListener(){}, visibilityState:"visible"},
      window: {addEventListener(){}},
      chrome: fakeChrome,
      setTimeout: () => 1,
      clearTimeout() {},
      setInterval: () => 1,
      clearInterval() {},
      MutationObserver: class {observe(){} disconnect(){}},
      SolstoneAdapters: {adapterForHost:() => ({name:"gmail"}), pickRoot:() => {reads++; return {tagName:"DIV",children:[{}]};}},
      SolstoneSkim: {skim:() => [{id:"1",type:"text",depth:0,text:"Inbox"}]},
      SolstoneIndicator: {show(){}, remove(){}},
      SolstoneCaptureGate: Gate,
    };
    sandbox.globalThis = sandbox;
    const contentCode = fs.readFileSync(new URL("../extension/content.js", import.meta.url), "utf-8");
    vm.runInNewContext(contentCode, sandbox);
    assert.equal(helloCallbacks.length, 1);

    // Model the background listener's synchronous lease publication before
    // its permission snapshot resolves or rejects.
    const removal = (async () => {
      for (const listener of messageListeners) listener({
        kind:"leaseUpdate", lease:null, paused:false, consentVersion:1,
        grantedOrigins:[], showIndicator:false, hostCapture:"permitted", capturePermitted:false,
        captureEpoch:2,
      }, {id:"fake-runtime-id"}, () => {});
      await permissionSnapshot;
    })();
    helloCallbacks[0]({
      ok:true, lease:{token:"old",generation:"g",freshnessMs:10000}, paused:false,
      consentVersion:1, grantedOrigins:["https://mail.google.com"], hostCapture:"permitted",
      capturePermitted:true, captureEpoch:1, connectionGeneration:1, destinationGeneration:"g",
    });
    assert.equal(reads, 0);

    if (rejectSnapshot) settlePermissions.reject(new Error("permission snapshot unavailable"));
    else settlePermissions.resolve({origins:[]});
    await removal.catch(() => {});
    assert.equal(reads, 0);
  }
});

test("gate: reopen after pause snapshots", async () => {
  await resetDB();

  // Enqueue initial skim
  const b1 = await Outbox.enqueueSkim({
    inst: "inst-p",
    ctx: "ctx-p",
    destinationGeneration: "gen-1",
    senderUrl: "https://example.test/page",
    site: "example.test",
    title: "Title",
    adapter: "generic",
    blocks: [{ id: "1", type: "text", depth: 0, text: "Before Pause" }],
    nowMs: 1000,
  });
  assert.equal(b1.enqueued, true);

  // Pause
  await Outbox.markAllSnapshotRequired();

  // Next enqueued record after unpause must be segment_start
  const b2 = await Outbox.enqueueSkim({
    inst: "inst-p",
    ctx: "ctx-p",
    destinationGeneration: "gen-1",
    senderUrl: "https://example.test/page",
    site: "example.test",
    title: "Title",
    adapter: "generic",
    blocks: [{ id: "1", type: "text", depth: 0, text: "Before Pause" }, { id: "2", type: "text", depth: 0, text: "After Unpause" }],
    nowMs: 2000,
  });

  assert.equal(b2.enqueued, true);
  const all = await Outbox.getAll();
  assert.equal(all.length, 2);

  // First batch unchanged
  assert.equal(all[0].batchId, b1.batchId);
  assert.equal(all[0].records[0].t, "segment_start");
  assert.equal(all[0].records[0].blocks.length, 1);

  // Second batch is a snapshot (segment_start), not deltas!
  assert.equal(all[1].batchId, b2.batchId);
  assert.equal(all[1].records.length, 1);
  assert.equal(all[1].records[0].t, "segment_start");
  assert.equal(all[1].records[0].blocks.length, 2);
});

test("gate: solicited response after grantRequestMono + freshnessMs does not call discover/skim", async () => {
  let discoverCount = 0;
  let skimCount = 0;
  let contentTime = 1000;

  const fakeAdapters = {
    adapterForHost: () => ({ name: "gmail" }),
    pickRoot: () => {
      discoverCount++;
      return { tagName: "DIV", children: [{ nodeType: 3, nodeValue: "msg" }] };
    },
  };
  const fakeSkim = {
    skim: () => {
      skimCount++;
      return [{ id: "1", type: "message", depth: 0, text: "msg" }];
    },
  };

  const fakeChrome = {
    runtime: {
      id: "fake-runtime-id",
      sendMessage: (msg, cb) => {
        if (msg.kind === "hello" && typeof cb === "function") {
          // Advance content clock past freshnessMs (freshnessMs = 5000, now = 7000)
          contentTime = 7000;
          cb({
            ok: true,
            lease: { token: "t1", generation: "gen-1", freshnessMs: 5000 },
            paused: false,
            consentVersion: 1,
            grantedOrigins: ["https://mail.google.com"],
            showPageIndicator: false,
            hostCapture: "permitted",
            capturePermitted: true,
          });
        }
      },
      onMessage: { addListener: () => {} },
    },
  };

  const sandbox = {
    globalThis: null,
    console,
    crypto,
    performance: { now: () => contentTime },
    location: { origin: "https://mail.google.com", host: "mail.google.com" },
    document: { readyState: "complete", title: "Inbox", addEventListener: () => {}, visibilityState: "visible" },
    window: { addEventListener: () => {} },
    chrome: fakeChrome,
    setTimeout: (fn, ms) => { if (ms <= 1000) fn(); return 1; },
    clearTimeout: () => {},
    MutationObserver: class { observe() {} disconnect() {} },
    SolstoneAdapters: fakeAdapters,
    SolstoneSkim: fakeSkim,
    SolstoneIndicator: { show: () => {}, remove: () => {} },
    SolstoneCaptureGate: Gate,
    SolstoneNativeBrowserConstants: globalThis.SolstoneNativeBrowserConstants,
    SolstoneNativeBrowser: globalThis.SolstoneNativeBrowser,
  };
  sandbox.globalThis = sandbox;

  const contentCode = fs.readFileSync(new URL("../extension/content.js", import.meta.url), "utf-8");
  vm.runInNewContext(contentCode, sandbox);

  await new Promise((r) => queueMicrotask(r));
  assert.equal(discoverCount, 0);
  assert.equal(skimCount, 0);
});

test("gate: resnapshot message makes 0 discover/skim calls when closed, 1 when open", async () => {
  let discoverCount = 0;
  let skimCount = 0;
  let messageListener = null;

  const fakeAdapters = {
    adapterForHost: () => ({ name: "gmail" }),
    pickRoot: () => {
      discoverCount++;
      return { tagName: "DIV", children: [{ nodeType: 3, nodeValue: "msg" }] };
    },
  };
  const fakeSkim = {
    skim: () => {
      skimCount++;
      return [{ id: "1", type: "message", depth: 0, text: "msg" }];
    },
  };

  const fakeChrome = {
    runtime: {
      id: "fake-runtime-id",
      sendMessage: () => {},
      onMessage: {
        addListener: (fn) => { messageListener = fn; },
      },
    },
  };

  const sandbox = {
    globalThis: null,
    console,
    crypto,
    performance: { now: () => 1000 },
    location: { origin: "https://mail.google.com", host: "mail.google.com" },
    document: { readyState: "loading", title: "Inbox", addEventListener: () => {}, visibilityState: "visible" },
    window: { addEventListener: () => {} },
    chrome: fakeChrome,
    setTimeout: (fn, ms) => { if (ms <= 1000) fn(); return 1; },
    clearTimeout: () => {},
    setInterval: (fn) => { fn(); return 1; },
    clearInterval: () => {},
    MutationObserver: class { observe() {} disconnect() {} },
    SolstoneAdapters: fakeAdapters,
    SolstoneSkim: fakeSkim,
    SolstoneIndicator: { show: () => {}, remove: () => {} },
    SolstoneCaptureGate: Gate,
    SolstoneNativeBrowserConstants: globalThis.SolstoneNativeBrowserConstants,
    SolstoneNativeBrowser: globalThis.SolstoneNativeBrowser,
  };
  sandbox.globalThis = sandbox;

  const contentCode = fs.readFileSync(new URL("../extension/content.js", import.meta.url), "utf-8");
  vm.runInNewContext(contentCode, sandbox);

  assert.ok(messageListener);

  // Closed gate: resnapshot message
  messageListener({ kind: "resnapshot" }, { id: "fake-runtime-id" }, () => {});
  assert.equal(discoverCount, 0);
  assert.equal(skimCount, 0);

  // Open gate by delivering positive grant via leaseUpdate + hello response
  let helloCallback = null;
  fakeChrome.runtime.sendMessage = (msg, cb) => {
    if (msg.kind === "hello") helloCallback = cb;
  };
  messageListener(
    {
      kind: "leaseUpdate",
      lease: { token: "t1", generation: "gen-1", freshnessMs: 10000 },
      paused: false,
      consentVersion: 1,
      grantedOrigins: ["https://mail.google.com"],
      showIndicator: false,
      hostCapture: "permitted",
      capturePermitted: true,
    },
    { id: "fake-runtime-id" },
    () => {}
  );

  assert.ok(helloCallback);
  helloCallback({
    ok: true,
    lease: { token: "t1", generation: "gen-1", freshnessMs: 10000 },
    paused: false,
    consentVersion: 1,
    grantedOrigins: ["https://mail.google.com"],
    showPageIndicator: false,
    hostCapture: "permitted",
    capturePermitted: true,
  });

  // Reset counters after initial startObserving / doSkim
  discoverCount = 0;
  skimCount = 0;

  // Open gate: resnapshot message
  messageListener({ kind: "resnapshot" }, { id: "fake-runtime-id" }, () => {});
  assert.equal(discoverCount, 1);
  assert.equal(skimCount, 1);
});
