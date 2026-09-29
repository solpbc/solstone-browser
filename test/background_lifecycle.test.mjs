// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import "fake-indexeddb/auto";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const EXT_DIR = join(ROOT, "extension");

function readExtFile(relPath) {
  return fs.readFileSync(join(EXT_DIR, relPath), "utf8");
}

const MANIFEST = JSON.parse(fs.readFileSync(join(EXT_DIR, "manifest.json"), "utf8"));
const SCRIPT_LIST = MANIFEST.background.scripts;

function createSandbox(mockChrome, isWorker = true) {
  const sandbox = {
    globalThis: null,
    console,
    crypto,
    performance: { now: () => Date.now() },
    chrome: mockChrome.chrome,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    indexedDB,
    IDBKeyRange,
    TextEncoder,
    TextDecoder,
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

function createMockChrome() {
  const listeners = {
    onConnect: [],
    onMessage: [],
    onRemovedTab: [],
    onCreatedTab: [],
    onUpdatedTab: [],
    onAlarm: [],
    onRemovedPerm: [],
    onAddedPerm: [],
    onInstalled: [],
    onStartup: [],
  };

  const storageData = {};
  const registeredScripts = new Map();
  const grantedPermissions = new Set(["*://*/*"]);
  const sentTabMessages = [];
  const tabsList = [{ id: 101, url: "https://example.com/page" }];

  return {
    listeners,
    storageData,
    registeredScripts,
    grantedPermissions,
    sentTabMessages,
    tabsList,
    chrome: {
      runtime: {
        id: "fgfnkcefedeheoeamppkiiloncfekakf",
        openOptionsPage: () => {},
        connectNative: () => ({
          postMessage: () => {},
          disconnect: () => {},
          onMessage: { addListener: () => {} },
          onDisconnect: { addListener: () => {} },
        }),
        onConnect: { addListener: (fn) => listeners.onConnect.push(fn) },
        onMessage: { addListener: (fn) => listeners.onMessage.push(fn) },
        onInstalled: { addListener: (fn) => listeners.onInstalled.push(fn) },
        onStartup: { addListener: (fn) => listeners.onStartup.push(fn) },
      },
      alarms: {
        create: async () => {},
        onAlarm: { addListener: (fn) => listeners.onAlarm.push(fn) },
      },
      tabs: {
        query: (queryInfo, cb) => {
          if (typeof cb === "function") cb(tabsList);
          return Promise.resolve(tabsList);
        },
        sendMessage: (tabId, msg, cb) => {
          sentTabMessages.push({ tabId, msg });
          if (cb) cb();
        },
        onRemoved: { addListener: (fn) => listeners.onRemovedTab.push(fn) },
        onCreated: { addListener: (fn) => listeners.onCreatedTab.push(fn) },
        onUpdated: { addListener: (fn) => listeners.onUpdatedTab.push(fn) },
      },
      action: {
        setIcon: async () => {},
        setBadgeText: async () => {},
        setBadgeBackgroundColor: async () => {},
        setTitle: async () => {},
      },
      scripting: {
        registerContentScripts: async (scripts) => {
          for (const s of scripts) registeredScripts.set(s.id, s);
        },
        unregisterContentScripts: async ({ ids }) => {
          for (const id of ids) registeredScripts.delete(id);
        },
        getRegisteredContentScripts: async ({ ids }) => {
          return ids.map((id) => registeredScripts.get(id)).filter(Boolean);
        },
        executeScript: async () => {},
      },
      permissions: {
        getAll: async () => ({ origins: Array.from(grantedPermissions) }),
        contains: async ({ origins }) => {
          return (origins || []).every((o) => grantedPermissions.has(o) || grantedPermissions.has("*://*/*"));
        },
        remove: async ({ origins }) => {
          for (const o of origins) grantedPermissions.delete(o);
          return true;
        },
        onRemoved: { addListener: (fn) => listeners.onRemovedPerm.push(fn) },
        onAdded: { addListener: (fn) => listeners.onAddedPerm.push(fn) },
      },
      storage: {
        local: {
          get: async (key) => ({ [key]: storageData[key] }),
          set: async (obj) => {
            Object.assign(storageData, obj);
          },
        },
      },
    },
  };
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

test("lifecycle: setCfg serialized promise chain", async () => {
  const mock = createMockChrome();
  const sandbox = createSandbox(mock, true);
  const bgCode = readExtFile("background.js");
  vm.runInNewContext(bgCode, sandbox);
  const BG = sandbox.SolstoneBackground;
  await BG.ensureInit();

  await Promise.all([
    BG.setCfg({ paused: true }),
    BG.setCfg({ showPageIndicator: true }),
    BG.setCfg({ chosenOrigins: ["https://example.com"] }),
  ]);

  const cfg = await BG.getCfg();
  assert.equal(cfg.paused, true);
  assert.equal(cfg.showPageIndicator, true);
  assert.deepEqual(cfg.chosenOrigins, ["https://example.com"]);
});

test("lifecycle: permissions.onRemoved drops exact origin, sets drift, and messages content", async () => {
  const mock = createMockChrome();
  mock.grantedPermissions.clear();
  mock.grantedPermissions.add("*://example.com/*");
  const sandbox = createSandbox(mock, true);
  const bgCode = readExtFile("background.js");
  vm.runInNewContext(bgCode, sandbox);
  const BG = sandbox.SolstoneBackground;
  await BG.ensureInit();

  await BG.setCfg({ chosenOrigins: ["https://example.com", "https://example.com:8443"] });
  BG.port.chosenOrigins = new Set(["https://example.com", "https://example.com:8443"]);
  BG.port.grantedOrigins = new Set(["https://example.com", "https://example.com:8443"]);

  mock.grantedPermissions.delete("*://example.com/*");
  for (const fn of mock.listeners.onRemovedPerm) {
    await fn({ origins: ["*://example.com/*"] });
  }

  assert.equal(BG.port.grantedOrigins.size, 0);
  assert.equal(BG.port.chosenOrigins.size, 2);
  assert.equal(JSON.stringify(BG.port.drift?.patterns), JSON.stringify(["*://example.com/*"]));

  const permMsgs = mock.sentTabMessages.filter((m) => m.msg?.kind === "leaseUpdate" && m.msg.grantedOrigins.length === 0);
  assert.ok(permMsgs.length > 0);
});

test("lifecycle: removeGrantedOrigin keeps cs- host registration if sibling exact origin shares host", async () => {
  const mock = createMockChrome();
  const sandbox = createSandbox(mock, true);
  const bgCode = readExtFile("background.js");
  vm.runInNewContext(bgCode, sandbox);
  const BG = sandbox.SolstoneBackground;
  const Router = sandbox.SolstoneRouter;
  await BG.ensureInit();

  const extSender = {
    id: "fgfnkcefedeheoeamppkiiloncfekakf",
    url: "chrome-extension://fgfnkcefedeheoeamppkiiloncfekakf/popup.html",
  };

  // User grants permission and acknowledges disclosure
  mock.grantedPermissions.add("*://example.com/*");
  await Router.route({ cmd: "acknowledgeDisclosure", version: 1 }, extSender, { runtimeId: "fgfnkcefedeheoeamppkiiloncfekakf", port: BG.port, setCfg: BG.setCfg });
  // Add two sibling origins
  BG.port.hostCapture = "permitted";
  BG.port.capturePermitted = true;
  BG.port.lease = { token: "fixture", generation: "g", receivedAt: BG.port.now(), freshnessMs: 10000 };
  const r1 = await Router.route({ cmd: "addGrantedOrigin", origin: "https://example.com" }, extSender, {
    runtimeId: "fgfnkcefedeheoeamppkiiloncfekakf",
    port: BG.port,
    setCfg: BG.setCfg,
    registerSite: BG.registerSite,
  });
  assert.equal(r1.ok, true, `addGrantedOrigin failed: ${JSON.stringify(r1)}`);
  assert.ok(mock.registeredScripts.has("cs-example.com"));
  await Router.route({ cmd: "addGrantedOrigin", origin: "https://example.com:8443" }, extSender, {
    runtimeId: "fgfnkcefedeheoeamppkiiloncfekakf",
    port: BG.port,
    setCfg: BG.setCfg,
    registerSite: BG.registerSite,
  });

  assert.ok(mock.registeredScripts.has("cs-example.com"));

  // Remove first origin
  await Router.route({ cmd: "removeGrantedOrigin", origin: "https://example.com" }, extSender, {
    runtimeId: "fgfnkcefedeheoeamppkiiloncfekakf",
    port: BG.port,
    setCfg: BG.setCfg,
    removeSiteOrigin: BG.removeSiteOrigin,
    unregisterSite: BG.unregisterSite,
  });

  // cs-example.com must still be registered because https://example.com:8443 is still in chosenOrigins
  assert.ok(mock.registeredScripts.has("cs-example.com"));

  // Remove last origin
  await Router.route({ cmd: "removeGrantedOrigin", origin: "https://example.com:8443" }, extSender, {
    runtimeId: "fgfnkcefedeheoeamppkiiloncfekakf",
    port: BG.port,
    setCfg: BG.setCfg,
    removeSiteOrigin: BG.removeSiteOrigin,
    unregisterSite: BG.unregisterSite,
  });

  assert.equal(mock.registeredScripts.has("cs-example.com"), false);
});

test("lifecycle: init skips ungranted origins, leaves in cfg, sets port.drift", async () => {
  const mock = createMockChrome();
  // Clear granted permissions so no origins are granted by browser
  mock.grantedPermissions.clear();
  // Set storage with chosenOrigins
  mock.storageData["cfg"] = {
    paused: false,
    showPageIndicator: false,
    chosenOrigins: ["https://example.com"],
  };

  const sandbox = createSandbox(mock, true);
  const bgCode = readExtFile("background.js");
  vm.runInNewContext(bgCode, sandbox);
  const BG = sandbox.SolstoneBackground;
  const port = await BG.ensureInit();

  // Port live granted origins must be empty
  assert.equal(port.grantedOrigins.size, 0);
  assert.equal(port.chosenOrigins.has("https://example.com"), true);
  assert.equal(JSON.stringify(port.getStatus().inactiveOrigins), JSON.stringify(["https://example.com"]));
  // Drift must contain missing pattern
  assert.equal(JSON.stringify(port.drift?.patterns), JSON.stringify(["*://example.com/*"]));
  // Stored cfg must NOT have purged https://example.com
  const cfg = await BG.getCfg();
  assert.equal(JSON.stringify(cfg.chosenOrigins), JSON.stringify(["https://example.com"]));
  // Content script must not be registered
  assert.equal(mock.registeredScripts.has("cs-example.com"), false);
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


async function startWorker() {
  const mock = createMockChrome();
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

test("lifecycle: concurrent grants both survive the next worker's configuration", async () => {
  const {bg,sandbox,mock}=await startWorker(), p=bg.port;
  mock.grantedPermissions.add("*://a.example/*");
  mock.grantedPermissions.add("*://b.example/*");
  p.consentVersion=1; p.capturePermitted=true; p.hostCapture="permitted";
  p.lease={token:"t",generation:"g",receivedAt:p.now(),freshnessMs:10000};
  const id="fgfnkcefedeheoeamppkiiloncfekakf";
  const sender={id,url:`chrome-extension://${id}/popup.html`};
  const deps={runtimeId:id,port:p,setCfg:bg.setCfg,registerSite:bg.registerSite};
  const origins=["https://a.example","https://b.example"];
  const results=await Promise.all(origins.map(origin=>sandbox.SolstoneRouter.route({cmd:"addGrantedOrigin",origin},sender,deps)));
  assert.ok(results.every(result=>result.ok), JSON.stringify(results));
  assert.deepEqual(Array.from((await bg.getCfg()).chosenOrigins).sort(),origins);
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

test("lifecycle: worker restart reloads truncation occurrences and exact-origin errors", async () => {
  const first = await startWorker();
  const origin = "https://example.com";
  const olderId = "document-a:hash:true:label";
  const newerId = "document-b:hash:true:label";
  await first.bg.port.recordTruncation(origin, olderId);
  await first.bg.port.recordTruncation(origin, newerId);
  const dismissed = await first.bg.port.dismissTruncation(origin, first.bg.port.truncationByOrigin[origin].newestId);
  assert.equal(dismissed.ok, true);
  assert.equal(dismissed.dismissed, true);
  await first.bg.port.setRegistration(origin, "failed");
  await first.bg.port.setEnqueueError(origin, "outbox-full");

  const second = await startWorker();
  const status = second.bg.port.getStatus();
  assert.equal(status.truncationByOrigin[origin].count, 0);
  assert.equal(status.truncationByOrigin[origin].newestId, "trunc-2");
  assert.equal(status.truncationByOrigin[origin].dismissedThrough, 2);
  assert.equal(status.registration[origin], "failed");
  assert.equal(status.enqueue[origin], "outbox-full");
  assert.equal((await second.bg.port.recordTruncation(origin, olderId)).recorded, false);
  assert.equal((await second.bg.port.recordTruncation(origin, newerId)).recorded, false);
  assert.equal(second.bg.port.truncationByOrigin[origin].count, 0);
  assert.equal((await second.bg.port.recordTruncation(origin, "document-c:hash:true:label")).recorded, true);
  assert.equal(second.bg.port.truncationByOrigin[origin].count, 1);
  assert.equal(second.bg.port.truncationByOrigin[origin].newestId, "trunc-3");
});

test("lifecycle: permission withdrawal during initialization cannot restore an old grant", async () => {
  const mock=createMockChrome(), stalled=deferred(), entered=deferred();
  mock.grantedPermissions.clear();
  mock.storageData.cfg={paused:false,showPageIndicator:false,chosenOrigins:["https://example.com"]};
  mock.grantedPermissions.add("*://example.com/*");
  const original=mock.chrome.permissions.getAll;
  let calls=0;
  mock.chrome.permissions.getAll=async()=>{
    const value=await original();
    if (++calls===1) {entered.resolve();await stalled.promise;}
    return value;
  };
  const sandbox=createSandbox(mock);
  vm.runInNewContext(readExtFile("background.js"),sandbox);
  await entered.promise;
  mock.grantedPermissions.delete("*://example.com/*");
  for(const listener of mock.listeners.onRemovedPerm) listener({origins:["*://example.com/*"]});
  stalled.resolve();
  const port=await sandbox.SolstoneBackground.ensureInit();
  assert.equal(port.grantedOrigins.has("https://example.com"),false);
});

test("lifecycle: remove during add persistence closes authority and keeps a chosen sibling", async () => {
  const {mock, sandbox, bg} = await startWorker();
  const port = bg.port;
  const id = mock.chrome.runtime.id;
  const sender = {id, url: `chrome-extension://${id}/popup.html`};
  const sibling = "https://example.com:8443";
  const origin = "https://example.com";
  const pattern = "*://example.com/*";
  mock.grantedPermissions.delete("*://*/*");
  mock.grantedPermissions.add(pattern);
  port.chosenOrigins = new Set([sibling]);
  port.grantedOrigins = new Set([sibling]);
  port.hostCapture = "permitted";
  port.capturePermitted = true;
  port.consentVersion = 1;
  port.lease = {token:"t", generation:"g", receivedAt:port.now(), freshnessMs:10000};
  await bg.setCfg({chosenOrigins: [sibling]});

  const entered = deferred(), storage = deferred();
  const originalSet = mock.chrome.storage.local.set;
  let hold = true;
  mock.chrome.storage.local.set = async value => {
    if (hold) {
      hold = false;
      entered.resolve();
      await storage.promise;
    }
    return originalSet(value);
  };
  const deps = {runtimeId: id, port, setCfg: bg.setCfg, registerSite: bg.registerSite};
  const adding = sandbox.SolstoneRouter.route({cmd: "addGrantedOrigin", origin}, sender, deps);
  await entered.promise;
  const removing = sandbox.SolstoneRouter.route({cmd: "removeGrantedOrigin", origin}, sender, {
    ...deps, removeSiteOrigin: async () => {},
  });
  assert.equal(port.chosenOrigins.has(origin), false);
  assert.equal(port.grantedOrigins.has(origin), false);
  storage.resolve();
  const [addResult] = await Promise.all([adding, removing]);

  assert.equal(addResult.ok, false);
  assert.equal(addResult.error, "capture_unavailable");
  const durable = await bg.getCfg();
  assert.equal(durable.chosenOrigins.length, 1);
  assert.equal(durable.chosenOrigins[0], sibling);
  assert.equal(Array.from(port.chosenOrigins)[0], sibling);
  assert.equal(Array.from(port.grantedOrigins)[0], sibling);
  assert.equal(mock.grantedPermissions.has(pattern), true);
  assert.equal(sandbox.SolstoneCaptureGate.computeDecision({
    lease:port.lease, paused:port.paused, consentVersion:port.consentVersion,
    originGranted:port.grantedOrigins.has(origin), pressure:port.pressure,
    hostCapture:port.hostCapture, capturePermitted:port.capturePermitted, now:port.now(),
  }).open, false);
});

test("lifecycle: pending, expired, denied, stale, and failed add paths keep a sibling pattern", async () => {
  const {mock, sandbox, bg} = await startWorker();
  const port = bg.port;
  const id = mock.chrome.runtime.id;
  const sender = {id, url:"chrome-extension://" + id + "/popup.html"};
  const sibling = "https://example.com:8443";
  const origin = "https://example.com";
  const pattern = "*://example.com/*";
  mock.grantedPermissions.delete("*://*/*");
  mock.grantedPermissions.add(pattern);
  port.chosenOrigins = new Set([sibling]);
  port.grantedOrigins = new Set([sibling]);
  port.hostCapture = "permitted";
  port.capturePermitted = true;
  port.consentVersion = 1;
  port.paused = false;
  port.lease = {token:"t", generation:"g", receivedAt:port.now(), freshnessMs:10000};
  await bg.setCfg({chosenOrigins:[sibling]});
  const deps = {runtimeId:id, port, setCfg:bg.setCfg, registerSite:bg.registerSite};

  await sandbox.SolstoneRouter.route({cmd:"intendAddOrigin", origin}, sender, deps);
  port.now = () => port.ownerSites.reservation.expiresAt + 1;
  await bg.runReconcile();
  assert.equal(port.ownerSites.reservation, null);
  assert.equal(mock.grantedPermissions.has(pattern), true, "the chosen sibling still claims its shared pattern");
  assert.equal(port.chosenOrigins.has(sibling), true);
  assert.equal(port.grantedOrigins.has(sibling), true);
  port.now = () => Date.now();

  await sandbox.SolstoneRouter.route({cmd:"intendAddOrigin", origin}, sender, deps);
  await sandbox.SolstoneRouter.route({cmd:"clearAddIntent"}, sender, deps);
  assert.equal(port.ownerSites.reservation, null);
  assert.equal(port.chosenOrigins.has(origin), false);
  assert.equal(port.grantedOrigins.has(origin), false);

  vm.runInNewContext(readExtFile("lib/popup_view.js"), sandbox);
  const commands = [];
  const denied = await sandbox.SolstonePopupView.grantSite(origin, {
    status: port.getStatus(),
    cmd: (message) => {
      const pending = sandbox.SolstoneRouter.route(message, sender, deps);
      commands.push(pending);
      return pending;
    },
    requestPermission: async () => false,
  });
  await Promise.all(commands);
  assert.equal(denied.denied, true);
  assert.equal(port.ownerSites.reservation, null);

  const staleCommands = [];
  const stale = await sandbox.SolstonePopupView.grantSite(origin, {
    status: port.getStatus(),
    cmd: (message) => {
      const pending = sandbox.SolstoneRouter.route(message, sender, deps);
      staleCommands.push(pending);
      return pending;
    },
    requestPermission: async () => {
      port.paused = true;
      await mock.listeners.onAddedPerm[0]({origins:[pattern]});
      return true;
    },
  });
  await Promise.all(staleCommands);
  assert.equal(stale.denied, true);
  assert.equal(port.ownerSites.reservation, null);
  assert.equal(port.chosenOrigins.has(origin), false);
  assert.equal(port.grantedOrigins.has(origin), false);
  port.paused = false;

  await sandbox.SolstoneRouter.route({cmd:"intendAddOrigin", origin}, sender, deps);
  const failedWrite = await sandbox.SolstoneRouter.route({cmd:"addGrantedOrigin", origin}, sender, {
    ...deps, setCfg: async () => { throw new Error("fixture storage failure"); },
  });
  assert.equal(failedWrite.error, "storage_error");
  assert.equal(port.ownerSites.reservation, null);
  assert.equal(port.chosenOrigins.has(origin), false);
  assert.equal(port.grantedOrigins.has(origin), false);
  assert.equal(mock.grantedPermissions.has(pattern), true);
  assert.equal(port.chosenOrigins.has(sibling), true);
  assert.equal(port.grantedOrigins.has(sibling), true);
});

test("lifecycle: onRemoved during add getAll rejects a stale permission snapshot", async () => {
  const {mock, sandbox, bg} = await startWorker();
  const port = bg.port;
  const id = mock.chrome.runtime.id;
  const sender = {id, url:"chrome-extension://" + id + "/popup.html"};
  const origin = "https://example.com";
  const pattern = "*://example.com/*";
  mock.grantedPermissions.delete("*://*/*");
  mock.grantedPermissions.add(pattern);
  port.hostCapture = "permitted";
  port.capturePermitted = true;
  port.consentVersion = 1;
  port.lease = {token:"t", generation:"g", receivedAt:port.now(), freshnessMs:10000};
  const deps = {runtimeId:id, port, setCfg:bg.setCfg, registerSite:bg.registerSite};
  await sandbox.SolstoneRouter.route({cmd:"intendAddOrigin", origin}, sender, deps);

  const stale = deferred(), entered = deferred();
  let snapshots = 0;
  mock.chrome.permissions.getAll = () => {
    snapshots++;
    if (snapshots === 1) {
      entered.resolve();
      return stale.promise;
    }
    return Promise.resolve({origins:[]});
  };
  const adding = sandbox.SolstoneRouter.route({cmd:"addGrantedOrigin", origin}, sender, deps);
  await entered.promise;
  mock.grantedPermissions.delete(pattern);
  await mock.listeners.onRemovedPerm[0]({origins:[pattern]});
  stale.resolve({origins:[pattern]});
  const result = await adding;
  assert.equal(result.ok, false);
  assert.equal(result.error, "capture_unavailable");
  assert.equal(port.chosenOrigins.has(origin), true, "the owner choice remains without a withdrawal");
  assert.equal(port.grantedOrigins.has(origin), false);
  assert.equal(port.getStatus().inactiveOrigins.length, 1);
  assert.equal(port.getStatus().gate.open, false);
});

test("lifecycle: real registration results retain reload and failed origin choices", async () => {
  const {mock, sandbox, bg} = await startWorker();
  const port = bg.port;
  const id = mock.chrome.runtime.id;
  const sender = {id, url:"chrome-extension://" + id + "/popup.html"};
  port.hostCapture = "permitted";
  port.capturePermitted = true;
  port.consentVersion = 1;
  port.lease = {token:"t", generation:"g", receivedAt:port.now(), freshnessMs:10000};
  mock.grantedPermissions.add("*://example.com/*");
  await port.clearSiteError("enqueue", "https://example.com");
  mock.chrome.scripting.executeScript = async () => { throw new Error("fixture tab reload required"); };
  const deps = {runtimeId:id, port, setCfg:bg.setCfg, registerSite:bg.registerSite};
  const reloadOrigin = "https://example.com";
  await sandbox.SolstoneRouter.route({cmd:"intendAddOrigin", origin:reloadOrigin}, sender, deps);
  const reload = await sandbox.SolstoneRouter.route({cmd:"addGrantedOrigin", origin:reloadOrigin}, sender, deps);
  assert.equal(reload.ok, true, JSON.stringify(reload));
  assert.equal(reload.registration, "reload");
  assert.equal(port.chosenOrigins.has(reloadOrigin), true);
  assert.equal(port.registration[reloadOrigin], "reload");
  port.openTabs = {known:true, openOrigins:[reloadOrigin], anyGrantedTabOpen:true};
  assert.equal(sandbox.SolstoneStatus.siteRow(reloadOrigin, port.getStatus()).kind, "reload-tab");

  mock.chrome.scripting.registerContentScripts = async () => { throw new Error("fixture registration failure"); };
  const failedOrigin = "https://other.example";
  mock.grantedPermissions.add("*://other.example/*");
  await sandbox.SolstoneRouter.route({cmd:"intendAddOrigin", origin:failedOrigin}, sender, deps);
  const failed = await sandbox.SolstoneRouter.route({cmd:"addGrantedOrigin", origin:failedOrigin}, sender, deps);
  assert.equal(failed.ok, false);
  assert.equal(failed.error, "registration_failed");
  assert.equal(failed.registration, "failed");
  assert.equal(port.chosenOrigins.has(failedOrigin), true);
  assert.equal(port.grantedOrigins.has(failedOrigin), true);
  assert.equal(port.registration[failedOrigin], "failed");
  assert.equal(sandbox.SolstoneStatus.siteRow(failedOrigin, port.getStatus()).kind, "error");
});

test("lifecycle: onRemoved publishes a closed lease before its permission snapshot settles", async () => {
  const {mock, bg} = await startWorker();
  const origin = "https://example.com";
  const pattern = "*://example.com/*";
  mock.grantedPermissions.delete("*://*/*");
  mock.grantedPermissions.add(pattern);
  bg.port.chosenOrigins = new Set([origin]);
  bg.port.grantedOrigins = new Set([origin]);
  bg.port.hostCapture = "permitted";
  bg.port.capturePermitted = true;
  bg.port.consentVersion = 1;
  bg.port.lease = {token:"t", generation:"g", receivedAt:bg.port.now(), freshnessMs:10000};

  const snapshot = deferred(), entered = deferred();
  mock.sentTabMessages.length = 0;
  mock.chrome.tabs.query = () => {};
  let notifications = 0;
  const notify = bg.port.notify.bind(bg.port);
  bg.port.notify = () => { notifications++; return notify(); };
  mock.chrome.permissions.getAll = () => {
    entered.resolve();
    return snapshot.promise;
  };
  const removing = mock.listeners.onRemovedPerm[0]({origins:[pattern]});
  await entered.promise;
  assert.equal(notifications, 1, "withdrawal must notify before getAll resolves");
  assert.equal(bg.port.getStatus().gate.open, false, "the synchronous notification must publish a closed gate");
  snapshot.reject(new Error("permission snapshot unavailable"));
  await removing;
  assert.equal(bg.port.grantedOrigins.has(origin), false);
  assert.equal(bg.port.getStatus().gate.open, false);
});

test("lifecycle: stale onAdded snapshot cannot restore a grant after a later withdrawal", async () => {
  const {mock, bg} = await startWorker();
  const origin = "https://example.com";
  const pattern = "*://example.com/*";
  mock.grantedPermissions.delete("*://*/*");
  mock.grantedPermissions.add(pattern);
  bg.port.chosenOrigins = new Set([origin]);
  bg.port.grantedOrigins = new Set();

  const addSnapshot = deferred(), addEntered = deferred();
  mock.chrome.permissions.getAll = () => {
    addEntered.resolve();
    return addSnapshot.promise;
  };
  const added = mock.listeners.onAddedPerm[0]({origins:[pattern]});
  await addEntered.promise;
  mock.grantedPermissions.delete(pattern);
  const removed = mock.listeners.onRemovedPerm[0]({origins:[pattern]});
  addSnapshot.resolve({origins:[pattern]});
  await Promise.all([added, removed]);
  assert.equal(bg.port.grantedOrigins.has(origin), false);
  assert.equal(bg.port.getStatus().inactiveOrigins.length, 1);
  assert.equal(bg.port.getStatus().inactiveOrigins[0], origin);
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
  const pattern = "*://first.example/*";
  const deps = {runtimeId:id, port, setCfg:bg.setCfg, registerSite:bg.registerSite};
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
  assert.equal(port.grantedOrigins.has(origin), true);
  assert.equal(port.ownerSites.reservation, null);
});

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

test("content withdrawal reaches existing leases before tab enumeration settles",async()=>{
 const fixture=await startWorker(),{mock,bg,sandbox}=fixture;authorizeFixture(fixture);
 const origin="https://example.com",pattern="*://example.com/*";
 bg.port.grantedOrigins=new Set([origin]);bg.port.chosenOrigins=new Set([origin]);
 const content=contentHarness(sandbox.SolstoneCaptureGate);
 content.requests[0]({ok:true,lease:{token:"t",generation:"g",freshnessMs:10000},paused:false,
 consentVersion:1,grantedOrigins:[origin],hostCapture:"permitted",capturePermitted:true,connectionGeneration:1,destinationGeneration:"g"});
 assert.equal(content.reads,0);
 const callbacks=[];mock.chrome.tabs.query=(_query,callback)=>{callbacks.push(callback);};
 mock.chrome.tabs.sendMessage=(_id,msg,cb)=>{mock.sentTabMessages.push(msg);content.msg(msg);cb?.();};
 mock.sentTabMessages.length=0;
 const snapshot=deferred();mock.chrome.permissions.getAll=()=>snapshot.promise;
 mock.grantedPermissions.delete(pattern);
 const removing=mock.listeners.onRemovedPerm[0]({origins:[pattern]});
 assert.equal(bg.port.getStatus().gate.open,false);
 assert.ok(mock.sentTabMessages.length>0);
 content.tick();
 assert.equal(content.reads,0);
 assert.equal(content.sent.some(m=>m.kind==="skim"),false);
 console.log("PROBE delayed closure:",JSON.stringify({backgroundGate:bg.port.getStatus().gate.open,contentReads:content.reads,contentSkims:content.sent.filter(m=>m.kind==="skim").length,tabMessages:mock.sentTabMessages.length}));
 for(const callback of callbacks)callback?.(mock.tabsList);
 const reads=content.reads;content.tick();assert.equal(content.reads,reads);
 snapshot.reject(Error("probe cleanup"));await removing;
});

test("stale reconciliation preserves a completed new choice", async()=>{
 const h=await startWorker(), {mock,bg,sandbox}=h, {sender,deps}=authorizeFixture(h);
 const held=deferred(), entered=deferred(); const getAll=mock.chrome.permissions.getAll;
 let once=true;
 mock.chrome.permissions.getAll=()=>{if(once){once=false;entered.resolve();return held.promise;}return getAll();};
 const reconcile=bg.runReconcile(); await entered.promise;
 const added=await sandbox.SolstoneRouter.route({cmd:"addGrantedOrigin",origin:"https://example.com"},sender,deps);
 assert.equal(added.ok,true);
 held.resolve({origins:["*://example.com/*"]}); await reconcile;
 assert.equal(mock.grantedPermissions.has("*://example.com/*"),true);
 assert.equal(bg.port.chosenOrigins.has("https://example.com"),true);
 console.log("PROBE stale reconcile:",JSON.stringify({added,chosen:[...bg.port.chosenOrigins],permissions:[...mock.grantedPermissions]}));
});
test("delayed registration is cleaned after completed owner removal",async()=>{
 const h=await startWorker(),{mock,bg,sandbox}=h,{sender,deps}=authorizeFixture(h);
 const origin="https://example.com";
 bg.port.chosenOrigins=new Set([origin]); await bg.setCfg({chosenOrigins:[origin]});
 const held=deferred(),entered=deferred();const register=mock.chrome.scripting.registerContentScripts;
 mock.chrome.scripting.registerContentScripts=async scripts=>{entered.resolve();await held.promise;return register(scripts);};
 const added=mock.listeners.onAddedPerm[0]({origins:["*://example.com/*"]});await entered.promise;
 const removed=await sandbox.SolstoneRouter.route({cmd:"removeGrantedOrigin",origin},sender,deps);
 assert.equal(removed.ok,true);assert.equal(mock.registeredScripts.has("cs-example.com"),false);
 held.resolve();await added;
 assert.equal(mock.registeredScripts.has("cs-example.com"),false);
 assert.equal(bg.port.chosenOrigins.has(origin),false);assert.equal(bg.port.grantedOrigins.has(origin),false);
 console.log("PROBE late registration:",JSON.stringify({removed,registered:[...mock.registeredScripts.keys()],chosen:[...bg.port.chosenOrigins]}));
});
test("old removal preserves a newer successful re-add",async()=>{
 const h=await startWorker(),{mock,bg,sandbox}=h,{sender,deps}=authorizeFixture(h);const origin="https://example.com";
 bg.port.chosenOrigins=new Set([origin]);bg.port.grantedOrigins=new Set([origin]);await bg.setCfg({chosenOrigins:[origin]});
 const held=deferred(),entered=deferred();const unregister=mock.chrome.scripting.unregisterContentScripts;let once=true;
 mock.chrome.scripting.unregisterContentScripts=async value=>{if(once){once=false;entered.resolve();await held.promise;}return unregister(value);};
 mock.chrome.permissions.remove=async({origins})=>{for(const o of origins)mock.grantedPermissions.delete(o);await mock.listeners.onRemovedPerm[0]({origins});return true;};
 const removing=sandbox.SolstoneRouter.route({cmd:"removeGrantedOrigin",origin},sender,deps);await entered.promise;
 const added=await sandbox.SolstoneRouter.route({cmd:"addGrantedOrigin",origin},sender,deps);assert.equal(added.ok,true);
 held.resolve();const removed=await removing;
 assert.equal(mock.grantedPermissions.has("*://example.com/*"),true);assert.equal(bg.port.grantedOrigins.has(origin),true);assert.equal(bg.port.chosenOrigins.has(origin),true);
 assert.equal(mock.registeredScripts.has("cs-example.com"),true);
 console.log("PROBE removal/re-add:",JSON.stringify({added,removed,chosen:[...bg.port.chosenOrigins],granted:[...bg.port.grantedOrigins],permissions:[...mock.grantedPermissions]}));
});


test("new add waits for a permission release already dispatched by old reconciliation", async () => {
  const h = await startWorker(), {mock, bg} = h, {sender} = authorizeFixture(h);
  const entered = deferred(), release = deferred();
  const remove = mock.chrome.permissions.remove;
  mock.chrome.permissions.remove = async value => {
    entered.resolve();
    await release.promise;
    return remove(value);
  };
  const cleanup = bg.runReconcile();
  await entered.promise;
  let settled = false;
  const adding = new Promise(resolve => mock.listeners.onMessage[0](
    {cmd: "addGrantedOrigin", origin: "https://example.com"}, sender,
    result => { settled = true; resolve(result); },
  ));
  for (let i = 0; i < 30; i++) await Promise.resolve();
  assert.equal(settled, false);
  release.resolve();
  await cleanup;
  const result = await adding;
  assert.equal(result.ok, false);
  assert.equal(bg.port.grantedOrigins.has("https://example.com"), false);
  mock.grantedPermissions.add("*://example.com/*");
  const retry = await new Promise(resolve => mock.listeners.onMessage[0](
    {cmd: "addGrantedOrigin", origin: "https://example.com"}, sender, resolve,
  ));
  assert.equal(retry.ok, true);
  assert.equal(bg.port.grantedOrigins.has("https://example.com"), true);
});

test("remove wins add while older permission effect is settling",async()=>{
 const fixture=await startWorker(),{mock,bg,sandbox}=fixture,{sender}=authorizeFixture(fixture);
 const origin="https://example.com",sibling="https://example.com:8443",other="*://other.example/*";
 bg.port.chosenOrigins=new Set([origin,sibling]);bg.port.grantedOrigins=new Set([sibling]);await bg.setCfg({chosenOrigins:[origin,sibling]});
 mock.grantedPermissions.add(other);
 const hold=deferred(),entered=deferred();const remove=mock.chrome.permissions.remove;
 mock.chrome.permissions.remove=async value=>{if(value.origins.includes(other)){entered.resolve();await hold.promise;}return remove(value);};
 const cleanup=bg.runReconcile();await entered.promise;
 const route=msg=>new Promise(resolve=>mock.listeners.onMessage[0](msg,sender,resolve));
 await route({cmd:"intendAddOrigin",origin});
 const adding=route({cmd:"addGrantedOrigin",origin});
 for(let i=0;i<30;i++)await Promise.resolve();
 const removed=await route({cmd:"removeGrantedOrigin",origin});
 assert.equal(removed.ok,true);assert.equal(bg.port.chosenOrigins.has(origin),false);
 hold.resolve();await cleanup;const added=await adding;
 console.log("REVIEW settle/remove",JSON.stringify({added,removed,chosen:[...bg.port.chosenOrigins],granted:[...bg.port.grantedOrigins],durable:(await bg.getCfg()).chosenOrigins}));
 assert.equal(added.ok,false);assert.equal(bg.port.grantedOrigins.has(origin),false);
 assert.equal(bg.port.chosenOrigins.has(origin),false);
 assert.equal((await bg.getCfg()).chosenOrigins.includes(origin),false);
});

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
