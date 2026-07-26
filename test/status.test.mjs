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
  [{}, "no-journal", { prefix: "icon-paused-", title: "sol · no journal yet", badge: "" }],
  [{ allowlist: ["x"], paused: true }, "paused", { prefix: "icon-paused-", title: "sol · paused", badge: "" }],
  [{ allowlist: ["x"], paused: true, siteErrors: { x: "boom" } }, "paused", { prefix: "icon-paused-", title: "sol · paused", badge: "" }],
  [{ allowlist: ["x"], siteErrors: { x: "boom" } }, "site-error", { prefix: "icon-error-", title: "sol · 1 site needs attention · going to your journal on this computer", badge: "!" }],
  [{ allowlist: ["x"] }, "no-journal", { prefix: "icon-paused-", title: "sol · no journal yet", badge: "" }],
  [
    { allowlist: ["x"], journalPermission: "missing", health: { lastError: "Failed to fetch" } },
    "permission-required",
    { prefix: "icon-half-", title: "sol · your journal needs permission · kept here, going to your journal on this computer when it answers", badge: "" },
  ],
  [
    { journalPermission: "missing" },
    "permission-required",
    { prefix: "icon-half-", title: "sol · your journal needs permission · kept here, going to your journal on this computer when it answers", badge: "" },
  ],
  [
    { allowlist: ["x"], key: "k", health: { lastError: "down" } },
    "unreachable",
    { prefix: "icon-half-", title: "sol · can't reach your journal · kept here, going to your journal on this computer when it answers", badge: "" },
  ],
  [{ allowlist: ["a", "b"], key: "k" }, "on", { prefix: "icon", title: "sol · on · going to your journal on this computer", badge: "" }],
  [
    { allowlist: ["x"], key: "k", health: { lastError: "down", consecutiveFailures: 1 } },
    "unreachable",
    { prefix: "icon-half-", title: "sol · can't reach your journal · kept here, going to your journal on this computer when it answers", badge: "" },
  ],
  [
    { allowlist: ["x"], key: "k", health: { lastError: "down", consecutiveFailures: 2 } },
    "unreachable",
    { prefix: "icon-half-", title: "sol · can't reach your journal · kept here, going to your journal on this computer when it answers", badge: "" },
  ],
  [
    { allowlist: ["x"], health: { lastError: "down", consecutiveFailures: 1 } },
    "unreachable",
    { prefix: "icon-half-", title: "sol · can't reach your journal · kept here, going to your journal on this computer when it answers", badge: "" },
  ],
  [
    { allowlist: ["x"], health: { lastError: "down", consecutiveFailures: 2 } },
    "unreachable",
    { prefix: "icon-half-", title: "sol · can't reach your journal · kept here, going to your journal on this computer when it answers", badge: "" },
  ],
  [
    { allowlist: ["x"], key: "k", health: { lastError: "down" } },
    "unreachable",
    { prefix: "icon-half-", title: "sol · can't reach your journal · kept here, going to your journal on this computer when it answers", badge: "" },
  ],
  [
    { allowlist: ["x"], key: "k", siteErrors: { x: "boom" }, health: { lastError: "down", consecutiveFailures: 2 } },
    "unreachable",
    { prefix: "icon-half-", title: "sol · can't reach your journal · kept here, going to your journal on this computer when it answers", badge: "" },
  ],
  [
    { allowlist: ["x"], key: "k", health: { lastError: "down" }, waiting: 12 },
    "unreachable",
    { prefix: "icon-half-", title: "sol · can't reach your journal · kept here, going to your journal on this computer when it answers", badge: "" },
  ],
  [
    { allowlist: ["x"], key: "k", health: { lastError: "down" }, waiting: 1 },
    "unreachable",
    { prefix: "icon-half-", title: "sol · can't reach your journal · kept here, going to your journal on this computer when it answers", badge: "" },
  ],
  [
    { allowlist: ["a", "b"], key: "k", health: { lastError: "down" }, waiting: 0 },
    "unreachable",
    { prefix: "icon-half-", title: "sol · can't reach your journal · kept here, going to your journal on this computer when it answers", badge: "" },
  ],
  [
    { allowlist: ["a", "b"], waiting: 3 },
    "no-journal",
    { prefix: "icon-paused-", title: "sol · no journal yet", badge: "" },
  ],
  [
    { allowlist: ["x"], dropped: { segments: 1, lines: 8 } },
    "dropped",
    { prefix: "icon-error-", title: "sol · some updates couldn't be kept · kept here, going to your journal on this computer when it answers", badge: "!" },
  ],
  [
    { allowlist: ["x"], key: "k", pausedHosts: { x: true } },
    "browser-paused",
    { prefix: "icon-error-", title: "sol · 1 site paused by your browser · going to your journal on this computer", badge: "!" },
  ],
  [
    { allowlist: ["x"], key: "k", pausedHosts: { x: true }, siteErrors: { x: "boom" }, dropped: { segments: 1 } },
    "dropped",
    { prefix: "icon-error-", title: "sol · some updates couldn't be kept · kept here, going to your journal on this computer when it answers", badge: "!" },
  ],
  [
    { allowlist: ["a", "b"], key: "k", pausedHosts: { a: true } },
    "browser-paused",
    { prefix: "icon-error-", title: "sol · 1 site paused by your browser · going to your journal on this computer", badge: "!" },
  ],
  [
    { allowlist: ["localhost:5015", "localhost:3000"], pausedHosts: { localhost: true } },
    "browser-paused",
    { prefix: "icon-error-", title: "sol · 2 sites paused by your browser · going to your journal on this computer", badge: "!" },
  ],
  [
    { allowlist: ["a", "b"], paused: true, pausedHosts: { a: true } },
    "paused",
    { prefix: "icon-paused-", title: "sol · paused", badge: "" },
  ],
  [pureRemoteSuccess, "on", { prefix: "icon", title: "sol · on · going to your journal at your home, sealed on the way", badge: "" }],
  [retainedLocalRemoteSuccess, "on", { prefix: "icon", title: "sol · on · going to your journal at your home, sealed on the way", badge: "" }],
  [keyClearedRemoteSuccess, "on", { prefix: "icon", title: "sol · on · going to your journal at your home, sealed on the way", badge: "" }],
  [
    { allowlist: ["x"], remote: pairedRemote },
    "first-sync-pending",
    { prefix: "icon-half-", title: "sol · paired, nothing sent yet · going to your journal at your home, sealed on the way", badge: "" },
  ],
  [
    { allowlist: ["x"], remote: pairedRemote, health: { lastUploadAt: 199, segmentsUploaded: 4 } },
    "first-sync-pending",
    { prefix: "icon-half-", title: "sol · paired, nothing sent yet · going to your journal at your home, sealed on the way", badge: "" },
  ],
  [
    { allowlist: ["x"], remotePending: { relayOrigin: "https://relay.example.test" } },
    "pairing-unfinished",
    { prefix: "icon-paused-", title: "sol · pairing isn't finished", badge: "" },
  ],
  [
    { allowlist: ["x"], remote: { instanceId: pairedRemote.instanceId, relayOrigin: pairedRemote.relayOrigin } },
    "pairing-unfinished",
    { prefix: "icon-paused-", title: "sol · pairing isn't finished", badge: "" },
  ],
  [
    { allowlist: ["x"], remote: pairedRemote, health: { lastUploadAt: 201, lastError: "relay down" } },
    "unreachable",
    { prefix: "icon-half-", title: "sol · can't reach your journal · kept here, going to your journal at your home when it answers", badge: "" },
  ],
  [
    { allowlist: ["x"], health: { lastError: "registration down" }, waiting: 2 },
    "unreachable",
    { prefix: "icon-half-", title: "sol · can't reach your journal · kept here, going to your journal on this computer when it answers", badge: "" },
  ],
];

test("iconState returns the accepted toolbar status cells", () => {
  const iconsByKind = {
    dropped: { prefix: "icon-error-", badge: "!" },
    "browser-paused": { prefix: "icon-error-", badge: "!" },
    "site-error": { prefix: "icon-error-", badge: "!" },
    paused: { prefix: "icon-paused-", badge: "" },
    "no-sites": { prefix: "icon-paused-", badge: "" },
    "no-journal": { prefix: "icon-paused-", badge: "" },
    "pairing-unfinished": { prefix: "icon-paused-", badge: "" },
    unreachable: { prefix: "icon-half-", badge: "" },
    "permission-required": { prefix: "icon-half-", badge: "" },
    "first-sync-pending": { prefix: "icon-half-", badge: "" },
    unavailable: { prefix: "icon-half-", badge: "" },
    on: { prefix: "icon", badge: "" },
    idle: { prefix: "icon", badge: "" },
  };
  for (const [cfg, expectedKind, expected] of cells) {
    const status = S.normalize(cfg);
    const result = S.verdict(status, { entryMatchHosts: entryMatchHosts(cfg) });
    const icon = S.iconState(status, entryMatchHosts(cfg));
    assert.equal(result.kind, expectedKind);
    assert.deepEqual(icon, expected);
    assert.deepEqual({ prefix: icon.prefix, badge: icon.badge }, iconsByKind[result.kind]);
  }
});

test("verdict returns the exact public shape and copy for all thirteen kinds", () => {
  const exactCells = [
    [
      S.normalize({ allowlist: ["x"], key: "k", dropped: { segments: 1 } }),
      {},
      {
        kind: "dropped", tone: "attention", headline: "some updates couldn't be kept",
        sub: "kept here, going to your journal on this computer when it answers",
        reason: "sol was offline too long and dropped the oldest to make room.", actions: [], also: [],
      },
    ],
    [
      S.normalize({ allowlist: ["x"], key: "k", health: { lastError: "down" } }),
      {},
      {
        kind: "unreachable", tone: "attention", headline: "can't reach your journal",
        sub: "kept here, going to your journal on this computer when it answers",
        reason: "your journal isn't answering. what sol takes in is kept here, waiting to sync.",
        actions: [{ id: "try-now", label: "try now" }], also: [],
      },
    ],
    [
      S.normalize({ allowlist: ["x"], key: "k", journalPermission: "missing" }),
      {},
      {
        kind: "permission-required", tone: "attention", headline: "your journal needs permission",
        sub: "kept here, going to your journal on this computer when it answers",
        reason: "your journal address isn't allowed yet. what sol takes in stays here until you allow it.",
        actions: [{ id: "set-up", label: "allow your journal" }], also: [],
      },
    ],
    [
      S.normalize({ allowlist: ["x"], key: "k", paused: true }),
      {},
      {
        kind: "paused", tone: "calm", headline: "paused", sub: "nothing is being taken in",
        reason: "", actions: [], also: [],
      },
    ],
    [
      S.normalize({ allowlist: ["x"], key: "k", pausedHosts: { x: true } }),
      { entryMatchHosts: { x: "x" } },
      {
        kind: "browser-paused", tone: "attention", headline: "1 site paused by your browser",
        sub: "going to your journal on this computer",
        reason: "chrome took back access. sol paused rather than quietly forgetting.", actions: [], also: [],
      },
    ],
    [
      S.normalize({ allowlist: ["x"], key: "k", siteErrors: { x: "boom" } }),
      {},
      {
        kind: "site-error", tone: "attention", headline: "1 site needs attention",
        sub: "going to your journal on this computer", reason: "", actions: [], also: [],
      },
    ],
    [
      S.normalize({ allowlist: ["x"] }),
      {},
      {
        kind: "no-journal", tone: "calm", headline: "no journal yet",
        sub: "nothing is being taken in, and nothing is going anywhere", reason: "",
        actions: [{ id: "set-up", label: "set up your journal" }], also: [],
      },
    ],
    [
      S.normalize({ allowlist: ["x"], remotePending: { relayOrigin: pairedRemote.relayOrigin } }),
      {},
      {
        kind: "pairing-unfinished", tone: "calm", headline: "pairing isn't finished",
        sub: "nowhere yet. pairing isn't finished.", reason: "",
        actions: [{ id: "set-up", label: "finish pairing" }], also: [],
      },
    ],
    [
      S.normalize({ allowlist: [], key: "k" }),
      {},
      {
        kind: "no-sites", tone: "calm", headline: "no sites yet",
        sub: "sol takes in nothing until you add a site", reason: "", actions: [], also: [],
      },
    ],
    [
      S.normalize({ allowlist: ["x"], remote: pairedRemote }),
      {},
      {
        kind: "first-sync-pending", tone: "calm", headline: "paired, nothing sent yet",
        sub: "going to your journal at your home, sealed on the way",
        reason: "the first pages go out on the next batch.", actions: [], also: [],
      },
    ],
    [
      S.normalize({ allowlist: ["x"], key: "k" }),
      { activeSites: [] },
      {
        kind: "idle", tone: "ok", headline: "on", sub: "going to your journal on this computer",
        reason: "none of your sites are open right now.", actions: [], also: [],
      },
    ],
    [
      S.normalize({ allowlist: ["x"], key: "k", waiting: 1 }),
      { activeSites: ["x"] },
      {
        kind: "on", tone: "ok", headline: "on", sub: "going to your journal on this computer",
        reason: "waiting to sync", actions: [], also: [],
      },
    ],
    [
      {},
      {},
      {
        kind: "unavailable", tone: "unavailable", headline: "status unavailable", sub: "", reason: "",
        actions: [{ id: "open-settings", label: "open settings" }], also: [],
      },
    ],
  ];
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    for (const [status, extras, expected] of exactCells) {
      const actual = S.verdict(status, extras);
      assert.deepEqual(Object.keys(actual), ["kind", "tone", "headline", "sub", "reason", "actions", "also"]);
      assert.deepEqual(actual, expected);
    }
  } finally {
    console.warn = originalWarn;
  }
});

test("verdict applies the binding precedence pairs", () => {
  const pairs = [
    [{ allowlist: ["x"], key: "k", dropped: { segments: 1 }, health: { lastError: "down" } }, "dropped", "unreachable"],
    // A revoked journal address outranks the failure it causes: retrying cannot
    // succeed until the owner allows it.
    [
      { allowlist: ["x"], key: "k", journalPermission: "missing", health: { lastError: "down" } },
      "permission-required",
      "unreachable",
    ],
    [{ allowlist: ["x"], key: "k", paused: true, health: { lastError: "down" } }, "unreachable", "paused"],
    [{ allowlist: ["x"], key: "k", paused: true, pausedHosts: { x: true } }, "paused", "browser-paused"],
    [{}, "no-journal", "no-sites"],
  ];
  for (const [cfg, winner, loser] of pairs) {
    const result = S.verdict(S.normalize(cfg), { entryMatchHosts: entryMatchHosts(cfg) });
    assert.equal(result.kind, winner);
    assert.ok(result.also.includes(loser));
  }
});

test("verdict is total over the enumerated status cross-product", () => {
  const connectionSeeds = [
    {},
    { key: "k" },
    { key: "k", journalPermission: "missing" },
    { health: { lastError: "seed local error" } },
    { remotePending: { relayOrigin: pairedRemote.relayOrigin } },
    { remote: pairedRemote },
    { remote: pairedRemote, health: { lastUploadAt: 200 } },
    { remote: pairedRemote, health: { lastUploadAt: 200, lastError: "seed remote error" } },
  ];
  const allowedKinds = new Set([
    "dropped", "unreachable", "permission-required", "paused", "browser-paused", "site-error",
    "no-journal", "pairing-unfinished", "no-sites", "first-sync-pending", "idle", "on", "unavailable",
  ]);
  const ladderKinds = new Set([
    "dropped", "unreachable", "permission-required", "paused", "browser-paused", "site-error",
    "no-journal", "pairing-unfinished", "no-sites", "first-sync-pending",
  ]);
  const activeSiteCases = ["absent", [], ["a"]];
  let cases = 0;

  for (const paused of [false, true]) {
    for (const allowlist of [[], ["a"], ["a", "b"]]) {
      for (const pausedHosts of [{}, { a: true }]) {
        for (const siteErrors of [{}, { a: "boom" }]) {
          for (const seed of connectionSeeds) {
            for (const droppedSegments of [0, 1]) {
              for (const lastError of [null, "down"]) {
                for (const activeSites of activeSiteCases) {
                  const cfg = Object.assign({}, seed, {
                    paused,
                    allowlist,
                    pausedHosts,
                    siteErrors,
                    dropped: { segments: droppedSegments },
                    health: Object.assign({}, seed.health || {}, { lastError }),
                  });
                  const status = S.normalize(cfg);
                  const extras = { entryMatchHosts: entryMatchHosts(cfg) };
                  if (activeSites !== "absent") extras.activeSites = activeSites;
                  const result = S.verdict(status, extras);
                  cases += 1;
                  assert.ok(allowedKinds.has(result.kind), result.kind);
                  assert.notEqual(result.sub, "", result.kind);
                  assert.ok(result.also.every((kind) => ladderKinds.has(kind)));
                  if (result.tone === "ok") {
                    assert.equal(status.dropped.segments, 0);
                    assert.equal(status.health.lastError, null);
                    assert.equal(status.paused, false);
                    assert.equal(S.connection(status).connected, true);
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  assert.equal(cases, 2304);
});

test("verdict treats invalid shapes as unavailable and normalized emptiness as no-journal", () => {
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (...args) => warnings.push(args);
  try {
    for (const invalid of [null, undefined, {}]) {
      const result = S.verdict(invalid);
      assert.equal(result.kind, "unavailable");
      assert.equal(result.tone, "unavailable");
      assert.notEqual(result.kind, "on");
      assert.deepEqual(result.actions, [{ id: "open-settings", label: "open settings" }]);
      assert.deepEqual(result.also, []);
    }
  } finally {
    console.warn = originalWarn;
  }
  assert.equal(warnings.length, 3);
  for (const warning of warnings) {
    assert.match(warning[0], /^\[solstone\]/);
    assert.match(String(warning[1]), /status is not a normalize\(\) output/);
  }
  assert.equal(S.verdict(S.normalize({})).kind, "no-journal");
});

test("dropped offers dismiss only after recovery with a known-empty outbox", () => {
  const reachable = S.normalize({ allowlist: ["x"], key: "k", dropped: { segments: 1 } });
  const unreachable = S.normalize({ allowlist: ["x"], key: "k", dropped: { segments: 1 }, health: { lastError: "down" } });
  assert.deepEqual(S.verdict(unreachable, { outbox: { lines: 0 } }).actions, [{ id: "try-now", label: "try now" }]);
  assert.deepEqual(S.verdict(reachable, { outbox: { lines: 0 } }).actions, [{ id: "dismiss", label: "dismiss" }]);
  assert.deepEqual(S.verdict(reachable, { outbox: { lines: 2 } }).actions, []);
  assert.deepEqual(S.verdict(reachable).actions, []);
});

const subCells = [
  [{ allowlist: ["x"], key: "k" }, {}, "on", "going to your journal on this computer"],
  [pureRemoteSuccess, {}, "on", "going to your journal at your home, sealed on the way"],
  [{ allowlist: ["x"], key: "k" }, { activeSites: [] }, "idle", "going to your journal on this computer"],
  [pureRemoteSuccess, { activeSites: [] }, "idle", "going to your journal at your home, sealed on the way"],
  [{ allowlist: ["x"], remote: pairedRemote }, {}, "first-sync-pending", "going to your journal at your home, sealed on the way"],
  [{ allowlist: ["x"], key: "k", dropped: { segments: 1 } }, {}, "dropped", "kept here, going to your journal on this computer when it answers"],
  [Object.assign({}, pureRemoteSuccess, { dropped: { segments: 1 } }), {}, "dropped", "kept here, going to your journal at your home when it answers"],
  [{ allowlist: ["x"], key: "k", health: { lastError: "down" } }, {}, "unreachable", "kept here, going to your journal on this computer when it answers"],
  [Object.assign({}, pureRemoteSuccess, { health: { lastUploadAt: 200, lastError: "down" } }), {}, "unreachable", "kept here, going to your journal at your home when it answers"],
  [{ allowlist: ["x"], key: "k", pausedHosts: { x: true } }, { entryMatchHosts: { x: "x" } }, "browser-paused", "going to your journal on this computer"],
  [Object.assign({}, pureRemoteSuccess, { pausedHosts: { x: true } }), { entryMatchHosts: { x: "x" } }, "browser-paused", "going to your journal at your home, sealed on the way"],
  [{ allowlist: ["x"], key: "k", siteErrors: { x: "boom" } }, {}, "site-error", "going to your journal on this computer"],
  [Object.assign({}, pureRemoteSuccess, { siteErrors: { x: "boom" } }), {}, "site-error", "going to your journal at your home, sealed on the way"],
  [{ allowlist: ["x"], key: "k", paused: true }, {}, "paused", "nothing is being taken in"],
  [Object.assign({}, pureRemoteSuccess, { paused: true }), {}, "paused", "nothing is being taken in"],
  [{ allowlist: ["x"] }, {}, "no-journal", "nothing is being taken in, and nothing is going anywhere"],
  [{ allowlist: ["x"], remotePending: { relayOrigin: pairedRemote.relayOrigin } }, {}, "pairing-unfinished", "nowhere yet. pairing isn't finished."],
  [{ allowlist: [], key: "k" }, {}, "no-sites", "sol takes in nothing until you add a site"],
  [Object.assign({}, pureRemoteSuccess, { allowlist: [] }), {}, "no-sites", "sol takes in nothing until you add a site"],
];

test("verdict selects every binding sub cell by connection mode", () => {
  for (const [cfg, extras, kind, sub] of subCells) {
    const result = S.verdict(S.normalize(cfg), extras);
    assert.equal(result.kind, kind);
    assert.equal(result.sub, sub);
    if (kind === "dropped" || kind === "unreachable") {
      assert.notEqual(result.sub, "going to your journal on this computer");
      assert.notEqual(result.sub, "going to your journal at your home, sealed on the way");
    }
  }
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    assert.equal(S.verdict({}).sub, "");
  } finally {
    console.warn = originalWarn;
  }
});

test("verdict accepts normalize output without extras and never mistakes unknown active sites for idle", () => {
  const empty = S.normalize({});
  assert.doesNotThrow(() => S.verdict(empty));
  assert.equal(S.verdict(empty).kind, "no-journal");
  assert.equal(S.verdict(S.normalize({ allowlist: ["x"], key: "k" })).kind, "on");
});

test("browser-paused counts affected allowlist entries through match hosts", () => {
  const cfg = { allowlist: ["localhost:5015", "localhost:3000"], key: "k", pausedHosts: { localhost: true } };
  const result = S.verdict(S.normalize(cfg), { entryMatchHosts: entryMatchHosts(cfg) });
  assert.equal(result.kind, "browser-paused");
  assert.equal(result.headline, "2 sites paused by your browser");
});

test("health failures and dropped updates cannot earn the full-sun icon", () => {
  const failing = S.normalize({ allowlist: ["x"], key: "k", health: { lastError: "down" } });
  const failureVerdict = S.verdict(failing);
  const failureIcon = S.iconState(failing);
  assert.notEqual(failureVerdict.tone, "ok");
  assert.equal(failureIcon.prefix, "icon-half-");
  assert.equal(failureIcon.badge, "");

  const dropped = S.normalize({ allowlist: ["x"], key: "k", health: { lastError: "down" }, dropped: { segments: 1 } });
  const droppedIcon = S.iconState(dropped);
  assert.equal(S.verdict(dropped).kind, "dropped");
  assert.equal(droppedIcon.prefix, "icon-error-");
  assert.equal(droppedIcon.badge, "!");
});

test("unreachable accepts an empty connection consequence while pairing is unfinished", () => {
  const status = S.normalize({
    allowlist: ["x"],
    remotePending: { relayOrigin: pairedRemote.relayOrigin },
    health: { lastError: "down" },
  });
  const result = S.verdict(status);
  assert.equal(S.connection(status).kind, "remote-pending");
  assert.equal(result.kind, "unreachable");
  assert.equal(result.reason, "");
  assert.deepEqual(result.actions, [{ id: "try-now", label: "try now" }]);
  assert.deepEqual(result.also, ["pairing-unfinished"]);
});

test("iconState distinguishes legacy match-host maps from structured extras by value type", () => {
  const legacyStatus = S.normalize({ allowlist: ["activeSites"], key: "k", pausedHosts: { activesites: true } });
  assert.deepEqual(S.iconState(legacyStatus, { activeSites: "activesites" }), {
    prefix: "icon-error-",
    title: "sol · 1 site paused by your browser · going to your journal on this computer",
    badge: "!",
  });
  assert.equal(S.iconState(S.normalize({ allowlist: ["x"], key: "k" }), {
    activeSites: [],
    outbox: { lines: 0 },
    entryMatchHosts: { x: "x" },
  }).title, "sol · on · going to your journal on this computer");
  assert.doesNotThrow(() => S.iconState(S.normalize({})));
});

test("verdict and iconState owner strings obey the copy constraints", () => {
  const outputCells = subCells.map(([cfg, extras]) => [cfg, extras]).concat([
    [{ allowlist: ["a", "b"], key: "k", pausedHosts: { a: true, b: true } }, { entryMatchHosts: { a: "a", b: "b" } }],
    [{ allowlist: ["a", "b"], key: "k", siteErrors: { a: "x", b: "y" } }, {}],
    [{ allowlist: ["x"], key: "k", paused: true, waiting: 2 }, {}],
    [{ allowlist: ["x"], key: "k", waiting: 2 }, {}],
    [{ allowlist: ["x"], key: "k", dropped: { segments: 1 } }, { outbox: { lines: 0 } }],
    [{ allowlist: ["x"], key: "k", dropped: { segments: 1 }, health: { lastError: "down" } }, { outbox: { lines: 0 } }],
    [{ allowlist: ["x"], remotePending: { relayOrigin: pairedRemote.relayOrigin }, health: { lastError: "down" } }, {}],
  ]);
  const stringsIn = (value) => {
    if (typeof value === "string") return [value];
    if (Array.isArray(value)) return value.flatMap(stringsIn);
    if (value && typeof value === "object") return Object.values(value).flatMap(stringsIn);
    return [];
  };
  const assertAllowed = (value) => {
    for (const string of stringsIn(value)) {
      assert.doesNotMatch(string, /—/);
      assert.doesNotMatch(string, /\busers?\b|captur(?:e|es|ed|ing)|record(?:s|ed|ing)?|monitor(?:s|ed|ing)?|watch(?:es|ed|ing)?|track(?:s|ed|ing)?|collect(?:s|ed|ing)?|observ(?:e|es|ed|ing|ation|ations)/i);
    }
  };

  for (const [cfg, extras] of outputCells) {
    const status = S.normalize(cfg);
    assertAllowed(S.verdict(status, extras));
    assertAllowed(S.iconState(status, extras));
  }
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    assertAllowed(S.verdict({}));
    assertAllowed(S.iconState({}));
  } finally {
    console.warn = originalWarn;
  }
  assert.throws(() => assertAllowed({ headline: "sol — paused" }));
  assert.throws(() => assertAllowed({ headline: "sol observes users" }));
});

test("also contains every non-winning live ladder signal in order", () => {
  const cfg = {
    allowlist: ["x"],
    key: "k",
    paused: true,
    pausedHosts: { x: true },
    siteErrors: { x: "boom" },
    health: { lastError: "down" },
    dropped: { segments: 1 },
  };
  assert.deepEqual(S.verdict(S.normalize(cfg), { entryMatchHosts: { x: "x" } }).also, [
    "unreachable", "paused", "browser-paused", "site-error",
  ]);
  assert.deepEqual(S.verdict(S.normalize({})).also, ["no-sites"]);
  assert.deepEqual(S.verdict(S.normalize({ allowlist: ["x"], key: "k" })).also, []);
  assert.deepEqual(S.verdict(S.normalize({ allowlist: ["x"], key: "k" }), { activeSites: [] }).also, []);
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
  assert.deepEqual(S.connection(S.normalize({ journalPermission: "missing", health: { lastError: "Failed to fetch" } })), {
    kind: "local-permission-required", connected: false, stateLabel: "needs permission", destination: "this computer",
    destinationDetail: "your journal on this computer",
    consequence: "your journal address isn't allowed yet. what sol takes in stays here until you allow it.",
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

test("fresh-install-never-attempted is not local-permission-required", () => {
  const connection = S.connection(S.normalize({ journalPermission: "unknown" }));
  assert.equal(connection.kind, "local-pending");
  assert.notEqual(connection.kind, "local-permission-required");
});

test("revoked journal permission is local-permission-required", () => {
  const connection = S.connection(S.normalize({
    journalPermission: "missing",
    key: "formerly-working",
    health: { lastError: "Failed to fetch" },
  }));
  assert.equal(connection.kind, "local-permission-required");
  assert.equal(connection.stateLabel, "needs permission");

  const remote = S.connection(S.normalize({
    journalPermission: "missing",
    remote: pairedRemote,
    health: { lastUploadAt: 201 },
  }));
  assert.equal(remote.kind, "remote-connected");
});

test("journal permission checks preserve unknown and distinguish a real revoke", () => {
  assert.equal(S.journalPermissionAfterCheck("unknown", false, false), "unknown");
  assert.equal(S.journalPermissionAfterCheck("unknown", false, true), "missing");
  assert.equal(S.journalPermissionAfterCheck("granted", false, false), "missing");
  assert.equal(S.journalPermissionAfterCheck("missing", true, false), "granted");
});

test("failed journal permission checks preserve prior truth", () => {
  assert.equal(S.journalPermissionAfterCheck("granted", null, false), "granted");
  assert.equal(S.journalPermissionAfterCheck("unknown", null, true), "unknown");
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
  assert.equal(S.normalize(keyClearedRemoteSuccess).streamName, "renamed-after-pairing.browser");
  assert.equal(S.normalize({ key: "local-key", hostname: "ignored", stream: "registered.browser" }).streamName, "registered.browser");
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
  const ownerStrings = cells.map(([, , expected]) => expected.title).concat(rowCells.map(([, , expected]) => expected.label), connectionStrings);
  for (const value of ownerStrings) {
    assert.doesNotMatch(value, /\busers?\b|captur(?:e|es|ed|ing)|record(?:s|ed|ing)?|monitor(?:s|ed|ing)?|watch(?:es|ed|ing)?|track(?:s|ed|ing)?|collect(?:s|ed|ing)?|observ(?:e|es|ed|ing|ation|ations)/i);
  }
});
