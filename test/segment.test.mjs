// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { test } from "node:test";
import assert from "node:assert/strict";

await import(new URL("../extension/lib/blocks.js", import.meta.url));
await import(new URL("../extension/lib/segment.js", import.meta.url));
const B = globalThis.SolstoneBlocks;
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

test("blockFingerprint preserves NUL separators", () => {
  const fp = S.blockFingerprint({ type: "heading", text: "hello", attrs: { level: "1" } });
  assert.equal(fp.includes("\x00"), true);
  const parts = fp.split("\x00");
  assert.equal(parts.length, 3);
  assert.equal(parts[0], "heading");
  assert.equal(parts[1], "hello");
});
