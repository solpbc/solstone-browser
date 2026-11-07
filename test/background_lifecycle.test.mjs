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






test("lifecycle: an open tab that cannot answer after injection asks for a reload", async () => {
  for (const [label, tab, reply, expected] of [
    ["answers", {id: 101, url: "https://example.com/page", status: "complete"}, {ok: true}, "ready"],
    ["stranded", {id: 101, url: "https://example.com/page", status: "complete"}, undefined, "reload"],
    ["refused", {id: 101, url: "https://example.com/page", status: "complete"}, new Error("no receiver"), "reload"],
    ["still loading", {id: 101, url: "https://example.com/page", status: "loading"}, undefined, "ready"],
    ["private", {id: 101, url: "https://example.com/page", status: "complete", incognito: true}, undefined, "ready"],
  ]) {
    const {mock, bg} = await startWorker();
    const port = bg.port;
    port.hostCapture = "permitted";
    port.capturePermitted = true;
    port.consentVersion = 1;
    port.lease = {token: "t", generation: "g", receivedAt: port.now(), freshnessMs: 10000};
    mock.grantedPermissions.add("*://example.com/*");
    mock.chrome.tabs.query = async () => [tab];
    const pings = [];
    mock.chrome.tabs.sendMessage = async (tabId, msg, options) => {
      pings.push({tabId, msg, options});
      if (msg?.kind !== "ping") return undefined;
      if (reply instanceof Error) throw reply;
      return reply;
    };
    const result = await bg.registerSite("example.com");
    assert.equal(result, expected, label);
    const asked = pings.filter(p => p.msg?.kind === "ping");
    assert.equal(asked.length, tab.status === "complete" && !tab.incognito ? 1 : 0, label);
    if (asked.length) assert.equal(asked[0].options?.frameId, 0, label);
  }
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
    listener;
  const requests = [],
    intervals = new Map(),
    sent = [];
  let id = 0;
  const ctx = {
    crypto,
    console,
    performance: { now: () => t },
    location: { origin: "https://example.com", host: "example.com" },
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

async function startSafari(mock, idb) {
  mock.chrome.runtime.getURL = (path) => `safari-web-extension://6f4d5042-ab48-42e5-a191-38327b4ea30b/${path}`;
  const sandbox = createSandbox(mock, true);
  sandbox.indexedDB = idb;
  vm.runInNewContext(readExtFile("background.js"), sandbox);
  await sandbox.SolstoneBackground.ensureInit();
  return sandbox;
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

  // removeGrantedOrigin calls remove
  await new Promise(resolve => mock.listeners.onMessage[0]({ cmd: "removeGrantedOrigin", origin: "https://example.com" }, optionsSender, resolve));
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

