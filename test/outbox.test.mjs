// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { test } from "node:test";
import assert from "node:assert/strict";

await import(new URL("../extension/lib/outbox.js", import.meta.url));
const O = globalThis.SolstoneOutbox;

const entry = (segment, lines) => ({
  day: "20260701",
  segment,
  files: [{ name: "browser_test.jsonl", text: lines.map((n) => JSON.stringify({ n })).join("\n") + "\n" }],
});

test("enqueue appends without mutating and drains oldest first", () => {
  const first = entry("120000_10", [1]);
  const second = entry("120010_10", [2]);
  const original = [first];
  const r = O.enqueue(original, second, O.OUTBOX_CAP);
  assert.deepEqual(original, [first]);
  assert.deepEqual(r.dropped, { segments: 0, lines: 0 });
  assert.equal(O.head(r.outbox), first);
  assert.deepEqual(O.removeHead(r.outbox), [second]);
});

test("enqueue cap evicts oldest and reports dropped segments and lines", () => {
  const a = entry("a", [1, 2]);
  const b = entry("b", [3]);
  const c = entry("c", [4, 5, 6]);
  const r = O.enqueue([a, b], c, 2);
  assert.deepEqual(r.outbox.map((e) => e.segment), ["b", "c"]);
  assert.deepEqual(r.dropped, { segments: 1, lines: 2 });
});

test("lineCount counts non-empty jsonl rows across files", () => {
  assert.equal(
    O.lineCount({
      day: "d",
      segment: "s",
      files: [
        { name: "a", text: "{\"a\":1}\n\n{\"a\":2}\n" },
        { name: "b", text: "{\"b\":1}\n" },
      ],
    }),
    3
  );
});

test("delivered predicate keeps failed ok bodies and removes duplicates", () => {
  const delivered = (res) => !!(res && res.ok && !res.failed);
  assert.equal(delivered({ ok: true, failed: true }), false);
  assert.equal(delivered({ ok: true, duplicate: true, failed: false }), true);
  assert.equal(delivered({ ok: false, status: 503 }), false);
});

test("enqueue during drain ordering survives removing the old head", () => {
  const a = entry("a", [1]);
  const b = entry("b", [2]);
  const c = entry("c", [3]);
  const snapshotHead = O.head([a, b]);
  const afterEnqueue = O.enqueue([a, b], c, O.OUTBOX_CAP).outbox;
  assert.equal(snapshotHead.segment, "a");
  assert.deepEqual(O.removeHead(afterEnqueue).map((e) => e.segment), ["b", "c"]);
});

test("clearDropped is a no-op while entries remain and clears once empty", () => {
  const a = entry("a", [1]);
  assert.deepEqual(O.clearDropped({ outbox: [a], dropped: { segments: 1, lines: 2 } }), {
    outbox: [a],
    dropped: { segments: 1, lines: 2 },
  });
  assert.deepEqual(O.clearDropped({ outbox: [], dropped: { segments: 1, lines: 2 } }), {
    outbox: [],
    dropped: { segments: 0, lines: 0 },
  });
});

test("summary normalizes dropped and sums live plus outbox lines", () => {
  assert.deepEqual(O.summary({ segPendingLines: 3, outboxLines: 4 }), {
    waiting: 7,
    segPendingLines: 3,
    outboxLines: 4,
    dropped: { segments: 0, lines: 0 },
  });
});
