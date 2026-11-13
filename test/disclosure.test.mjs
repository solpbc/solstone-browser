// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import test from "node:test";
import assert from "node:assert/strict";

await import(new URL("../extension/lib/copy.js", import.meta.url));
await import(new URL("../extension/lib/gate.js", import.meta.url));
await import(new URL("../extension/lib/disclosure.js", import.meta.url));

const D = globalThis.SolstoneDisclosure;
const C = globalThis.SolstoneCopy;

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
  assert.deepEqual(state, {
    brand: "chrome",
  });
});

test("consentAccepted is true for stored 1 and 2 and false for 0 and 3", () => {
  const accepted = globalThis.SolstoneCaptureGate.consentAccepted;
  assert.equal(accepted(1), true);
  assert.equal(accepted(2), true);
  assert.equal(accepted(0), false);
  assert.equal(accepted(3), false);
});

test("the desktop disclosure keeps the where, private-window and pause paragraphs separated", () => {
  assert.ok(C.DISCLOSURE_BODY.includes("\n\nwhere it goes:"));
  assert.ok(C.DISCLOSURE_BODY.includes("\n\nthe solstone extension takes in nothing from private windows"));
  assert.ok(C.DISCLOSURE_BODY.includes("\n\npause any time"));
});

test("leave-out copy says other sites shown inside a left-out page are still shared", () => {
  // Exclusions match each frame on its own address, so a frame from another site is still read.
  assert.ok(C.DISCLOSURE_BODY.includes("other sites shown inside those pages still are"));
  assert.ok(C.LEAVE_OUT_HELP.includes("other sites shown inside its pages are still shared"));
  assert.ok(C.leftOutAnnouncement("mail.google.com").includes("other sites shown inside its pages"));
  assert.ok(C.pageCopy("chrome").leaveOutNote("mail.google.com").includes("other sites shown inside its pages"));
});
