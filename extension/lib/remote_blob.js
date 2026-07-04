// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

(function () {
  "use strict";

  const TE = new TextEncoder();
  const TD = new TextDecoder();

  function bytesFrom(input, name) {
    if (input instanceof Uint8Array) return input;
    if (input instanceof ArrayBuffer) return new Uint8Array(input);
    if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    throw new Error(`${name || "value"} must be bytes`);
  }

  function concat(parts) {
    const total = parts.reduce((n, p) => n + p.byteLength, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const p of parts) {
      out.set(p, off);
      off += p.byteLength;
    }
    return out;
  }

  function rejectUnsafeName(name) {
    const s = String(name || "");
    if (!s || s.startsWith("/") || s.includes("\0")) throw new Error("unsafe tar path");
    if (s.split("/").includes("..")) throw new Error("unsafe tar path");
    if (TE.encode(s).byteLength > 100) throw new Error("tar path too long");
    return s;
  }

  function octal(n, width) {
    const s = Number(n).toString(8);
    if (s.length > width - 1) throw new Error("tar field overflow");
    return TE.encode(s.padStart(width - 1, "0") + "\0");
  }

  function tar(files) {
    const chunks = [];
    for (const f of files || []) {
      const name = rejectUnsafeName(f && f.name);
      const data = bytesFrom(f && f.bytes, "file bytes");
      const header = new Uint8Array(512);
      header.set(TE.encode(name), 0);
      header.set(octal(0o644, 8), 100);
      header.set(octal(0, 8), 108);
      header.set(octal(0, 8), 116);
      header.set(octal(data.byteLength, 12), 124);
      header.set(octal(0, 12), 136);
      header.fill(0x20, 148, 156);
      header[156] = 0x30;
      header.set(TE.encode("ustar\0"), 257);
      header.set(TE.encode("00"), 263);
      let sum = 0;
      for (const b of header) sum += b;
      header.set(octal(sum, 8), 148);
      chunks.push(header, data);
      const pad = (512 - (data.byteLength % 512)) % 512;
      if (pad) chunks.push(new Uint8Array(pad));
    }
    chunks.push(new Uint8Array(1024));
    return concat(chunks);
  }

  function untar(bytes) {
    const b = bytesFrom(bytes, "tar");
    const files = [];
    for (let off = 0; off + 512 <= b.byteLength;) {
      const h = b.slice(off, off + 512);
      if (h.every((x) => x === 0)) break;
      const name = TD.decode(h.slice(0, 100)).replace(/\0.*$/, "");
      const sizeText = TD.decode(h.slice(124, 136)).replace(/\0.*$/, "").trim();
      const size = Number.parseInt(sizeText || "0", 8);
      if (!Number.isFinite(size) || size < 0) throw new Error("invalid tar size");
      const start = off + 512;
      files.push({ name, bytes: b.slice(start, start + size) });
      off = start + Math.ceil(size / 512) * 512;
    }
    return files;
  }

  function blobJson({ v, day, segment, host, meta }) {
    return { v: v == null ? 1 : v, day, segment, host, meta: meta || {} };
  }

  function requireLen(bytes, len, name) {
    const b = bytesFrom(bytes, name);
    if (b.byteLength !== len) throw new Error(`${name} must be ${len} bytes`);
    return b;
  }

  function writeU16(out, off, n) {
    out[off] = (n >>> 8) & 255;
    out[off + 1] = n & 255;
  }

  function writeU64(out, off, n) {
    let x = BigInt(n);
    if (x < 0n || x > 0xffffffffffffffffn) throw new Error("ctLen out of range");
    for (let i = 7; i >= 0; i--) {
      out[off + i] = Number(x & 255n);
      x >>= 8n;
    }
  }

  function offerBytes({ senderFp, blobId, ctLen }) {
    const sfp = requireLen(senderFp, 32, "senderFp");
    const bid = requireLen(blobId, 16, "blobId");
    const out = new Uint8Array(67);
    let off = 0;
    out.set(TE.encode("SBO1"), off); off += 4;
    out[off++] = 0x01;
    writeU16(out, off, 0x0010); off += 2;
    writeU16(out, off, 0x0001); off += 2;
    writeU16(out, off, 0x0002); off += 2;
    out.set(sfp, off); off += 32;
    out.set(bid, off); off += 16;
    writeU64(out, off, ctLen);
    return out;
  }

  function parseReady(bytes) {
    const b = requireLen(bytes, 6, "Ready");
    if (TD.decode(b.slice(0, 4)) !== "SBR1") throw new Error("bad Ready magic");
    if (b[4] !== 0x01) throw new Error("bad Ready version");
    return { ok: b[5] === 0, status: b[5] };
  }

  function parseAck(bytes) {
    const b = requireLen(bytes, 38, "Ack");
    const magic = TD.decode(b.slice(0, 4));
    if (magic !== "SBA1") throw new Error("bad Ack magic");
    if (b[4] !== 0x01) throw new Error("bad Ack version");
    return { magic, version: b[4], status: b[5], blobId: b.slice(6, 22), tag: b.slice(22, 38) };
  }

  async function ackTag(kAck, status, blobId) {
    const keyBytes = requireLen(kAck, 32, "kAck");
    const bid = requireLen(blobId, 16, "blobId");
    const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const msg = concat([TE.encode("spl-blob-ack"), Uint8Array.of(status & 255), bid]);
    return new Uint8Array(await crypto.subtle.sign("HMAC", key, msg)).slice(0, 16);
  }

  function blobInfo(instanceId16, senderFp32) {
    return concat([TE.encode("spl-blob-v1"), requireLen(instanceId16, 16, "instanceId16"), requireLen(senderFp32, 32, "senderFp32")]);
  }

  async function collect(stream) {
    const chunks = [];
    const reader = stream.getReader();
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.byteLength;
    }
    const out = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
      out.set(c, off);
      off += c.byteLength;
    }
    return out;
  }

  async function packPlaintext(files, blobMeta) {
    const entries = [
      { name: "blob.json", bytes: TE.encode(JSON.stringify(blobJson(blobMeta))) },
      ...(files || []).map((f) => ({ name: f.name, bytes: f.bytes ? bytesFrom(f.bytes, "file bytes") : TE.encode(String(f.text || "")) })),
    ];
    const tarBytes = tar(entries);
    return collect(new Blob([tarBytes]).stream().pipeThrough(new CompressionStream("gzip")));
  }

  function suite() {
    const H = globalThis.SolstoneHpke;
    return new H.CipherSuite({
      kem: new H.DhkemP256HkdfSha256(),
      kdf: new H.HkdfSha256(),
      aead: new H.Aes256Gcm(),
    });
  }

  async function importP256Spki(spki) {
    return crypto.subtle.importKey("spki", bytesFrom(spki, "spki"), { name: "ECDH", namedCurve: "P-256" }, true, []);
  }

  async function sealBlob({ recipientSpki, senderPrivateKey, senderPublicKey, info, aad, plaintext }) {
    const s = suite();
    const recipientPublicKey = await importP256Spki(recipientSpki);
    const ctx = await s.createSenderContext({
      recipientPublicKey,
      senderKey: { privateKey: senderPrivateKey, publicKey: senderPublicKey },
      info: bytesFrom(info, "info"),
    });
    const ct = new Uint8Array(await ctx.seal(bytesFrom(plaintext, "plaintext"), bytesFrom(aad, "aad")));
    const kAck = new Uint8Array(await ctx.export(TE.encode("spl-blob-ack-v1"), 32));
    return { enc: new Uint8Array(ctx.enc), ct, kAck };
  }

  async function sealBase({ recipientSpki, info, aad, plaintext }) {
    const s = suite();
    const recipientPublicKey = await importP256Spki(recipientSpki);
    const ctx = await s.createSenderContext({ recipientPublicKey, info: bytesFrom(info, "info") });
    const ct = new Uint8Array(await ctx.seal(bytesFrom(plaintext, "plaintext"), aad ? bytesFrom(aad, "aad") : new Uint8Array()));
    return { enc: new Uint8Array(ctx.enc), ct };
  }

  async function openBaseSealed({ recipientPrivateKey, recipientPublicKey, enc, info, aad, ct }) {
    const s = suite();
    const ctx = await s.createRecipientContext({
      recipientKey: recipientPublicKey ? { privateKey: recipientPrivateKey, publicKey: recipientPublicKey } : recipientPrivateKey,
      enc: bytesFrom(enc, "enc"),
      info: bytesFrom(info, "info"),
    });
    return new Uint8Array(await ctx.open(bytesFrom(ct, "ct"), aad ? bytesFrom(aad, "aad") : new Uint8Array()));
  }

  globalThis.SolstoneRemoteBlob = {
    tar,
    untar,
    blobJson,
    offerBytes,
    parseReady,
    parseAck,
    ackTag,
    blobInfo,
    packPlaintext,
    sealBlob,
    sealBase,
    openBaseSealed,
  };
})();
