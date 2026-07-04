// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

(function () {
  "use strict";

  const DB = globalThis.SolstoneDB;
  let memo = null;

  function hex(bytes) {
    return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  async function loadStored() {
    const privateKey = await DB.get("identity", "privateKey");
    const publicKey = await DB.get("identity", "publicKey");
    if (!privateKey || !publicKey) return null;
    return { privateKey, publicKey };
  }

  async function storePair(kp) {
    await DB.put("identity", kp.privateKey, "privateKey");
    await DB.put("identity", kp.publicKey, "publicKey");
  }

  async function materialize(kp) {
    const spki = new Uint8Array(await crypto.subtle.exportKey("spki", kp.publicKey));
    const senderFp = new Uint8Array(await crypto.subtle.digest("SHA-256", spki));
    return { privateKey: kp.privateKey, publicKey: kp.publicKey, spki, senderFp };
  }

  async function ensureIdentity() {
    if (memo) return memo;
    memo = (async () => {
      let kp = await loadStored();
      if (!kp) {
        kp = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
        await storePair(kp);
      }
      return materialize(kp);
    })();
    return memo;
  }

  async function senderFpHex() {
    return hex((await ensureIdentity()).senderFp);
  }

  globalThis.SolstoneIdentity = { ensureIdentity, senderFpHex };
})();
