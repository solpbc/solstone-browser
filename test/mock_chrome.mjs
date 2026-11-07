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

export function createMockChrome(options = {}) {
  const opts = Object.assign({
    requestResolvesWithoutGrant: false,
    removeReturnsFalse: false,
    safariBroadest: false,
    firefoxCoveredRequest: false,
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
  const sentTabMessages = [];
  const tabsList = [{ id: 101, url: "https://example.com/page" }];

  return {
    listeners,
    storageData,
    registeredScripts,
    grantedPermissions,
    sentTabMessages,
    tabsList,
    options: opts,
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
        executeScript: async () => {
          if (opts.executeScriptRejects) throw new Error("executeScript rejected");
        },
      },
      permissions: {
        getAll: async () => {
          if (opts.getAllThrows) throw new Error("getAll threw");
          if (opts.getAllNonArray) return { origins: "not-an-array" };
          return { origins: Array.from(grantedPermissions) };
        },
        contains: async ({ origins }) => {
          return (origins || []).every((o) => grantedPermissions.has(o) || grantedPermissions.has("*://*/*"));
        },
        request: backgroundGestureRequest,
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
          get: async (key) => ({ [key]: storageData[key] }),
          set: async (obj) => {
            Object.assign(storageData, obj);
          },
        },
      },
    },
  };
}
