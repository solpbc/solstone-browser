// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import assert from "node:assert/strict";
import test from "node:test";

await import(new URL("../extension/lib/disclosure.js", import.meta.url));

const Disclosure = globalThis.SolstoneDisclosure;

function status(overrides = {}) {
  return Object.assign({
    journalUrl: "http://localhost:5015",
    remote: { paired: false, pending: false, relayOrigin: "" },
  }, overrides);
}

test("addSite returns the fixed local disclosure shape", () => {
  assert.deepEqual(Disclosure.addSite("mail.google.com", status()), {
    title: "add mail.google.com?",
    whatSolTakesIn: "sol will take in the visible text of this site, along with you, whenever a tab on it is open, and keep it in your journal. that includes background tabs.",
    destination: {
      label: "your journal on this computer",
      detail: "http://localhost:5015",
    },
    whatChromeDoes: "chrome will ask you to allow this next. you can remove the site any time.",
    confirmLabel: "add this site",
    cancelLabel: "cancel",
  });
});

test("addSite derives remote and unconfigured destinations from the passed status", () => {
  const remote = status({
    journalUrl: "http://stale.example:5015",
    remote: { paired: true, pending: false, relayOrigin: "https://link.solstone.app" },
  });
  assert.deepEqual(Disclosure.addSite("example.com", remote).destination, {
    label: "your journal at your home",
    detail: "sealed in this browser. https://link.solstone.app carries bytes it can't open.",
  });

  const unconfigured = status({ journalUrl: "", remote: { paired: false, pending: false, relayOrigin: "" } });
  assert.deepEqual(Disclosure.addSite("example.com", unconfigured).destination, {
    label: "nowhere yet",
    detail: "set up your journal first, or what sol takes in will just pile up here.",
  });

  const unfinished = status({ remote: { paired: false, pending: true, relayOrigin: "https://link.solstone.app" } });
  assert.deepEqual(Disclosure.addSite("example.com", unfinished).destination, {
    label: "nowhere yet",
    detail: "set up your journal first, or what sol takes in will just pile up here.",
  });
});

test("destination copy follows a changed status on every call", () => {
  const live = status();
  assert.equal(Disclosure.addSite("example.com", live).destination.detail, "http://localhost:5015");
  live.journalUrl = "http://localhost:6123";
  assert.equal(Disclosure.addSite("example.com", live).destination.detail, "http://localhost:6123");
  live.remote = { paired: true, pending: false, relayOrigin: "https://relay.example" };
  assert.equal(Disclosure.addSite("example.com", live).destination.detail, "sealed in this browser. https://relay.example carries bytes it can't open.");
});

test("firstRun is complete and shares the live destination derivation", () => {
  const local = status();
  assert.deepEqual(Disclosure.firstRun(local), {
    kinship: [
      "this is sol, part of solstone.",
      "sol lives on your devices, experiences your day with you, and keeps it all in your journal.",
      "your journal is always private, only yours.",
    ],
    scope: "in your browser, sol takes in only the sites you add.",
    whatSolTakesIn: "on a site you add, sol takes in the visible text and rough layout of the page, along with you, and keeps it in your journal. never pixels. never hidden text. never a site you didn't add.",
    neverReceives: "sol pbc never receives any of it.",
    destination: { label: "your journal on this computer", detail: "http://localhost:5015" },
    nothingYet: "nothing is taken in until you add your first site.",
  });

  const paired = status({ remote: { paired: true, pending: false, relayOrigin: "https://relay.example" } });
  assert.deepEqual(Disclosure.firstRun(paired).destination, Disclosure.addSite("example.com", paired).destination);
});

function assertOwnerCopy(copy) {
  const text = JSON.stringify(copy);
  assert.doesNotMatch(text, /\u2014|capture|record|monitor|watch|track|observ(?:e|es|ed|ing|ation)|\busers?\b|prototype/i);
}

test("addSite copy obeys the owner-copy constraints", () => {
  assertOwnerCopy(Disclosure.addSite("mail.google.com", status()));
  assert.throws(() => assertOwnerCopy({ whatSolTakesIn: "we monitor users\u2014always" }));
});

test("disclosure helpers do not mutate their inputs", () => {
  const input = Object.freeze({
    journalUrl: "http://localhost:5015",
    remote: Object.freeze({ paired: false, pending: false, relayOrigin: "" }),
  });
  Disclosure.addSite("example.com", input);
  Disclosure.firstRun(input);
  assert.equal(input.journalUrl, "http://localhost:5015");
});
