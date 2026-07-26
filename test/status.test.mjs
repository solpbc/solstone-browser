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

const pairedRemote = {
  instanceId: "018f0112-3456-789a-8bcd-ef0123456789",
  deviceToken: "secret-token",
  homeSpki: "secret-spki",
  relayOrigin: "https://relay.example.test",
  pairedAt: 200,
};
const pureRemoteSuccess = {
  allowlist: ["x"],
  hostname: "remote-only",
  remote: pairedRemote,
  health: { lastUploadAt: 200 },
};
const retainedLocalRemoteSuccess = {
  allowlist: ["x"],
  hostname: "used-local-first",
  key: "old-local-key",
  stream: "used-local-first.browser",
  remote: pairedRemote,
  health: { lastUploadAt: 201 },
};
const keyClearedRemoteSuccess = {
  allowlist: ["x"],
  hostname: "renamed-after-pairing",
  key: "",
  stream: "",
  remote: pairedRemote,
  health: { lastUploadAt: 202 },
};
const remoteSuccessFixtures = [pureRemoteSuccess, retainedLocalRemoteSuccess, keyClearedRemoteSuccess];

const cells = [
  [{}, { prefix: "icon-paused-", title: "sol — add a site to begin", badge: "" }],
  [{ allowlist: ["x"], paused: true }, { prefix: "icon-paused-", title: "sol — paused", badge: "" }],
  [{ allowlist: ["x"], paused: true, siteErrors: { x: "boom" } }, { prefix: "icon-paused-", title: "sol — paused", badge: "" }],
  [{ allowlist: ["x"], siteErrors: { x: "boom" } }, { prefix: "icon-error-", title: "sol — boom", badge: "!" }],
  [{ allowlist: ["x"] }, { prefix: "icon-half-", title: "sol — on 1 site · connecting · this computer", badge: "" }],
  [
    { allowlist: ["x"], key: "k", health: { lastError: "down" } },
    { prefix: "icon-half-", title: "sol — on 1 site · can't reach · this computer", badge: "" },
  ],
  [{ allowlist: ["a", "b"], key: "k" }, { prefix: "icon", title: "sol — on 2 sites · connected · this computer", badge: "" }],
  [
    { allowlist: ["x"], key: "k", health: { lastError: "down", consecutiveFailures: 1 } },
    { prefix: "icon-half-", title: "sol — on 1 site · can't reach · this computer", badge: "" },
  ],
  [
    { allowlist: ["x"], key: "k", health: { lastError: "down", consecutiveFailures: 2 } },
    { prefix: "icon-half-", title: "sol — on 1 site · can't reach · this computer", badge: "" },
  ],
  [
    { allowlist: ["x"], health: { lastError: "down", consecutiveFailures: 1 } },
    { prefix: "icon-half-", title: "sol — on 1 site · can't reach · this computer", badge: "" },
  ],
  [
    { allowlist: ["x"], health: { lastError: "down", consecutiveFailures: 2 } },
    { prefix: "icon-half-", title: "sol — on 1 site · can't reach · this computer", badge: "" },
  ],
  [
    { allowlist: ["x"], key: "k", health: { lastError: "down" } },
    { prefix: "icon-half-", title: "sol — on 1 site · can't reach · this computer", badge: "" },
  ],
  [
    { allowlist: ["x"], key: "k", siteErrors: { x: "boom" }, health: { lastError: "down", consecutiveFailures: 2 } },
    { prefix: "icon-error-", title: "sol — boom", badge: "!" },
  ],
  [
    { allowlist: ["x"], key: "k", health: { lastError: "down" }, waiting: 12 },
    { prefix: "icon-half-", title: "sol — on 1 site · can't reach · this computer — 12 updates waiting to sync", badge: "" },
  ],
  [
    { allowlist: ["x"], key: "k", health: { lastError: "down" }, waiting: 1 },
    { prefix: "icon-half-", title: "sol — on 1 site · can't reach · this computer — 1 update waiting to sync", badge: "" },
  ],
  [
    { allowlist: ["a", "b"], key: "k", health: { lastError: "down" }, waiting: 0 },
    { prefix: "icon-half-", title: "sol — on 2 sites · can't reach · this computer", badge: "" },
  ],
  [
    { allowlist: ["a", "b"], waiting: 3 },
    { prefix: "icon-half-", title: "sol — on 2 sites · connecting · this computer — 3 updates waiting to sync", badge: "" },
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
    { prefix: "icon", title: "sol — on 1 site · connected · this computer", badge: "" },
  ],
  [
    { allowlist: ["localhost:5015", "localhost:3000"], pausedHosts: { localhost: true } },
    { prefix: "icon-paused-", title: "sol — paused by browser — allow again in settings", badge: "" },
  ],
  [
    { allowlist: ["a", "b"], paused: true, pausedHosts: { a: true } },
    { prefix: "icon-paused-", title: "sol — paused", badge: "" },
  ],
  [pureRemoteSuccess, { prefix: "icon", title: "sol — on 1 site · connected · your home", badge: "" }],
  [retainedLocalRemoteSuccess, { prefix: "icon", title: "sol — on 1 site · connected · your home", badge: "" }],
  [keyClearedRemoteSuccess, { prefix: "icon", title: "sol — on 1 site · connected · your home", badge: "" }],
  [
    { allowlist: ["x"], remote: pairedRemote },
    { prefix: "icon-half-", title: "sol — on 1 site · paired · waiting for first sync · your home", badge: "" },
  ],
  [
    { allowlist: ["x"], remote: pairedRemote, health: { lastUploadAt: 199, segmentsUploaded: 4 } },
    { prefix: "icon-half-", title: "sol — on 1 site · paired · waiting for first sync · your home", badge: "" },
  ],
  [
    { allowlist: ["x"], remotePending: { relayOrigin: "https://relay.example.test" } },
    { prefix: "icon-half-", title: "sol — on 1 site · pairing not finished · your home", badge: "" },
  ],
  [
    { allowlist: ["x"], remote: { instanceId: pairedRemote.instanceId, relayOrigin: pairedRemote.relayOrigin } },
    { prefix: "icon-half-", title: "sol — on 1 site · pairing not finished · your home", badge: "" },
  ],
  [
    { allowlist: ["x"], remote: pairedRemote, health: { lastUploadAt: 201, lastError: "relay down" } },
    { prefix: "icon-half-", title: "sol — on 1 site · can't reach · your home", badge: "" },
  ],
  [
    { allowlist: ["x"], health: { lastError: "registration down" }, waiting: 2 },
    { prefix: "icon-half-", title: "sol — on 1 site · can't reach · this computer — 2 updates waiting to sync", badge: "" },
  ],
];

test("iconState returns the accepted toolbar status cells", () => {
  for (const [cfg, expected] of cells) {
    assert.deepEqual(S.iconState(S.normalize(cfg), entryMatchHosts(cfg)), expected);
  }
});

const rowCells = [
  [
    "x",
    { matchHost: "x", siteErrors: { x: "boom" }, pausedHosts: { x: true }, paused: true, activeSites: ["x"], pageHost: "x" },
    { kind: "error", label: "boom" },
  ],
  ["x:1", { matchHost: "x", pausedHosts: { x: true }, paused: true, activeSites: ["x:1"], pageHost: "x:1" }, { kind: "paused-browser", label: "paused by browser" }],
  ["x", { matchHost: "x", paused: true, activeSites: ["x"], pageHost: "x" }, { kind: "paused", label: "paused" }],
  ["x", { matchHost: "x", key: "k", activeSites: ["x"], pageHost: "x" }, { kind: "on", label: "on now" }],
  ["x", { matchHost: "x", activeSites: ["x"], pageHost: "x" }, { kind: "waiting", label: "on — waiting to sync" }],
  ["x", { matchHost: "x", key: "k", activeSites: [], pageHost: "x" }, { kind: "reload", label: "reload this tab to begin" }],
  ["x", { matchHost: "x", key: "k", activeSites: [], pageHost: null }, { kind: "idle", label: "added — open or reload a tab" }],
  ["x", Object.assign({}, pureRemoteSuccess, { matchHost: "x", activeSites: ["x"], pageHost: "x" }), { kind: "on", label: "on now" }],
  ["x", Object.assign({}, keyClearedRemoteSuccess, { matchHost: "x", activeSites: ["x"], pageHost: "x" }), { kind: "on", label: "on now" }],
  ["x", { matchHost: "x", remote: pairedRemote, activeSites: ["x"], pageHost: "x" }, { kind: "waiting", label: "on — waiting for first sync" }],
  ["x", { matchHost: "x", remotePending: { relayOrigin: pairedRemote.relayOrigin }, activeSites: ["x"], pageHost: "x" }, { kind: "waiting", label: "on — waiting to sync" }],
  ["x", { matchHost: "x", remote: pairedRemote, health: { lastError: "relay down" }, activeSites: ["x"], pageHost: "x" }, { kind: "waiting", label: "on — waiting to sync" }],
];

test("siteRowState returns every accepted row kind with fixed precedence", () => {
  for (const [entry, state, expected] of rowCells) {
    const status = Object.assign(S.normalize(state), {
      matchHost: state.matchHost,
      activeSites: state.activeSites,
      pageHost: state.pageHost,
    });
    assert.deepEqual(S.siteRowState(entry, status), expected);
  }
});

test("iconState handles sparse config defensively", () => {
  assert.doesNotThrow(() => S.iconState(S.normalize({})));
  assert.doesNotThrow(() => S.iconState(S.normalize({ allowlist: ["x"] })));
});

test("connection returns the accepted owner-facing state fields", () => {
  assert.deepEqual(S.connection(S.normalize({ key: "k" })), {
    kind: "local-connected", connected: true, stateLabel: "connected", destination: "this computer",
    destinationDetail: "your journal on this computer", consequence: "",
  });
  assert.deepEqual(S.connection(S.normalize({})), {
    kind: "local-pending", connected: false, stateLabel: "connecting", destination: "this computer",
    destinationDetail: "your journal on this computer", consequence: "",
  });
  assert.deepEqual(S.connection(S.normalize({ health: { lastError: "down" } })), {
    kind: "local-error", connected: false, stateLabel: "can't reach", destination: "this computer",
    destinationDetail: "your journal on this computer",
    consequence: "your journal isn't answering. what sol takes in is kept here, waiting to sync.",
  });
  assert.deepEqual(S.connection(S.normalize(pureRemoteSuccess)), {
    kind: "remote-connected", connected: true, stateLabel: "connected", destination: "your home",
    destinationDetail: "your home, reached over a sealed link", consequence: "",
  });
  assert.deepEqual(S.connection(S.normalize({ remote: pairedRemote })), {
    kind: "remote-ready", connected: false, stateLabel: "paired · waiting for first sync", destination: "your home",
    destinationDetail: "your home, reached over a sealed link", consequence: "",
  });
  assert.deepEqual(S.connection(S.normalize({ remote: pairedRemote, health: { lastError: "down" } })), {
    kind: "remote-error", connected: false, stateLabel: "can't reach", destination: "your home",
    destinationDetail: "your home, reached over a sealed link",
    consequence: "your home isn't answering. what sol takes in is kept here, waiting to sync.",
  });
  assert.deepEqual(S.connection(S.normalize({ remotePending: { relayOrigin: pairedRemote.relayOrigin } })), {
    kind: "remote-pending", connected: false, stateLabel: "pairing not finished", destination: "your home",
    destinationDetail: "your home, once pairing finishes", consequence: "",
  });
});

test("remote sealed delivery never renders as pending", () => {
  for (const cfg of remoteSuccessFixtures) {
    const status = S.normalize(cfg);
    const icon = S.iconState(status, entryMatchHosts(cfg));
    const row = S.siteRowState("x", Object.assign({}, status, { matchHost: "x", activeSites: ["x"], pageHost: "x" }));
    assert.doesNotMatch(icon.title, /not connected yet/i);
    assert.notEqual(icon.prefix, "icon-half-");
    assert.notEqual(row.kind, "waiting");
  }
});

test("normalize excludes remote secrets and provides one stream fallback", () => {
  const status = S.normalize({ hostname: "laptop", remote: pairedRemote, remotePending: { relayOrigin: "https://pending.example" } });
  const serialized = JSON.stringify(status);
  assert.equal(status.streamName, "laptop.browser");
  assert.equal(status.remote.paired, true);
  assert.equal(status.remote.pending, false);
  assert.doesNotMatch(serialized, /deviceToken|homeSpki|secret-token|secret-spki/);
  assert.equal(S.normalize({ hostname: "ignored", stream: "named.browser" }).streamName, "named.browser");
  assert.equal(S.normalize({}).streamName, "browser");
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
  const connectionStrings = cells.flatMap(([cfg]) =>
    Object.values(S.connection(S.normalize(cfg))).filter((value) => typeof value === "string")
  );
  const ownerStrings = cells.map(([, expected]) => expected.title).concat(rowCells.map(([, , expected]) => expected.label), connectionStrings);
  for (const value of ownerStrings) {
    assert.doesNotMatch(value, /\busers?\b|captur(?:e|es|ed|ing)|record(?:s|ed|ing)?|monitor(?:s|ed|ing)?|watch(?:es|ed|ing)?|track(?:s|ed|ing)?|collect(?:s|ed|ing)?|observ(?:e|es|ed|ing|ation|ations)/i);
  }
});
