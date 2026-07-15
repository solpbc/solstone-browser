// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

await import(new URL("../extension/lib/hosts.js", import.meta.url));
await import(new URL("../extension/lib/status.js", import.meta.url));

const S = globalThis.SolstoneStatus;
const H = globalThis.SolstoneHosts;

function entryMatchHosts(cfg) {
  return Object.fromEntries((cfg.allowlist || []).map((entry) => [entry, H.matchHostFor(entry)]));
}

const cells = [
  [{}, { prefix: "icon-paused-", title: "sol — add a site to begin", badge: "" }],
  [{ allowlist: ["x"], paused: true }, { prefix: "icon-paused-", title: "sol — paused", badge: "" }],
  [{ allowlist: ["x"], paused: true, siteErrors: { x: "boom" } }, { prefix: "icon-paused-", title: "sol — paused", badge: "" }],
  [{ allowlist: ["x"], siteErrors: { x: "boom" } }, { prefix: "icon-error-", title: "sol — boom", badge: "!" }],
  [{ allowlist: ["x"] }, { prefix: "icon-half-", title: "sol — on 1 site · connecting to your journal", badge: "" }],
  [
    { allowlist: ["x"], key: "k", health: { lastError: "down" } },
    { prefix: "icon-half-", title: "sol — on 1 site · can't reach your journal", badge: "" },
  ],
  [{ allowlist: ["a", "b"], key: "k" }, { prefix: "icon", title: "sol — on 2 sites · connected", badge: "" }],
  [
    { allowlist: ["x"], key: "k", health: { lastError: "down", consecutiveFailures: 1 } },
    { prefix: "icon-half-", title: "sol — on 1 site · can't reach your journal", badge: "" },
  ],
  [
    { allowlist: ["x"], key: "k", health: { lastError: "down", consecutiveFailures: 2 } },
    { prefix: "icon-half-", title: "sol — on 1 site · can't reach your journal", badge: "" },
  ],
  [
    { allowlist: ["x"], health: { lastError: "down", consecutiveFailures: 1 } },
    { prefix: "icon-half-", title: "sol — on 1 site · connecting to your journal", badge: "" },
  ],
  [
    { allowlist: ["x"], health: { lastError: "down", consecutiveFailures: 2 } },
    { prefix: "icon-half-", title: "sol — on 1 site · connecting to your journal", badge: "" },
  ],
  [
    { allowlist: ["x"], key: "k", health: { lastError: "down" } },
    { prefix: "icon-half-", title: "sol — on 1 site · can't reach your journal", badge: "" },
  ],
  [
    { allowlist: ["x"], key: "k", siteErrors: { x: "boom" }, health: { lastError: "down", consecutiveFailures: 2 } },
    { prefix: "icon-error-", title: "sol — boom", badge: "!" },
  ],
  [
    { allowlist: ["x"], key: "k", health: { lastError: "down" }, waiting: 12 },
    { prefix: "icon-half-", title: "sol — on 1 site · can't reach your journal — 12 updates waiting to sync", badge: "" },
  ],
  [
    { allowlist: ["x"], key: "k", health: { lastError: "down" }, waiting: 1 },
    { prefix: "icon-half-", title: "sol — on 1 site · can't reach your journal — 1 update waiting to sync", badge: "" },
  ],
  [
    { allowlist: ["a", "b"], key: "k", health: { lastError: "down" }, waiting: 0 },
    { prefix: "icon-half-", title: "sol — on 2 sites · can't reach your journal", badge: "" },
  ],
  [
    { allowlist: ["a", "b"], waiting: 3 },
    { prefix: "icon-half-", title: "sol — on 2 sites · connecting to your journal — 3 updates waiting to sync", badge: "" },
  ],
  [
    { allowlist: ["x"], dropped: { segments: 1, lines: 8 } },
    { prefix: "icon-error-", title: "sol — some updates couldn't be kept — open settings", badge: "!" },
  ],
  [
    { allowlist: ["x"], key: "k", pausedHosts: { x: true } },
    { prefix: "icon-paused-", title: "sol — paused by browser — allow again in settings", badge: "" },
  ],
  [
    { allowlist: ["x"], key: "k", pausedHosts: { x: true }, siteErrors: { x: "boom" }, dropped: { segments: 1 } },
    { prefix: "icon-paused-", title: "sol — paused by browser — allow again in settings", badge: "" },
  ],
  [
    { allowlist: ["a", "b"], key: "k", pausedHosts: { a: true } },
    { prefix: "icon", title: "sol — on 1 site · connected", badge: "" },
  ],
  [
    { allowlist: ["localhost:5015", "localhost:3000"], pausedHosts: { localhost: true } },
    { prefix: "icon-paused-", title: "sol — paused by browser — allow again in settings", badge: "" },
  ],
  [
    { allowlist: ["a", "b"], paused: true, pausedHosts: { a: true } },
    { prefix: "icon-paused-", title: "sol — paused", badge: "" },
  ],
];

test("iconState returns the accepted toolbar status cells", () => {
  for (const [cfg, expected] of cells) {
    assert.deepEqual(S.iconState(cfg, entryMatchHosts(cfg)), expected);
  }
});

const rowCells = [
  [
    "x",
    { matchHost: "x", siteErrors: { x: "boom" }, pausedHosts: { x: true }, paused: true, activeSites: ["x"], connected: true, pageHost: "x" },
    { kind: "error", label: "boom" },
  ],
  ["x:1", { matchHost: "x", pausedHosts: { x: true }, paused: true, activeSites: ["x:1"], connected: true, pageHost: "x:1" }, { kind: "paused-browser", label: "paused by browser" }],
  ["x", { matchHost: "x", paused: true, activeSites: ["x"], connected: true, pageHost: "x" }, { kind: "paused", label: "paused" }],
  ["x", { matchHost: "x", activeSites: ["x"], connected: true, pageHost: "x" }, { kind: "on", label: "on now" }],
  ["x", { matchHost: "x", activeSites: ["x"], connected: false, pageHost: "x" }, { kind: "waiting", label: "on — waiting to sync" }],
  ["x", { matchHost: "x", activeSites: [], connected: true, pageHost: "x" }, { kind: "reload", label: "reload this tab to begin" }],
  ["x", { matchHost: "x", activeSites: [], connected: true, pageHost: null }, { kind: "idle", label: "added — open or reload a tab" }],
];

test("siteRowState returns every accepted row kind with fixed precedence", () => {
  for (const [entry, state, expected] of rowCells) assert.deepEqual(S.siteRowState(entry, state), expected);
});

test("iconState handles sparse config defensively", () => {
  assert.doesNotThrow(() => S.iconState({}));
  assert.doesNotThrow(() => S.iconState({ allowlist: ["x"] }));
});

test("all emitted toolbar icon assets exist", () => {
  for (const prefix of ["icon-paused-", "icon-error-", "icon-half-", "icon"]) {
    for (const size of [16, 48, 128]) {
      assert.equal(fs.existsSync(new URL(`../extension/icons/${prefix}${size}.png`, import.meta.url)), true);
    }
  }
});

test("updateHealth tracks consecutive journal failures without touching upload fields", () => {
  let h = S.updateHealth({}, { ok: false, status: 0, error: "x" });
  assert.equal(h.consecutiveFailures, 1);
  assert.equal(h.lastError, "x");
  assert.equal(h.lastStatus, 0);

  h = S.updateHealth(h, { ok: false, status: 500, error: "y" });
  assert.equal(h.consecutiveFailures, 2);

  h = S.updateHealth(h, { ok: true });
  assert.equal(h.consecutiveFailures, 0);
  assert.equal(h.lastError, null);

  h = S.updateHealth({ lastError: "y" }, { ok: false });
  assert.equal(h.consecutiveFailures, 1);
});

test("toolbar titles and site labels stay in owner voice", () => {
  const ownerStrings = cells.map(([, expected]) => expected.title).concat(rowCells.map(([, , expected]) => expected.label));
  for (const value of ownerStrings) {
    assert.doesNotMatch(value, /captures|records|monitors|watches|tracks|observ(?:e|es|ed|ing|ation|ations)/i);
  }
});
