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

const DB = globalThis.SolstoneDB;
const Outbox = globalThis.SolstoneNativeOutbox;

async function resetDB() {
  await DB.clear("outbox");
  await DB.clear("producer");
  await DB.clear("meta");
}

test("outbox: abort after request success and before completion hides the write", async () => {
  await resetDB();

  const origAdd = IDBObjectStore.prototype.add;
  let hooked = true;
  IDBObjectStore.prototype.add = function (...args) {
    const req = origAdd.apply(this, args);
    if (hooked) {
      hooked = false;
      req.addEventListener("success", () => {
        this.transaction.__error = new Error("aborted_after_add_success");
        this.transaction.abort();
      });
    }
    return req;
  };

  let rejected = false;
  try {
    await Outbox.enqueueSkim({
      inst: "00000000-0000-0000-0000-000000000001",
      ctx: "ctx-abort-1",
      destinationGeneration: "gen-1",
      senderUrl: "https://mail.google.com/mail/u/0/#inbox",
      site: "mail.google.com",
      title: "Inbox",
      adapter: "gmail",
      blocks: [{ id: "1", type: "heading", depth: 1, text: "Title", attrs: {} }],
      nowMs: 1000,
    });
  } catch (err) {
    rejected = true;
    assert.equal(err.message, "aborted_after_add_success");
  } finally {
    IDBObjectStore.prototype.add = origAdd;
  }

  assert.equal(rejected, true);
  const outboxItems = await DB.getAll("outbox");
  assert.equal(outboxItems.length, 0);
  const producerRow = await DB.get("producer", "00000000-0000-0000-0000-000000000001\nctx-abort-1");
  assert.equal(producerRow, undefined);
});

test("outbox: aborting a delete transaction leaves the record in place", async () => {
  await resetDB();

  const res = await Outbox.enqueueSkim({
    inst: "00000000-0000-0000-0000-000000000001",
    ctx: "ctx-del-1",
    destinationGeneration: "gen-1",
    senderUrl: "https://mail.google.com/mail/u/0/#inbox",
    site: "mail.google.com",
    title: "Inbox",
    adapter: "gmail",
    blocks: [{ id: "1", type: "heading", depth: 1, text: "Title", attrs: {} }],
    nowMs: 1000,
  });
  assert.equal(res.enqueued, true);

  const origDelete = IDBObjectStore.prototype.delete;
  let hooked = true;
  IDBObjectStore.prototype.delete = function (...args) {
    const req = origDelete.apply(this, args);
    if (hooked) {
      hooked = false;
      req.addEventListener("success", () => {
        this.transaction.__error = new Error("aborted_after_delete_success");
        this.transaction.abort();
      });
    }
    return req;
  };

  let rejected = false;
  try {
    await Outbox.removeBatch(res.batchId);
  } catch (err) {
    rejected = true;
    assert.equal(err.message, "aborted_after_delete_success");
  } finally {
    IDBObjectStore.prototype.delete = origDelete;
  }

  assert.equal(rejected, true);
  const item = await DB.get("outbox", res.batchId);
  assert.ok(item);
  assert.equal(item.batchId, res.batchId);
});

test("outbox: first skim enqueues snapshot record", async () => {
  await resetDB();

  const blocks = [
    { id: "1", type: "heading", depth: 1, text: "Title", attrs: {} },
    { id: "2", type: "paragraph", depth: 1, text: "Paragraph text", attrs: {} },
  ];

  const res = await Outbox.enqueueSkim({
    inst: "00000000-0000-0000-0000-000000000001",
    ctx: "ctx-1",
    destinationGeneration: "gen-1",
    senderUrl: "https://mail.google.com/mail/u/0/#inbox",
    site: "mail.google.com",
    title: "Inbox",
    adapter: "gmail",
    blocks,
    nowMs: 1000,
  });

  assert.equal(res.enqueued, true);
  assert.equal(res.seq, 1);

  const head = await Outbox.getHead();
  assert.ok(head);
  assert.equal(head.batchId, res.batchId);
  assert.equal(head.records.length, 1);
  assert.equal(head.records[0].t, "segment_start");
  assert.equal(head.records[0].blocks.length, 2);
});

test("outbox: subsequent identical skim produces no enqueue", async () => {
  const blocks = [
    { id: "1", type: "heading", depth: 1, text: "Title", attrs: {} },
    { id: "2", type: "paragraph", depth: 1, text: "Paragraph text", attrs: {} },
  ];

  const res = await Outbox.enqueueSkim({
    inst: "00000000-0000-0000-0000-000000000001",
    ctx: "ctx-1",
    destinationGeneration: "gen-1",
    senderUrl: "https://mail.google.com/mail/u/0/#inbox",
    site: "mail.google.com",
    title: "Inbox",
    adapter: "gmail",
    blocks,
    nowMs: 2000,
  });

  assert.equal(res.enqueued, false);
  assert.equal(res.disposition, "empty");
});

test("outbox: subsequent modified skim enqueues deltas", async () => {
  const modifiedBlocks = [
    { id: "1", type: "heading", depth: 1, text: "Title", attrs: {} },
    { id: "2", type: "paragraph", depth: 1, text: "Updated paragraph text", attrs: {} },
    { id: "3", type: "paragraph", depth: 1, text: "New paragraph", attrs: {} },
  ];

  const res = await Outbox.enqueueSkim({
    inst: "00000000-0000-0000-0000-000000000001",
    ctx: "ctx-1",
    destinationGeneration: "gen-1",
    senderUrl: "https://mail.google.com/mail/u/0/#inbox",
    site: "mail.google.com",
    title: "Inbox",
    adapter: "gmail",
    blocks: modifiedBlocks,
    nowMs: 3000,
  });

  assert.equal(res.enqueued, true);
  assert.equal(res.seq, 2);

  const all = await Outbox.getAll();
  assert.equal(all.length, 2);

  const deltaBatch = all[1];
  assert.equal(deltaBatch.records.length, 2); // 1 add + 1 update
  assert.equal(deltaBatch.records[0].t, "delta");
  assert.equal(deltaBatch.records[0].op, "add");
  assert.equal(deltaBatch.records[1].t, "delta");
  assert.equal(deltaBatch.records[1].op, "update");
});

test("outbox: snapshot_required receipt sets sendSnapshot in outbox item without mutating stored records", async () => {
  const all = await Outbox.getAll();
  assert.equal(all.length, 2);
  const deltaBatch = all[1];
  assert.equal(deltaBatch.records[0].t, "delta");

  await Outbox.applyRejectedReceipt(deltaBatch.batchId, {
    reason: "snapshot_required",
    class: "retryable",
  });

  const allAfter = await Outbox.getAll();
  const replacedBatch = allAfter.find((b) => b.batchId === deltaBatch.batchId);
  assert.ok(replacedBatch);
  assert.equal(replacedBatch.sendSnapshot, true);
  const wireBatch = Outbox.buildWireBatch(replacedBatch);
  assert.equal(wireBatch.records.length, 1);
  assert.equal(wireBatch.records[0].t, "segment_start");
});

test("outbox: permanent failure receipt removes item and promotes descendant to snapshot", async () => {
  await resetDB();

  // Batch 1 (Snapshot)
  const b1 = await Outbox.enqueueSkim({
    inst: "00000000-0000-0000-0000-000000000001",
    ctx: "ctx-1",
    destinationGeneration: "gen-1",
    senderUrl: "https://mail.google.com/mail/u/0/#inbox",
    site: "mail.google.com",
    title: "Inbox",
    adapter: "gmail",
    blocks: [{ id: "1", type: "text", depth: 0, text: "A", attrs: {} }],
    nowMs: 1000,
  });

  // Batch 2 (Delta)
  const b2 = await Outbox.enqueueSkim({
    inst: "00000000-0000-0000-0000-000000000001",
    ctx: "ctx-1",
    destinationGeneration: "gen-1",
    senderUrl: "https://mail.google.com/mail/u/0/#inbox",
    site: "mail.google.com",
    title: "Inbox",
    adapter: "gmail",
    blocks: [{ id: "1", type: "text", depth: 0, text: "A" }, { id: "2", type: "text", depth: 0, text: "B" }],
    nowMs: 2000,
  });

  // Batch 3 (Delta)
  const b3 = await Outbox.enqueueSkim({
    inst: "00000000-0000-0000-0000-000000000001",
    ctx: "ctx-1",
    destinationGeneration: "gen-1",
    senderUrl: "https://mail.google.com/mail/u/0/#inbox",
    site: "mail.google.com",
    title: "Inbox",
    adapter: "gmail",
    blocks: [{ id: "1", type: "text", depth: 0, text: "A" }, { id: "2", type: "text", depth: 0, text: "B" }, { id: "3", type: "text", depth: 0, text: "C" }],
    nowMs: 3000,
  });

  let items = await Outbox.getAll();
  assert.equal(items.length, 3);
  assert.equal(items[1].records[0].t, "delta");

  // Reject Batch 2 with permanent failure
  const rejectRes = await Outbox.applyRejectedReceipt(b2.batchId, {
    reason: "oversize",
    class: "permanent",
  });
  assert.equal(rejectRes.removed, 1);
  assert.equal(rejectRes.promotedBatchId, b3.batchId);

  items = await Outbox.getAll();
  assert.equal(items.length, 2);
  assert.equal(items.some((x) => x.batchId === b2.batchId), false);

  // Batch 3 was promoted to snapshot (sendSnapshot = true)
  const batch3 = items.find((x) => x.batchId === b3.batchId);
  assert.ok(batch3);
  assert.equal(batch3.sendSnapshot, true);
  const wire3 = Outbox.buildWireBatch(batch3);
  assert.equal(wire3.records.length, 1);
  assert.equal(wire3.records[0].t, "segment_start");
  assert.equal(wire3.records[0].blocks.length, 3);
});

test("outbox: confirmed generation promotes held rows without deleting them", async () => {
  await resetDB();
  const base = await Outbox.enqueueSkim({
    inst: "00000000-0000-0000-0000-000000000001", ctx: "ctx-held", destinationGeneration: "gen-1",
    senderUrl: "https://example.test/page", site: "example.test", title: "Page", adapter: "generic",
    blocks: [{ id: "1", type: "text", depth: 0, text: "base" }], nowMs: 1,
  });
  await Outbox.removeBatch(base.batchId);
  const delta = await Outbox.enqueueSkim({
    inst: "00000000-0000-0000-0000-000000000001", ctx: "ctx-held", destinationGeneration: "gen-1",
    senderUrl: "https://example.test/page", site: "example.test", title: "Page", adapter: "generic",
    blocks: [{ id: "1", type: "text", depth: 0, text: "base" }, { id: "2", type: "text", depth: 0, text: "delta" }], nowMs: 2,
  });
  const before = await Outbox.getAll();
  const lossBefore = await DB.get("meta", "lossNotice");
  const res = await Outbox.promoteHeldForGeneration("gen-2");
  assert.equal(res.count, 0);
  const items = await Outbox.getAll();
  assert.equal(items.length, before.length);
  for (const row of before) assert.ok(items.some(item => item.batchId === row.batchId));
  assert.equal((await DB.get("outbox", delta.batchId)).sendSnapshot, true);
  const cursor = await DB.get("producer", "00000000-0000-0000-0000-000000000001\nctx-held");
  assert.equal(cursor.generation, "gen-2");
  assert.equal(cursor.snapshotRequired, true);
  assert.deepEqual(await DB.get("meta", "lossNotice"), lossBefore);
});

test("outbox: aborted generation promotion leaves cursor and held row unchanged", async () => {
  await resetDB();
  const inst = "00000000-0000-0000-0000-000000000001", ctx = "ctx-abort-promotion";
  const base = await Outbox.enqueueSkim({
    inst, ctx, destinationGeneration: "gen-1", senderUrl: "https://example.test/page", site: "example.test",
    title: "Page", adapter: "generic", blocks: [{ id: "1", text: "base" }], nowMs: 1,
  });
  await Outbox.removeBatch(base.batchId);
  const delta = await Outbox.enqueueSkim({
    inst, ctx, destinationGeneration: "gen-1", senderUrl: "https://example.test/page", site: "example.test",
    title: "Page", adapter: "generic", blocks: [{ id: "1", text: "base" }, { id: "2", text: "delta" }], nowMs: 2,
  });
  const rowBefore = await DB.get("outbox", delta.batchId);
  const cursorBefore = await DB.get("producer", `${inst}\n${ctx}`);
  const originalPut = IDBObjectStore.prototype.put;
  let abortNextProducerPut = true;
  IDBObjectStore.prototype.put = function (...args) {
    const request = originalPut.apply(this, args);
    if (abortNextProducerPut && this.name === "producer") {
      abortNextProducerPut = false;
      request.addEventListener("success", () => this.transaction.abort(), { once: true });
    }
    return request;
  };
  try {
    await assert.rejects(Outbox.promoteHeldForGeneration("gen-2"));
  } finally {
    IDBObjectStore.prototype.put = originalPut;
  }
  assert.deepEqual(await DB.get("outbox", delta.batchId), rowBefore);
  assert.deepEqual(await DB.get("producer", `${inst}\n${ctx}`), cursorBefore);
});
