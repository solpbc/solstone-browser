// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

// One gesture rule. A background permissions.request is never inside a click.
// A page request is allowed only while a wrapped click listener is still in
// its synchronous stretch. The flag clears before that call returns to the test.

let gestureDepth = 0;

export const GESTURE_ERROR = "must be called during a user gesture";

export function armClick(listener) {
  if (typeof listener !== "function") return listener;
  return function armedClick(event) {
    gestureDepth += 1;
    try {
      return listener.call(this, event);
    } finally {
      gestureDepth -= 1;
    }
  };
}

export function backgroundGestureRequest() {
  throw new Error(GESTURE_ERROR);
}

export function pageGestureRequest(impl) {
  const inner = typeof impl === "function" ? impl : async () => true;
  return function request(details) {
    if (gestureDepth === 0) throw new Error(GESTURE_ERROR);
    return Promise.resolve(inner(details));
  };
}

function matchHasPort(pattern) {
  const match = /^[a-z*]+:\/\/([^/]+)/i.exec(String(pattern || ""));
  if (!match) return false;
  return /:\d+$/.test(match[1]);
}

function patternCovers(pattern, urlString) {
  let url;
  try { url = new URL(urlString); } catch (_e) { return false; }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  const raw = String(pattern || "").trim();
  if (raw === "*://*/*" || raw === "<all_urls>") return true;
  if (raw === "http://*/*") return url.protocol === "http:";
  if (raw === "https://*/*") return url.protocol === "https:";
  const match = /^(\*|https?):\/\/(\*\.)?([^/]+)\/\*$/.exec(raw);
  if (!match) return false;
  if (match[1] === "https" && url.protocol !== "https:") return false;
  if (match[1] === "http" && url.protocol !== "http:") return false;
  let host = match[3];
  let port = "";
  const colon = host.lastIndexOf(":");
  if (colon > 0 && /^\d+$/.test(host.slice(colon + 1)) && !host.slice(0, colon).includes(":")) {
    port = host.slice(colon + 1);
    host = host.slice(0, colon);
  }
  if (port) {
    const pagePort = url.port || (url.protocol === "https:" ? "443" : "80");
    if (pagePort !== port) return false;
  }
  const pageHost = url.hostname.toLowerCase();
  host = host.toLowerCase();
  if (match[2]) return pageHost === host || pageHost.endsWith(`.${host}`);
  return pageHost === host;
}

function isBroadPattern(pattern) {
  const raw = String(pattern || "").trim();
  return raw === "*://*/*" || raw === "<all_urls>" || raw === "http://*/*" || raw === "https://*/*";
}

function hostFromSitePattern(pattern) {
  const match = /^(?:\*|https?):\/\/(?:\*\.)?([^/*:]+)(?::\d+)?\/\*$/.exec(String(pattern || "").trim());
  if (!match || match[1] === "*") return null;
  return match[1].toLowerCase();
}

function sampleUrl(pattern) {
  const match = /^(\*|https?):\/\/(\*\.)?([^/]+)\/\*$/.exec(String(pattern || "").trim());
  if (!match) return null;
  const scheme = match[1] === "http" ? "http" : "https";
  const host = match[2] ? `login.${match[3]}` : match[3];
  return `${scheme}://${host}/`;
}

function presentScript(script) {
  const copy = { ...script, matches: [...(script.matches || [])].sort() };
  if (!copy.excludeMatches || copy.excludeMatches.length === 0) delete copy.excludeMatches;
  else copy.excludeMatches = [...copy.excludeMatches].sort();
  return copy;
}

export function createMockChrome(options = {}) {
  const opts = Object.assign({
    requestResolvesWithoutGrant: false,
    removeReturnsFalse: false,
    safariBroadest: false,
    firefoxCoveredRequest: false,
    refuseSiteRequest: false,
    executeScriptRejects: false,
    omitPermissionEvents: false,
    getAllThrows: false,
    getAllNonArray: false,
  }, options);

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
  const refusedHosts = new Set();
  const sentTabMessages = [];
  const tabsList = [{ id: 101, url: "https://example.com/page" }];
  const heldChannels = new Map();

  function heldState(channel) {
    let state = heldChannels.get(channel);
    if (!state) {
      state = { armed: false, pending: [], waiters: [] };
      heldChannels.set(channel, state);
    }
    return state;
  }

  function deliverHeld(state) {
    while (state.waiters.length > 0) {
      const item = state.pending.find((entry) => !entry.issued);
      if (!item) return;
      item.issued = true;
      state.waiters.shift()(item.handle);
    }
  }

  // A held call reads its result when that call is released.
  function blockCall(channel, run) {
    const state = heldState(channel);
    if (!state.armed) return run();
    return new Promise((resolve, reject) => {
      const item = { issued: false, handle: null };
      item.handle = {
        release() {
          Promise.resolve().then(run).then(resolve, reject);
        },
      };
      state.pending.push(item);
      deliverHeld(state);
    });
  }

  return {
    listeners,
    storageData,
    registeredScripts,
    grantedPermissions,
    sentTabMessages,
    tabsList,
    options: opts,
    hold(channel) {
      heldState(channel).armed = true;
      if (channel === "tabs.get" && typeof this.chrome.tabs.get !== "function") {
        this.chrome.tabs.get = (tabId) => blockCall("tabs.get", async () => {
          if (!tabsList.some((tab) => tab.id === tabId)) return undefined;
          return { id: tabId, windowId: 1 };
        });
      }
    },
    held(channel) {
      const state = heldState(channel);
      const item = state.pending.find((entry) => !entry.issued);
      if (item) {
        item.issued = true;
        return Promise.resolve(item.handle);
      }
      return new Promise((resolve) => {
        state.waiters.push(resolve);
      });
    },
    unhold(channel) {
      heldState(channel).armed = false;
    },
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
          const tabs = tabsList.map((tab) => {
            const copy = { ...tab };
            if (!copy.url) return copy;
            const covered = [...grantedPermissions].some((pattern) => patternCovers(pattern, copy.url));
            if (!covered) delete copy.url;
            return copy;
          });
          if (typeof cb === "function") cb(tabs);
          return Promise.resolve(tabs);
        },
        sendMessage: (tabId, msg, opts, cb) => {
          const options = opts && typeof opts === "object" ? opts : null;
          const callback = typeof opts === "function" ? opts : cb;
          const run = () => {
            sentTabMessages.push({ tabId, msg });
            if (callback) callback();
          };
          if (options && Object.hasOwn(options, "frameId") && heldState("tabs.sendMessage").armed) {
            return blockCall("tabs.sendMessage", run);
          }
          run();
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
          for (const script of scripts) {
            const listed = [...(script.matches || []), ...(script.excludeMatches || [])];
            if (listed.some(matchHasPort)) throw new Error("Invalid match pattern");
            if (registeredScripts.has(script.id)) throw new Error("Duplicate script ID");
          }
          for (const script of scripts) registeredScripts.set(script.id, script);
        },
        unregisterContentScripts: async ({ ids }) => {
          for (const id of ids) registeredScripts.delete(id);
        },
        getRegisteredContentScripts: async ({ ids } = {}) => {
          const scripts = ids ? ids.map((id) => registeredScripts.get(id)).filter(Boolean) : [...registeredScripts.values()];
          return scripts.map(presentScript);
        },
        executeScript: async () => {
          if (opts.executeScriptRejects) throw new Error("executeScript rejected");
        },
      },
      permissions: {
        getAll: () => blockCall("permissions.getAll", async () => {
          if (opts.getAllThrows) throw new Error("getAll threw");
          if (opts.getAllNonArray) return { origins: "not-an-array" };
          return { origins: Array.from(grantedPermissions) };
        }),
        contains: async ({ origins }) => {
          return (origins || []).every((o) => grantedPermissions.has(o) || grantedPermissions.has("*://*/*"));
        },
        request: (details) => {
          const profile = opts.safariBroadest || opts.firefoxCoveredRequest || opts.refuseSiteRequest;
          if (!profile) {
            if (opts.requestResolvesWithoutGrant) return Promise.resolve(true);
            return backgroundGestureRequest(details);
          }
          const origins = Array.isArray(details?.origins) ? details.origins : [];
          const sites = origins.filter((origin) => !isBroadPattern(origin));
          const covered = (origin) => {
            const sample = sampleUrl(origin);
            if (!sample) return false;
            return [...grantedPermissions].some((have) => patternCovers(have, sample));
          };
          if (opts.refuseSiteRequest && sites.length > 0 && !origins.some(isBroadPattern)) {
            for (const origin of sites) {
              const host = hostFromSitePattern(origin);
              if (host) refusedHosts.add(host);
            }
            return Promise.resolve(false);
          }
          if ((opts.safariBroadest || opts.firefoxCoveredRequest) && sites.length > 0 &&
              !origins.some(isBroadPattern) && sites.every(covered)) {
            return Promise.resolve(true);
          }
          if (opts.safariBroadest && origins.some((origin) => origin === "*://*/*" || origin === "<all_urls>")) {
            for (const have of [...grantedPermissions]) {
              if (!isBroadPattern(have)) grantedPermissions.delete(have);
            }
            grantedPermissions.add(origins.includes("*://*/*") ? "*://*/*" : "<all_urls>");
            return Promise.resolve(true);
          }
          for (const origin of origins) {
            if (isBroadPattern(origin)) {
              grantedPermissions.add(origin);
              continue;
            }
            const host = hostFromSitePattern(origin);
            if (host && refusedHosts.has(host)) continue;
            if ((opts.safariBroadest || opts.firefoxCoveredRequest) && covered(origin)) continue;
            grantedPermissions.add(origin);
          }
          return Promise.resolve(true);
        },
        remove: async ({ origins }) => {
          if (opts.removeReturnsFalse) return false;
          for (const o of origins || []) grantedPermissions.delete(o);
          if (!opts.omitPermissionEvents) {
            for (const fn of listeners.onRemovedPerm) fn({ origins });
          }
          return true;
        },
        onRemoved: { addListener: (fn) => listeners.onRemovedPerm.push(fn) },
        onAdded: { addListener: (fn) => listeners.onAddedPerm.push(fn) },
      },
      storage: {
        local: {
          get: (key) => {
            if (key === "inst") return blockCall("storage.local.get", async () => ({ inst: storageData.inst }));
            return Promise.resolve({ [key]: storageData[key] });
          },
          set: async (obj) => {
            Object.assign(storageData, obj);
          },
        },
      },
    },
  };
}
