// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import test from "node:test";
import assert from "node:assert/strict";

await import(new URL("../extension/lib/copy.js", import.meta.url));
await import(new URL("../extension/lib/disclosure.js", import.meta.url));

const D = globalThis.SolstoneDisclosure;
const C = globalThis.SolstoneCopy;

test("addSite produces structured sheet copy from SolstoneCopy", () => {
  const sheet = D.addSite("mail.google.com", { brand: "chrome" });
  assert.equal(sheet.title, "add mail.google.com?");
  assert.ok(sheet.what.includes("mail.google.com"));
  assert.ok(sheet.what.includes("never pixels"));
  assert.equal(sheet.destination, "your journal, through the solstone app on this computer");
  assert.equal(sheet.destinationDetail, "nothing leaves this browser except to the solstone app on this computer.");
  assert.ok(sheet.browser.includes("Chrome will ask you to allow this next"));
  assert.equal(sheet.confirmLabel, "add this site");
  assert.equal(sheet.cancelLabel, "cancel");
});

test("firstRun returns kinship and disclosure body", () => {
  const firstRun = D.firstRun({});
  assert.deepEqual(firstRun.kinship, C.WARM_CARD);
  assert.equal(firstRun.body, C.DISCLOSURE_BODY);
});

test("disclosure helpers do not mutate caller state", () => {
  const state = Object.freeze({
    brand: "chrome",
  });
  D.firstRun(state);
  D.addSite("mail.example", state);
  assert.deepEqual(state, {
    brand: "chrome",
  });
});
