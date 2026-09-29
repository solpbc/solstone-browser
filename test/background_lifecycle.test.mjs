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
    BG.setCfg({ grantedOrigins: ["https://example.com"] }),
  ]);

  const cfg = await BG.getCfg();
  assert.equal(cfg.paused, true);
  assert.equal(cfg.showPageIndicator, true);
  assert.deepEqual(cfg.grantedOrigins, ["https://example.com"]);
});

test("lifecycle: permissions.onRemoved drops exact origin, sets drift, and messages content", async () => {
  const mock = createMockChrome();
  mock.grantedPermissions.add("*://example.com/*");
  const sandbox = createSandbox(mock, true);
  const bgCode = readExtFile("background.js");
  vm.runInNewContext(bgCode, sandbox);
  const BG = sandbox.SolstoneBackground;
  await BG.ensureInit();

  await BG.setCfg({ grantedOrigins: ["https://example.com", "https://example.com:8443"] });
  BG.port.grantedOrigins = new Set(["https://example.com", "https://example.com:8443"]);

  for (const fn of mock.listeners.onRemovedPerm) {
    fn({ origins: ["*://example.com/*"] });
  }

  assert.equal(BG.port.grantedOrigins.size, 0);
  assert.deepEqual(BG.port.drift?.patterns, ["*://example.com/*"]);

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

  // cs-example.com must still be registered because https://example.com:8443 is still in grantedOrigins
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
  // Set storage with grantedOrigins
  mock.storageData["cfg"] = {
    paused: false,
    showPageIndicator: false,
    grantedOrigins: ["https://example.com"],
  };

  const sandbox = createSandbox(mock, true);
  const bgCode = readExtFile("background.js");
  vm.runInNewContext(bgCode, sandbox);
  const BG = sandbox.SolstoneBackground;
  const port = await BG.ensureInit();

  // Port live granted origins must be empty
  assert.equal(port.grantedOrigins.size, 0);
  // Drift must contain missing pattern
  assert.equal(JSON.stringify(port.drift?.patterns), JSON.stringify(["*://example.com/*"]));
  // Stored cfg must NOT have purged https://example.com
  const cfg = await BG.getCfg();
  assert.equal(JSON.stringify(cfg.grantedOrigins), JSON.stringify(["https://example.com"]));
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
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return {promise, resolve};
}
function states(bg) {
  const permitted = {...bg.port.getStatus(), connected:true, hostCapture:"permitted",
    capturePermitted:true, consentVersion:1, grantedOrigins:["https://example.com"],
    gate:{open:true}, lease:{token:"t",generation:"g",receivedAt:100,freshnessMs:15000}};
  return {permitted, closed:{...permitted, connected:false, hostCapture:null,
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
  callbacks[1](mock.tabsList); callbacks[0](mock.tabsList);
  assert.equal(mock.sentTabMessages.length,1);
  assert.equal(mock.sentTabMessages[0].msg.capturePermitted,false);
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
  const deps={runtimeId:id,port:p,setCfg:bg.setCfg};
  const origins=["https://a.example","https://b.example"];
  const results=await Promise.all(origins.map(origin=>sandbox.SolstoneRouter.route({cmd:"addGrantedOrigin",origin},sender,deps)));
  assert.ok(results.every(result=>result.ok), JSON.stringify(results));
  assert.deepEqual(Array.from((await bg.getCfg()).grantedOrigins).sort(),origins);
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


test("lifecycle: permission withdrawal during initialization cannot restore an old grant", async () => {
  const mock=createMockChrome(), stalled=deferred(), entered=deferred();
  mock.storageData.cfg={paused:false,showPageIndicator:false,grantedOrigins:["https://example.com"]};
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
