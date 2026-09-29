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
const EXT_ID = "fgfnkcefedeheoeamppkiiloncfekakf";

async function resetDB() {
  await DB.clear("outbox");
  await DB.clear("producer");
  await DB.clear("meta");
}

function makePort() {
  const p = new PortController({
    runtimeId: EXT_ID,
    connectNative: () => ({
      postMessage() {},
      disconnect() {},
      onMessage: { addListener() {} },
      onDisconnect: { addListener() {} },
    }),
  });
  p.consentVersion = 1;
  p.hostCapture = "permitted";
  p.connectionToken = "tok-1";
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
  const res = await Router.route({ cmd: "getState" }, { id: "wrong-id" }, { runtimeId: EXT_ID, port });
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

  const res = await Router.route({ cmd: "setPaused", paused: true }, sender, { runtimeId: EXT_ID, port });
  assert.equal(res.ok, false);
});

test("router: extension page commands execute when sender is extension page", async () => {
  await resetDB();
  const port = makePort();
  const sender = {
    id: EXT_ID,
    url: `chrome-extension://${EXT_ID}/popup.html`,
  };

  const stateRes = await Router.route({ cmd: "getState" }, sender, { runtimeId: EXT_ID, port });
  assert.equal(stateRes.ok, true);

  const addRes = await Router.route({ cmd: "addGrantedOrigin", origin: "https://mail.google.com" }, sender, { runtimeId: EXT_ID, port });
  assert.deepEqual(addRes, { ok: true, origin: "https://mail.google.com" });
  assert.equal(port.grantedOrigins.has("https://mail.google.com"), true);

  const ackRes = await Router.route({ cmd: "acknowledgeDisclosure", version: 1 }, sender, { runtimeId: EXT_ID, port });
  assert.deepEqual(ackRes, { ok: true, consentVersion: 1 });
  const storedConsent = await DB.get("meta", "consentVersion");
  assert.equal(storedConsent, 1);

  const pauseRes = await Router.route({ cmd: "setPaused", paused: true }, sender, { runtimeId: EXT_ID, port });
  assert.deepEqual(pauseRes, { ok: true, paused: true });
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

  const res = await Router.route({ kind: "hello", realmToken: "realm-1" }, sender, { runtimeId: EXT_ID, port });
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

  const res = await Router.route({ kind: "hello", realmToken: "realm-1" }, sender, { runtimeId: EXT_ID, port });
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

  const helloRes = await Router.route({ kind: "hello", realmToken: "realm-forged" }, sender, { runtimeId: EXT_ID, port });
  assert.equal(helloRes.ok, true);
  const bindingCtx = helloRes.ctx;

  const FORGED_MARKER = "SECRET_FORGED_INJECTION_MARKER";
  const skimRes = await Router.route(
    {
      kind: "skim",
      realmToken: "realm-forged",
      site: FORGED_MARKER,
      ctx: FORGED_MARKER,
      meta: { url: FORGED_MARKER, title: "Normal Title", adapter: "gmail" },
      blocks: [{ id: "1", type: "heading", depth: 0, text: "Inbox" }],
    },
    sender,
    { runtimeId: EXT_ID, port }
  );

  assert.equal(skimRes.ok, true);
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

  const res1 = await Router.route({ kind: "hello", realmToken: "realm-frame-1" }, frame1, { runtimeId: EXT_ID, port });
  const res2 = await Router.route({ kind: "hello", realmToken: "realm-frame-2" }, frame2, { runtimeId: EXT_ID, port });

  assert.notEqual(res1.ctx, res2.ctx);
  assert.equal(Router.frameBindings.get("30:0").ctx, res1.ctx);
  assert.equal(Router.frameBindings.get("30:1").ctx, res2.ctx);
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

  const res1 = await Router.route({ kind: "hello", realmToken: "realm-doc-1" }, sender1, { runtimeId: EXT_ID, port });
  const res2 = await Router.route({ kind: "hello", realmToken: "realm-doc-2" }, sender2, { runtimeId: EXT_ID, port });

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

  const res = await Router.route({ kind: "hello", realmToken: "realm-nodoc" }, sender, { runtimeId: EXT_ID, port });
  assert.equal(res.ok, true);
  assert.ok(res.ctx);
  assert.equal(Router.frameBindings.get("45:0").documentId, null);
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
  const httpRes = await Router.route({ kind: "hello", realmToken: "r1" }, httpSender, { runtimeId: EXT_ID, port });
  assert.deepEqual(httpRes, { ok: false, error: "origin_not_granted" });

  // Refuse different port
  const portSender = {
    id: EXT_ID,
    tab: { id: 51 },
    frameId: 0,
    url: "https://example.test:8443/page",
    origin: "https://example.test:8443",
  };
  const portRes = await Router.route({ kind: "hello", realmToken: "r2" }, portSender, { runtimeId: EXT_ID, port });
  assert.deepEqual(portRes, { ok: false, error: "origin_not_granted" });

  // Stored URL drops query, credentials, fragment
  const credSender = {
    id: EXT_ID,
    tab: { id: 52 },
    frameId: 0,
    url: "https://user:pass@example.test/a/b?q=1#f",
    origin: "https://example.test",
  };
  const credHello = await Router.route({ kind: "hello", realmToken: "r3" }, credSender, { runtimeId: EXT_ID, port });
  assert.equal(credHello.ok, true);

  const skimRes = await Router.route(
    {
      kind: "skim",
      realmToken: "r3",
      blocks: [{ id: "1", type: "heading", depth: 0, text: "Page" }],
    },
    credSender,
    { runtimeId: EXT_ID, port }
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
  const blankNoOriginRes = await Router.route({ kind: "hello", realmToken: "r4" }, blankNoOrigin, { runtimeId: EXT_ID, port });
  assert.deepEqual(blankNoOriginRes, { ok: false, error: "origin_not_granted" });

  // about:blank with granted sender.origin is accepted
  const blankGranted = {
    id: EXT_ID,
    tab: { id: 54 },
    frameId: 0,
    url: "about:blank",
    origin: "https://example.test",
  };
  const blankGrantedRes = await Router.route({ kind: "hello", realmToken: "r5" }, blankGranted, { runtimeId: EXT_ID, port });
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

  const helloRes = await Router.route({ kind: "hello", realmToken: "r-rev" }, pageSender, { runtimeId: EXT_ID, port });
  assert.equal(helloRes.ok, true);

  // Revoke origin
  await Router.route({ cmd: "removeGrantedOrigin", origin: "https://example.test" }, extSender, { runtimeId: EXT_ID, port });
  assert.equal(port.grantedOrigins.has("https://example.test"), false);

  // Next skim refused
  const skimRes = await Router.route(
    {
      kind: "skim",
      realmToken: "r-rev",
      blocks: [{ id: "1", type: "heading", depth: 0, text: "Page" }],
    },
    pageSender,
    { runtimeId: EXT_ID, port }
  );
  assert.deepEqual(skimRes, { ok: false, error: "origin_not_granted" });
});

test("router: destroyBinding removes binding on tab/frame teardown", async () => {
  assert.ok(Router.frameBindings.has("60:0"));
  Router.destroyBinding(60, 0);
  assert.equal(Router.frameBindings.has("60:0"), false);
});
