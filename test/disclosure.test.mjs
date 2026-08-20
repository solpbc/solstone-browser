// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import test from "node:test";
import assert from "node:assert/strict";

await import(new URL("../extension/lib/disclosure.js", import.meta.url));

const D = globalThis.SolstoneDisclosure;

test("paired destination copy names the home and relay boundary exactly", () => {
  assert.deepEqual(D.addSite("mail.example", {
    remote: { paired: true, relayOrigin: "https://relay.example" },
  }).destination, {
    label: "your journal at your home",
    detail: "sealed in this browser. https://relay.example carries bytes it can't open.",
  });
  assert.deepEqual(D.addSite("mail.example", {
    remote: { paired: true },
  }).destination, {
    label: "your journal at your home",
    detail: "sealed in this browser.",
  });
});

test("unpaired and unfinished-pair destinations use the pinned nowhere copy", () => {
  const expected = {
    label: "nowhere yet",
    detail: "set up your journal first. until then, browser updates wait here.",
  };
  assert.deepEqual(D.addSite("mail.example", {}).destination, expected);
  assert.deepEqual(D.addSite("mail.example", {
    remote: { pending: true, relayOrigin: "https://relay.example" },
  }).destination, expected);
});

test("first-run disclosure carries the pinned sealed-plaintext sentence byte for byte", () => {
  const copy = D.firstRun({});
  assert.equal(copy.neverReceives,
    "browser updates can wait in this browser while your journal is unavailable. before their content crosses the relay, it is sealed for your journal. the browser sends the relay the sealed content, not the key needed to open it.");
  assert.deepEqual(copy.destination, {
    label: "nowhere yet",
    detail: "set up your journal first. until then, browser updates wait here.",
  });
  assert.equal(copy.nothingYet, "nothing is taken in until you add your first site.");
});

test("disclosure helpers do not mutate caller state", () => {
  const state = Object.freeze({
    remote: Object.freeze({ paired: true, relayOrigin: "https://relay.example" }),
  });
  D.firstRun(state);
  D.addSite("mail.example", state);
  assert.deepEqual(state, {
    remote: { paired: true, relayOrigin: "https://relay.example" },
  });
});
