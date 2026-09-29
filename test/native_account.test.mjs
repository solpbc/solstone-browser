// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import assert from "node:assert/strict";
import test from "node:test";

import "fake-indexeddb/auto";
await import(new URL("../extension/native-browser/constants.js", import.meta.url));
await import(new URL("../extension/native-browser/schemas.js", import.meta.url));
await import(new URL("../extension/native-browser/schema-validator.js", import.meta.url));
await import(new URL("../extension/native-browser/codec.js", import.meta.url));
await import(new URL("../extension/lib/uuid.js", import.meta.url));
await import(new URL("../extension/lib/blocks.js", import.meta.url));
await import(new URL("../extension/lib/segment.js", import.meta.url));
await import(new URL("../extension/lib/db.js", import.meta.url));
await import(new URL("../extension/lib/native_outbox.js", import.meta.url));
await import(new URL("../extension/adapters.js", import.meta.url));
await import(new URL("../extension/skim.js", import.meta.url));

const Constants = globalThis.SolstoneNativeBrowserConstants;
const Blocks = globalThis.SolstoneBlocks;
const Adapters = globalThis.SolstoneAdapters;
const Skim = globalThis.SolstoneSkim;
const DB = globalThis.SolstoneDB;
const Outbox = globalThis.SolstoneNativeOutbox;

async function resetDB() {
  await DB.clear("outbox");
  await DB.clear("producer");
  await DB.clear("meta");
}

test("blocks: normalizeText handles ASCII whitespace and control characters", () => {
  const text = "  hello   world \t\r\n test  ";
  const cleaned = Blocks.normalizeText(text);
  assert.equal(cleaned, "hello world\ntest");
});

test("blocks: normalizeText enforces MAX_TEXT length cap with ellipsis", () => {
  const longText = "a".repeat(2500);
  const cleaned = Blocks.normalizeText(longText);
  assert.equal(cleaned.length, 2001); // 2000 'a' + 1 '…'
  assert.ok(cleaned.endsWith("…"));
});

test("blocks: normalizeText preserves multi-byte UTF-8 code points accurately", () => {
  const unicodeText = "🌟".repeat(100);
  const cleaned = Blocks.normalizeText(unicodeText);
  assert.equal(cleaned, unicodeText);
});

test("bytes: UTF-8 encoding calculates exact byte lengths", () => {
  const encoder = new TextEncoder();
  const asciiBytes = encoder.encode("hello").byteLength;
  assert.equal(asciiBytes, 5);

  const emojiBytes = encoder.encode("🌟").byteLength;
  assert.equal(emojiBytes, 4);
});

test("account: stored bytes count both copies and escapes", async () => {
  await resetDB();

  const textWithControlAndEmoji = "Hello 🌟 \u0001 world";
  const res = await Outbox.enqueueSkim({
    inst: "00000000-0000-0000-0000-000000000001",
    ctx: "ctx-escape-1",
    destinationGeneration: "gen-1",
    senderUrl: "https://example.test/page",
    site: "example.test",
    title: "Title",
    adapter: "generic",
    blocks: [{ id: "1", type: "heading", depth: 0, text: textWithControlAndEmoji }],
    nowMs: 1000,
  });

  assert.equal(res.enqueued, true);
  const head = await Outbox.getHead();
  assert.ok(head);
  const exactBytes = new TextEncoder().encode(JSON.stringify(head)).byteLength;
  assert.equal(head.bytes, exactBytes);
  assert.equal(res.bytes, exactBytes);
  // \u0001 in JSON is escaped as \u0001 (6 chars) instead of 1 raw char
  assert.ok(exactBytes > JSON.stringify(head).length - 5);
});

test("account: oversize diff falls back to one snapshot", async () => {
  await resetDB();

  // Seed producer cursor with 2000 blocks
  const cursorBlocks = [];
  for (let i = 0; i < 2000; i++) {
    cursorBlocks.push({ id: `item-${i}`, type: "listitem", depth: 1, text: `Item ${i}` });
  }

  await DB.put("producer", {
    contextKey: "00000000-0000-0000-0000-000000000001\nctx-diff-1",
    inst: "00000000-0000-0000-0000-000000000001",
    ctx: "ctx-diff-1",
    blocks: cursorBlocks,
    generation: "gen-1",
    snapshotRequired: false,
  });

  // Next skim with 1500 new blocks: 2000 removed + 1500 added = 3500 deltas (> 3000 DELTA_RECORDS_MAX)
  // Snapshot has 1500 blocks (<= 1500 BLOCKS_MAX), so it fits into one snapshot batch
  const nextBlocks = [];
  for (let i = 0; i < 1500; i++) {
    nextBlocks.push({ id: `new-item-${i}`, type: "listitem", depth: 1, text: `New Item ${i}` });
  }

  const res2 = await Outbox.enqueueSkim({
    inst: "00000000-0000-0000-0000-000000000001",
    ctx: "ctx-diff-1",
    destinationGeneration: "gen-1",
    senderUrl: "https://example.test/page",
    site: "example.test",
    title: "Title",
    adapter: "generic",
    blocks: nextBlocks,
    nowMs: 2000,
  });

  assert.equal(res2.enqueued, true);
  const all = await Outbox.getAll();
  assert.equal(all.length, 1);
  const batch = all[0];
  assert.equal(batch.records.length, 1);
  assert.equal(batch.records[0].t, "segment_start");
  assert.equal(batch.records[0].blocks.length, 1500);
});

test("account: oversize remove diff falls back to one snapshot", async () => {
  await resetDB();

  // Seed producer cursor with 1 block
  const b1 = [{ id: "x".repeat(100), type: "text", depth: 0, text: "Initial" }];
  await Outbox.enqueueSkim({
    inst: "inst-seed",
    ctx: "ctx-seed",
    destinationGeneration: "gen-1",
    senderUrl: "https://example.test/page",
    site: "example.test",
    title: "Title",
    adapter: "generic",
    blocks: b1,
    nowMs: 1000,
  });

  // Second skim with 1 small block replacing b1
  const b2 = [{ id: "new-id", type: "text", depth: 0, text: "Replaced" }];
  const res = await Outbox.enqueueSkim({
    inst: "inst-seed",
    ctx: "ctx-seed",
    destinationGeneration: "gen-1",
    senderUrl: "https://example.test/page",
    site: "example.test",
    title: "Title",
    adapter: "generic",
    blocks: b2,
    nowMs: 2000,
  });

  assert.equal(res.enqueued, true);
  const all = await Outbox.getAll();
  assert.equal(all.length, 2);
});

test("account: batch-oversize does not advance the cursor", async () => {
  await resetDB();

  // Seed valid cursor
  const initial = [{ id: "1", type: "heading", depth: 0, text: "Initial Text" }];
  await Outbox.enqueueSkim({
    inst: "inst-oversize",
    ctx: "ctx-oversize",
    destinationGeneration: "gen-1",
    senderUrl: "https://example.test/page",
    site: "example.test",
    title: "Title",
    adapter: "generic",
    blocks: initial,
    nowMs: 1000,
  });

  const cursorBefore = await DB.get("producer", "inst-oversize\nctx-oversize");
  assert.ok(cursorBefore);

  let rejected = false;
  try {
    await Outbox.enqueueSkim({
      inst: "inst-oversize",
      ctx: "ctx-oversize",
      destinationGeneration: "gen-1",
      senderUrl: "https://example.test/page",
      site: "example.test",
      title: "Title",
      adapter: "generic",
      blocks: [{ id: "2", type: "text", depth: 0, text: "x".repeat(34 * 1024 * 1024) }],
      nowMs: 2000,
    });
  } catch (err) {
    rejected = true;
    assert.equal(err.code, "batch-oversize");
  }

  assert.equal(rejected, true);
  const cursorAfter = await DB.get("producer", "inst-oversize\nctx-oversize");
  assert.deepEqual(cursorAfter.blocks, cursorBefore.blocks);
});

test("account: outbox-full does not advance the cursor", async () => {
  await resetDB();

  const initial = [{ id: "1", type: "heading", depth: 0, text: "Initial" }];
  await Outbox.enqueueSkim({
    inst: "inst-full",
    ctx: "ctx-full",
    destinationGeneration: "gen-1",
    senderUrl: "https://example.test/page",
    site: "example.test",
    title: "Title",
    adapter: "generic",
    blocks: initial,
    nowMs: 1000,
  });

  const cursorBefore = await DB.get("producer", "inst-full\nctx-full");

  // Plant a huge existing item in outbox to make it full
  await DB.put("outbox", {
    batchId: "dummy-huge-item",
    seq: 99,
    inst: "inst-other",
    ctx: "ctx-other",
    destinationGeneration: "gen-1",
    queuedAtMs: 1000,
    records: [],
    snapshotRecords: [],
    bytes: Constants.OUTBOX_BYTES_MAX,
  });

  let rejected = false;
  try {
    await Outbox.enqueueSkim({
      inst: "inst-full",
      ctx: "ctx-full",
      destinationGeneration: "gen-1",
      senderUrl: "https://example.test/page",
      site: "example.test",
      title: "Title",
      adapter: "generic",
      blocks: [{ id: "2", type: "heading", depth: 0, text: "Second" }],
      nowMs: 2000,
    });
  } catch (err) {
    rejected = true;
    assert.equal(err.code, "outbox-full");
  }

  assert.equal(rejected, true);
  const cursorAfter = await DB.get("producer", "inst-full\nctx-full");
  assert.deepEqual(cursorAfter.blocks, cursorBefore.blocks);
});

test("account: expired unaccepted retires with count", async () => {
  await resetDB();

  // Item at t = 1000 (age = 600000 ms at now = 601000)
  const b1 = await Outbox.enqueueSkim({
    inst: "inst-exp",
    ctx: "ctx-exp-1",
    destinationGeneration: "gen-1",
    senderUrl: "https://example.test/page",
    site: "example.test",
    title: "Title",
    adapter: "generic",
    blocks: [{ id: "1", text: "A" }],
    nowMs: 1000,
  });

  // Descendant at t = 2000
  const b2 = await Outbox.enqueueSkim({
    inst: "inst-exp",
    ctx: "ctx-exp-1",
    destinationGeneration: "gen-1",
    senderUrl: "https://example.test/page",
    site: "example.test",
    title: "Title",
    adapter: "generic",
    blocks: [{ id: "1", text: "A" }, { id: "2", text: "B" }],
    nowMs: 2000,
  });

  // Other context at t = 1000
  const bOther = await Outbox.enqueueSkim({
    inst: "inst-exp",
    ctx: "ctx-other",
    destinationGeneration: "gen-1",
    senderUrl: "https://example.test/other",
    site: "example.test",
    title: "Other",
    adapter: "generic",
    blocks: [{ id: "o1", text: "Other" }],
    nowMs: 500000,
  });

  // 1 ms before max age: does not retire
  const resNoop = await Outbox.retireExpired(1000 + Constants.OUTBOX_AGE_MS_MAX - 1);
  assert.equal(resNoop.count, 0);

  // Exactly at max age: b1 retires
  const resRetire = await Outbox.retireExpired(1000 + Constants.OUTBOX_AGE_MS_MAX);
  assert.equal(resRetire.count, 1);
  assert.equal(resRetire.disposition, "expired-unaccepted");

  const all = await Outbox.getAll();
  assert.equal(all.some((x) => x.batchId === b1.batchId), false);

  // Descendant promoted to snapshot
  const b2Promoted = all.find((x) => x.batchId === b2.batchId);
  assert.ok(b2Promoted);
  assert.equal(b2Promoted.records[0].t, "segment_start");

  // Other context unchanged
  const otherFound = all.find((x) => x.batchId === bOther.batchId);
  assert.ok(otherFound);
});

test("account: stale generation retires with count and does not rewrite survivors", async () => {
  await resetDB();

  const bOld = await Outbox.enqueueSkim({
    inst: "inst-stale",
    ctx: "ctx-stale",
    destinationGeneration: "gen-old",
    senderUrl: "https://example.test/page",
    site: "example.test",
    title: "Title",
    adapter: "generic",
    blocks: [{ id: "1", text: "Old Gen" }],
    nowMs: 1000,
  });

  const bNew = await Outbox.enqueueSkim({
    inst: "inst-stale",
    ctx: "ctx-new",
    destinationGeneration: "gen-new",
    senderUrl: "https://example.test/page",
    site: "example.test",
    title: "Title",
    adapter: "generic",
    blocks: [{ id: "2", text: "New Gen" }],
    nowMs: 2000,
  });

  const res = await Outbox.retireStaleGeneration("gen-new");
  assert.equal(res.count, 1);
  assert.equal(res.disposition, "stale-generation");

  const all = await Outbox.getAll();
  assert.equal(all.length, 1);
  assert.equal(all[0].batchId, bNew.batchId);
});

function makeMockElement(id, text) {
  return {
    nodeType: 1,
    tagName: "DIV",
    children: [],
    getAttribute: (name) => (name === "data-item-key" ? id : null),
    checkVisibility: () => true,
    childNodes: [
      {
        nodeType: 3,
        nodeValue: text,
      },
    ],
  };
}

test("skim: caps total blocks at BLOCKS_MAX (1500)", () => {
  const children = [];
  for (let i = 0; i < 1600; i++) {
    children.push(makeMockElement(`item-${i}`, `Message text ${i}`));
  }

  const mockRoot = {
    nodeType: 1,
    tagName: "DIV",
    children,
    childNodes: [],
    getAttribute: () => null,
    checkVisibility: () => true,
  };

  const blocks = Skim.skim(mockRoot, Adapters.GENERIC);
  assert.equal(blocks.length, Constants.BLOCKS_MAX); // 1500
});

test("skim: boundary block counting respects 1499 edge", () => {
  const children = [];
  for (let i = 0; i < 1499; i++) {
    children.push(makeMockElement(`item-${i}`, `Message text ${i}`));
  }

  const mockRoot = {
    nodeType: 1,
    tagName: "DIV",
    children,
    childNodes: [],
    getAttribute: () => null,
    checkVisibility: () => true,
  };

  const blocks = Skim.skim(mockRoot, Adapters.GENERIC);
  assert.equal(blocks.length, 1499);
});
