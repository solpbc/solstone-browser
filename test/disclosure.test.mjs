// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import test from "node:test";
import assert from "node:assert/strict";

await import(new URL("../extension/lib/copy.js", import.meta.url));
await import(new URL("../extension/lib/gate.js", import.meta.url));
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

test("the disclosure consent version stays at 1", () => {
  assert.equal(globalThis.SolstoneCaptureGate.CONSENT_VERSION, 1);
});

test("leave-out copy says other sites shown inside a left-out page are still shared", () => {
  // Exclusions match each frame on its own address, so a frame from another site is still read.
  assert.ok(C.DISCLOSURE_BODY.includes("other sites shown inside those pages still are"));
  assert.ok(C.LEAVE_OUT_HELP.includes("other sites shown inside its pages are still shared"));
  assert.ok(C.leftOutAnnouncement("mail.google.com").includes("other sites shown inside its pages"));
  assert.ok(C.pageCopy("chrome").leaveOutNote("mail.google.com").includes("other sites shown inside its pages"));
});
