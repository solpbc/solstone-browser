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
        getRegisteredContentScripts: async ({ ids } = {}) => {
          return ids ? ids.map((id) => registeredScripts.get(id)).filter(Boolean) : [...registeredScripts.values()];
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
    Object.assign(port, { consentVersion: 1, hostCapture: "permitted", capturePermitted: true,
      connectionToken: "token", destinationGeneration: "generation",
      lease: { token: "token", generation: "generation", receivedAt: 25, freshnessMs: 10000 } });
    port.grantedOrigins.add(origin);
    port.chosenOrigins.add(origin);
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

test("all-sites bootstrap survives native lease renewal during tab enumeration", async () => {
  const mock=createMockChrome();const sandbox=createSandbox(mock,true);
  vm.runInNewContext(readExtFile("background.js"),sandbox);
  const port=await sandbox.SolstoneBackground.ensureInit();port.consentVersion=1;
  mock.grantedPermissions.add("*://*/*");
  const injected=[];const query=mock.chrome.tabs.query;
  mock.chrome.tabs.query=async info=>{
    if (Array.isArray(info?.url)) {port.stateRevision++;port.notify();}
    return query(info);
  };
  mock.chrome.scripting.executeScript=async request=>{injected.push(request.target.tabId);return [];};
  const result=await new Promise(resolve=>mock.listeners.onMessage[0]({cmd:"setSiteMode",mode:"all",agreed:true},
    {id:mock.chrome.runtime.id,url:`chrome-extension://${mock.chrome.runtime.id}/options.html`},resolve));
  assert.equal(result.ok,true);
  assert.ok(injected.includes(101));
});

test("all-sites queued mode and exclusion withdrawals close scope before browser effects settle", async () => {
  // Mode-switch pending stays:
  {
    const mock = createMockChrome(); const sandbox = createSandbox(mock, true);
    vm.runInNewContext(readExtFile("background.js"), sandbox);
    const port = await sandbox.SolstoneBackground.ensureInit(); port.consentVersion = 1;
    mock.grantedPermissions.add("*://*/*");
    const send = msg => new Promise(resolve => mock.listeners.onMessage[0](msg,
      { id: mock.chrome.runtime.id, url: `chrome-extension://${mock.chrome.runtime.id}/options.html` }, resolve));
    await send({ cmd: "setSiteMode", mode: "all", agreed: true });
    let release; const blocker = new Promise(resolve => release = resolve);
    const get = mock.chrome.scripting.getRegisteredContentScripts;
    mock.chrome.scripting.getRegisteredContentScripts = async () => { await blocker; return get(); };
    const first = send({ cmd: "setSiteMode", mode: "selected" });
    await new Promise(resolve => setImmediate(resolve));
    try {
      assert.equal(port.sitePolicyPending, true);
      assert.equal(sandbox.SolstoneHosts.originGranted(port, "https://private.example"), false);
    } finally { release(); await first; }
    assert.equal(port.sitePolicyPending, false);
    assert.equal(sandbox.SolstoneHosts.originGranted(port, "https://private.example"), false);
  }
  // Exclusion half uses setLeftOut and asserts originGranted false immediately, not sitePolicyPending:
  {
    const mock = createMockChrome(); const sandbox = createSandbox(mock, true);
    vm.runInNewContext(readExtFile("background.js"), sandbox);
    const port = await sandbox.SolstoneBackground.ensureInit(); port.consentVersion = 1;
    mock.grantedPermissions.add("*://*/*");
    const send = msg => new Promise(resolve => mock.listeners.onMessage[0](msg,
      { id: mock.chrome.runtime.id, url: `chrome-extension://${mock.chrome.runtime.id}/options.html` }, resolve));
    await send({ cmd: "setSiteMode", mode: "all", agreed: true });
    const leftOutPromise = send({ cmd: "setLeftOut", host: "private.example", out: true });
    await Promise.resolve();
    assert.equal(port.sitePolicyPending, false);
    assert.equal(sandbox.SolstoneHosts.originGranted(port, "https://private.example"), false);
    await leftOutPromise;
    assert.equal(port.sitePolicyPending, false);
    assert.equal(sandbox.SolstoneHosts.originGranted(port, "https://private.example"), false);
  }
});

test("all-sites policy permission refresh cannot restore a withdrawn broad snapshot", async () => {
  const mock=createMockChrome();const sandbox=createSandbox(mock,true);
  vm.runInNewContext(readExtFile("background.js"),sandbox);
  const port=await sandbox.SolstoneBackground.ensureInit();port.consentVersion=1;
  const send=msg=>new Promise(resolve=>mock.listeners.onMessage[0](msg,
    {id:mock.chrome.runtime.id,url:`chrome-extension://${mock.chrome.runtime.id}/options.html`},resolve));
  mock.grantedPermissions.add("*://*/*");
  let release;const blocker=new Promise(resolve=>release=resolve);const get=mock.chrome.permissions.getAll;
  let first=true;
  mock.chrome.permissions.getAll=async()=>{if(first){first=false;await blocker;return {origins:["*://*/*"]};}return get();};
  const changing=send({cmd:"setSiteMode",mode:"all",agreed:true});
  await new Promise(resolve=>setImmediate(resolve));
  mock.grantedPermissions.delete("*://*/*");
  await Promise.all(mock.listeners.onRemovedPerm.map(fn=>fn({origins:["*://*/*"]})));
  release();await changing;
  assert.equal(port.broadGranted,false);
  assert.equal(sandbox.SolstoneHosts.originGranted(port,"https://new.example"),false);
});

test("all-sites narrowing with no removal event and failed snapshot stays closed", async () => {
  const mock=createMockChrome();
  mock.storageData.cfg={chosenOrigins:["https://one.example"],siteMode:"all",allSitesConsent:1};
  const sandbox=createSandbox(mock,true);vm.runInNewContext(readExtFile("background.js"),sandbox);
  const port=await sandbox.SolstoneBackground.ensureInit();port.consentVersion=1;
  assert.equal(port.grantedOrigins.has("https://one.example"),true);
  mock.chrome.permissions.getAll=async()=>{throw new Error("snapshot unavailable");};
  const result=await new Promise(resolve=>mock.listeners.onMessage[0]({cmd:"setSiteMode",mode:"selected"},
    {id:mock.chrome.runtime.id,url:`chrome-extension://${mock.chrome.runtime.id}/options.html`},resolve));
  assert.equal(result.ok,false);
  assert.equal(mock.grantedPermissions.has("*://*/*"),false);
  assert.equal(port.sitePolicyPending,false);
  assert.equal(sandbox.SolstoneHosts.originGranted(port,"https://one.example"),false);
});

test("all-sites mode preserves selected intent, retains its grant and registers exact exclusions", async () => {
  const mock=createMockChrome();
  mock.storageData.cfg={chosenOrigins:["https://one.example"],paused:false,showPageIndicator:false};
  mock.grantedPermissions.add("*://one.example/*");
  const sandbox=createSandbox(mock,true);
  vm.runInNewContext(readExtFile("background.js"),sandbox);
  const port=await sandbox.SolstoneBackground.ensureInit();
  port.consentVersion=1;
  const send=msg=>new Promise(resolve=>mock.listeners.onMessage[0](msg,
    {id:mock.chrome.runtime.id,url:`chrome-extension://${mock.chrome.runtime.id}/options.html`},resolve));
  assert.equal((await send({cmd:"setSiteMode",mode:"all",agreed:false})).error,"missing_consent");
  await send({cmd:"intendAllSites"});
  mock.grantedPermissions.add("*://*/*");
  await Promise.all(mock.listeners.onAddedPerm.map(fn=>fn({origins:["*://*/*"]})));
  assert.equal((await send({cmd:"setSiteMode",mode:"all",agreed:true})).ok,true);
  await sandbox.SolstoneBackground.runReconcile();
  assert.equal(mock.grantedPermissions.has("*://*/*"),true);
  assert.deepEqual(Array.from(port.chosenOrigins),["https://one.example"]);
  assert.ok(mock.registeredScripts.has("cs-all-sites"));
  assert.equal((await send({cmd:"setLeftOut",host:"private.example",out:true})).ok,true);
  assert.equal(sandbox.SolstoneHosts.originGranted(port,"https://private.example"),false);
  // Leaving out a site leaves out every address under it, and nothing beside it.
  assert.equal(sandbox.SolstoneHosts.originGranted(port,"https://www.private.example"),false);
  assert.equal(sandbox.SolstoneHosts.originGranted(port,"https://mail.private.example"),false);
  assert.equal(sandbox.SolstoneHosts.originGranted(port,"https://notprivate.example"),true);
  assert.equal(sandbox.SolstoneHosts.originGranted(port,"https://new.example"),true);
  assert.deepEqual(Array.from(mock.registeredScripts.get("cs-all-sites").excludeMatches),["*://*.private.example/*"]);
  assert.equal((await send({cmd:"setSiteMode",mode:"selected"})).ok,true);
  assert.equal(mock.registeredScripts.has("cs-all-sites"),false);
  assert.equal(mock.grantedPermissions.has("*://*/*"),false);
  assert.deepEqual(Array.from(port.chosenOrigins),["https://one.example"]);
  assert.deepEqual(Array.from(mock.storageData.cfg.excludedHosts),["private.example"]);
  assert.equal(sandbox.SolstoneHosts.originGranted(port,"https://new.example"),false);
});

test("a failed all-sites policy save cannot expand authorization", async () => {
  const mock=createMockChrome();const sandbox=createSandbox(mock,true);
  vm.runInNewContext(readExtFile("background.js"),sandbox);
  const port=await sandbox.SolstoneBackground.ensureInit();port.consentVersion=1;
  const send=msg=>new Promise(resolve=>mock.listeners.onMessage[0](msg,
    {id:mock.chrome.runtime.id,url:`chrome-extension://${mock.chrome.runtime.id}/options.html`},resolve));
  await send({cmd:"intendAllSites"});mock.grantedPermissions.add("*://*/*");
  const set=mock.chrome.storage.local.set;
  mock.chrome.storage.local.set=async()=>{throw new Error("disk failed");};
  assert.equal((await send({cmd:"setSiteMode",mode:"all",agreed:true})).error,"storage_error");
  mock.chrome.storage.local.set=set;
  assert.equal(port.siteMode,"selected");
  assert.equal(sandbox.SolstoneHosts.originGranted(port,"https://new.example"),false);
  assert.notEqual(mock.storageData.cfg.siteMode,"all");
});

test("a broad grant arriving during mode persistence stays reserved and unread until the save finishes", async () => {
  const mock=createMockChrome();const sandbox=createSandbox(mock,true);
  vm.runInNewContext(readExtFile("background.js"),sandbox);
  const port=await sandbox.SolstoneBackground.ensureInit();port.consentVersion=1;
  const send=msg=>new Promise(resolve=>mock.listeners.onMessage[0](msg,
    {id:mock.chrome.runtime.id,url:`chrome-extension://${mock.chrome.runtime.id}/options.html`},resolve));
  await send({cmd:"intendAllSites"});
  let release;const saved=new Promise(resolve=>release=resolve);const set=mock.chrome.storage.local.set;
  mock.chrome.storage.local.set=async obj=>{await saved;return set(obj);};
  const changing=send({cmd:"setSiteMode",mode:"all",agreed:true});
  await new Promise(resolve=>setImmediate(resolve));
  mock.grantedPermissions.add("*://*/*");
  await Promise.all(mock.listeners.onAddedPerm.map(fn=>fn({origins:["*://*/*"]})));
  await sandbox.SolstoneBackground.runReconcile();
  assert.equal(mock.grantedPermissions.has("*://*/*"),true);
  assert.equal(sandbox.SolstoneHosts.originGranted(port,"https://new.example"),false);
  release();assert.equal((await changing).ok,true);
  assert.equal(sandbox.SolstoneHosts.originGranted(port,"https://new.example"),true);
  mock.grantedPermissions.delete("*://*/*");
  await Promise.all(mock.listeners.onRemovedPerm.map(fn=>fn({origins:["*://*/*"]})));
  assert.equal(port.siteMode,"all");
  assert.equal(sandbox.SolstoneHosts.originGranted(port,"https://new.example"),false);
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
  assert.deepEqual([...cfg.chosenOrigins], ["https://example.com"]);
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
  assert.equal(JSON.stringify(BG.port.drift?.patterns), JSON.stringify(["*://*.example.com/*"]));

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
  assert.equal(JSON.stringify(port.drift?.patterns), JSON.stringify(["*://*.example.com/*"]));
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

  // The site is still the owner's (chosen, its grant not yet back), so its
  // errors survive the restart; only an error on a site nobody shares is pruned.
  const second = await startWorker({ chosenOrigins: [origin], paused: false, showPageIndicator: false }, { noGrants: true });
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
  port.now = () => port.ownerSites?.reservation ? port.ownerSites.reservation.expiresAt + 1 : Date.now();
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
      return true;
    },
  });
  await Promise.all(staleCommands);
  assert.equal(stale.ok, true);
  assert.equal(port.chosenOrigins.has(origin), true);
  assert.equal(port.grantedOrigins.has(origin), true);
  assert.equal(port.chosenOrigins.has(sibling), true);
  assert.equal(port.grantedOrigins.has(sibling), true);
  assert.equal(mock.grantedPermissions.has(pattern), true);
  assert.equal(port.ownerSites.reservation, null);

  port.chosenOrigins = new Set([sibling]);
  port.grantedOrigins = new Set([sibling]);
  port.siteWideOrigins = (port.siteWideOrigins || []).filter((o) => o !== origin);
  await bg.setCfg({ chosenOrigins: [sibling], siteWideOrigins: port.siteWideOrigins });
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

test("lifecycle: an open tab that cannot answer after injection asks for a reload", async () => {
  for (const [label, tab, reply, expected] of [
    ["answers", {id: 101, url: "https://example.com/page", status: "complete"}, {ok: true}, "ready"],
    ["stranded", {id: 101, url: "https://example.com/page", status: "complete"}, undefined, "reload"],
    ["refused", {id: 101, url: "https://example.com/page", status: "complete"}, new Error("no receiver"), "reload"],
    ["still loading", {id: 101, url: "https://example.com/page", status: "loading"}, undefined, "ready"],
    ["private", {id: 101, url: "https://example.com/page", status: "complete", incognito: true}, undefined, "ready"],
  ]) {
    const {mock, sandbox, bg} = await startWorker();
    const port = bg.port;
    const id = mock.chrome.runtime.id;
    const sender = {id, url: "chrome-extension://" + id + "/popup.html"};
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
    const deps = {runtimeId: id, port, setCfg: bg.setCfg, registerSite: bg.registerSite};
    const origin = "https://example.com";
    await sandbox.SolstoneRouter.route({cmd: "intendAddOrigin", origin}, sender, deps);
    const result = await sandbox.SolstoneRouter.route({cmd: "addGrantedOrigin", origin}, sender, deps);
    assert.equal(result.ok, true, label + ": " + JSON.stringify(result));
    assert.equal(result.registration, expected, label);
    const asked = pings.filter(p => p.msg?.kind === "ping");
    assert.equal(asked.length, tab.status === "complete" && !tab.incognito ? 1 : 0, label);
    if (asked.length) assert.equal(asked[0].options?.frameId, 0, label);
  }
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
  const pattern = "*://*.first.example/*";
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

test("lifecycle: a real grant completes the reserved add after the popup disappears", async () => {
  const {mock, sandbox, bg} = await startWorker();
  const port = bg.port;
  mock.grantedPermissions.clear();
  port.hostCapture = "permitted";
  port.capturePermitted = true;
  port.consentVersion = 1;
  port.lease = {token:"t", generation:"g", receivedAt:port.now(), freshnessMs:10000};
  const id = mock.chrome.runtime.id;
  const origin = "https://first.example";
  const pattern = "*://*.first.example/*";
  await sandbox.SolstoneRouter.route({cmd:"intendAddOrigin", origin},
    {id, url:`chrome-extension://${id}/popup.html`}, {port});
  mock.grantedPermissions.add(pattern);
  await mock.listeners.onAddedPerm[0]({origins:[pattern]});
  assert.equal(port.chosenOrigins.has(origin), true);
  assert.equal(port.grantedOrigins.has(origin), true);
  assert.ok(mock.registeredScripts.has("cs-first.example"));
  assert.ok((await bg.getCfg()).chosenOrigins.includes(origin));
  assert.equal(port.ownerSites.reservation, null);
});

for (const reason of ["unreserved", "cancelled", "expired", "unrelated", "broad", "mixed", "withdrawn", "removed", "paused", "no-consent", "no-lease", "pressure", "full"]) {
  test(`lifecycle: a ${reason} grant under selected mode and consent adopts or completes`, async () => {
    const {mock, sandbox, bg} = await startWorker();
    const port = bg.port;
    mock.grantedPermissions.clear();
    port.hostCapture = "permitted";
    port.capturePermitted = true;
    port.consentVersion = 1;
    port.lease = {token:"t", generation:"g", receivedAt:port.now(), freshnessMs:10000};
    const id = mock.chrome.runtime.id;
    const origin = "https://first.example";
    const pattern = "*://*.first.example/*";
    const route = message => sandbox.SolstoneRouter.route(message,
      {id, url:`chrome-extension://${id}/popup.html`}, {port, setCfg:bg.setCfg, removeSiteOrigin:bg.removeSiteOrigin, unregisterSite:bg.unregisterSite, walkRemoveSiteGrant:bg.walkRemoveSiteGrant, checkCleanDeclines:bg.checkCleanDeclines});
    if (reason !== "unreserved") await route({cmd:"intendAddOrigin", origin});
    if (reason === "cancelled") await route({cmd:"clearAddIntent"});
    if (reason === "expired") {
      const exp = port.ownerSites.reservation.expiresAt;
      port.now = () => (port.ownerSites?.reservation ? exp : Date.now());
    }
    if (reason === "withdrawn") await mock.listeners.onRemovedPerm[0]({origins:[pattern]});
    if (reason === "removed") await route({cmd:"removeGrantedOrigin", origin});
    if (reason === "paused") port.paused = true;
    if (reason === "no-consent") port.consentVersion = 0;
    if (reason === "no-lease") port.lease = null;
    if (reason === "pressure") port.pressure = {active:true};
    if (reason === "full") port.custody = {full:true};
    const patterns = reason === "unrelated" ? ["*://other.example/*"] :
      reason === "broad" ? ["*://*/*"] : reason === "mixed" ? [pattern,"*://other.example/*"] : [pattern];
    patterns.forEach(p => mock.grantedPermissions.add(p));
    await mock.listeners.onAddedPerm[0]({origins:patterns});

    const H = sandbox.SolstoneHosts;
    if (reason === "no-consent") {
      assert.equal(H.siteForOrigin(port.chosenOrigins, origin), null);
      assert.ok(port.offeredOrigins.includes(origin));
    } else if (reason === "broad") {
      assert.equal(H.siteForOrigin(port.chosenOrigins, origin), null);
    } else if (reason === "unrelated") {
      assert.equal(H.siteForOrigin(port.chosenOrigins, origin), null);
      assert.notEqual(H.siteForOrigin(port.chosenOrigins, "https://other.example"), null);
      assert.ok(port.siteWideOrigins.includes("https://other.example"));
    } else if (reason === "mixed") {
      assert.notEqual(H.siteForOrigin(port.chosenOrigins, origin), null);
      assert.equal(port.siteWideOrigins.includes(origin), false);
      assert.notEqual(H.siteForOrigin(port.chosenOrigins, "https://other.example"), null);
      assert.ok(port.siteWideOrigins.includes("https://other.example"));
    } else if (["paused", "no-lease", "pressure", "full"].includes(reason)) {
      assert.notEqual(H.siteForOrigin(port.chosenOrigins, origin), null);
      assert.equal(port.siteWideOrigins.includes(origin), false);
    } else {
      // unreserved, cancelled, expired, withdrawn, removed
      assert.notEqual(H.siteForOrigin(port.chosenOrigins, origin), null);
      assert.ok(port.siteWideOrigins.includes(origin));
    }
  });
}

test("lifecycle: withdrawal while reserved completion awaits permission wins", async () => {
  const {mock, sandbox, bg} = await startWorker();
  const port = bg.port;
  mock.grantedPermissions.clear();
  port.hostCapture = "permitted";
  port.capturePermitted = true;
  port.consentVersion = 1;
  port.lease = {token:"t", generation:"g", receivedAt:port.now(), freshnessMs:10000};
  const id = mock.chrome.runtime.id;
  const origin = "https://first.example";
  const pattern = "*://*.first.example/*";
  await sandbox.SolstoneRouter.route({cmd:"intendAddOrigin", origin},
    {id, url:`chrome-extension://${id}/popup.html`}, {port});
  const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return {promise, resolve}; };
  const entered = deferred(), permission = deferred();
  mock.chrome.permissions.contains = () => { entered.resolve(); return permission.promise; };
  mock.grantedPermissions.add(pattern);
  const completing = mock.listeners.onAddedPerm[0]({origins:[pattern]});
  await entered.promise;
  mock.grantedPermissions.delete(pattern);
  await mock.listeners.onRemovedPerm[0]({origins:[pattern]});
  permission.resolve(true);
  await completing;
  assert.equal(port.chosenOrigins.has(origin), false);
  assert.equal(port.grantedOrigins.has(origin), false);
  assert.equal(mock.registeredScripts.has("cs-first.example"), false);
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
});


test("new add waits for a permission release already dispatched by old reconciliation", async () => {
  const h = await startWorker(), {mock, bg} = h, {sender} = authorizeFixture(h);
  const origin = "https://example.com";
  bg.port.chosenOrigins = new Set([origin]);
  bg.port.grantedOrigins = new Set([origin]);
  await bg.setCfg({chosenOrigins: [origin]});
  mock.grantedPermissions.add("*://example.com/*");
  const entered = deferred(), release = deferred();
  const remove = mock.chrome.permissions.remove;
  mock.chrome.permissions.remove = async value => {
    entered.resolve();
    await release.promise;
    return remove(value);
  };
  const cleanup = new Promise(resolve => mock.listeners.onMessage[0](
    {cmd: "removeGrantedOrigin", origin}, sender, resolve,
  ));
  await entered.promise;
  let settled = false;
  const adding = new Promise(resolve => mock.listeners.onMessage[0](
    {cmd: "addGrantedOrigin", origin}, sender,
    result => { settled = true; resolve(result); },
  ));
  for (let i = 0; i < 30; i++) await Promise.resolve();
  assert.equal(settled, false);
  release.resolve();
  await cleanup;
  const result = await adding;
  assert.equal(result.ok, false);
  assert.equal(bg.port.grantedOrigins.has(origin), false);
  mock.grantedPermissions.add("*://example.com/*");
  const retry = await new Promise(resolve => mock.listeners.onMessage[0](
    {cmd: "addGrantedOrigin", origin}, sender, resolve,
  ));
  assert.equal(retry.ok, true);
  assert.equal(bg.port.grantedOrigins.has(origin), true);
});

test("remove wins add while older permission effect is settling",async()=>{
 const fixture=await startWorker(),{mock,bg,sandbox}=fixture,{sender}=authorizeFixture(fixture);
 const origin="https://example.com",sibling="https://example.com:8443",other="*://other.example/*",otherOrigin="https://other.example";
 bg.port.chosenOrigins=new Set([origin,sibling,otherOrigin]);bg.port.grantedOrigins=new Set([sibling,otherOrigin]);await bg.setCfg({chosenOrigins:[origin,sibling,otherOrigin]});
 mock.grantedPermissions.add(other);
 const hold=deferred(),entered=deferred();const remove=mock.chrome.permissions.remove;
 mock.chrome.permissions.remove=async value=>{if(value.origins.includes(other)){entered.resolve();await hold.promise;}return remove(value);};
 const cleanup=new Promise(resolve=>mock.listeners.onMessage[0]({cmd:"removeGrantedOrigin",origin:otherOrigin},sender,resolve));await entered.promise;
 const route=msg=>new Promise(resolve=>mock.listeners.onMessage[0](msg,sender,resolve));
 await route({cmd:"intendAddOrigin",origin});
 const adding=route({cmd:"addGrantedOrigin",origin});
 for(let i=0;i<30;i++)await Promise.resolve();
 const removed=await route({cmd:"removeGrantedOrigin",origin});
 assert.equal(removed.ok,true);assert.equal(bg.port.chosenOrigins.has(origin),false);
 hold.resolve();await cleanup;const added=await adding;
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

test("a site left out before covers every address under it on load", async () => {
  const mock=createMockChrome();
  mock.storageData.cfg={chosenOrigins:[],paused:false,showPageIndicator:false,siteMode:"all",allSitesConsent:1,
    excludedHosts:["bank.example","www.shop.example","%2a.junk.example","mail.google.com","foo_bar.example.com"]};
  const sandbox=createSandbox(mock,true);
  vm.runInNewContext(readExtFile("background.js"),sandbox);
  const port=await sandbox.SolstoneBackground.ensureInit();
  const H=sandbox.SolstoneHosts;
  // A typed *.junk.example that Chromium saved as %2a.junk.example now means
  // what the owner meant, all of junk.example; www.shop.example names
  // shop.example; an unusual but real name is never dropped.
  assert.deepEqual(Array.from(port.excludedHosts),["bank.example","foo_bar.example.com","junk.example","mail.google.com","shop.example"]);
  for (const origin of ["https://bank.example","https://login.bank.example","https://shop.example","https://foo_bar.example.com","https://inbox.mail.google.com","https://a.junk.example"]) {
    assert.equal(H.originGranted(port,origin),false,origin);
  }
  assert.equal(H.originGranted(port,"https://docs.google.com"),true);
});

test("an error left on a site nobody shares any more is cleared at start", async () => {
  const mock=createMockChrome();
  mock.storageData.cfg={chosenOrigins:["https://kept.example"],paused:false,showPageIndicator:false};
  mock.grantedPermissions.add("*://kept.example/*");
  const sandbox=createSandbox(mock,true);
  vm.runInNewContext(readExtFile("background.js"),sandbox);
  await sandbox.SolstoneDB.put("meta",{registration:{"https://gone.example":"failed"},
    enqueue:{"https://gone.example":"enqueue_failed","https://kept.example":"enqueue_failed"}},"siteErrors");
  const port=await sandbox.SolstoneBackground.ensureInit();
  const status=port.getStatus();
  assert.deepEqual(Object.keys(status.registration),[]);
  assert.deepEqual(Object.keys(status.enqueue),["https://kept.example"]);
});

test("a site added before sites covered subdomains keeps its host, widens on one prompt, and goes whole on removal", async () => {
  const mock=createMockChrome();
  mock.grantedPermissions.clear();
  mock.grantedPermissions.add("*://old.example/*");
  mock.storageData.cfg={chosenOrigins:["https://old.example"],paused:false,showPageIndicator:false};
  const sandbox=createSandbox(mock,true);
  vm.runInNewContext(readExtFile("background.js"),sandbox);
  const port=await sandbox.SolstoneBackground.ensureInit();
  const H=sandbox.SolstoneHosts;
  // Still read on its own host, not yet on its subdomains, and not "paused by the browser".
  assert.deepEqual(Array.from(port.grantedOrigins),["https://old.example"]);
  assert.deepEqual(Array.from(port.getStatus().exactOnlyOrigins),["https://old.example"]);
  assert.deepEqual(Array.from(port.getStatus().inactiveOrigins),[]);
  assert.equal(H.originGranted(port.getStatus(),"https://old.example"),true);
  assert.equal(H.originGranted(port.getStatus(),"https://login.old.example"),false);
  // Reconciliation never releases the older grant while the site is chosen.
  await sandbox.SolstoneBackground.runReconcile();
  assert.equal(mock.grantedPermissions.has("*://old.example/*"),true);
  // The browser grants the site's own pattern: the whole site is read.
  mock.grantedPermissions.add("*://*.old.example/*");
  await mock.listeners.onAddedPerm[0]({origins:["*://*.old.example/*"]});
  assert.deepEqual(Array.from(port.getStatus().exactOnlyOrigins),[]);
  assert.equal(H.originGranted(port.getStatus(),"https://login.old.example"),true);
  // Removing the site releases both patterns.
  const id=mock.chrome.runtime.id;
  await new Promise(resolve=>mock.listeners.onMessage[0]({cmd:"removeGrantedOrigin",origin:"https://old.example"},
    {id,url:`chrome-extension://${id}/options.html`},resolve));
  assert.equal(mock.grantedPermissions.has("*://*.old.example/*"),false);
  assert.equal(mock.grantedPermissions.has("*://old.example/*"),false);
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

test("removing a site never cuts a chosen site under it, and its tabs keep going", async () => {
  const {mock, bg, sandbox} = await startWorker({chosenOrigins:["https://bank.com","https://login.bank.com"],paused:false,showPageIndicator:false},{noGrants:true});
  mock.chrome.permissions.remove = async ({origins}) => {
    const gone = [];
    for (const o of origins) for (const g of [...mock.grantedPermissions]) if (chromeContains(o, g)) { mock.grantedPermissions.delete(g); gone.push(g); }
    for (const fn of mock.listeners.onRemovedPerm) await fn({origins: gone});
    return true;
  };
  mock.grantedPermissions.add("*://*.bank.com/*");
  mock.grantedPermissions.add("*://*.login.bank.com/*");
  await bg.doInit();
  const p = bg.port;
  mock.tabsList.splice(0, mock.tabsList.length, {id: 7, url: "https://login.bank.com/x"});
  const id = mock.chrome.runtime.id;
  await sandbox.SolstoneRouter.route({cmd:"removeGrantedOrigin", origin:"https://bank.com"}, {id, url:`chrome-extension://${id}/options.html`},
    {runtimeId:id, port:p, setCfg:bg.setCfg, removeSiteOrigin:bg.removeSiteOrigin, unregisterSite:bg.unregisterSite});
  await bg.runReconcile();
  assert.deepEqual(Array.from(p.grantedOrigins), ["https://login.bank.com"]);
  assert.equal(mock.grantedPermissions.has("*://*.login.bank.com/*"), true);
  assert.equal(sandbox.SolstoneHosts.originGranted(p, "https://login.bank.com"), true);
  assert.equal(sandbox.SolstoneHosts.originGranted(p, "https://bank.com"), false);
  assert.equal(mock.sentTabMessages.some((m) => m.tabId === 7 && m.msg.kind === "stop"), false);
});

test("a live all-websites grant never widens a site under an older exact grant", async () => {
  const {bg, sandbox, mock} = await startWorker({chosenOrigins:["https://bank.com"],paused:false,showPageIndicator:false},{noGrants:true});
  mock.grantedPermissions.add("*://bank.com/*");
  mock.grantedPermissions.add("*://*/*");
  mock.chrome.permissions.remove = async () => true;
  await bg.doInit();
  assert.deepEqual(Array.from(bg.port.exactOnlyOrigins), ["https://bank.com"]);
  assert.equal(sandbox.SolstoneHosts.originGranted(bg.port, "https://login.bank.com"), false);
});

test("pause with the solstone app defaults on when the key is absent", async () => {
  const empty = await startWorker();
  assert.equal((await empty.bg.getCfg()).pauseWithApp, true);
  assert.equal(empty.bg.port.pauseWithApp, true);

  const current = await startWorker({ paused: false, showPageIndicator: false, chosenOrigins: ["https://example.com"] });
  assert.equal((await current.bg.getCfg()).pauseWithApp, true);

  const legacy = await startWorker({ paused: false, showPageIndicator: true, grantedOrigins: ["https://legacy.example"] });
  const legacyCfg = await legacy.bg.getCfg();
  assert.equal(legacyCfg.pauseWithApp, true);
  assert.deepEqual([...legacyCfg.chosenOrigins], ["https://legacy.example"]);

  const off = await startWorker({
    paused: false, showPageIndicator: false, chosenOrigins: ["https://example.com"], pauseWithApp: false,
  });
  assert.equal((await off.bg.getCfg()).pauseWithApp, false);
  assert.equal(off.bg.port.pauseWithApp, false);
});

test("turning pause with the app off updates an open tab without reloading it", async () => {
  const mock = createMockChrome();
  mock.storageData.cfg = { paused: false, showPageIndicator: false, chosenOrigins: ["https://example.com"] };
  let listener = null;
  let reloads = 0;
  mock.chrome.runtime.connectNative = () => ({
    postMessage() {},
    disconnect() {},
    onMessage: { addListener: (fn) => { listener = fn; } },
    onDisconnect: { addListener() {} },
  });
  mock.chrome.tabs.reload = () => { reloads += 1; };
  const sandbox = createSandbox(mock);
  vm.runInNewContext(readExtFile("background.js"), sandbox);
  const bg = sandbox.SolstoneBackground;
  await bg.ensureInit();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(typeof listener, "function");

  const ack = {
    type: "hello_ack", capture: "permitted", delivery: "idle", freshness_ms: 10000,
    destination_generation: "gen-1", period_id: "period-1",
  };
  await listener(ack);
  assert.equal(bg.port.handshake, "ready");
  mock.sentTabMessages.length = 0;
  await listener({
    type: "state", capture: "paused", away: false, delivery: "idle", freshness_ms: 10000,
    destination_generation: "gen-1", period_id: "period-1",
  });
  const pausedUpdate = mock.sentTabMessages.filter((entry) => entry.msg?.kind === "leaseUpdate").at(-1);
  assert.ok(pausedUpdate);
  assert.equal(pausedUpdate.msg.hostCapture, "paused");

  const id = mock.chrome.runtime.id;
  mock.sentTabMessages.length = 0;
  const result = await sandbox.SolstoneRouter.route(
    { cmd: "setConfig", pauseWithApp: false },
    { id, url: `chrome-extension://${id}/options.html` },
    { runtimeId: id, port: bg.port, setCfg: bg.setCfg },
  );
  assert.equal(result.ok, true);
  const openUpdate = mock.sentTabMessages.filter((entry) => entry.msg?.kind === "leaseUpdate").at(-1);
  assert.ok(openUpdate);
  assert.equal(openUpdate.msg.hostCapture, "permitted");
  assert.equal(openUpdate.msg.capturePermitted, true);
  assert.equal(reloads, 0);
});

test("lifecycle: upgrade offers bank.com and does not adopt", async () => {
  const mock = createMockChrome();
  mock.storageData.cfg = { chosenOrigins: [], paused: false, showPageIndicator: false, siteMode: "selected" };
  mock.grantedPermissions.add("*://*.bank.com/*");
  const sandbox = createSandbox(mock, true);
  vm.runInNewContext(readExtFile("background.js"), sandbox);
  const bg = sandbox.SolstoneBackground;
  await bg.ensureInit();
  const port = bg.port;
  assert.equal(sandbox.SolstoneHosts.siteForOrigin(port.chosenOrigins, "https://bank.com"), null);
  assert.ok(port.offeredOrigins.includes("https://bank.com"));
  const durable = await bg.getCfg();
  assert.ok(durable.offeredOrigins.includes("https://bank.com"));
  assert.equal(durable.chosenOrigins.includes("https://bank.com"), false);
});

test("lifecycle: setPaused keeps offeredOrigins and does not invent declinedHosts", async () => {
  const {mock, bg, sandbox} = await startWorker({ chosenOrigins: [], paused: false, showPageIndicator: false });
  const port = bg.port;
  port.offeredOrigins = ["https://bank.com"];
  await bg.setCfg({ offeredOrigins: ["https://bank.com"] });
  const id = mock.chrome.runtime.id;
  const sender = { id, url: `chrome-extension://${id}/popup.html` };
  const res = await sandbox.SolstoneRouter.route({ cmd: "setPaused", paused: true }, sender, { port, setCfg: bg.setCfg });
  assert.equal(res.ok, true);
  assert.deepEqual([...port.offeredOrigins], ["https://bank.com"]);
  const durable = await bg.getCfg();
  assert.deepEqual([...(durable.offeredOrigins || [])], ["https://bank.com"]);
  assert.deepEqual([...(durable.declinedHosts || [])], []);
});

test("lifecycle: chosen example.com, localhost:5015, router.local are not re-adopted", async () => {
  const origins = ["https://example.com", "http://localhost:5015", "http://router.local"];
  const {mock, bg, sandbox} = await startWorker({ chosenOrigins: origins, paused: false, showPageIndicator: false });
  const port = bg.port;
  mock.grantedPermissions.add("*://*.example.com/*");
  mock.grantedPermissions.add("*://localhost/*");
  mock.grantedPermissions.add("*://router.local/*");
  port.adoptionNotices = [];
  await sandbox.SolstoneRouter.runAdoptionPass({ port, setCfg: bg.setCfg, registerSite: bg.registerSite, refreshOpenTabs: () => {} });
  assert.deepEqual([...port.chosenOrigins].sort(), [...origins].sort());
  assert.deepEqual(port.adoptionNotices, []);
});

test("lifecycle: onAdded while getAll is [] adopts nothing", async () => {
  const {mock, bg} = await startWorker();
  const port = bg.port;
  mock.chrome.permissions.getAll = async () => ({ origins: [] });
  await mock.listeners.onAddedPerm[0]({ origins: ["*://*.bank.com/*"] });
  assert.equal(port.chosenOrigins.has("https://bank.com"), false);
  assert.equal(port.offeredOrigins.includes("https://bank.com"), false);
});

test("lifecycle: remove throw keeps the decline", async () => {
  const {mock, bg, sandbox} = await startWorker({ chosenOrigins: ["https://bank.com"], paused: false, showPageIndicator: false });
  const port = bg.port;
  mock.grantedPermissions.add("*://*.bank.com/*");
  mock.chrome.permissions.remove = async () => { throw new Error("browser removal failed"); };
  const id = mock.chrome.runtime.id;
  const sender = { id, url: `chrome-extension://${id}/popup.html` };
  const deps = {
    runtimeId: id, port, setCfg: bg.setCfg, removeSiteOrigin: bg.removeSiteOrigin,
    unregisterSite: bg.unregisterSite, walkRemoveSiteGrant: bg.walkRemoveSiteGrant,
    checkCleanDeclines: bg.checkCleanDeclines,
  };
  await sandbox.SolstoneRouter.route({ cmd: "removeGrantedOrigin", origin: "https://bank.com" }, sender, deps);
  assert.ok(port.declinedHosts.includes("bank.com") || (port.ownerSites?.declinedHosts && port.ownerSites.declinedHosts.has("bank.com")));
});

test("lifecycle: pass between owner-remove and setCfg does not re-adopt", async () => {
  const {mock, bg, sandbox} = await startWorker({ chosenOrigins: ["https://bank.com"], paused: false, showPageIndicator: false });
  const port = bg.port;
  mock.grantedPermissions.add("*://*.bank.com/*");
  mock.chrome.permissions.remove = async () => false;
  const id = mock.chrome.runtime.id;
  const sender = { id, url: `chrome-extension://${id}/popup.html` };
  let declinedDuringSetCfg = false;
  const originalSetCfg = bg.setCfg;
  const deps = {
    runtimeId: id, port,
    setCfg: async (patch) => {
      declinedDuringSetCfg = port.declinedHosts.includes("bank.com");
      return originalSetCfg(patch);
    },
    removeSiteOrigin: bg.removeSiteOrigin, unregisterSite: bg.unregisterSite,
    walkRemoveSiteGrant: bg.walkRemoveSiteGrant, checkCleanDeclines: bg.checkCleanDeclines,
  };
  await sandbox.SolstoneRouter.route({ cmd: "removeGrantedOrigin", origin: "https://bank.com" }, sender, deps);
  assert.equal(declinedDuringSetCfg, true);
  await sandbox.SolstoneRouter.runAdoptionPass({ port, setCfg: bg.setCfg, registerSite: bg.registerSite, refreshOpenTabs: () => {} });
  assert.equal(sandbox.SolstoneHosts.siteForOrigin(port.chosenOrigins, "https://bank.com"), null);
});

test("lifecycle: end re-read clears the decline when no site grant covers the host", async () => {
  const {mock, bg, sandbox} = await startWorker({ chosenOrigins: ["https://bank.com"], paused: false, showPageIndicator: false });
  const port = bg.port;
  mock.grantedPermissions.add("*://*.bank.com/*");
  const id = mock.chrome.runtime.id;
  const sender = { id, url: `chrome-extension://${id}/popup.html` };
  const deps = {
    runtimeId: id, port, setCfg: bg.setCfg, removeSiteOrigin: bg.removeSiteOrigin,
    unregisterSite: bg.unregisterSite, walkRemoveSiteGrant: bg.walkRemoveSiteGrant,
    checkCleanDeclines: bg.checkCleanDeclines,
  };
  await sandbox.SolstoneRouter.route({ cmd: "removeGrantedOrigin", origin: "https://bank.com" }, sender, deps);
  assert.equal(port.declinedHosts.includes("bank.com"), false);
  assert.equal(port.ownerSites?.declinedHosts?.has("bank.com") ?? false, false);
});

test("lifecycle: *://*/* stays in selected mode reconciliation", async () => {
  const {mock, bg} = await startWorker({ chosenOrigins: ["https://example.com"], paused: false, showPageIndicator: false, siteMode: "selected" });
  mock.grantedPermissions.add("*://*/*");
  let removedAny = false;
  mock.chrome.permissions.remove = async () => { removedAny = true; return true; };
  await bg.runReconcile();
  assert.equal(removedAny, false);
  assert.equal(mock.grantedPermissions.has("*://*/*"), true);
});

test("lifecycle: login.bank.com keeps *://*.bank.com/* when bank.com is removed", async () => {
  const {mock, bg, sandbox} = await startWorker({ chosenOrigins: ["https://bank.com", "https://login.bank.com"], paused: false, showPageIndicator: false });
  mock.grantedPermissions.add("*://*.bank.com/*");
  const id = mock.chrome.runtime.id;
  const sender = { id, url: `chrome-extension://${id}/popup.html` };
  const deps = {
    runtimeId: id, port: bg.port, setCfg: bg.setCfg, removeSiteOrigin: bg.removeSiteOrigin,
    unregisterSite: bg.unregisterSite, walkRemoveSiteGrant: bg.walkRemoveSiteGrant,
    checkCleanDeclines: bg.checkCleanDeclines,
  };
  await sandbox.SolstoneRouter.route({ cmd: "removeGrantedOrigin", origin: "https://bank.com" }, sender, deps);
  assert.equal(mock.grantedPermissions.has("*://*.bank.com/*"), true);
  assert.equal(bg.port.chosenOrigins.has("https://login.bank.com"), true);
});

test("lifecycle: leave-out then include does not adopt www.example.com", async () => {
  const {mock, bg, sandbox} = await startWorker({ chosenOrigins: [], paused: false, showPageIndicator: false, siteMode: "selected" });
  const port = bg.port;
  mock.grantedPermissions.add("*://*.www.example.com/*");
  const id = mock.chrome.runtime.id;
  const sender = { id, url: `chrome-extension://${id}/popup.html` };
  const deps = {
    runtimeId: id, port, setCfg: bg.setCfg, walkRemoveSiteGrant: bg.walkRemoveSiteGrant,
    checkCleanDeclines: bg.checkCleanDeclines,
  };
  await sandbox.SolstoneRouter.route({ cmd: "setLeftOut", host: "example.com", out: true }, sender, deps);
  await sandbox.SolstoneRouter.route({ cmd: "setLeftOut", host: "example.com", out: false }, sender, deps);
  await sandbox.SolstoneRouter.runAdoptionPass({ port, setCfg: bg.setCfg, registerSite: bg.registerSite, refreshOpenTabs: () => {} });
  assert.equal(sandbox.SolstoneHosts.siteForOrigin(port.chosenOrigins, "https://www.example.com"), null);
});

test("lifecycle: failed include save stays left out", async () => {
  const {mock, bg, sandbox} = await startWorker({ chosenOrigins: [], excludedHosts: ["example.com"], paused: false, showPageIndicator: false });
  const port = bg.port;
  const id = mock.chrome.runtime.id;
  const sender = { id, url: `chrome-extension://${id}/popup.html` };
  const deps = {
    runtimeId: id, port,
    setCfg: async () => { throw new Error("storage failed"); },
  };
  const res = await sandbox.SolstoneRouter.route({ cmd: "setLeftOut", host: "example.com", out: false }, sender, deps);
  assert.equal(res.ok, false);
  assert.ok(port.excludedHosts.includes("example.com"));
});

test("lifecycle: setLeftOut makes originGranted false before any await", async () => {
  const {mock, bg, sandbox} = await startWorker({ chosenOrigins: ["https://bank.example"], paused: false, showPageIndicator: false });
  const port = bg.port;
  const id = mock.chrome.runtime.id;
  const sender = { id, url: `chrome-extension://${id}/popup.html` };
  const H = sandbox.SolstoneHosts;
  assert.equal(H.originGranted(port, "https://bank.example"), true);
  const leaving = sandbox.SolstoneRouter.route({ cmd: "setLeftOut", host: "bank.example", out: true }, sender, {
    runtimeId: id, port, setCfg: bg.setCfg, walkRemoveSiteGrant: bg.walkRemoveSiteGrant,
  });
  assert.equal(H.originGranted(port, "https://bank.example"), false);
  await leaving;
});

test("lifecycle: failed leave-out save keeps it false", async () => {
  const {mock, bg, sandbox} = await startWorker({ chosenOrigins: ["https://bank.example"], paused: false, showPageIndicator: false });
  const port = bg.port;
  const id = mock.chrome.runtime.id;
  const sender = { id, url: `chrome-extension://${id}/popup.html` };
  const H = sandbox.SolstoneHosts;
  const res = await sandbox.SolstoneRouter.route({ cmd: "setLeftOut", host: "bank.example", out: true }, sender, {
    runtimeId: id, port, setCfg: async () => { throw new Error("disk full"); },
    walkRemoveSiteGrant: bg.walkRemoveSiteGrant,
  });
  assert.equal(res.ok, false);
  assert.equal(H.originGranted(port, "https://bank.example"), false);
  assert.ok(port.excludedHosts.includes("bank.example"));
});

test("lifecycle: mail.google.com under google.com is not read and the row is left out, local or appLeftOut only", async () => {
  const {bg, sandbox} = await startWorker({ chosenOrigins: ["https://google.com"], paused: false, showPageIndicator: false, siteMode: "selected" });
  vm.runInNewContext(readExtFile("lib/copy.js"), sandbox);
  vm.runInNewContext(readExtFile("lib/popup_view.js"), sandbox);
  const port = bg.port;
  const H = sandbox.SolstoneHosts;
  const PV = sandbox.SolstonePopupView;
  port.leftOutCapable = true;

  port.excludedHosts = ["google.com"];
  port.appLeftOut = [];
  assert.equal(H.originGranted(port, "https://mail.google.com"), false);
  const v1 = PV.arrange(null, port.getStatus(), { ok: true, host: "mail.google.com", origin: "https://mail.google.com" });
  const pageSec1 = v1.find((s) => s.id === "page");
  assert.equal(pageSec1.state, "left out");
  assert.equal(pageSec1.siteAction?.id, "include-site");
  assert.equal(pageSec1.siteAction?.site, "google.com");

  port.excludedHosts = [];
  port.appLeftOut = ["google.com"];
  assert.equal(H.originGranted(port, "https://mail.google.com"), false);
  const v2 = PV.arrange(null, port.getStatus(), { ok: true, host: "mail.google.com", origin: "https://mail.google.com" });
  const pageSec2 = v2.find((s) => s.id === "page");
  assert.equal(pageSec2.state, "left out");
  assert.equal(pageSec2.siteAction?.id, "include-site");
  assert.equal(pageSec2.siteAction?.site, "google.com");
});

test("lifecycle: permissions.remove spy fires only for the allowlist", async () => {
  const {mock, bg, sandbox} = await startWorker({ chosenOrigins: ["https://site.example"], paused: false, showPageIndicator: false, siteMode: "selected" });
  const port = bg.port;
  const id = mock.chrome.runtime.id;
  const sender = { id, url: `chrome-extension://${id}/popup.html` };
  const removedPatterns = [];
  mock.chrome.permissions.remove = async ({ origins }) => {
    removedPatterns.push(...origins);
    return true;
  };
  const deps = {
    runtimeId: id, port, setCfg: bg.setCfg, removeSiteOrigin: bg.removeSiteOrigin,
    unregisterSite: bg.unregisterSite, walkRemoveSiteGrant: bg.walkRemoveSiteGrant,
    checkCleanDeclines: bg.checkCleanDeclines, updateSitePolicy: bg.updateSitePolicy,
  };

  mock.grantedPermissions.add("*://*.site.example/*");
  await sandbox.SolstoneRouter.route({ cmd: "removeGrantedOrigin", origin: "https://site.example" }, sender, deps);
  assert.ok(removedPatterns.includes("*://*.site.example/*"));

  mock.grantedPermissions.add("*://*.decline.example/*");
  port.offeredOrigins = ["https://decline.example"];
  await sandbox.SolstoneRouter.route({ cmd: "declineOffer", origin: "https://decline.example" }, sender, deps);
  assert.ok(removedPatterns.includes("*://*.decline.example/*"));

  mock.grantedPermissions.add("*://*.leaveout.example/*");
  await sandbox.SolstoneRouter.route({ cmd: "setLeftOut", host: "leaveout.example", out: true }, sender, deps);
  assert.ok(removedPatterns.includes("*://*.leaveout.example/*"));

  port.siteMode = "all";
  port.allSitesConsent = 1;
  mock.grantedPermissions.add("*://*/*");
  await sandbox.SolstoneRouter.route({ cmd: "setSiteMode", mode: "selected" }, sender, deps);
  assert.ok(removedPatterns.includes("*://*/*"));

  port.ownerSites = port.ownerSites || {};
  port.ownerSites.reservation = { pattern: "*://*/*", origin: null, expiresAt: port.now() - 1, broadAlreadyLive: false };
  await bg.runReconcile();
  assert.ok(removedPatterns.filter(p => p === "*://*/*").length >= 2);

  const countBefore = removedPatterns.filter(p => p === "*://*/*").length;
  port.ownerSites.reservation = { pattern: "*://*/*", origin: null, expiresAt: port.now() - 1, broadAlreadyLive: true };
  await bg.runReconcile();
  assert.equal(removedPatterns.filter(p => p === "*://*/*").length, countBefore);
});
