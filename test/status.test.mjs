// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

await import(new URL("../extension/lib/status.js", import.meta.url));

const S = globalThis.SolstoneStatus;
const pairedRemote = {
  instanceId: "00112233445566778899aabbccddeeff",
  deviceToken: "token",
  homeSpki: "spki",
  relayOrigin: "https://relay.example",
  pairedAt: 100,
};

function normalized(overrides = {}, extras = {}) {
  return S.normalize(Object.assign({
    hostname: "laptop",
    allowlist: ["example.com"],
    remote: pairedRemote,
    health: { lastUploadAt: 100 },
  }, overrides), extras);
}

test("normalize emits the exact remote-only status shape", () => {
  const input = {
    hostname: "laptop",
    paused: true,
    allowlist: ["example.com"],
    pausedHosts: { "example.com": true },
    siteErrors: { "bad.example": "failed" },
    health: {
      lastError: "offline",
      lastUploadAt: 10,
      segmentsUploaded: 2,
      lastStatus: 503,
      consecutiveFailures: 3,
    },
    remote: pairedRemote,
    journalUrl: "http://localhost:5015",
    stream: "retired",
    streamName: "retired.browser",
    localRegistered: true,
    journalPermission: { required: true, granted: true },
  };
  assert.deepEqual(S.normalize(input, {
    waiting: 4,
    outboxLines: 5,
    dropped: { segments: 6, lines: 7 },
  }), {
    hostname: "laptop",
    paused: true,
    allowlist: ["example.com"],
    pausedHosts: { "example.com": true },
    siteErrors: { "bad.example": "failed" },
    health: {
      lastError: "offline",
      lastUploadAt: 10,
      segmentsUploaded: 2,
      lastStatus: 503,
      consecutiveFailures: 3,
    },
    remote: {
      paired: true,
      pending: false,
      instanceId: pairedRemote.instanceId,
      relayOrigin: pairedRemote.relayOrigin,
      pairedAt: 100,
    },
    waiting: 4,
    outboxLines: 5,
    dropped: { segments: 6, lines: 7 },
  });
});

test("normalize does not expose remote secrets or retired local fields", () => {
  const status = normalized({
    journalUrl: "http://localhost:5015",
    stream: "legacy",
    streamName: "legacy.browser",
    localRegistered: true,
    journalPermission: { required: true, granted: true },
  });
  const text = JSON.stringify(status);
  assert.equal(text.includes("token"), false);
  assert.equal(text.includes("spki"), false);
  for (const field of ["journalUrl", "stream", "streamName", "localRegistered", "journalPermission"]) {
    assert.equal(Object.hasOwn(status, field), false);
  }
});

test("connection returns exactly five kinds with exact owner copy", () => {
  const cases = [
    {
      status: normalized(),
      expected: {
        kind: "remote-connected",
        connected: true,
        stateLabel: "connected",
        destination: "your home",
        destinationDetail: "your home, reached over a sealed link",
        consequence: "",
      },
    },
    {
      status: normalized({ health: {} }),
      expected: {
        kind: "remote-ready",
        connected: false,
        stateLabel: "paired · waiting for first sync",
        destination: "your home",
        destinationDetail: "your home, reached over a sealed link",
        consequence: "",
      },
    },
    {
      status: normalized({ health: { lastError: "offline" } }),
      expected: {
        kind: "remote-error",
        connected: false,
        stateLabel: "can't reach",
        destination: "your home",
        destinationDetail: "your home, reached over a sealed link",
        consequence: "your home isn't answering. what sol takes in is kept here, waiting to sync.",
      },
    },
    {
      status: S.normalize({ remotePending: { relayOrigin: "https://relay.example" } }),
      expected: {
        kind: "remote-pending",
        connected: false,
        stateLabel: "pairing not finished",
        destination: "your home",
        destinationDetail: "your home, once pairing finishes",
        consequence: "",
      },
    },
    {
      status: S.normalize({}),
      expected: {
        kind: "unpaired",
        connected: false,
        stateLabel: "not paired",
        destination: "nowhere yet",
        destinationDetail: "your journal at your home, once you pair it",
        consequence: "set up your journal first, or what sol takes in will just pile up here.",
      },
    },
  ];

  assert.deepEqual(cases.map(({ status }) => S.connection(status).kind), [
    "remote-connected",
    "remote-ready",
    "remote-error",
    "remote-pending",
    "unpaired",
  ]);
  for (const entry of cases) assert.deepEqual(S.connection(entry.status), entry.expected);
});

test("remote first-sync boundary remains greater-than-or-equal", () => {
  assert.equal(S.connection(normalized({ health: { lastUploadAt: 99 } })).kind, "remote-ready");
  assert.equal(S.connection(normalized({ health: { lastUploadAt: 100 } })).kind, "remote-connected");
  assert.equal(S.connection(normalized({ health: { lastUploadAt: 101 } })).kind, "remote-connected");
});

test("verdict carries the pinned remote destination copy byte for byte", () => {
  assert.equal(S.verdict(normalized(), { activeSites: ["example.com"] }).sub,
    "going to your journal at your home, sealed on the way");
  assert.equal(S.verdict(normalized({
    health: { lastError: "offline" },
  }), { activeSites: ["example.com"] }).sub,
  "kept here, going to your journal at your home when it answers");
});

test("no-journal fires for unpaired with pinned copy", () => {
  assert.deepEqual(S.verdict(S.normalize({ allowlist: ["example.com"] })), {
    kind: "no-journal",
    tone: "calm",
    headline: "no journal yet",
    sub: "nothing is being taken in, and nothing is going anywhere",
    reason: "",
    actions: [{ id: "set-up", label: "set up your journal" }],
    also: [],
  });
});

test("collapsed flowing sub-line applies to unpaired browser and site errors", () => {
  const browserPaused = S.verdict(S.normalize({
    allowlist: ["example.com"],
    pausedHosts: { "example.com": true },
  }), { entryMatchHosts: { "example.com": "example.com" } });
  const siteError = S.verdict(S.normalize({
    allowlist: ["example.com"],
    siteErrors: { "example.com": "failed" },
  }));
  assert.equal(browserPaused.kind, "browser-paused");
  assert.equal(siteError.kind, "site-error");
  assert.equal(browserPaused.sub, "going to your journal at your home, sealed on the way");
  assert.equal(siteError.sub, "going to your journal at your home, sealed on the way");
});

test("verdict ladder keeps worst-signal-wins ordering", () => {
  const status = normalized({
    paused: true,
    pausedHosts: { "example.com": true },
    siteErrors: { "example.com": "failed" },
    health: { lastError: "offline" },
  }, { dropped: { segments: 1, lines: 2 } });
  const result = S.verdict(status, { entryMatchHosts: { "example.com": "example.com" }, outbox: { lines: 3 } });
  assert.equal(result.kind, "dropped");
  assert.deepEqual(result.also, ["unreachable", "paused", "browser-paused", "site-error"]);
  assert.deepEqual(result.actions, [{ id: "try-now", label: "try now" }]);
});

test("verdictForConnection keeps the unhandled-kind assert live", () => {
  assert.throws(
    () => S.verdictForConnection({ kind: "totally-unknown", connected: false }, normalized(), {}),
    /unhandled connection kind: totally-unknown/,
  );
});

test("verdict degrades malformed status to unavailable", () => {
  assert.equal(S.verdict(null).kind, "unavailable");
  assert.equal(S.verdict({}).kind, "unavailable");
  assert.equal(S.verdict(normalized(), { activeSites: "wrong" }).kind, "unavailable");
});

test("status cross-product covers 1440 combinations", () => {
  const seeds = [
    { name: "remote-connected", cfg: { remote: pairedRemote, health: { lastUploadAt: 100 } } },
    { name: "remote-ready", cfg: { remote: pairedRemote, health: {} } },
    { name: "remote-error", cfg: { remote: pairedRemote, health: { lastError: "seed failure" } } },
    { name: "remote-pending", cfg: { remotePending: { relayOrigin: "https://relay.example" } } },
    { name: "unpaired", cfg: {} },
  ];
  let cases = 0;
  for (const paused of [false, true]) {
    for (const sites of [[], ["example.com"], ["example.com", "other.example"]]) {
      for (const browserPaused of [false, true]) {
        for (const siteError of [false, true]) {
          for (const seed of seeds) {
            for (const dropped of [0, 1]) {
              for (const lastError of [false, true]) {
                for (const active of [undefined, [], ["example.com"]]) {
                  const cfg = Object.assign({}, seed.cfg, {
                    paused,
                    allowlist: sites,
                    pausedHosts: browserPaused && sites[0] ? { [sites[0]]: true } : {},
                    siteErrors: siteError && sites[0] ? { [sites[0]]: "failed" } : {},
                    health: Object.assign({}, seed.cfg.health || {}, {
                      lastError: seed.name === "remote-error" || lastError ? "offline" : null,
                    }),
                  });
                  const status = S.normalize(cfg, {
                    dropped: { segments: dropped, lines: dropped },
                    waiting: 1,
                    outboxLines: 1,
                  });
                  const extras = {
                    entryMatchHosts: Object.fromEntries(sites.map((site) => [site, site])),
                    outbox: { lines: 1 },
                  };
                  if (active !== undefined) extras.activeSites = active;
                  const result = S.verdict(status, extras);
                  assert.ok(result.kind);
                  assert.equal(typeof result.sub, "string");
                  assert.ok(S.iconState(status, extras).prefix);
                  cases += 1;
                }
              }
            }
          }
        }
      }
    }
  }
  assert.equal(cases, 2 * 3 * 2 * 2 * 5 * 2 * 2 * 3);
  assert.equal(cases, 1440);
});

test("permission-required is absent from verdict and icon mappings", () => {
  const source = fs.readFileSync(new URL("../extension/lib/status.js", import.meta.url), "utf8");
  assert.equal(source.includes("permission-required"), false);
});

test("icon assets exist for every reachable verdict", () => {
  const statuses = [
    S.normalize({}),
    S.normalize({ remotePending: { relayOrigin: "https://relay.example" } }),
    normalized({ health: {} }),
    normalized(),
    normalized({ health: { lastError: "offline" } }),
  ];
  for (const status of statuses) {
    const icon = S.iconState(status, { activeSites: ["example.com"] });
    for (const size of [16, 48, 128]) {
      assert.equal(fs.existsSync(new URL(`../extension/icons/${icon.prefix}${size}.png`, import.meta.url)), true);
    }
  }
});

test("site rows preserve port-aware grant identity", () => {
  const state = normalized({
    allowlist: ["localhost:5015", "localhost:3000"],
    pausedHosts: { localhost: true },
  });
  assert.equal(S.siteRowState("localhost:5015", Object.assign({}, state, {
    matchHost: "localhost",
  })).kind, "paused-browser");
});

test("site rows distinguish connected, waiting, reload, and idle", () => {
  assert.deepEqual(S.siteRowState("example.com", Object.assign(normalized(), {
    activeSites: ["example.com"],
  })), { kind: "on", label: "on now" });
  assert.equal(S.siteRowState("example.com", Object.assign(normalized({ health: {} }), {
    activeSites: ["example.com"],
  })).kind, "waiting");
  assert.equal(S.siteRowState("example.com", Object.assign(normalized(), {
    pageHost: "example.com",
  })).kind, "reload");
  assert.equal(S.siteRowState("example.com", normalized()).kind, "idle");
});

test("updateHealth clears success and accumulates failures", () => {
  const failed = S.updateHealth({ consecutiveFailures: 2 }, { ok: false, status: 503 });
  assert.deepEqual(failed, { consecutiveFailures: 3, lastStatus: 503, lastError: "HTTP 503" });
  assert.deepEqual(S.updateHealth(failed, { ok: true, status: 200 }), {
    consecutiveFailures: 0,
    lastStatus: 200,
    lastError: null,
  });
});
