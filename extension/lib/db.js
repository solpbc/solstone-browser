// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

(function () {
  "use strict";

  const DB_NAME = "solstone-browser";
  const DB_VERSION = 1;
  let memo = null;

  function open() {
    if (memo) return memo;
    memo = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("identity")) db.createObjectStore("identity");
        if (!db.objectStoreNames.contains("outbox")) db.createObjectStore("outbox", { keyPath: "id", autoIncrement: true });
        if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta");
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        memo = null;
        reject(req.error);
      };
      req.onblocked = () => {
        memo = null;
        reject(new Error("IndexedDB open blocked"));
      };
    });
    return memo;
  }

  async function tx(store, mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      const os = t.objectStore(store);
      let result;
      t.oncomplete = () => resolve(result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error("IndexedDB transaction aborted"));
      try {
        result = fn(os, t);
      } catch (e) {
        t.abort();
        reject(e);
      }
    });
  }

  async function request(store, mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      const req = fn(t.objectStore(store));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  const get = (store, key) => request(store, "readonly", (os) => os.get(key));
  const put = (store, val, key) => request(store, "readwrite", (os) => (key === undefined ? os.put(val) : os.put(val, key)));
  const del = (store, key) => request(store, "readwrite", (os) => os.delete(key));
  const getAll = (store) => request(store, "readonly", (os) => os.getAll());
  const add = (store, val) => request(store, "readwrite", (os) => os.add(val));
  const clear = (store) => request(store, "readwrite", (os) => os.clear());

  globalThis.SolstoneDB = { DB_NAME, DB_VERSION, open, get, put, del, getAll, add, clear, tx };
})();
