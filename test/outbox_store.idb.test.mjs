// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import "fake-indexeddb/auto";
import { beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";

await import(new URL("../extension/lib/uuid.js", import.meta.url));
await import(new URL("../extension/lib/outbox.js", import.meta.url));
await import(new URL("../extension/lib/db.js", import.meta.url));
await import(new URL("../extension/lib/outbox_store.js", import.meta.url));

const DB = globalThis.SolstoneDB;
const Store = globalThis.SolstoneOutboxStore;
const CAP = globalThis.SolstoneOutbox.OUTBOX_CAP;

function entry(id, lines = 1) {
  const value = {
    day: "20260715",
    segment: `segment-${id}`,
    blob_id: `blob-${id}`,
    files: [{ name: "browser_test.jsonl", text: Array.from({ length: lines }, (_, n) => JSON.stringify({ id, n })).join("\n") + "\n" }],
  };
  if (id !== undefined) value.id = id;
  return value;
}

async function seedRows(rows) {
  await DB.tx("outbox", "readwrite", (outbox) => {
    for (const row of rows) outbox.add(row);
  });
}

describe("production IndexedDB outbox store", { concurrency: false }, () => {
  beforeEach(async () => {
    await DB.clear("outbox");
    await DB.clear("meta");
    await DB.clear("identity");
  });

  test("overlapping atomic enqueues serialize cap eviction and dropped counters", async () => {
    const rows = Array.from({ length: CAP }, (_, n) => entry(10_000 + n, n === 0 ? 2 : n === 1 ? 3 : 1));
    const prior = { segments: 7, lines: 11 };
    await seedRows(rows);
    await DB.put("meta", prior, "dropped");

    const enqueueA = Store.enqueue(Object.assign(entry(undefined, 4), { blob_id: "overlap-a", segment: "overlap-a" }));
    const enqueueB = Store.enqueue(Object.assign(entry(undefined, 5), { blob_id: "overlap-b", segment: "overlap-b" }));
    const results = await Promise.all([enqueueA, enqueueB]);

    const finalRows = await Store.all();
    const finalIds = new Set(finalRows.map((row) => row.id));
    const finalBlobIds = new Set(finalRows.map((row) => row.blob_id));
    assert.equal(finalRows.length, CAP);
    assert.equal(finalBlobIds.has("overlap-a"), true);
    assert.equal(finalBlobIds.has("overlap-b"), true);
    assert.equal(finalIds.has(rows[0].id), false);
    assert.equal(finalIds.has(rows[1].id), false);
    for (const row of rows.slice(2)) assert.equal(finalIds.has(row.id), true);
    assert.deepEqual(await Store.getDropped(), { segments: prior.segments + 2, lines: prior.lines + 5 });
    assert.deepEqual(results.at(-1), { segments: prior.segments + 2, lines: prior.lines + 5 });
  });

  test("duplicate inline key aborts enqueue and rolls back queue and counters", async () => {
    const rows = Array.from({ length: CAP }, (_, n) => entry(20_000 + n, n === 0 ? 2 : 1));
    const prior = { segments: 3, lines: 9 };
    await seedRows(rows);
    await DB.put("meta", prior, "dropped");

    const colliding = Object.assign(entry(rows.at(-1).id, 4), { blob_id: "collision", segment: "collision" });
    await assert.rejects(Store.enqueue(colliding));

    const finalRows = await Store.all();
    assert.deepEqual(finalRows, rows);
    assert.deepEqual(await Store.getDropped(), prior);
  });
});
