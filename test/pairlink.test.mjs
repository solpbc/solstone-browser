// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import test from "node:test";
import assert from "node:assert/strict";

await import(new URL("../extension/lib/pairlink.js", import.meta.url));

const P = globalThis.SolstonePairlink;

test("Section 9 default relay vector is byte-identical", async () => {
  const blob = P.buildBlob({
    S: "0123456789abcdef",
    caFpSpki: "deadbeefcafebabe0123456789abcdef",
  });
  const fragment = P.fragmentFromBlob(blob);
  const link = P.linkFromBlob(blob);
  const parsed = P.parseLink(link);
  const rk = await P.deriveRK(parsed.SBytes);

  assert.equal(P.bytesToHex(blob), "060123456789abcdef01deadbeefcafebabe0123456789abcdef00");
  assert.equal(fragment, "0R0J6HB7H6NWVVR1VTPVXVYAZTXBW0938NKRKAYDXW00");
  assert.equal(link, "https://go.solstone.app/p#0R0J6HB7H6NWVVR1VTPVXVYAZTXBW0938NKRKAYDXW00");
  assert.equal(P.bytesToHex(rk), "e34481a4cde647ba9c9fb29a59e18271");
  assert.equal(parsed.S, "0123456789abcdef");
  assert.equal(parsed.caFpSpkiHex, "deadbeefcafebabe0123456789abcdef");
  assert.equal(parsed.relayOrigin, "https://link.solstone.app");
  assert.equal(P.bytesToHex(parsed.blob), P.bytesToHex(blob));
});

test("custom relay origin round-trips through build, encode, and parse", () => {
  const relayOrigin = "https://relay.example.test:9443";
  const blob = P.buildBlob({
    S: "0123456789abcdef",
    caFpSpki: "deadbeefcafebabe0123456789abcdef",
    relayOrigin,
  });
  const parsed = P.parseLink(P.linkFromBlob(blob));

  assert.equal(parsed.relayOrigin, relayOrigin);
  assert.equal(parsed.S, "0123456789abcdef");
  assert.equal(parsed.caFpSpkiHex, "deadbeefcafebabe0123456789abcdef");
  assert.equal(blob[26], new TextEncoder().encode(relayOrigin).byteLength);
  assert.equal(P.bytesToHex(parsed.blob), P.bytesToHex(blob));
});
