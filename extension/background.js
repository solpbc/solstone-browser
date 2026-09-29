// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

if (typeof importScripts === "function") {
  importScripts(
    "native-browser/constants.js",
    "native-browser/schemas.js",
    "native-browser/schema-validator.js",
    "native-browser/codec.js",
    "lib/copy.js",
    "lib/uuid.js",
    "lib/db.js",
    "lib/blocks.js",
    "lib/hosts.js",
    "lib/failures.js",
    "lib/reconcile.js",
    "lib/segment.js",
    "lib/gate.js",
    "lib/native_outbox.js",
    "lib/native_port.js",
    "lib/status.js",
    "lib/router.js"
  );
}

const H = globalThis.SolstoneHosts;
const DB = globalThis.SolstoneDB;
const Failures = globalThis.SolstoneFailures;
const Reconcile = globalThis.SolstoneReconcile;
const Uuid = globalThis.SolstoneUuid;
const Router = globalThis.SolstoneRouter;
const PortController = globalThis.SolstoneNativePort;
const Outbox = globalThis.SolstoneNativeOutbox;
const Status = globalThis.SolstoneStatus;

const VERSION = "0.2.0";
const ALARM_NAME = "native-port";

const CONTENT_SCRIPT_FILES = [
  "native-browser/constants.js",
  "native-browser/schemas.js",
  "native-browser/schema-validator.js",
  "native-browser/codec.js",
  "lib/blocks.js",
  "lib/hosts.js",
  "adapters.js",
  "skim.js",
  "indicator.js",
  "lib/gate.js",
  "content.js",
];

const DEFAULT_CFG = {
  paused: false,
  showPageIndicator: false,
  chosenOrigins: [],
};

let port = null;
let initPromise = null;
let permissionEpoch = 0;
let badgeEpoch = 0;
let badgeChain = Promise.resolve();
const statusPorts = new Set();

async function getCfg() {
  const r = await chrome.storage.local.get("cfg");
  const stored = r.cfg || {};
  let chosenOrigins = stored.chosenOrigins;
  if (!Array.isArray(chosenOrigins)) {
    chosenOrigins = Array.isArray(stored.grantedOrigins) ? stored.grantedOrigins : [];
    const next = {
      paused: !!stored.paused,
      showPageIndicator: !!stored.showPageIndicator,
      chosenOrigins,
    };
    await chrome.storage.local.set({ cfg: next });
    return next;
  }
  return {
    paused: !!stored.paused,
    showPageIndicator: !!stored.showPageIndicator,
    chosenOrigins,
  };
}

let cfgChain = Promise.resolve();
function setCfg(patch) {
  cfgChain = cfgChain.catch(() => {}).then(async () => {
    const current = await getCfg();
    const next = Object.assign({}, current, patch);
    await chrome.storage.local.set({ cfg: next });
    return next;
  });
  return cfgChain;
}

const ICON_SET = (prefix) => ({
  16: `icons/${prefix}16.png`,
  48: `icons/${prefix}48.png`,
  128: `icons/${prefix}128.png`,
});

async function updateBadge(status) {
  badgeEpoch++;
  const currentBadgeEpoch = badgeEpoch;

  if (!status && port) status = port.getStatus();
  if (!status) return;

  const iconInfo = Status && Status.iconState
    ? Status.iconState(status)
    : { prefix: "icon-offline-", badge: "", title: "solstone" };

  const prefix = iconInfo.prefix;
  const badge = iconInfo.badge || "";
  const title = iconInfo.title || "solstone";

  // Authority publication never waits for browser action painting.
  for (const sp of statusPorts) {
    try { sp.postMessage({ type: "status", status }); }
    catch (_e) { statusPorts.delete(sp); }
  }
  broadcastLeaseUpdate(status, currentBadgeEpoch);
  badgeChain = badgeChain.catch(() => {}).then(async () => {
    if (badgeEpoch !== currentBadgeEpoch) return;
    await chrome.action.setIcon({ path: ICON_SET(prefix) });
    if (badgeEpoch !== currentBadgeEpoch) return;
    await chrome.action.setBadgeText({ text: badge });
    if (badgeEpoch !== currentBadgeEpoch) return;
    if (badge) await chrome.action.setBadgeBackgroundColor({ color: "#9F2D2D" });
    if (badgeEpoch !== currentBadgeEpoch) return;
    await chrome.action.setTitle({ title });
  });
  await badgeChain.catch(() => {});
}

function broadcastLeaseUpdate(status, epoch = badgeEpoch) {
  if (!status) return;
  chrome.tabs.query({}, (tabs) => {
    if (epoch !== badgeEpoch) return;
    for (const tab of tabs || []) {
      if (tab.id == null) continue;
      chrome.tabs.sendMessage(
        tab.id,
        {
          kind: "leaseUpdate",
          captureEpoch: status.captureEpoch,
          lease: status.lease,
          paused: status.paused,
          consentVersion: status.consentVersion,
          grantedOrigins: status.grantedOrigins || [],
          showIndicator: status.showPageIndicator,
          hostCapture: status.hostCapture,
          hostDelivery: status.hostDelivery,
          hostFailure: status.hostFailure,
          custody: status.custody,
          pressure: status.pressure,
          capturePermitted: status.capturePermitted === true,
          destinationGeneration: status.destinationGeneration,
          connectionGeneration: status.connectionGeneration || 0,
          connectionToken: status.connectionToken || null,
        },
        () => void chrome.runtime.lastError
      );
    }
  });
}

function broadcastPause(paused) {
  const epoch = badgeEpoch;
  chrome.tabs.query({}, (tabs) => {
    if (epoch !== badgeEpoch || port?.paused !== paused) return;
    for (const tab of tabs || []) {
      if (tab.id == null) continue;
      chrome.tabs.sendMessage(tab.id, { kind: "setPaused", paused }, () => void chrome.runtime.lastError);
    }
  });
}

function broadcastIndicator(show) {
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs || []) {
      if (tab.id == null) continue;
      chrome.tabs.sendMessage(tab.id, { kind: "setIndicator", show }, () => void chrome.runtime.lastError);
    }
  });
}

function requestSnapshots() {
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs || []) {
      if (tab.id == null) continue;
      chrome.tabs.sendMessage(tab.id, { kind: "resnapshot" }, () => void chrome.runtime.lastError);
    }
  });
}

async function registerSite(host) {
  const matchHost = H.matchHostFor(host);
  const id = "cs-" + matchHost;
  const pattern = H.matchPatternFor(host);

  try {
    await chrome.scripting.unregisterContentScripts({ ids: [id] });
  } catch (_e) {
    /* not registered */
  }

  try {
    await chrome.scripting.registerContentScripts([
      {
        id,
        matches: [pattern],
        js: CONTENT_SCRIPT_FILES,
        runAt: "document_idle",
        allFrames: true,
        persistAcrossSessions: true,
      },
    ]);
  } catch (error) {
    let registered = [];
    try {
      registered = await chrome.scripting.getRegisteredContentScripts({ ids: [id] });
    } catch (_e) {
      return "failed";
    }
    if (!Failures.contentScriptRegistrationSatisfied(id, registered)) return "failed";
  }

  let hadTabError = false;
  try {
    const tabs = await chrome.tabs.query({ url: pattern });
    for (const tab of tabs) {
      if (tab.id == null) continue;
      try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: CONTENT_SCRIPT_FILES });
      } catch (_e) {
        hadTabError = true;
      }
    }
  } catch (_e) {
    /* host permission not yet effective */
  }

  return hadTabError ? "reload" : "ready";
}

async function removeSiteOrigin(exactOrigin) {
  let host = "";
  try {
    host = new URL(exactOrigin).host;
  } catch (_e) {
    return;
  }

  const matchHost = H.matchHostFor(host);
  if (port) {
    const hasSibling = Array.from(port.chosenOrigins || []).some((o) => {
      try { return H.matchHostFor(new URL(o).host) === matchHost; } catch (_e) { return false; }
    });
    if (!hasSibling) {
      await unregisterSite(host);
    }
  } else {
    await unregisterSite(host);
  }
}

async function unregisterSite(host) {
  const matchHost = H.matchHostFor(host);
  try {
    await chrome.scripting.unregisterContentScripts({ ids: ["cs-" + matchHost] });
  } catch (_e) {
    /* not registered */
  }

  try {
    const tabs = await chrome.tabs.query({ url: H.matchPatternFor(matchHost) });
    for (const tab of tabs) {
      if (tab.id != null) {
        chrome.tabs.sendMessage(tab.id, { kind: "stop" }, () => void chrome.runtime.lastError);
        Router.destroyBinding(tab.id);
      }
    }
  } catch (_e) {
    /* ignore */
  }

  try {
    await chrome.permissions.remove({ origins: [H.matchPatternFor(matchHost)] });
  } catch (_e) {
    /* ignore */
  }
}

async function runReconcile() {
  const cfg = await getCfg();
  let granted = null;
  try {
    const perms = await chrome.permissions.getAll();
    granted = perms.origins || [];
  } catch (_e) {
    return [];
  }

  const exemptPatterns = (port?.pendingIntent && port.now() < port.pendingIntent.expiresAt)
    ? [port.pendingIntent.pattern]
    : [];

  const actions = Reconcile.reconcile({
    granted,
    manifestOrigins: [],
    exemptOrigins: [],
    exemptPatterns,
    allowlist: (cfg.chosenOrigins || []).map((o) => {
      try { return new URL(o).host; } catch (_e) { return o; }
    }),
    pausedHosts: {},
  });

  for (const action of actions) {
    if (action.op === "release") {
      try {
        await chrome.permissions.remove({ origins: [action.origin] });
      } catch (_e) {
        /* ignore */
      }
    }
  }
  return actions;
}

async function doInit() {
  await chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });

  let inst = await DB.get("meta", "inst");
  if (!inst) {
    const random = new Uint8Array(10);
    crypto.getRandomValues(random);
    const newInst = Uuid.uuidv7String(Uuid.uuidv7Bytes(Date.now(), random));
    await DB.put("meta", newInst, "inst");
    inst = newInst;
  }

  const consentVersion = (await DB.get("meta", "consentVersion")) || 0;
  const everConnected = !!(await DB.get("meta", "everConnected"));
  const cfg = await getCfg();
  const lossNotice = await DB.get("meta", "lossNotice");
  const storedNotices = (await DB.get("meta", "siteNotices"))?.items || [];

  let platform = "";
  try {
    if (typeof chrome !== "undefined" && chrome.runtime?.getPlatformInfo) {
      const info = await chrome.runtime.getPlatformInfo();
      platform = info?.os || "";
    }
  } catch (_e) {}

  if (!port) {
    await DB.clear("producer");
    port = new PortController({
      inst,
      platform,
      manifestVersion: VERSION,
      requestSnapshots,
      onStatusChange: (status) => updateBadge(status),
    });
  } else {
    port.inst = inst;
    port.platform = platform;
    port.requestSnapshots = requestSnapshots;
  }

  port.siteNotices = storedNotices;
  port.consentVersion = consentVersion;
  port.lossNotice = lossNotice || null;
  port.everConnected = everConnected;
  port.paused = cfg.paused;
  port.showPageIndicator = cfg.showPageIndicator;
  port.chosenOrigins = new Set(cfg.chosenOrigins || []);

  port.permissionEpoch = permissionEpoch;
  let permissionsSettled = false;
  for (let attempt = 0; attempt < 3; attempt++) {
    const epoch = permissionEpoch;
    const latestCfg = await getCfg();
    const perms = await chrome.permissions.getAll();
    if (epoch !== permissionEpoch) continue;
    const liveGranted = new Set();
    const missingPatterns = [];
    for (const origin of latestCfg.chosenOrigins) {
      try {
        const u = new URL(origin);
        const pattern = H.matchPatternFor(u.host);
        if (perms.origins?.includes(pattern) || perms.origins?.includes("*://*/*")) {
          liveGranted.add(origin);
          const regRes = await registerSite(u.host);
          if (regRes === "failed") {
            await port.setSiteNotice(origin, "registration", "failed");
          } else if (regRes === "reload") {
            await port.setSiteNotice(origin, "registration", "reload");
          } else {
            await port.clearRegistrationNotice(origin);
          }
        } else {
          missingPatterns.push(pattern);
        }
      } catch (_e) {}
      if (epoch !== permissionEpoch) break;
    }
    if (epoch !== permissionEpoch) continue;
    port.chosenOrigins = new Set(latestCfg.chosenOrigins);
    port.grantedOrigins = liveGranted;
    port.drift = missingPatterns.length ? { patterns: Array.from(new Set(missingPatterns)).sort() } : null;
    permissionsSettled = true;
    break;
  }
  if (!permissionsSettled) throw new Error("permissions_changed_during_init");

  await Outbox.retireExpired(port.now(), Date.now());
  port.lossNotice = (await DB.get("meta", "lossNotice")) || null;
  const cap = await Outbox.getCapacityStatus();
  port.pressure = cap.pressure;
  await runReconcile().catch(() => {});
  port.connect();
  updateBadge();
  return port;
}

function ensureInit() {
  if (!initPromise) {
    initPromise = doInit().catch((err) => {
      initPromise = null;
      throw err;
    });
  }
  return initPromise;
}

// Register all listeners synchronously during evaluation
chrome.runtime.onConnect.addListener((p) => {
  if (p.name === "status") {
    if (!Router.isExtensionPageSender(p.sender, chrome.runtime.id)) {
      try { p.disconnect(); } catch (_e) {}
      return;
    }
    statusPorts.add(p);
    ensureInit().then(() => {
      if (port) p.postMessage({ type: "status", status: port.getStatus() });
    }).catch(() => {});
    p.onDisconnect.addListener(() => {
      statusPorts.delete(p);
    });
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  ensureInit().then(() => {
    const deps = {
      port,
      setCfg,
      registerSite,
      unregisterSite,
      removeSiteOrigin,
      broadcastPause,
      broadcastIndicator,
    };
    return Router.route(msg, sender, deps);
  }).then(sendResponse, (err) => {
    sendResponse({ ok: false, error: (err && err.message) || "internal_error" });
  });
  return true;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  Router.destroyBinding(tabId);
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    ensureInit().then(async () => {
      if (port) {
        await port.poll();
      }
      await runReconcile().catch(() => {});
    }).catch(() => {});
  }
});

chrome.permissions.onRemoved.addListener(async (details) => {
  const removedPatterns = details?.origins || [];
  permissionEpoch++;
  if (port) {
    port.permissionEpoch = permissionEpoch;
    const toRemove = [];
    for (const origin of port.grantedOrigins) {
      try {
        const u = new URL(origin);
        const hostPattern = H.matchPatternFor(u.host);
        if (removedPatterns.some((pattern) => {
          if (pattern === "<all_urls>" || pattern === hostPattern) return true;
          const match = /^(\*|https?):\/\/([^/]+)\//.exec(pattern);
          if (!match || (match[1] !== "*" && match[1] + ":" !== u.protocol)) return false;
          const host = match[2];
          return host === "*" || host === u.hostname ||
            (host.startsWith("*.") && (u.hostname === host.slice(2) || u.hostname.endsWith(host.slice(1))));
        })) {
          toRemove.push(origin);
        }
      } catch (_e) {}
    }
    for (const o of toRemove) {
      port.grantedOrigins.delete(o);
    }
    const perms = await chrome.permissions.getAll().catch(() => ({ origins: [] }));
    const missing = [];
    for (const o of port.chosenOrigins) {
      try {
        const pat = H.matchPatternFor(new URL(o).host);
        if (!perms.origins?.includes(pat) && !perms.origins?.includes("*://*/*")) {
          missing.push(pat);
        }
      } catch (_e) {}
    }
    port.drift = missing.length ? { patterns: Array.from(new Set(missing)).sort() } : null;
    port.notify();
  }
  runReconcile().catch(() => {});
});

chrome.permissions.onAdded.addListener(async (details) => {
  const addedPatterns = details?.origins || [];
  const isPendingMatch = port?.pendingIntent && port.now() < port.pendingIntent.expiresAt &&
    addedPatterns.length > 0 && addedPatterns.every((p) => p === port.pendingIntent.pattern);

  if (!isPendingMatch) {
    permissionEpoch++;
    if (port) port.permissionEpoch = permissionEpoch;
  }

  if (port) {
    const perms = await chrome.permissions.getAll().catch(() => ({ origins: [] }));
    for (const o of port.chosenOrigins) {
      try {
        const u = new URL(o);
        const pat = H.matchPatternFor(u.host);
        if (perms.origins?.includes(pat) || perms.origins?.includes("*://*/*")) {
          port.grantedOrigins.add(o);
          registerSite(u.host).catch(() => {});
        }
      } catch (_e) {}
    }
    const missing = [];
    for (const o of port.chosenOrigins) {
      try {
        const pat = H.matchPatternFor(new URL(o).host);
        if (!perms.origins?.includes(pat) && !perms.origins?.includes("*://*/*")) {
          missing.push(pat);
        }
      } catch (_e) {}
    }
    port.drift = missing.length ? { patterns: Array.from(new Set(missing)).sort() } : null;
    port.notify();
  }
  runReconcile().catch(() => {});
});

function init() {
  return ensureInit();
}

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    try {
      chrome.runtime.openOptionsPage();
    } catch (_e) {}
  }
  init();
});

chrome.runtime.onStartup.addListener(init);
chrome.runtime.onUpdateAvailable?.addListener(() => {
  if (!port) return;
  port.updateCheck = "update-available";
  port.notify();
});

// Start initialization once after listeners are registered
init();

globalThis.SolstoneBackground = {
  doInit,
  ensureInit,
  updateBadge,
  registerSite,
  unregisterSite,
  removeSiteOrigin,
  runReconcile,
  getCfg,
  setCfg,
  get port() { return port; },
};
