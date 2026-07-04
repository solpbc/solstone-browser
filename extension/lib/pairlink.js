// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

(function () {
  "use strict";

  const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  const DEFAULT_RELAY_ORIGIN = "https://link.solstone.app";
  const PAIR_INFO = "spl-pair-window-v1";

  function bytesToHex(bytes) {
    return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  function bytesFromHex(hex) {
    const s = String(hex || "");
    if (!/^(?:[0-9a-fA-F]{2})*$/.test(s)) throw new Error("invalid hex");
    return Uint8Array.from(s.match(/../g)?.map((x) => Number.parseInt(x, 16)) || []);
  }

  function bytesFrom(input) {
    if (input instanceof Uint8Array) return input;
    if (input instanceof ArrayBuffer) return new Uint8Array(input);
    if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    if (typeof input === "string") return bytesFromHex(input);
    throw new Error("expected bytes");
  }

  function encodeCrockford(bytes) {
    const b = bytesFrom(bytes);
    let out = "";
    let acc = 0;
    let bits = 0;
    for (const x of b) {
      acc = (acc << 8) | x;
      bits += 8;
      while (bits >= 5) {
        bits -= 5;
        out += ALPHABET[(acc >>> bits) & 31];
      }
    }
    if (bits) out += ALPHABET[(acc << (5 - bits)) & 31];
    return out;
  }

  function decodeCrockford(fragment) {
    const s = String(fragment || "").trim().toUpperCase();
    let acc = 0;
    let bits = 0;
    const out = [];
    for (const ch of s) {
      const v = ALPHABET.indexOf(ch);
      if (v < 0) throw new Error("invalid Crockford base32");
      acc = (acc << 5) | v;
      bits += 5;
      while (bits >= 8) {
        bits -= 8;
        out.push((acc >>> bits) & 255);
      }
    }
    return Uint8Array.from(out);
  }

  function buildBlob({ S, caFpSpki, relayOrigin = DEFAULT_RELAY_ORIGIN }) {
    const s = bytesFrom(S);
    const ca = bytesFrom(caFpSpki);
    if (s.byteLength !== 8) throw new Error("S must be 8 bytes");
    if (ca.byteLength !== 16) throw new Error("caFpSpki must be 16 bytes");
    let relay = new Uint8Array();
    let selector = 0;
    if (relayOrigin !== DEFAULT_RELAY_ORIGIN) {
      relay = new TextEncoder().encode(String(relayOrigin));
      if (relay.byteLength < 1 || relay.byteLength > 255) throw new Error("custom relay origin must be 1..255 bytes");
      selector = relay.byteLength;
    }
    const out = new Uint8Array(1 + 8 + 1 + 16 + 1 + relay.byteLength);
    let off = 0;
    out[off++] = 0x06;
    out.set(s, off); off += 8;
    out[off++] = 0x01;
    out.set(ca, off); off += 16;
    out[off++] = selector;
    out.set(relay, off);
    return out;
  }

  function fragmentFromBlob(blob) {
    return encodeCrockford(blob);
  }

  function linkFromBlob(blob, base = "https://go.solstone.app/p") {
    return `${base}#${fragmentFromBlob(blob)}`;
  }

  function fragmentFromLink(link) {
    const raw = String(link || "");
    const i = raw.indexOf("#");
    if (i < 0 || i === raw.length - 1) throw new Error("pair link missing fragment");
    return raw.slice(i + 1);
  }

  function parseLink(link) {
    const fragment = fragmentFromLink(link);
    const blob = decodeCrockford(fragment);
    if (blob.byteLength < 27) throw new Error("pair blob too short");
    let off = 0;
    const version = blob[off++];
    if (version !== 0x06) throw new Error("unsupported pair link version");
    const SBytes = blob.slice(off, off + 8); off += 8;
    const caFpTag = blob[off++];
    if (caFpTag !== 0x01) throw new Error("unsupported CA fingerprint tag");
    const caFpSpki = blob.slice(off, off + 16); off += 16;
    const selector = blob[off++];
    let relayOrigin = DEFAULT_RELAY_ORIGIN;
    if (selector !== 0) {
      if (blob.byteLength !== off + selector) throw new Error("custom relay origin length mismatch");
      relayOrigin = new TextDecoder("utf-8", { fatal: true }).decode(blob.slice(off, off + selector));
      off += selector;
    }
    if (off !== blob.byteLength) throw new Error("trailing pair link bytes");
    return {
      version,
      S: bytesToHex(SBytes),
      SBytes,
      caFpSpki,
      caFpSpkiHex: bytesToHex(caFpSpki),
      relayOrigin,
      fragment,
      blob,
    };
  }

  async function deriveRK(S) {
    const ikm = bytesFrom(S);
    if (ikm.byteLength !== 8) throw new Error("S must be 8 bytes");
    const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
      { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: new TextEncoder().encode(PAIR_INFO) },
      key,
      128,
    );
    return new Uint8Array(bits);
  }

  globalThis.SolstonePairlink = {
    DEFAULT_RELAY_ORIGIN,
    encodeCrockford,
    decodeCrockford,
    buildBlob,
    fragmentFromBlob,
    linkFromBlob,
    parseLink,
    deriveRK,
    bytesToHex,
    bytesFromHex,
  };
})();
