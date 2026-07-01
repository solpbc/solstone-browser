// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc
//
// Pure-logic tests for the snapshot+delta differ and JSONL serializer. These
// are layout-independent, so node exercises them directly. (The DOM-dependent
// skim walk is validated in real Chrome — see test/skim.cdp.mjs.)

import { test } from "node:test";
import assert from "node:assert/strict";

// segment.js is a classic script that publishes globalThis.SolstoneSegment;
// importing it for side effect sets the global.
await import(new URL("../extension/lib/segment.js", import.meta.url));
const S = globalThis.SolstoneSegment;

const blk = (id, text, type = "text", depth = 1, attrs) => ({ id, type, depth, text, ...(attrs ? { attrs } : {}) });

test("diffBlocks: add / update / remove keyed by id", () => {
  const prev = [blk("a", "hi"), blk("b", "Inbox", "heading", 0)];
  const next = [blk("b", "Inbox", "heading", 0), blk("c", "new mail", "message")];
  const d = S.diffBlocks(prev, next);
  assert.deepEqual(d.added.map((x) => x.id), ["c"]);
  assert.deepEqual(d.updated, []);
  assert.deepEqual(d.removed, ["a"]);
});

test("diffBlocks: same id, changed text => update", () => {
  const prev = [blk("a", "1 unread")];
  const next = [blk("a", "2 unread")];
  const d = S.diffBlocks(prev, next);
  assert.deepEqual(d.added, []);
  assert.deepEqual(d.updated.map((x) => x.id), ["a"]);
  assert.deepEqual(d.removed, []);
});

test("diffBlocks: attrs change counts as update", () => {
  const prev = [blk("a", "link", "link", 1, { linkHost: "x.com" })];
  const next = [blk("a", "link", "link", 1, { linkHost: "y.com" })];
  assert.deepEqual(S.diffBlocks(prev, next).updated.map((x) => x.id), ["a"]);
});

test("diffBlocks: identical => no change", () => {
  const prev = [blk("a", "hi"), blk("b", "yo")];
  const d = S.diffBlocks(prev, prev.map((x) => ({ ...x })));
  assert.equal(d.added.length + d.updated.length + d.removed.length, 0);
});

test("snapshotLine shape", () => {
  const blocks = [blk("a", "hi")];
  const line = S.snapshotLine("mail.google.com", { url: "u", title: "t", adapter: "gmail" }, blocks, 1000, 0);
  assert.equal(line.t, "segment_start");
  assert.equal(line.site, "mail.google.com");
  assert.equal(line.adapter, "gmail");
  assert.equal(line.n, 1);
  assert.equal(line.ts, 1000);
  assert.deepEqual(line.blocks, blocks);
});

test("deltaLines orders add, update, remove and shapes remove as {id}", () => {
  const diff = { added: [blk("c", "new")], updated: [blk("a", "x")], removed: ["z"] };
  const lines = S.deltaLines("s", diff, 5, 1.2);
  assert.deepEqual(lines.map((l) => l.op), ["add", "update", "remove"]);
  assert.deepEqual(lines[2].block, { id: "z" });
  assert.equal(lines[0].t, "delta");
  assert.equal(lines[0].rel, 1.2);
});

test("serializeJsonl / parseJsonl round-trip", () => {
  const lines = [
    S.snapshotLine("s", { url: "u", title: "t", adapter: "generic" }, [blk("a", "hi")], 1, 0),
    ...S.deltaLines("s", { added: [blk("b", "new")], updated: [], removed: [] }, 2, 0.5),
  ];
  const text = S.serializeJsonl(lines);
  assert.ok(text.endsWith("\n"));
  assert.equal(text.trim().split("\n").length, 2);
  assert.deepEqual(S.parseJsonl(text), lines);
});

test("serializeJsonl empty => empty string", () => {
  assert.equal(S.serializeJsonl([]), "");
});

test("segmentKey from injected parts (deterministic)", () => {
  assert.equal(S.segmentKey(0, 300, { hh: "14", mm: "30", ss: "05" }), "143005_300");
  assert.equal(S.segmentKey(0, 7.9, { hh: "09", mm: "00", ss: "00" }), "090000_7");
});

test("dayKey from injected parts", () => {
  assert.equal(S.dayKey(0, { y: "2026", m: "06", d: "30" }), "20260630");
});

test("fileForSite slugs host -> browser_<slug>.jsonl", () => {
  assert.equal(S.fileForSite("mail.google.com"), "browser_mail-google-com.jsonl");
  assert.equal(S.fileForSite("app.slack.com"), "browser_app-slack-com.jsonl");
  assert.equal(S.fileForSite("localhost:3000"), "browser_localhost-3000.jsonl");
});

test("segment key matches the journal envelope pattern ^\\d{6}_\\d+$", () => {
  const key = S.segmentKey(0, 300, { hh: "00", mm: "00", ss: "00" });
  assert.match(key, /^\d{6}_\d+$/);
});
