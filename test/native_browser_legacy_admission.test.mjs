// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

await import(new URL("../extension/native-browser/constants.js", import.meta.url));
await import(new URL("../extension/native-browser/schemas.js", import.meta.url));
await import(new URL("../extension/native-browser/schema-validator.js", import.meta.url));
await import(new URL("../extension/native-browser/codec.js", import.meta.url));

const Live = globalThis.SolstoneNativeBrowser;
const Constants = globalThis.SolstoneNativeBrowserConstants;
const fixtureRoot = new URL("./fixtures/native-browser-1.1.0/", import.meta.url);
const frozenGlobal = { TextEncoder, TextDecoder };
frozenGlobal.globalThis = frozenGlobal;
for (const file of ["schema-validator.js", "constants.js", "schemas.js", "codec.js"]) {
  vm.runInNewContext(readFileSync(new URL(file, fixtureRoot), "utf8"), frozenGlobal, { filename: file });
}
const Frozen = frozenGlobal.SolstoneNativeBrowser;

function batch(generation, queuedAtMs, recordTs) {
  return {
    type: "batch",
    destination_generation: generation,
    inst: "00000000-0000-0000-0000-000000000001",
    batch_id: "0123456789abcdef0123456789abcdef",
    queued_at_ms: queuedAtMs,
    records: [{
      t: "segment_start", ts: recordTs, ctx: "legacy-admission", n: 1,
      blocks: [{ id: "1", type: "text", depth: 0, text: "older skim record" }],
    }],
  };
}

function frozenAdmission(value, liveGeneration, nowMs) {
  const decoded = Frozen.decode(JSON.stringify(value), "extension_to_host");
  if (decoded.status !== "accept") return { accepted: false, reason: decoded.code };
  if (decoded.value.destination_generation !== liveGeneration) return { accepted: false, reason: "stale_generation" };
  if (Frozen.queuedPastOutboxAge(decoded.value.queued_at_ms, nowMs, 600000)) {
    return { accepted: false, reason: "expired_unaccepted" };
  }
  return { accepted: true, value: decoded.value };
}

test("frozen host age admission uses transport time independently from record timestamps", () => {
  const now = 1_800_000_000_000;
  const generation = "paired-generation";
  const oldTs = now - 600001;
  const freshTransport = batch(generation, now - 100, oldTs);
  const agedTransport = { ...freshTransport, queued_at_ms: oldTs };

  assert.equal(frozenAdmission(freshTransport, generation, now).accepted, true);
  assert.deepEqual(frozenAdmission(agedTransport, generation, now), {
    accepted: false, reason: "expired_unaccepted",
  });
  // The decoder checks wire shape only; the host admission predicates make this age decision.
  assert.equal(Frozen.decode(JSON.stringify(freshTransport), "extension_to_host").status, "accept");
  assert.equal(Frozen.decode(JSON.stringify(agedTransport), "extension_to_host").status, "accept");
  assert.deepEqual(frozenAdmission(freshTransport, "another-generation", now), {
    accepted: false, reason: "stale_generation",
  });
});

test("live reader accepts old-shaped batches and old readers accept every emittable reply", () => {
  const now = 1_800_000_000_000;
  const generation = "g".repeat(128);
  const oldShaped = batch(generation, now - 1000, now - 1000);
  assert.equal(Live.decode(JSON.stringify(oldShaped), "extension_to_host").status, "accept");

  const identity = { destination_generation: generation, inst: oldShaped.inst, batch_id: oldShaped.batch_id };
  for (const result of ["accepted", "duplicate"]) {
    const reply = Live.buildReply({ ...identity, result, period_id: "period" });
    assert.equal(Frozen.decode(JSON.stringify(reply), "host_to_extension").status, "accept");
  }
  for (const [classification, reasons] of Object.entries(Constants.RECEIPT_CLASSES)) {
    for (const reason of reasons) {
      const reply = Live.buildReply({ ...identity, reason });
      assert.equal(reply.class, classification);
      assert.equal(Frozen.decode(JSON.stringify(reply), "host_to_extension").status, "accept");
    }
  }

  for (const reason of ["stale_generation", "expired_unaccepted"]) {
    const permanent = {
      type: "accepted", result: "rejected", reason, class: "permanent",
      ...identity,
    };
    const retryable = { ...permanent, class: "retryable" };
    assert.equal(Live.decode(JSON.stringify(permanent), "host_to_extension").status, "accept");
    assert.equal(Frozen.decode(JSON.stringify(retryable), "host_to_extension").code, "invalid_receipt");
    assert.equal(Live.decode(JSON.stringify(retryable), "host_to_extension").code, "invalid_receipt");
    assert.throws(() => Live.buildReply({ ...identity, reason, class: "permanent" }), error => error.code === "invalid_receipt");
  }
});
