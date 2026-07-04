// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import test from "node:test";
import assert from "node:assert/strict";

await import(new URL("../extension/lib/uuid.js", import.meta.url));

const U = globalThis.SolstoneUuid;

test("uuidv7 bytes set timestamp, version, and variant bits", () => {
  const now = 0x0123456789ab;
  const bytes = U.uuidv7Bytes(now, Uint8Array.from([0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff, 0x11, 0x22, 0x33, 0x44]));

  assert.deepEqual([...bytes.slice(0, 6)], [0x01, 0x23, 0x45, 0x67, 0x89, 0xab]);
  assert.equal(bytes[6] >> 4, 0x7);
  assert.equal(bytes[8] >> 6, 0x2);
  assert.equal(U.uuidv7String(bytes), "01234567-89ab-7abb-8cdd-eeff11223344");
  assert.deepEqual([...U.bytesFromUuidString("01234567-89ab-7abb-8cdd-eeff11223344")], [...bytes]);
});

test("uuidv7 string ordering follows increasing timestamp for fixed random bytes", () => {
  const rand = new Uint8Array(10);
  const a = U.uuidv7String(U.uuidv7Bytes(1000, rand));
  const b = U.uuidv7String(U.uuidv7Bytes(1001, rand));

  assert.ok(a < b);
});
