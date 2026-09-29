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
await import(new URL("../contracts/native-browser/schemas.js", import.meta.url));
await import(new URL("../native-browser/schema-validator.js", import.meta.url));
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
    const result = Codec.decode(built.bytes, "extension_to_host");
    assert.equal(result.status, r.expect, `recipe ${r.id} decode mismatch`);
    if (r.code) assert.equal(result.code, r.code);
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
        ctx: "c",
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
  assert.equal(reply.result, "accepted");
  assert.equal(Codec.decode(Codec.encode(reply), "host_to_extension").status, "accept");

  const rejectedReceipt = {
    reason: "snapshot_required",
    destination_generation: "g1", inst: "inst1",
    batch_id: "0123456789abcdef0123456789abcdef",
  };
  const rejReply = Codec.buildReply(rejectedReceipt);
  assert.equal(rejReply.type, "accepted");
  assert.equal(rejReply.result, "rejected");
  assert.equal(Codec.decode(Codec.encode(rejReply), "host_to_extension").status, "accept");
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
        ctx: "c",
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
    { reason: "queue_full", expectedClass: "retryable" },
    { reason: "age_policy", expectedClass: "retryable" },
    { reason: "unaccepted_lost", expectedClass: "permanent" },
  ];

  for (const { reason, expectedClass } of reasonsAndOutcomes) {
    const rej = Codec.buildReply({
      reason,
      destination_generation: "g1",
      inst: "i1",
      batch_id: "0123456789abcdef0123456789abcdef",
    });
    assert.equal(rej.result, "rejected");
    assert.equal(rej.reason, reason);
    assert.equal(rej.class, expectedClass);
    assert.equal(rej.destination_generation, "g1");
    assert.equal(rej.inst, "i1");
    assert.equal(rej.batch_id, "0123456789abcdef0123456789abcdef");
  }
});


function exampleBatch() {
  return {type: "batch", destination_generation: "g", inst: "i",
    batch_id: "0123456789abcdef0123456789abcdef", queued_at_ms: 0,
    records: [{t: "segment_start", ts: 0, ctx: "c", blocks: [{id: "b", text: "ok"}]}]};
}
const decodeObject = (value, direction = "extension_to_host") => Codec.decode(JSON.stringify(value), direction);

test("actual imported schema validates records and native identity rules", () => {
  assert.equal(decodeObject(exampleBatch()).status, "accept");
  const changes = [
    b => delete b.records[0].ts,
    b => delete b.records[0].blocks[0].text,
    b => b.records[0].blocks[0].id = 7,
    b => b.records[0].blocks[0].text = "a".repeat(2002),
    b => b.records[0].blocks = Array.from({length: 1501}, (_, i) => ({id: String(i), text: "a"})),
    b => b.records[0].blocks[0].attrs = {label: "a".repeat(301)},
    b => b.records[0].blocks[0].attrs = {level: 1},
    b => b.records[0].blocks[0].depth = 4097,
    b => b.records[0].title = "a".repeat(8193),
    b => b.records[0].url = "a".repeat(32769),
    b => b.records[0].ts = 0.5,
    b => b.records[0].ctx = [],
    b => b.records[0].n = 1501,
    b => b.records = [null],
    b => b.records[0].inst = "",
  ];
  for (const change of changes) {
    const batch = exampleBatch(); change(batch);
    assert.equal(decodeObject(batch).status, "refuse", String(change));
  }
  for (const t of ["segment_start", "add", "update", "remove"]) {
    const batch = exampleBatch();
    if (t !== "segment_start") batch.records = [{t: "delta", ts: 0, ctx: "c", op: t, block: {id: "b", text: "ok"}}];
    const block = t === "segment_start" ? batch.records[0].blocks[0] : batch.records[0].block;
    block.id = "😀".repeat(256);
    assert.equal(decodeObject(batch).status, "accept", t + " Unicode scalar length");
    block.id += "😀";
    assert.equal(decodeObject(batch).status, "refuse", t + " over bound");
    delete block.id;
    assert.equal(decodeObject(batch).status, "refuse", t + " missing id");
    block.id = "";
    assert.equal(decodeObject(batch).status, "refuse", t + " empty id");
  }
});

test("strict JSON parsing preserves additive numbers and rejects malformed numeric grammar", () => {
  const raw = JSON.stringify(exampleBatch());
  for (const invalid of ["1e", "1.e2", "0x10", "01", "+1"]) {
    assert.equal(Codec.decode(raw.replace('"queued_at_ms":0', '"queued_at_ms":' + invalid), "extension_to_host").code, "bad_json");
  }
  for (const valid of ["-0", "1000.0", "1e3"]) {
    assert.equal(Codec.decode(raw.replace('"queued_at_ms":0', '"queued_at_ms":' + valid), "extension_to_host").status, "accept");
  }
  const escapedKey = raw.replace('"queued_at_ms":0', '"queued_\\u0061t_ms":0.5');
  assert.equal(Codec.decode(escapedKey, "extension_to_host").code, "bad_number");
  const batch = exampleBatch();
  batch.extension = {ts: -12.75, depth: 3.25, n: 1e30, protocol: -2, text: '"ts":1e'};
  assert.deepEqual(decodeObject(batch).value.extension, batch.extension);
});

test("literal escape text roundtrips while actual lone surrogates fail closed", () => {
  const batch = exampleBatch();
  for (const text of ["\\ud800", "\\udfff", "\\uD800\\uDC00", "< > 😀 \u2028\u2029 \n\t\0"]) {
    batch.records[0].blocks[0].text = text;
    assert.equal(Codec.decode(Codec.encode(batch), "extension_to_host").value.records[0].blocks[0].text, text);
  }
  batch.records[0].blocks[0].text = "\ud800";
  assert.equal(decodeObject(batch).code, "lone_surrogate");
  assert.throws(() => Codec.encode(batch), {code: "lone_surrogate"});
  const keyed = exampleBatch(); keyed["\udfff"] = 1;
  assert.equal(decodeObject(keyed).code, "lone_surrogate");
});

test("hello negotiation never bypasses direction or control cap", () => {
  const hello = {type: "hello", protocol: 2, brand: "chrome", version: "1", inst: "i"};
  assert.equal(decodeObject(hello).status, "unsupported");
  assert.equal(decodeObject(hello, "host_to_extension").code, "bad_direction");
  assert.equal(decodeObject({...hello, pad: "x".repeat(65536)}).code, "oversize");
  assert.equal(Codec.decode(JSON.stringify(hello), "unknown").code, "bad_direction");
  const invalidOversize = new Uint8Array(65537).fill(0xff);
  assert.equal(Codec.decode(invalidOversize, "host_to_extension").code, "oversize");
});

test("state permission needs valid routing and a nonexpired positive lease", () => {
  const state = {type: "state", capture: "permitted", delivery: "idle", destination_generation: "g", period_id: "p", freshness_ms: 15000};
  assert.equal(decodeObject(state, "host_to_extension").status, "accept");
  for (const field of ["destination_generation", "period_id", "freshness_ms"]) {
    const bad = {...state}; delete bad[field];
    assert.equal(decodeObject(bad, "host_to_extension").status, "refuse");
  }
  assert.equal(decodeObject({...state, destination_generation: 123, period_id: true}, "host_to_extension").status, "refuse");
  assert.equal(decodeObject({...state, capture: "not_paired", destination_generation: null, period_id: null}, "host_to_extension").status, "accept");
  assert.equal(decodeObject({...state, delivery: "kept_locally", failure: "queue_full"}, "host_to_extension").status, "accept");
  assert.equal(Codec.freshnessAuthorizesSkim(100, 0, 100), false);
  assert.equal(Codec.freshnessAuthorizesSkim(100, 15, 99), false);
  assert.equal(Codec.freshnessAuthorizesSkim(100, 15, 114), true);
  assert.equal(Codec.freshnessAuthorizesSkim(100, 15, 115), false);
  assert.equal(Codec.freshnessValueAllowed(0.5), false);
  assert.equal(Codec.mayRenewOnConnection("port", "port", 100, 99, 5000), false);
  assert.equal(Codec.mayRenewOnConnection("port", "port", 100, 100, 5000), true);
  assert.equal(Codec.mayRenewOnConnection("port", "other", 100, 100, 5000), false);
  assert.equal(Codec.captureIsPermitted(state), true);
  assert.equal(Codec.captureIsPermitted({...state, freshness_ms: 0}), false);
  assert.equal(Codec.captureIsPermitted({...state, delivery: "unknown_value"}), false);
  assert.equal(Codec.captureIsPermitted({...state, destination_generation: 7}), false);
});

test("context consistency and optional instance are independent of row order", () => {
  const a = {t: "delta", ts: 0, op: "remove", block: {id: "a"}};
  const b = {...a, ctx: "c", block: {id: "b"}};
  for (const records of [[a, b], [b, a]]) assert.equal(decodeObject({...exampleBatch(), records}).status, "refuse");
  assert.equal(decodeObject({...exampleBatch(), records: [a, a]}).status, "refuse");
  assert.equal(decodeObject({...exampleBatch(), records: [b, b]}).status, "accept");
  assert.equal(decodeObject({...exampleBatch(), records: [{...b, ctx: ""}]}).status, "refuse");
  assert.equal(decodeObject({...exampleBatch(), records: [b, {...b, ctx: "other"}]}).code, "mixed_context");
  assert.equal(decodeObject({...exampleBatch(), records: [{...a, inst: ""}]}).status, "refuse");
});

test("receipt builder produces decodable bounded variants and refuses invented reasons", () => {
  const identity = {destination_generation: "g", inst: "i", batch_id: exampleBatch().batch_id};
  for (const result of ["accepted", "duplicate"]) {
    const reply = Codec.buildReply({...identity, result, period_id: "p"});
    assert.equal(decodeObject(reply, "host_to_extension").status, "accept");
    assert.equal(reply.result, result);
  }
  for (const [kind, reasons] of Object.entries(globalThis.SolstoneNativeBrowserConstants.RECEIPT_CLASSES)) {
    for (const reason of reasons) {
      const reply = Codec.buildReply({...identity, reason});
      assert.equal(reply.result, "rejected"); assert.equal(reply.class, kind);
      assert.equal(decodeObject(reply, "host_to_extension").status, "accept");
      assert.equal(Object.hasOwn(reply, "period_id"), false);
      assert.throws(() => Codec.buildReply({...identity, reason, class: kind === "permanent" ? "retryable" : "permanent"}));
    }
  }
  assert.throws(() => Codec.buildReply({...identity, reason: "ZQ_SENTINEL_do_not_echo"}), error => !error.message.includes("ZQ_SENTINEL"));
  assert.throws(() => Codec.buildReply({reason: "snapshot_required"}));
  assert.throws(() => Codec.buildReply({...identity, result: "rejected", reason: "snapshot_required", period_id: "p"}), {code: "invalid_receipt"});
  for (const result of ["accepted", "duplicate"]) {
    assert.throws(() => Codec.buildReply({...identity, result, period_id: "p", reason: "snapshot_required"}), {code: "invalid_receipt"});
    assert.throws(() => Codec.buildReply({...identity, result, period_id: "p", class: "retryable"}), {code: "invalid_receipt"});
  }
});

test("offline schema evaluator refuses unsupported schema vocabulary", () => {
  const compile = globalThis.SolstoneNativeBrowserSchemaValidator.compile;
  assert.throws(() => compile([{$id: "test", properties: {x: {unevaluatedProperties: false}}}]), /unsupported contract schema keyword/);
  assert.throws(() => compile([{$id: "test", $ref: "https:\/\/invalid.example/schema"}]), /unresolved offline/);
});

test("record diagnostics name canonical rows without echoing payload", () => {
  const batch = exampleBatch();
  batch.records[0].blocks.push({text: "ZQ_SENTINEL_do_not_echo"});
  const result = decodeObject(batch);
  assert.deepEqual({row: result.row, field: result.field, cause: result.cause}, {row: 0, field: "id", cause: "missing"});
  assert.equal(JSON.stringify(result).includes("ZQ_SENTINEL"), false);
});

test("shared container-depth bound is enforced before decoding and recursive encoding", () => {
  const limit = globalThis.SolstoneNativeBrowserConstants.JSON_MAX_DEPTH;
  assert.equal(limit, 127);
  const hello = {type: "hello", protocol: 1, version: "1", brand: "chrome", inst: "i"};
  const nested = count => {
    let value = 0;
    for (let n = 0; n < count; n++) value = [value];
    return {...hello, extra: value};
  };
  assert.equal(decodeObject(nested(limit - 1)).status, "accept");
  assert.equal(decodeObject(nested(limit)).code, "bad_json");
  assert.equal(Codec.decode(Codec.encode(nested(limit - 1)), "extension_to_host").status, "accept");
  assert.throws(() => Codec.encode(nested(limit)), {code: "bad_json"});
  const punctuation = {...hello, extra: '[{\"\\'.repeat(256)};
  assert.equal(decodeObject(punctuation).status, "accept");
  const cycle = {...hello}; cycle.extra = cycle;
  assert.throws(() => Codec.encode(cycle), {code: "bad_json"});
});
