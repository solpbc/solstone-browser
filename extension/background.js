// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

if (typeof importScripts === "function") {
  importScripts(
    "native-browser/constants.js",
    "native-browser/schemas.js",
    "native-browser/schema-validator.js",
    "native-browser/codec.js",
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
  grantedOrigins: [],
};

let port = null;
let initPromise = null;
let badgeEpoch = 0;
const statusPorts = new Set();

async function getCfg() {
  const r = await chrome.storage.local.get("cfg");
  const stored = r.cfg || {};
  return {
    paused: !!stored.paused,
    showPageIndicator: !!stored.showPageIndicator,
    grantedOrigins: Array.isArray(stored.grantedOrigins) ? stored.grantedOrigins : [],
  };
}

let cfgChain = Promise.resolve();
function setCfg(patch) {
  cfgChain = cfgChain.then(async () => {
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

  let prefix = "icon-offline-";
  let badge = "";

  if (status.hostDelivery === "failed") {
    prefix = "icon-error-";
    badge = "!";
  } else if (!status.connected || status.hostCapture == null || status.hostCapture === "unavailable") {
    prefix = "icon-offline-";
    badge = "";
  } else if (
    status.pressure?.active ||
    status.lossNotice != null ||
    status.siteRejection != null
  ) {
    prefix = "icon-attention-";
    badge = "!";
  } else if (
    status.paused ||
    status.consentVersion !== 1 ||
    status.grantedOrigins.length === 0 ||
    !status.gate?.open ||
    ["paused", "intake_off", "not_paired"].includes(status.hostCapture)
  ) {
    prefix = "icon-paused-";
    badge = "";
  } else if (status.gate?.open) {
    prefix = "icon";
    badge = "";
  }

  try {
    await chrome.action.setIcon({ path: ICON_SET(prefix) });
    await chrome.action.setBadgeText({ text: badge });
    if (badge) await chrome.action.setBadgeBackgroundColor({ color: "#9F2D2D" });
    await chrome.action.setTitle({ title: "solstone" });
  } catch (_e) {
    /* action API unavailable */
  }

  if (badgeEpoch !== currentBadgeEpoch) return;

  for (const sp of statusPorts) {
    try {
      sp.postMessage({ type: "status", status });
    } catch (_e) {
      statusPorts.delete(sp);
    }
  }

  broadcastLeaseUpdate(status);
}

function broadcastLeaseUpdate(status) {
  if (!status) return;
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs || []) {
      if (tab.id == null) continue;
      chrome.tabs.sendMessage(
        tab.id,
        {
          kind: "leaseUpdate",
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
          connectionGeneration: port?.connectionGeneration || 0,
          connectionToken: port?.connectionToken || null,
        },
        () => void chrome.runtime.lastError
      );
    }
  });
}

function broadcastPause(paused) {
  chrome.tabs.query({}, (tabs) => {
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
      throw error;
    }
    if (!Failures.contentScriptRegistrationSatisfied(id, registered)) throw error;
  }

  try {
    const tabs = await chrome.tabs.query({ url: pattern });
    for (const tab of tabs) {
      if (tab.id == null) continue;
      try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: CONTENT_SCRIPT_FILES });
      } catch (_e) {
        /* restricted page */
      }
    }
  } catch (_e) {
    /* host permission not yet effective */
  }
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
    const hasSibling = Array.from(port.grantedOrigins).some((o) => {
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

  const actions = Reconcile.reconcile({
    granted,
    manifestOrigins: [],
    exemptOrigins: [],
    allowlist: cfg.grantedOrigins.map((o) => {
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

  if (!port) {
    port = new PortController({
      inst,
      manifestVersion: VERSION,
      requestSnapshots,
      onStatusChange: (status) => updateBadge(status),
    });
  } else {
    port.inst = inst;
    port.requestSnapshots = requestSnapshots;
  }

  port.consentVersion = consentVersion;
  port.everConnected = everConnected;
  port.paused = cfg.paused;
  port.showPageIndicator = cfg.showPageIndicator;

  let permittedOrigins = [];
  try {
    const perms = await chrome.permissions.getAll();
    permittedOrigins = perms.origins || [];
  } catch (_e) {
    permittedOrigins = [];
  }

  const liveGranted = new Set();
  const missingPatterns = [];

  for (const origin of cfg.grantedOrigins) {
    try {
      const u = new URL(origin);
      const pattern = H.matchPatternFor(u.host);
      if (permittedOrigins.includes(pattern)) {
        liveGranted.add(origin);
        await registerSite(u.host);
      } else {
        missingPatterns.push(pattern);
      }
    } catch (_e) {
      /* ignore */
    }
  }

  port.grantedOrigins = liveGranted;
  if (missingPatterns.length > 0) {
    port.drift = { patterns: missingPatterns };
  } else {
    port.drift = null;
  }

  const cap = await Outbox.getCapacityStatus().catch(() => ({ pressure: { active: false } }));
  if (cap) port.pressure = cap.pressure;

  await Outbox.retireExpired(port.now(), Date.now()).catch(() => {});
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

chrome.permissions.onRemoved.addListener((details) => {
  const removedPatterns = details?.origins || [];
  if (port) {
    const toRemove = [];
    for (const origin of port.grantedOrigins) {
      try {
        const u = new URL(origin);
        const hostPattern = H.matchPatternFor(u.host);
        if (removedPatterns.includes(hostPattern)) {
          toRemove.push(origin);
        }
      } catch (_e) {}
    }
    for (const o of toRemove) {
      port.grantedOrigins.delete(o);
    }
    port.drift = { patterns: removedPatterns };
    chrome.tabs.query({}, (tabs) => {
      for (const tab of tabs || []) {
        if (tab.id != null) {
          chrome.tabs.sendMessage(tab.id, { kind: "permissionRemoved" }, () => void chrome.runtime.lastError);
        }
      }
    });
    setCfg({ grantedOrigins: Array.from(port.grantedOrigins) }).catch(() => {});
  }
  runReconcile().catch(() => {});
});

chrome.permissions.onAdded.addListener(() => {
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
