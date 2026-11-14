// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

// A background that the browser unloads and starts again (Safari on iPhone does
// this whenever it is idle) keeps each open document's context, so a page that
// hasn't changed sends nothing again, and a page that has sends only the change.

import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { createMockChrome } from "./mock_chrome.mjs";

const EXT_DIR = join(fileURLToPath(new URL("..", import.meta.url)), "extension");
const read = (path) => fs.readFileSync(join(EXT_DIR, path), "utf8");

const ORIGIN = "https://example.com";
const TAB = 101;
const DOCUMENT = { realmToken: "realm-101", documentKey: "0123456789abcdef0123456789abcdef" };
const PAGE = [
  { id: "1", type: "heading", depth: 0, text: "A synthetic page" },
  { id: "2", type: "text", depth: 0, text: "First paragraph" },
];

function sessionArea() {
  const data = {};
  return {
    data,
    get: async (key) => structuredClone({ [key]: data[key] }),
    set: async (value) => { Object.assign(data, structuredClone(value)); },
  };
}

// One background lifetime over a database and session storage that outlive it.
async function boot({ idb, session, tabs, iphone, wake }) {
  const mock = createMockChrome();
  if (session) mock.chrome.storage.session = session;
  if (tabs) mock.tabsList.splice(0, mock.tabsList.length, ...tabs);
  const sandbox = {
    console, crypto, URL, TextEncoder, TextDecoder, structuredClone, IDBKeyRange,
    performance: { now: () => Date.now() },
    setTimeout: () => 1, clearTimeout: () => {}, setInterval: () => 1, clearInterval: () => {},
    chrome: mock.chrome, indexedDB: idb,
  };
  if (iphone) {
    sandbox.navigator = { userAgent: "Mozilla/5.0 (iPhone)", platform: "iPhone", maxTouchPoints: 5 };
    mock.chrome.runtime.getURL = (path) => `safari-web-extension://6f4d5042-ab48-42e5-a191-38327b4ea30b/${path}`;
    mock.chrome.runtime.sendNativeMessage = iphone;
  }
  sandbox.globalThis = sandbox;
  sandbox.importScripts = (...paths) => { for (const path of paths) vm.runInNewContext(read(path), sandbox, { filename: path }); };
  vm.runInNewContext(read("background.js"), sandbox, { filename: "background.js" });
  wake?.(mock);
  const port = await sandbox.SolstoneBackground.ensureInit();
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve));
  return { mock, sandbox, port };
}

function openGate(life) {
  const port = life.port;
  Object.assign(port, {
    consentVersion: life.sandbox.SolstoneCaptureGate.CONSENT_VERSION, paused: false, pressure: { active: false },
    hostCapture: "permitted", capturePermitted: true,
    destinationGeneration: "generation",
    lease: { token: port.connectionToken, generation: "generation", receivedAt: port.now(), freshnessMs: 15000 },
    livePatterns: ["*://*.example.com/*"], fence: null,
  });
}

async function hello(life) {
  const deps = { runtimeId: life.mock.chrome.runtime.id, port: life.port, confirmRealm: async () => true };
  const sender = { id: deps.runtimeId, tab: { id: TAB }, frameId: 0, url: `${ORIGIN}/page`, origin: ORIGIN };
  const reply = await life.sandbox.SolstoneRouter.route({ kind: "hello", ...DOCUMENT }, sender, deps);
  assert.equal(reply.ok, true, JSON.stringify(reply));
  return { deps, sender, ctx: reply.ctx };
}

async function skim(life, page, blocks) {
  const port = life.port;
  const reply = await life.sandbox.SolstoneRouter.route({ kind: "skim", ...DOCUMENT,
    captureEpoch: port.captureEpoch, connectionGeneration: port.connectionGeneration,
    destinationGeneration: port.destinationGeneration, leaseToken: port.lease.token,
    meta: { title: "A synthetic page", adapter: "generic" }, blocks,
  }, page.sender, page.deps);
  assert.equal(reply.ok, true, JSON.stringify(reply));
  return reply.result;
}

// The app took everything sent so far.
async function delivered(life) {
  const Outbox = life.sandbox.SolstoneNativeOutbox;
  for (const row of await Outbox.getAll()) await Outbox.removeBatch(row.batchId);
}

async function sent(life) {
  return (await life.sandbox.SolstoneNativeOutbox.getAll()).flatMap((row) => row.records);
}

// The first lifetime reads the page once and the app accepts it.
async function firstLife(session) {
  const idb = new IDBFactory();
  const life = await boot({ idb, session });
  openGate(life);
  const page = await hello(life);
  const first = await skim(life, page, PAGE);
  assert.equal(first.enqueued, true);
  const records = await sent(life);
  assert.equal(records.length, 1);
  assert.equal(records[0].t, "segment_start");
  await delivered(life);
  return { idb, ctx: page.ctx };
}

test("after a background restart, an unchanged page sends nothing again", async () => {
  const session = sessionArea();
  const { idb, ctx } = await firstLife(session);

  const life = await boot({ idb, session });
  openGate(life);
  const page = await hello(life);
  assert.equal(page.ctx, ctx, "the document keeps its context");
  const result = await skim(life, page, PAGE);
  assert.equal(result.enqueued, false);
  assert.equal((await sent(life)).length, 0, "no snapshot is sent again");
});

test("after a background restart, a changed page sends only its change, on the same context", async () => {
  const session = sessionArea();
  const { idb, ctx } = await firstLife(session);

  const life = await boot({ idb, session });
  openGate(life);
  const page = await hello(life);
  const changed = [PAGE[0], { ...PAGE[1], text: "First paragraph, edited" }];
  assert.equal((await skim(life, page, changed)).enqueued, true);
  const records = await sent(life);
  assert.deepEqual(records.map((record) => [record.t, record.op, record.ctx]), [["delta", "update", ctx]]);
  assert.equal(records[0].block.text, "First paragraph, edited");
  const [row] = await life.sandbox.SolstoneNativeOutbox.getAll();
  assert.equal(row.snapshotRecords[0].t, "segment_start", "the app can still ask for the whole page");
});

for (const [label, lose] of [
  ["the browser has no session storage", { session: null }],
  ["the browser forgot it", { forget: true }],
  ["its tab is gone", { closeTab: true }],
]) {
  test(`after a background restart, a page whose context can't come back (${label}) sends a full snapshot`, async () => {
    const session = sessionArea();
    const { idb, ctx } = await firstLife(lose.session === null ? null : session);
    if (lose.forget) for (const key of Object.keys(session.data)) delete session.data[key];

    // A tab closed while the background was unloaded keeps nothing.
    const life = await boot({ idb, session: lose.session === null ? null : session, tabs: lose.closeTab ? [{ id: 202, url: `${ORIGIN}/other` }] : null });
    if (lose.closeTab) {
      assert.equal((await life.sandbox.SolstoneDB.getAll("producer")).length, 0);
      await new Promise((resolve) => setImmediate(resolve));
      assert.deepEqual(session.data.frameContexts, {});
      return;
    }
    assert.equal((await life.sandbox.SolstoneDB.getAll("producer")).length, 0, "no change tracking is left without its document");
    openGate(life);
    const page = await hello(life);
    assert.notEqual(page.ctx, ctx);
    assert.equal((await skim(life, page, PAGE)).enqueued, true);
    const records = await sent(life);
    assert.deepEqual(records.map((record) => [record.t, record.ctx]), [["segment_start", page.ctx]]);
  });
}

test("after a background restart, a new document in the frame starts its own context", async () => {
  const session = sessionArea();
  const { idb, ctx } = await firstLife(session);

  const life = await boot({ idb, session });
  openGate(life);
  const deps = { runtimeId: life.mock.chrome.runtime.id, port: life.port, confirmRealm: async () => true };
  const sender = { id: deps.runtimeId, tab: { id: TAB }, frameId: 0, url: `${ORIGIN}/next`, origin: ORIGIN };
  const next = { realmToken: "realm-next", documentKey: "fedcba9876543210fedcba9876543210" };
  const reply = await life.sandbox.SolstoneRouter.route({ kind: "hello", ...next }, sender, deps);
  assert.equal(reply.ok, true);
  assert.notEqual(reply.ctx, ctx);
  await new Promise((resolve) => setImmediate(resolve));
  const cursors = await life.sandbox.SolstoneDB.getAll("producer");
  assert.equal(cursors.some((cursor) => cursor.ctx === ctx), false, "the previous document's tracking goes");
  assert.equal(Object.values(session.data.frameContexts).some((entry) => entry.ctx === ctx), false);
});

test("on iPhone, a page that wakes the background asks the app once", async () => {
  const exchanges = [];
  const iphone = async (_host, request) => {
    exchanges.push(request);
    return { v: 1, c: request.c, f: [] };
  };
  const sender = { tab: { id: TAB }, frameId: 0, url: `${ORIGIN}/page`, origin: ORIGIN };
  // Safari starts the unloaded background for the page's hello.
  await boot({ idb: new IDBFactory(), iphone, wake: (mock) => {
    mock.listeners.onMessage[0]({ kind: "hello", ...DOCUMENT }, { id: mock.chrome.runtime.id, ...sender }, () => {});
  } });
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(exchanges.length, 1, "the hello that starts the connection is the only exchange");
  assert.equal(JSON.parse(exchanges[0].f).type, "hello");
});
