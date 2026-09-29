// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

await import(new URL("../contracts/native-browser/constants.js", import.meta.url));
await import(new URL("../native-browser/codec.js", import.meta.url));

const Codec = globalThis.SolstoneNativeBrowser;

function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

test("codec decodes all corpus vectors matching expect", () => {
  const corpus = JSON.parse(readFileSync(join(ROOT, "contracts/native-browser/corpus.json"), "utf8"));
  const sentinel = "ZQ_SENTINEL_do_not_echo";

  for (const v of corpus) {
    const payload = v.payload || v.raw;
    const res = Codec.decode(payload, v.direction);

    if (v.expect === "accept") {
      assert.equal(res.status, "accept", `vector ${v.id} expected accept but got ${res.status}`);
      // Re-encode
      const encoded = Codec.encode(res.value);
      assert.ok(encoded.byteLength > 0);
    } else if (v.expect === "unsupported") {
      assert.equal(res.status, "unsupported", `vector ${v.id} expected unsupported`);
      if (v.behind) {
        assert.equal(res.value.behind, v.behind, `vector ${v.id} behind mismatch`);
      }
    } else if (v.expect === "refuse") {
      assert.equal(res.status, "refuse", `vector ${v.id} expected refuse but got ${res.status}`);
      if (v.code) {
        assert.equal(res.code, v.code, `vector ${v.id} code mismatch`);
      }
      if (v.cause) {
        assert.equal(res.cause, v.cause, `vector ${v.id} cause mismatch`);
      }
      // Sentinel check
      const errStr = String(res.error ? res.error.message : "");
      assert.equal(errStr.includes(sentinel), false, `vector ${v.id} echoed sentinel`);
    }
  }
});

test("codec recipe builders match targets and sha256 digests", () => {
  const recipes = JSON.parse(readFileSync(join(ROOT, "contracts/native-browser/recipes.json"), "utf8"));
  for (const r of recipes) {
    const built = Codec.buildRecipe(r.id);
    assert.equal(built.length, r.target_length, `recipe ${r.id} length mismatch`);
    assert.equal(sha256(built.bytes), r.sha256, `recipe ${r.id} sha256 mismatch`);
  }
});

test("codec unicode and lone surrogate handling", () => {
  const astralObj = {
    type: "batch",
    destination_generation: "g",
    inst: "i",
    batch_id: "0123456789abcdef0123456789abcdef",
    queued_at_ms: 100,
    records: [
      {
        t: "segment_start",
        ts: 100,
        n: 1,
        blocks: [{ id: "b1", text: "Astral: \u{1F600}, Separators: \u2028\u2029" }],
      },
    ],
  };

  const encoded = Codec.encode(astralObj);
  const text = new TextDecoder().decode(encoded);
  assert.ok(text.includes("\u{1F600}"));
  assert.ok(text.includes("\u2028"));
  assert.ok(text.includes("\u2029"));

  // Lone surrogate in object string throws
  const loneObj = {
    type: "hello",
    protocol: 1,
    version: "1.0.0",
    brand: "chrome",
    inst: "inst\uD800alone",
  };
  assert.throws(() => Codec.encode(loneObj), (err) => err.code === "lone_surrogate");
});

test("receipt builder and decode success is not accepted", () => {
  const acceptedReceipt = {
    outcome: "accepted",
    destination_generation: "g1",
    inst: "inst1",
    batch_id: "0123456789abcdef0123456789abcdef",
    period_id: "p1",
    duplicate: false,
  };
  const reply = Codec.buildReply(acceptedReceipt);
  assert.equal(reply.type, "accepted");
  assert.equal(reply.duplicate, false);

  const rejectedReceipt = {
    reason: "snapshot_required",
  };
  const rejReply = Codec.buildReply(rejectedReceipt);
  assert.equal(rejReply.outcome, "rejected");
  assert.equal(rejReply.reason, "snapshot_required");
  assert.equal(rejReply.class, "retryable");

  // Decode success of a batch has type 'batch' and is not an accepted receipt
  const batchJson = JSON.stringify({
    type: "batch",
    destination_generation: "g1",
    inst: "inst1",
    batch_id: "0123456789abcdef0123456789abcdef",
    queued_at_ms: 100,
    records: [
      {
        t: "segment_start",
        ts: 100,
        n: 1,
        blocks: [{ id: "b1", text: "test" }],
      },
    ],
  });
  const decoded = Codec.decode(batchJson, "extension_to_host");
  assert.equal(decoded.status, "accept");
  assert.equal(decoded.value.type, "batch");
  assert.equal(decoded.value.period_id, undefined);
});

test("batch retries and numeric float lexemes decode properly", () => {
  const corpus = JSON.parse(readFileSync(join(ROOT, "contracts/native-browser/corpus.json"), "utf8"));
  const findPayload = (id) => {
    const v = corpus.find((item) => item.id === id);
    assert.ok(v, `vector ${id} not found`);
    return v.payload || v.raw;
  };

  const r1 = Codec.decode(findPayload("batch_retry_1"), "extension_to_host");
  const r2 = Codec.decode(findPayload("batch_retry_2"), "extension_to_host");
  assert.equal(r1.status, "accept");
  assert.equal(r2.status, "accept");
  assert.equal(r1.value.destination_generation, r2.value.destination_generation);
  assert.equal(r1.value.inst, r2.value.inst);
  assert.equal(r1.value.batch_id, r2.value.batch_id);
  assert.equal(r1.value.queued_at_ms, r2.value.queued_at_ms);

  const f1 = Codec.decode(findPayload("batch_queued_at_ms_fraction_1000_0"), "extension_to_host");
  const f2 = Codec.decode(findPayload("batch_queued_at_ms_exponential_1e3"), "extension_to_host");
  assert.equal(f1.status, "accept");
  assert.equal(f2.status, "accept");
  assert.equal(f1.value.queued_at_ms, 1000);
  assert.equal(f2.value.queued_at_ms, 1000);

  const recSnap = Codec.decode(findPayload("batch_recovery_snapshot"), "extension_to_host");
  assert.equal(recSnap.status, "accept");
  assert.equal(recSnap.value.records[0].t, "segment_start");
  assert.equal(recSnap.value.records[0].snapshot_reason, "delivery_recovery");

  const reasonsAndOutcomes = [
    { reason: "queue_full", expectedOutcome: "backpressure" },
    { reason: "age_policy", expectedOutcome: "backpressure" },
    { reason: "unaccepted_lost", expectedOutcome: "loss" },
  ];

  for (const { reason, expectedOutcome } of reasonsAndOutcomes) {
    const rej = Codec.buildReply({
      reason,
      destination_generation: "g1",
      inst: "i1",
      batch_id: "0123456789abcdef0123456789abcdef",
    });
    assert.equal(rej.outcome, expectedOutcome);
    assert.equal(rej.reason, reason);
    assert.equal(rej.class, expectedOutcome);
    assert.equal(rej.destination_generation, "g1");
    assert.equal(rej.inst, "i1");
    assert.equal(rej.batch_id, "0123456789abcdef0123456789abcdef");
  }
});

