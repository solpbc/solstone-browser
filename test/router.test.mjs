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
await import(new URL("../extension/lib/owner_sites.js", import.meta.url));
await import(new URL("../extension/lib/tab_age.js", import.meta.url));
await import(new URL("../extension/lib/page_facts.js", import.meta.url));
await import(new URL("../extension/lib/router.js", import.meta.url));

const DB = globalThis.SolstoneDB;
const Outbox = globalThis.SolstoneNativeOutbox;
const Router = globalThis.SolstoneRouter;
const PortController = globalThis.SolstoneNativePort;
globalThis.chrome = { permissions: { contains: async () => true, getAll: async () => ({ origins: ["*://*/*"] }) } };
const DOCUMENT_KEY = "0123456789abcdef0123456789abcdef";
const routeWithContentIdentity = Router.route;
Router.route = (msg, sender, deps) => routeWithContentIdentity(
  sender?.tab && msg?.kind && !msg.documentKey && !sender.documentId ? { ...msg, documentKey: DOCUMENT_KEY } : msg,
  sender,
  deps,
);
const confirmRealm = async () => true; // This suite supplies a live-frame confirmation; adversarial tests cover stale frames.
const EXT_ID = "fgfnkcefedeheoeamppkiiloncfekakf";

async function resetDB() {
  Router.frameBindings.clear();
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

test("all-sites admits a new origin only with agreement and browser grant; excluded frames stay closed", async () => {
  await resetDB();
  const port = makePort();
  port.siteMode = "all"; port.broadGranted = true;
  const sender = {id:EXT_ID,tab:{id:700},frameId:1,url:"https://new.example/path",origin:"https://new.example"};
  const deps = {runtimeId:EXT_ID,port,confirmRealm};
  const hello = {kind:"hello",realmToken:"all-realm"};
  assert.equal((await Router.route(hello,sender,deps)).error,"origin_not_granted");
  port.allSitesConsent = globalThis.SolstoneHosts.ALL_SITES_CONSENT_VERSION;
  assert.equal((await Router.route(hello,sender,deps)).ok,true);
  port.excludedHosts = ["new.example"]; port.notify();
  assert.equal((await Router.route(hello,sender,deps)).error,"origin_not_granted");
  port.excludedHosts = []; port.broadGranted = false; port.notify();
  assert.equal((await Router.route(hello,sender,deps)).error,"origin_not_granted");
  assert.deepEqual([...port.chosenOrigins],[]);
});

test("all-sites skims need a matching single-use browser execution token", async () => {
  await resetDB();
  const port = makePort();
  Object.assign(port,{siteMode:"all",allSitesConsent:1,broadGranted:true});
  const sender = {id:EXT_ID,tab:{id:701},frameId:0,url:"https://new.example/path",origin:"https://new.example"};
  let read;
  const deps = {runtimeId:EXT_ID,port,confirmRealm,executeBrowserRead:async (_binding,request,authorize)=>{
    assert.equal(authorize(),true); read=request; return true;
  }};
  await Router.route({kind:"hello",realmToken:"one-use"},sender,deps);
  const skim = {kind:"skim",realmToken:"one-use",captureEpoch:port.captureEpoch,
    connectionGeneration:port.connectionGeneration,destinationGeneration:port.destinationGeneration,leaseToken:port.lease.token,
    blocks:[{id:"1",type:"text",depth:0,text:"Synthetic all-sites page"}]};
  assert.equal((await Router.route(skim,sender,deps)).error,"read_not_authorized");
  assert.equal((await Router.route({kind:"read",action:"skim",requestId:1,realmToken:"one-use",
    captureEpoch:port.captureEpoch,leaseToken:port.lease.token},sender,deps)).ok,true);
  const admitted = await Router.route({...skim,readNonce:read.nonce},sender,deps);
  assert.equal(admitted.ok,true);
  assert.equal((await Router.route({...skim,readNonce:read.nonce},sender,deps)).error,"read_not_authorized");
  assert.ok(await Outbox.getHead());
});

test("all-sites browser denial and late policy/permission callbacks cannot admit a skim", async () => {
  await resetDB();
  const port = makePort(); Object.assign(port,{siteMode:"all",allSitesConsent:1,broadGranted:true});
  const sender = {id:EXT_ID,tab:{id:702},frameId:0,url:"https://new.example/path",origin:"https://new.example"};
  const deps = {runtimeId:EXT_ID,port,confirmRealm,executeBrowserRead:async()=>{throw new Error("browser denied");}};
  await Router.route({kind:"hello",realmToken:"denied"},sender,deps);
  const request = {kind:"read",action:"skim",requestId:1,realmToken:"denied",captureEpoch:port.captureEpoch,leaseToken:port.lease.token};
  assert.equal((await Router.route(request,sender,deps)).error,"browser_access_denied");
  assert.equal(port.browserDeniedOrigins.has(sender.origin),true);
  for (const withdraw of [()=>{port.excludedHosts=["new.example"];},()=>{port.permissionEpoch++;}]) {
    port.excludedHosts=[]; port.notify();
    let resolve;
    deps.executeBrowserRead=()=>new Promise(r=>resolve=r);
    const pending=Router.route({...request,captureEpoch:port.captureEpoch},sender,deps);
    await new Promise(r=>setImmediate(r));
    withdraw();port.notify();resolve(true);
    assert.equal((await pending).error,"authority_mismatch");
  }
  assert.equal(await Outbox.getHead(),null);
});

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

test("router: a private-window tab is refused even on a granted site", async () => {
  await resetDB();
  const port = makePort();
  port.grantedOrigins.add("https://mail.google.com");
  const sender = {
    id: EXT_ID,
    tab: { id: 11, incognito: true },
    frameId: 0,
    url: "https://mail.google.com/mail/u/0",
    origin: "https://mail.google.com",
    documentId: "doc-private",
  };
  for (const kind of ["hello", "skim"]) {
    const res = await Router.route({ kind, realmToken: "realm-1" }, sender, { runtimeId: EXT_ID, port, confirmRealm });
    assert.deepEqual(res, { ok: false, error: "private_window" });
  }
  assert.equal(Router.frameBindings.size, 0);
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

  const binding = Router.frameBindings.get("10:0:doc-1");
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
  const bindingCtx = Router.frameBindings.get(`20:0:${DOCUMENT_KEY}`).ctx;
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

  const b1 = Router.frameBindings.get(`30:0:${DOCUMENT_KEY}`);
  const b2 = Router.frameBindings.get(`30:1:${DOCUMENT_KEY}`);
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
  assert.equal(Router.frameBindings.get("40:0:doc-v2").documentIdentity, "doc-v2");
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
  assert.equal(Router.frameBindings.get(`45:0:${DOCUMENT_KEY}`).realmToken, "realm-nodoc");

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
  const binding = Router.frameBindings.get(`45:0:${DOCUMENT_KEY}`);
  assert.ok(binding);
  assert.equal(binding.documentKey, DOCUMENT_KEY);
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
  assert.ok(Router.frameBindings.has("70:0:doc-70"));
  Router.destroyBinding(70, 0);
  assert.equal(Router.frameBindings.has("70:0:doc-70"), false);
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

test("router: reservation cannot bypass a captured permission epoch mismatch", async () => {
  await resetDB();
  const port = makePort();
  const sender = { id: EXT_ID, url: `chrome-extension://${EXT_ID}/popup.html` };

  // 1. Send intendAddOrigin
  const intendRes = await Router.route({ cmd: "intendAddOrigin", origin: "https://mail.google.com" }, sender, {
    runtimeId: EXT_ID,
    port,
  });
  assert.deepEqual(intendRes, { ok: true });
  assert.ok(port.ownerSites.reservation);
  assert.equal(port.ownerSites.reservation.origin, "https://mail.google.com");

  const previousContains = chrome.permissions.contains;
  let enteredResolve, allowResolve;
  const entered = new Promise((resolve) => { enteredResolve = resolve; });
  const allowed = new Promise((resolve) => { allowResolve = resolve; });
  chrome.permissions.contains = () => { enteredResolve(); return allowed; };
  let writes = 0;
  try {
    const adding = Router.route({ cmd: "addGrantedOrigin", origin: "https://mail.google.com" }, sender, {
      runtimeId: EXT_ID,
      port,
      setCfg: async () => { writes++; },
      registerSite: async () => "ready",
    });
    await entered;
    port.permissionEpoch = 1;
    allowResolve(true);
    const addRes = await adding;
    assert.deepEqual(addRes, { ok: false, error: "capture_unavailable" });
    assert.equal(port.grantedOrigins.has("https://mail.google.com"), false);
    assert.equal(writes, 0, "epoch mismatch must reject before durable choice write");
    assert.equal(port.ownerSites.reservation, null);
  } finally {
    chrome.permissions.contains = previousContains;
  }
});

test("router: failed truncation dismissal reports storage_error and keeps the row", async () => {
  await resetDB();
  const port = makePort();
  const sender = { id: EXT_ID, url: `chrome-extension://${EXT_ID}/popup.html` };

  port.truncationByOrigin = { "https://example.com": {
    count: 1, newestId: "trunc-5", dismissedThrough: 4, sequence: 5, documents: {},
  } };

  const originalPut = DB.put;
  DB.put = async () => { throw new Error("fixture storage failure"); };
  try {
    const res = await Router.route({ cmd: "dismissTruncation", origin: "https://example.com", bound: "trunc-5" }, sender, {
      runtimeId: EXT_ID,
      port,
    });
    assert.deepEqual(res, { ok: false, error: "storage_error" });
    assert.equal(port.truncationByOrigin["https://example.com"].count, 1);
  } finally {
    DB.put = originalPut;
  }
});

test("router: a removed site leaves no error behind, and a read ends 'reload this tab'", async () => {
  await resetDB();
  const port = makePort();
  const origin = "https://example.test";
  port.chosenOrigins.add(origin);
  port.grantedOrigins.add(origin);
  const extSender = { id: EXT_ID, url: `chrome-extension://${EXT_ID}/options.html` };
  const pageSender = { id: EXT_ID, tab: { id: 70 }, frameId: 0, url: "https://example.test/page", origin };

  // A site the owner was told to reload: the first read clears the hint.
  await port.setRegistration(origin, "reload");
  assert.equal((await Router.route({ kind: "hello", realmToken: "r-reload" }, pageSender, { runtimeId: EXT_ID, port, confirmRealm })).ok, true);
  const skim = await Router.route({
    kind: "skim", captureEpoch: port.captureEpoch, connectionGeneration: port.connectionGeneration,
    destinationGeneration: port.destinationGeneration, leaseToken: port.lease?.token, realmToken: "r-reload",
    blocks: [{ id: "1", type: "heading", depth: 0, text: "Page" }],
  }, pageSender, { runtimeId: EXT_ID, port, confirmRealm });
  assert.equal(skim.ok, true);
  assert.equal(port.getStatus().registration[origin], undefined);

  // Errors on a site go with the site.
  await port.setRegistration(origin, "failed");
  await port.setEnqueueError(origin, "enqueue_failed");
  await Router.route({ cmd: "removeGrantedOrigin", origin }, extSender, { runtimeId: EXT_ID, port, confirmRealm });
  const status = port.getStatus();
  assert.equal(status.registration[origin], undefined);
  assert.equal(status.enqueue[origin], undefined);
  assert.deepEqual((await DB.get("meta", "siteErrors")).enqueue, {});
});

test("router: the app renewing its grant mid-write is not the site's error", async () => {
  await resetDB();
  const port = makePort();
  const origin = "https://example.test";
  port.grantedOrigins.add(origin);
  const pageSender = { id: EXT_ID, tab: { id: 71 }, frameId: 0, url: "https://example.test/page", origin };
  assert.equal((await Router.route({ kind: "hello", realmToken: "r-race" }, pageSender, { runtimeId: EXT_ID, port, confirmRealm })).ok, true);
  const original = port.enqueueObservedSkim;
  port.enqueueObservedSkim = async () => { const err = new Error("authorization_failed"); err.code = "authorization_failed"; throw err; };
  const result = await Router.route({
    kind: "skim", captureEpoch: port.captureEpoch, connectionGeneration: port.connectionGeneration,
    destinationGeneration: port.destinationGeneration, leaseToken: port.lease?.token, realmToken: "r-race",
    blocks: [{ id: "1", type: "heading", depth: 0, text: "Page" }],
  }, pageSender, { runtimeId: EXT_ID, port, confirmRealm });
  port.enqueueObservedSkim = original;
  assert.equal(result.ok, false);
  assert.equal(port.getStatus().enqueue[origin], undefined);
});

test("router: a subdomain page's error is kept on its chosen site, where the owner sees it", async () => {
  await resetDB();
  const port = makePort();
  const site = "https://bank.test";
  port.chosenOrigins.add(site);
  port.grantedOrigins.add(site);
  const pageSender = { id: EXT_ID, tab: { id: 72 }, frameId: 0, url: "https://login.bank.test/page", origin: "https://login.bank.test" };
  assert.equal((await Router.route({ kind: "hello", realmToken: "r-sub" }, pageSender, { runtimeId: EXT_ID, port, confirmRealm })).ok, true);
  const original = port.enqueueObservedSkim;
  port.enqueueObservedSkim = async () => { const err = new Error("outbox-full"); err.code = "outbox-full"; throw err; };
  await Router.route({
    kind: "skim", captureEpoch: port.captureEpoch, connectionGeneration: port.connectionGeneration,
    destinationGeneration: port.destinationGeneration, leaseToken: port.lease?.token, realmToken: "r-sub",
    blocks: [{ id: "1", type: "heading", depth: 0, text: "Page" }],
  }, pageSender, { runtimeId: EXT_ID, port, confirmRealm });
  port.enqueueObservedSkim = original;
  assert.equal(port.getStatus().enqueue[site], "outbox-full");
  assert.equal(port.getStatus().enqueue["https://login.bank.test"], undefined);
});

test("router: page context on segment_start and delta with tabs/windows and fallbacks", async () => {
  await resetDB();
  const port = makePort();
  const frozen = port.now();
  port.now = () => frozen;
  const origin = "https://example.test";
  port.grantedOrigins.add(origin);
  const tabId = 88;
  const pageSender = { id: EXT_ID, tab: { id: tabId }, frameId: 0, url: "https://example.test/page", origin };
  const previous = {
    tabs: globalThis.chrome.tabs,
    windows: globalThis.chrome.windows,
    runtime: globalThis.chrome.runtime,
  };
  let tabStub = { id: tabId, active: true, windowId: 99, audible: false, mutedInfo: { muted: false } };
  let winStub = { id: 99, state: "normal", focused: true };
  let rejectLookups = false;
  globalThis.chrome.tabs = {
    get: async (id) => {
      if (rejectLookups) throw new Error("tab lookup failed");
      return id === tabId ? tabStub : null;
    },
  };
  globalThis.chrome.windows = {
    get: async (id) => {
      if (rejectLookups) throw new Error("window lookup failed");
      return id === 99 ? winStub : null;
    },
  };
  globalThis.chrome.runtime = {
    getManifest: () => ({ version: "0.4.0" }),
  };
  const deps = { runtimeId: EXT_ID, port, confirmRealm };
  const skim = (sender, realm, blocks, page) => Router.route({
    kind: "skim", captureEpoch: port.captureEpoch, connectionGeneration: port.connectionGeneration,
    destinationGeneration: port.destinationGeneration, leaseToken: port.lease?.token, realmToken: realm,
    blocks, page,
  }, sender, deps);
  try {

  // 1. Initial skim: segment_start with front: true, focused: true, lang: "en-US", audible unmuted
  tabStub.audible = true;
  assert.equal((await Router.route({ kind: "hello", realmToken: "r-ctx1" }, pageSender, { runtimeId: EXT_ID, port, confirmRealm })).ok, true);
  const skim1 = await Router.route({
    kind: "skim", captureEpoch: port.captureEpoch, connectionGeneration: port.connectionGeneration,
    destinationGeneration: port.destinationGeneration, leaseToken: port.lease?.token, realmToken: "r-ctx1",
    blocks: [{ id: "1", type: "heading", depth: 0, text: "Heading 1" }],
    page: { lang: "en-US" },
  }, pageSender, { runtimeId: EXT_ID, port, confirmRealm });
  assert.equal(skim1.ok, true);

  const outboxRows1 = await Outbox.getAll();
  assert.equal(outboxRows1.length, 1);
  const snapRec1 = outboxRows1[0].records[0];
  assert.equal(snapRec1.t, "segment_start");
  assert.deepEqual(snapRec1.tab, { id: tabId, age_ms: 0, front: true, focused: true });
  assert.deepEqual(snapRec1.media, { playing: true, muted: false });
  assert.equal(snapRec1.lang, "en-US");
  assert.equal(snapRec1.ext, "0.4.0");
  assert.equal(snapRec1.solstone_paused, undefined);

  // 2. Second skim (delta): front: false (minimized), focused: false, media playing-muted, lang: "es", solstone_paused: true
  winStub.state = "minimized";
  winStub.focused = false;
  tabStub.audible = false;
  port.pauseWithApp = false;
  port.lastCaptureMessage = { type: "state", capture: "paused", away: false, delivery: "idle", freshness_ms: 10000, destination_generation: "gen-1" };
  assert.equal(port.appReportedPaused(), true);

  const skim2 = await Router.route({
    kind: "skim", captureEpoch: port.captureEpoch, connectionGeneration: port.connectionGeneration,
    destinationGeneration: port.destinationGeneration, leaseToken: port.lease?.token, realmToken: "r-ctx1",
    blocks: [
      { id: "1", type: "heading", depth: 0, text: "Heading 1" },
      { id: "2", type: "text", depth: 0, text: "New paragraph" },
    ],
    page: {
      lang: "es",
      media: { hasElement: true, playing: true, everyPlayingSilent: true },
    },
  }, pageSender, { runtimeId: EXT_ID, port, confirmRealm });
  assert.equal(skim2.ok, true);

  const outboxRows2 = await Outbox.getAll();
  assert.equal(outboxRows2.length, 2);
  const deltaRec = outboxRows2[1].records[0];
  assert.equal(deltaRec.t, "delta");
  assert.deepEqual(deltaRec.tab, { id: tabId, age_ms: 0, front: false, focused: false });
  assert.deepEqual(deltaRec.media, { playing: true, muted: true });
  assert.equal(deltaRec.lang, "es");
  assert.equal(deltaRec.solstone_paused, true);
  // Snapshot record on the same row also stamped
  assert.deepEqual(outboxRows2[1].snapshotRecords[0].tab, { id: tabId, age_ms: 0, front: false, focused: false });
  assert.equal(outboxRows2[1].snapshotRecords[0].solstone_paused, true);

  // 3. Raw permitted clears solstone_paused
  port.lastCaptureMessage = { type: "state", capture: "permitted", delivery: "idle", freshness_ms: 10000, destination_generation: "gen-1" };
  assert.equal(port.appReportedPaused(), false);

  const skim3 = await Router.route({
    kind: "skim", captureEpoch: port.captureEpoch, connectionGeneration: port.connectionGeneration,
    destinationGeneration: port.destinationGeneration, leaseToken: port.lease?.token, realmToken: "r-ctx1",
    blocks: [
      { id: "1", type: "heading", depth: 0, text: "Heading 1" },
      { id: "2", type: "text", depth: 0, text: "New paragraph" },
      { id: "3", type: "text", depth: 0, text: "Third block" },
    ],
  }, pageSender, { runtimeId: EXT_ID, port, confirmRealm });
  assert.equal(skim3.ok, true);
  const outboxRows3 = await Outbox.getAll();
  assert.equal(outboxRows3[1].records[0].solstone_paused, true);
  assert.equal(outboxRows3[2].records[0].solstone_paused, undefined);
  assert.equal(outboxRows3[2].records[0].lang, undefined);
  assert.equal(outboxRows3[2].records[0].media, undefined);

  // Playing element, tab not audible: muted follows the element, not a default.
  winStub.state = "normal";
  winStub.focused = true;
  tabStub.audible = false;
  tabStub.mutedInfo = { muted: false };
  const skimLoud = await skim(pageSender, "r-ctx1", [
    { id: "1", type: "heading", depth: 0, text: "Heading 1" },
    { id: "2", type: "text", depth: 0, text: "New paragraph" },
    { id: "3", type: "text", depth: 0, text: "Third block" },
    { id: "4", type: "text", depth: 0, text: "Playing out loud" },
  ], { media: { hasElement: true, playing: true, everyPlayingSilent: false } });
  assert.equal(skimLoud.ok, true);
  assert.deepEqual((await Outbox.getAll()).at(-1).records[0].media, { playing: true, muted: false });

  // Lookups rejected: top frame uses visibility and focus, including false.
  rejectLookups = true;
  const skimTopOff = await skim(pageSender, "r-ctx1", [
    { id: "1", type: "heading", depth: 0, text: "Heading 1" },
    { id: "5", type: "text", depth: 0, text: "Top frame hidden" },
  ], { visibilityState: "hidden", hasFocus: false });
  assert.equal(skimTopOff.ok, true);
  const topOff = (await Outbox.getAll()).at(-1).records[0];
  assert.equal(topOff.tab.front, false);
  assert.equal(topOff.tab.focused, false);

  const skimTopOn = await skim(pageSender, "r-ctx1", [
    { id: "1", type: "heading", depth: 0, text: "Heading 1" },
    { id: "5", type: "text", depth: 0, text: "Top frame hidden" },
    { id: "6", type: "text", depth: 0, text: "Top frame visible" },
  ], { visibilityState: "visible", hasFocus: true });
  assert.equal(skimTopOn.ok, true);
  const topOn = (await Outbox.getAll()).at(-1).records[0];
  assert.equal(topOn.tab.front, true);
  assert.equal(topOn.tab.focused, true);

  // 4. Rejected tabs.get/windows.get falls back to page visibilityState and hasFocus
  const subframeSender = { id: EXT_ID, tab: { id: tabId }, frameId: 1, url: "https://example.test/sub", origin };
  assert.equal((await Router.route({ kind: "hello", realmToken: "r-subfallback" }, subframeSender, { runtimeId: EXT_ID, port, confirmRealm })).ok, true);

  const skimSubframe = await Router.route({
    kind: "skim", captureEpoch: port.captureEpoch, connectionGeneration: port.connectionGeneration,
    destinationGeneration: port.destinationGeneration, leaseToken: port.lease?.token, realmToken: "r-subfallback",
    blocks: [{ id: "s1", type: "text", depth: 0, text: "Subframe text" }],
    page: { visibilityState: "visible", hasFocus: true },
  }, subframeSender, { runtimeId: EXT_ID, port, confirmRealm });
  assert.equal(skimSubframe.ok, true);

  const outboxRowsSub = await Outbox.getAll();
  const subRec = outboxRowsSub.at(-1).records[0];
  // Subframe: front is true, but focused is omitted (not defaulted to false)
  assert.equal(subRec.tab.front, true);
  assert.equal(subRec.tab.focused, undefined);

  // 5. Missing fallback omits front and focused completely
  const skimNoFallback = await Router.route({
    kind: "skim", captureEpoch: port.captureEpoch, connectionGeneration: port.connectionGeneration,
    destinationGeneration: port.destinationGeneration, leaseToken: port.lease?.token, realmToken: "r-subfallback",
    blocks: [
      { id: "s1", type: "text", depth: 0, text: "Subframe text" },
      { id: "s2", type: "text", depth: 0, text: "More subframe text" },
    ],
    page: {},
  }, subframeSender, { runtimeId: EXT_ID, port, confirmRealm });
  assert.equal(skimNoFallback.ok, true);
  const noFallbackRec = (await Outbox.getAll()).at(-1).records[0];
  assert.equal(noFallbackRec.tab.front, undefined);
  assert.equal(noFallbackRec.tab.focused, undefined);
  } finally {
    if (previous.tabs === undefined) delete globalThis.chrome.tabs;
    else globalThis.chrome.tabs = previous.tabs;
    if (previous.windows === undefined) delete globalThis.chrome.windows;
    else globalThis.chrome.windows = previous.windows;
    if (previous.runtime === undefined) delete globalThis.chrome.runtime;
    else globalThis.chrome.runtime = previous.runtime;
  }
});

test("router: a rewritten open pause admits a site, and a closed gate does not", async () => {
  await resetDB();
  const sender = { id: EXT_ID, url: `chrome-extension://${EXT_ID}/popup.html` };
  const depsFor = (port) => ({ runtimeId: EXT_ID, port, setCfg: async () => {}, registerSite: async () => "ready" });

  const port = makePort();
  const frozen = port.now();
  port.now = () => frozen;
  port.pauseWithApp = false;
  port.lastCaptureMessage = {
    type: "state", capture: "paused", away: false, delivery: "idle", freshness_ms: 10000,
    destination_generation: "gen-1", period_id: "p-1",
  };
  port.hostCapture = "permitted";
  port.capturePermitted = true;
  port.custody = { full: false, stale: false };
  assert.equal(port.appReportedPaused(), true);
  const open = await Router.route({ cmd: "addGrantedOrigin", origin: "https://example.test" }, sender, depsFor(port));
  assert.equal(open.ok, true);
  assert.equal(port.grantedOrigins.has("https://example.test"), true);

  const closed = makePort();
  closed.hostCapture = "paused";
  closed.capturePermitted = false;
  const refused = await Router.route({ cmd: "addGrantedOrigin", origin: "https://other.test" }, sender, depsFor(closed));
  assert.equal(refused.ok, false);
  assert.equal(closed.grantedOrigins.size, 0);
});
