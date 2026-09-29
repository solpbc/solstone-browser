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
await import(new URL("../extension/lib/hosts.js", import.meta.url));
await import(new URL("../extension/lib/gate.js", import.meta.url));
await import(new URL("../extension/lib/native_outbox.js", import.meta.url));
await import(new URL("../extension/lib/native_port.js", import.meta.url));
await import(new URL("../extension/lib/router.js", import.meta.url));
await import(new URL("../extension/adapters.js", import.meta.url));
await import(new URL("../extension/skim.js", import.meta.url));

const Constants = globalThis.SolstoneNativeBrowserConstants;
const Blocks = globalThis.SolstoneBlocks;
const Adapters = globalThis.SolstoneAdapters;
const Skim = globalThis.SolstoneSkim;
const DB = globalThis.SolstoneDB;
const Outbox = globalThis.SolstoneNativeOutbox;
const PortController = globalThis.SolstoneNativePort;
const Router = globalThis.SolstoneRouter;

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
    monotonicNow: 1000,
  });

  assert.equal(res.enqueued, true);
  const head = await Outbox.getHead();
  assert.ok(head);
  const exactBytes = new TextEncoder().encode(JSON.stringify(head)).byteLength;
  assert.equal(head.bytes, exactBytes + 64);
  assert.equal(res.bytes, exactBytes + 64);
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
    monotonicNow: 2000,
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
    monotonicNow: 1000,
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
    monotonicNow: 2000,
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
    monotonicNow: 1000,
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
    monotonicNow: 2000,
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
    monotonicNow: 1000,
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
    monotonicNow: 2000,
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
    monotonicNow: 1000,
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
    monotonicNow: 2000,
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
    monotonicNow: 500000,
  });

  // 1 ms before max age: does not retire
  const resNoop = await Outbox.retireExpired(1000 + Constants.OUTBOX_AGE_MS_MAX - 1);
  assert.equal(resNoop.count, 0);

  // Exactly at max age: b1 retires
  const resRetire = await Outbox.retireExpired(1000 + Constants.OUTBOX_AGE_MS_MAX);
  assert.equal(resRetire.count, 1);
  assert.equal(resRetire.disposition, "expired_unaccepted");

  const all = await Outbox.getAll();
  assert.equal(all.some((x) => x.batchId === b1.batchId), false);

  // Descendant promoted to snapshot (sendSnapshot = true without rewriting records)
  const b2Promoted = all.find((x) => x.batchId === b2.batchId);
  assert.ok(b2Promoted);
  assert.equal(b2Promoted.sendSnapshot, true);
  assert.equal(Outbox.buildWireBatch(b2Promoted).records[0].t, "segment_start");

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
    monotonicNow: 1000,
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
    monotonicNow: 2000,
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

  const res = Skim.skim(mockRoot, Adapters.GENERIC);
  assert.equal(res.blocks.length, Constants.BLOCKS_MAX); // 1500
  assert.equal(res.omitted, true);
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

  const res = Skim.skim(mockRoot, Adapters.GENERIC);
  assert.equal(res.blocks.length, 1499);
  assert.equal(res.omitted, false);
});

test("account: monotonic floor, backward wall jump, future skew, and missing ageSampleWallMs", async () => {
  await resetDB();

  // Item 1: floor 300000 with ageSampleWallMs at T=100000
  const b1 = await Outbox.enqueueSkim({
    inst: "inst-floor",
    ctx: "ctx-1",
    destinationGeneration: "gen-1",
    senderUrl: "https://example.test/page",
    site: "example.test",
    title: "Title",
    adapter: "generic",
    blocks: [{ id: "1", text: "A" }],
    nowMs: 100000,
    monotonicNow: 100000,
  });

  // Manually update stored item to simulate a previous run that saved observedAgeMs = 300000
  await DB.tx("outbox", "readwrite", (store) => {
    const req = store.get(b1.batchId);
    req.onsuccess = () => {
      const item = req.result;
      item.observedAgeMs = 300000;
      item.ageSampleWallMs = 100000;
      store.put(item);
    };
  });

  // Fresh process (no in-memory sample), wall T + 60000 = 160000, mono 10000
  // Age computed is 300000 + 60000 = 360000. Row is still present.
  const r1 = await Outbox.retireExpired(10000, 160000);
  assert.equal(r1.count, 0);
  const itemAfterR1 = await DB.get("outbox", b1.batchId);
  assert.ok(itemAfterR1);
  assert.equal(itemAfterR1.observedAgeMs, 360000);

  // Backward wall jump: wall T - 10000 = 90000, mono 20000
  // Monotonic clock advanced by 10s, so floor advances monotonically to 370000 despite backward wall jump
  const r2 = await Outbox.retireExpired(20000, 90000);
  assert.equal(r2.count, 0);
  const itemAfterR2 = await DB.get("outbox", b1.batchId);
  assert.ok(itemAfterR2);
  assert.equal(itemAfterR2.observedAgeMs, 370000);

  // Advancing to 600000 floor: mono 250000 (370000 + (250000 - 20000) = 600000 floor >= OUTBOX_AGE_MS_MAX)
  // Retires via queuedPastOutboxAge with reason expired_unaccepted
  const r3 = await Outbox.retireExpired(250000, 340000);
  assert.equal(r3.count, 1);
  assert.equal(r3.disposition, "expired_unaccepted");
  assert.equal(await DB.get("outbox", b1.batchId), undefined);

  // Future skew test: queuedAtMs > 60000 in future
  const bFuture = await Outbox.enqueueSkim({
    inst: "inst-floor",
    ctx: "ctx-fut",
    destinationGeneration: "gen-1",
    senderUrl: "https://example.test/page",
    site: "example.test",
    title: "Title",
    adapter: "generic",
    blocks: [{ id: "f1", text: "F" }],
    nowMs: 200000,
    monotonicNow: 200000,
  });
  // Wall is 100000 (100000 < 200000 - 60000), queuedAtMs is > 60s in future
  const rFuture = await Outbox.retireExpired(1000, 100000);
  assert.equal(rFuture.count, 1);
  assert.equal(rFuture.disposition, "age_policy");
  assert.equal(rFuture.reason, "age_policy");
  assert.equal((await DB.get("meta", "lossNotice")).reason, "age_policy");

  // Missing ageSampleWallMs test: does not use queuedAtMs as sample
  const bNoSample = await Outbox.enqueueSkim({
    inst: "inst-floor",
    ctx: "ctx-nosample",
    destinationGeneration: "gen-1",
    senderUrl: "https://example.test/page",
    site: "example.test",
    title: "Title",
    adapter: "generic",
    blocks: [{ id: "ns1", text: "NS" }],
    nowMs: 100000,
    monotonicNow: 100000,
  });
  await DB.tx("outbox", "readwrite", (store) => {
    const req = store.get(bNoSample.batchId);
    req.onsuccess = () => {
      const item = req.result;
      item.observedAgeMs = 50000;
      delete item.ageSampleWallMs;
      store.put(item);
    };
  });
  // Wall age remains a lower bound even without a saved wall sample.
  const rNoSample = await Outbox.retireExpired(1000, 500000);
  assert.equal(rNoSample.count, 0);
  const itemNoSample = await DB.get("outbox", bNoSample.batchId);
  assert.equal(itemNoSample.observedAgeMs, 400000);
});

function settleRowBytes(row) {
  let itemBytes = Outbox.byteLengthOf(row);
  row.bytes = itemBytes;
  while (true) {
    const nextBytes = Outbox.byteLengthOf(row);
    if (nextBytes === row.bytes) break;
    row.bytes = nextBytes;
  }
  return row;
}

test("account: near-cap snapshot_required preserves bytes, id, queuedAtMs, and records", async () => {
  await resetDB();

  const payloadText = 'ä"\\🚀'.repeat(25000);
  const rowA = {
    batchId: "a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1",
    seq: 1,
    inst: "00000000-0000-0000-0000-000000000001",
    ctx: "ctx-1",
    destinationGeneration: "gen-a",
    queuedAtMs: 1000,
    sendSnapshot: false,
    records: [{
      t: "segment_start",
      ts: 1000,
      inst: "00000000-0000-0000-0000-000000000001",
      ctx: "ctx-1",
      title: "Title",
      url: "https://example.test/page",
      site: "example.test",
      adapter: "generic",
      blocks: [{ id: "1", type: "heading", depth: 0, text: "short" }],
    }],
    snapshotRecords: [{
      t: "segment_start",
      ts: 1000,
      inst: "00000000-0000-0000-0000-000000000001",
      ctx: "ctx-1",
      title: "Title",
      url: "https://example.test/page",
      site: "example.test",
      adapter: "generic",
      blocks: [{ id: "1", type: "heading", depth: 0, text: payloadText }],
    }],
  };
  settleRowBytes(rowA);
  assert.ok(rowA.bytes >= 200_000);

  const rowB = {
    batchId: "b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2",
    seq: 2,
    inst: "00000000-0000-0000-0000-000000000001",
    ctx: "ctx-2",
    destinationGeneration: "gen-a",
    queuedAtMs: 1000,
    sendSnapshot: false,
    records: [{
      t: "segment_start",
      ts: 1000,
      inst: "00000000-0000-0000-0000-000000000001",
      ctx: "ctx-2",
      title: "Title",
      url: "https://example.test/page",
      site: "example.test",
      adapter: "generic",
      blocks: [{ id: "1", type: "heading", depth: 0, text: "B" }],
    }],
    snapshotRecords: [{
      t: "segment_start",
      ts: 1000,
      inst: "00000000-0000-0000-0000-000000000001",
      ctx: "ctx-2",
      title: "Title",
      url: "https://example.test/page",
      site: "example.test",
      adapter: "generic",
      blocks: [{ id: "1", type: "heading", depth: 0, text: "B" }],
    }],
    bytes: Constants.OUTBOX_BYTES_MAX - rowA.bytes - 1000,
  };
  assert.ok(rowA.bytes + rowB.bytes > Constants.OUTBOX_BYTES_MAX - 1048576);
  assert.ok(rowA.bytes + rowB.bytes <= Constants.OUTBOX_BYTES_MAX);

  await DB.put("outbox", rowA);
  await DB.put("outbox", rowB);

  const initialCap = await Outbox.getCapacityStatus();

  await Outbox.applyRejectedReceipt(rowA.batchId, { reason: "snapshot_required", class: "retryable" });

  const rowAAfter = await DB.get("outbox", rowA.batchId);
  assert.ok(rowAAfter);
  assert.equal(rowAAfter.bytes, rowA.bytes);
  assert.equal(rowAAfter.batchId, rowA.batchId);
  assert.equal(rowAAfter.queuedAtMs, rowA.queuedAtMs);
  assert.deepEqual(rowAAfter.records, rowA.records);
  assert.equal(rowAAfter.sendSnapshot, true);

  const rowBAfter = await DB.get("outbox", rowB.batchId);
  assert.ok(rowBAfter);
  assert.equal(rowBAfter.bytes, rowB.bytes);

  const endCap = await Outbox.getCapacityStatus();
  assert.ok(endCap.totalBytes <= Constants.OUTBOX_BYTES_MAX);
  assert.ok(endCap.totalBytes <= initialCap.totalBytes);
});

test("account: near-cap predecessor loss promotes descendant without growing total", async () => {
  await resetDB();

  const payloadText = 'ä"\\🚀'.repeat(25000);

  const rowD = {
    batchId: "d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1d1",
    seq: 2,
    inst: "00000000-0000-0000-0000-000000000001",
    ctx: "ctx-1",
    destinationGeneration: "gen-new",
    queuedAtMs: 2000,
    sendSnapshot: false,
    records: [{
      t: "delta",
      ts: 2000,
      op: "add",
      inst: "00000000-0000-0000-0000-000000000001",
      ctx: "ctx-1",
      title: "Title",
      url: "https://example.test/page",
      site: "example.test",
      adapter: "generic",
      block: { id: "2", type: "heading", depth: 0, text: "new" },
    }],
    snapshotRecords: [{
      t: "segment_start",
      ts: 2000,
      inst: "00000000-0000-0000-0000-000000000001",
      ctx: "ctx-1",
      title: "Title",
      url: "https://example.test/page",
      site: "example.test",
      adapter: "generic",
      blocks: [{ id: "1", type: "heading", depth: 0, text: payloadText }],
    }],
  };
  settleRowBytes(rowD);
  assert.ok(rowD.bytes >= 200_000);

  const rowS = {
    batchId: "s1s1s1s1s1s1s1s1s1s1s1s1s1s1s1s1",
    seq: 3,
    inst: "00000000-0000-0000-0000-000000000001",
    ctx: "ctx-sibling",
    destinationGeneration: "gen-new",
    queuedAtMs: 2000,
    sendSnapshot: false,
    records: [{
      t: "segment_start",
      ts: 2000,
      inst: "00000000-0000-0000-0000-000000000001",
      ctx: "ctx-sibling",
      title: "Title",
      url: "https://example.test/page",
      site: "example.test",
      adapter: "generic",
      blocks: [{ id: "1", type: "heading", depth: 0, text: "sibling" }],
    }],
    snapshotRecords: [{
      t: "segment_start",
      ts: 2000,
      inst: "00000000-0000-0000-0000-000000000001",
      ctx: "ctx-sibling",
      title: "Title",
      url: "https://example.test/page",
      site: "example.test",
      adapter: "generic",
      blocks: [{ id: "1", type: "heading", depth: 0, text: "sibling" }],
    }],
    bytes: Constants.OUTBOX_BYTES_MAX - rowD.bytes - 10000,
  };
  assert.ok(rowD.bytes + rowS.bytes > Constants.OUTBOX_BYTES_MAX - 1048576);
  assert.ok(rowD.bytes + rowS.bytes <= Constants.OUTBOX_BYTES_MAX);

  const rowP = {
    batchId: "p1p1p1p1p1p1p1p1p1p1p1p1p1p1p1p1",
    seq: 1,
    inst: "00000000-0000-0000-0000-000000000001",
    ctx: "ctx-1",
    destinationGeneration: "gen-old",
    queuedAtMs: 1000,
    sendSnapshot: false,
    records: [{
      t: "segment_start",
      ts: 1000,
      inst: "00000000-0000-0000-0000-000000000001",
      ctx: "ctx-1",
      title: "Title",
      url: "https://example.test/page",
      site: "example.test",
      adapter: "generic",
      blocks: [{ id: "1", type: "heading", depth: 0, text: "old" }],
    }],
    snapshotRecords: [{
      t: "segment_start",
      ts: 1000,
      inst: "00000000-0000-0000-0000-000000000001",
      ctx: "ctx-1",
      title: "Title",
      url: "https://example.test/page",
      site: "example.test",
      adapter: "generic",
      blocks: [{ id: "1", type: "heading", depth: 0, text: "old" }],
    }],
    bytes: 5000,
  };

  assert.ok(rowP.bytes + rowD.bytes + rowS.bytes <= Constants.OUTBOX_BYTES_MAX);

  await DB.put("outbox", rowP);
  await DB.put("outbox", rowD);
  await DB.put("outbox", rowS);

  await DB.put("producer", {
    contextKey: "00000000-0000-0000-0000-000000000001\nctx-1",
    inst: "00000000-0000-0000-0000-000000000001",
    ctx: "ctx-1",
    blocks: [],
    generation: "gen-old",
    snapshotRequired: false,
  });

  const startCap = await Outbox.getCapacityStatus();

  await Outbox.retireStaleGeneration(rowD.destinationGeneration);

  const rowDAfter = await DB.get("outbox", rowD.batchId);
  assert.ok(rowDAfter);
  assert.equal(rowDAfter.bytes, rowD.bytes);
  assert.equal(rowDAfter.batchId, rowD.batchId);
  assert.equal(rowDAfter.queuedAtMs, rowD.queuedAtMs);
  assert.equal(rowDAfter.sendSnapshot, true);

  const rowSAfter = await DB.get("outbox", rowS.batchId);
  assert.ok(rowSAfter);
  assert.equal(rowSAfter.bytes, rowS.bytes);

  const rowPAfter = await DB.get("outbox", rowP.batchId);
  assert.equal(rowPAfter, undefined);

  const postCap = await Outbox.getCapacityStatus();
  assert.ok(postCap.totalBytes <= startCap.totalBytes);
  assert.ok(postCap.totalBytes <= Constants.OUTBOX_BYTES_MAX);
});

test("account: lone-surrogate enqueue is refused with code lone_surrogate and leaves no outbox or producer record", async () => {
  await resetDB();

  let schemaErr = null;
  try {
    await Outbox.enqueueSkim({
      inst: "inst-cap",
      ctx: "ctx-invalid",
      destinationGeneration: "gen-2",
      senderUrl: "https://example.test/page",
      site: "example.test",
      title: "Invalid",
      adapter: "generic",
      blocks: [{ id: "bad", type: "\ud800", text: "Invalid surrogate" }],
      nowMs: 4000,
    monotonicNow: 4000,
    });
  } catch (err) {
    schemaErr = err;
  }
  assert.ok(schemaErr);
  assert.equal(schemaErr.code, "lone_surrogate");

  const outboxRecords = await Outbox.getAll();
  assert.equal(outboxRecords.length, 0);
  const producerRecord = await DB.get("producer", "inst-cap\nctx-invalid");
  assert.equal(producerRecord, undefined);
});

test("account: outbox-full sets siteRejection with pressure reflecting DB status", async () => {
  await resetDB();
  const port = new PortController({
    inst: "00000000-0000-0000-0000-000000000001",
    runtimeId: "fgfnkcefedeheoeamppkiiloncfekakf",
    connectNative: () => ({
      postMessage() {},
      disconnect() {},
      onMessage: { addListener() {} },
      onDisconnect: { addListener() {} },
    }),
  });
  port.consentVersion = 1;
  port.hostCapture = "permitted";
  port.capturePermitted = true;
  port.destinationGeneration = "gen-1";
  port.connectionToken = "tok-1";
  port.grantedOrigins.add("https://example.test");
  port.lease = { token: "tok-1", generation: "gen-1", freshnessMs: 10000, receivedAt: port.now() };

  // Plant huge item in DB to make Outbox full
  await DB.put("outbox", {
    batchId: "huge-batch",
    seq: 1,
    inst: port.inst,
    ctx: "ctx-1",
    destinationGeneration: "gen-1",
    queuedAtMs: 1000,
    records: [],
    snapshotRecords: [],
    bytes: Constants.OUTBOX_BYTES_MAX,
  });

  const sender = {
    id: "fgfnkcefedeheoeamppkiiloncfekakf",
    tab: { id: 80 },
    frameId: 0,
    documentId: "doc-80",
    url: "https://example.test/page",
    origin: "https://example.test",
  };

  await Router.route({ kind: "hello", realmToken: "r-full" }, sender, {
    runtimeId: "fgfnkcefedeheoeamppkiiloncfekakf",
    port, confirmRealm: async () => true,
  });

  const skimRes = await Router.route(
    {
      kind: "skim", captureEpoch: port.captureEpoch, connectionGeneration: port.connectionGeneration, destinationGeneration: port.destinationGeneration, leaseToken: port.lease?.token,
      realmToken: "r-full",
      blocks: [{ id: "1", type: "heading", depth: 0, text: "Will fail full" }],
    },
    sender,
    { runtimeId: "fgfnkcefedeheoeamppkiiloncfekakf", port }
  );

  assert.equal(skimRes.ok, false);
  assert.equal(skimRes.error, "outbox-full");
  assert.equal(port.siteNotices.some((n) => n.origin === "https://example.test" && n.kind === "enqueue" && n.bound === "outbox-full"), true);
  assert.equal(port.pressure.active, true);
});

test("account: dismissLoss(oldSeq) does not clear newer notice", async () => {
  await resetDB();
  await DB.put("meta", { seq: 5, reason: "stale_generation", count: 2 }, "lossNotice");
  await DB.put("meta", 5, "lossSeq");

  // Dismissing oldSeq (4) returns false and does not delete notice
  const dOld = await Outbox.dismissLoss(4);
  assert.equal(dOld, false);
  const noticeStill = await DB.get("meta", "lossNotice");
  assert.ok(noticeStill);
  assert.equal(noticeStill.seq, 5);

  // Dismissing matching seq (5) returns true and deletes notice
  const dMatching = await Outbox.dismissLoss(5);
  assert.equal(dMatching, true);
  const noticeGone = await DB.get("meta", "lossNotice");
  assert.equal(noticeGone, undefined);
});


function agingFixture(ctx, wall=1000000) {
  return {inst:"fixture",ctx,destinationGeneration:"g",senderUrl:"https://example.test/page",
    site:"example.test",title:"Fixture",adapter:"generic",blocks:[{id:"1",type:"text",depth:0,text:ctx}],
    nowMs:wall,monotonicNow:0};
}

test("account: forward wall equality retires despite a newer monotonic sample", async () => {
  await resetDB();
  const item=await Outbox.enqueueSkim(agingFixture("wall"));
  await Outbox.retireExpired(0,1000000);
  const retired=await Outbox.retireExpired(1,1000000+Constants.OUTBOX_AGE_MS_MAX);
  assert.equal(retired.count,1);
  assert.equal(await DB.get("outbox",item.batchId),undefined);
});

test("account: age metadata growth fits its reserved bytes without changing replay", async () => {
  await resetDB();
  const item=await Outbox.enqueueSkim(agingFixture("growth"));
  const before=await DB.get("outbox",item.batchId);
  await Outbox.retireExpired(0,1000000);
  await Outbox.retireExpired(12345.12345,1012345);
  const after=await DB.get("outbox",item.batchId);
  assert.ok(Outbox.byteLengthOf(after) <= after.bytes);
  assert.equal(after.bytes,before.bytes);
  assert.deepEqual(Outbox.buildWireBatch(after),Outbox.buildWireBatch(before));
  const actual=(await DB.getAll("outbox")).reduce((n,row)=>n+Outbox.byteLengthOf(row),0)+
    (await DB.getAll("producer")).reduce((n,row)=>n+Outbox.byteLengthOf(row),0);
  assert.ok(actual <= (await Outbox.getCapacityStatus()).totalBytes);
});

test("account: undisclosed losses accumulate across permanent refusals", async () => {
  await resetDB();
  const first=await Outbox.enqueueSkim(agingFixture("first"));
  const second=await Outbox.enqueueSkim(agingFixture("second"));
  const receipt={reason:"oversize",class:"permanent"};
  await Outbox.applyRejectedReceipt(first.batchId,receipt);
  const old=await DB.get("meta","lossNotice");
  await Outbox.applyRejectedReceipt(second.batchId,receipt);
  const current=await DB.get("meta","lossNotice");
  assert.equal(current.count,2);
  assert.ok(current.seq > old.seq);
  assert.equal(await Outbox.dismissLoss(old.seq),false);
});

test("account: pressure persists until capacity actually falls", async () => {
  await resetDB();
  const item=await Outbox.enqueueSkim(agingFixture("pressure"));
  const p=new PortController({inst:"fixture",runtimeId:"fgfnkcefedeheoeamppkiiloncfekakf"});
  const cap=await Outbox.getCapacityStatus();
  p.pressure={active:true,blockedAtBytes:cap.totalBytes};
  await p.refreshStorageStatus(); assert.equal(p.pressure.active,true);
  await Outbox.removeBatch(item.batchId);
  await p.refreshStorageStatus(); assert.equal(p.pressure.active,false);
});


test("account: expiry repairs a surviving delta between separate retired rows", async () => {
  await resetDB();
  const W=1000000;
  const rows=[];
  for (const [i,wall] of [W-1000,W,W-1000].entries()) {
    const fixture=agingFixture("clock-jump",wall);
    fixture.blocks=[{id:"1",type:"text",depth:0,text:String(i)}];
    rows.push(await Outbox.enqueueSkim(fixture));
  }
  const result=await Outbox.retireExpired(599000,W+599000);
  assert.equal(result.count,2);
  const survivors=await Outbox.getAll();
  assert.equal(survivors.length,1);
  assert.equal(survivors[0].batchId,rows[1].batchId);
  assert.equal(Outbox.buildWireBatch(survivors[0]).records[0].t,"segment_start");
});
