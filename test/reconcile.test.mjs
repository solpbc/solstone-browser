// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import assert from "node:assert/strict";
import test from "node:test";

await import(new URL("../extension/lib/hosts.js", import.meta.url));
await import(new URL("../extension/lib/reconcile.js", import.meta.url));

const R = globalThis.SolstoneReconcile;

test("missing grant pauses a group without deleting allowlist intent", () => {
  const allowlist = Object.freeze(["example.com"]);
  const actions = R.reconcile({ granted: [], manifestOrigins: [], exemptOrigins: [], allowlist, pausedHosts: {} });
  assert.deepEqual(actions, [{ op: "pause", matchHost: "example.com", entries: ["example.com"] }]);
  assert.deepEqual(allowlist, ["example.com"]);
  assert.equal(actions.some((action) => !["pause", "resume", "release"].includes(action.op)), false);
});

test("present grant resumes a paused group", () => {
  const actions = R.reconcile({
    granted: ["*://example.com/*"],
    manifestOrigins: [],
    exemptOrigins: [],
    allowlist: ["example.com"],
    pausedHosts: { "example.com": true },
  });
  assert.deepEqual(actions, [{ op: "resume", matchHost: "example.com", entries: ["example.com"] }]);
});

test("orphan grants are released and claimed grants are retained", () => {
  const actions = R.reconcile({
    granted: ["*://example.com/*", "*://orphan.test/*"],
    manifestOrigins: [],
    exemptOrigins: [],
    allowlist: ["example.com"],
    pausedHosts: {},
  });
  assert.deepEqual(actions, [{ op: "release", origin: "*://orphan.test/*" }]);
});

test("manifest, paired relay, and pending relay origins are exempt", () => {
  const actions = R.reconcile({
    granted: ["http://localhost:5015/*", "https://relay.example/*", "https://pending.example/*"],
    manifestOrigins: ["http://localhost:5015/*"],
    exemptOrigins: ["https://relay.example/*", "https://pending.example/*"],
    allowlist: [],
    pausedHosts: {},
  });
  assert.deepEqual(actions, []);
});

test("port siblings form one normalized pause and resume group", () => {
  const allowlist = ["LOCALHOST:5015", "localhost:3000"];
  assert.deepEqual(
    R.reconcile({ granted: [], manifestOrigins: [], exemptOrigins: [], allowlist, pausedHosts: {} }),
    [{ op: "pause", matchHost: "localhost", entries: allowlist }],
  );
  assert.deepEqual(
    R.reconcile({
      granted: ["*://localhost/*"],
      manifestOrigins: [],
      exemptOrigins: [],
      allowlist,
      pausedHosts: { localhost: true },
    }),
    [{ op: "resume", matchHost: "localhost", entries: allowlist }],
  );
});

test("unknown grant state returns a strict empty action list", () => {
  assert.deepEqual(
    R.reconcile({
      granted: null,
      manifestOrigins: [],
      exemptOrigins: [],
      allowlist: ["missing.test"],
      pausedHosts: {},
    }),
    [],
  );
});

test("consistent granted and paused states return no actions", () => {
  assert.deepEqual(
    R.reconcile({
      granted: ["*://example.com/*"],
      manifestOrigins: [],
      exemptOrigins: [],
      allowlist: ["example.com"],
      pausedHosts: {},
    }),
    [],
  );
  assert.deepEqual(
    R.reconcile({ granted: [], manifestOrigins: [], exemptOrigins: [], allowlist: ["example.com"], pausedHosts: { "example.com": true } }),
    [],
  );
});

test("permission comparisons are exact pattern-string membership", () => {
  assert.deepEqual(
    R.reconcile({
      granted: ["https://example.com/*"],
      manifestOrigins: [],
      exemptOrigins: [],
      allowlist: ["example.com"],
      pausedHosts: {},
    }),
    [
      { op: "pause", matchHost: "example.com", entries: ["example.com"] },
      { op: "release", origin: "https://example.com/*" },
    ],
  );
});

test("actions are deterministic, grouped first, and orphan releases are deduplicated", () => {
  const actions = R.reconcile({
    granted: ["*://z.test/*", "https://y.test/*", "https://b.test/*", "https://y.test/*"],
    manifestOrigins: [],
    exemptOrigins: [],
    allowlist: ["z.test:2", "a.test", "z.test:1"],
    pausedHosts: { "z.test": true },
  });
  assert.deepEqual(actions, [
    { op: "pause", matchHost: "a.test", entries: ["a.test"] },
    { op: "resume", matchHost: "z.test", entries: ["z.test:2", "z.test:1"] },
    { op: "release", origin: "https://b.test/*" },
    { op: "release", origin: "https://y.test/*" },
  ]);
});
