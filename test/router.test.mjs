// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import assert from "node:assert/strict";
import test from "node:test";

import "fake-indexeddb/auto";
await import(new URL("../extension/native-browser/constants.js", import.meta.url));
await import(new URL("../extension/native-browser/schemas.js", import.meta.url));
await import(new URL("../extension/native-browser/schema-validator.js", import.meta.url));
await import(new URL("../extension/native-browser/codec.js", import.meta.url));
await import(new URL("../extension/lib/uuid.js", import.meta.url));
await import(new URL("../extension/lib/blocks.js", import.meta.url));
await import(new URL("../extension/lib/hosts.js", import.meta.url));
await import(new URL("../extension/lib/segment.js", import.meta.url));
await import(new URL("../extension/lib/db.js", import.meta.url));
await import(new URL("../extension/lib/gate.js", import.meta.url));
await import(new URL("../extension/lib/native_outbox.js", import.meta.url));
await import(new URL("../extension/lib/native_port.js", import.meta.url));
await import(new URL("../extension/lib/router.js", import.meta.url));

const DB = globalThis.SolstoneDB;
const Outbox = globalThis.SolstoneNativeOutbox;
const Router = globalThis.SolstoneRouter;
const PortController = globalThis.SolstoneNativePort;
globalThis.chrome = { permissions: { contains: async () => true } };
const confirmRealm = async () => true; // This suite supplies a live-frame confirmation; adversarial tests cover stale frames.
const EXT_ID = "fgfnkcefedeheoeamppkiiloncfekakf";

async function resetDB() {
  await DB.clear("outbox");
  await DB.clear("producer");
  await DB.clear("meta");
}

function makePort() {
  const p = new PortController({
    runtimeId: EXT_ID,
    inst: "00000000-0000-0000-0000-000000000001",
    connectNative: () => ({
      postMessage() {},
      disconnect() {},
      onMessage: { addListener() {} },
      onDisconnect: { addListener() {} },
    }),
  });
  p.consentVersion = 1;
  p.hostCapture = "permitted";
  p.capturePermitted = true;
  p.connectionToken = "tok-1";
  p.destinationGeneration = "gen-1";
  p.lease = {
    token: "tok-1",
    generation: "gen-1",
    freshnessMs: 10000,
    receivedAt: p.now(),
  };
  return p;
}

test("router: rejects sender with non-matching extension id", async () => {
  await resetDB();
  const port = makePort();
  const res = await Router.route({ cmd: "getState" }, { id: "wrong-id" }, { runtimeId: EXT_ID, port, confirmRealm });
  assert.deepEqual(res, { ok: false, error: "bad_sender" });
});

test("router: content script sender cannot run privileged extension page commands", async () => {
  await resetDB();
  const port = makePort();
  const sender = {
    id: EXT_ID,
    tab: { id: 1 },
    url: "https://mail.google.com/mail/u/0",
    origin: "https://mail.google.com",
  };

  const res = await Router.route({ cmd: "setPaused", paused: true }, sender, { runtimeId: EXT_ID, port, confirmRealm });
  assert.equal(res.ok, false);
});

test("router: extension page commands execute when sender is extension page", async () => {
  await resetDB();
  const port = makePort();
  const sender = {
    id: EXT_ID,
    url: `chrome-extension://${EXT_ID}/popup.html`,
  };

  const stateRes = await Router.route({ cmd: "getState" }, sender, { runtimeId: EXT_ID, port, confirmRealm });
  assert.equal(stateRes.ok, true);

  const addRes = await Router.route({ cmd: "addGrantedOrigin", origin: "https://mail.google.com" }, sender, {
    runtimeId: EXT_ID,
    port,
    confirmRealm,
    setCfg: async () => {},
    registerSite: async () => "ready",
  });
  assert.deepEqual(addRes, { ok: true, origin: "https://mail.google.com", registration: "ready" });
  assert.equal(port.grantedOrigins.has("https://mail.google.com"), true);

  const ackRes = await Router.route({ cmd: "acknowledgeDisclosure", version: 1 }, sender, { runtimeId: EXT_ID, port, confirmRealm });
  assert.deepEqual(ackRes, { ok: true, consentVersion: 1 });
  const storedConsent = await DB.get("meta", "consentVersion");
  assert.equal(storedConsent, 1);

  const pauseRes = await Router.route({ cmd: "setPaused", paused: true }, sender, { runtimeId: EXT_ID, port, confirmRealm });
  assert.deepEqual(pauseRes, { ok: true, paused: true, saved: true });
  assert.equal(port.paused, true);
});

test("router: content script commands rejected if origin not granted", async () => {
  await resetDB();
  const port = makePort();
  const sender = {
    id: EXT_ID,
    tab: { id: 10 },
    frameId: 0,
    url: "https://unknown.example/page",
    origin: "https://unknown.example",
  };

  const res = await Router.route({ kind: "hello", realmToken: "realm-1" }, sender, { runtimeId: EXT_ID, port, confirmRealm });
  assert.deepEqual(res, { ok: false, error: "origin_not_granted" });
});

test("router: content script creates realm binding on hello", async () => {
  await resetDB();
  const port = makePort();
  port.grantedOrigins.add("https://mail.google.com");

  const sender = {
    id: EXT_ID,
    tab: { id: 10 },
    frameId: 0,
    url: "https://mail.google.com/mail/u/0",
    origin: "https://mail.google.com",
    documentId: "doc-1",
  };

  const res = await Router.route({ kind: "hello", realmToken: "realm-1" }, sender, { runtimeId: EXT_ID, port, confirmRealm });
  assert.equal(res.ok, true);
  assert.ok(res.ctx);
  assert.equal(res.consentVersion, 1);

  const binding = Router.frameBindings.get("10:0");
  assert.ok(binding);
  assert.equal(binding.realmToken, "realm-1");
  assert.equal(binding.ctx, res.ctx);
});

test("router: forged fields do not leak", async () => {
  await resetDB();
  const port = makePort();
  port.grantedOrigins.add("https://mail.google.com");

  const sender = {
    id: EXT_ID,
    tab: { id: 20 },
    frameId: 0,
    url: "https://mail.google.com/mail/u/0/inbox",
    origin: "https://mail.google.com",
  };

  const helloRes = await Router.route({ kind: "hello", realmToken: "realm-forged" }, sender, { runtimeId: EXT_ID, port, confirmRealm });
  assert.equal(helloRes.ok, true);

  const FORGED_MARKER = "SECRET_FORGED_INJECTION_MARKER";
  const skimRes = await Router.route(
    {
      kind: "skim", captureEpoch: port.captureEpoch, connectionGeneration: port.connectionGeneration, destinationGeneration: port.destinationGeneration, leaseToken: port.lease?.token,
      realmToken: "realm-forged",
      site: FORGED_MARKER,
      ctx: FORGED_MARKER,
      meta: { url: FORGED_MARKER, title: "Normal Title", adapter: "gmail" },
      blocks: [{ id: "1", type: "heading", depth: 0, text: "Inbox" }],
    },
    sender,
    { runtimeId: EXT_ID, port, confirmRealm }
  );

  assert.equal(skimRes.ok, true);
  const bindingCtx = Router.frameBindings.get("20:0").ctx;
  assert.ok(bindingCtx);
  const skimJson = JSON.stringify(skimRes);
  assert.equal(skimJson.includes(FORGED_MARKER), false);

  const statusJson = JSON.stringify(port.getStatus());
  assert.equal(statusJson.includes(FORGED_MARKER), false);

  const head = await Outbox.getHead();
  assert.ok(head);
  assert.equal(head.ctx, bindingCtx);
  assert.equal(head.records[0].ctx, bindingCtx);
  assert.equal(head.records[0].url, "https://mail.google.com/mail/u/0/inbox");
});

test("router: second frame cannot claim another context", async () => {
  await resetDB();
  const port = makePort();
  port.grantedOrigins.add("https://mail.google.com");

  const frame1 = {
    id: EXT_ID,
    tab: { id: 30 },
    frameId: 0,
    url: "https://mail.google.com/mail/u/0",
    origin: "https://mail.google.com",
  };

  const frame2 = {
    id: EXT_ID,
    tab: { id: 30 },
    frameId: 1,
    url: "https://mail.google.com/mail/u/0/subframe",
    origin: "https://mail.google.com",
  };

  const res1 = await Router.route({ kind: "hello", realmToken: "realm-frame-1" }, frame1, { runtimeId: EXT_ID, port, confirmRealm });
  const res2 = await Router.route({ kind: "hello", realmToken: "realm-frame-2" }, frame2, { runtimeId: EXT_ID, port, confirmRealm });

  assert.ok(res1.ctx);
  assert.ok(res2.ctx);
  const skim1 = await Router.route({ kind: "skim", captureEpoch: port.captureEpoch, connectionGeneration: port.connectionGeneration, destinationGeneration: port.destinationGeneration, leaseToken: port.lease?.token, realmToken: "realm-frame-1", blocks: [{ id: "1", type: "text", depth: 0, text: "a" }] }, frame1, { runtimeId: EXT_ID, port, confirmRealm });
  const skim2 = await Router.route({ kind: "skim", captureEpoch: port.captureEpoch, connectionGeneration: port.connectionGeneration, destinationGeneration: port.destinationGeneration, leaseToken: port.lease?.token, realmToken: "realm-frame-2", blocks: [{ id: "1", type: "text", depth: 0, text: "b" }] }, frame2, { runtimeId: EXT_ID, port, confirmRealm });
  assert.equal(skim1.ok, true);
  assert.equal(skim2.ok, true);

  const b1 = Router.frameBindings.get("30:0");
  const b2 = Router.frameBindings.get("30:1");
  assert.ok(b1);
  assert.ok(b2);
  assert.notEqual(b1.ctx, b2.ctx);
});

test("router: document change mints a new ctx", async () => {
  await resetDB();
  const port = makePort();
  port.grantedOrigins.add("https://mail.google.com");

  const sender1 = {
    id: EXT_ID,
    tab: { id: 40 },
    frameId: 0,
    documentId: "doc-v1",
    url: "https://mail.google.com/mail/u/0",
    origin: "https://mail.google.com",
  };

  const sender2 = {
    id: EXT_ID,
    tab: { id: 40 },
    frameId: 0,
    documentId: "doc-v2",
    url: "https://mail.google.com/mail/u/0",
    origin: "https://mail.google.com",
  };

  const res1 = await Router.route({ kind: "hello", realmToken: "realm-doc-1" }, sender1, { runtimeId: EXT_ID, port, confirmRealm });
  const res2 = await Router.route({ kind: "hello", realmToken: "realm-doc-2" }, sender2, { runtimeId: EXT_ID, port, confirmRealm });

  assert.notEqual(res1.ctx, res2.ctx);
  assert.equal(Router.frameBindings.get("40:0").documentId, "doc-v2");
});

test("router: absent documentId still binds", async () => {
  await resetDB();
  const port = makePort();
  port.grantedOrigins.add("https://mail.google.com");

  const sender = {
    id: EXT_ID,
    tab: { id: 45 },
    frameId: 0,
    url: "https://mail.google.com/mail/u/0",
    origin: "https://mail.google.com",
  };

  const res = await Router.route({ kind: "hello", realmToken: "realm-nodoc" }, sender, { runtimeId: EXT_ID, port, confirmRealm });
  assert.equal(res.ok, true);
  assert.ok(res.ctx);
  assert.equal(Router.frameBindings.get("45:0").realmToken, "realm-nodoc");

  const skimRes = await Router.route(
    {
      kind: "skim", captureEpoch: port.captureEpoch, connectionGeneration: port.connectionGeneration, destinationGeneration: port.destinationGeneration, leaseToken: port.lease?.token,
      realmToken: "realm-nodoc",
      blocks: [{ id: "1", type: "heading", depth: 0, text: "Title" }],
    },
    sender,
    { runtimeId: EXT_ID, port, confirmRealm }
  );
  assert.equal(skimRes.ok, true);
  const binding = Router.frameBindings.get("45:0");
  assert.ok(binding);
  assert.equal(binding.documentId, null);
  assert.ok(binding.ctx);
});

test("router: realm supersession and invalid origin", async () => {
  await resetDB();
  const port = makePort();
  port.grantedOrigins.add("https://mail.google.com");

  const sender = {
    id: EXT_ID,
    tab: { id: 46 },
    frameId: 0,
    url: "https://mail.google.com/mail/u/0",
    origin: "https://mail.google.com",
  };

  // hello realm A, hello realm B on the same tab/frame with no documentId
  const helloA = await Router.route({ kind: "hello", realmToken: "realm-A" }, sender, { runtimeId: EXT_ID, port, confirmRealm });
  assert.equal(helloA.ok, true);

  const helloB = await Router.route({ kind: "hello", realmToken: "realm-B" }, sender, { runtimeId: EXT_ID, port, confirmRealm });
  assert.equal(helloB.ok, true);

  // skim realm A returns ok: false and does not enqueue
  const skimA = await Router.route(
    {
      kind: "skim", captureEpoch: port.captureEpoch, connectionGeneration: port.connectionGeneration, destinationGeneration: port.destinationGeneration, leaseToken: port.lease?.token,
      realmToken: "realm-A",
      blocks: [{ id: "1", type: "heading", depth: 0, text: "A" }],
    },
    sender,
    { runtimeId: EXT_ID, port, confirmRealm }
  );
  assert.equal(skimA.ok, false);
  assert.equal(await Outbox.getHead(), null);

  // hello realm B is already the challenge; skim realm B enqueues
  const skimB = await Router.route(
    {
      kind: "skim", captureEpoch: port.captureEpoch, connectionGeneration: port.connectionGeneration, destinationGeneration: port.destinationGeneration, leaseToken: port.lease?.token,
      realmToken: "realm-B",
      blocks: [{ id: "1", type: "heading", depth: 0, text: "B" }],
    },
    sender,
    { runtimeId: EXT_ID, port, confirmRealm }
  );
  assert.equal(skimB.ok, true);
  const head = await Outbox.getHead();
  assert.ok(head);
  assert.equal(head.records[0].blocks[0].text, "B");

  // sender origin: "null" returns ok: false
  const senderNullOrigin = {
    id: EXT_ID,
    tab: { id: 46 },
    frameId: 0,
    url: "https://mail.google.com/mail/u/0",
    origin: "null",
  };
  const nullHello = await Router.route({ kind: "hello", realmToken: "r-null" }, senderNullOrigin, { runtimeId: EXT_ID, port, confirmRealm });
  assert.equal(nullHello.ok, false);
  const nullSkim = await Router.route(
    {
      kind: "skim", captureEpoch: port.captureEpoch, connectionGeneration: port.connectionGeneration, destinationGeneration: port.destinationGeneration, leaseToken: port.lease?.token,
      realmToken: "realm-B",
      blocks: [{ id: "1", type: "heading", depth: 0, text: "B" }],
    },
    senderNullOrigin,
    { runtimeId: EXT_ID, port, confirmRealm }
  );
  assert.equal(nullSkim.ok, false);
});

test("router: scheme and port are distinct", async () => {
  await resetDB();
  const port = makePort();
  port.grantedOrigins.add("https://example.test");

  // Refuse http://
  const httpSender = {
    id: EXT_ID,
    tab: { id: 50 },
    frameId: 0,
    url: "http://example.test/page",
    origin: "http://example.test",
  };
  const httpRes = await Router.route({ kind: "hello", realmToken: "r1" }, httpSender, { runtimeId: EXT_ID, port, confirmRealm });
  assert.deepEqual(httpRes, { ok: false, error: "origin_not_granted" });

  // Refuse different port
  const portSender = {
    id: EXT_ID,
    tab: { id: 51 },
    frameId: 0,
    url: "https://example.test:8443/page",
    origin: "https://example.test:8443",
  };
  const portRes = await Router.route({ kind: "hello", realmToken: "r2" }, portSender, { runtimeId: EXT_ID, port, confirmRealm });
  assert.deepEqual(portRes, { ok: false, error: "origin_not_granted" });

  // Stored URL drops query, credentials, fragment
  const credSender = {
    id: EXT_ID,
    tab: { id: 52 },
    frameId: 0,
    url: "https://user:pass@example.test/a/b?q=1#f",
    origin: "https://example.test",
  };
  const credHello = await Router.route({ kind: "hello", realmToken: "r3" }, credSender, { runtimeId: EXT_ID, port, confirmRealm });
  assert.equal(credHello.ok, true);

  const skimRes = await Router.route(
    {
      kind: "skim", captureEpoch: port.captureEpoch, connectionGeneration: port.connectionGeneration, destinationGeneration: port.destinationGeneration, leaseToken: port.lease?.token,
      realmToken: "r3",
      blocks: [{ id: "1", type: "heading", depth: 0, text: "Page" }],
    },
    credSender,
    { runtimeId: EXT_ID, port, confirmRealm }
  );
  assert.equal(skimRes.ok, true);
  const head = await Outbox.getHead();
  assert.ok(head);
  assert.equal(head.records[0].url, "https://example.test/a/b");

  // about:blank with no origin is refused
  const blankNoOrigin = {
    id: EXT_ID,
    tab: { id: 53 },
    frameId: 0,
    url: "about:blank",
    origin: "",
  };
  const blankNoOriginRes = await Router.route({ kind: "hello", realmToken: "r4" }, blankNoOrigin, { runtimeId: EXT_ID, port, confirmRealm });
  assert.deepEqual(blankNoOriginRes, { ok: false, error: "origin_not_granted" });

  // about:blank with granted sender.origin is accepted
  const blankGranted = {
    id: EXT_ID,
    tab: { id: 54 },
    frameId: 0,
    url: "about:blank",
    origin: "https://example.test",
  };
  const blankGrantedRes = await Router.route({ kind: "hello", realmToken: "r5" }, blankGranted, { runtimeId: EXT_ID, port, confirmRealm });
  assert.equal(blankGrantedRes.ok, true);
});

test("router: revoked origin refuses the next skim", async () => {
  await resetDB();
  const port = makePort();
  port.grantedOrigins.add("https://example.test");

  const extSender = {
    id: EXT_ID,
    url: `chrome-extension://${EXT_ID}/popup.html`,
  };

  const pageSender = {
    id: EXT_ID,
    tab: { id: 60 },
    frameId: 0,
    url: "https://example.test/page",
    origin: "https://example.test",
  };

  const helloRes = await Router.route({ kind: "hello", realmToken: "r-rev" }, pageSender, { runtimeId: EXT_ID, port, confirmRealm });
  assert.equal(helloRes.ok, true);

  // Revoke origin
  await Router.route({ cmd: "removeGrantedOrigin", origin: "https://example.test" }, extSender, { runtimeId: EXT_ID, port, confirmRealm });
  assert.equal(port.grantedOrigins.has("https://example.test"), false);

  // Next skim refused
  const skimRes = await Router.route(
    {
      kind: "skim", captureEpoch: port.captureEpoch, connectionGeneration: port.connectionGeneration, destinationGeneration: port.destinationGeneration, leaseToken: port.lease?.token,
      realmToken: "r-rev",
      blocks: [{ id: "1", type: "heading", depth: 0, text: "Page" }],
    },
    pageSender,
    { runtimeId: EXT_ID, port, confirmRealm }
  );
  assert.deepEqual(skimRes, { ok: false, error: "origin_not_granted" });
});

test("router: destroyBinding removes binding on tab/frame teardown", async () => {
  const sender = {
    id: EXT_ID,
    tab: { id: 70 },
    frameId: 0,
    documentId: "doc-70",
    url: "https://example.test/page",
    origin: "https://example.test",
  };
  const port = makePort();
  port.grantedOrigins.add("https://example.test");
  await Router.route({ kind: "hello", realmToken: "r-destroy" }, sender, { runtimeId: EXT_ID, port, confirmRealm });
  assert.ok(Router.frameBindings.has("70:0"));
  Router.destroyBinding(70, 0);
  assert.equal(Router.frameBindings.has("70:0"), false);
});

test("router: setPaused with failing setCfg handles unpause and pause properly", async () => {
  await resetDB();
  const port = makePort();
  const extSender = {
    id: EXT_ID,
    url: `chrome-extension://${EXT_ID}/popup.html`,
  };

  const rejectingSetCfg = async () => {
    throw new Error("storage write error");
  };

  // 1. paused starts false, command setPaused(false) -> ok: false, saved: false, port.paused stays false
  port.paused = false;
  const res1 = await Router.route({ cmd: "setPaused", paused: false }, extSender, {
    runtimeId: EXT_ID,
    port,
    setCfg: rejectingSetCfg,
  });
  assert.deepEqual(res1, { ok: false, saved: false, paused: false });
  assert.equal(port.paused, false);

  // 2. paused starts false, command setPaused(true) -> ok: false, saved: false, port.paused is true
  port.paused = false;
  const res2 = await Router.route({ cmd: "setPaused", paused: true }, extSender, {
    runtimeId: EXT_ID,
    port,
    setCfg: rejectingSetCfg,
  });
  assert.deepEqual(res2, { ok: false, saved: false, paused: true });
  assert.equal(port.paused, true);

  // 3. paused starts true, command setPaused(false) -> ok: false, saved: false, port.paused stays true
  port.paused = true;
  const res3 = await Router.route({ cmd: "setPaused", paused: false }, extSender, {
    runtimeId: EXT_ID,
    port,
    setCfg: rejectingSetCfg,
  });
  assert.deepEqual(res3, { ok: false, saved: false, paused: true });
  assert.equal(port.paused, true);
});


test("router: trusted options tab uses exact extension origin, not absence of a tab", async () => {
  await resetDB();
  const port = makePort();
  const base = `chrome-extension://${EXT_ID}/`;
  const sender = { id: EXT_ID, tab: { id: 8 }, url: base + "options.html" };
  assert.equal((await Router.route({cmd:"getState"}, sender, {runtimeId:EXT_ID,port})).ok, true);
  for (const url of ["https://example.test/options.html", "chrome-extension://other/options.html", "chrome-extension://" + EXT_ID + ".example/options.html"]) {
    assert.equal(Router.isExtensionPageSender({...sender,url},EXT_ID),false);
  }
  const previous = chrome.runtime;
  try {
    chrome.runtime = {getURL: () => "moz-extension://generated-uuid/"};
    assert.equal(Router.isExtensionPageSender({...sender,url:"moz-extension://generated-uuid/options.html"},EXT_ID),true);
    assert.equal(Router.isExtensionPageSender({...sender,url:"moz-extension://other/options.html"},EXT_ID),false);
  } finally { chrome.runtime = previous; }
});

test("router: a new grant requires no local pause or pressure across permission waits", async () => {
  await resetDB();
  const sender = { id: EXT_ID, url: `chrome-extension://${EXT_ID}/popup.html` };
  for (const hold of [p=>{p.paused=true;},p=>{p.pressure={active:true};}]) {
    const port=makePort();hold(port);
    const result=await Router.route({cmd:"addGrantedOrigin",origin:"https://example.test"},sender,{runtimeId:EXT_ID,port});
    assert.equal(result.ok,false);
    assert.equal(port.grantedOrigins.size,0);
  }
  const port=makePort();
  const previous=chrome.permissions.contains;
  try {
    chrome.permissions.contains=async()=>{port.paused=true;return true;};
    const result=await Router.route({cmd:"addGrantedOrigin",origin:"https://example.test"},sender,{runtimeId:EXT_ID,port});
    assert.equal(result.ok,false);
    assert.equal(port.grantedOrigins.size,0);
  } finally { chrome.permissions.contains=previous; }
});

test("router: pending intent flow allows addGrantedOrigin through epoch mismatch", async () => {
  await resetDB();
  const port = makePort();
  const sender = { id: EXT_ID, url: `chrome-extension://${EXT_ID}/popup.html` };

  // 1. Send intendAddOrigin
  const intendRes = await Router.route({ cmd: "intendAddOrigin", origin: "https://mail.google.com" }, sender, {
    runtimeId: EXT_ID,
    port,
  });
  assert.deepEqual(intendRes, { ok: true });
  assert.ok(port.pendingIntent);
  assert.equal(port.pendingIntent.origin, "https://mail.google.com");

  // 2. Epoch bump (simulating onAdded permission event)
  const previousEpoch = 0; // Simulate initial query recorded epoch 0

  // 3. addGrantedOrigin with permissionEpoch 0 should succeed because of pending intent
  const addRes = await Router.route({ cmd: "addGrantedOrigin", origin: "https://mail.google.com", permissionEpoch: previousEpoch }, sender, {
    runtimeId: EXT_ID,
    port,
    setCfg: async () => {},
    registerSite: async () => "ready",
  });
  assert.deepEqual(addRes, { ok: true, origin: "https://mail.google.com", registration: "ready" });
  assert.equal(port.pendingIntent, null); // Intent slot cleared
});

test("router: registerSite reload return sets registration notice and returns registration: reload", async () => {
  await resetDB();
  const port = makePort();
  const sender = { id: EXT_ID, url: `chrome-extension://${EXT_ID}/popup.html` };

  const addRes = await Router.route({ cmd: "addGrantedOrigin", origin: "https://mail.google.com" }, sender, {
    runtimeId: EXT_ID,
    port,
    setCfg: async () => {},
    registerSite: async () => "reload",
  });
  assert.deepEqual(addRes, { ok: true, origin: "https://mail.google.com", registration: "reload" });
  assert.ok(port.siteNotices.some((n) => n.origin === "https://mail.google.com" && n.kind === "registration" && n.bound === "reload"));
});

test("router: dismissTruncation removes matching truncation notice", async () => {
  await resetDB();
  const port = makePort();
  const sender = { id: EXT_ID, url: `chrome-extension://${EXT_ID}/popup.html` };

  await port.setSiteNotice("https://example.com", "truncation", "5");
  assert.equal(port.siteNotices.length, 1);

  const res = await Router.route({ cmd: "dismissTruncation", origin: "https://example.com", bound: "5" }, sender, {
    runtimeId: EXT_ID,
    port,
  });
  assert.deepEqual(res, { ok: true, dismissed: true });
  assert.equal(port.siteNotices.length, 0);
});
