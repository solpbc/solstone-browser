// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

await import(new URL("../extension/lib/remote_blob.js", import.meta.url));

const R = globalThis.SolstoneRemoteBlob;
const te = new TextEncoder();
const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
const bytes = (s) => Uint8Array.from(s.match(/../g).map((x) => Number.parseInt(x, 16)));

test("ustar tar writer and reader recover exact names and bytes", () => {
  const files = [
    { name: "blob.json", bytes: te.encode("{\"v\":1}\n") },
    { name: "browser_example.jsonl", bytes: te.encode("{\"t\":\"segment_start\"}\n") },
    { name: "nested/readme.txt", bytes: te.encode("hello\n") },
  ];
  const recovered = R.untar(R.tar(files));

  assert.deepEqual(recovered.map((f) => f.name), files.map((f) => f.name));
  assert.deepEqual(recovered.map((f) => hex(f.bytes)), files.map((f) => hex(f.bytes)));
});

test("tar rejects unsafe paths", () => {
  assert.throws(() => R.tar([{ name: "/absolute", bytes: new Uint8Array() }]), /unsafe tar path/);
  assert.throws(() => R.tar([{ name: "a/../b", bytes: new Uint8Array() }]), /unsafe tar path/);
});

test("blob.json shaping is exact", () => {
  assert.deepEqual(R.blobJson({ v: 1, day: "20260704", segment: "120000_300", host: "mail.example", meta: { stream: "desktop.browser" } }), {
    v: 1,
    day: "20260704",
    segment: "120000_300",
    host: "mail.example",
    meta: { stream: "desktop.browser" },
  });
});

test("Offer bytes use exact magic, suite ids, and big-endian ct_len", () => {
  const senderFp = bytes("000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f");
  const blobId = bytes("202122232425262728292a2b2c2d2e2f");
  const offer = R.offerBytes({ senderFp, blobId, ctLen: 0x0102030405060708n });

  assert.equal(offer.byteLength, 67);
  assert.equal(new TextDecoder().decode(offer.slice(0, 4)), "SBO1");
  assert.equal(offer[4], 0x01);
  assert.deepEqual([...offer.slice(5, 11)], [0x00, 0x10, 0x00, 0x01, 0x00, 0x02]);
  assert.equal(hex(offer.slice(11, 43)), hex(senderFp));
  assert.equal(hex(offer.slice(43, 59)), hex(blobId));
  assert.equal(hex(offer.slice(59, 67)), "0102030405060708");
});

test("Ready and Ack parsers accept hand-built wire bytes", () => {
  const ready = Uint8Array.from([...te.encode("SBR1"), 0x01, 0x00]);
  const ack = Uint8Array.from([...te.encode("SBA1"), 0x01, 0x01, ...bytes("202122232425262728292a2b2c2d2e2f"), ...bytes("303132333435363738393a3b3c3d3e3f")]);

  assert.deepEqual(R.parseReady(ready), { ok: true, status: 0 });
  const parsed = R.parseAck(ack);
  assert.equal(parsed.magic, "SBA1");
  assert.equal(parsed.version, 1);
  assert.equal(parsed.status, 1);
  assert.equal(hex(parsed.blobId), "202122232425262728292a2b2c2d2e2f");
  assert.equal(hex(parsed.tag), "303132333435363738393a3b3c3d3e3f");
});

test("ACK tag matches independent HMAC calculation", async () => {
  const kAck = bytes("000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f");
  const blobId = bytes("202122232425262728292a2b2c2d2e2f");
  const status = 1;
  const expected = createHmac("sha256", kAck)
    .update(Buffer.concat([Buffer.from("spl-blob-ack"), Buffer.from([status]), Buffer.from(blobId)]))
    .digest()
    .subarray(0, 16);

  assert.equal(hex(await R.ackTag(kAck, status, blobId)), expected.toString("hex"));
});

test("HPKE blob info is exact concatenation", () => {
  const instanceId = bytes("00112233445566778899aabbccddeeff");
  const senderFp = bytes("000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f");

  assert.equal(hex(R.blobInfo(instanceId, senderFp)), "73706c2d626c6f622d763100112233445566778899aabbccddeeff000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f");
});
