// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("..", import.meta.url));
await import(root + "/node_modules/fake-indexeddb/auto/index.mjs");
for (const f of [
  "native-browser/constants.js",
  "native-browser/schemas.js",
  "native-browser/schema-validator.js",
  "native-browser/codec.js",
  "lib/uuid.js",
  "lib/blocks.js",
  "lib/hosts.js",
  "lib/segment.js",
  "lib/db.js",
  "lib/gate.js",
  "lib/native_outbox.js",
  "lib/native_port.js",
  "lib/owner_sites.js",
  "lib/router.js",
])
  await import(root + "/extension/" + f);
const grant = {
  ok: true,
  lease: { token: "tok", generation: "gen", freshnessMs: 10000 },
  paused: false,
  consentVersion: 1,
  grantedOrigins: ["https://example.test"],
  hostCapture: "permitted",
  capturePermitted: true,
  connectionGeneration: 1,
  destinationGeneration: "gen",
};
function harness() {
  let t = 0,
    reads = 0,
    listener;
  const requests = [],
    intervals = new Map(),
    sent = [];
  let id = 0;
  const ctx = {
    crypto,
    console,
    performance: { now: () => t },
    location: { origin: "https://example.test", host: "example.test" },
    document: {
      readyState: "complete",
      title: "Example",
      addEventListener() {},
      getElementById() {
        return null;
      },
    },
    window: { addEventListener() {} },
    chrome: {
      runtime: {
        id: "ext",
        sendMessage(m, cb) {
          if (m.kind === "hello") requests.push(cb);
          else sent.push(m);
        },
        onMessage: {
          addListener(fn) {
            listener = fn;
          },
        },
      },
    },
    setTimeout() {
      return ++id;
    },
    clearTimeout() {},
    setInterval(fn) {
      intervals.set(++id, fn);
      return id;
    },
    clearInterval(id) {
      intervals.delete(id);
    },
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    SolstoneCaptureGate: globalThis.SolstoneCaptureGate,
    SolstoneAdapters: {
      adapterForHost() {
        return { name: "generic" };
      },
      pickRoot() {
        reads++;
        return { tagName: "DIV", children: [{}] };
      },
    },
    SolstoneSkim: {
      skim() {
        return [{ id: "1", type: "text", depth: 0, text: "Hello" }];
      },
    },
    SolstoneIndicator: { show() {}, remove() {} },
  };
  vm.runInNewContext(
    fs.readFileSync(root + "/extension/content.js", "utf8"),
    ctx,
  );
  return {
    requests,
    sent,
    setTime(x) {
      t = x;
    },
    msg(m) {
      listener(m, { id: "ext" }, () => {});
    },
    tick() {
      for (const fn of [...intervals.values()]) fn();
    },
    get reads() {
      return reads;
    },
  };
}

test("content: current reply captures but expired or pre-stop replies never read DOM", () => {
  let h = harness();
  h.requests[0](grant);
  h.tick();
  assert.ok(h.reads > 0);
  h = harness();
  h.setTime(10000);
  h.requests[0](grant);
  h.tick();
  assert.equal(h.reads, 0);
  h = harness();
  h.msg({ kind: "stop" });
  h.requests[0](grant);
  h.tick();
  assert.equal(h.reads, 0);
});

test("content: old response cannot borrow a later request's start time", () => {
  const h = harness();
  h.setTime(9000);
  h.msg({ ...grant, kind: "leaseUpdate" });
  h.setTime(10001);
  h.requests[0](grant);
  h.tick();
  assert.equal(h.reads, 0);
  h.requests[1]({ ...grant, lease: { ...grant.lease, freshnessMs: 1000 } });
  h.tick();
  assert.equal(h.reads, 0);
});

const R = globalThis.SolstoneRouter,
  D = globalThis.SolstoneDB,
  O = globalThis.SolstoneNativeOutbox;
const inst = "00000000-0000-0000-0000-000000000001";
function port() {
  return {
    inst,
    captureEpoch: 0,
    grantedOrigins: new Set(["https://example.test"]),
    consentVersion: 1,
    hostCapture: "permitted",
    capturePermitted: true,
    paused: false,
    pressure: { active: false },
    lease: {
      token: "tok",
      generation: "gen",
      freshnessMs: 10000,
      receivedAt: 0,
    },
    connectionGeneration: 1,
    destinationGeneration: "gen",
    now: () => 9000,
    notify() {
      O.checkAuthorization?.();
    },
    drain() {},
  };
}
const sender = {
  id: "ext",
  tab: { id: 101 },
  frameId: 0,
  url: "https://example.test/page",
  origin: "https://example.test",
};
const DOCUMENT_KEY = "abcdefabcdefabcdefabcdefabcdefab";
const hello = (realmToken) => ({ kind: "hello", realmToken, documentKey: DOCUMENT_KEY });
const skim = (realmToken) => ({
  kind: "skim",
  documentKey: DOCUMENT_KEY,
  captureEpoch: 0,
  realmToken,
  connectionGeneration: 1,
  destinationGeneration: "gen",
  leaseToken: "tok",
  blocks: [{ id: "1", type: "text", depth: 0, text: realmToken }],
});
async function reset() {
  for (const store of ["outbox", "producer", "meta"]) await D.clear(store);
  R.frameBindings.clear();
  R.frameChallenges.clear();
}

test("router: remaining lease and live realm confirmation bound every skim", async () => {
  await reset();
  const p = port();
  let current = "A";
  const deps = {
    runtimeId: "ext",
    port: p,
    confirmRealm: async (_tab, _frame, realm) => realm === current,
  };
  const a = await R.route(hello("A"), sender, deps);
  assert.equal(a.lease.freshnessMs, 1000);
  assert.equal((await R.route(skim("A"), sender, deps)).ok, true);
  const ctx = R.frameBindings.get(`101:0:${DOCUMENT_KEY}`).ctx;
  await R.route(hello("A"), sender, deps);
  assert.equal(R.frameBindings.get(`101:0:${DOCUMENT_KEY}`).ctx, ctx);
  current = "B";
  await R.route(hello("B"), sender, deps);
  assert.equal((await R.route(hello("A"), sender, deps)).ok, false);
  assert.equal((await R.route(skim("A"), sender, deps)).ok, false);
  assert.equal(
    (await R.route({ kind: "bye", realmToken: "A", documentKey: DOCUMENT_KEY }, sender, deps)).ok,
    false,
  );
  assert.equal((await R.route(skim("B"), sender, deps)).ok, true);
  const incomplete = skim("B");
  delete incomplete.leaseToken;
  assert.equal((await R.route(incomplete, sender, deps)).ok, false);
});

test("router: documentId does not let a skim replace the current realm", async () => {
  await reset();
  const p = port(),
    s = { ...sender, documentId: "doc" };
  const deps = { runtimeId: "ext", port: p, confirmRealm: async () => true };
  await R.route(hello("current"), s, deps);
  assert.equal((await R.route(skim("stale"), s, deps)).ok, false);
  assert.equal(R.frameBindings.get("101:0:doc").realmToken, "current");
});

test("router: omitted unchanged skims record occurrences by retained content and document", async () => {
  await reset();
  const notifications = [];
  const p = new globalThis.SolstoneNativePort({inst, runtimeId:"ext", now:() => 9000});
  p.grantedOrigins.add("https://example.test");
  p.hostCapture = "permitted";
  p.capturePermitted = true;
  p.consentVersion = 1;
  p.lease = {token:"tok", generation:"gen", freshnessMs:10000, receivedAt:0};
  p.connectionGeneration = 1;
  p.destinationGeneration = "gen";
  p.onStatusChange = (status) => notifications.push(status);
  const deps = {runtimeId:"ext", port:p, confirmRealm:async () => true};
  const docKey = "abcdefabcdefabcdefabcdefabcdefab";
  const firstHello = await R.route({...hello("A"), documentKey:docKey}, sender, deps);
  const message = (overrides = {}) => ({
    ...skim("A"),
    documentKey:docKey,
    captureEpoch:firstHello.captureEpoch,
    ...overrides,
  });

  const initial = await R.route(message(), sender, deps);
  assert.equal(initial.ok, true);
  assert.equal(initial.result.enqueued, true);
  const notificationsAfterInitial = notifications.length;
  const firstOmitted = await R.route(message({omitted:true, clips:["label"]}), sender, deps);
  assert.equal(firstOmitted.ok, true);
  assert.equal(firstOmitted.result.enqueued, false);
  assert.equal(firstOmitted.result.disposition, "empty");
  assert.equal(p.truncationByOrigin["https://example.test"].count, 1);
  assert.equal(notifications.length, notificationsAfterInitial + 1, "empty enqueue still publishes a new omitted occurrence");
  const firstId = p.truncationByOrigin["https://example.test"].newestId;
  assert.match(firstId, new RegExp("^" + docKey + ":"));

  await R.route(message({omitted:true, clips:["label"]}), sender, deps);
  assert.equal(p.truncationByOrigin["https://example.test"].count, 1, "identical reread is deduplicated");
  await R.route(message({omitted:true, clips:["blocks", "label"]}), sender, deps);
  assert.equal(p.truncationByOrigin["https://example.test"].count, 2, "a changed clip set is a new observation");

  const otherDocKey = "fedcbafedcbafedcbafedcbafedcbafe";
  const otherSender = {...sender, frameId:1};
  const otherHello = await R.route({...hello("B"), documentKey:otherDocKey}, otherSender, deps);
  const otherMessage = {
    ...skim("B"),
    documentKey:otherDocKey,
    captureEpoch:otherHello.captureEpoch,
    omitted:true,
    clips:["label"],
  };
  const other = await R.route(otherMessage, otherSender, deps);
  assert.equal(other.ok, true);
  assert.equal(p.truncationByOrigin["https://example.test"].count, 3, "a second document has a separate occurrence");

  const origin = "https://example.test";
  const newestId = p.truncationByOrigin[origin].newestId;
  assert.deepEqual(await p.dismissTruncation(origin, newestId), {ok:true, dismissed:true});
  assert.equal(p.truncationByOrigin[origin].count, 0);

  await R.route(message({omitted:true, clips:["label"]}), sender, deps);
  await R.route(otherMessage, otherSender, deps);
  assert.equal(p.truncationByOrigin[origin].count, 0, "dismiss-through suppresses earlier occurrences from both documents");

  const changed = await R.route({...otherMessage, clips:["text", "label"]}, otherSender, deps);
  assert.equal(changed.ok, true);
  assert.equal(p.truncationByOrigin[origin].count, 1, "a changed observation after dismissal is recorded");
});

test("capture transaction aborts when authorization closes after write success", async () => {
  await reset();
  const p = port(),
    deps = { runtimeId: "ext", port: p, confirmRealm: async () => true };
  await R.route(hello("A"), sender, deps);
  const original = IDBObjectStore.prototype.add;
  let withdrew = false;
  IDBObjectStore.prototype.add = function (...args) {
    const request = original.apply(this, args);
    if (this.name === "outbox")
      request.addEventListener("success", () => {
        p.paused = true;
        withdrew = true;
      });
    return request;
  };
  try {
    const result = await R.route(skim("A"), sender, deps);
    assert.equal(withdrew, true);
    assert.equal(result.ok, false);
    assert.deepEqual(await D.getAll("outbox"), []);
    assert.deepEqual(await D.getAll("producer"), []);
  } finally {
    IDBObjectStore.prototype.add = original;
  }
});

test("grant completion rechecks app state and consent after permission await", async () => {
  await reset();
  const p = port(),
    ext = { id: "ext", url: "chrome-extension://ext/popup.html" };
  globalThis.chrome = { permissions: { contains: async () => true, getAll: async () => ({ origins: ["*://*/*"] }) } };
  const deps = { runtimeId: "ext", port: p, setCfg: async () => {} };
  p.hostCapture = "not_paired";
  assert.equal(
    (
      await R.route(
        { cmd: "addGrantedOrigin", origin: "https://new.test" },
        ext,
        deps,
      )
    ).ok,
    false,
  );
  p.hostCapture = "permitted";
  let resolve, enteredResolve;
  const entered = new Promise((r) => (enteredResolve = r));
  chrome.permissions.contains = () =>
    new Promise((r) => {
      resolve = r;
      enteredResolve();
    });
  const pending = R.route(
    { cmd: "addGrantedOrigin", origin: "https://new.test" },
    ext,
    deps,
  );
  await entered;
  p.consentVersion = 0;
  resolve(true);
  assert.equal((await pending).ok, false);
  assert.equal(p.grantedOrigins.has("https://new.test"), false);
});

test("content: positive destination notification closes old lease pending its reply", () => {
  const h = harness();
  h.requests[0](grant);
  h.tick();
  const reads = h.reads,
    sent = h.sent.length;
  h.msg({ ...grant, kind: "leaseUpdate", destinationGeneration: "other" });
  h.msg({ kind: "resnapshot" });
  assert.equal(h.reads, reads);
  assert.equal(h.sent.length, sent);
});

test("capture epoch fences pre-pause work waiting to enter a transaction", async () => {
  await reset();
  const p = new globalThis.SolstoneNativePort({
    inst,
    runtimeId: "ext",
    now: () => 9000,
  });
  Object.assign(p, port());
  const deps = { runtimeId: "ext", port: p, confirmRealm: async () => true };
  const response = await R.route(hello("A"), sender, deps);
  const original = D.tx;
  let release, enteredResolve;
  const entered = new Promise((r) => (enteredResolve = r)),
    stalled = new Promise((r) => (release = r));
  D.tx = async (...args) => {
    enteredResolve();
    await stalled;
    return original(...args);
  };
  const pending = R.route(
    { ...skim("A"), captureEpoch: response.captureEpoch },
    sender,
    deps,
  );
  await entered;
  // Use the real controller notification path on both edges.
  p.paused = true;
  globalThis.SolstoneNativePort.prototype.notify.call(p);
  p.paused = false;
  globalThis.SolstoneNativePort.prototype.notify.call(p);
  D.tx = original;
  release();
  assert.equal((await pending).ok, false);
  assert.equal((await D.getAll("outbox")).length, 0);
  assert.equal(
    (
      await R.route(
        { ...skim("A"), captureEpoch: response.captureEpoch },
        sender,
        deps,
      )
    ).ok,
    false,
  );
});

test("content: unchanged authority notification does not repeat a page walk", () => {
  const h = harness();
  const authority = { ...grant, captureEpoch: 4 };
  h.requests[0](authority);
  h.tick();
  const reads = h.reads,
    requests = h.requests.length;
  h.msg({ ...authority, kind: "leaseUpdate" });
  h.tick();
  assert.equal(h.reads, reads);
  assert.equal(h.requests.length, requests);
});
