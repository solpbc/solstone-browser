// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const bytes = (s) => Uint8Array.from(s.match(/../g).map((x) => Number.parseInt(x, 16)));

function loadHpke() {
  const code = readFileSync(new URL("../extension/vendor/hpke/hpke-core-1.9.0.iife.js", import.meta.url), "utf8");
  const ctx = { crypto: globalThis.crypto, TextEncoder, TextDecoder, Uint8Array, ArrayBuffer };
  ctx.globalThis = ctx;
  vm.runInNewContext(code, ctx);
  return ctx.SolstoneHpke;
}

test("vendored HPKE IIFE exposes the approved surface", () => {
  const hpke = loadHpke();

  assert.equal(typeof hpke.CipherSuite, "function");
  assert.equal(typeof hpke.DhkemP256HkdfSha256, "function");
  assert.equal(typeof hpke.HkdfSha256, "function");
  assert.equal(typeof hpke.Aes256Gcm, "function");
});

test("Section 10 RFC 9180 auth-mode fixture opens and exports byte-identically", async () => {
  const hpke = loadHpke();
  const fixture = {
    info: "4f6465206f6e2061204772656369616e2055726e",
    skRm: "d9f10996a02cd6c9dbda1d1f225f18f781ea3c893b8c2a6cb2e266e59f3cd9a9",
    pkRm: "04cd38ef80923e26f157e06c9887f80177c97e1005a41104127271237f946df22eda13d40801bce6184f1a631c44b0807a1a5e8d039975ed0f6079fcbd2dfe6652",
    skSm: "6e7b14befe49443dc501def1cc2f0f293d9c5cfa045a23e9a2e0e7703b42705d",
    pkSm: "04ece9b48cc98ee03ba742fe1218a3fbec960cc34b6e1defdcd3285276f39028e95b90f9526607565888766a1101f429dc3ec87364b5c8c613f0a081881950427f",
    enc: "04a7aeac79fda402674ef247c12d6f5fdfd21498d896b67ff04ec181382d4516b7662be32b4a2ae817c2d57104ecb6fcaa527438939810612d1b3d0af36ffc66ce",
    aad: "436f756e742d30",
    pt: "4265617574792069732074727574682c20747275746820626561757479",
    ct: "59b9890aabf94c1d502c39d8d356989ab0880ed43e984255db7b32a8d7b0ad5beba799a4ec326a0ddca3dd5e5d",
    exp: "6c0386ae15b1b834a5247ca5595b4e102347cbcdc65de64832f36008ce9c9483",
  };
  assert.equal(bytes(fixture.pkRm).byteLength, 65);
  assert.equal(bytes(fixture.skSm).byteLength, 32);
  const suite = new hpke.CipherSuite({
    kem: new hpke.DhkemP256HkdfSha256(),
    kdf: new hpke.HkdfSha256(),
    aead: new hpke.Aes256Gcm(),
  });
  const recipientKey = await suite.kem.deserializePrivateKey(bytes(fixture.skRm));
  const senderPublicKey = await suite.kem.deserializePublicKey(bytes(fixture.pkSm));
  const recipient = await suite.createRecipientContext({
    recipientKey,
    enc: bytes(fixture.enc),
    info: bytes(fixture.info),
    senderPublicKey,
  });

  assert.equal(hex(await recipient.open(bytes(fixture.ct), bytes(fixture.aad))), fixture.pt);
  assert.equal(hex(await recipient.export(new Uint8Array(), 32)), fixture.exp);
});
