// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import assert from "node:assert/strict";
import test from "node:test";
import { backgroundGestureRequest } from "./mock_chrome.mjs";

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
await import(new URL("../extension/lib/tab_age.js", import.meta.url));
await import(new URL("../extension/lib/page_facts.js", import.meta.url));
await import(new URL("../extension/lib/actions.js", import.meta.url));
await import(new URL("../extension/lib/router.js", import.meta.url));

const DB = globalThis.SolstoneDB;
const Outbox = globalThis.SolstoneNativeOutbox;
const Router = globalThis.SolstoneRouter;
const PortController = globalThis.SolstoneNativePort;

const mockChromeOptions = {
  requestResolvesWithoutGrant: false,
  removeReturnsFalse: false,
  safariBroadest: false,
  firefoxCoveredRequest: false,
  executeScriptRejects: false,
  omitPermissionEvents: false,
  getAllThrows: false,
  getAllNonArray: false,
};
const grantedOrigins = new Set();
globalThis.chrome = {
  options: mockChromeOptions,
  scripting: {
    executeScript: async () => {
      if (mockChromeOptions.executeScriptRejects) throw new Error("executeScript rejected");
    },
  },
  permissions: {
    contains: async () => true,
    getAll: async () => {
      if (mockChromeOptions.getAllThrows) throw new Error("getAll threw");
      if (mockChromeOptions.getAllNonArray) return { origins: "not-an-array" };
      return { origins: Array.from(grantedOrigins) };
    },
    request: backgroundGestureRequest,
    remove: async ({ origins }) => {
      if (mockChromeOptions.removeReturnsFalse) return false;
      for (const o of origins || []) grantedOrigins.delete(o);
      return true;
    },
    onRemoved: { addListener() {} },
    onAdded: { addListener() {} },
  },
};
const DOCUMENT_KEY = "0123456789abcdef0123456789abcdef";
const routeWithContentIdentity = Router.route;
Router.route = (msg, sender, deps) => {
  const effectiveDeps = deps ? {
    beginRead: async () => {
      try {
        const perms = await chrome.permissions.getAll();
        if (Array.isArray(perms?.origins) && deps.port) {
          deps.port.livePatterns = [...perms.origins];
        }
      } catch (_e) {}
    },
    ...deps,
  } : deps;
  return routeWithContentIdentity(
    sender?.tab && msg?.kind && !msg.documentKey && !sender.documentId ? { ...msg, documentKey: DOCUMENT_KEY } : msg,
    sender,
    effectiveDeps,
  );
};
const confirmRealm = async () => true; // This suite supplies a live-frame confirmation; adversarial tests cover stale frames.
const EXT_ID = "fgfnkcefedeheoeamppkiiloncfekakf";

async function resetDB() {
  grantedOrigins.clear();
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
  p.livePatterns = [];
  p.fence = null;
  const granted = new Set();
  p.grantedOrigins = {
    add(origin) {
      granted.add(origin);
      try {
        const u = new URL(origin);
        const portPart = u.port || (u.protocol === "https:" ? "443" : "80");
        const pat = `${u.protocol}//${u.hostname}:${portPart}/*`;
        if (!p.livePatterns.includes(pat)) p.livePatterns.push(pat);
        grantedOrigins.add(pat);
      } catch (_e) {
        if (!p.livePatterns.includes(origin)) p.livePatterns.push(origin);
        grantedOrigins.add(origin);
      }
      return this;
    },
    delete(origin) {
      granted.delete(origin);
      try {
        const u = new URL(origin);
        p.livePatterns = p.livePatterns.filter((pat) => !SolstoneHosts.plainAllow(pat, u));
        for (const pat of [...grantedOrigins]) {
          if (SolstoneHosts.plainAllow(pat, u)) grantedOrigins.delete(pat);
        }
      } catch (_e) {
        p.livePatterns = p.livePatterns.filter((pat) => pat !== origin);
        grantedOrigins.delete(origin);
      }
      return true;
    },
    has(origin) {
      return SolstoneHosts.originGranted(p, origin);
    },
    get size() {
      return granted.size;
    },
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

  grantedOrigins.add("*://*.mail.google.com/*");
  const addRes = await Router.route({ cmd: "addGrantedOrigin", origin: "https://mail.google.com" }, sender, {
    runtimeId: EXT_ID,
    port,
    confirmRealm,
    setCfg: async () => {},
    registerSite: async () => "ready",
  });
  assert.deepEqual(addRes, { ok: true, origin: "https://mail.google.com" });
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
  assert.deepEqual(res1, { ok: false, saved: false, paused: false, error: "storage_error" });
  assert.equal(port.paused, false);

  // 2. paused starts false, command setPaused(true) -> ok: false, saved: false, port.paused is true
  port.paused = false;
  const res2 = await Router.route({ cmd: "setPaused", paused: true }, extSender, {
    runtimeId: EXT_ID,
    port,
    setCfg: rejectingSetCfg,
  });
  assert.deepEqual(res2, { ok: false, saved: false, paused: true, error: "storage_error" });
  assert.equal(port.paused, true);

  // 3. paused starts true, command setPaused(false) -> ok: false, saved: false, port.paused stays true
  port.paused = true;
  const res3 = await Router.route({ cmd: "setPaused", paused: false }, extSender, {
    runtimeId: EXT_ID,
    port,
    setCfg: rejectingSetCfg,
  });
  assert.deepEqual(res3, { ok: false, saved: false, paused: true, error: "storage_error" });
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

test("router: add succeeds under pause or pressure when consent is in force", async () => {
  await resetDB();
  grantedOrigins.add("*://*.example.test/*");
  const sender = { id: EXT_ID, url: `chrome-extension://${EXT_ID}/popup.html` };
  for (const hold of [p=>{p.paused=true;},p=>{p.pressure={active:true};}]) {
    const port=makePort();hold(port);
    const result=await Router.route({cmd:"addGrantedOrigin",origin:"https://example.test"},sender,{runtimeId:EXT_ID,port,setCfg:async()=>{},registerSite:async()=>"ready"});
    assert.equal(result.ok,true);
    assert.equal(port.grantedOrigins.has("https://example.test"),true);
  }
  const noConsent = makePort();
  noConsent.consentVersion = 0;
  const refused = await Router.route({cmd:"addGrantedOrigin",origin:"https://example.test"},sender,{runtimeId:EXT_ID,port:noConsent,setCfg:async()=>{},registerSite:async()=>"ready"});
  assert.equal(refused.ok, false);
  assert.equal(noConsent.grantedOrigins.size, 0);
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


test("router: page context on segment_start and delta with tabs/windows and fallbacks", async () => {
  await resetDB();
  const port = makePort();
  const frozen = port.now();
  port.now = () => frozen;
  const wall = port.wallNow();
  port.wallNow = () => wall;
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
  grantedOrigins.add("*://*.example.test/*");
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
  closed.consentVersion = 0;
  const refused = await Router.route({ cmd: "addGrantedOrigin", origin: "https://other.test" }, sender, depsFor(closed));
  assert.equal(refused.ok, false);
  assert.equal(closed.grantedOrigins.size, 0);
});

test("router: while livePatterns contains *://*/*, a skim with no nonce from any http(s) origin returns not granted / nonce failure; same skim not rejected when no broad pattern live", async () => {
  await resetDB();
  const sender = {
    id: EXT_ID,
    tab: { id: 101 },
    frameId: 0,
    url: "https://example.com/page",
    origin: "https://example.com",
    documentId: "doc-1",
  };
  const port = makePort();
  grantedOrigins.add("*://*/*");
  port.livePatterns = ["*://*/*"];
  port.broadGrant = true;
  await Router.route({ kind: "hello", realmToken: "r1" }, sender, { runtimeId: EXT_ID, port, confirmRealm });

  const skimNoNonce = {
    kind: "skim",
    realmToken: "r1",
    documentKey: DOCUMENT_KEY,
    captureEpoch: port.captureEpoch,
    connectionGeneration: port.connectionGeneration,
    destinationGeneration: port.destinationGeneration,
    leaseToken: port.lease?.token,
    blocks: [{ id: "1", type: "heading", depth: 0, text: "Title" }],
  };
  const resBroad = await Router.route(skimNoNonce, sender, { runtimeId: EXT_ID, port, confirmRealm });
  assert.equal(resBroad.ok, false);
  assert.equal(resBroad.error, "read_not_authorized");

  const read = await Router.route({
    kind: "read",
    realmToken: "r1",
    action: "skim",
    requestId: 1,
    captureEpoch: port.captureEpoch,
    leaseToken: port.lease?.token,
  }, sender, { runtimeId: EXT_ID, port, confirmRealm, executeBrowserRead: async () => true });
  assert.equal(read.ok, true);
  const binding = Router.frameBindings.values().next().value;
  const nonce = binding.readNonce;
  assert.equal(typeof nonce, "string");
  assert.ok(nonce.length > 0);
  const skimOnce = { ...skimNoNonce, readNonce: nonce };
  const once = await Router.route(skimOnce, sender, { runtimeId: EXT_ID, port, confirmRealm });
  assert.equal(once.ok, true);
  assert.equal(binding.readNonce, null);
  const twice = await Router.route(skimOnce, sender, { runtimeId: EXT_ID, port, confirmRealm });
  assert.equal(twice.ok, false);
  assert.equal(twice.error, "read_not_authorized");

  grantedOrigins.clear();
  grantedOrigins.add("http://*/*");
  const portScheme = makePort();
  portScheme.livePatterns = ["http://*/*"];
  portScheme.broadGrant = true;
  const schemeSender = { ...sender, url: "http://example.com/page", origin: "http://example.com" };
  assert.equal((await Router.route({ kind: "hello", realmToken: "r-http" }, schemeSender, { runtimeId: EXT_ID, port: portScheme, confirmRealm })).ok, true);
  const schemeSkim = await Router.route(
    { ...skimNoNonce, realmToken: "r-http", captureEpoch: portScheme.captureEpoch, leaseToken: portScheme.lease?.token },
    schemeSender,
    { runtimeId: EXT_ID, port: portScheme, confirmRealm },
  );
  assert.equal(schemeSkim.ok, false);
  assert.equal(schemeSkim.error, "read_not_authorized");

  // Same skim is not rejected for a missing nonce when no broad pattern is live
  grantedOrigins.delete("http://*/*");
  const portNarrow = makePort();
  portNarrow.grantedOrigins.add("https://example.com");
  await Router.route({ kind: "hello", realmToken: "r2" }, sender, { runtimeId: EXT_ID, port: portNarrow, confirmRealm });
  const resNarrow = await Router.route(
    { ...skimNoNonce, realmToken: "r2", captureEpoch: portNarrow.captureEpoch },
    sender,
    { runtimeId: EXT_ID, port: portNarrow, confirmRealm }
  );
  assert.equal(resNarrow.ok, true);
});

test("router: a subdomain page's error is kept on the covering grant's row origin", async () => {
  await resetDB();
  grantedOrigins.add("*://*.bank.com/*");
  const port = makePort();
  port.livePatterns = ["*://*.bank.com/*"];
  port.broadGrant = false;
  port.fence = null;
  const origin = "https://login.bank.com";
  const pageSender = { id: EXT_ID, tab: { id: 71 }, frameId: 0, url: "https://login.bank.com/page", origin };
  assert.equal((await Router.route({ kind: "hello", realmToken: "r-sub" }, pageSender, { runtimeId: EXT_ID, port, confirmRealm })).ok, true);
  port.enqueueObservedSkim = async () => {
    const err = new Error("enqueue_failed");
    err.code = "enqueue_failed";
    throw err;
  };
  const result = await Router.route({
    kind: "skim",
    realmToken: "r-sub",
    documentKey: DOCUMENT_KEY,
    captureEpoch: port.captureEpoch,
    connectionGeneration: port.connectionGeneration,
    destinationGeneration: port.destinationGeneration,
    leaseToken: port.lease?.token,
    blocks: [{ id: "1", type: "heading", depth: 0, text: "Login" }],
  }, pageSender, { runtimeId: EXT_ID, port, confirmRealm });
  assert.equal(result.ok, false);
  assert.equal(port.getStatus().enqueue["https://bank.com"], "enqueue_failed");
  assert.equal(port.getStatus().enqueue[origin], undefined);
});

test("router: read: executeScript rejection fault handling and notification behavior", async () => {
  await resetDB();
  const sender = {
    id: EXT_ID,
    tab: { id: 102 },
    frameId: 0,
    url: "https://example.com/page",
    origin: "https://example.com",
    documentId: "doc-2",
  };
  const port = makePort();
  grantedOrigins.add("*://*/*");
  port.livePatterns = ["*://*/*"];
  port.broadGrant = true;
  let notifyCalls = 0;
  port.notify = () => { notifyCalls++; };

  await Router.route({ kind: "hello", realmToken: "r-read" }, sender, { runtimeId: EXT_ID, port, confirmRealm });

  // 1. Rejection that is not a timeout: sets faults to denied, error browser_access_denied, no port.notify
  let notifiesBefore = notifyCalls;
  const readMsg = (requestId) => ({
    kind: "read",
    realmToken: "r-read",
    action: "skim",
    reason: "initial",
    requestId,
    captureEpoch: port.captureEpoch,
    leaseToken: port.lease?.token,
  });
  const deniedRes = await Router.route(
    readMsg(1),
    sender,
    {
      runtimeId: EXT_ID,
      port,
      confirmRealm,
      executeBrowserRead: async () => { throw new Error("denied"); },
    }
  );
  assert.deepEqual(deniedRes, { ok: false, error: "browser_access_denied" });
  assert.equal(port.faults.get("https://example.com"), "denied");
  assert.equal(notifyCalls, notifiesBefore);

  // 2. executeScript that returns true clears the fault
  const clearRes = await Router.route(
    readMsg(2),
    sender,
    {
      runtimeId: EXT_ID,
      port,
      confirmRealm,
      executeBrowserRead: async () => true,
    }
  );
  assert.deepEqual(clearRes, { ok: true });
  assert.equal(port.faults.has("https://example.com"), false);

  // 3. Rejection whose message is browser_read_timeout: sets faults unknown, error browser_read_timeout, no notify
  notifiesBefore = notifyCalls;
  const timeoutRes = await Router.route(
    readMsg(3),
    sender,
    {
      runtimeId: EXT_ID,
      port,
      confirmRealm,
      executeBrowserRead: async () => { throw new Error("browser_read_timeout"); },
    }
  );
  assert.deepEqual(timeoutRes, { ok: false, error: "browser_read_timeout" });
  assert.equal(port.faults.get("https://example.com"), "unknown");
  assert.equal(notifyCalls, notifiesBefore);

  // A message that merely contains "frame" is a denial, not a timeout.
  const frameRes = await Router.route(
    readMsg(4),
    sender,
    {
      runtimeId: EXT_ID,
      port,
      confirmRealm,
      executeBrowserRead: async () => { throw new Error("frame was removed"); },
    }
  );
  assert.deepEqual(frameRes, { ok: false, error: "browser_access_denied" });
  assert.equal(port.faults.get("https://example.com"), "denied");
  assert.equal(notifyCalls, notifiesBefore);
});

test("router: hello calls beginRead before the origin check; grant present only in getAll is granted", async () => {
  await resetDB();
  const sender = {
    id: EXT_ID,
    tab: { id: 103 },
    frameId: 0,
    url: "https://onlyingetall.test/page",
    origin: "https://onlyingetall.test",
    documentId: "doc-3",
  };
  const port = makePort();
  port.livePatterns = [];
  let beginReadCalled = false;

  const previousGetAll = chrome.permissions.getAll;
  try {
    chrome.permissions.getAll = async () => ({ origins: ["*://*.onlyingetall.test/*"] });
    const deps = {
      runtimeId: EXT_ID,
      port,
      confirmRealm,
      beginRead: async () => {
        beginReadCalled = true;
        const perms = await chrome.permissions.getAll();
        port.livePatterns = [...(perms.origins || [])];
      },
    };
    const res = await Router.route({ kind: "hello", realmToken: "r-getall" }, sender, deps);
    assert.equal(beginReadCalled, true);
    assert.equal(res.ok, true);
    assert.ok(res.ctx);
  } finally {
    chrome.permissions.getAll = previousGetAll;
  }
});

test("router: unfenced removeGrantedOrigin with covering pattern results in left_out_instead and excludedHosts contains host", async () => {
  await resetDB();
  const extSender = { id: EXT_ID, url: `chrome-extension://${EXT_ID}/popup.html` };
  const port = makePort();
  port.fence = null;
  port.livePatterns = [];
  port.excludedHosts = [];
  // A tombstone on the grant the browser still lists must be cleared, or
  // putting the page back on stays dark until restart.
  port.tombstones = new Set(["*://*.bank.com/*"]);

  const previousRemove = chrome.permissions.remove;
  const previousGetAll = chrome.permissions.getAll;
  try {
    chrome.permissions.remove = async () => true;
    chrome.permissions.getAll = async () => ({ origins: ["*://*.bank.com/*"] });
    const deps = {
      runtimeId: EXT_ID,
      port,
      setCfg: async () => {},
      beginRead: async () => {
        const perms = await chrome.permissions.getAll();
        const origins = Array.isArray(perms?.origins) ? perms.origins : [];
        const liveSet = new Set(origins);
        for (const tomb of [...port.tombstones]) {
          if (!liveSet.has(tomb)) port.tombstones.delete(tomb);
        }
        port.livePatterns = origins.filter((pattern) => !port.tombstones.has(pattern));
      },
    };

    const res = await Router.route(
      { cmd: "removeGrantedOrigin", origin: "https://login.bank.com" },
      extSender,
      deps
    );
    assert.equal(res.ok, true);
    assert.equal(res.result, "left_out_instead");
    assert.ok(port.excludedHosts.includes("login.bank.com"));
    assert.equal(port.excludedHosts.includes("bank.com"), false);
    assert.equal(port.excludedGen, 1);
    assert.equal(port.tombstones.has("*://*.bank.com/*"), false);
    assert.equal(SolstoneHosts.originGranted(port, "https://login.bank.com"), false);
    assert.equal(SolstoneHosts.originGranted(port, "https://bank.com"), true);

    const back = await Router.route(
      { cmd: "setLeftOut", host: "login.bank.com", out: false },
      extSender,
      deps
    );
    assert.equal(back.ok, true);
    assert.equal(SolstoneHosts.originGranted(port, "https://login.bank.com"), true);
    assert.equal(SolstoneHosts.originGranted(port, "https://bank.com"), true);
  } finally {
    chrome.permissions.remove = previousRemove;
    chrome.permissions.getAll = previousGetAll;
  }
});

test("router: unfenced remove of https://login.bank.com drops only the child pattern and leaves the child out", async () => {
  await resetDB();
  const extSender = { id: EXT_ID, url: `chrome-extension://${EXT_ID}/popup.html` };
  const port = makePort();
  port.fence = null;
  port.livePatterns = [];
  port.excludedHosts = [];
  const listed = ["https://login.bank.com/*", "*://*.bank.com/*"];
  const removed = [];

  const previousRemove = chrome.permissions.remove;
  const previousGetAll = chrome.permissions.getAll;
  try {
    chrome.permissions.getAll = async () => ({ origins: [...listed] });
    chrome.permissions.remove = async (request) => {
      removed.push({ origins: [...(request?.origins || [])] });
      for (const pattern of request?.origins || []) {
        const index = listed.indexOf(pattern);
        if (index >= 0) listed.splice(index, 1);
      }
      return true;
    };
    const deps = {
      runtimeId: EXT_ID,
      port,
      setCfg: async () => {},
      beginRead: async () => {
        const perms = await chrome.permissions.getAll();
        port.livePatterns = [...(perms.origins || [])];
      },
    };

    const res = await Router.route(
      { cmd: "removeGrantedOrigin", origin: "https://login.bank.com" },
      extSender,
      deps
    );
    assert.equal(res.ok, true);
    assert.equal(res.result, "left_out_instead");
    assert.deepEqual(removed, [{ origins: ["https://login.bank.com/*"] }]);
    assert.ok(port.excludedHosts.includes("login.bank.com"));
    assert.equal(port.excludedHosts.includes("bank.com"), false);
    assert.equal(SolstoneHosts.originGranted(port, "https://bank.com"), true);
    assert.equal(SolstoneHosts.originGranted(port, "https://login.bank.com"), false);
  } finally {
    chrome.permissions.remove = previousRemove;
    chrome.permissions.getAll = previousGetAll;
  }
});

test("router: unfenced remove of https://bank.com passes https://bank.com/* and does not leave the site out when the grant is gone", async () => {
  await resetDB();
  const extSender = { id: EXT_ID, url: `chrome-extension://${EXT_ID}/popup.html` };
  const port = makePort();
  port.fence = null;
  port.livePatterns = [];
  port.excludedHosts = [];
  const listed = ["https://bank.com/*"];
  const removed = [];

  const previousRemove = chrome.permissions.remove;
  const previousGetAll = chrome.permissions.getAll;
  try {
    chrome.permissions.getAll = async () => ({ origins: [...listed] });
    chrome.permissions.remove = async (request) => {
      removed.push({ origins: [...(request?.origins || [])] });
      for (const pattern of request?.origins || []) {
        const index = listed.indexOf(pattern);
        if (index >= 0) listed.splice(index, 1);
      }
      return true;
    };
    const deps = {
      runtimeId: EXT_ID,
      port,
      setCfg: async () => {},
      beginRead: async () => {
        const perms = await chrome.permissions.getAll();
        port.livePatterns = [...(perms.origins || [])];
      },
    };

    const res = await Router.route(
      { cmd: "removeGrantedOrigin", origin: "https://bank.com" },
      extSender,
      deps
    );
    assert.deepEqual(removed, [{ origins: ["https://bank.com/*"] }]);
    assert.deepEqual(res, { ok: true, origin: "https://bank.com" });
    assert.notEqual(res.result, "left_out_instead");
    assert.equal(port.excludedHosts.includes("bank.com"), false);
    assert.equal(port.excludedGen, 0);
  } finally {
    chrome.permissions.remove = previousRemove;
    chrome.permissions.getAll = previousGetAll;
  }
});

test("router: unfenced remove under *://*/* where getAll still has *://*/* does not remove the broad grant and returns left_out_instead", async () => {
  await resetDB();
  const extSender = { id: EXT_ID, url: `chrome-extension://${EXT_ID}/popup.html` };
  const port = makePort();
  port.fence = null;
  port.livePatterns = ["*://*/*"];
  port.excludedHosts = [];
  const removed = [];

  const previousRemove = chrome.permissions.remove;
  const previousGetAll = chrome.permissions.getAll;
  try {
    chrome.permissions.remove = async (request) => {
      removed.push(...(request?.origins || []));
      return false;
    };
    chrome.permissions.getAll = async () => ({ origins: ["*://*/*"] });
    const deps = {
      runtimeId: EXT_ID,
      port,
      setCfg: async () => {},
      beginRead: async () => {
        const perms = await chrome.permissions.getAll();
        port.livePatterns = [...(perms.origins || [])];
      },
    };

    const res = await Router.route(
      { cmd: "removeGrantedOrigin", origin: "https://example.com" },
      extSender,
      deps
    );
    assert.deepEqual(removed, []);
    assert.equal(res.ok, true);
    assert.equal(res.result, "left_out_instead");
    assert.ok(port.excludedHosts.includes("example.com"));
    assert.equal(port.excludedGen, 1);
    assert.equal(SolstoneHosts.originGranted(port, "https://example.com"), false);
    assert.equal(port.tombstones?.has("*://*/*") === true, false);
  } finally {
    chrome.permissions.remove = previousRemove;
    chrome.permissions.getAll = previousGetAll;
  }
});

test("router: fenced remove of https://bank.com drops fence entry, does not write excludedHosts, and setLeftOut out:false does not restore it", async () => {
  await resetDB();
  const extSender = { id: EXT_ID, url: `chrome-extension://${EXT_ID}/popup.html` };
  const port = makePort();
  port.fence = {
    entries: ["https://bank.com"],
    exact: [],
    siteWide: [],
    declined: [],
    exactKnown: true,
  };
  port.excludedHosts = [];
  port.livePatterns = ["*://*.bank.com/*"];

  let cfgWrites = [];
  const deps = {
    runtimeId: EXT_ID,
    port,
    setCfg: async (cfg) => { cfgWrites.push(cfg); },
  };

  const removeRes = await Router.route(
    { cmd: "removeGrantedOrigin", origin: "https://bank.com" },
    extSender,
    deps
  );
  assert.equal(removeRes.ok, true);
  assert.equal(port.fence.entries.includes("https://bank.com"), false);
  assert.equal(port.excludedHosts.includes("bank.com"), false);
  assert.equal(port.excludedGen, 0);

  // setLeftOut with out: false does not put the entry back
  await Router.route(
    { cmd: "setLeftOut", host: "bank.com", out: false },
    extSender,
    deps
  );
  assert.equal(port.fence.entries.includes("https://bank.com"), false);
});

test("router: fenced remove passes the granted scheme-specific pattern and does not write excludedHosts", async () => {
  await resetDB();
  const extSender = { id: EXT_ID, url: `chrome-extension://${EXT_ID}/popup.html` };
  const port = makePort();
  port.fence = {
    entries: ["https://bank.com"],
    exact: [],
    siteWide: [],
    declined: [],
    exactKnown: true,
  };
  port.excludedHosts = [];
  port.livePatterns = ["https://bank.com/*"];
  const listed = ["https://bank.com/*"];
  const removed = [];

  const previousRemove = chrome.permissions.remove;
  const previousGetAll = chrome.permissions.getAll;
  try {
    chrome.permissions.getAll = async () => ({ origins: [...listed] });
    chrome.permissions.remove = async (request) => {
      removed.push({ origins: [...(request?.origins || [])] });
      return true;
    };
    const res = await Router.route(
      { cmd: "removeGrantedOrigin", origin: "https://bank.com" },
      extSender,
      {
        runtimeId: EXT_ID,
        port,
        setCfg: async () => {},
      }
    );
    assert.equal(res.ok, true);
    assert.deepEqual(removed, [{ origins: ["https://bank.com/*"] }]);
    assert.equal(port.fence.entries.includes("https://bank.com"), false);
    assert.equal(port.excludedHosts.includes("bank.com"), false);
    assert.equal(port.excludedGen, 0);
  } finally {
    chrome.permissions.remove = previousRemove;
    chrome.permissions.getAll = previousGetAll;
  }
});

test("router: acknowledgeDisclosure writes consent and does not change fence entries or livePatterns", async () => {
  await resetDB();
  const extSender = { id: EXT_ID, url: `chrome-extension://${EXT_ID}/popup.html` };
  const port = makePort();
  port.consentVersion = 0;
  port.fence = {
    entries: ["https://example.com"],
    exact: ["https://example.com"],
    siteWide: [],
    declined: [],
    exactKnown: true,
  };
  port.livePatterns = ["*://*.example.com/*"];

  const res = await Router.route(
    { cmd: "acknowledgeDisclosure", version: 1 },
    extSender,
    { runtimeId: EXT_ID, port, confirmRealm }
  );
  assert.deepEqual(res, { ok: true, consentVersion: 1 });
  assert.equal(port.consentVersion, 1);
  assert.equal(await DB.get("meta", "consentVersion"), 1);

  // fence entries and livePatterns unchanged
  assert.deepEqual(port.fence.entries, ["https://example.com"]);
  assert.deepEqual(port.fence.exact, ["https://example.com"]);
  assert.deepEqual(port.livePatterns, ["*://*.example.com/*"]);
});







