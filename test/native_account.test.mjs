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
await import(new URL("../extension/lib/owner_sites.js", import.meta.url));
await import(new URL("../extension/lib/router.js", import.meta.url));
await import(new URL("../extension/adapters.js", import.meta.url));
await import(new URL("../extension/skim.js", import.meta.url));

const Constants = globalThis.SolstoneNativeBrowserConstants;
const Blocks = globalThis.SolstoneBlocks;
const Seg = globalThis.SolstoneSegment;
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

test("account: old queued rows remain without expiry deletion or loss", async () => {
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

  const all = await Outbox.getAll();
  assert.deepEqual(all.map((x) => x.batchId).sort(), [b1.batchId, b2.batchId, bOther.batchId].sort());
  assert.equal(all.find((x) => x.batchId === b2.batchId).sendSnapshot, false);
  assert.equal(await DB.get("meta", "lossNotice"), undefined);
});

test("account: confirmed generation promotes the oldest held delta and keeps rows", async () => {
  await resetDB();

  const bBase = await Outbox.enqueueSkim({
    inst: "inst-stale",
    ctx: "ctx-stale",
    destinationGeneration: "gen-old",
    senderUrl: "https://example.test/page",
    site: "example.test",
    title: "Title",
    adapter: "generic",
    blocks: [{ id: "1", text: "Base" }],
    nowMs: 1000,
    monotonicNow: 1000,
  });
  await Outbox.removeBatch(bBase.batchId);

  const bOld = await Outbox.enqueueSkim({
    inst: "inst-stale",
    ctx: "ctx-stale",
    destinationGeneration: "gen-old",
    senderUrl: "https://example.test/page",
    site: "example.test",
    title: "Title",
    adapter: "generic",
    blocks: [{ id: "1", text: "Base" }, { id: "2", text: "Old delta" }],
    nowMs: 2000,
    monotonicNow: 2000,
  });
  const bSameGeneration = { ...(await DB.get("outbox", bOld.batchId)),
    batchId: "b".repeat(32), seq: bOld.seq + 1, destinationGeneration: "gen-new", sendSnapshot: false };
  settleRowBytes(bSameGeneration);
  await DB.put("outbox", bSameGeneration);
  const sameGenerationBefore = await DB.get("outbox", bSameGeneration.batchId);
  const cursorBefore = await DB.get("producer", "inst-stale\nctx-stale");

  const res = await Outbox.promoteHeldForGeneration("gen-new");
  assert.equal(res.count, 0);

  const all = await Outbox.getAll();
  assert.equal(all.length, 2);
  assert.deepEqual(all.map((x) => x.batchId).sort(), [bOld.batchId, bSameGeneration.batchId].sort());
  assert.equal((await DB.get("outbox", bOld.batchId)).sendSnapshot, true);
  assert.deepEqual(await DB.get("outbox", bSameGeneration.batchId), sameGenerationBefore);
  const cursorAfter = await DB.get("producer", "inst-stale\nctx-stale");
  assert.equal(cursorAfter.generation, "gen-new");
  assert.equal(cursorAfter.snapshotRequired, true);
  assert.deepEqual(cursorAfter.blocks, cursorBefore.blocks);
  assert.equal(await DB.get("meta", "lossNotice"), undefined);
});

test("account: returning to a previous generation promotes the remaining delta before sending", async () => {
  await resetDB();
  const fixture = blocks => ({
    inst: "00000000-0000-0000-0000-000000000001", ctx: "return-generation",
    destinationGeneration: "gen-a", senderUrl: "https://example.test/page", site: "example.test",
    title: "Title", adapter: "generic", blocks, nowMs: 1000,
  });
  const base = [{ id: "1", text: "base" }];
  const initial = await Outbox.enqueueSkim(fixture(base));
  await Outbox.removeBatch(initial.batchId);
  const first = await Outbox.enqueueSkim(fixture([...base, { id: "2", text: "first" }]));
  const second = await Outbox.enqueueSkim(fixture([...base, { id: "2", text: "first" }, { id: "3", text: "second" }]));
  const original = await DB.get("outbox", second.batchId);
  assert.equal(original.records[0].t, "delta");
  await Outbox.promoteHeldForGeneration("gen-b");
  await Outbox.removeBatch(first.batchId);
  await Outbox.promoteHeldForGeneration("gen-a");
  const remaining = await DB.get("outbox", second.batchId);
  const wire = Outbox.buildWireBatch(remaining, { destinationGeneration: "gen-a", queuedAtMs: 2000 });
  assert.equal(wire.records[0].t, "segment_start");
  assert.equal(wire.batch_id, original.batchId);
  assert.deepEqual(remaining.records, original.records);
  assert.deepEqual(wire.records, original.snapshotRecords);
  assert.equal(await DB.get("meta", "lossNotice"), undefined);
});

test("account: a held delta without its producer cursor starts with a full snapshot", async () => {
  await resetDB();
  const fixture = blocks => ({
    inst: "00000000-0000-0000-0000-000000000001", ctx: "missing-producer",
    destinationGeneration: "gen-a", senderUrl: "https://example.test/page", site: "example.test",
    title: "Title", adapter: "generic", blocks, nowMs: 1000,
  });
  const initial = await Outbox.enqueueSkim(fixture([{ id: "1", text: "base" }]));
  await Outbox.removeBatch(initial.batchId);
  const delta = await Outbox.enqueueSkim(fixture([{ id: "1", text: "changed" }]));
  assert.equal((await DB.get("outbox", delta.batchId)).records[0].t, "delta");
  await DB.del("producer", "00000000-0000-0000-0000-000000000001\nmissing-producer");
  await Outbox.promoteHeldForGeneration("gen-a");
  const wire = Outbox.buildWireBatch(await DB.get("outbox", delta.batchId));
  assert.equal(wire.records[0].t, "segment_start");
  assert.equal(wire.batch_id, delta.batchId);
});

test("account: cursor recovery and maximum generation stamps stay within a saturated byte budget", async () => {
  await resetDB();
  const key = "00000000-0000-0000-0000-000000000001\nbounded-promotion";
  const fixture = blocks => ({
    inst: "00000000-0000-0000-0000-000000000001", ctx: "bounded-promotion",
    destinationGeneration: "g", senderUrl: "https://example.test/page", site: "example.test",
    title: "Title", adapter: "generic", blocks, nowMs: 1000,
  });
  const initial = await Outbox.enqueueSkim(fixture([{ id: "1", text: "base" }]));
  await Outbox.removeBatch(initial.batchId);
  const delta = await Outbox.enqueueSkim(fixture([{ id: "1", text: "changed" }]));
  try {
    for (const recoverCursor of [false, true]) {
      if (recoverCursor) await DB.del("producer", key);
      const limit = (await Outbox.getCapacityStatus()).totalBytes;
      globalThis.SolstoneNativeBrowserConstants = { ...Constants, OUTBOX_BYTES_MAX: limit };
      await Outbox.promoteHeldForGeneration((recoverCursor ? "b" : "a").repeat(Constants.GENERATION_MAX));
      const stored = await DB.get("outbox", delta.batchId);
      const cursor = await DB.get("producer", key);
      assert.ok(Outbox.byteLengthOf(stored) + Outbox.byteLengthOf(cursor) <= limit);
      assert.ok((await Outbox.getCapacityStatus()).totalBytes <= limit);
      await assert.rejects(Outbox.enqueueSkim({ ...fixture([{ id: "1", text: "fresh" }]), ctx: "capacity-new" }),
        error => error.code === "outbox-full");
      assert.equal((await DB.get("outbox", delta.batchId)).batchId, delta.batchId);
    }
  } finally {
    globalThis.SolstoneNativeBrowserConstants = Constants;
  }
});

test("account: unauthorized generation promotion leaves a held delta and cursor unchanged", async () => {
  await resetDB();
  const inst = "00000000-0000-0000-0000-000000000001", ctx = "authorize-promotion";
  const first = await Outbox.enqueueSkim({
    inst, ctx, destinationGeneration: "gen-a", senderUrl: "https://example.test/page", site: "example.test",
    title: "Title", adapter: "generic", blocks: [{ id: "1", text: "base" }], nowMs: 1,
  });
  await Outbox.removeBatch(first.batchId);
  const delta = await Outbox.enqueueSkim({
    inst, ctx, destinationGeneration: "gen-a", senderUrl: "https://example.test/page", site: "example.test",
    title: "Title", adapter: "generic", blocks: [{ id: "1", text: "base" }, { id: "2", text: "delta" }], nowMs: 2,
  });
  const beforeRow = await DB.get("outbox", delta.batchId);
  const beforeCursor = await DB.get("producer", `${inst}\n${ctx}`);
  await assert.rejects(Outbox.promoteHeldForGeneration("gen-b", () => false), err => err.code === "authorization_failed");
  assert.deepEqual(await DB.get("outbox", delta.batchId), beforeRow);
  assert.deepEqual(await DB.get("producer", `${inst}\n${ctx}`), beforeCursor);
  const promoted = await Outbox.promoteHeldForGeneration("gen-b", () => true);
  assert.equal(promoted.count, 0);
  assert.equal((await DB.get("outbox", delta.batchId)).sendSnapshot, true);
  assert.equal((await DB.get("producer", `${inst}\n${ctx}`)).generation, "gen-b");
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
  assert.deepEqual(res.clips, ["blocks"]);
});

test("skim: exact block and text limits are not clips, and longer labels report label", () => {
  const exactBlocks = Array.from({ length: 1500 }, (_, i) => makeMockElement(`exact-${i}`, `Text ${i}`));
  const exactRoot = { nodeType:1, tagName:"DIV", children:exactBlocks, childNodes:[], getAttribute:() => null, checkVisibility:() => true };
  const exact = Skim.skim(exactRoot, Adapters.GENERIC);
  assert.equal(exact.blocks.length, 1500);
  assert.equal(exact.omitted, false);
  assert.deepEqual(exact.clips, []);

  const textResult = (text) => Skim.skim({
    nodeType:1, tagName:"DIV", children:[], childNodes:[{nodeType:3,nodeValue:text}],
    getAttribute:() => null, checkVisibility:() => true,
  }, Adapters.GENERIC);
  assert.equal(textResult("x".repeat(2000)).omitted, false);
  const longText = textResult("x".repeat(2001));
  assert.equal(longText.omitted, true);
  assert.deepEqual(longText.clips, ["text"]);

  const longLabel = {
    nodeType:1, tagName:"DIV", children:[], childNodes:[{nodeType:3,nodeValue:"content"}],
    getAttribute: (name) => name === "aria-label" ? "label".repeat(61) : null,
    checkVisibility:() => true,
  };
  const labelRoot = { nodeType:1, tagName:"DIV", children:[longLabel], childNodes:[], getAttribute:() => null, checkVisibility:() => true };
  const labelResult = Skim.skim(labelRoot, Adapters.GENERIC);
  assert.equal(labelResult.omitted, true);
  assert.deepEqual(labelResult.clips, ["label"]);
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

test("account: expiry and future-skew old rows remain, including legacy age metadata", async () => {
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

  // No outbox expiry pass interprets prior age metadata.
  const itemAfterR1 = await DB.get("outbox", b1.batchId);
  assert.ok(itemAfterR1);
  assert.equal(itemAfterR1.observedAgeMs, 300000);
  assert.equal(itemAfterR1.ageSampleWallMs, 100000);

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
  // Future-skew is a wire predicate, not a local outbox deletion rule.
  assert.ok(await DB.get("outbox", bFuture.batchId));

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
  // A manually inserted old row carrying age metadata remains untouched.
  const itemNoSample = await DB.get("outbox", bNoSample.batchId);
  assert.equal(itemNoSample.observedAgeMs, 50000);
  assert.equal(itemNoSample.ageSampleWallMs, undefined);
  const fresh = await Outbox.enqueueSkim({
    inst: "inst-floor", ctx: "ctx-fresh", destinationGeneration: "gen-1",
    senderUrl: "https://example.test/page", site: "example.test", title: "Title", adapter: "generic",
    blocks: [{ id: "fresh", text: "fresh" }], nowMs: 700000,
  });
  const freshRow = await DB.get("outbox", fresh.batchId);
  assert.equal("observedAgeMs" in freshRow, false);
  assert.equal("ageSampleWallMs" in freshRow, false);
  assert.equal(await DB.get("meta", "lossNotice"), undefined);
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

  await Outbox.promoteHeldForGeneration(rowD.destinationGeneration);

  const rowDAfter = await DB.get("outbox", rowD.batchId);
  assert.ok(rowDAfter);
  assert.equal(rowDAfter.bytes, rowD.bytes);
  assert.equal(rowDAfter.batchId, rowD.batchId);
  assert.equal(rowDAfter.queuedAtMs, rowD.queuedAtMs);
  assert.equal(rowDAfter.sendSnapshot, false);

  const rowSAfter = await DB.get("outbox", rowS.batchId);
  assert.ok(rowSAfter);
  assert.equal(rowSAfter.bytes, rowS.bytes);

  const rowPAfter = await DB.get("outbox", rowP.batchId);
  assert.ok(rowPAfter);
  assert.equal(rowPAfter.bytes, rowP.bytes);

  const postCap = await Outbox.getCapacityStatus();
  assert.ok(postCap.totalBytes <= startCap.totalBytes);
  assert.ok(postCap.totalBytes <= Constants.OUTBOX_BYTES_MAX);
  const cursor = await DB.get("producer", "00000000-0000-0000-0000-000000000001\nctx-1");
  assert.equal(cursor.generation, "gen-new");
  assert.equal(cursor.snapshotRequired, true);
  assert.equal(await DB.get("meta", "lossNotice"), undefined);
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

test("account: outbox-full records a per-site error and a matching successful skim clears only it", async () => {
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

  await Router.route({ kind: "hello", realmToken: "r-full", documentKey: "fedcba0987654321fedcba0987654321" }, sender, {
    runtimeId: "fgfnkcefedeheoeamppkiiloncfekakf",
    port, confirmRealm: async () => true,
  });

  const skimMessage = {
    kind: "skim", captureEpoch: port.captureEpoch, connectionGeneration: port.connectionGeneration, destinationGeneration: port.destinationGeneration, leaseToken: port.lease?.token,
    realmToken: "r-full",
    documentKey: "fedcba0987654321fedcba0987654321",
    blocks: [{ id: "1", type: "heading", depth: 0, text: "Will fail full" }],
  };
  const skimRes = await Router.route(skimMessage, sender, { runtimeId: "fgfnkcefedeheoeamppkiiloncfekakf", port });

  assert.equal(skimRes.ok, false);
  assert.equal(skimRes.error, "outbox-full");
  assert.equal(port.enqueue["https://example.test"], "outbox-full");
  assert.equal(port.pressure.active, true);

  await port.setEnqueueError("https://other.test", "schema-refuse");
  await DB.del("outbox", "huge-batch");
  port.pressure = { active: false };
  port.syncCaptureAuthority();
  skimMessage.captureEpoch = port.captureEpoch;
  skimMessage.blocks[0].text = "The available space is back";
  const retry = await Router.route(skimMessage, sender, { runtimeId: "fgfnkcefedeheoeamppkiiloncfekakf", port });
  assert.equal(retry.ok, true);
  assert.equal(Object.hasOwn(port.enqueue, "https://example.test"), false);
  assert.equal(port.enqueue["https://other.test"], "schema-refuse");
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

test("account: elapsed wall time does not delete a queued row", async () => {
  await resetDB();
  const item=await Outbox.enqueueSkim(agingFixture("wall"));
  assert.ok(await DB.get("outbox",item.batchId));
  assert.equal(await DB.get("meta","lossNotice"),undefined);
});

test("account: max-width transport stamp fits the stored byte budget without mutation", async () => {
  await resetDB();
  const item=await Outbox.enqueueSkim({...agingFixture("growth"),destinationGeneration:"g",nowMs:7});
  const before=await DB.get("outbox",item.batchId);
  const maxWire=Outbox.buildWireBatch(before,{
    destinationGeneration:"g".repeat(Constants.GENERATION_MAX),
    queuedAtMs:Constants.TIMESTAMP_MAX,
  });
  assert.equal(before.bytes,Outbox.byteLengthOf(before));
  assert.equal((await DB.get("outbox",item.batchId)).bytes,before.bytes);
  assert.equal(maxWire.batch_id,before.batchId);
  assert.deepEqual(maxWire.records,before.records);
  assert.equal(maxWire.records[0].ts,before.records[0].ts);
  assert.equal(Outbox.validateWireBatch(maxWire),true);

  const inst="00000000-0000-0000-0000-000000000001",ctx="max-width-oversize";
  const makeWire=(text,generation,queuedAtMs)=>{
    const record=Seg.snapshotLine("example.test",{url:"https://example.test/page",title:"Title",adapter:"generic"},
      [{id:"1",type:"text",depth:0,text}],1,0);
    record.ctx=ctx; record.inst=inst;
    return {type:"batch",destination_generation:generation,inst,batch_id:"0".repeat(32),queued_at_ms:queuedAtMs,records:[record]};
  };
  const maxGeneration="g".repeat(Constants.GENERATION_MAX),maxTimestamp=Constants.TIMESTAMP_MAX;
  const emptyShort=makeWire("","g",1),emptyMax=makeWire("",maxGeneration,maxTimestamp);
  const stampDelta=Outbox.byteLengthOf(emptyMax)-Outbox.byteLengthOf(emptyShort);
  const textLength=Constants.EXTENSION_TO_HOST_MAX-Outbox.byteLengthOf(emptyShort)-Math.floor(stampDelta/2);
  const payload="x".repeat(textLength);
  const shortBytes=Outbox.byteLengthOf(makeWire(payload,"g",1));
  const maxBytes=Outbox.byteLengthOf(makeWire(payload,maxGeneration,maxTimestamp));
  assert.ok(shortBytes<=Constants.EXTENSION_TO_HOST_MAX);
  assert.ok(maxBytes>Constants.EXTENSION_TO_HOST_MAX);
  const cursorKey=`${inst}\n${ctx}`;
  const cursorBefore={contextKey:cursorKey,inst,ctx,blocks:[{id:"prior",text:"prior"}],generation:"g",snapshotRequired:false};
  await DB.put("producer",cursorBefore);
  await assert.rejects(Outbox.enqueueSkim({
    inst,ctx,destinationGeneration:"g",senderUrl:"https://example.test/page",site:"example.test",title:"Title",adapter:"generic",
    blocks:[{id:"1",type:"text",depth:0,text:payload}],nowMs:1,
  }),err=>err.code==="batch-oversize");
  assert.deepEqual(await DB.get("producer",cursorKey),cursorBefore);
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

test("account: retired permanent receipt reasons leave the row, cursor, and loss notice untouched", async () => {
  await resetDB();
  const item = await Outbox.enqueueSkim(agingFixture("legacy-receipt"));
  const key = `${item.inst || "fixture"}\nlegacy-receipt`;
  const rowBefore = await DB.get("outbox", item.batchId);
  const cursorBefore = await DB.get("producer", key);
  const lossNotice = { seq: 9, reason: "oversize", count: 2 };
  await DB.put("meta", lossNotice, "lossNotice");

  for (const [reason, receiptClass] of [["stale_generation", "permanent"], ["expired_unaccepted", "retryable"]]) {
    const result = await Outbox.applyRejectedReceipt(item.batchId, { reason, class: receiptClass });
    assert.deepEqual(result, { removed: 0, promotedBatchId: null });
    assert.deepEqual(await DB.get("outbox", item.batchId), rowBefore);
    assert.deepEqual(await DB.get("producer", key), cursorBefore);
    assert.deepEqual(await DB.get("meta", "lossNotice"), lossNotice);
  }
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


test("account: elapsed age leaves all queued rows and does not promote a delta", async () => {
  await resetDB();
  const W=1000000;
  const rows=[];
  for (const [i,wall] of [W-1000,W,W-1000].entries()) {
    const fixture=agingFixture("clock-jump",wall);
    fixture.blocks=[{id:"1",type:"text",depth:0,text:String(i)}];
    rows.push(await Outbox.enqueueSkim(fixture));
  }
  const queued=await Outbox.getAll();
  assert.equal(queued.length,3);
  assert.deepEqual(queued.map(row=>row.batchId),rows.map(row=>row.batchId));
  assert.deepEqual(queued.map(row=>row.records[0].t),["segment_start","delta","delta"]);
  assert.ok(queued.every(row=>row.sendSnapshot===false));
  assert.equal(await DB.get("meta","lossNotice"),undefined);
});
