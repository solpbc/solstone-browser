// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { createMockChrome } from "./mock_chrome.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const EXT_DIR = join(ROOT, "extension");

function readExtFile(relPath) {
  return fs.readFileSync(join(EXT_DIR, relPath), "utf8");
}

const MANIFEST = JSON.parse(fs.readFileSync(join(EXT_DIR, "manifest.json"), "utf8"));
const SCRIPT_LIST = MANIFEST.background.scripts;

function createSandbox(mockChrome, isWorker = true, clock) {
  const sandbox = {
    globalThis: null,
    console,
    crypto,
    performance: { now: () => clock ? clock.monotonic : Date.now() },
    Date: clock ? class extends Date { static now() { return clock.wall; } } : Date,
    chrome: mockChrome.chrome,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    indexedDB,
    IDBKeyRange,
    TextEncoder,
    TextDecoder,
    structuredClone,
    URL,
  };
  sandbox.globalThis = sandbox;

  if (isWorker) {
    sandbox.importScripts = (...paths) => {
      for (const p of paths) {
        const code = readExtFile(p);
        vm.runInNewContext(code, sandbox, { filename: p });
      }
    };
  }

  return sandbox;
}

test("lifecycle (worker): evaluation registers listeners and inits without install/startup events", async () => {
  const mock = createMockChrome();
  const sandbox = createSandbox(mock, true);

  const bgCode = readExtFile("background.js");
  vm.runInNewContext(bgCode, sandbox, { filename: "background.js" });

  assert.ok(mock.listeners.onConnect.length > 0);
  assert.ok(mock.listeners.onMessage.length > 0);
  assert.ok(mock.listeners.onAlarm.length > 0);
  assert.ok(mock.listeners.onRemovedPerm.length > 0);

  const BG = sandbox.SolstoneBackground;
  assert.ok(BG);
  const port = await BG.ensureInit();
  assert.ok(port);
  assert.ok(port.inst);
  assert.match(port.inst, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test("lifecycle (ordered scripts): manifest scripts load in order and initialize", async () => {
  const mock = createMockChrome();
  const sandbox = createSandbox(mock, false);

  for (const scriptPath of SCRIPT_LIST) {
    const code = readExtFile(scriptPath);
    vm.runInNewContext(code, sandbox, { filename: scriptPath });
  }

  const BG = sandbox.SolstoneBackground;
  assert.ok(BG);
  const port = await BG.ensureInit();
  assert.ok(port);
  assert.ok(port.inst);
});

for (const device of [
  { name: "iPhone", navigator: { userAgent: "Mozilla/5.0 (iPhone)", platform: "iPhone", maxTouchPoints: 5 }, agreed: 1 },
  { name: "a Mac", navigator: { userAgent: "Mozilla/5.0 (Macintosh)", platform: "MacIntel", maxTouchPoints: 0 }, agreed: 0 },
]) {
  test(`a fresh install on ${device.name} ${device.agreed ? "needs no separate agreement" : "still needs the agreement"}`, async () => {
    const mock = createMockChrome();
    const sandbox = createSandbox(mock, true);
    sandbox.indexedDB = new IDBFactory();
    sandbox.navigator = device.navigator;
    vm.runInNewContext(readExtFile("background.js"), sandbox);
    const port = await sandbox.SolstoneBackground.ensureInit();
    assert.equal(port.consentVersion, device.agreed);
  });
}

for (const device of [
  { name: "iPhone", navigator: { userAgent: "Mozilla/5.0 (iPhone)", platform: "iPhone", maxTouchPoints: 5 }, paints: false },
  { name: "a Mac", navigator: { userAgent: "Mozilla/5.0 (Macintosh)", platform: "MacIntel", maxTouchPoints: 0 }, paints: true },
]) {
  test(`the toolbar on ${device.name} ${device.paints ? "shows state" : "keeps its logo whatever the state"}`, async () => {
    const mock = createMockChrome();
    const sandbox = createSandbox(mock, true);
    sandbox.indexedDB = new IDBFactory();
    sandbox.navigator = device.navigator;
    vm.runInNewContext(readExtFile("background.js"), sandbox);
    const bg = sandbox.SolstoneBackground;
    await bg.ensureInit();
    let calls = 0;
    mock.chrome.action.setIcon = async () => { calls++; };
    mock.chrome.action.setBadgeText = async () => { calls++; };
    mock.chrome.action.setTitle = async () => { calls++; };
    const status = { ...states(bg).permitted, connectionGeneration: 1, handshake: "ready" };
    await bg.updateBadge(status);
    await bg.updateBadge(status);
    assert.equal(calls > 0, device.paints);
  });
}

for (const isWorker of [true, false]) {
  test(`tab age survives ${isWorker ? "worker" : "ordered-script"} recreation with a reset performance clock`, async () => {
    const session = {};
    const firstWall = 1_800_000_000_000;
    async function boot(clock, tabs) {
      const mock = createMockChrome();
      mock.tabsList.splice(0, mock.tabsList.length, ...tabs);
      mock.chrome.tabs.query = (_query, callback) => {
        if (isWorker && callback) { callback(mock.tabsList); return; }
        return Promise.resolve(mock.tabsList);
      };
      mock.chrome.storage.session = {
        get: async key => structuredClone({ [key]: session[key] }),
        set: async value => Object.assign(session, structuredClone(value)),
      };
      const sandbox = createSandbox(mock, isWorker, clock);
      sandbox.indexedDB = new IDBFactory();
      sandbox.setTimeout = () => 1;
      sandbox.setInterval = () => 1;
      if (isWorker) vm.runInNewContext(readExtFile("background.js"), sandbox);
      else for (const path of SCRIPT_LIST) vm.runInNewContext(readExtFile(path), sandbox);
      const starts = [];
      const start = sandbox.SolstoneTabAge.start;
      sandbox.SolstoneTabAge.start = (...args) => {
        const pending = start(...args);
        starts.push(pending);
        return pending;
      };
      const port = await sandbox.SolstoneBackground.ensureInit();
      await Promise.all(starts);
      return { mock, sandbox, port };
    }
    const clock = { wall: firstWall, monotonic: 600_000 };
    const first = await boot(clock, [{ id: 101 }]);
    clock.wall += 120_000;
    clock.monotonic += 120_000;
    let created;
    const noteCreated = first.sandbox.SolstoneTabAge.noteCreated;
    first.sandbox.SolstoneTabAge.noteCreated = (...args) => (created = noteCreated(...args));
    first.mock.listeners.onCreatedTab[0]({ id: 102 });
    await created;

    const second = await boot({ wall: firstWall + 300_000, monotonic: 25 }, [{ id: 101 }, { id: 102 }]);
    const { sandbox, port } = second;
    const origin = "https://example.com";
    Object.assign(port, {
      consentVersion: 1,
      hostCapture: "permitted",
      capturePermitted: true,
      connectionToken: "token",
      destinationGeneration: "generation",
      lease: { token: "token", generation: "generation", receivedAt: 25, freshnessMs: 10000 },
      livePatterns: ["*://*.example.com/*"],
      fence: null,
    });
    const deps = { runtimeId: second.mock.chrome.runtime.id, port, confirmRealm: async () => true };
    for (const [id, age] of [[101, 300_000], [102, 180_000]]) {
      const sender = { id: deps.runtimeId, tab: { id }, frameId: 0, url: `${origin}/page`, origin };
      const identity = { realmToken: `realm-${id}`, documentKey: "0123456789abcdef0123456789abcdef" };
      const hello = await sandbox.SolstoneRouter.route({ kind: "hello", ...identity }, sender, deps);
      assert.equal(hello.ok, true, JSON.stringify(hello));
      const skim = await sandbox.SolstoneRouter.route({ kind: "skim", ...identity,
        captureEpoch: port.captureEpoch, connectionGeneration: port.connectionGeneration,
        destinationGeneration: port.destinationGeneration, leaseToken: port.lease.token,
        blocks: [{ id: "1", type: "text", depth: 0, text: `Synthetic tab ${id}` }],
      }, sender, deps);
      assert.equal(skim.ok, true, JSON.stringify(skim));
      const rows = await sandbox.SolstoneNativeOutbox.getAll();
      const record = rows.find(row => row.records[0].tab.id === id).records[0];
      assert.equal(record.tab.age_ms, age);
    }
  });
}





test("lifecycle: status onConnect rejects content sender and serves trusted extension page", async () => {
  const mock = createMockChrome();
  const sandbox = createSandbox(mock, true);
  const bgCode = readExtFile("background.js");
  vm.runInNewContext(bgCode, sandbox);
  const BG = sandbox.SolstoneBackground;
  await BG.ensureInit();

  let contentDisconnected = false;
  const contentPort = {
    name: "status",
    sender: { id: "fgfnkcefedeheoeamppkiiloncfekakf", tab: { id: 1 }, url: "https://example.com" },
    disconnect: () => { contentDisconnected = true; },
    postMessage: () => {},
    onDisconnect: { addListener: () => {} },
  };

  for (const fn of mock.listeners.onConnect) {
    fn(contentPort);
  }
  assert.equal(contentDisconnected, true);

  let trustedReceived = null;
  const trustedPort = {
    name: "status",
    sender: { id: "fgfnkcefedeheoeamppkiiloncfekakf", url: "chrome-extension://fgfnkcefedeheoeamppkiiloncfekakf/popup.html" },
    disconnect: () => {},
    postMessage: (msg) => { trustedReceived = msg; },
    onDisconnect: { addListener: () => {} },
  };

  for (const fn of mock.listeners.onConnect) {
    fn(trustedPort);
  }
  await new Promise((r) => setTimeout(r, 10));
  assert.ok(trustedReceived);
  assert.equal(trustedReceived.type, "status");
  assert.ok(trustedReceived.status);
});

test("lifecycle: stale tab query cannot replace a newer unknown projection", async () => {
  const {mock, bg} = await startWorker();
  const pending = [];
  mock.chrome.tabs.query = (_query, callback) => { pending.push(callback); };
  mock.listeners.onUpdatedTab[0]();
  mock.listeners.onUpdatedTab[0]();
  const [older, newer] = pending;
  mock.chrome.runtime.lastError = {message:"fixture query failure"};
  newer(undefined);
  delete mock.chrome.runtime.lastError;
  const unknown = bg.port.getStatus().openTabs;
  assert.equal(unknown.known, false);
  assert.equal(unknown.anyGrantedTabOpen, null);
  older([{id:7, url:"https://example.com/"}]);
  const afterStale = bg.port.getStatus().openTabs;
  assert.equal(afterStale.generation, unknown.generation);
  assert.equal(afterStale.known, false);
});





test("lifecycle: init does not connect if inst DB.put fails", async () => {
  const mock = createMockChrome();
  let connectNativeCalled = false;
  mock.chrome.runtime.connectNative = () => {
    connectNativeCalled = true;
    return {
      postMessage: () => {},
      disconnect: () => {},
      onMessage: { addListener: () => {} },
      onDisconnect: { addListener: () => {} },
    };
  };

  const sandbox = createSandbox(mock, true);
  const bgCode = readExtFile("background.js");
  vm.runInNewContext(bgCode, sandbox);
  const BG = sandbox.SolstoneBackground;
  await BG.ensureInit();

  const DB = sandbox.SolstoneDB;
  await DB.clear("meta");
  DB.put = async (store, val, key) => {
    if (store === "meta" && key === "inst") {
      throw new Error("disk full");
    }
    return true;
  };

  connectNativeCalled = false;
  await assert.rejects(async () => {
    await BG.doInit();
  }, /disk full/);

  assert.equal(connectNativeCalled, false);
});


async function startWorker(cfg, { noGrants = false } = {}) {
  const mock = createMockChrome();
  if (cfg) mock.storageData.cfg = cfg;
  if (noGrants) mock.grantedPermissions.clear();
  const sandbox = createSandbox(mock);
  vm.runInNewContext(readExtFile("background.js"), sandbox);
  const bg = sandbox.SolstoneBackground;
  await bg.ensureInit();
  await new Promise(resolve => setImmediate(resolve));
  return {mock, sandbox, bg};
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((r, j) => { resolve = r; reject = j; });
  return {promise, resolve, reject};
}
function states(bg) {
  const permitted = {...bg.port.getStatus(), everConnected:true, connected:true, hostCapture:"permitted",
    capturePermitted:true, consentVersion:1, grantedOrigins:["https://example.com"],
    chosenOrigins:["https://example.com"],
    gate:{open:true}, lease:{token:"t",generation:"g",receivedAt:100,freshnessMs:15000}};
  return {permitted, closed:{...permitted, everConnected:true, connected:false, hostCapture:null,
    capturePermitted:false, lease:null, gate:{open:false}}};
}

test("lifecycle: a failed save does not poison the next config operation", async () => {
  const {mock,bg} = await startWorker();
  let writes = 0;
  mock.chrome.storage.local.set = async value => {
    if (++writes === 1) throw Error("fixture storage failure");
    Object.assign(mock.storageData,value);
  };
  await assert.rejects(bg.setCfg({paused:true}), /fixture storage failure/);
  await bg.setCfg({showPageIndicator:true});
  assert.equal(writes,2);
  assert.equal((await bg.getCfg()).showPageIndicator,true);
});

test("lifecycle: a delayed tab query cannot publish superseded authority", async () => {
  const {mock,bg} = await startWorker();
  const callbacks=[];
  mock.chrome.tabs.query=(_query,cb)=>{callbacks.push(cb);};
  mock.sentTabMessages.length=0;
  const {permitted,closed}=states(bg);
  await bg.updateBadge(permitted); await bg.updateBadge(closed);
  assert.equal(mock.sentTabMessages.at(-1).msg.capturePermitted,false);
  const delivered = mock.sentTabMessages.length;
  callbacks[1](mock.tabsList); callbacks[0](mock.tabsList);
  assert.equal(mock.sentTabMessages.length,delivered);
  assert.equal(mock.sentTabMessages.at(-1).msg.capturePermitted,false);
});

test("lifecycle: authority closes while action painting is stalled, final icon is current", async () => {
  const {mock,bg}=await startWorker(), stalled=deferred(), entered=deferred();
  let calls=0, icon;
  mock.chrome.action.setIcon=async value=>{
    if (++calls===1) {entered.resolve(); await stalled.promise;}
    icon=value.path[16];
  };
  const {permitted,closed}=states(bg);
  const old=bg.updateBadge(permitted);
  await entered.promise;
  const current=bg.updateBadge(closed);
  assert.equal(mock.sentTabMessages.at(-1).msg.capturePermitted,false);
  stalled.resolve(); await Promise.all([old,current]);
  assert.equal(icon,"icons/icon-offline-16.png");
});


test("lifecycle: restart loads loss notice and prunes orphan producer text", async () => {
  const first=await startWorker(), db=first.sandbox.SolstoneDB;
  await db.put("meta",{seq:7,reason:"oversize",count:3},"lossNotice");
  await db.put("producer",{contextKey:"orphan",blocks:[{text:"fixture"}]});
  const second=await startWorker();
  assert.equal(second.bg.port.getStatus().lossNotice.seq,7);
  assert.equal(second.bg.port.getStatus().lossNotice.count,3);
  assert.equal((await second.sandbox.SolstoneDB.getAll("producer")).length,0);
});

test("lifecycle: doInit retains held outbox batches without recording expiry loss", async () => {
  const { bg, sandbox } = await startWorker();
  const DB = sandbox.SolstoneDB;
  await DB.clear("outbox");
  await DB.clear("producer");
  await DB.del("meta", "lossNotice");
  const batchId = "0123456789abcdef0123456789abcdef";
  await DB.put("outbox", {
    batchId, seq: 1, inst: "00000000-0000-0000-0000-000000000001", ctx: "held-after-init",
    destinationGeneration: "generation-old", queuedAtMs: 1000, records: [], snapshotRecords: [],
    bytes: 1, sendSnapshot: false,
  });
  await bg.doInit();
  assert.ok(await DB.get("outbox", batchId));
  assert.equal(await DB.get("meta", "lossNotice"), undefined);
});






function openGate(port) {
  port.hostCapture = "permitted";
  port.capturePermitted = true;
  port.consentVersion = 1;
  port.paused = false;
  port.pressure = { active: false };
  port.lease = { token: "t", generation: "g", receivedAt: port.now(), freshnessMs: 10000 };
}

test("lifecycle: an open tab that cannot answer after injection asks for a reload", async () => {
  for (const [label, tab, reply, expected] of [
    ["answers", {id: 101, url: "https://example.com/page", status: "complete"}, {ok: true}, "ready"],
    ["stranded", {id: 101, url: "https://example.com/page", status: "complete"}, undefined, "reload"],
    ["refused", {id: 101, url: "https://example.com/page", status: "complete"}, new Error("no receiver"), "reload"],
    ["still loading", {id: 101, url: "https://example.com/page", status: "loading"}, undefined, "ready"],
    ["private", {id: 101, url: "https://example.com/page", status: "complete", incognito: true}, undefined, "ready"],
  ]) {
    const {mock, sandbox, bg} = await startWorker({ siteGrant: "live", fence: null }, { noGrants: true });
    const port = bg.port;
    openGate(port);
    mock.grantedPermissions.add("*://example.com/*");
    mock.chrome.tabs.query = async () => [tab];
    const pings = [];
    mock.chrome.tabs.sendMessage = async (tabId, msg, options) => {
      pings.push({tabId, msg, options});
      if (msg?.kind !== "ping") return undefined;
      if (reply instanceof Error) throw reply;
      return reply;
    };
    await bg.beginRead();
    await new Promise((resolve) => setImmediate(resolve));
    const rowOrigin = "https://example.com";
    if (expected === "ready") assert.equal(port.registration[rowOrigin], undefined, label);
    else assert.equal(port.registration[rowOrigin], "reload", label);
    const asked = pings.filter((p) => p.msg?.kind === "ping");
    assert.equal(asked.length, tab.status === "complete" && !tab.incognito ? 1 : 0, label);
    if (asked.length) assert.equal(asked[0].options?.frameId, 0, label);
    if (expected === "reload") {
      const row = sandbox.SolstoneStatus.siteRow(rowOrigin, port.getStatus());
      assert.equal(row.kind, "reload-tab", label);
    }
  }
});

test("a subdomain tab's reload row is the covering grant's row origin", async () => {
  const {mock, sandbox, bg} = await startWorker({ siteGrant: "live", fence: null }, { noGrants: true });
  const port = bg.port;
  openGate(port);
  const tab = { id: 7, url: "https://login.bank.com/home", status: "complete" };
  mock.chrome.tabs.query = async () => [tab];
  mock.chrome.tabs.sendMessage = async (_tabId, msg) => (msg?.kind === "ping" ? undefined : undefined);
  mock.grantedPermissions.add("*://*.bank.com/*");
  await bg.beginRead();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(port.registration["https://bank.com"], "reload");
  assert.equal(port.registration["https://login.bank.com"], undefined);
  assert.equal(sandbox.SolstoneStatus.siteRow("https://bank.com", port.getStatus()).kind, "reload-tab");
});

test("a registration that throws keeps a failed row on the grant's row origin", async () => {
  const {mock, sandbox, bg} = await startWorker({ siteGrant: "live", fence: null }, { noGrants: true });
  const port = bg.port;
  openGate(port);
  mock.chrome.scripting.registerContentScripts = async () => { throw new Error("Invalid match pattern"); };
  mock.grantedPermissions.add("*://*.bank.com/*");
  await bg.beginRead();
  assert.equal(port.registration["https://bank.com"], "failed");
  assert.equal(port.registration["https://login.bank.com"], undefined);
  const row = sandbox.SolstoneStatus.siteRow("https://bank.com", port.getStatus());
  assert.equal(row.kind, "error");
  assert.notEqual(row.label, "failed");
});

test("a script records its result on every row origin it serves", async () => {
  const {mock, bg} = await startWorker({ siteGrant: "live", fence: null }, { noGrants: true });
  openGate(bg.port);
  mock.tabsList = [{ id: 7, url: "https://bank.com/home", status: "complete" }];
  mock.chrome.tabs.query = async () => mock.tabsList;
  mock.chrome.tabs.sendMessage = async (_tabId, msg) => (msg?.kind === "ping" ? undefined : undefined);
  mock.grantedPermissions.add("https://bank.com/*");
  mock.grantedPermissions.add("http://bank.com/*");
  await bg.beginRead();
  assert.equal(bg.port.registration["https://bank.com"], "reload");
  assert.equal(bg.port.registration["http://bank.com"], "reload");
  const scripts = await mock.chrome.scripting.getRegisteredContentScripts();
  assert.equal(scripts.length, 1);
  assert.equal(scripts[0].id, "cs-bank.com");
});

test("a plain owner registers each non-broad grant with its scheme and host", async () => {
  const cases = [
    ["*://localhost/*", "cs-localhost", ["*://localhost/*"]],
    ["*://192.168.1.5/*", "cs-192.168.1.5", ["*://192.168.1.5/*"]],
    ["*://router.local/*", "cs-router.local", ["*://router.local/*"]],
    ["*://bank.com/*", "cs-bank.com", ["*://bank.com/*"]],
    ["https://bank.com/*", "cs-bank.com", ["https://bank.com/*"]],
    ["https://*.bank.com/*", "cs-bank.com", ["https://*.bank.com/*"]],
  ];
  for (const [pattern, id, matches] of cases) {
    const {mock, bg} = await startWorker({ siteGrant: "live", fence: null }, { noGrants: true });
    mock.grantedPermissions.add(pattern);
    await bg.beginRead();
    const scripts = await mock.chrome.scripting.getRegisteredContentScripts();
    assert.equal(scripts.length, 1, pattern);
    assert.equal(scripts[0].id, id, pattern);
    assert.deepEqual(scripts[0].matches, matches, pattern);
    assert.equal(scripts[0].excludeMatches, undefined, pattern);
  }
});

test("a port-bearing grant registers the portless host and keeps the gate's port", async () => {
  const {mock, sandbox, bg} = await startWorker({ siteGrant: "live", fence: null }, { noGrants: true });
  mock.grantedPermissions.add("*://localhost:5015/*");
  await bg.beginRead();
  const scripts = await mock.chrome.scripting.getRegisteredContentScripts();
  const script = scripts.find((item) => item.id === "cs-localhost");
  assert.ok(script);
  assert.deepEqual(script.matches, ["*://localhost/*"]);
  const Hosts = sandbox.SolstoneHosts;
  assert.equal(Hosts.originGranted(bg.port, "http://localhost:8080"), false);
  assert.equal(Hosts.originGranted(bg.port, "http://localhost:5015"), true);
  assert.equal(Object.hasOwn(mock.storageData.cfg, "grantWatch"), false);
  assert.deepEqual(Array.from(mock.storageData.grantWatch.patterns), ["*://localhost:5015/*"]);
});

test("patterns for one host share a script and widening updates matches", async () => {
  const {mock, bg} = await startWorker({ siteGrant: "live", fence: null }, { noGrants: true });
  mock.chrome.tabs.sendMessage = async () => ({ ok: true });
  mock.grantedPermissions.add("https://bank.com/*");
  await bg.beginRead();
  mock.grantedPermissions.add("*://bank.com/*");
  mock.grantedPermissions.add("*://*.bank.com/*");
  await bg.beginRead();
  let scripts = await mock.chrome.scripting.getRegisteredContentScripts();
  assert.equal(scripts.length, 1);
  assert.equal(scripts[0].id, "cs-bank.com");
  assert.deepEqual(scripts[0].matches, ["*://*.bank.com/*", "*://bank.com/*", "https://bank.com/*"].sort());
  mock.grantedPermissions.clear();
  mock.grantedPermissions.add("*://*.bank.com/*");
  await bg.beginRead();
  scripts = await mock.chrome.scripting.getRegisteredContentScripts();
  assert.equal(scripts.length, 1);
  assert.equal(scripts[0].id, "cs-bank.com");
  assert.deepEqual(scripts[0].matches, ["*://*.bank.com/*"]);
});

test("every site registers cs-all-sites, and one scheme plus a site registers only that site", async () => {
  const all = await startWorker({ siteGrant: "live", fence: null, excludedHosts: ["bank.com"] }, { noGrants: true });
  all.mock.grantedPermissions.add("*://*/*");
  await all.bg.beginRead();
  const allScripts = await all.mock.chrome.scripting.getRegisteredContentScripts();
  assert.equal(allScripts.length, 1);
  assert.equal(allScripts[0].id, "cs-all-sites");
  assert.deepEqual(allScripts[0].matches, ["*://*/*"]);
  assert.deepEqual(allScripts[0].excludeMatches, ["*://*.bank.com/*"]);

  const one = await startWorker({ siteGrant: "live", fence: null }, { noGrants: true });
  one.mock.grantedPermissions.add("http://*/*");
  one.mock.grantedPermissions.add("*://*.bank.com/*");
  await one.bg.beginRead();
  const scripts = await one.mock.chrome.scripting.getRegisteredContentScripts();
  assert.equal(scripts.some((item) => item.id === "cs-all-sites"), false);
  const bank = scripts.find((item) => item.id === "cs-bank.com");
  assert.ok(bank);
  assert.deepEqual(bank.matches, ["*://*.bank.com/*"]);
  assert.equal(one.sandbox.SolstoneHosts.originGranted(one.bg.port, "https://bank.com"), true);
  assert.equal(one.bg.port.broadGrant, true);
  const tabs = await one.mock.chrome.tabs.query({});
  assert.equal(Object.hasOwn(tabs[0], "url"), false);
});

test("a fence registers the entry host in the turn it is added", async () => {
  const fence = {
    entries: [], exact: [], exactKnown: true, siteWide: [], declined: [],
    answered: false, sawMore: false, cleanAt: null,
  };
  const mock = createMockChrome();
  mock.storageData.cfg = { siteGrant: "live", fence };
  mock.grantedPermissions.clear();
  mock.grantedPermissions.add("*://*/*");
  mock.grantedPermissions.add("*://*.other.com/*");
  const sandbox = createSandbox(mock);
  vm.runInNewContext(readExtFile("background.js"), sandbox);
  const bg = sandbox.SolstoneBackground;
  await bg.ensureInit();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(mock.registeredScripts.has("cs-other.com"), false);
  assert.equal(mock.registeredScripts.has("cs-bank.com"), false);
  assert.equal(mock.registeredScripts.has("cs-all-sites"), false);

  bg.port.consentVersion = 1;
  const optionsSender = { id: mock.chrome.runtime.id, url: `chrome-extension://${mock.chrome.runtime.id}/options.html` };
  const added = await new Promise((resolve) => mock.listeners.onMessage[0](
    { cmd: "addGrantedOrigin", origin: "https://bank.com" },
    optionsSender,
    resolve,
  ));
  assert.equal(added.ok, true, JSON.stringify(added));
  assert.ok(bg.port.fence.entries.includes("https://bank.com"));
  const scripts = await mock.chrome.scripting.getRegisteredContentScripts();
  assert.equal(scripts.some((item) => item.id === "cs-other.com"), false);
  assert.equal(scripts.some((item) => item.id === "cs-all-sites"), false);
  const bank = scripts.find((item) => item.id === "cs-bank.com");
  assert.ok(bank);
  assert.deepEqual(bank.matches, ["*://*.bank.com/*"]);
});

test("an unchanged wake does not register, unregister, inject, or fan out, and hello still admits the site", async () => {
  const mock = createMockChrome();
  mock.storageData.cfg = { siteGrant: "live", fence: null };
  mock.storageData.grantWatch = { patterns: ["*://bank.com/*"], injectedVersion: "0.5.9" };
  mock.grantedPermissions.clear();
  mock.grantedPermissions.add("*://bank.com/*");
  mock.registeredScripts.set("cs-bank.com", {
    id: "cs-bank.com",
    matches: ["*://bank.com/*"],
    js: [],
    runAt: "document_idle",
    allFrames: true,
    persistAcrossSessions: true,
  });
  let registerCalls = 0;
  let unregisterCalls = 0;
  let executeCalls = 0;
  const origReg = mock.chrome.scripting.registerContentScripts;
  const origUnreg = mock.chrome.scripting.unregisterContentScripts;
  const origExec = mock.chrome.scripting.executeScript;
  mock.chrome.scripting.registerContentScripts = async (...args) => { registerCalls++; return origReg(...args); };
  mock.chrome.scripting.unregisterContentScripts = async (...args) => { unregisterCalls++; return origUnreg(...args); };
  mock.chrome.scripting.executeScript = async (...args) => { executeCalls++; return origExec(...args); };
  mock.chrome.tabs.sendMessage = (tabId, msg, ...args) => {
    mock.sentTabMessages.push({ tabId, msg });
    if (msg?.kind === "confirmRealm") {
      const cb = typeof args[0] === "function" ? args[0] : (typeof args[1] === "function" ? args[1] : null);
      if (cb) cb({ realmToken: "r" });
      return Promise.resolve({ realmToken: "r" });
    }
    const cb = typeof args[0] === "function" ? args[0] : (typeof args[1] === "function" ? args[1] : null);
    if (cb) cb();
    return Promise.resolve();
  };
  const sandbox = createSandbox(mock);
  vm.runInNewContext(readExtFile("background.js"), sandbox);
  const bg = sandbox.SolstoneBackground;
  await bg.ensureInit();
  await new Promise((resolve) => setImmediate(resolve));
  const fanout = () => mock.sentTabMessages.filter((item) => item.msg?.kind === "resnapshot").length;
  assert.equal(registerCalls, 0);
  assert.equal(unregisterCalls, 0);
  assert.equal(executeCalls, 0);
  assert.equal(fanout(), 0);
  const sender = { id: mock.chrome.runtime.id, tab: { id: 101 }, frameId: 0, url: "https://bank.com/page", origin: "https://bank.com" };
  const hello = await new Promise((resolve) => mock.listeners.onMessage[0](
    { kind: "hello", realmToken: "r", documentKey: "0123456789abcdef0123456789abcdef" },
    sender,
    resolve,
  ));
  assert.equal(hello.ok, true);
  assert.equal(registerCalls, 0);
  assert.equal(unregisterCalls, 0);
  assert.equal(executeCalls, 0);
  assert.equal(fanout(), 0);
  assert.equal(sandbox.SolstoneHosts.originGranted(bg.port, "https://bank.com"), true);
});

test("a stored grant list plus a failed read stays closed at hello", async () => {
  const mock = createMockChrome({ getAllThrows: true });
  mock.storageData.cfg = { siteGrant: "live", fence: null };
  mock.storageData.grantWatch = { patterns: ["*://bank.com/*"], injectedVersion: "0.0.1" };
  mock.grantedPermissions.clear();
  let executeCalls = 0;
  mock.chrome.scripting.executeScript = async () => { executeCalls++; };
  const sandbox = createSandbox(mock);
  vm.runInNewContext(readExtFile("background.js"), sandbox);
  const bg = sandbox.SolstoneBackground;
  await bg.ensureInit();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(Array.from(bg.port.livePatterns), []);
  assert.equal(bg.port.broadGrant, false);
  assert.equal(executeCalls, 0);
  assert.equal(mock.storageData.grantWatch.injectedVersion, "0.0.1");
  assert.equal(sandbox.SolstoneHosts.originGranted(bg.port, "https://bank.com"), false);
  const sender = { id: mock.chrome.runtime.id, tab: { id: 101 }, frameId: 0, url: "https://bank.com/page", origin: "https://bank.com" };
  const hello = await new Promise((resolve) => mock.listeners.onMessage[0](
    { kind: "hello", realmToken: "r", documentKey: "0123456789abcdef0123456789abcdef" },
    sender,
    resolve,
  ));
  assert.equal(hello.ok, false);
  assert.equal(hello.error, "origin_not_granted");
  assert.deepEqual(Array.from(bg.port.livePatterns), []);
  assert.equal(executeCalls, 0);
});

test("a failed registration is retried on the next wake and still skips the grant fan-out", async () => {
  const {mock, bg} = await startWorker({ siteGrant: "live", fence: null }, { noGrants: true });
  mock.grantedPermissions.add("*://bank.com/*");
  await bg.beginRead();
  mock.registeredScripts.clear();
  mock.sentTabMessages.length = 0;
  let registers = 0;
  mock.chrome.scripting.registerContentScripts = async () => {
    registers++;
    throw new Error("Invalid match pattern");
  };
  await bg.beginRead();
  await bg.beginRead();
  assert.equal(registers, 2);
  assert.equal(mock.sentTabMessages.filter((item) => item.msg?.kind === "resnapshot").length, 0);
  assert.equal(mock.registeredScripts.has("cs-bank.com"), false);
});

test("a stalled register still publishes the new lease", async () => {
  const {mock, bg} = await startWorker({ siteGrant: "live", fence: null }, { noGrants: true });
  let release;
  const hung = new Promise((resolve) => { release = resolve; });
  let started = false;
  mock.chrome.scripting.registerContentScripts = async () => {
    started = true;
    await hung;
  };
  mock.grantedPermissions.add("*://bank.com/*");
  mock.sentTabMessages.length = 0;
  const pending = bg.beginRead();
  for (let i = 0; i < 30 && !started; i++) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(started, true);
  const lease = mock.sentTabMessages.find((item) => item.msg?.kind === "leaseUpdate");
  assert.ok(lease);
  assert.ok(lease.msg.livePatterns.includes("*://bank.com/*"));
  release();
  await pending;
});

test("an update re-injects once into granted tabs, and the same version injects nothing", async () => {
  function fencedMock(injectedVersion) {
    const mock = createMockChrome();
    mock.storageData.cfg = {
      siteGrant: "live",
      excludedHosts: ["left.example"],
      fence: {
        entries: ["https://bank.com"],
        exact: ["https://bank.com"],
        exactKnown: true,
        siteWide: [],
        declined: [],
        answered: false,
        sawMore: false,
        cleanAt: null,
      },
    };
    mock.storageData.grantWatch = { patterns: ["*://*/*"], injectedVersion };
    mock.grantedPermissions.clear();
    mock.grantedPermissions.add("*://*/*");
    mock.registeredScripts.set("cs-bank.com", {
      id: "cs-bank.com",
      matches: ["*://*.bank.com/*"],
      js: [],
      runAt: "document_idle",
      allFrames: true,
      persistAcrossSessions: true,
    });
    mock.tabsList.splice(0, mock.tabsList.length,
      { id: 1, url: "https://bank.com/home" },
      { id: 2, url: "https://other.com/home" },
      { id: 3, url: "https://left.example/home" },
      { id: 4, url: "https://bank.com/private", incognito: true },
      { id: 5 },
    );
    const injected = [];
    let registerCalls = 0;
    mock.chrome.scripting.registerContentScripts = async () => { registerCalls++; };
    mock.chrome.scripting.executeScript = async (details) => { injected.push(details?.target?.tabId); };
    return { mock, injected, registerCalls: () => registerCalls };
  }

  const first = fencedMock(null);
  const sandbox = createSandbox(first.mock);
  vm.runInNewContext(readExtFile("background.js"), sandbox);
  await sandbox.SolstoneBackground.ensureInit();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(first.injected, [1]);
  assert.equal(first.registerCalls(), 0);
  assert.equal(first.mock.storageData.grantWatch.injectedVersion, "0.5.9");

  const again = fencedMock("0.5.9");
  const sandboxAgain = createSandbox(again.mock);
  vm.runInNewContext(readExtFile("background.js"), sandboxAgain);
  await sandboxAgain.SolstoneBackground.ensureInit();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(again.injected, []);
  assert.equal(again.registerCalls(), 0);
});

test("lifecycle: permission prompt onAdded followed by add completes with matching epochs", async () => {
  const {mock, sandbox, bg} = await startWorker();
  mock.grantedPermissions.delete("*://*/*");
  const port = bg.port;
  port.hostCapture = "permitted";
  port.capturePermitted = true;
  port.consentVersion = 1;
  port.lease = {token:"t", generation:"g", receivedAt:port.now(), freshnessMs:10000};
  const id = mock.chrome.runtime.id;
  const sender = {id, url:`chrome-extension://${id}/popup.html`};
  const origin = "https://first.example";
  const pattern = "*://*.first.example/*";
  const deps = {runtimeId:id, port, setCfg:bg.setCfg, registerSite:bg.registerSite, beginRead:bg.beginRead};
  vm.runInNewContext(readExtFile("lib/popup_view.js"), sandbox);
  const commands = [];
  const added = await sandbox.SolstonePopupView.grantSite(origin, {
    status:port.getStatus(),
    cmd: (message) => {
      const pending = sandbox.SolstoneRouter.route(message, sender, deps);
      commands.push(pending);
      return pending;
    },
    requestPermission: async (request) => {
      assert.deepEqual(Array.from(request.origins), [pattern]);
      mock.grantedPermissions.add(pattern);
      await mock.listeners.onAddedPerm[0]({origins:[pattern]});
      return true;
    },
  });
  await Promise.all(commands);
  assert.equal(added.ok, true, JSON.stringify(added));
  assert.equal(sandbox.SolstoneHosts.originGranted(port, origin), true);
});


for (const reason of ["unreserved", "cancelled", "expired", "unrelated", "broad", "mixed", "withdrawn", "removed", "paused", "no-consent", "no-lease", "pressure", "full"]) {
  }


function authorizeFixture({mock,bg}) {
 const p=bg.port;
 mock.grantedPermissions.clear(); mock.grantedPermissions.add("*://example.com/*");
 p.hostCapture="permitted"; p.capturePermitted=true; p.consentVersion=1;
 p.lease={token:"t",generation:"g",receivedAt:p.now(),freshnessMs:10000};
 const id=mock.chrome.runtime.id;
 return {sender:{id,url:`chrome-extension://${id}/popup.html`},deps:{runtimeId:id,port:p,setCfg:bg.setCfg,registerSite:bg.registerSite,removeSiteOrigin:bg.removeSiteOrigin}};
}

function contentHarness(Gate) {
  let t = 0,
    reads = 0,
    listener,
    readReply;
  const requests = [],
    intervals = new Map(),
    sent = [],
    documentListeners = [],
    windowListeners = [];
  let id = 0;
  const ctx = {
    crypto,
    console,
    URL,
    performance: { now: () => t },
    location: { origin: "https://example.com", host: "example.com" },
    document: {
      readyState: "complete",
      visibilityState: "visible",
      title: "Example",
      addEventListener(type, fn) {
        documentListeners.push({ type, fn });
      },
      getElementById() {
        return null;
      },
    },
    window: {
      addEventListener(type, fn) {
        windowListeners.push({ type, fn });
      },
    },
    chrome: {
      runtime: {
        id: "ext",
        sendMessage(m, cb) {
          if (m.kind === "hello") requests.push(cb);
          else {
            sent.push(m);
            if (m.kind === "read") readReply = cb;
          }
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
    SolstoneCaptureGate: Gate,
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
  vm.runInNewContext(fs.readFileSync(ROOT + "/extension/lib/hosts.js", "utf8"), ctx);
  vm.runInNewContext(
    fs.readFileSync(ROOT + "/extension/content.js", "utf8"),
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
    failRead(error) {
      readReply?.({ ok: false, error });
    },
    finishRead(res) {
      readReply?.(res || { ok: true });
    },
    executeRead() {
      const read = sent.filter((m) => m.kind === "read").at(-1);
      return ctx.__solstoneAuthorizedRead(read.realmToken, read.documentKey, read);
    },
    showVisible() {
      ctx.document.visibilityState = "visible";
      for (const entry of documentListeners) {
        if (entry.type === "visibilitychange") entry.fn();
      }
    },
    pageshow(event) {
      for (const entry of windowListeners) {
        if (entry.type === "pageshow") entry.fn(event || {});
      }
    },
    get reads() {
      return reads;
    },
  };
}






test("tab facts prune only previously known closed document fingerprints",async()=>{
 const {bg,mock}=await startWorker();const origin="https://gc.example";
 await bg.port.recordTruncation(origin,"old",{slot:"88:0",documentId:"old"});
 const before=bg.port.truncationByOrigin[origin].count;
 const callbacks=[];mock.chrome.tabs.query=(_q,callback)=>callbacks.push(callback);
 mock.listeners.onUpdatedTab[0]();
 await bg.port.recordTruncation(origin,"new",{slot:"88:0",documentId:"new"});
 callbacks[0]([]);await bg.port.truncationChain;
 assert.equal(bg.port.truncationByOrigin[origin].documents["88:0"].documentId,"new");
 const next=callbacks.length;mock.listeners.onUpdatedTab[0]();callbacks[next]([]);await bg.port.truncationChain;
 assert.equal(Object.keys(bg.port.truncationByOrigin[origin].documents).length,0);
 assert.equal(bg.port.truncationByOrigin[origin].count,before+1);
});

async function startSafari(mock, idb, clock) {
  mock.chrome.runtime.getURL = (path) => `safari-web-extension://6f4d5042-ab48-42e5-a191-38327b4ea30b/${path}`;
  const sandbox = createSandbox(mock, true, clock);
  sandbox.indexedDB = idb;
  vm.runInNewContext(readExtFile("background.js"), sandbox);
  await sandbox.SolstoneBackground.ensureInit();
  return sandbox;
}

function holdMetaInst(DB) {
  const original = DB.get.bind(DB);
  const state = { armed: false, pending: [], waiters: [], reads: 0 };

  function deliver() {
    while (state.waiters.length > 0) {
      const item = state.pending.find((entry) => !entry.issued);
      if (!item) return;
      item.issued = true;
      state.waiters.shift()(item.handle);
    }
  }

  DB.get = (store, key) => {
    if (store === "meta" && key === "inst") {
      state.reads += 1;
      if (state.armed) {
        return new Promise((resolve, reject) => {
          const item = { issued: false, handle: null };
          item.handle = {
            release() {
              Promise.resolve(original(store, key)).then(resolve, reject);
            },
          };
          state.pending.push(item);
          deliver();
        });
      }
    }
    return original(store, key);
  };

  return {
    hold() { state.armed = true; },
    unhold() { state.armed = false; },
    get reads() { return state.reads; },
    held() {
      const item = state.pending.find((entry) => !entry.issued);
      if (item) {
        item.issued = true;
        return Promise.resolve(item.handle);
      }
      return new Promise((resolve) => {
        state.waiters.push(resolve);
      });
    },
  };
}

test("safari: clearing the extension's storage also forgets what its database kept", async () => {
  const idb = new IDBFactory();
  const mock = createMockChrome();
  const first = await startSafari(mock, idb);
  const inst = first.SolstoneBackground.port.inst;
  assert.equal(mock.storageData.inst, inst);
  await first.SolstoneDB.put("meta", 1, "consentVersion");
  await first.SolstoneDB.put("outbox", { batchId: "b1", origin: "https://example.com" });

  // The app is reinstalled: storage.local and the database both survive.
  const again = await startSafari(mock, idb);
  assert.equal(again.SolstoneBackground.port.inst, inst);
  assert.equal(await again.SolstoneDB.get("meta", "consentVersion"), 1);

  // Safari's Clear Storage empties storage.local only.
  for (const key of Object.keys(mock.storageData)) delete mock.storageData[key];
  const cleared = await startSafari(mock, idb);
  assert.notEqual(cleared.SolstoneBackground.port.inst, inst);
  assert.equal(mock.storageData.inst, cleared.SolstoneBackground.port.inst);
  assert.equal(await cleared.SolstoneDB.get("meta", "consentVersion"), undefined);
  assert.deepEqual(await cleared.SolstoneDB.getAll("outbox"), []);
});

test("safari: a running background forgets everything at the next alarm after a clear", async () => {
  const mock = createMockChrome();
  let reloads = 0;
  mock.chrome.runtime.reload = () => { reloads++; };
  const sandbox = await startSafari(mock, new IDBFactory());
  await sandbox.SolstoneDB.put("outbox", { batchId: "b1", origin: "https://example.com" });
  const tick = () => new Promise((resolve) => {
    mock.listeners.onAlarm[0]({ name: "native-port" });
    setTimeout(resolve, 50);
  });
  await tick();
  assert.equal(reloads, 0);
  assert.equal((await sandbox.SolstoneDB.getAll("outbox")).length, 1);

  for (const key of Object.keys(mock.storageData)) delete mock.storageData[key];
  await tick();
  assert.equal(reloads, 1);
  assert.deepEqual(await sandbox.SolstoneDB.getAll("outbox"), []);
  assert.equal(await sandbox.SolstoneDB.get("meta", "inst"), undefined);
});

test("chrome: the database is not tied to a storage.local mirror", async () => {
  const idb = new IDBFactory();
  const mock = createMockChrome();
  const sandbox = createSandbox(mock, true);
  sandbox.indexedDB = idb;
  vm.runInNewContext(readExtFile("background.js"), sandbox);
  const port = await sandbox.SolstoneBackground.ensureInit();
  assert.equal(mock.storageData.inst, undefined);
  const again = createSandbox(mock, true);
  again.indexedDB = idb;
  vm.runInNewContext(readExtFile("background.js"), again);
  assert.equal((await again.SolstoneBackground.ensureInit()).inst, port.inst);
});

test("lifecycle: a settling status reaches content scripts but not the owner's surfaces", async () => {
  const {mock,bg}=await startWorker();
  const posted=[]; let icons=0;
  mock.chrome.action.setIcon=async()=>{icons++;};
  for (const fn of mock.listeners.onConnect) fn({name:"status",
    sender:{id:"fgfnkcefedeheoeamppkiiloncfekakf",url:"chrome-extension://fgfnkcefedeheoeamppkiiloncfekakf/options.html"},
    disconnect(){}, postMessage:m=>posted.push(m), onDisconnect:{addListener(){}}});
  await new Promise(r => setImmediate(r));
  const {permitted,closed}=states(bg);
  await bg.updateBadge(permitted);
  const before={posted:posted.length, icons, tabs:mock.sentTabMessages.length};
  await bg.updateBadge({...closed, connected:true, handshake:"ready", hostSettling:true});
  assert.equal(posted.length,before.posted);
  assert.equal(icons,before.icons);
  assert.equal(mock.sentTabMessages.at(-1).msg.capturePermitted,false);
  await bg.updateBadge(permitted);
  assert.equal(posted.length,before.posted+1);
});

test("lifecycle: a settling status never interrupts a paint, so icon and title agree", async () => {
  const {mock,bg,sandbox}=await startWorker(), stalled=deferred(), entered=deferred();
  let calls=0, icon=null, title=null;
  mock.chrome.action.setIcon=async value=>{
    if (++calls===1) {entered.resolve(); await stalled.promise;}
    icon=value.path[16];
  };
  mock.chrome.action.setTitle=async value=>{title=value.title;};
  const {closed}=states(bg);
  const painting=bg.updateBadge(closed);
  await entered.promise;
  await bg.updateBadge({...closed, connected:true, handshake:"ready", hostSettling:true});
  stalled.resolve(); await painting;
  assert.equal(icon,"icons/icon-offline-16.png");
  assert.equal(title,sandbox.SolstoneStatus.iconState(closed).title);
});

test("lifecycle: the browser regaining focus tries the app now, a few seconds apart", async () => {
  const mock=createMockChrome(), focus=[];
  mock.chrome.windows={WINDOW_ID_NONE:-1, onFocusChanged:{addListener:fn=>focus.push(fn)}};
  let tries=0;
  const connectNative=mock.chrome.runtime.connectNative;
  mock.chrome.runtime.connectNative=(...args)=>{tries++; return connectNative(...args);};
  const sandbox=createSandbox(mock);
  vm.runInNewContext(readExtFile("background.js"), sandbox);
  const bg=sandbox.SolstoneBackground, p=await bg.ensureInit();
  const settle=()=>new Promise(r=>setImmediate(r));
  const drop=()=>p.handlePortDisconnect(p.opEpoch,p.connectionGeneration,p.connectionToken);
  drop();
  const before=tries;
  focus[0](-1); await settle();
  assert.equal(tries,before,"focus leaving the browser tries nothing");
  focus[0](1); await settle();
  assert.equal(tries,before+1);
  focus[0](1); await settle();
  assert.equal(tries,before+1,"a connected port isn't retried");
  drop(); focus[0](1); await settle();
  assert.equal(tries,before+1,"tries wait a few seconds apart");
});

test("lifecycle: a surface opened mid-renewal shows the settled state, not \"can't reach\"", async () => {
  const {mock,bg,sandbox}=await startWorker(); const p=bg.port;
  const epoch=p.opEpoch,gen=p.connectionGeneration,token=p.connectionToken;
  p.handshake="ready"; p.everConnected=true;
  const state={type:"state",capture:"permitted",delivery:"idle",freshness_ms:15000,destination_generation:"gen-renew"};
  await p.applyCaptureMessage(state,epoch,gen,token);
  const held=deferred(),outbox=sandbox.SolstoneNativeOutbox,original=outbox.promoteHeldForGeneration;
  outbox.promoteHeldForGeneration=()=>held.promise;
  const renewal=p.applyCaptureMessage(state,epoch,gen,token);
  const id=mock.chrome.runtime.id, sender={id,url:`chrome-extension://${id}/popup.html`};
  const posted=[];
  for (const fn of mock.listeners.onConnect) fn({name:"status",sender,disconnect(){},postMessage:m=>posted.push(m),onDisconnect:{addListener(){}}});
  let answered=null;
  mock.listeners.onMessage[0]({cmd:"getState"},sender,r=>{answered=r;});
  await new Promise(r=>setImmediate(r));
  try {
    assert.equal(p.getStatus().hostSettling,true);
    assert.equal(p.capturePermitted,false,"reading stays withdrawn while the renewal settles");
    assert.equal(posted.length,0);
    assert.equal(answered,null);
  } finally { outbox.promoteHeldForGeneration=original; held.resolve({count:0}); await renewal; }
  await new Promise(r=>setImmediate(r));
  assert.equal(posted.length,1);
  for (const status of [posted[0].status,answered]) {
    assert.equal(status.hostSettling,false);
    assert.equal(status.hostCapture,"permitted");
    assert.notEqual(sandbox.SolstoneStatus.derive(status).kind,"cant-reach-app");
  }
});




// Chrome removes every granted pattern a removed pattern contains (measured on
// Chrome for Testing 153), and reports all of them in onRemoved.
function chromeContains(removal, granted) {
  const host = (p) => /^\*:\/\/([^/]+)\/\*$/.exec(p)?.[1];
  const r = host(removal), g = host(granted);
  if (!r || !g) return removal === granted;
  if (r === "*") return true;
  if (r.startsWith("*.")) { const base = r.slice(2); const gb = g.startsWith("*.") ? g.slice(2) : g; return gb === base || gb.endsWith("." + base); }
  return r === g;
}




























async function deliverState(port, extra) {
  port.handshake = "ready";
  await port.handlePortMessage(
    Object.assign({ type: "state", capture: "permitted", delivery: "idle", freshness_ms: 15000, destination_generation: "gen-alpha", period_id: "period-1" }, extra),
    port.opEpoch, port.connectionGeneration, port.connectionToken);
}








// How much of a site is read is stored, and widens only with the site's own
// whole-site grant. Safari drops a site's own grant when its parent is allowed.
async function startScoped(cfg, live, { beforeInit } = {}) {
  const mock = createMockChrome();
  mock.storageData.cfg = Object.assign({ paused: false, showPageIndicator: false }, cfg);
  mock.grantedPermissions.clear();
  for (const pattern of live) mock.grantedPermissions.add(pattern);
  const sandbox = createSandbox(mock);
  if (beforeInit) beforeInit(mock);
  vm.runInNewContext(readExtFile("background.js"), sandbox);
  const bg = sandbox.SolstoneBackground;
  await bg.ensureInit();
  await new Promise((resolve) => setImmediate(resolve));
  return { mock, sandbox, bg };
}
const SUB = "https://x.p2.test";
const read = (sandbox, bg, origin) => sandbox.SolstoneHosts.originGranted(bg.port, origin);




test("iPhone, no cfg, no consent, getAll []: fence null after doInit, consent auto-written", async () => {
  const mock = createMockChrome();
  mock.grantedPermissions.clear();
  const sandbox = createSandbox(mock, true);
  sandbox.navigator = { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15" };
  vm.runInNewContext(readExtFile("background.js"), sandbox);
  const bg = sandbox.SolstoneBackground;
  await bg.ensureInit();
  const port = bg.port;
  assert.equal(port.fence, null);
  assert.equal(port.consentVersion, sandbox.SolstoneCaptureGate.CONSENT_VERSION);
  const savedConsent = await sandbox.SolstoneDB.get("meta", "consentVersion");
  assert.equal(savedConsent, sandbox.SolstoneCaptureGate.CONSENT_VERSION);
});

test("stored siteMode all, allSitesConsent 1, consent current, getAll without *://*/*: fence is an empty object, hello https://bank.com not granted", async () => {
  const mock = createMockChrome();
  mock.grantedPermissions.clear();
  mock.grantedPermissions.add("*://*.other.com/*");
  mock.storageData.cfg = { siteMode: "all", allSitesConsent: 1 };
  const idb = new IDBFactory();
  const sandbox = createSandbox(mock, true);
  sandbox.indexedDB = idb;

  const first = await startWorker();
  const consent = first.sandbox.SolstoneCaptureGate.CONSENT_VERSION;
  const dbReq = idb.open("solstone", 1);
  await new Promise((resolve) => {
    dbReq.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
    };
    dbReq.onsuccess = (e) => {
      const db = e.target.result;
      const tx = db.transaction("meta", "readwrite");
      tx.objectStore("meta").put(consent, "consentVersion");
      tx.oncomplete = () => resolve();
    };
  });

  vm.runInNewContext(readExtFile("background.js"), sandbox);
  const bg = sandbox.SolstoneBackground;
  await bg.ensureInit();
  const port = bg.port;
  assert.ok(port.fence && typeof port.fence === "object");
  assert.deepEqual(Array.from(port.fence.entries), []);

  const sender = { id: mock.chrome.runtime.id, tab: { id: 101 }, frameId: 0, url: "https://bank.com/page", origin: "https://bank.com" };
  const res = await new Promise(resolve => mock.listeners.onMessage[0](
    { kind: "hello", realmToken: "r", documentKey: "0123456789abcdef0123456789abcdef" },
    sender,
    resolve
  ));
  assert.equal(res.ok, false);
});

test("stored chosenOrigins ['https://bank.com'], exactOnlyOrigins absent, getAll throws during doInit, then a later getAll of ['*://*/*']: hello https://login.bank.com not granted", async () => {
  const mock = createMockChrome({ getAllThrows: true });
  mock.storageData.cfg = { chosenOrigins: ["https://bank.com"] };
  const sandbox = createSandbox(mock, true);
  vm.runInNewContext(readExtFile("background.js"), sandbox);
  const bg = sandbox.SolstoneBackground;
  await bg.ensureInit();
  const port = bg.port;
  assert.ok(port.fence);
  assert.equal(port.fence.exactKnown, false);

  mock.options.getAllThrows = false;
  mock.grantedPermissions.clear();
  mock.grantedPermissions.add("*://*/*");

  await bg.beginRead();

  const senderLogin = { id: mock.chrome.runtime.id, tab: { id: 101 }, frameId: 0, url: "https://login.bank.com/page", origin: "https://login.bank.com" };
  const resLogin = await new Promise(resolve => mock.listeners.onMessage[0](
    { kind: "hello", realmToken: "r1", documentKey: "0123456789abcdef0123456789abcdef" },
    senderLogin,
    resolve
  ));
  assert.equal(resLogin.ok, false);
});

test("storage.local.set throws on the decision write: port.fence is a non-null object. Second doInit with set working decides from the still-raw cfg", async () => {
  const mock = createMockChrome();
  mock.storageData.cfg = { chosenOrigins: ["https://bank.com"] };
  const idb = new IDBFactory();
  const sandbox1 = createSandbox(mock, true);
  sandbox1.indexedDB = idb;

  const origSet = mock.chrome.storage.local.set;
  let throwOnSet = true;
  mock.chrome.storage.local.set = async (obj) => {
    if (throwOnSet && obj.cfg) throw new Error("decision set failed");
    return origSet(obj);
  };

  vm.runInNewContext(readExtFile("background.js"), sandbox1);
  const bg1 = sandbox1.SolstoneBackground;
  await bg1.ensureInit();
  const port1 = bg1.port;
  assert.ok(port1.fence && typeof port1.fence === "object");
  assert.deepEqual(mock.storageData.cfg, { chosenOrigins: ["https://bank.com"] });
  assert.ok(port1.livePatterns.includes("*://*/*"));
  assert.equal(sandbox1.SolstoneHosts.originGranted(port1, "https://other.example"), false);
  const optionsSender1 = { id: mock.chrome.runtime.id, url: `chrome-extension://${mock.chrome.runtime.id}/options.html` };
  const pauseRes = await new Promise((resolve) => mock.listeners.onMessage[0](
    { cmd: "setPaused", paused: true }, optionsSender1, resolve));
  assert.equal(pauseRes.ok, false);
  assert.equal(pauseRes.saved, false);
  assert.equal(mock.storageData.cfg.paused, undefined);

  throwOnSet = false;
  const sandbox2 = createSandbox(mock, true);
  sandbox2.indexedDB = idb;
  vm.runInNewContext(readExtFile("background.js"), sandbox2);
  const bg2 = sandbox2.SolstoneBackground;
  await bg2.ensureInit();
  const port2 = bg2.port;
  assert.ok(port2.fence && typeof port2.fence === "object");
  assert.equal(mock.storageData.cfg.siteGrant, "live");
  assert.deepEqual(Array.from(mock.storageData.cfg.fence.entries), ["https://bank.com"]);
});

test("Safari, no cfg, getAll non-empty: paused, clearedNotice true, fence null. If the cfg set throws, DB.clear is not called", async () => {
  const idb = new IDBFactory();
  const mock = createMockChrome();
  mock.chrome.runtime.getURL = (path) => `safari-web-extension://6f4d5042-ab48-42e5-a191-38327b4ea30b/${path}`;
  mock.grantedPermissions.clear();
  mock.grantedPermissions.add("*://*.example.com/*");

  const sandbox = createSandbox(mock, true);
  sandbox.indexedDB = idb;
  vm.runInNewContext(readExtFile("background.js"), sandbox);
  const bg = sandbox.SolstoneBackground;
  await bg.ensureInit();
  const port = bg.port;
  assert.equal(port.paused, true);
  assert.equal(port.clearedNotice, true);
  assert.equal(port.fence, null);

  const sender = { id: mock.chrome.runtime.id, tab: { id: 101 }, frameId: 0, url: "https://example.com/page", origin: "https://example.com" };
  const resHello = await new Promise(resolve => mock.listeners.onMessage[0](
    { kind: "hello", realmToken: "r", documentKey: "0123456789abcdef0123456789abcdef" },
    sender,
    resolve
  ));
  assert.equal(resHello.ok, false);

  const optionsSender = { id: mock.chrome.runtime.id, url: "safari-web-extension://6f4d5042-ab48-42e5-a191-38327b4ea30b/options.html" };
  const unpauseRes = await new Promise(resolve => mock.listeners.onMessage[0](
    { cmd: "setPaused", paused: false },
    optionsSender,
    resolve
  ));
  assert.equal(unpauseRes.ok, true);
  assert.equal(port.clearedNotice, false);

  // If the cfg set throws, DB.clear is not called
  const mock2 = createMockChrome();
  mock2.chrome.runtime.getURL = (path) => `safari-web-extension://6f4d5042-ab48-42e5-a191-38327b4ea30b/${path}`;
  const idb2 = new IDBFactory();
  const sFirst = await startSafari(mock2, idb2);
  await sFirst.SolstoneDB.put("outbox", { batchId: "b1", origin: "https://example.com" });
  for (const k of Object.keys(mock2.storageData)) delete mock2.storageData[k];
  mock2.chrome.storage.local.set = async () => { throw new Error("storage set error"); };
  const sCleared = await startSafari(mock2, idb2);
  const keptOutbox = await sCleared.SolstoneDB.getAll("outbox");
  assert.equal(keptOutbox.length, 1);

  // Death between the pause write and clear leaves paused and still clears on the next boot
  const mock3 = createMockChrome();
  mock3.chrome.runtime.getURL = (path) => `safari-web-extension://6f4d5042-ab48-42e5-a191-38327b4ea30b/${path}`;
  const idb3 = new IDBFactory();
  const sFirst3 = await startSafari(mock3, idb3);
  await sFirst3.SolstoneDB.put("outbox", { batchId: "b3", origin: "https://example.com" });
  // Simulate pause write happened in storageData, but DB was not cleared yet
  mock3.storageData.cfg = { paused: true, clearedNotice: true, siteGrant: "live", startup: "cleared", fence: null };
  delete mock3.storageData.inst;
  const sCleared3 = await startSafari(mock3, idb3);
  assert.equal(sCleared3.SolstoneBackground.port.paused, true);
  assert.deepEqual(await sCleared3.SolstoneDB.getAll("outbox"), []);
});

test("keep-my-sites sets fence.answered and leaves the fence. One clean snapshot does not null it. Two snapshots with port.wallNow 60000 apart do, and a restarted worker loads that end from storage. wallNow going backward does not. getAll throwing does not clear cleanAt. sawMore then an empty snapshot does not end the fence", async () => {
  const { mock, sandbox, bg } = await startWorker({
    siteGrant: "live",
    fence: {
      entries: ["https://bank.com"],
      exact: [],
      exactKnown: true,
      siteWide: [],
      declined: [],
      answered: false,
      sawMore: false,
      cleanAt: null,
    },
  });
  const port = bg.port;
  let wall = 1_000_000;
  port.wallNow = () => wall;

  const optionsSender = { id: mock.chrome.runtime.id, url: `chrome-extension://${mock.chrome.runtime.id}/options.html` };
  await new Promise(resolve => mock.listeners.onMessage[0]({ cmd: "keepMySites" }, optionsSender, resolve));
  assert.equal(port.fence.answered, true);
  assert.ok(port.fence !== null);

  port.fence.answered = false;
  port.fence.sawMore = true;
  const status = port.getStatus();
  assert.equal(status.fence.sawMore, true);
  assert.equal(status.fence.answered, false);

  mock.grantedPermissions.clear();
  await bg.beginRead();
  assert.ok(port.fence !== null);

  port.fence.sawMore = false;
  port.fence.cleanAt = null;
  mock.grantedPermissions.clear();
  mock.grantedPermissions.add("*://*.bank.com/*");

  await bg.beginRead();
  assert.ok(port.fence !== null);
  assert.equal(port.fence.cleanAt, wall);

  mock.options.getAllThrows = true;
  await bg.beginRead();
  mock.options.getAllThrows = false;
  assert.equal(port.fence.cleanAt, wall);

  wall -= 10000;
  await bg.beginRead();
  assert.ok(port.fence !== null);

  wall += 70000;
  await bg.beginRead();
  assert.equal(port.fence, null);
  assert.equal(mock.storageData.cfg.fence, null);
});

test("shareEverySite with requestResolvesWithoutGrant and getAll never containing *://*/* returns share_held. shareThemToo while *://*/* is live returns question_every_site", async () => {
  const { mock, sandbox, bg } = await startWorker({
    siteGrant: "live",
    fence: {
      entries: ["https://bank.com"],
      exact: [],
      exactKnown: true,
      siteWide: [],
      declined: [],
      answered: false,
      sawMore: false,
      cleanAt: null,
    },
  });
  mock.options.requestResolvesWithoutGrant = true;
  mock.grantedPermissions.clear();
  mock.grantedPermissions.add("*://*.bank.com/*");
  const port = bg.port;

  const optionsSender = { id: mock.chrome.runtime.id, url: `chrome-extension://${mock.chrome.runtime.id}/options.html` };
  const shareRes = await new Promise(resolve => mock.listeners.onMessage[0]({ cmd: "shareEverySite" }, optionsSender, resolve));
  assert.equal(shareRes.ok, false);
  assert.equal(shareRes.result, "share_held");
  assert.ok(port.fence !== null);

  mock.grantedPermissions.add("*://*/*");
  await bg.beginRead();
  assert.ok(port.livePatterns.includes("*://*/*"));

  const themTooRes = await new Promise(resolve => mock.listeners.onMessage[0]({ cmd: "shareThemToo" }, optionsSender, resolve));
  assert.equal(themTooRes.ok, false);
  assert.equal(themTooRes.result, "question_every_site");
  assert.ok(port.fence !== null);
});

test("onAdded while getAll stays [] does not change livePatterns. onRemoved closes before getAll, and a snapshot that still lists the pattern stays closed", async () => {
  const { mock, sandbox, bg } = await startWorker(null, { noGrants: true });
  const port = bg.port;
  assert.deepEqual(Array.from(port.livePatterns), []);

  for (const fn of mock.listeners.onAddedPerm) {
    fn({ origins: ["*://*.bank.com/*"] });
  }
  assert.deepEqual(Array.from(port.livePatterns), []);

  mock.grantedPermissions.add("*://*.bank.com/*");
  await bg.beginRead();
  assert.deepEqual(Array.from(port.livePatterns), ["*://*.bank.com/*"]);

  let blockerResolve;
  const blocker = new Promise(r => blockerResolve = r);
  const origGetAll = mock.chrome.permissions.getAll;
  mock.chrome.permissions.getAll = async () => {
    await blocker;
    return origGetAll();
  };

  const removePromise = Promise.all(mock.listeners.onRemovedPerm.map(fn => fn({ origins: ["*://*.bank.com/*"] })));
  assert.equal(port.livePatterns.includes("*://*.bank.com/*"), false);

  blockerResolve();
  await removePromise;
  assert.equal(port.livePatterns.includes("*://*.bank.com/*"), false);
  mock.chrome.permissions.getAll = origGetAll;

  // Older beginRead resolving last does not win
  let slowResolve;
  const slowBlocker = new Promise(r => slowResolve = r);
  let callNum = 0;
  mock.chrome.permissions.getAll = async () => {
    callNum++;
    if (callNum === 1) {
      await slowBlocker;
      return { origins: ["*://*.older.com/*"] };
    }
    return { origins: ["*://*.newer.com/*"] };
  };

  const oldReadPromise = bg.beginRead();
  const newReadPromise = bg.beginRead();
  await newReadPromise;
  assert.deepEqual(Array.from(port.livePatterns), ["*://*.newer.com/*"]);

  slowResolve();
  await oldReadPromise;
  assert.deepEqual(Array.from(port.livePatterns), ["*://*.newer.com/*"]);
  mock.chrome.permissions.getAll = origGetAll;
});

test("getAll throwing after a known snapshot leaves livePatterns, fence, and registrations unchanged, and startup still connects. permissionsUnavailable on getStatus when no snapshot has ever succeeded", async () => {
  const mock1 = createMockChrome({ getAllThrows: true });
  const sandbox1 = createSandbox(mock1, true);
  vm.runInNewContext(readExtFile("background.js"), sandbox1);
  const bg1 = sandbox1.SolstoneBackground;
  await bg1.ensureInit();
  const port1 = bg1.port;
  assert.equal(port1.getStatus().permissionsUnavailable, true);
  assert.deepEqual(Array.from(port1.livePatterns), []);

  const mock2 = createMockChrome();
  mock2.grantedPermissions.clear();
  mock2.grantedPermissions.add("*://*.bank.com/*");
  const sandbox2 = createSandbox(mock2, true);
  vm.runInNewContext(readExtFile("background.js"), sandbox2);
  const bg2 = sandbox2.SolstoneBackground;
  await bg2.ensureInit();
  const port2 = bg2.port;
  assert.deepEqual(Array.from(port2.livePatterns), ["*://*.bank.com/*"]);
  assert.equal(port2.getStatus().permissionsUnavailable, undefined);

  mock2.options.getAllThrows = true;
  await bg2.beginRead();
  assert.deepEqual(Array.from(port2.livePatterns), ["*://*.bank.com/*"]);
  assert.equal(port2.getStatus().permissionsUnavailable, undefined);
});

test("A second beginRead with the same origins does not call registerContentScripts or executeScript", async () => {
  const { mock, sandbox, bg } = await startWorker();
  mock.grantedPermissions.clear();
  mock.grantedPermissions.add("*://*.bank.com/*");
  await bg.beginRead();

  let registerCalls = 0;
  let executeCalls = 0;
  const origReg = mock.chrome.scripting.registerContentScripts;
  const origExec = mock.chrome.scripting.executeScript;
  mock.chrome.scripting.registerContentScripts = async (...args) => { registerCalls++; return origReg(...args); };
  mock.chrome.scripting.executeScript = async (...args) => { executeCalls++; return origExec(...args); };

  await bg.beginRead();
  assert.equal(registerCalls, 0);
  assert.equal(executeCalls, 0);

  for (const fn of mock.listeners.onAlarm) {
    await fn({ name: "native-port" });
  }
  assert.equal(registerCalls, 0);
  assert.equal(executeCalls, 0);
});

test("Spy: permissions.remove count does not increase across doInit, the alarm, or acknowledgeDisclosure", async () => {
  const mock = createMockChrome();
  mock.storageData.cfg = { chosenOrigins: ["https://example.com"] };
  let removeCalls = 0;
  const origRemove = mock.chrome.permissions.remove;
  mock.chrome.permissions.remove = async (args) => {
    removeCalls++;
    return origRemove(args);
  };

  const sandbox = createSandbox(mock, true);
  vm.runInNewContext(readExtFile("background.js"), sandbox);
  const bg = sandbox.SolstoneBackground;
  await bg.ensureInit();
  assert.equal(removeCalls, 0);

  for (const fn of mock.listeners.onAlarm) {
    await fn({ name: "native-port" });
  }
  assert.equal(removeCalls, 0);

  const optionsSender = { id: mock.chrome.runtime.id, url: `chrome-extension://${mock.chrome.runtime.id}/options.html` };
  await new Promise(resolve => mock.listeners.onMessage[0]({ cmd: "acknowledgeDisclosure", version: 1 }, optionsSender, resolve));
  assert.equal(removeCalls, 0);

  await new Promise(resolve => mock.listeners.onMessage[0]({ cmd: "setLeftOut", host: "bank.com", out: true }, optionsSender, resolve));
  assert.equal(removeCalls, 0);

  // The only grant was the broad pattern. Seed the site so remove-this-site
  // still calls permissions.remove, and still does not remove *://*/*.
  mock.grantedPermissions.add("https://example.com/*");
  const removed = [];
  const countingRemove = mock.chrome.permissions.remove;
  mock.chrome.permissions.remove = async (args) => {
    removed.push(args);
    return countingRemove(args);
  };
  await new Promise(resolve => mock.listeners.onMessage[0]({ cmd: "removeGrantedOrigin", origin: "https://example.com" }, optionsSender, resolve));
  assert.equal(removed.some((args) => (args.origins || []).includes("*://*/*")), false);
  assert.ok(removeCalls > 0);
  const afterRemoveOrigin = removeCalls;

  // stopSharingEverySite on non-Safari calls remove
  await new Promise(resolve => mock.listeners.onMessage[0]({ cmd: "stopSharingEverySite" }, optionsSender, resolve));
  assert.ok(removeCalls > afterRemoveOrigin);
});

test("captureEpoch on hello, leaseUpdate, and getStatus moves when livePatterns changes and when fence changes", async () => {
  const mock = createMockChrome();
  mock.storageData.cfg = { siteGrant: "live", fence: null, startup: "existing" };
  mock.grantedPermissions.clear();
  mock.grantedPermissions.add("*://*.bank.com/*");
  mock.chrome.tabs.sendMessage = (tabId, msg, ...args) => {
    mock.sentTabMessages.push({ tabId, msg });
    if (msg?.kind === "confirmRealm") {
      const cb = typeof args[0] === "function" ? args[0] : (typeof args[1] === "function" ? args[1] : null);
      if (cb) cb({ realmToken: "r" });
      return Promise.resolve({ realmToken: "r" });
    }
    const cb = typeof args[0] === "function" ? args[0] : (typeof args[1] === "function" ? args[1] : null);
    if (cb) cb();
    return Promise.resolve();
  };

  const sandbox = createSandbox(mock);
  vm.runInNewContext(readExtFile("background.js"), sandbox);
  const bg = sandbox.SolstoneBackground;
  await bg.ensureInit();
  await new Promise(resolve => setImmediate(resolve));
  const port = bg.port;

  const senderBank = { id: mock.chrome.runtime.id, tab: { id: 101 }, frameId: 0, url: "https://bank.com/page", origin: "https://bank.com" };
  const resHello1 = await new Promise(resolve => mock.listeners.onMessage[0](
    { kind: "hello", realmToken: "r", documentKey: "0123456789abcdef0123456789abcdef" },
    senderBank,
    resolve
  ));
  assert.equal(resHello1.ok, true);
  assert.ok(resHello1.livePatterns.includes("*://*.bank.com/*"));
  assert.equal(resHello1.fence, null);
  assert.equal(typeof resHello1.captureEpoch, "number");
  const epoch1 = resHello1.captureEpoch;
  const status1 = port.getStatus();
  assert.equal(status1.captureEpoch, epoch1);
  assert.deepEqual(Array.from(status1.livePatterns), Array.from(resHello1.livePatterns));
  assert.equal(status1.fence, null);

  mock.sentTabMessages.length = 0;
  mock.grantedPermissions.add("*://*.other.com/*");
  await bg.beginRead();

  const status2 = port.getStatus();
  assert.ok(status2.captureEpoch > epoch1);
  const epoch2 = status2.captureEpoch;

  const leaseUpdate1 = mock.sentTabMessages.find(m => m.msg?.kind === "leaseUpdate")?.msg;
  assert.ok(leaseUpdate1);
  assert.equal(leaseUpdate1.captureEpoch, epoch2);
  assert.ok(leaseUpdate1.livePatterns.includes("*://*.bank.com/*"));
  assert.ok(leaseUpdate1.livePatterns.includes("*://*.other.com/*"));
  assert.equal(leaseUpdate1.fence, null);

  const resHello2 = await new Promise(resolve => mock.listeners.onMessage[0](
    { kind: "hello", realmToken: "r", documentKey: "0123456789abcdef0123456789abcdef" },
    senderBank,
    resolve
  ));
  assert.equal(resHello2.ok, true);
  assert.equal(resHello2.captureEpoch, epoch2);
  assert.ok(resHello2.livePatterns.includes("*://*.bank.com/*"));
  assert.ok(resHello2.livePatterns.includes("*://*.other.com/*"));

  port.fence = {
    entries: ["https://bank.com"],
    exact: ["https://bank.com"],
    exactKnown: true,
    siteWide: [],
    declined: [],
    answered: false,
    sawMore: false,
    cleanAt: null,
  };
  mock.sentTabMessages.length = 0;
  port.notify();

  const resHello3 = await new Promise(resolve => mock.listeners.onMessage[0](
    { kind: "hello", realmToken: "r", documentKey: "0123456789abcdef0123456789abcdef" },
    senderBank,
    resolve
  ));
  assert.equal(resHello3.ok, true);
  const epoch3 = resHello3.captureEpoch;
  assert.ok(epoch3 > epoch2);

  const status3 = port.getStatus();
  assert.equal(status3.captureEpoch, epoch3);
  assert.deepEqual(Array.from(status3.fence.entries), ["https://bank.com"]);
  assert.deepEqual(Array.from(resHello3.fence.entries), ["https://bank.com"]);

  const leaseUpdate2 = mock.sentTabMessages.slice().reverse().find(m => m.msg?.kind === "leaseUpdate")?.msg;
  assert.ok(leaseUpdate2);
  assert.equal(leaseUpdate2.captureEpoch, epoch3);
  assert.deepEqual(Array.from(leaseUpdate2.fence.entries), ["https://bank.com"]);
});

test("fenced owner with *://*/* live never registers cs-all-sites, and login.bank.com stays closed until shareEverySite ends the fence", async () => {
  const mock = createMockChrome();
  mock.storageData.cfg = {
    siteGrant: "live",
    fence: {
      entries: ["https://bank.com"],
      exact: ["https://bank.com"],
      exactKnown: true,
      siteWide: [],
      declined: [],
      answered: false,
      sawMore: false,
      cleanAt: null,
    },
  };
  mock.grantedPermissions.clear();
  mock.grantedPermissions.add("*://*/*");
  mock.chrome.tabs.sendMessage = (tabId, msg, ...args) => {
    mock.sentTabMessages.push({ tabId, msg });
    if (msg?.kind === "confirmRealm") {
      const cb = typeof args[0] === "function" ? args[0] : (typeof args[1] === "function" ? args[1] : null);
      if (cb) cb({ realmToken: "r" });
      return Promise.resolve({ realmToken: "r" });
    }
    const cb = typeof args[0] === "function" ? args[0] : (typeof args[1] === "function" ? args[1] : null);
    if (cb) cb();
    return Promise.resolve();
  };

  const sandbox = createSandbox(mock);
  vm.runInNewContext(readExtFile("background.js"), sandbox);
  const bg = sandbox.SolstoneBackground;
  await bg.ensureInit();
  await new Promise(resolve => setImmediate(resolve));
  const port = bg.port;

  assert.equal(mock.registeredScripts.has("cs-all-sites"), false);
  assert.equal(mock.registeredScripts.has("cs-bank.com"), true);

  const senderLogin = { id: mock.chrome.runtime.id, tab: { id: 101 }, frameId: 0, url: "https://login.bank.com/page", origin: "https://login.bank.com" };
  const resHello1 = await new Promise(resolve => mock.listeners.onMessage[0](
    { kind: "hello", realmToken: "r", documentKey: "0123456789abcdef0123456789abcdef" },
    senderLogin,
    resolve
  ));
  assert.equal(resHello1.ok, false);
  assert.equal(resHello1.error, "origin_not_granted");

  const optionsSender = { id: mock.chrome.runtime.id, url: `chrome-extension://${mock.chrome.runtime.id}/options.html` };
  const shareRes = await new Promise(resolve => mock.listeners.onMessage[0](
    { cmd: "shareEverySite" },
    optionsSender,
    resolve
  ));
  assert.equal(shareRes.ok, true);
  assert.equal(shareRes.result, "shared");
  assert.equal(port.fence, null);
  assert.equal(mock.storageData.cfg.fence, null);

  const resHello2 = await new Promise(resolve => mock.listeners.onMessage[0](
    { kind: "hello", realmToken: "r", documentKey: "0123456789abcdef0123456789abcdef" },
    senderLogin,
    resolve
  ));
  assert.equal(resHello2.ok, true);
  assert.equal(resHello2.broadGrant, true);
  assert.ok(resHello2.livePatterns.includes("*://*/*"));

  const status = port.getStatus();
  assert.equal(status.broadGrant, true);
  assert.equal(status.captureEpoch, resHello2.captureEpoch);
  assert.deepEqual(Array.from(status.livePatterns), Array.from(resHello2.livePatterns));

  const leaseUpdate = mock.sentTabMessages.slice().reverse().find(m => m.msg?.kind === "leaseUpdate")?.msg;
  assert.ok(leaseUpdate);
  assert.equal(leaseUpdate.broadGrant, true);
  assert.equal(leaseUpdate.captureEpoch, resHello2.captureEpoch);
});

test("request true with no covering grant adds nothing; an already-covering pattern is on and does not call permissions.request", async () => {
  // First worker
  const mock1 = createMockChrome({ requestResolvesWithoutGrant: true });
  mock1.storageData.cfg = { siteGrant: "live", fence: null, startup: "existing" };
  mock1.grantedPermissions.clear();
  const sandbox1 = createSandbox(mock1);
  vm.runInNewContext(readExtFile("background.js"), sandbox1);
  const bg1 = sandbox1.SolstoneBackground;
  await bg1.ensureInit();
  await new Promise(resolve => setImmediate(resolve));

  const optionsSender1 = { id: mock1.chrome.runtime.id, url: `chrome-extension://${mock1.chrome.runtime.id}/options.html` };
  const ackRes1 = await new Promise(resolve => mock1.listeners.onMessage[0](
    { cmd: "acknowledgeDisclosure", version: 1 },
    optionsSender1,
    resolve
  ));
  assert.equal(ackRes1.ok, true);

  let requestCalls1 = 0;
  const origRequest1 = mock1.chrome.permissions.request;
  mock1.chrome.permissions.request = async (...args) => {
    requestCalls1++;
    return origRequest1(...args);
  };

  const addRes1 = await new Promise(resolve => mock1.listeners.onMessage[0](
    { cmd: "addGrantedOrigin", origin: "https://bank.com" },
    optionsSender1,
    resolve
  ));
  assert.equal(addRes1.ok, false);
  assert.equal(addRes1.result, "not_added");
  assert.equal(requestCalls1, 0);
  assert.deepEqual(Array.from(bg1.port.livePatterns), []);
  assert.equal((bg1.port.excludedHosts || []).includes("bank.com"), false);
  assert.equal(bg1.port.addIntent, null);

  // Second worker
  const mock2 = createMockChrome();
  mock2.storageData.cfg = { siteGrant: "live", fence: null, startup: "existing" };
  mock2.grantedPermissions.clear();
  mock2.grantedPermissions.add("*://*.bank.com/*");
  const sandbox2 = createSandbox(mock2);
  vm.runInNewContext(readExtFile("background.js"), sandbox2);
  const bg2 = sandbox2.SolstoneBackground;
  await bg2.ensureInit();
  await new Promise(resolve => setImmediate(resolve));

  const optionsSender2 = { id: mock2.chrome.runtime.id, url: `chrome-extension://${mock2.chrome.runtime.id}/options.html` };
  const ackRes2 = await new Promise(resolve => mock2.listeners.onMessage[0](
    { cmd: "acknowledgeDisclosure", version: 1 },
    optionsSender2,
    resolve
  ));
  assert.equal(ackRes2.ok, true);

  let requestCalls2 = 0;
  const origRequest2 = mock2.chrome.permissions.request;
  mock2.chrome.permissions.request = async (...args) => {
    requestCalls2++;
    return origRequest2(...args);
  };

  const addRes2 = await new Promise(resolve => mock2.listeners.onMessage[0](
    { cmd: "addGrantedOrigin", origin: "https://login.bank.com" },
    optionsSender2,
    resolve
  ));
  assert.equal(addRes2.ok, true);
  assert.equal(requestCalls2, 0);
  assert.deepEqual(Array.from(bg2.port.livePatterns), ["*://*.bank.com/*"]);
  assert.equal(sandbox2.SolstoneHosts.originGranted(bg2.port, "https://login.bank.com"), true);
});

test("a stored add intent joins login.bank.com on a site grant, and share every site then reads mail.bank.com", async () => {
  const fence = {
    entries: ["https://example.com"],
    exact: ["https://example.com"],
    exactKnown: true,
    siteWide: [],
    declined: ["bank.com"],
    answered: false,
    sawMore: false,
    cleanAt: null,
  };
  const mock = createMockChrome();
  mock.storageData.cfg = { siteGrant: "live", fence, startup: "existing" };
  mock.grantedPermissions.clear();
  mock.chrome.tabs.sendMessage = (tabId, msg, ...args) => {
    mock.sentTabMessages.push({ tabId, msg });
    if (msg?.kind === "confirmRealm") {
      const cb = typeof args[0] === "function" ? args[0] : (typeof args[1] === "function" ? args[1] : null);
      if (cb) cb({ realmToken: "r" });
      return Promise.resolve({ realmToken: "r" });
    }
    const cb = typeof args[0] === "function" ? args[0] : (typeof args[1] === "function" ? args[1] : null);
    if (cb) cb();
    return Promise.resolve();
  };
  const sandbox = createSandbox(mock);
  vm.runInNewContext(readExtFile("background.js"), sandbox);
  const bg = sandbox.SolstoneBackground;
  const H = sandbox.SolstoneHosts;
  await bg.ensureInit();
  await new Promise((resolve) => setImmediate(resolve));
  const port = bg.port;
  const optionsSender = { id: mock.chrome.runtime.id, url: `chrome-extension://${mock.chrome.runtime.id}/options.html` };
  const key = "0123456789abcdef0123456789abcdef";
  const send = (msg, sender = optionsSender) => new Promise((resolve) => mock.listeners.onMessage[0](msg, sender, resolve));
  const hello = (origin) => send(
    { kind: "hello", realmToken: "r", documentKey: key },
    { id: mock.chrome.runtime.id, tab: { id: 101 }, frameId: 0, url: `${origin}/page`, origin },
  );
  let requestCalls = 0;
  const origRequest = mock.chrome.permissions.request;
  mock.chrome.permissions.request = async (...args) => {
    requestCalls += 1;
    return origRequest(...args);
  };
  assert.equal((await send({ cmd: "acknowledgeDisclosure", version: 1 })).ok, true);

  await bg.setCfg({ addIntent: { origin: "https://login.bank.com/path", at: 1 } });
  assert.equal(mock.storageData.cfg.addIntent, null);
  await bg.setCfg({ addIntent: { origin: "ftp://files.example", at: 1 } });
  assert.equal(mock.storageData.cfg.addIntent, null);
  await bg.setCfg({ addIntent: { origin: "https://login.bank.com", at: Number.NaN } });
  assert.equal(mock.storageData.cfg.addIntent, null);
  await bg.setCfg({ addIntent: { at: 5 } });
  assert.equal(mock.storageData.cfg.addIntent, null);
  await bg.setCfg({ addIntent: { origin: "https://login.bank.com", at: 42 } });
  assert.equal(mock.storageData.cfg.addIntent.origin, "https://login.bank.com");
  assert.equal(mock.storageData.cfg.addIntent.at, 42);
  await bg.doInit();
  assert.equal(bg.port.addIntent.origin, "https://login.bank.com");
  assert.equal(bg.port.addIntent.at, 42);

  const fresh = {
    entries: ["https://example.com"],
    exact: ["https://example.com"],
    exactKnown: true,
    siteWide: [],
    declined: ["bank.com"],
    answered: false,
    sawMore: false,
    cleanAt: null,
  };
  port.fence = null;
  port.addIntent = null;
  const plain = await send({ cmd: "intendAddOrigin", origin: "https://login.bank.com", at: 999 });
  assert.equal(plain.ok, true);
  assert.equal(plain.stored, false);
  assert.equal(port.addIntent, null);

  port.fence = { ...fresh, entries: [...fresh.entries], exact: [...fresh.exact], declined: [...fresh.declined] };
  const content = await send(
    { cmd: "intendAddOrigin", origin: "https://login.bank.com", at: 999 },
    { id: mock.chrome.runtime.id, tab: { id: 101 }, frameId: 0, url: "https://login.bank.com/page", origin: "https://login.bank.com" },
  );
  assert.notEqual(content.stored, true);
  assert.equal(port.addIntent, null);

  const clock = 5_000_000;
  port.wallNow = () => clock;
  const stored = await send({ cmd: "intendAddOrigin", origin: "https://login.bank.com", at: 999 });
  assert.equal(stored.ok, true);
  assert.equal(stored.stored, true);
  assert.equal(port.addIntent.origin, "https://login.bank.com");
  assert.equal(port.addIntent.at, clock);

  port.addIntent = { origin: "https://login.bank.com", at: clock - 600001 };
  mock.grantedPermissions.add("*://*.bank.com/*");
  await bg.beginRead();
  assert.equal(port.fence.entries.includes("https://login.bank.com"), false);
  assert.equal(port.addIntent.origin, "https://login.bank.com");
  assert.equal(port.addIntent.at, clock - 600001);
  assert.ok(port.fence.declined.includes("bank.com"));

  mock.grantedPermissions.delete("*://*.bank.com/*");
  mock.grantedPermissions.add("*://*/*");
  port.addIntent = { origin: "https://login.bank.com", at: clock };
  await bg.beginRead();
  assert.equal(port.fence.entries.includes("https://login.bank.com"), false);
  assert.equal(port.addIntent.origin, "https://login.bank.com");
  assert.equal(port.addIntent.at, clock);

  const declinedBefore = Array.from(port.fence.declined);
  await send({ cmd: "clearAddIntent", origin: "https://other.test" });
  assert.equal(port.addIntent.origin, "https://login.bank.com");
  assert.equal(port.addIntent.at, clock);
  await send({ cmd: "clearAddIntent", origin: "https://login.bank.com" });
  assert.equal(port.addIntent, null);
  assert.deepEqual(Array.from(port.fence.declined), declinedBefore);

  mock.grantedPermissions.clear();
  await bg.beginRead();
  port.addIntent = { origin: "https://login.bank.com", at: clock };
  const missed = await send({ cmd: "addGrantedOrigin", origin: "https://login.bank.com" });
  assert.equal(missed.ok, false);
  assert.equal(missed.result, "not_added");
  assert.equal(port.addIntent, null);
  assert.equal(H.originGranted(port, "https://login.bank.com"), false);
  assert.ok(port.fence.declined.includes("bank.com"));

  port.fence = {
    entries: ["https://example.com"],
    exact: ["https://example.com"],
    exactKnown: true,
    siteWide: [],
    declined: ["bank.com"],
    answered: false,
    sawMore: false,
    cleanAt: null,
  };
  port.addIntent = { origin: "https://login.bank.com", at: clock };
  mock.grantedPermissions.clear();
  mock.grantedPermissions.add("*://*.login.bank.com/*");
  await bg.beginRead();
  assert.ok(port.fence.entries.includes("https://login.bank.com"));
  assert.equal(port.fence.declined.includes("bank.com"), false);
  assert.equal((await hello("https://mail.bank.com")).error, "origin_not_granted");

  port.fence = {
    entries: ["https://example.com"],
    exact: ["https://example.com"],
    exactKnown: true,
    siteWide: [],
    declined: ["bank.com"],
    answered: false,
    sawMore: false,
    cleanAt: null,
  };
  port.addIntent = { origin: "https://login.bank.com", at: clock };
  mock.grantedPermissions.clear();
  mock.grantedPermissions.add("*://*.bank.com/*");
  await bg.beginRead();
  assert.ok(port.fence.entries.includes("https://login.bank.com"));
  assert.ok(port.fence.entries.includes("https://example.com"));
  assert.ok(port.fence.exact.includes("https://example.com"));
  assert.equal(port.fence.exact.includes("https://login.bank.com"), false);
  assert.equal(port.addIntent, null);
  assert.equal(port.fence.declined.includes("bank.com"), false);
  assert.equal(port.fence.sawMore, true);
  assert.equal((await hello("https://login.bank.com")).ok, true);
  assert.equal((await hello("https://bank.com")).error, "origin_not_granted");

  const beforeJoin = requestCalls;
  const again = await send({ cmd: "addGrantedOrigin", origin: "https://login.bank.com" });
  assert.equal(again.ok, true);
  assert.equal(requestCalls, beforeJoin);

  mock.grantedPermissions.add("*://*/*");
  const share = await send({ cmd: "shareEverySite" });
  assert.equal(share.ok, true);
  assert.equal(share.result, "shared");
  assert.equal(port.fence, null);
  assert.equal((await hello("https://mail.bank.com")).ok, true);
  assert.equal(requestCalls, 0);
});

test("fenced add joins the fence with no prompt and survives setCfg({paused:true})", async () => {
  const mock = createMockChrome();
  mock.storageData.cfg = {
    siteGrant: "live",
    fence: {
      entries: ["https://example.com"],
      exact: [],
      exactKnown: true,
      siteWide: [],
      declined: [],
      answered: false,
      sawMore: false,
      cleanAt: null,
    },
  };
  mock.grantedPermissions.clear();
  mock.grantedPermissions.add("*://*.bank.com/*");
  mock.chrome.tabs.sendMessage = (tabId, msg, ...args) => {
    mock.sentTabMessages.push({ tabId, msg });
    if (msg?.kind === "confirmRealm") {
      const cb = typeof args[0] === "function" ? args[0] : (typeof args[1] === "function" ? args[1] : null);
      if (cb) cb({ realmToken: "r" });
      return Promise.resolve({ realmToken: "r" });
    }
    const cb = typeof args[0] === "function" ? args[0] : (typeof args[1] === "function" ? args[1] : null);
    if (cb) cb();
    return Promise.resolve();
  };

  const sandbox = createSandbox(mock);
  vm.runInNewContext(readExtFile("background.js"), sandbox);
  const bg = sandbox.SolstoneBackground;
  await bg.ensureInit();
  await new Promise(resolve => setImmediate(resolve));
  const port = bg.port;

  const optionsSender = { id: mock.chrome.runtime.id, url: `chrome-extension://${mock.chrome.runtime.id}/options.html` };
  await new Promise(resolve => mock.listeners.onMessage[0](
    { cmd: "acknowledgeDisclosure", version: 1 },
    optionsSender,
    resolve
  ));

  let requestCalls = 0;
  const origRequest = mock.chrome.permissions.request;
  mock.chrome.permissions.request = async (...args) => {
    requestCalls++;
    return origRequest(...args);
  };

  const addRes = await new Promise(resolve => mock.listeners.onMessage[0](
    { cmd: "addGrantedOrigin", origin: "https://bank.com" },
    optionsSender,
    resolve
  ));
  assert.equal(addRes.ok, true);
  assert.equal(requestCalls, 0);
  assert.ok(port.fence.entries.includes("https://bank.com"));

  await bg.setCfg({ paused: true });
  assert.equal(mock.storageData.cfg.paused, true);
  assert.ok(mock.storageData.cfg.fence.entries.includes("https://bank.com"));
  assert.equal(Object.hasOwn(mock.storageData.cfg, "chosenOrigins"), false);
  assert.equal(Object.hasOwn(mock.storageData.cfg, "siteMode"), false);

  const senderBank = { id: mock.chrome.runtime.id, tab: { id: 101 }, frameId: 0, url: "https://bank.com/page", origin: "https://bank.com" };
  const resHello = await new Promise(resolve => mock.listeners.onMessage[0](
    { kind: "hello", realmToken: "r", documentKey: "0123456789abcdef0123456789abcdef" },
    senderBank,
    resolve
  ));
  assert.equal(resHello.ok, true);
});

test("excludedHosts, appLeftOut, and fence survive getCfg's drop of old fields and a later setCfg", async () => {
  const mock = createMockChrome();
  mock.storageData.cfg = {
    siteGrant: "live",
    excludedHosts: ["bank.com"],
    appLeftOut: ["mail.google.com"],
    appLeftOutRaw: ["Mail.google.com"],
    fence: {
      entries: ["https://bank.com"],
      exact: [],
      exactKnown: true,
      siteWide: [],
      declined: [],
      answered: false,
      sawMore: false,
      cleanAt: null,
    },
    chosenOrigins: ["https://old.example"],
    siteMode: "selected",
  };
  mock.grantedPermissions.clear();

  const sandbox = createSandbox(mock);
  vm.runInNewContext(readExtFile("background.js"), sandbox);
  const bg = sandbox.SolstoneBackground;
  await bg.ensureInit();
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(Object.hasOwn(mock.storageData.cfg, "chosenOrigins"), false);
  assert.equal(Object.hasOwn(mock.storageData.cfg, "siteMode"), false);
  assert.deepEqual(Array.from(mock.storageData.cfg.excludedHosts), ["bank.com"]);
  assert.deepEqual(Array.from(mock.storageData.cfg.appLeftOut), ["mail.google.com"]);
  assert.deepEqual(Array.from(mock.storageData.cfg.fence.entries), ["https://bank.com"]);

  await bg.setCfg({ paused: true });
  assert.equal(mock.storageData.cfg.paused, true);
  assert.equal(mock.storageData.cfg.siteGrant, "live");
  assert.deepEqual(Array.from(mock.storageData.cfg.excludedHosts), ["bank.com"]);
  assert.deepEqual(Array.from(mock.storageData.cfg.appLeftOut), ["mail.google.com"]);
  assert.deepEqual(Array.from(mock.storageData.cfg.fence.entries), ["https://bank.com"]);
  assert.equal(Object.hasOwn(mock.storageData.cfg, "chosenOrigins"), false);
  assert.equal(Object.hasOwn(mock.storageData.cfg, "siteMode"), false);
});

function extensionSender(mock) {
  const id = mock.chrome.runtime.id;
  return { id, url: `chrome-extension://${id}/options.html` };
}

test("lifecycle: failed leave-out save keeps the gate false", async () => {
  const { mock, sandbox, bg } = await startWorker({ siteGrant: "live", fence: null }, { noGrants: true });
  mock.grantedPermissions.add("*://*/*");
  await bg.beginRead();
  const port = bg.port;
  const H = sandbox.SolstoneHosts;
  assert.equal(H.originGranted(port, "https://bank.example"), true);
  port.excludedHosts = undefined;
  const queued = port.ruleQueue.length;
  const res = await sandbox.SolstoneRouter.route(
    { cmd: "setLeftOut", host: "bank.example", out: true },
    extensionSender(mock),
    { runtimeId: mock.chrome.runtime.id, port, setCfg: async () => { throw new Error("disk full"); } },
  );
  assert.equal(res.ok, false);
  assert.equal(res.error, "storage_error");
  assert.equal(H.originGranted(port, "https://bank.example"), false);
  assert.ok(port.excludedHosts.includes("bank.example"));
  assert.equal(port.ruleQueue.length, queued);
});

test("lifecycle: failed include save stays left out", async () => {
  const { mock, sandbox, bg } = await startWorker({
    siteGrant: "live", fence: null, excludedHosts: ["example.com"],
  }, { noGrants: true });
  mock.grantedPermissions.add("*://*/*");
  await bg.beginRead();
  const port = bg.port;
  const H = sandbox.SolstoneHosts;
  const gen = port.excludedGen;
  const queued = port.ruleQueue.length;
  assert.equal(H.originGranted(port, "https://example.com"), false);
  const res = await sandbox.SolstoneRouter.route(
    { cmd: "setLeftOut", host: "example.com", out: false },
    extensionSender(mock),
    { runtimeId: mock.chrome.runtime.id, port, setCfg: async () => { throw new Error("disk full"); } },
  );
  assert.equal(res.ok, false);
  assert.equal(res.error, "storage_error");
  assert.ok(port.excludedHosts.includes("example.com"));
  assert.equal(port.excludedGen, gen);
  assert.equal(port.ruleQueue.length, queued);
  assert.equal(H.originGranted(port, "https://example.com"), false);
});

test("lifecycle: after a restart, an app reset keeps every site the app had left out", async () => {
  const { mock, sandbox, bg } = await startWorker({
    siteGrant: "live",
    fence: null,
    appLeftOut: ["bank.com"],
    appLeftOutRaw: ["*.bank.com"],
    appLeftOutEpoch: "E1",
    appLeftOutRev: 5,
  }, { noGrants: true });
  const port = bg.port;
  await deliverState(port, { left_out: [], left_out_epoch: "E2", left_out_rev: 1 });
  await port.leftOutTail;
  assert.ok(port.excludedHosts.includes("bank.com"));
  mock.grantedPermissions.add("*://*/*");
  await bg.beginRead();
  assert.equal(sandbox.SolstoneHosts.originGranted(port, "https://bank.com"), false);
  const saved = Array.from(mock.storageData.cfg.excludedHosts || []);
  assert.ok(saved.includes("bank.com"));

  const second = await startWorker({
    siteGrant: "live",
    fence: null,
    excludedHosts: saved,
    appLeftOut: [],
    appLeftOutRaw: [],
    appLeftOutEpoch: "E2",
    appLeftOutRev: 1,
  }, { noGrants: true });
  second.mock.grantedPermissions.add("*://*/*");
  await second.bg.beginRead();
  assert.equal(second.sandbox.SolstoneHosts.originGranted(second.bg.port, "https://bank.com"), false);
});

test("lifecycle: after a restart, an app-side removal at a higher rev is applied and not re-sent", async () => {
  const { mock, bg } = await startWorker({
    siteGrant: "live",
    fence: null,
    excludedHosts: ["bank.com"],
    appLeftOut: ["bank.com"],
    appLeftOutRaw: ["bank.com"],
    appLeftOutEpoch: "E1",
    appLeftOutRev: 5,
  }, { noGrants: true });
  const port = bg.port;
  const sent = [];
  port.livePort = { postMessage: (message) => sent.push(message) };
  await deliverState(port, { left_out: [], left_out_epoch: "E1", left_out_rev: 6 });
  await port.leftOutTail;
  assert.equal(port.excludedHosts.includes("bank.com"), false);
  assert.equal(sent.some((message) => message.type === "site_rule" && message.host === "bank.com" && message.out === true), false);
  assert.equal(Array.from(mock.storageData.cfg.excludedHosts || []).includes("bank.com"), false);
});

test("lifecycle: an owner rule waits behind one already in flight, and a stuck one times out", async () => {
  const { bg } = await startWorker({ siteGrant: "live", fence: null }, { noGrants: true });
  const port = bg.port;
  const sent = [];
  port.livePort = { postMessage: (message) => sent.push(message) };
  port.handshake = "ready";
  port.leftOutCapable = true;
  port.outstandingRule = { id: 1, host: "a.com", out: true, sentAt: port.now() };
  port.queueSiteRule("y.com", true);
  assert.equal(sent.length, 0);
  port.outstandingRule.sentAt = port.now() - 11000;
  port.pumpRuleQueue();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].host, "y.com");
  assert.equal(port.migrationBlocked, true);
});

test("lifecycle: an in-flight older frame keeps the leave-out, and a restart still leaves it out", async () => {
  const { mock, sandbox, bg } = await startWorker({
    siteGrant: "live",
    fence: null,
    excludedHosts: [],
    appLeftOut: ["bank.com"],
    appLeftOutRaw: ["*.bank.com"],
    appLeftOutEpoch: "E1",
    appLeftOutRev: 5,
  }, { noGrants: true });
  mock.grantedPermissions.add("*://*/*");
  await bg.beginRead();
  const port = bg.port;
  const H = sandbox.SolstoneHosts;
  assert.equal(H.originGranted(port, "https://news.example"), true);
  const left = await sandbox.SolstoneRouter.route(
    { cmd: "setLeftOut", host: "news.example", out: true },
    extensionSender(mock),
    { runtimeId: mock.chrome.runtime.id, port, setCfg: bg.setCfg },
  );
  assert.equal(left.ok, true);
  assert.ok(port.excludedHosts.includes("news.example"));
  assert.equal(H.originGranted(port, "https://news.example"), false);
  assert.ok(port.ruleQueue.some((item) => item.host === "news.example" && item.out === true));

  const DB = sandbox.SolstoneDB;
  const originalPut = DB.put;
  let release = () => {};
  let entered = () => {};
  const gate = new Promise((resolve) => { release = resolve; });
  const hit = new Promise((resolve) => { entered = resolve; });
  let stalled = false;
  DB.put = async function (...args) {
    if (!stalled && args[0] === "meta") {
      stalled = true;
      entered();
      await gate;
    }
    return originalPut.apply(this, args);
  };

  try {
    const pending = port.commitLeftOut({
      appLeftOut: port.appLeftOut,
      appLeftOutRaw: port.appLeftOutRaw,
      appLeftOutEpoch: port.appLeftOutEpoch,
      appLeftOutRev: port.appLeftOutRev,
      excludedHosts: [],
    });
    await hit;
    assert.ok(port.excludedHosts.includes("news.example"));
    await deliverState(port, { left_out: [], left_out_epoch: "E2", left_out_rev: 1 });
    assert.ok(port.excludedHosts.includes("news.example"));
    assert.ok(port.excludedHosts.includes("bank.com"));
    release();
    await pending;
    const saved = Array.from(mock.storageData.cfg.excludedHosts || []);
    await port.leftOutTail;

    const restarted = await startWorker({
      siteGrant: "live",
      fence: null,
      excludedHosts: saved,
      appLeftOut: [],
      appLeftOutRaw: [],
      appLeftOutEpoch: "E2",
      appLeftOutRev: 1,
    }, { noGrants: true });
    restarted.mock.grantedPermissions.add("*://*/*");
    await restarted.bg.beginRead();
    assert.equal(restarted.sandbox.SolstoneHosts.originGranted(restarted.bg.port, "https://news.example"), false);
    assert.equal(restarted.sandbox.SolstoneHosts.originGranted(restarted.bg.port, "https://bank.com"), false);
  } finally {
    release();
    DB.put = originalPut;
  }
});

test("lifecycle: every site excludes a left-out host, and an app list change closes an open tab", async () => {
  const { mock, sandbox, bg } = await startWorker({ siteGrant: "live", fence: null }, { noGrants: true });
  mock.grantedPermissions.add("*://*/*");
  mock.tabsList.splice(0, mock.tabsList.length, { id: 7, url: "https://news.example/story", status: "complete" });
  await bg.beginRead();
  const before = await mock.chrome.scripting.getRegisteredContentScripts();
  const initial = before.find((script) => script.id === "cs-all-sites");
  assert.ok(initial);
  assert.equal(initial.excludeMatches, undefined);

  const executed = [];
  const origExec = mock.chrome.scripting.executeScript;
  mock.chrome.scripting.executeScript = async (options) => {
    executed.push(options);
    return origExec(options);
  };
  await deliverState(bg.port, { left_out: ["news.example"], left_out_epoch: "E1", left_out_rev: 1 });
  await bg.port.leftOutTail;
  let updated;
  for (let i = 0; i < 10; i++) {
    const scripts = await mock.chrome.scripting.getRegisteredContentScripts();
    updated = scripts.find((script) => script.id === "cs-all-sites");
    if (updated?.excludeMatches?.includes("*://*.news.example/*")) break;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.ok(updated);
  assert.ok(updated.excludeMatches.includes("*://*.news.example/*"));
  assert.equal(executed.some((call) => call?.target?.tabId === 7), false);
  assert.equal(sandbox.SolstoneHosts.originGranted(bg.port, "https://news.example"), false);

  const hello = await new Promise((resolve) => mock.listeners.onMessage[0](
    { kind: "hello", realmToken: "r", documentKey: "0123456789abcdef0123456789abcdef" },
    { id: mock.chrome.runtime.id, tab: { id: 7 }, frameId: 0, url: "https://news.example/story", origin: "https://news.example" },
    resolve,
  ));
  assert.equal(hello.ok, false);
  assert.equal(hello.error, "origin_not_granted");
});

test("lifecycle: auto-end after a restart leaves out a declined host from that read", async () => {
  const first = await startWorker({
    siteGrant: "live",
    fence: {
      entries: ["https://bank.com"],
      exact: [],
      exactKnown: true,
      siteWide: [],
      declined: ["mail.bank.com"],
      answered: false,
      sawMore: false,
      cleanAt: 1_000_000,
    },
    excludedHosts: [],
  }, { noGrants: true });
  assert.ok(first.bg.port.fence);
  assert.equal(first.bg.port.fence.cleanAt, 1_000_000);
  assert.equal(first.bg.port.livePatterns.length, 0);

  first.mock.grantedPermissions.add("*://*.bank.com/*");
  first.bg.port.wallNow = () => 1_000_000 + 60000;
  await first.bg.beginRead();
  assert.equal(first.bg.port.fence, null);
  assert.ok(first.bg.port.excludedHosts.includes("mail.bank.com"));
  assert.equal(first.sandbox.SolstoneHosts.originGranted(first.bg.port, "https://mail.bank.com"), false);
  const saved = Array.from(first.mock.storageData.cfg.excludedHosts || []);
  assert.ok(saved.includes("mail.bank.com"));
  assert.equal(first.mock.storageData.cfg.fence, null);

  const second = await startWorker({
    siteGrant: "live",
    fence: null,
    excludedHosts: saved,
  }, { noGrants: true });
  second.mock.grantedPermissions.add("*://*.bank.com/*");
  await second.bg.beginRead();
  assert.equal(second.sandbox.SolstoneHosts.originGranted(second.bg.port, "https://mail.bank.com"), false);
});

function confirmRealm(mock) {
  mock.chrome.tabs.sendMessage = (tabId, msg, opts, cb) => {
    const callback = typeof opts === "function" ? opts : cb;
    mock.sentTabMessages.push({ tabId, msg });
    if (msg?.kind === "confirmRealm") {
      callback?.({ realmToken: "r" });
      return Promise.resolve({ realmToken: "r" });
    }
    callback?.();
    return Promise.resolve();
  };
}

test("lifecycle: onRemoved publishes a closed lease before its permission snapshot settles", async () => {
  const mock = createMockChrome();
  mock.storageData.cfg = { siteGrant: "live", fence: null, startup: "existing" };
  mock.grantedPermissions.clear();
  mock.grantedPermissions.add("*://example.com/*");
  const sandbox = createSandbox(mock);
  vm.runInNewContext(readExtFile("background.js"), sandbox);
  const bg = sandbox.SolstoneBackground;
  await bg.ensureInit();
  const port = bg.port;
  port.hostCapture = "permitted";
  port.capturePermitted = true;
  port.consentVersion = 1;
  port.paused = false;
  port.lease = { token: "t", generation: "g", receivedAt: port.now(), freshnessMs: 10000 };
  assert.equal(port.getStatus().gate.open, true);

  const snapshot = deferred();
  const entered = deferred();
  let notifications = 0;
  const notify = port.notify.bind(port);
  port.notify = () => { notifications++; return notify(); };
  mock.chrome.tabs.query = () => {};
  mock.chrome.permissions.getAll = () => {
    entered.resolve();
    return snapshot.promise;
  };
  mock.grantedPermissions.delete("*://example.com/*");
  const removing = mock.listeners.onRemovedPerm[0]({ origins: ["*://example.com/*"] });
  assert.ok(notifications >= 1);
  assert.equal(port.getStatus().gate.open, false);
  assert.equal(port.livePatterns.includes("*://example.com/*"), false);
  await entered.promise;
  snapshot.reject(new Error("permission snapshot unavailable"));
  await removing;
  assert.equal(sandbox.SolstoneHosts.originGranted(port, "https://example.com"), false);
  assert.equal(port.getStatus().gate.open, false);
});

test("content withdrawal reaches existing leases before tab enumeration settles", async () => {
  const mock = createMockChrome();
  mock.storageData.cfg = { siteGrant: "live", fence: null, startup: "existing" };
  mock.grantedPermissions.clear();
  mock.grantedPermissions.add("*://example.com/*");
  const sandbox = createSandbox(mock);
  vm.runInNewContext(readExtFile("background.js"), sandbox);
  const bg = sandbox.SolstoneBackground;
  await bg.ensureInit();
  const port = bg.port;
  port.hostCapture = "permitted";
  port.capturePermitted = true;
  port.consentVersion = 1;
  port.paused = false;
  port.lease = { token: "t", generation: "g", receivedAt: port.now(), freshnessMs: 10000 };

  const content = contentHarness(sandbox.SolstoneCaptureGate);
  content.requests[0]({
    ok: true,
    lease: { token: "t", generation: "g", freshnessMs: 10000 },
    paused: false,
    consentVersion: 1,
    livePatterns: ["*://example.com/*"],
    fence: null,
    broadGrant: false,
    hostCapture: "permitted",
    capturePermitted: true,
    connectionGeneration: port.connectionGeneration,
    destinationGeneration: "g",
    captureEpoch: port.captureEpoch,
  });
  content.tick();
  assert.ok(content.reads > 0);
  const readsBefore = content.reads;
  content.sent.length = 0;

  mock.chrome.tabs.sendMessage = (tabId, msg, opts, cb) => {
    const callback = typeof opts === "function" ? opts : cb;
    mock.sentTabMessages.push({ tabId, msg });
    if (msg?.kind === "confirmRealm") {
      callback?.({ realmToken: "r" });
      return Promise.resolve({ realmToken: "r" });
    }
    content.msg(msg);
    callback?.();
    return Promise.resolve();
  };
  const hello = await new Promise((resolve) => mock.listeners.onMessage[0](
    { kind: "hello", realmToken: "r", documentKey: "0123456789abcdef0123456789abcdef" },
    { id: mock.chrome.runtime.id, tab: { id: 101 }, frameId: 0, url: "https://example.com/page", origin: "https://example.com" },
    resolve,
  ));
  assert.equal(hello.ok, true);

  const callbacks = [];
  mock.chrome.tabs.query = (_query, cb) => { callbacks.push(cb); };
  const snapshot = deferred();
  const entered = deferred();
  mock.chrome.permissions.getAll = () => {
    entered.resolve();
    return snapshot.promise;
  };
  mock.sentTabMessages.length = 0;
  mock.grantedPermissions.delete("*://example.com/*");
  const removing = mock.listeners.onRemovedPerm[0]({ origins: ["*://example.com/*"] });
  assert.equal(port.getStatus().gate.open, false);
  assert.ok(mock.sentTabMessages.length > 0);
  content.tick();
  assert.equal(content.reads, readsBefore);
  assert.equal(content.sent.some((m) => m.kind === "skim"), false);
  for (const callback of callbacks) callback?.(mock.tabsList);
  content.tick();
  assert.equal(content.reads, readsBefore);
  await entered.promise;
  snapshot.reject(new Error("probe cleanup"));
  await removing;
});

test("onRemoved during doInit, before port exists, stays in the tombstone set and the removed pattern is closed", async () => {
  const mock = createMockChrome();
  const stalled = deferred();
  const entered = deferred();
  let calls = 0;
  mock.chrome.permissions.getAll = async () => {
    calls += 1;
    if (calls === 1) {
      entered.resolve();
      await stalled.promise;
    }
    return { origins: ["*://example.com/*"] };
  };
  mock.storageData.cfg = { paused: false, chosenOrigins: ["https://example.com"] };
  mock.grantedPermissions.clear();
  mock.grantedPermissions.add("*://example.com/*");
  const sandbox = createSandbox(mock);
  vm.runInNewContext(readExtFile("background.js"), sandbox);
  const initPromise = sandbox.SolstoneBackground.ensureInit();
  await entered.promise;
  assert.equal(sandbox.SolstoneBackground.port, null);
  mock.grantedPermissions.delete("*://example.com/*");
  for (const listener of mock.listeners.onRemovedPerm) listener({ origins: ["*://example.com/*"] });
  stalled.resolve();
  const port = await initPromise;
  assert.equal(port.tombstones.has("*://example.com/*"), true);
  assert.equal(port.livePatterns.includes("*://example.com/*"), false);
  assert.equal(sandbox.SolstoneHosts.originGranted(port, "https://example.com"), false);
});

test("an error on a site nobody shares is cleared at start, including an empty grant set", async () => {
  const alarmHeld = deferred();
  const mock = createMockChrome();
  mock.chrome.alarms.create = () => alarmHeld.promise;
  mock.storageData.cfg = { siteGrant: "live", fence: null };
  mock.grantedPermissions.clear();
  mock.grantedPermissions.add("*://kept.example/*");
  const sandbox = createSandbox(mock, true);
  vm.runInNewContext(readExtFile("background.js"), sandbox);
  await sandbox.SolstoneDB.put("meta", {
    registration: { "https://gone.example": "failed" },
    enqueue: { "https://gone.example": "enqueue_failed", "https://kept.example": "enqueue_failed" },
  }, "siteErrors");
  alarmHeld.resolve();
  const port = await sandbox.SolstoneBackground.ensureInit();
  assert.deepEqual(Object.keys(port.registration), []);
  assert.deepEqual(Object.keys(port.enqueue), ["https://kept.example"]);
  port.faults.set("https://gone.example", "denied");
  port.faults.set("https://kept.example", "denied");
  await sandbox.SolstoneBackground.beginRead();
  assert.equal(port.faults.has("https://gone.example"), false);
  assert.equal(port.faults.get("https://kept.example"), "denied");

  const alarmHeldEmpty = deferred();
  const mockEmpty = createMockChrome();
  mockEmpty.chrome.alarms.create = () => alarmHeldEmpty.promise;
  mockEmpty.storageData.cfg = { siteGrant: "live", fence: null };
  mockEmpty.grantedPermissions.clear();
  const sandboxEmpty = createSandbox(mockEmpty, true);
  vm.runInNewContext(readExtFile("background.js"), sandboxEmpty);
  await sandboxEmpty.SolstoneDB.put("meta", {
    registration: { "https://gone.example": "failed" },
    enqueue: { "https://gone.example": "enqueue_failed", "https://kept.example": "enqueue_failed" },
  }, "siteErrors");
  alarmHeldEmpty.resolve();
  const portEmpty = await sandboxEmpty.SolstoneBackground.ensureInit();
  assert.deepEqual(Object.keys(portEmpty.registration), []);
  assert.deepEqual(Object.keys(portEmpty.enqueue), []);
});

test("pause with the solstone app defaults on when the key is absent", async () => {
  const empty = await startWorker();
  assert.equal((await empty.bg.getCfg()).pauseWithApp, true);
  assert.equal(empty.bg.port.pauseWithApp, true);

  const current = await startWorker({ paused: false, showPageIndicator: false, siteGrant: "live", fence: null });
  assert.equal((await current.bg.getCfg()).pauseWithApp, true);
  assert.equal(current.bg.port.pauseWithApp, true);

  const off = await startWorker({
    paused: false, showPageIndicator: false, siteGrant: "live", fence: null, pauseWithApp: false,
  });
  assert.equal((await off.bg.getCfg()).pauseWithApp, false);
  assert.equal(off.bg.port.pauseWithApp, false);
});

test("turning pause with the app off updates an open tab without reloading it", async () => {
  const { mock, sandbox, bg } = await startWorker({
    siteGrant: "live", fence: null, paused: false, showPageIndicator: false,
  });
  let reloads = 0;
  mock.chrome.tabs.reload = () => { reloads += 1; };
  const port = bg.port;
  assert.equal(port.pauseWithApp, true);
  mock.sentTabMessages.length = 0;
  await deliverState(port, { capture: "paused", away: false });
  const pausedUpdate = mock.sentTabMessages.filter((entry) => entry.msg?.kind === "leaseUpdate").at(-1);
  assert.ok(pausedUpdate);
  assert.equal(pausedUpdate.msg.hostCapture, "paused");

  mock.sentTabMessages.length = 0;
  const id = mock.chrome.runtime.id;
  const result = await sandbox.SolstoneRouter.route(
    { cmd: "setConfig", pauseWithApp: false },
    { id, url: `chrome-extension://${id}/options.html` },
    { runtimeId: id, port, setCfg: bg.setCfg },
  );
  assert.equal(result.ok, true);
  const openUpdate = mock.sentTabMessages.filter((entry) => entry.msg?.kind === "leaseUpdate").at(-1);
  assert.ok(openUpdate);
  assert.equal(openUpdate.msg.hostCapture, "permitted");
  assert.equal(openUpdate.msg.capturePermitted, true);
  assert.equal(reloads, 0);
});

test("an older applySnapshot awaiting setCfg does not overwrite a newer read", async () => {
  const { mock, bg } = await startWorker({
    siteGrant: "live",
    fence: {
      entries: ["https://bank.com"],
      exact: [],
      exactKnown: true,
      siteWide: [],
      declined: [],
      answered: false,
      sawMore: false,
      cleanAt: null,
    },
  });
  const port = bg.port;
  port.fence = {
    entries: ["https://bank.com"],
    exact: [],
    exactKnown: true,
    siteWide: [],
    declined: [],
    answered: false,
    sawMore: false,
    cleanAt: null,
  };
  port.livePatterns = ["*://*.bank.com/*"];
  port.broadGrant = false;
  port.readSerial = 1;

  const gate = deferred();
  const entered = deferred();
  const origSet = mock.chrome.storage.local.set.bind(mock.chrome.storage.local);
  let stall = true;
  mock.chrome.storage.local.set = async (obj) => {
    if (stall && obj.cfg) {
      stall = false;
      entered.resolve();
      await gate.promise;
    }
    return origSet(obj);
  };

  const older = bg.applySnapshot(["*://*.other.com/*"], false, { serial: 1 });
  await entered.promise;
  port.readSerial = 2;
  const newer = bg.applySnapshot(["*://*.newer.com/*"], false, { serial: 2 });
  gate.resolve();
  await older;
  await newer;
  assert.deepEqual(Array.from(port.livePatterns), ["*://*.newer.com/*"]);
});

test("hello awaited across a dropped older read sees the newer grants", async () => {
  const { mock, bg } = await startWorker({ siteGrant: "live", fence: null, startup: "existing" }, { noGrants: true });
  mock.grantedPermissions.add("*://*.old.example/*");
  await bg.beginRead();
  confirmRealm(mock);

  const gate = deferred();
  const entered = deferred();
  let calls = 0;
  mock.chrome.permissions.getAll = async () => {
    calls += 1;
    if (calls === 1) {
      entered.resolve();
      await gate.promise;
      return { origins: ["*://*.old.example/*"] };
    }
    return { origins: ["*://*.new.example/*"] };
  };

  const helloPromise = new Promise((resolve) => mock.listeners.onMessage[0](
    { kind: "hello", realmToken: "r", documentKey: "0123456789abcdef0123456789abcdef" },
    { id: mock.chrome.runtime.id, tab: { id: 7 }, frameId: 0, url: "https://new.example/page", origin: "https://new.example" },
    resolve,
  ));
  await entered.promise;
  const newer = bg.beginRead();
  await newer;
  assert.ok(bg.port.livePatterns.includes("*://*.new.example/*"));
  gate.resolve();
  const res = await helloPromise;
  assert.equal(res.ok, true);
  assert.ok(res.livePatterns.includes("*://*.new.example/*"));
  assert.equal(res.livePatterns.includes("*://*.old.example/*"), false);
});

test("safari alarm: a failed clear stays paused and does not clear the database; a successful clear stays paused while it clears", async () => {
  const mock = createMockChrome();
  let reloads = 0;
  mock.chrome.runtime.reload = () => { reloads += 1; };
  const sandbox = await startSafari(mock, new IDBFactory());
  const port = sandbox.SolstoneBackground.port;
  port.paused = false;
  await mock.listeners.onAlarm[0]({ name: "native-port" });
  assert.equal(port.paused, false);
  assert.equal(reloads, 0);

  await sandbox.SolstoneDB.put("outbox", { batchId: "b1", origin: "https://example.com" });
  port.paused = false;
  for (const key of Object.keys(mock.storageData)) delete mock.storageData[key];
  mock.chrome.storage.local.set = async () => { throw new Error("storage set error"); };
  await mock.listeners.onAlarm[0]({ name: "native-port" });
  assert.equal(port.paused, true);
  assert.equal((await sandbox.SolstoneDB.getAll("outbox")).length, 1);
  assert.equal(reloads, 0);

  const mockOk = createMockChrome();
  let reloadsOk = 0;
  mockOk.chrome.runtime.reload = () => { reloadsOk += 1; };
  const sandboxOk = await startSafari(mockOk, new IDBFactory());
  await sandboxOk.SolstoneDB.put("outbox", { batchId: "b2", origin: "https://example.com" });
  const portOk = sandboxOk.SolstoneBackground.port;
  portOk.paused = false;
  let pausedDuringClear = null;
  const origClear = sandboxOk.SolstoneDB.clear;
  sandboxOk.SolstoneDB.clear = async (store) => {
    pausedDuringClear = portOk.paused;
    return origClear.call(sandboxOk.SolstoneDB, store);
  };
  for (const key of Object.keys(mockOk.storageData)) delete mockOk.storageData[key];
  await mockOk.listeners.onAlarm[0]({ name: "native-port" });
  assert.equal(pausedDuringClear, true);
  assert.equal(portOk.paused, true);
  assert.equal(reloadsOk, 1);
  assert.deepEqual(await sandboxOk.SolstoneDB.getAll("outbox"), []);
});

test("exactOnlyOrigins null with *://*/* refuses https://login.bank.com", async () => {
  const mock = createMockChrome();
  mock.storageData.cfg = { chosenOrigins: ["https://bank.com"], exactOnlyOrigins: null };
  mock.grantedPermissions.clear();
  mock.grantedPermissions.add("*://*/*");
  const sandbox = createSandbox(mock, true);
  vm.runInNewContext(readExtFile("background.js"), sandbox);
  const bg = sandbox.SolstoneBackground;
  await bg.ensureInit();
  const port = bg.port;
  assert.equal(port.fence.exactKnown, true);
  assert.ok(Array.from(port.fence.exact).includes("https://bank.com"));
  confirmRealm(mock);
  const res = await new Promise((resolve) => mock.listeners.onMessage[0](
    { kind: "hello", realmToken: "r", documentKey: "0123456789abcdef0123456789abcdef" },
    { id: mock.chrome.runtime.id, tab: { id: 101 }, frameId: 0, url: "https://login.bank.com/page", origin: "https://login.bank.com" },
    resolve,
  ));
  assert.equal(res.ok, false);
  assert.equal(sandbox.SolstoneHosts.originGranted(port, "https://login.bank.com"), false);
  assert.equal(sandbox.SolstoneHosts.originGranted(port, "https://bank.com"), true);
});

function broadPageGrant(epoch) {
  return {
    ok: true,
    broadGrant: true,
    livePatterns: ["*://*/*"],
    fence: null,
    lease: { token: "t", generation: "g", freshnessMs: 10000 },
    paused: false,
    consentVersion: 1,
    hostCapture: "permitted",
    capturePermitted: true,
    captureEpoch: epoch,
    connectionGeneration: 1,
    destinationGeneration: "g",
  };
}

test("content: two read_not_executed replies then a success leave the refusal count at 0", async () => {
  const { sandbox } = await startWorker({ siteGrant: "live", fence: null });
  const h = contentHarness(sandbox.SolstoneCaptureGate);
  h.requests[0](broadPageGrant(1));
  const reads = () => h.sent.filter((m) => m.kind === "read").length;
  h.tick();
  assert.equal(reads(), 1);
  h.failRead("read_not_executed");
  h.tick();
  assert.equal(reads(), 2);
  h.failRead("read_not_executed");
  h.tick();
  assert.equal(reads(), 3);
  assert.equal(h.executeRead(), true);
  h.finishRead({ ok: true });
  h.showVisible();
  assert.equal(reads(), 4);
  h.failRead("read_not_executed");
  h.showVisible();
  assert.equal(reads(), 5);
});

test("content: the refusal cap holds across a lease renewal", async () => {
  const { sandbox } = await startWorker({ siteGrant: "live", fence: null });
  const h = contentHarness(sandbox.SolstoneCaptureGate);
  h.requests[0](broadPageGrant(1));
  const reads = () => h.sent.filter((m) => m.kind === "read").length;
  h.tick();
  h.failRead("browser_access_denied");
  h.tick();
  h.failRead("browser_access_denied");
  h.tick();
  h.failRead("read_not_executed");
  assert.equal(reads(), 3);
  h.requests[0](broadPageGrant(2));
  h.tick();
  h.showVisible();
  assert.equal(reads(), 3);
  h.pageshow({ persisted: true });
  assert.equal(h.requests.length, 2);
  h.requests[1](broadPageGrant(2));
  h.showVisible();
  assert.equal(reads(), 4);
});

test("a refused site is not joined when a later all-sites request is granted", async () => {
  const plain = createMockChrome();
  await assert.rejects(
    async () => plain.chrome.permissions.request({ origins: ["*://*.bank.com/*"] }),
    /user gesture/,
  );

  const safari = createMockChrome({ safariBroadest: true });
  safari.grantedPermissions.clear();
  safari.grantedPermissions.add("*://*.bank.com/*");
  assert.equal(await safari.chrome.permissions.request({ origins: ["https://login.bank.com/*"] }), true);
  assert.equal(safari.grantedPermissions.has("https://login.bank.com/*"), false);
  assert.equal(await safari.chrome.permissions.request({ origins: ["*://*/*"] }), true);
  assert.equal(safari.grantedPermissions.has("*://*/*"), true);
  assert.equal(safari.grantedPermissions.has("*://*.bank.com/*"), false);

  const firefox = createMockChrome({ firefoxCoveredRequest: true });
  firefox.grantedPermissions.clear();
  firefox.grantedPermissions.add("*://*.bank.com/*");
  assert.equal(await firefox.chrome.permissions.request({ origins: ["*://*.login.bank.com/*"] }), true);
  assert.equal(firefox.grantedPermissions.has("*://*.login.bank.com/*"), false);

  const refused = createMockChrome({ safariBroadest: true, refuseSiteRequest: true });
  refused.grantedPermissions.clear();
  assert.equal(await refused.chrome.permissions.request({ origins: ["*://*.denied.example/*"] }), false);
  assert.equal(await refused.chrome.permissions.request({ origins: ["*://*/*"] }), true);
  const origins = (await refused.chrome.permissions.getAll()).origins;
  assert.ok(origins.includes("*://*/*"));
  assert.equal(origins.some((pattern) => String(pattern).includes("denied.example")), false);
});

function setGrants(mock, patterns) {
  mock.grantedPermissions.clear();
  for (const pattern of patterns) mock.grantedPermissions.add(pattern);
}

// background.js calls init() as it evaluates, and doInit reads consent after
// its first await. Hold that await so a consent put is visible to this worker.
async function bootPin(mock, { consent = false } = {}) {
  const sandbox = createSandbox(mock, true);
  sandbox.indexedDB = new IDBFactory();
  const held = deferred();
  if (consent) mock.chrome.alarms.create = () => held.promise;
  vm.runInNewContext(readExtFile("background.js"), sandbox);
  if (consent) {
    await sandbox.SolstoneDB.put("meta", sandbox.SolstoneCaptureGate.CONSENT_VERSION, "consentVersion");
    held.resolve();
  }
  const bg = sandbox.SolstoneBackground;
  await bg.ensureInit();
  return { mock, sandbox, bg };
}

function pinHello(mock, origin) {
  return new Promise((resolve) => mock.listeners.onMessage[0](
    { kind: "hello", realmToken: "r", documentKey: "0123456789abcdef0123456789abcdef" },
    { id: mock.chrome.runtime.id, tab: { id: 7 }, frameId: 0, url: origin + "/page", origin },
    resolve,
  ));
}

function pinExt(mock) {
  const id = mock.chrome.runtime.id;
  return { id, url: "chrome-extension://" + id + "/options.html" };
}

function pinSend(mock, msg) {
  return new Promise((resolve) => mock.listeners.onMessage[0](msg, pinExt(mock), resolve));
}

function assertEmptyFence(fence) {
  assert.ok(fence && typeof fence === "object");
  assert.deepEqual(Array.from(fence.entries), []);
  assert.equal(fence.exactKnown, true);
}

function stallExcludedHostsPut(DB) {
  const originalPut = DB.put;
  let resolveGate = () => {};
  let resolveHit = () => {};
  const gate = new Promise((resolve) => { resolveGate = resolve; });
  const hit = new Promise((resolve) => { resolveHit = resolve; });
  let stalled = false;
  let released = false;
  DB.put = async function (...args) {
    if (!stalled && args[0] === "meta" && args[2] === "excludedHosts") {
      stalled = true;
      resolveHit();
      await gate;
    }
    return originalPut.apply(this, args);
  };
  return {
    hit,
    release() {
      if (released) return;
      released = true;
      resolveGate();
    },
    restore() { DB.put = originalPut; },
  };
}

async function bootRestart(saved) {
  const mock = createMockChrome();
  setGrants(mock, ["*://*/*"]);
  mock.storageData.cfg = { siteGrant: "live", fence: null, excludedHosts: Array.from(saved || []) };
  return bootPin(mock);
}

test("pin: all-sites owner with current consent and every-site grant keeps no fence", async () => {
  const mock = createMockChrome();
  setGrants(mock, ["*://*/*"]);
  mock.storageData.cfg = { siteMode: "all", allSitesConsent: 1, chosenOrigins: ["https://bank.com"] };
  const { bg } = await bootPin(mock, { consent: true });
  assert.equal(bg.port.fence, null);
  assert.equal(Object.hasOwn(mock.storageData.cfg, "chosenOrigins"), false);
  confirmRealm(mock);
  const hello = await pinHello(mock, "https://bank.com");
  assert.equal(hello.ok, true);
});

test("pin: all-sites row without current consent is an empty fence", async () => {
  const mock = createMockChrome();
  setGrants(mock, ["*://*/*"]);
  mock.storageData.cfg = { siteMode: "all", allSitesConsent: 1, chosenOrigins: ["https://bank.com"] };
  const { bg } = await bootPin(mock);
  assertEmptyFence(bg.port.fence);
  const hello = await pinHello(mock, "https://bank.com");
  assert.equal(hello.error, "origin_not_granted");
});

test("pin: all-sites row without the every-site grant is an empty fence", async () => {
  const mock = createMockChrome();
  setGrants(mock, ["*://*.bank.com/*"]);
  mock.storageData.cfg = { siteMode: "all", allSitesConsent: 1, chosenOrigins: ["https://bank.com"] };
  const { bg } = await bootPin(mock, { consent: true });
  assertEmptyFence(bg.port.fence);
  const hello = await pinHello(mock, "https://bank.com");
  assert.equal(hello.error, "origin_not_granted");
});

test("pin: offeredOrigins become no fence entries", async () => {
  const mock = createMockChrome();
  setGrants(mock, []);
  mock.storageData.cfg = { offeredOrigins: ["https://bank.com"] };
  const { bg } = await bootPin(mock);
  assert.deepEqual(Array.from(bg.port.fence.entries), []);
});

test("pin: legacy grantedOrigins become the fence entries", async () => {
  const mock = createMockChrome();
  setGrants(mock, []);
  mock.storageData.cfg = { grantedOrigins: ["https://bank.com", "https://shop.com"] };
  const { bg } = await bootPin(mock);
  assert.deepEqual(Array.from(bg.port.fence.entries), ["https://bank.com", "https://shop.com"]);
});

test("pin: formatCfg keeps answered, sawMore, and startup across a restart", async () => {
  const mock = createMockChrome();
  setGrants(mock, []);
  mock.storageData.cfg = {
    siteGrant: "live",
    startup: "kept-for-restart",
    fence: {
      entries: ["https://bank.com"],
      exact: [],
      exactKnown: true,
      siteWide: [],
      declined: [],
      answered: true,
      sawMore: true,
      cleanAt: 123,
    },
  };
  const { bg } = await bootPin(mock);
  assert.equal(mock.storageData.cfg.startup, "kept-for-restart");
  assert.equal(mock.storageData.cfg.fence.answered, true);
  assert.equal(mock.storageData.cfg.fence.sawMore, true);
  assert.equal(mock.storageData.cfg.fence.cleanAt, 123);
  assert.equal(bg.port.fence.answered, true);
  assert.equal(bg.port.fence.sawMore, true);
  assert.equal(bg.port.fence.cleanAt, 123);
});

function liveAccountFence(extra = {}) {
  return {
    siteGrant: "live",
    fence: {
      entries: ["https://bank.com"],
      exact: [],
      exactKnown: true,
      siteWide: [],
      declined: [],
      answered: false,
      sawMore: false,
      cleanAt: null,
      ...extra,
    },
  };
}

test("pin: sawMore latches across a clean read", async () => {
  const mock = createMockChrome();
  setGrants(mock, []);
  mock.storageData.cfg = liveAccountFence({ sawMore: true, cleanAt: 1000000 });
  const { bg } = await bootPin(mock);
  bg.port.wallNow = () => 1000000 + 120000;
  setGrants(mock, ["*://*.bank.com/*"]);
  await bg.beginRead();
  assert.notEqual(bg.port.fence, null);
  assert.equal(bg.port.fence.sawMore, true);
});

test("pin: a tombstone-filtered read is not clean", async () => {
  const mock = createMockChrome();
  setGrants(mock, []);
  mock.storageData.cfg = liveAccountFence({ cleanAt: 1000000 });
  const { bg } = await bootPin(mock);
  bg.port.wallNow = () => 1000000 + 60000;
  setGrants(mock, ["*://*.bank.com/*", "*://*.other.com/*"]);
  bg.port.tombstones.add("*://*.other.com/*");
  await bg.beginRead();
  assert.notEqual(bg.port.fence, null);
  assert.equal(bg.port.fence.sawMore, false);
  assert.equal(bg.port.fence.cleanAt, 1000000);
});

test("pin: an http fence entry does not account for a pattern", async () => {
  const mock = createMockChrome();
  setGrants(mock, []);
  mock.storageData.cfg = liveAccountFence();
  mock.storageData.cfg.fence.entries = ["http://bank.com"];
  const { bg } = await bootPin(mock);
  setGrants(mock, ["*://*.bank.com/*"]);
  await bg.beginRead();
  assert.equal(bg.port.fence.sawMore, true);
  assert.notEqual(bg.port.fence, null);
});

test("pin: a port-bearing fence entry does not account for a pattern", async () => {
  const mock = createMockChrome();
  setGrants(mock, []);
  mock.storageData.cfg = liveAccountFence();
  mock.storageData.cfg.fence.entries = ["https://bank.com:18431"];
  const { bg } = await bootPin(mock);
  setGrants(mock, ["*://*.bank.com/*"]);
  await bg.beginRead();
  assert.equal(bg.port.fence.sawMore, true);
  assert.notEqual(bg.port.fence, null);
});

test("pin: an exact fence entry does not account for a pattern", async () => {
  const mock = createMockChrome();
  setGrants(mock, []);
  mock.storageData.cfg = liveAccountFence();
  mock.storageData.cfg.fence.entries = ["https://bank.com"];
  mock.storageData.cfg.fence.exact = ["https://bank.com"];
  const { bg } = await bootPin(mock);
  setGrants(mock, ["*://*.bank.com/*"]);
  await bg.beginRead();
  assert.equal(bg.port.fence.sawMore, true);
  assert.notEqual(bg.port.fence, null);
});

test("pin: excludedGen keeps a leave-out and an include", async () => {
  const leave = createMockChrome();
  setGrants(leave, ["*://*/*"]);
  leave.storageData.cfg = { siteGrant: "live", fence: null, excludedHosts: [] };
  const first = await bootPin(leave);
  const leaveStall = stallExcludedHostsPut(first.sandbox.SolstoneDB);
  try {
    const pending = first.bg.port.commitLeftOut({ excludedHosts: [] });
    await leaveStall.hit;
    const left = await pinSend(leave, { cmd: "setLeftOut", host: "bank.com", out: true });
    assert.equal(left.ok, true);
    leaveStall.release();
    await pending;
    await first.bg.port.leftOutTail;
  } finally {
    leaveStall.release();
    leaveStall.restore();
  }
  const leftSaved = Array.from(leave.storageData.cfg.excludedHosts || []);
  const leftRestart = await bootRestart(leftSaved);
  assert.equal(leftRestart.sandbox.SolstoneHosts.originGranted(leftRestart.bg.port, "https://bank.com"), false);
  assert.equal((await pinHello(leftRestart.mock, "https://bank.com")).error, "origin_not_granted");

  const include = createMockChrome();
  setGrants(include, ["*://*/*"]);
  include.storageData.cfg = { siteGrant: "live", fence: null, excludedHosts: ["bank.com", "shop.com"] };
  const second = await bootPin(include);
  const includeStall = stallExcludedHostsPut(second.sandbox.SolstoneDB);
  try {
    const pending = second.bg.port.commitLeftOut({ excludedHosts: ["shop.com"] });
    await includeStall.hit;
    const back = await pinSend(include, { cmd: "setLeftOut", host: "shop.com", out: false });
    assert.equal(back.ok, true);
    includeStall.release();
    await pending;
    await second.bg.port.leftOutTail;
  } finally {
    includeStall.release();
    includeStall.restore();
  }
  const includeSaved = Array.from(include.storageData.cfg.excludedHosts || []);
  const includeRestart = await bootRestart(includeSaved);
  assert.equal(includeRestart.sandbox.SolstoneHosts.originGranted(includeRestart.bg.port, "https://bank.com"), false);
  assert.equal((await pinHello(includeRestart.mock, "https://bank.com")).error, "origin_not_granted");
  confirmRealm(includeRestart.mock);
  assert.equal((await pinHello(includeRestart.mock, "https://shop.com")).ok, true);
});

test("pin: excludedGen keeps the removal fallback", async () => {
  const mock = createMockChrome();
  setGrants(mock, ["*://*/*"]);
  mock.storageData.cfg = { siteGrant: "live", fence: null, excludedHosts: [] };
  const { sandbox, bg } = await bootPin(mock);
  const stall = stallExcludedHostsPut(sandbox.SolstoneDB);
  try {
    const pending = bg.port.commitLeftOut({ excludedHosts: [] });
    await stall.hit;
    const removed = await pinSend(mock, { cmd: "removeGrantedOrigin", origin: "https://bank.com" });
    assert.equal(removed.ok, true);
    stall.release();
    await pending;
    await bg.port.leftOutTail;
  } finally {
    stall.release();
    stall.restore();
  }
  const saved = Array.from(mock.storageData.cfg.excludedHosts || []);
  const restarted = await bootRestart(saved);
  assert.equal(restarted.sandbox.SolstoneHosts.originGranted(restarted.bg.port, "https://bank.com"), false);
  assert.equal((await pinHello(restarted.mock, "https://bank.com")).error, "origin_not_granted");
});

test("pin: excludedGen keeps an automatic fence end", async () => {
  const mock = createMockChrome();
  setGrants(mock, []);
  mock.storageData.cfg = {
    siteGrant: "live",
    fence: {
      entries: ["https://bank.com"],
      exact: [],
      exactKnown: true,
      siteWide: [],
      declined: ["bank.com"],
      answered: false,
      sawMore: false,
      cleanAt: 1000000,
    },
    excludedHosts: [],
  };
  const { sandbox, bg } = await bootPin(mock);
  bg.port.wallNow = () => 1000000 + 60000;
  setGrants(mock, ["*://*.bank.com/*"]);
  const stall = stallExcludedHostsPut(sandbox.SolstoneDB);
  try {
    const pending = bg.port.commitLeftOut({ excludedHosts: [] });
    await stall.hit;
    await bg.beginRead();
    assert.equal(bg.port.fence, null);
    assert.ok(bg.port.excludedHosts.includes("bank.com"));
    stall.release();
    await pending;
    await bg.port.leftOutTail;
  } finally {
    stall.release();
    stall.restore();
  }
  const saved = Array.from(mock.storageData.cfg.excludedHosts || []);
  const restarted = await bootRestart(saved);
  assert.equal(restarted.sandbox.SolstoneHosts.originGranted(restarted.bg.port, "https://bank.com"), false);
  assert.equal((await pinHello(restarted.mock, "https://bank.com")).error, "origin_not_granted");
});

test("pin: excludedGen keeps a share fence end", async () => {
  const mock = createMockChrome();
  setGrants(mock, []);
  mock.storageData.cfg = {
    siteGrant: "live",
    fence: {
      entries: ["https://bank.com"],
      exact: [],
      exactKnown: true,
      siteWide: [],
      declined: ["bank.com"],
      answered: false,
      sawMore: false,
      cleanAt: null,
    },
    excludedHosts: [],
  };
  const { sandbox, bg } = await bootPin(mock);
  setGrants(mock, ["*://*.bank.com/*"]);
  const stall = stallExcludedHostsPut(sandbox.SolstoneDB);
  try {
    const pending = bg.port.commitLeftOut({ excludedHosts: [] });
    await stall.hit;
    const shared = await pinSend(mock, { cmd: "shareThemToo", shown: [] });
    assert.equal(shared.ok, true);
    assert.equal(shared.result, "shared");
    stall.release();
    await pending;
    await bg.port.leftOutTail;
  } finally {
    stall.release();
    stall.restore();
  }
  const saved = Array.from(mock.storageData.cfg.excludedHosts || []);
  const restarted = await bootRestart(saved);
  assert.equal(restarted.sandbox.SolstoneHosts.originGranted(restarted.bg.port, "https://bank.com"), false);
  assert.equal((await pinHello(restarted.mock, "https://bank.com")).error, "origin_not_granted");
});

test("pin: an older read after the fence-write await does not restore a revoked grant", async () => {
  const mock = createMockChrome();
  setGrants(mock, []);
  mock.storageData.cfg = {
    siteGrant: "live",
    fence: {
      entries: ["https://shop.com"],
      exact: [],
      exactKnown: true,
      siteWide: [],
      declined: [],
      answered: false,
      sawMore: false,
      cleanAt: null,
    },
  };
  const { sandbox, bg } = await bootPin(mock);
  const port = bg.port;
  let calls = 0;
  mock.chrome.permissions.getAll = async () => {
    calls += 1;
    if (calls === 1) return { origins: ["*://*.shop.com/*", "*://*.bank.com/*"] };
    return { origins: ["*://*.shop.com/*"] };
  };
  const stalls = [];
  const origSet = mock.chrome.storage.local.set.bind(mock.chrome.storage.local);
  mock.chrome.storage.local.set = async (obj) => {
    if (obj.cfg && obj.cfg.fence && typeof obj.cfg.fence === "object") {
      const gate = deferred();
      const entered = deferred();
      stalls.push({ gate, entered });
      entered.resolve();
      await gate.promise;
    }
    return origSet(obj);
  };
  const older = bg.beginRead();
  while (stalls.length < 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  await stalls[0].entered.promise;
  const olderSerial = port.readSerial;
  const newer = bg.beginRead();
  while (port.readSerial <= olderSerial) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  stalls[0].gate.resolve();
  while (stalls.length < 2) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  await stalls[1].entered.promise;
  assert.equal(Array.from(port.livePatterns).includes("*://*.bank.com/*"), false);
  assert.equal(sandbox.SolstoneHosts.originGranted(port, "https://bank.com"), false);
  stalls[1].gate.resolve();
  await older;
  await newer;
  assert.deepEqual(Array.from(port.livePatterns), ["*://*.shop.com/*"]);
  assert.equal(sandbox.SolstoneHosts.originGranted(port, "https://bank.com"), false);
  assert.equal((await pinHello(mock, "https://bank.com")).error, "origin_not_granted");
  confirmRealm(mock);
  assert.equal((await pinHello(mock, "https://shop.com")).ok, true);
});

function pinFrame(mock, origin, msg) {
  return new Promise((resolve) => mock.listeners.onMessage[0](
    msg,
    { id: mock.chrome.runtime.id, tab: { id: 7 }, frameId: 0, url: origin + "/page", origin },
    resolve,
  ));
}

async function burstHellos(order) {
  const mock = createMockChrome();
  setGrants(mock, ["*://*/*"]);
  mock.storageData.cfg = { siteGrant: "live", fence: null };
  const { bg } = await bootPin(mock);
  const port = bg.port;
  port.hostCapture = "permitted";
  port.capturePermitted = true;
  port.consentVersion = 1;
  port.paused = false;
  port.lease = { token: "t", generation: "g", receivedAt: port.now(), freshnessMs: 10000 };
  mock.chrome.scripting.executeScript = async () => [{ frameId: 0, result: true }];
  confirmRealm(mock);
  mock.hold("permissions.getAll");
  const origin = "https://bank.com";
  const pending = [];
  for (let i = 0; i < 7; i += 1) pending.push(pinHello(mock, origin));
  const handles = [];
  for (let i = 0; i < 7; i += 1) handles.push(await mock.held("permissions.getAll"));
  for (const index of order) handles[index].release();
  const results = await Promise.all(pending);
  assert.equal(results[6].ok, true, JSON.stringify(results.map((result) => result.error || "ok")));
  for (let i = 0; i < 6; i += 1) {
    assert.equal(results[i].error, "challenge_mismatch", JSON.stringify(results[i]));
  }
  const read = await pinFrame(mock, origin, {
    kind: "read",
    realmToken: "r",
    documentKey: "0123456789abcdef0123456789abcdef",
    action: "skim",
    requestId: 1,
    captureEpoch: port.captureEpoch,
    leaseToken: port.lease.token,
  });
  assert.equal(read.ok, true, JSON.stringify(read));
}

test("pin: the last of seven hellos is the one that can read", async () => {
  await burstHellos([6, 5, 4, 3, 2, 1, 0]);
  await burstHellos([2, 5, 0, 6, 3, 1, 4]);
});

test("pin: a stale hello read loses to a newer revocation", async () => {
  const mock = createMockChrome();
  setGrants(mock, ["*://*.bank.com/*"]);
  mock.storageData.cfg = { siteGrant: "live", fence: null };
  const { bg } = await bootPin(mock);
  confirmRealm(mock);
  mock.hold("permissions.getAll");
  let settled = false;
  const hello = pinHello(mock, "https://bank.com").then((result) => {
    settled = true;
    return result;
  });
  const olderRead = await mock.held("permissions.getAll");
  const newer = bg.beginRead();
  const newerRead = await mock.held("permissions.getAll");
  assert.equal(mock.grantedPermissions.has("*://*.bank.com/*"), true);
  olderRead.release();
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(settled, false);
  mock.grantedPermissions.delete("*://*.bank.com/*");
  newerRead.release();
  assert.equal((await hello).error, "origin_not_granted");
  await newer;
});

const SAFARI_PAGE = "https://example.com";
const SAFARI_DOC = "0123456789abcdef0123456789abcdef";

function safariClock() {
  return { wall: 5_000_000, monotonic: 1_000 };
}

function prepareSafari(mock) {
  setGrants(mock, ["*://*.example.com/*"]);
  mock.storageData.cfg = { siteGrant: "live", fence: null, paused: false };
}

function safariSender(mock) {
  return {
    id: mock.chrome.runtime.id,
    tab: { id: 7 },
    frameId: 0,
    url: SAFARI_PAGE + "/page",
    origin: SAFARI_PAGE,
  };
}

function sendSafari(mock, msg) {
  return new Promise((resolve) => mock.listeners.onMessage[0](msg, safariSender(mock), resolve));
}

function sendSafariExt(mock, msg) {
  return new Promise((resolve) => mock.listeners.onMessage[0](
    msg,
    { id: mock.chrome.runtime.id, url: mock.chrome.runtime.getURL("options.html") },
    resolve,
  ));
}

function answerAndCount(mock) {
  const leaseUpdates = [];
  mock.chrome.tabs.sendMessage = (tabId, msg, opts, cb) => {
    const callback = typeof opts === "function" ? opts : cb;
    mock.sentTabMessages.push({ tabId, msg });
    if (msg?.kind === "leaseUpdate") leaseUpdates.push(msg);
    if (msg?.kind === "confirmRealm") {
      callback?.({ realmToken: "r" });
      return Promise.resolve({ realmToken: "r" });
    }
    callback?.();
    return Promise.resolve();
  };
  return leaseUpdates;
}

function armLease(port) {
  port.consentVersion = 1;
  port.hostCapture = "permitted";
  port.capturePermitted = true;
  port.paused = false;
  port.lease = { token: "t", generation: "g", receivedAt: port.now(), freshnessMs: 10000 };
}

function safariSkim(port, epoch, leaseToken) {
  return {
    kind: "skim",
    realmToken: "r",
    documentKey: SAFARI_DOC,
    captureEpoch: epoch,
    connectionGeneration: port.connectionGeneration,
    destinationGeneration: port.destinationGeneration,
    leaseToken,
    blocks: [{ id: "1", type: "text", depth: 0, text: "Synthetic tab 7" }],
  };
}

function safariHello() {
  return { kind: "hello", realmToken: "r", documentKey: SAFARI_DOC };
}

function flushTick() {
  return new Promise((resolve) => setImmediate(resolve));
}

async function bootSafariLease(clock = safariClock()) {
  const mock = createMockChrome();
  prepareSafari(mock);
  mock.chrome.runtime.reload = () => {};
  const sandbox = await startSafari(mock, new IDBFactory(), clock);
  const port = sandbox.SolstoneBackground.port;
  armLease(port);
  const leaseUpdates = answerAndCount(mock);
  const hello = await sendSafari(mock, safariHello());
  assert.equal(hello.ok, true, JSON.stringify(hello));
  return { mock, sandbox, port, clock, leaseUpdates };
}

test("pin: a clean Safari check leaves an open lease able to skim", async () => {
  const { mock, sandbox, port, leaseUpdates } = await bootSafariLease();
  const epoch = port.captureEpoch;
  const leaseToken = port.lease.token;
  const inst = holdMetaInst(sandbox.SolstoneDB);
  inst.hold();
  const beforeUpdates = leaseUpdates.length;
  const pending = mock.listeners.onAlarm[0]({ name: "native-port" });
  const handle = await inst.held();
  const during = sendSafari(mock, safariHello());
  await flushTick();
  assert.equal(leaseUpdates.length, beforeUpdates);
  assert.equal(port.captureEpoch, epoch);
  handle.release();
  assert.equal((await during).ok, true);
  await pending;
  const beforeRows = (await sandbox.SolstoneNativeOutbox.getAll()).length;
  const skim = await sendSafari(mock, safariSkim(port, epoch, leaseToken));
  assert.equal(skim.ok, true, JSON.stringify(skim));
  assert.equal((await sandbox.SolstoneNativeOutbox.getAll()).length, beforeRows + 1);
});

test("pin: pausing during a Safari check stays paused", async () => {
  const { mock, sandbox, port } = await bootSafariLease();
  const inst = holdMetaInst(sandbox.SolstoneDB);
  inst.hold();
  const pending = mock.listeners.onAlarm[0]({ name: "native-port" });
  const handle = await inst.held();
  const paused = await sendSafariExt(mock, { cmd: "setPaused", paused: true });
  assert.equal(paused.ok, true, JSON.stringify(paused));
  handle.release();
  await pending;
  assert.equal(port.paused, true);
  assert.equal(mock.storageData.cfg.paused, true);
  const hello = await sendSafari(mock, safariHello());
  assert.equal(hello.paused, true);
  const beforeRows = (await sandbox.SolstoneNativeOutbox.getAll()).length;
  const skim = await sendSafari(mock, safariSkim(port, port.captureEpoch, port.lease.token));
  assert.equal(skim.ok, false);
  assert.equal((await sandbox.SolstoneNativeOutbox.getAll()).length, beforeRows);
});

test("pin: resuming during a Safari check stays resumed", async () => {
  const { mock, sandbox, port } = await bootSafariLease();
  const paused = await sendSafariExt(mock, { cmd: "setPaused", paused: true });
  assert.equal(paused.ok, true, JSON.stringify(paused));
  assert.equal(port.paused, true);
  const inst = holdMetaInst(sandbox.SolstoneDB);
  inst.hold();
  const pending = mock.listeners.onAlarm[0]({ name: "native-port" });
  const handle = await inst.held();
  const resumed = await sendSafariExt(mock, { cmd: "setPaused", paused: false });
  assert.equal(resumed.ok, true, JSON.stringify(resumed));
  handle.release();
  await pending;
  assert.equal(port.paused, false);
  assert.equal(mock.storageData.cfg.paused, false);
  const beforeRows = (await sandbox.SolstoneNativeOutbox.getAll()).length;
  const skim = await sendSafari(mock, safariSkim(port, port.captureEpoch, port.lease.token));
  assert.equal(skim.ok, true, JSON.stringify(skim));
  assert.equal((await sandbox.SolstoneNativeOutbox.getAll()).length, beforeRows + 1);
});

test("pin: a Safari mismatch pauses before it saves the cleared config", async () => {
  const { mock, sandbox, port, leaseUpdates } = await bootSafariLease();
  delete mock.storageData.inst;
  const gate = deferred();
  let seen = null;
  const origSet = mock.chrome.storage.local.set.bind(mock.chrome.storage.local);
  mock.chrome.storage.local.set = async (obj) => {
    if (obj.cfg && obj.cfg.startup === "cleared") {
      seen = {
        paused: port.paused,
        notice: port.clearedNotice,
        leasePaused: leaseUpdates.some((msg) => msg.paused === true),
      };
      await gate.promise;
    }
    return origSet(obj);
  };
  const pending = mock.listeners.onAlarm[0]({ name: "native-port" });
  for (let i = 0; i < 20 && !seen; i += 1) await flushTick();
  assert.equal(seen && seen.paused, true);
  assert.equal(seen && seen.notice, true);
  assert.equal(seen && seen.leasePaused, true);
  gate.resolve();
  await pending;
  const hello = await sendSafari(mock, safariHello());
  assert.equal(hello.paused, true);
});

test("pin: a thrown Safari detection changes nothing", async () => {
  const { mock, sandbox, port } = await bootSafariLease();
  const paused = port.paused;
  const notice = port.clearedNotice;
  const epoch = port.captureEpoch;
  const original = sandbox.SolstoneDB.get.bind(sandbox.SolstoneDB);
  sandbox.SolstoneDB.get = async (store, key) => {
    if (store === "meta" && key === "inst") throw new Error("inst read failed");
    return original(store, key);
  };
  await mock.listeners.onAlarm[0]({ name: "native-port" });
  assert.equal(port.paused, paused);
  assert.equal(port.clearedNotice, notice);
  assert.equal(port.captureEpoch, epoch);
});

test("pin: a hung Safari detection is abandoned at ten seconds", async () => {
  const clock = safariClock();
  const { mock, sandbox, port } = await bootSafariLease(clock);
  const paused = port.paused;
  const notice = port.clearedNotice;
  const epoch = port.captureEpoch;
  const inst = holdMetaInst(sandbox.SolstoneDB);
  inst.hold();
  mock.listeners.onAlarm[0]({ name: "native-port" });
  await inst.held();
  await flushTick();
  assert.equal(port.paused, paused);
  assert.equal(port.clearedNotice, notice);
  assert.equal(port.captureEpoch, epoch);
  assert.equal(inst.reads, 1);
  clock.wall += 10000;
  const next = mock.listeners.onAlarm[0]({ name: "native-port" });
  await flushTick();
  assert.equal(inst.reads, 2);
  const fresh = await inst.held();
  fresh.release();
  await next;
  const beforeRows = (await sandbox.SolstoneNativeOutbox.getAll()).length;
  const skim = await sendSafari(mock, safariSkim(port, port.captureEpoch, port.lease.token));
  assert.equal(skim.ok, true, JSON.stringify(skim));
  assert.equal((await sandbox.SolstoneNativeOutbox.getAll()).length, beforeRows + 1);
});

test("pin: a Safari alarm before the port exists does not look for cleared storage", async () => {
  const mock = createMockChrome();
  prepareSafari(mock);
  mock.chrome.runtime.getURL = (path) => `safari-web-extension://6f4d5042-ab48-42e5-a191-38327b4ea30b/${path}`;
  const gate = deferred();
  mock.chrome.alarms.create = () => gate.promise;
  const sandbox = createSandbox(mock, true, safariClock());
  sandbox.indexedDB = new IDBFactory();
  vm.runInNewContext(readExtFile("background.js"), sandbox);
  const inst = holdMetaInst(sandbox.SolstoneDB);
  const before = inst.reads;
  mock.listeners.onAlarm[0]({ name: "native-port" });
  await flushTick();
  await flushTick();
  assert.equal(inst.reads, before);
  await sandbox.SolstoneDB.put("meta", "kept-inst", "inst");
  mock.storageData.inst = "other-inst";
  gate.resolve();
  const port = await sandbox.SolstoneBackground.ensureInit();
  assert.equal(port.paused, true);
  assert.equal(mock.storageData.cfg.clearedNotice, true);
});

test("pin: two Safari alarms share one check", async () => {
  const { mock, sandbox } = await bootSafariLease();
  const inst = holdMetaInst(sandbox.SolstoneDB);
  inst.hold();
  mock.listeners.onAlarm[0]({ name: "native-port" });
  await inst.held();
  mock.listeners.onAlarm[0]({ name: "native-port" });
  await flushTick();
  assert.equal(inst.reads, 1);
});

test("pin: a Safari clear in progress is not abandoned after ten seconds", async () => {
  const clock = safariClock();
  const { mock, sandbox, port } = await bootSafariLease(clock);
  delete mock.storageData.inst;
  const inst = holdMetaInst(sandbox.SolstoneDB);
  inst.hold();
  const gate = deferred();
  let entered = false;
  const origSet = mock.chrome.storage.local.set.bind(mock.chrome.storage.local);
  mock.chrome.storage.local.set = async (obj) => {
    if (obj.cfg && obj.cfg.startup === "cleared") {
      entered = true;
      await gate.promise;
    }
    return origSet(obj);
  };
  const pending = mock.listeners.onAlarm[0]({ name: "native-port" });
  const handle = await inst.held();
  handle.release();
  for (let i = 0; i < 20 && !entered; i += 1) await flushTick();
  assert.equal(entered, true);
  assert.equal(port.paused, true);
  const reads = inst.reads;
  clock.wall += 10001;
  mock.listeners.onAlarm[0]({ name: "native-port" });
  await flushTick();
  assert.equal(inst.reads, reads);
  assert.equal(port.paused, true);
  gate.resolve();
  await pending;
});

test("pin: a Safari mismatch at 9.9 seconds still clears", async () => {
  const clock = safariClock();
  const { mock, sandbox, port } = await bootSafariLease(clock);
  delete mock.storageData.inst;
  const inst = holdMetaInst(sandbox.SolstoneDB);
  inst.hold();
  let seen = null;
  const origSet = mock.chrome.storage.local.set.bind(mock.chrome.storage.local);
  mock.chrome.storage.local.set = async (obj) => {
    if (obj.cfg && obj.cfg.startup === "cleared") {
      seen = { paused: port.paused, notice: port.clearedNotice };
    }
    return origSet(obj);
  };
  const started = clock.wall;
  const pending = mock.listeners.onAlarm[0]({ name: "native-port" });
  const handle = await inst.held();
  clock.wall = started + 9900;
  handle.release();
  await pending;
  assert.equal(seen && seen.paused, true);
  assert.equal(seen && seen.notice, true);
});

function fenceCfg(entries, fencePatch = {}, cfgPatch = {}) {
  return {
    siteGrant: "live",
    excludedHosts: [],
    appLeftOut: [],
    ...cfgPatch,
    fence: {
      entries,
      exact: [],
      exactKnown: true,
      siteWide: [],
      declined: [],
      answered: false,
      sawMore: false,
      cleanAt: null,
      ...fencePatch,
    },
  };
}

async function bootFence(entries, grants, fencePatch, cfgPatch) {
  const mock = createMockChrome();
  setGrants(mock, grants);
  mock.storageData.cfg = fenceCfg(entries, fencePatch, cfgPatch);
  return bootPin(mock);
}

function uiDocument() {
  const cache = new Map();
  function node(id = "") {
    const el = {
      id,
      children: [],
      className: "",
      hidden: false,
      textContent: "",
      dataset: {},
      listeners: {},
      parentNode: null,
      classList: { add() {}, remove() {} },
      append(...kids) {
        for (const kid of kids) {
          el.children.push(kid);
          if (kid) kid.parentNode = el;
        }
      },
      appendChild(child) { el.append(child); return child; },
      replaceChildren(...kids) { el.children = []; el.append(...kids); },
      addEventListener(type, fn) { el.listeners[type] = fn; },
      removeEventListener() {},
      setAttribute() {},
      removeAttribute() {},
      focus() {},
      scrollIntoView() {},
      remove() {},
      insertBefore(child, before) {
        const at = before ? el.children.indexOf(before) : -1;
        if (at >= 0) el.children.splice(at, 0, child);
        else el.children.unshift(child);
        if (child) child.parentNode = el;
      },
    };
    return el;
  }
  const document = {
    documentElement: node("html"),
    getElementById(id) {
      if (!cache.has(id)) cache.set(id, node(id));
      return cache.get(id);
    },
    createElement() { return node(); },
    addEventListener() {},
    querySelector() { return node(); },
  };
  return { document, cache };
}

function findClick(cache, label) {
  const walk = (el) => {
    if (!el) return null;
    if (el.listeners?.click && el.textContent === label) return el;
    for (const child of el.children || []) {
      const found = walk(child);
      if (found) return found;
    }
    return null;
  };
  for (const root of cache.values()) {
    const found = walk(root);
    if (found) return found;
  }
  return null;
}

async function drainUi() {
  for (let i = 0; i < 8; i += 1) await new Promise((resolve) => setImmediate(resolve));
}

function openShareUi(booted, files, forward, pageUrl = "https://example.com/") {
  const sent = [];
  const replies = [];
  const { document, cache } = uiDocument();
  const sandbox = {
    console,
    document,
    window: { addEventListener() {} },
    navigator: {},
    setTimeout() { return 0; },
    clearTimeout() {},
    Date,
    URL,
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext("globalThis.ArrayCtor = Array;", sandbox);
  // Status crosses from the background realm. Array.isArray there is false
  // for those arrays, so copy them with this page's Array before the callback.
  function revive(value) {
    if (value == null || typeof value !== "object") return value;
    if (typeof value.length === "number" && typeof value.slice === "function") {
      const copy = new sandbox.ArrayCtor();
      for (let i = 0; i < value.length; i += 1) copy.push(revive(value[i]));
      return copy;
    }
    const copy = {};
    for (const key of Object.keys(value)) copy[key] = revive(value[key]);
    return copy;
  }
  sandbox.chrome = {
    runtime: {
      id: booted.mock.chrome.runtime.id,
      getManifest: () => ({ version: "0.5.9" }),
      sendMessage(message, callback) {
        const copy = JSON.parse(JSON.stringify(message));
        sent.push(copy);
        if (!forward(message)) {
          callback?.({ ok: true });
          return;
        }
        booted.mock.listeners.onMessage[0](message, pinExt(booted.mock), (response) => {
          const revived = revive(response);
          replies.push({ cmd: copy.cmd, response: revived });
          callback?.(revived);
        });
      },
      connect() {
        return { onMessage: { addListener() {} }, onDisconnect: { addListener() {} }, disconnect() {} };
      },
      openOptionsPage() {},
      reload() {},
      lastError: null,
    },
    tabs: { create() {} },
    permissions: { request: async () => true },
  };
  // The array has to be born in this page's realm. Destructuring a list from
  // the test realm yields nothing, so the popup would keep an unknown page.
  vm.runInNewContext(
    `(pageUrl) => { chrome.tabs.query = async () => [{ id: 7, url: pageUrl, active: true }]; }`,
    sandbox,
  )(pageUrl);
  for (const file of files) vm.runInNewContext(readExtFile(file), sandbox, { filename: file });
  return { sandbox, sent, replies, document, cache };
}

const POPUP_UI = [
  "lib/copy.js", "lib/about.js", "lib/hosts.js", "lib/status.js", "lib/failures.js",
  "lib/disclosure.js", "lib/popup_view.js", "lib/actions.js", "popup.js",
];
const OPTIONS_UI = [
  "lib/copy.js", "lib/hosts.js", "lib/status.js", "lib/failures.js",
  "lib/disclosure.js", "lib/popup_view.js", "lib/actions.js", "options.js",
];

async function bootWidenedBank() {
  const booted = await bootFence(
    ["http://bank.com"],
    ["*://*.bank.com/*", "*://*.left.example/*", "*://*.gone.example/*"],
    {},
    { appLeftOut: ["left.example"] },
  );
  booted.bg.port.tombstones.add("*://*.gone.example/*");
  await booted.bg.beginRead();
  return booted;
}

test("upgrade: popup and settings share the sites the question showed", async () => {
  const expected = ["*://*.bank.com/*"];
  for (const files of [POPUP_UI, OPTIONS_UI]) {
    const booted = await bootWidenedBank();
    const { bg, mock } = booted;
    assert.equal(mock.grantedPermissions.has("*://*.gone.example/*"), true);
    assert.equal(Array.from(bg.port.livePatterns).includes("*://*.gone.example/*"), false);
    assert.equal(Array.from(bg.port.livePatterns).includes("*://*.left.example/*"), true);
    bg.port.connectionGeneration = 1;
    bg.port.handshake = "closed";
    bg.port.consentVersion = 1;
    const ui = openShareUi(booted, files, (message) => message.cmd === "getState");
    await drainUi();
    const button = findClick(ui.cache, "share them too");
    assert.ok(button);
    button.listeners.click();
    await drainUi();
    const captured = ui.sent.find((message) => message.cmd === "shareThemToo");
    assert.deepEqual(captured.shown, expected);
    const shared = await pinSend(mock, captured);
    assert.equal(shared.result, "shared");
    assert.equal(shared.ok, true);
    assert.equal(bg.port.fence, null);
    confirmRealm(mock);
    const hello = await pinHello(mock, "https://mail.bank.com");
    assert.equal(hello.ok, true);
  }
});

test("upgrade: a broad grant at the click is question_every_site", async () => {
  const booted = await bootFence(["http://bank.com"], ["*://*.bank.com/*"]);
  const shown = ["*://*.bank.com/*"];
  setGrants(booted.mock, ["https://*/*"]);
  const result = await pinSend(booted.mock, { cmd: "shareThemToo", shown });
  assert.equal(result.ok, false);
  assert.equal(result.result, "question_every_site");
  assert.notEqual(booted.bg.port.fence, null);
  assert.deepEqual(Array.from(booted.bg.port.fence.entries), ["http://bank.com"]);
});

test("upgrade: a grown set is question_changed", async () => {
  const booted = await bootFence(["http://bank.com"], ["*://*.bank.com/*"]);
  const shown = ["*://*.bank.com/*"];
  setGrants(booted.mock, ["*://*.bank.com/*", "*://*.other.com/*"]);
  const result = await pinSend(booted.mock, { cmd: "shareThemToo", shown });
  assert.equal(result.result, "question_changed");
  assert.equal(result.ok, false);
  assert.notEqual(booted.bg.port.fence, null);
  const hello = await pinHello(booted.mock, "https://other.com");
  assert.equal(hello.error, "origin_not_granted");
});

test("upgrade: the question kind follows every unaccounted host", async () => {
  const portEntries = ["http://bank.com:18431", "http://shop.com:8080"];
  const bothPorts = await bootFence(portEntries, ["*://*.bank.com/*", "*://*.shop.com/*"]);
  const portQuestion = bothPorts.sandbox.SolstoneHosts.beyondExample(
    bothPorts.bg.port.fence,
    Array.from(bothPorts.bg.port.livePatterns),
    [],
  );
  assert.equal(portQuestion.kind, "more");
  assert.equal(portQuestion.host, "bank.com");
  assert.equal(
    bothPorts.sandbox.SolstoneCopy.fenceQuestion("chrome", "more", "bank.com").body,
    "Chrome allows more of some sites you added, like bank.com, but the solstone extension takes in only the addresses you added. sharing all of them can include messages on mail and chat sites, and words you've typed but haven't sent, and all of it goes into your journal.",
  );

  const exactEntries = ["https://bank.com", "https://shop.com"];
  const exactOwn = await bootFence(
    exactEntries,
    ["*://bank.com/*", "*://shop.com/*"],
    { exact: exactEntries },
  );
  const exactQuestion = exactOwn.sandbox.SolstoneHosts.beyondExample(
    exactOwn.bg.port.fence,
    Array.from(exactOwn.bg.port.livePatterns),
    [],
  );
  assert.equal(exactQuestion.kind, "more");
  const exactShared = await pinSend(exactOwn.mock, { cmd: "shareThemToo", shown: Array.from(exactQuestion.shown) });
  assert.equal(exactShared.result, "shared");
  assert.equal(exactOwn.bg.port.fence, null);

  const widenedPort = "http://bank.com:18431";
  const siteWideEntry = "https://shop.com";
  const accounted = await bootFence(
    [widenedPort, siteWideEntry],
    ["*://*.bank.com/*", "*://*.shop.com/*"],
  );
  const widerQuestion = accounted.sandbox.SolstoneHosts.beyondExample(
    accounted.bg.port.fence,
    Array.from(accounted.bg.port.livePatterns),
    [],
  );
  assert.equal(widerQuestion.kind, "wider");
  assert.equal(widerQuestion.host, "bank.com");

  const widenedHost = "https://bank.com";
  const outside = await bootFence(
    [widenedHost],
    ["*://*.bank.com/*", "*://*.other.com/*"],
    { exact: [widenedHost] },
  );
  const otherQuestion = outside.sandbox.SolstoneHosts.beyondExample(
    outside.bg.port.fence,
    Array.from(outside.bg.port.livePatterns),
    [],
  );
  assert.equal(otherQuestion.kind, "other");
  assert.equal(otherQuestion.host, "other.com");
});

test("upgrade: question_changed repaints the popup without a failure sentence", async () => {
  const booted = await bootFence(["http://bank.com"], ["*://*.bank.com/*"]);
  booted.bg.port.connectionGeneration = 1;
  booted.bg.port.handshake = "closed";
  booted.bg.port.consentVersion = 1;
  const ui = openShareUi(booted, POPUP_UI, () => true);
  await drainUi();
  setGrants(booted.mock, ["*://*.bank.com/*", "*://*.other.com/*"]);
  findClick(ui.cache, "share them too").listeners.click();
  await drainUi();
  const first = ui.replies.find((entry) => entry.cmd === "shareThemToo");
  assert.equal(first.response.result, "question_changed");
  assert.equal(ui.document.getElementById("actionMessage").textContent, "");
  const before = ui.sent.length;
  findClick(ui.cache, "share them too").listeners.click();
  await drainUi();
  const resent = ui.sent.slice(before).find((message) => message.cmd === "shareThemToo");
  assert.deepEqual(resent.shown, ["*://*.bank.com/*", "*://*.other.com/*"]);
});

test("upgrade: settings shows permissions_unavailable from the copy", async () => {
  const booted = await bootFence(["http://bank.com"], ["*://*.bank.com/*"]);
  booted.bg.port.connectionGeneration = 1;
  booted.bg.port.handshake = "closed";
  booted.bg.port.consentVersion = 1;
  const ui = openShareUi(booted, OPTIONS_UI, () => true);
  await drainUi();
  booted.mock.options.getAllThrows = true;
  const button = findClick(ui.cache, "share them too");
  assert.ok(button);
  await button.listeners.click();
  await drainUi();
  const sentence = ui.document.getElementById("actionMessage").textContent;
  assert.equal(sentence, ui.sandbox.SolstoneCopy.actionFailure("permissions_unavailable", booted.bg.port.brand));
  assert.equal(sentence.includes("removed"), false);
});

test("upgrade: shareThemToo without shown is question_changed", async () => {
  const booted = await bootFence(["http://bank.com"], ["*://*.bank.com/*"]);
  const result = await pinSend(booted.mock, { cmd: "shareThemToo" });
  assert.equal(result.ok, false);
  assert.equal(result.result, "question_changed");
  assert.notEqual(booted.bg.port.fence, null);
});

test("upgrade: a thrown grant read does not end the fence", async () => {
  const booted = await bootFence(
    ["https://bank.com"],
    ["*://*/*"],
    { sawMore: true },
  );
  assert.equal(Array.from(booted.bg.port.livePatterns).includes("*://*/*"), true);
  booted.mock.grantedPermissions.delete("*://*/*");
  booted.mock.options.getAllThrows = true;
  const every = await pinSend(booted.mock, { cmd: "shareEverySite" });
  assert.equal(booted.bg.port.fence === null, false);
  assert.equal(every.error, "permissions_unavailable");
  const them = await pinSend(booted.mock, { cmd: "shareThemToo", shown: ["*://*/*"] });
  assert.equal(booted.bg.port.fence === null, false);
  assert.equal(them.error, "permissions_unavailable");
});

async function bootPlainBank() {
  const mock = createMockChrome();
  setGrants(mock, ["https://bank.com/*"]);
  mock.storageData.cfg = { siteGrant: "live", fence: null, excludedHosts: [] };
  const booted = await bootPin(mock);
  booted.bg.port.connectionGeneration = 1;
  booted.bg.port.handshake = "closed";
  booted.bg.port.consentVersion = 1;
  return booted;
}

function countRemoves(mock) {
  let removes = 0;
  const orig = mock.chrome.permissions.remove.bind(mock.chrome.permissions);
  mock.chrome.permissions.remove = async (request) => {
    removes += 1;
    return orig(request);
  };
  return () => removes;
}

test("removal: a thrown grant list does not remove, and the pages say they could not check", async () => {
  const booted = await bootPlainBank();
  const removes = countRemoves(booted.mock);
  booted.mock.options.getAllThrows = true;
  const result = await pinSend(booted.mock, { cmd: "removeGrantedOrigin", origin: "https://bank.com" });
  assert.equal(result.error, "permissions_unavailable");
  assert.equal(result.ok, false);
  assert.equal(removes(), 0);
  assert.equal(booted.bg.port.fence, null);
  assert.equal(booted.mock.grantedPermissions.has("https://bank.com/*"), true);

  for (const surface of [
    { files: POPUP_UI, pageUrl: "https://bank.com/account", click: (ui) => ui.document.getElementById("pageSiteAction") },
    { files: OPTIONS_UI, pageUrl: "https://example.com/", click: (ui) => findClick(ui.cache, "remove") },
  ]) {
    const page = await bootPlainBank();
    page.mock.options.getAllThrows = true;
    const ui = openShareUi(page, surface.files, () => true, surface.pageUrl);
    await drainUi();
    const button = surface.click(ui);
    assert.ok(button);
    assert.equal(button.textContent, surface.files === POPUP_UI ? "remove this site" : "remove");
    await (button.onclick ? button.onclick() : button.listeners.click());
    await drainUi();
    const sentence = ui.document.getElementById("actionMessage").textContent;
    assert.equal(sentence, ui.sandbox.SolstoneCopy.actionFailure("permissions_unavailable", page.bg.port.brand));
    assert.equal(sentence.includes("removed"), false);
  }
});

test("removal: a thrown reread drops this removal's tombstones and keeps an earlier one", async () => {
  const booted = await bootPlainBank();
  booted.bg.port.tombstones.add("https://kept.example/*");
  const listener = booted.mock.listeners.onRemovedPerm[0];
  booted.mock.listeners.onRemovedPerm[0] = (details) => {
    const pending = listener(details);
    booted.mock.options.getAllThrows = true;
    return pending;
  };
  let seenDuring = false;
  const orig = booted.mock.chrome.permissions.remove.bind(booted.mock.chrome.permissions);
  booted.mock.chrome.permissions.remove = async (request) => {
    const result = await orig(request);
    seenDuring = booted.bg.port.tombstones.has("https://bank.com/*");
    return result;
  };
  const result = await pinSend(booted.mock, { cmd: "removeGrantedOrigin", origin: "https://bank.com" });
  assert.equal(result.error, "permissions_unavailable");
  assert.equal(result.ok, false);
  assert.equal(seenDuring, true);
  assert.equal(booted.bg.port.tombstones.has("https://bank.com/*"), false);
  assert.equal(booted.bg.port.tombstones.has("https://kept.example/*"), true);
  assert.equal(booted.bg.port.excludedHosts.includes("bank.com"), false);
});

test("removal: a fenced remove whose grant list throws declines the host and does not remove", async () => {
  const booted = await bootFence(
    ["https://bank.com", "https://shop.com"],
    ["*://*.bank.com/*", "*://*.shop.com/*"],
  );
  const removes = countRemoves(booted.mock);
  booted.mock.options.getAllThrows = true;
  const removed = await pinSend(booted.mock, { cmd: "removeGrantedOrigin", origin: "https://bank.com" });
  assert.equal(removed.ok, true);
  assert.equal(removed.origin, "https://bank.com");
  assert.equal(removes(), 0);
  assert.equal(booted.bg.port.fence.entries.includes("https://bank.com"), false);
  assert.equal(booted.bg.port.fence.entries.includes("https://shop.com"), true);
  assert.equal(booted.bg.port.fence.declined.includes("bank.com"), true);
  assert.equal(booted.mock.storageData.cfg.fence.declined.includes("bank.com"), true);
  assert.equal(booted.bg.port.excludedHosts.includes("bank.com"), false);

  booted.mock.options.getAllThrows = false;
  const beyond = booted.sandbox.SolstoneHosts.beyondExample(
    booted.bg.port.fence,
    Array.from(booted.bg.port.livePatterns),
    [...(booted.bg.port.excludedHosts || []), ...(booted.bg.port.appLeftOut || [])],
  );
  const shared = await pinSend(booted.mock, { cmd: "shareThemToo", shown: Array.from(beyond.shown) });
  assert.equal(shared.result, "shared");
  assert.equal(booted.bg.port.fence, null);
  assert.equal(booted.bg.port.excludedHosts.includes("bank.com"), true);
  assert.equal(booted.bg.port.excludedHosts.includes("shop.com"), false);

  const every = await bootFence(["https://bank.com"], ["*://*/*"], { sawMore: true });
  const everyRemoves = countRemoves(every.mock);
  every.mock.options.getAllThrows = true;
  const dropped = await pinSend(every.mock, { cmd: "removeGrantedOrigin", origin: "https://bank.com" });
  assert.equal(dropped.ok, true);
  assert.equal(everyRemoves(), 0);
  assert.equal(every.bg.port.fence.declined.includes("bank.com"), true);
  every.mock.options.getAllThrows = false;
  const sharedEvery = await pinSend(every.mock, { cmd: "shareEverySite" });
  assert.equal(sharedEvery.result, "shared");
  assert.equal(every.bg.port.fence, null);
  assert.equal(every.bg.port.excludedHosts.includes("bank.com"), true);
});

