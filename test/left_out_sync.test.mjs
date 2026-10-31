// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import assert from "node:assert/strict";
import test from "node:test";

await import(new URL("../extension/lib/hosts.js", import.meta.url));
await import(new URL("../extension/lib/left_out.js", import.meta.url));

const L = globalThis.SolstoneLeftOut;
const H = globalThis.SolstoneHosts;
const accept = (h) => H.excludedHostname(h) === h;

test("applyList drops malformed hosts without refusing the frame", () => {
  const result = L.applyList({
    epoch: "e1",
    rev: 1,
    savedEpoch: null,
    savedRev: 0,
    savedList: [],
    localExcluded: [],
    frameList: ["valid.example", "bad host with space", "another.test/slash", "[::1]"],
    acceptHost: accept,
  });
  assert.deepEqual(result.list, ["[::1]", "valid.example"]);
  assert.equal(result.haveSavedList, true);
});

test("applyList: same epoch equal rev unions and removes nothing", () => {
  const result = L.applyList({
    epoch: "e1",
    rev: 5,
    savedEpoch: "e1",
    savedRev: 5,
    savedList: ["bank.com"],
    localExcluded: ["local.test"],
    frameList: ["x.com"],
    acceptHost: accept,
  });
  assert.deepEqual(result.list, ["bank.com", "x.com"]);
  assert.deepEqual(result.localExcluded, ["local.test"]);
  assert.deepEqual(result.migrated, []);
});

test("applyList: saved bank.com rev 5 vs frame [] rev 5 keeps host out", () => {
  const result = L.applyList({
    epoch: "e1",
    rev: 5,
    savedEpoch: "e1",
    savedRev: 5,
    savedList: ["bank.com"],
    localExcluded: [],
    frameList: [],
    acceptHost: accept,
  });
  assert.deepEqual(result.list, ["bank.com"]);
  assert.deepEqual(result.localExcluded, []);
  assert.deepEqual(result.migrated, []);
});

test("applyList: saved bank.com rev 5 vs frame [] rev 2 migrates into localExcluded", () => {
  const result = L.applyList({
    epoch: "e1",
    rev: 2,
    savedEpoch: "e1",
    savedRev: 5,
    savedList: ["bank.com"],
    localExcluded: ["existing.local"],
    frameList: [],
    acceptHost: accept,
  });
  assert.deepEqual(result.list, []);
  assert.deepEqual(result.localExcluded, ["bank.com", "existing.local"]);
  assert.deepEqual(result.migrated, ["bank.com"]);
});

test("applyList: epoch change E1 -> E2 migrates bank.com into localExcluded", () => {
  const result = L.applyList({
    epoch: "e2",
    rev: 1,
    savedEpoch: "e1",
    savedRev: 5,
    savedList: ["bank.com"],
    localExcluded: [],
    frameList: ["new.example"],
    acceptHost: accept,
  });
  assert.deepEqual(result.list, ["new.example"]);
  assert.deepEqual(result.localExcluded, ["bank.com"]);
  assert.deepEqual(result.migrated, ["bank.com"]);
  assert.equal(result.epoch, "e2");
  assert.equal(result.rev, 1);
});

test("applyList: same epoch higher rev removes missing host from list and localExcluded", () => {
  const result = L.applyList({
    epoch: "e1",
    rev: 6,
    savedEpoch: "e1",
    savedRev: 5,
    savedList: ["bank.com", "kept.example"],
    localExcluded: ["bank.com", "other.test"],
    frameList: ["kept.example"],
    acceptHost: accept,
  });
  assert.deepEqual(result.list, ["kept.example"]);
  // bank.com missing from frame is removed from localExcluded
  assert.deepEqual(result.localExcluded, ["other.test"]);
  assert.deepEqual(result.migrated, []);
});

test("noteAck: ack 6 does not settle rule 7, matching id settles, missing ack pending", () => {
  assert.equal(L.noteAck({ outstandingId: 7, ackId: 6 }), "pending");
  assert.equal(L.noteAck({ outstandingId: 7, ackId: 7 }), "settled");
  assert.equal(L.noteAck({ outstandingId: 7, ackId: undefined }), "pending");
  assert.equal(L.noteAck({ outstandingId: 7, ackId: null }), "pending");
});

test("ruleResult checks applied vs refused based on frame effect", () => {
  const ruleOut = { id: 1, host: "bank.com", out: true };
  assert.equal(L.ruleResult({ outstanding: ruleOut, frameList: ["bank.com"] }), "applied");
  assert.equal(L.ruleResult({ outstanding: ruleOut, frameList: [] }), "refused");

  const ruleIn = { id: 2, host: "bank.com", out: false };
  assert.equal(L.ruleResult({ outstanding: ruleIn, frameList: [] }), "applied");
  assert.equal(L.ruleResult({ outstanding: ruleIn, frameList: ["bank.com"] }), "refused");
});

test("nextMigration respects 1s pacing, in-flight rule, block, refusal, and queue removals", () => {
  const queue = ["first.test", "second.test", "refused.test"];
  const refused = new Set(["refused.test"]);

  // Blocked or outstanding rule in-flight: returns null
  assert.equal(L.nextMigration({ queue, refused, blocked: true }), null);
  assert.equal(L.nextMigration({ queue, refused, outstanding: { id: 1 } }), null);

  // 1s pacing: under 1000ms returns null
  assert.equal(L.nextMigration({ queue, refused, now: 1500, lastSentAt: 1000 }), null);
  assert.equal(L.nextMigration({ queue, refused, now: 2000, lastSentAt: 1000 }), "first.test");

  // Refused host is skipped
  assert.equal(L.nextMigration({ queue: ["refused.test", "next.test"], refused, now: 2000, lastSentAt: 500 }), "next.test");

  // Queue empty or all refused
  assert.equal(L.nextMigration({ queue: ["refused.test"], refused, now: 2000 }), null);
});

test("migrationBlocked triggers at 10s", () => {
  assert.equal(L.migrationBlocked(null, 50000), false);
  assert.equal(L.migrationBlocked({ sentAt: 1000 }, 9000), false);
  assert.equal(L.migrationBlocked({ sentAt: 1000 }, 11000), true);
  assert.equal(L.migrationBlocked({ sentAt: 1000 }, 110000), true);
});
