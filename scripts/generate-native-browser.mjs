// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

// Parse --out <dir>
let outDir = ROOT;
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--out" && i + 1 < args.length) {
    outDir = resolve(args[i + 1]);
    i++;
  }
}

const authorityPath = join(ROOT, "contracts/native-browser/authority.json");
const schemaPath = join(ROOT, "contracts/native-browser/browser.schema.json");

const authority = JSON.parse(readFileSync(authorityPath, "utf8"));
const schema = JSON.parse(readFileSync(schemaPath, "utf8"));

// Verify schema bounds and timestamp maximum
const defs = schema.$defs || {};
const timestampMax = defs.timestamp?.maximum;
if (timestampMax !== 9007199254740991) {
  console.error("Schema timestamp maximum must be 9007199254740991, got " + timestampMax);
  process.exit(1);
}
if (authority.policy.timestamp_max !== timestampMax) {
  console.error("Authority timestamp_max disagrees with schema");
  process.exit(1);
}

// Bounds extracted from the pinned schema; missing definitions are a generation error.
function schemaBound(value, field) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("missing or invalid canonical bound: " + field);
  return value;
}
const schemaBounds = {
  inst_string_max: schemaBound(defs.instString?.maxLength, "inst_string_max"),
  id_string_max: schemaBound(defs.idString?.maxLength, "id_string_max"),
  title_string_max: schemaBound(defs.titleString?.maxLength, "title_string_max"),
  url_string_max: schemaBound(defs.urlString?.maxLength, "url_string_max"),
  site_string_max: schemaBound(defs.siteString?.maxLength, "site_string_max"),
  adapter_string_max: schemaBound(defs.adapterString?.maxLength, "adapter_string_max"),
  ctx_string_max: schemaBound(defs.ctxString?.maxLength, "ctx_string_max"),
  type_string_max: schemaBound(defs.typeString?.maxLength, "type_string_max"),
  link_host_string_max: schemaBound(defs.linkHostString?.maxLength, "link_host_string_max"),
  level_string_max: schemaBound(defs.levelString?.maxLength, "level_string_max"),
  label_string_max: schemaBound(defs.blockAttributes?.properties?.label?.maxLength, "label_string_max"),
  text_max: schemaBound(defs.textBlock?.properties?.text?.maxLength, "text_max"),
  block_depth_max: schemaBound(defs.blockDepth?.maximum, "block_depth_max"),
  blocks_max: schemaBound(defs.snapshot?.properties?.blocks?.maxItems, "blocks_max"),
  timestamp_max: timestampMax,
};

function sha256(bytesOrStr) {
  return createHash("sha256").update(bytesOrStr).digest("hex");
}

function writeArtifact(relPath, content) {
  const fullPath = join(outDir, relPath);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content, "utf8");
}

if (sha256(readFileSync(schemaPath)) !== authority.journal.sha256) {
  throw new Error("canonical journal schema digest mismatch");
}

// 1. Generate contracts/native-browser/envelope.schema.json
const generationSchema = { type: "string", minLength: 1, maxLength: authority.string_bounds.generation };
const periodSchema = { type: "string", minLength: 1, maxLength: authority.string_bounds.period_id };
const instSchema = { $ref: "solstone-journal-format:browser-jsonl#/$defs/instString", minLength: 1 };
const batchIdSchema = { type: "string", pattern: "^[0-9a-f]{32}$" };
const versionSchema = { type: "string", maxLength: authority.string_bounds.version };
const protocolSchema = { type: "integer", minimum: 0, maximum: timestampMax };
const noProperties = (...names) => ({ not: { anyOf: names.map(name => ({ required: [name] })) } });
function stateSchema(type) {
  return {
    type: "object", additionalProperties: true,
    required: ["type", "capture", "delivery", "freshness_ms"],
    properties: {
      type: { const: type }, capture: { enum: authority.enums.capture }, delivery: { enum: authority.enums.delivery },
      freshness_ms: { type: "integer", minimum: 0, maximum: authority.policy.freshness_max_ms },
      destination_generation: { anyOf: [generationSchema, { type: "null" }] },
      period_id: { anyOf: [periodSchema, { type: "null" }] },
      failure: { enum: authority.enums.failure }, version: versionSchema,
      custody: {
        type: "object", additionalProperties: true, required: ["full", "stale"],
        properties: { full: { type: "boolean" }, stale: { type: "boolean" } },
      },
    },
    allOf: [
      { if: { properties: { capture: { enum: ["unavailable", "not_paired"] } } }, then: { properties: { destination_generation: { type: "null" }, period_id: { type: "null" } } } },
      { if: { properties: { capture: { const: "permitted" } } }, then: { required: ["destination_generation", "period_id"], properties: { destination_generation: generationSchema, period_id: periodSchema } } },
      { if: { properties: { capture: { enum: ["paused", "intake_off"] } } }, then: { required: ["destination_generation"], properties: { destination_generation: generationSchema } } },
      { if: { properties: { delivery: { const: "failed" } } }, then: { required: ["failure"] } },
    ],
  };
}
const envelopeSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "solstone-native-browser:envelope",
  title: "Solstone Native Browser Wire Envelope",
  oneOf: ["hello", "hello_ack", "unsupported", "state", "batch", "boundary", "accepted", "bye"].map(name => ({ $ref: "#/$defs/" + name })),
  $defs: {
    hello: {
      type: "object", additionalProperties: true,
      required: ["type", "protocol", "version", "brand", "inst"],
      properties: { type: { const: "hello" }, protocol: protocolSchema, version: versionSchema, brand: { enum: authority.enums.brand }, inst: instSchema },
    },
    hello_ack: stateSchema("hello_ack"),
    unsupported: {
      type: "object", additionalProperties: true, required: ["type", "protocol", "behind"],
      properties: { type: { const: "unsupported" }, protocol: protocolSchema, version: versionSchema, behind: { enum: authority.enums.behind } },
    },
    state: stateSchema("state"),
    batch: {
      type: "object", additionalProperties: true,
      required: ["type", "destination_generation", "inst", "batch_id", "queued_at_ms", "records"],
      properties: {
        type: { const: "batch" }, destination_generation: generationSchema, inst: instSchema, batch_id: batchIdSchema,
        queued_at_ms: { $ref: "solstone-journal-format:browser-jsonl#/$defs/timestamp" },
        records: { type: "array", minItems: 1, maxItems: authority.caps.delta_records, items: { $ref: "solstone-journal-format:browser-jsonl" } },
      },
    },
    boundary: {
      type: "object", additionalProperties: true, required: ["type", "destination_generation", "period_id"],
      properties: { type: { const: "boundary" }, destination_generation: generationSchema, period_id: periodSchema },
    },
    accepted: {
      type: "object", additionalProperties: true,
      required: ["type", "result", "destination_generation", "inst", "batch_id"],
      properties: {
        type: { const: "accepted" }, result: { enum: authority.enums.result },
        destination_generation: generationSchema, inst: instSchema, batch_id: batchIdSchema,
        period_id: periodSchema,
        reason: { enum: Object.values(authority.receipt_classes).flat() },
        class: { enum: Object.keys(authority.receipt_classes) },
      },
      oneOf: [
        { properties: { result: { enum: ["accepted", "duplicate"] } }, required: ["period_id"], ...noProperties("reason", "class") },
        ...Object.entries(authority.receipt_classes).map(([classification, reasons]) => ({
          properties: { result: { const: "rejected" }, reason: { enum: reasons }, class: { const: classification } },
          required: ["reason", "class"], ...noProperties("period_id"),
        })),
      ],
    },
    bye: {
      type: "object", additionalProperties: true, required: ["type", "reason"],
      properties: { type: { const: "bye" }, reason: { enum: authority.enums.bye_reason } },
    },
  },
};

const envelopeSchemaJson = JSON.stringify(envelopeSchema, null, 2) + "\n";
writeArtifact("contracts/native-browser/envelope.schema.json", envelopeSchemaJson);
const schemasJs = `// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

globalThis.SolstoneNativeBrowserSchemas = ${JSON.stringify({ envelope: envelopeSchema, journal: schema }, null, 2)};
`;
writeArtifact("contracts/native-browser/schemas.js", schemasJs);

// 2. Generate contracts/native-browser/constants.js
const constantsObj = {
  BUNDLE_VERSION: authority.bundle_version,
  WIRE_PROTOCOL: authority.wire_protocol,
  EXTENSION_TO_HOST_MAX: authority.caps.extension_to_host,
  HOST_TO_EXTENSION_MAX: authority.caps.host_to_extension,
  CONTROL_MAX: authority.caps.control,
  DELTA_RECORDS_MAX: authority.caps.delta_records,
  BATCH_ID_HEX_LEN: authority.caps.batch_id_hex,
  JSON_MAX_DEPTH: authority.caps.json_max_depth,
  FILE_MAX: authority.policy.file,
  OUTBOX_BYTES_MAX: authority.policy.outbox_bytes,
  OUTBOX_AGE_MS_MAX: authority.policy.outbox_age_ms,
  SPOOL_BYTES_MAX: authority.policy.spool_bytes,
  SPOOL_AGE_MS_MAX: authority.policy.spool_age_ms,
  FUTURE_SKEW_MS_MAX: authority.policy.future_skew_ms,
  ACCEPTED_RETENTION_MS_MIN: authority.policy.accepted_retention_ms,
  HANDSHAKE_MS_BUDGET: authority.policy.handshake_ms,
  STATE_RENEWAL_MS_INTERVAL: authority.policy.state_renewal_ms,
  FRESHNESS_MS_MAX: authority.policy.freshness_max_ms,
  PARTIAL_FRAME_MS_LIFETIME: authority.policy.partial_frame_ms,
  TIMESTAMP_MAX: authority.policy.timestamp_max,
  VERSION_MAX: authority.string_bounds.version,
  GENERATION_MAX: authority.string_bounds.generation,
  PERIOD_ID_MAX: authority.string_bounds.period_id,
  FAILURE_CODE_MAX: authority.string_bounds.failure_code,
  ...Object.fromEntries(
    Object.entries(schemaBounds).map(([k, v]) => [k.toUpperCase(), v])
  ),
  DIRECTIONS: authority.directions,
  BRAND_ENUM: authority.enums.brand,
  CAPTURE_ENUM: authority.enums.capture,
  DELIVERY_ENUM: authority.enums.delivery,
  FAILURE_ENUM: authority.enums.failure,
  BYE_REASON_ENUM: authority.enums.bye_reason,
  SNAPSHOT_REASON_ENUM: authority.enums.snapshot_reason,
  BEHIND_ENUM: authority.enums.behind,
  RESULT_ENUM: authority.enums.result,
  HOSTS_AND_IDS: authority.hosts_and_ids,
  REGISTRATION: authority.registration,
  RECEIPT_CLASSES: authority.receipt_classes,
  CANONICAL_KEY_ORDER: authority.canonical_key_order,
};

const constantsJs = `// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

(function () {
  "use strict";

  globalThis.SolstoneNativeBrowserConstants = Object.freeze(${JSON.stringify(constantsObj, null, 2)});
})();
`;
writeArtifact("contracts/native-browser/constants.js", constantsJs);

// 3. Generate crates/native-browser-frame/src/constants.rs
const constantsRs = `// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

pub const BUNDLE_VERSION: &str = "${authority.bundle_version}";
pub const WIRE_PROTOCOL: u32 = ${authority.wire_protocol};

pub const EXTENSION_TO_HOST_MAX: usize = ${authority.caps.extension_to_host};
pub const HOST_TO_EXTENSION_MAX: usize = ${authority.caps.host_to_extension};
pub const CONTROL_MAX: usize = ${authority.caps.control};
pub const DELTA_RECORDS_MAX: usize = ${authority.caps.delta_records};
pub const BATCH_ID_HEX_LEN: usize = ${authority.caps.batch_id_hex};
// Object and array containers count toward depth; the root container counts as one.
pub const JSON_MAX_DEPTH: usize = ${authority.caps.json_max_depth};

pub const FILE_MAX: usize = ${authority.policy.file};
pub const OUTBOX_BYTES_MAX: usize = ${authority.policy.outbox_bytes};
pub const OUTBOX_AGE_MS_MAX: u64 = ${authority.policy.outbox_age_ms};
pub const SPOOL_BYTES_MAX: usize = ${authority.policy.spool_bytes};
pub const SPOOL_AGE_MS_MAX: u64 = ${authority.policy.spool_age_ms};
pub const FUTURE_SKEW_MS_MAX: u64 = ${authority.policy.future_skew_ms};
pub const ACCEPTED_RETENTION_MS_MIN: u64 = ${authority.policy.accepted_retention_ms};
pub const HANDSHAKE_MS_BUDGET: u64 = ${authority.policy.handshake_ms};
pub const STATE_RENEWAL_MS_INTERVAL: u64 = ${authority.policy.state_renewal_ms};
pub const FRESHNESS_MS_MAX: u64 = ${authority.policy.freshness_max_ms};
pub const PARTIAL_FRAME_MS_LIFETIME: u64 = ${authority.policy.partial_frame_ms};
pub const TIMESTAMP_MAX: u64 = ${authority.policy.timestamp_max};

pub const VERSION_MAX: usize = ${authority.string_bounds.version};
pub const GENERATION_MAX: usize = ${authority.string_bounds.generation};
pub const PERIOD_ID_MAX: usize = ${authority.string_bounds.period_id};
pub const FAILURE_CODE_MAX: usize = ${authority.string_bounds.failure_code};

pub const INST_STRING_MAX: usize = ${schemaBounds.inst_string_max};
pub const ID_STRING_MAX: usize = ${schemaBounds.id_string_max};
pub const TITLE_STRING_MAX: usize = ${schemaBounds.title_string_max};
pub const URL_STRING_MAX: usize = ${schemaBounds.url_string_max};
pub const SITE_STRING_MAX: usize = ${schemaBounds.site_string_max};
pub const ADAPTER_STRING_MAX: usize = ${schemaBounds.adapter_string_max};
pub const CTX_STRING_MAX: usize = ${schemaBounds.ctx_string_max};
pub const TYPE_STRING_MAX: usize = ${schemaBounds.type_string_max};
pub const LINK_HOST_STRING_MAX: usize = ${schemaBounds.link_host_string_max};
pub const LEVEL_STRING_MAX: usize = ${schemaBounds.level_string_max};
pub const LABEL_STRING_MAX: usize = ${schemaBounds.label_string_max};
pub const TEXT_MAX: usize = ${schemaBounds.text_max};
pub const BLOCK_DEPTH_MAX: u64 = ${schemaBounds.block_depth_max};
pub const BLOCKS_MAX: usize = ${schemaBounds.blocks_max};

pub const BRAND_ENUM: &[&str] = &[${authority.enums.brand.map((x) => `"${x}"`).join(", ")}];
pub const CAPTURE_ENUM: &[&str] = &[${authority.enums.capture.map((x) => `"${x}"`).join(", ")}];
pub const DELIVERY_ENUM: &[&str] = &[${authority.enums.delivery.map((x) => `"${x}"`).join(", ")}];
pub const FAILURE_ENUM: &[&str] = &[${authority.enums.failure.map((x) => `"${x}"`).join(", ")}];
pub const BYE_REASON_ENUM: &[&str] = &[${authority.enums.bye_reason.map((x) => `"${x}"`).join(", ")}];
pub const SNAPSHOT_REASON_ENUM: &[&str] = &[${authority.enums.snapshot_reason.map((x) => `"${x}"`).join(", ")}];
pub const BEHIND_ENUM: &[&str] = &[${authority.enums.behind.map((x) => `"${x}"`).join(", ")}];

pub const RESULT_ENUM: &[&str] = &[${authority.enums.result.map((x) => `"${x}"`).join(", ")}];
pub const RETRYABLE_REASONS: &[&str] = &[${authority.receipt_classes.retryable.map((x) => `"${x}"`).join(", ")}];
pub const PERMANENT_REASONS: &[&str] = &[${authority.receipt_classes.permanent.map((x) => `"${x}"`).join(", ")}];
pub const REGISTRATION_JSON: &str = r#"${JSON.stringify(authority.registration)}"#;
pub const CANONICAL_KEY_ORDER_JSON: &str = r#"${JSON.stringify(authority.canonical_key_order)}"#;

pub const REGISTRATION_DESCRIPTION: &str = "${authority.registration.description}";
pub const REGISTRATION_TYPE: &str = "${authority.registration.type}";
pub const REGISTRATION_PATH_PLACEHOLDER: &str = "${authority.registration.path_placeholder}";

pub const PROD_HOST: &str = "${authority.hosts_and_ids.production.host}";
pub const PROD_CHROME_ID: &str = "${authority.hosts_and_ids.production.chrome_id}";
pub const PROD_EDGE_ID: &str = "${authority.hosts_and_ids.production.edge_id}";
pub const PROD_FIREFOX_ID: &str = "${authority.hosts_and_ids.production.firefox_id}";

pub const DEV_HOST: &str = "${authority.hosts_and_ids.dev.host}";
pub const DEV_CHROME_ID: &str = "${authority.hosts_and_ids.dev.chrome_id}";
pub const DEV_EDGE_ID: &str = "${authority.hosts_and_ids.dev.edge_id}";
pub const DEV_FIREFOX_ID: &str = "${authority.hosts_and_ids.dev.firefox_id}";
`;
writeArtifact("crates/native-browser-frame/src/constants.rs", constantsRs);

// 4. Generate contracts/native-browser/adoption.schema.json
const adoptionSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "solstone-native-browser:adoption",
  title: "Solstone Native Browser Adoption Pin",
  type: "object",
  additionalProperties: false,
  required: [
    "bundle_path",
    "source_revision",
    "bundle_version",
    "wire_protocol",
    "manifest_sha256",
    "journal_schema_id",
    "journal_schema_sha256",
    "journal_schema_revision",
  ],
  properties: {
    bundle_path: { const: "contracts/native-browser" },
    source_revision: { type: "string", minLength: 1 },
    bundle_version: { const: authority.bundle_version },
    wire_protocol: { const: authority.wire_protocol },
    manifest_sha256: { type: "string", pattern: "^[0-9a-f]{64}$" },
    journal_schema_id: { const: authority.journal.id },
    journal_schema_sha256: { const: authority.journal.sha256 },
    journal_schema_revision: { const: authority.journal.revision },
  },
};
const adoptionSchemaJson = JSON.stringify(adoptionSchema, null, 2) + "\n";
writeArtifact("contracts/native-browser/adoption.schema.json", adoptionSchemaJson);

// 5. Generate 18 registration files under contracts/native-browser/registration/<channel>/<browser>/<os>.json
const channels = ["production", "dev"];
const browsers = ["chrome", "edge", "firefox"];
const oses = ["linux", "macos", "windows"];

for (const channel of channels) {
  const hostInfo = authority.hosts_and_ids[channel];
  const host = hostInfo.host;
  for (const browser of browsers) {
    let id;
    if (browser === "chrome") id = hostInfo.chrome_id;
    else if (browser === "edge") id = hostInfo.edge_id;
    else if (browser === "firefox") id = hostInfo.firefox_id;

    const manifest = {
      name: host,
      description: authority.registration.description,
      path: authority.registration.path_placeholder,
      type: authority.registration.type,
    };

    if (browser === "firefox") {
      manifest.allowed_extensions = [id];
    } else {
      manifest.allowed_origins = [`chrome-extension://${id}/`];
    }

    for (const os of oses) {
      const regPath = `contracts/native-browser/registration/${channel}/${browser}/${os}.json`;
      writeArtifact(regPath, JSON.stringify(manifest, null, 2) + "\n");
    }
  }
}

// 6. Generate contracts/native-browser/recipes.json using codec
globalThis.SolstoneNativeBrowserConstants = constantsObj;
globalThis.SolstoneNativeBrowserSchemas = { envelope: envelopeSchema, journal: schema };
await import(pathToFileURL(join(ROOT, "native-browser/schema-validator.js")).href);
await import(pathToFileURL(join(ROOT, "native-browser/codec.js")).href);
const Codec = globalThis.SolstoneNativeBrowser;

const recipesList = [
  {
    id: "extension_to_host_batch_max",
    target_length: authority.caps.extension_to_host,
    expect: "accept",
  },
  {
    id: "extension_to_host_batch_oversize",
    target_length: authority.caps.extension_to_host + 1,
    expect: "refuse",
    code: "oversize",
  },
  {
    id: "control_payload_max",
    target_length: authority.caps.control,
    expect: "accept",
  },
  {
    id: "control_payload_oversize",
    target_length: authority.caps.control + 1,
    expect: "refuse",
    code: "oversize",
  },
  {
    id: "batch_delta_cap_3000",
    expect: "accept",
  },
  {
    id: "batch_delta_oversize_3001",
    expect: "refuse",
    code: "too_many_deltas",
  },
];

const recipesOutput = [];
for (const r of recipesList) {
  const built = Codec.buildRecipe(r.id);
  const entry = {
    id: r.id,
    target_length: built.length,
    sha256: sha256(built.bytes),
    expect: r.expect,
  };
  if (r.code) entry.code = r.code;
  recipesOutput.push(entry);
}

const recipesJson = JSON.stringify(recipesOutput, null, 2) + "\n";
writeArtifact("contracts/native-browser/recipes.json", recipesJson);

// 7. Generate contracts/native-browser/corpus.json
const corpus = [];

function addVector(v, supplyContext = true) {
  if (supplyContext && v.payloadObj?.type === "batch" && Array.isArray(v.payloadObj.records)) {
    for (const record of v.payloadObj.records) {
      if (!Object.hasOwn(record, "ctx")) record.ctx = "c";
    }
  }
  if (v.payloadObj) {
    const encoded = Codec.encode(v.payloadObj);
    v.payload = new TextDecoder().decode(encoded);
    delete v.payloadObj;
  }
  corpus.push(v);
}

// --- 7.1 Families: Positive, Wrong-Direction, Missing-Field ---

// 1. hello
addVector({
  id: "hello_positive",
  direction: "extension_to_host",
  payloadObj: {
    type: "hello",
    protocol: 1,
    version: "1.0.0",
    brand: "chrome",
    inst: "desktop_inst_1",
  },
  expect: "accept",
});

addVector({
  id: "hello_wrong_direction",
  direction: "host_to_extension",
  payloadObj: {
    type: "hello",
    protocol: 1,
    version: "1.0.0",
    brand: "chrome",
    inst: "desktop_inst_1",
  },
  expect: "refuse",
  code: "bad_direction",
});

addVector({
  id: "hello_missing_field",
  direction: "extension_to_host",
  payloadObj: {
    type: "hello",
    protocol: 1,
    brand: "chrome",
    inst: "desktop_inst_1",
  },
  expect: "refuse",
  code: "missing_field",
});

// 2. hello_ack
addVector({
  id: "hello_ack_positive",
  direction: "host_to_extension",
  payloadObj: {
    type: "hello_ack",
    freshness_ms: authority.policy.freshness_max_ms,
    capture: "permitted",
    delivery: "delivered",
    destination_generation: "g1",
    period_id: "p1",
  },
  expect: "accept",
});

addVector({
  id: "hello_ack_wrong_direction",
  direction: "extension_to_host",
  payloadObj: {
    type: "hello_ack",
    freshness_ms: authority.policy.freshness_max_ms,
    capture: "permitted",
    delivery: "delivered",
    destination_generation: "g1",
    period_id: "p1",
  },
  expect: "refuse",
  code: "bad_direction",
});

addVector({
  id: "hello_ack_missing_field",
  direction: "host_to_extension",
  payloadObj: {
    type: "hello_ack",
    freshness_ms: authority.policy.freshness_max_ms,
    delivery: "delivered",
  },
  expect: "refuse",
  code: "missing_field",
});

// 3. unsupported (wire message host->ext)
addVector({
  id: "unsupported_positive",
  direction: "host_to_extension",
  payloadObj: {
    type: "unsupported",
    protocol: 2,
    behind: "app",
  },
  expect: "accept",
});

addVector({
  id: "unsupported_wrong_direction",
  direction: "extension_to_host",
  payloadObj: {
    type: "unsupported",
    protocol: 2,
    behind: "app",
  },
  expect: "refuse",
  code: "bad_direction",
});

addVector({
  id: "unsupported_missing_field",
  direction: "host_to_extension",
  payloadObj: {
    type: "unsupported",
    protocol: 2,
  },
  expect: "refuse",
  code: "missing_field",
});

// 4. state
addVector({
  id: "state_positive",
  direction: "host_to_extension",
  payloadObj: {
    type: "state",
    freshness_ms: authority.policy.freshness_max_ms,
    capture: "permitted",
    delivery: "delivered",
    destination_generation: "g1",
    period_id: "p1",
  },
  expect: "accept",
});

addVector({
  id: "state_wrong_direction",
  direction: "extension_to_host",
  payloadObj: {
    type: "state",
    freshness_ms: authority.policy.freshness_max_ms,
    capture: "permitted",
    delivery: "delivered",
    destination_generation: "g1",
    period_id: "p1",
  },
  expect: "refuse",
  code: "bad_direction",
});

addVector({
  id: "state_missing_field",
  direction: "host_to_extension",
  payloadObj: {
    type: "state",
    freshness_ms: authority.policy.freshness_max_ms,
    capture: "permitted",
  },
  expect: "refuse",
  code: "missing_field",
});

// 5. boundary
addVector({
  id: "boundary_positive",
  direction: "host_to_extension",
  payloadObj: {
    type: "boundary",
    destination_generation: "g1",
    period_id: "p1",
  },
  expect: "accept",
});

addVector({
  id: "boundary_wrong_direction",
  direction: "extension_to_host",
  payloadObj: {
    type: "boundary",
    destination_generation: "g1",
    period_id: "p1",
  },
  expect: "refuse",
  code: "bad_direction",
});

addVector({
  id: "boundary_missing_field",
  direction: "host_to_extension",
  payloadObj: {
    type: "boundary",
    destination_generation: "g1",
  },
  expect: "refuse",
  code: "missing_field",
});

// 6. accepted
addVector({
  id: "accepted_positive",
  direction: "host_to_extension",
  payloadObj: {
    type: "accepted",
    destination_generation: "g1",
    inst: "inst1",
    batch_id: "0123456789abcdef0123456789abcdef",
    period_id: "p1",
    result: "accepted",
  },
  expect: "accept",
});

addVector({
  id: "accepted_wrong_direction",
  direction: "extension_to_host",
  payloadObj: {
    type: "accepted",
    destination_generation: "g1",
    inst: "inst1",
    batch_id: "0123456789abcdef0123456789abcdef",
    period_id: "p1",
    result: "accepted",
  },
  expect: "refuse",
  code: "bad_direction",
});

addVector({
  id: "accepted_missing_field",
  direction: "host_to_extension",
  payloadObj: {
    type: "accepted",
    destination_generation: "g1",
    inst: "inst1",
    batch_id: "0123456789abcdef0123456789abcdef",
    period_id: "p1",
  },
  expect: "refuse",
  code: "invalid_receipt",
});

// 7. bye
addVector({
  id: "bye_positive",
  direction: "host_to_extension",
  payloadObj: {
    type: "bye",
    reason: "shutdown",
  },
  expect: "accept",
});

addVector({
  id: "bye_wrong_direction",
  direction: "extension_to_host",
  payloadObj: {
    type: "bye",
    reason: "shutdown",
  },
  expect: "refuse",
  code: "bad_direction",
});

addVector({
  id: "bye_missing_field",
  direction: "host_to_extension",
  payloadObj: {
    type: "bye",
  },
  expect: "refuse",
  code: "missing_field",
});

// 8. batch
addVector({
  id: "batch_positive",
  direction: "extension_to_host",
  payloadObj: {
    type: "batch",
    destination_generation: "g1",
    inst: "inst1",
    batch_id: "0123456789abcdef0123456789abcdef",
    queued_at_ms: 100,
    records: [
      {
        t: "segment_start",
        ts: 100,
        blocks: [{ id: "b1", text: "Hello" }],
      },
    ],
  },
  expect: "accept",
});

addVector({
  id: "batch_wrong_direction",
  direction: "host_to_extension",
  payloadObj: {
    type: "batch",
    destination_generation: "g1",
    inst: "inst1",
    batch_id: "0123456789abcdef0123456789abcdef",
    queued_at_ms: 100,
    records: [{ t: "delta", ts: 100, op: "remove", block: { id: "d1" } }],
  },
  expect: "refuse",
  code: "bad_direction",
});

addVector({
  id: "batch_missing_field",
  direction: "extension_to_host",
  payloadObj: {
    type: "batch",
    destination_generation: "g1",
    inst: "inst1",
    queued_at_ms: 100,
    records: [{ t: "delta", ts: 100, op: "remove", block: { id: "d1" } }],
  },
  expect: "refuse",
  code: "missing_field",
});

// --- 7.2 Invalid Enum Vectors ---
addVector({
  id: "hello_invalid_brand",
  direction: "extension_to_host",
  payloadObj: {
    type: "hello",
    protocol: 1,
    version: "1.0.0",
    brand: "safari",
    inst: "inst1",
  },
  expect: "refuse",
  code: "invalid_enum",
});

addVector({
  id: "hello_ack_invalid_capture",
  direction: "host_to_extension",
  payloadObj: {
    type: "hello_ack",
    freshness_ms: authority.policy.freshness_max_ms,
    capture: "unknown_capture",
    delivery: "idle",
  },
  expect: "refuse",
  code: "invalid_enum",
});

addVector({
  id: "unsupported_invalid_behind",
  direction: "host_to_extension",
  payloadObj: {
    type: "unsupported",
    protocol: 2,
    behind: "unknown_behind",
  },
  expect: "refuse",
  code: "invalid_enum",
});

addVector({
  id: "state_invalid_capture",
  direction: "host_to_extension",
  payloadObj: {
    type: "state",
    freshness_ms: authority.policy.freshness_max_ms,
    capture: "unknown_capture",
    delivery: "idle",
  },
  expect: "refuse",
  code: "invalid_enum",
});

addVector({
  id: "batch_record_invalid_snapshot_reason",
  direction: "extension_to_host",
  payloadObj: {
    type: "batch",
    destination_generation: "g1",
    inst: "inst1",
    batch_id: "0123456789abcdef0123456789abcdef",
    queued_at_ms: 100,
    records: [
      {
        t: "segment_start",
        ts: 100,
        snapshot_reason: "unknown_reason",
        blocks: [{ id: "b1", text: "text" }],
      },
    ],
  },
  expect: "refuse",
  code: "invalid_enum",
});

addVector({
  id: "bye_invalid_reason",
  direction: "host_to_extension",
  payloadObj: {
    type: "bye",
    reason: "crash",
  },
  expect: "refuse",
  code: "invalid_enum",
});

addVector({
  id: "accepted_invalid_result_enum",
  direction: "host_to_extension",
  payloadObj: {
    type: "accepted",
    destination_generation: "g1",
    inst: "inst1",
    batch_id: "0123456789abcdef0123456789abcdef",
    period_id: "p1",
    result: "invalid",
  },
  expect: "refuse",
  code: "invalid_receipt",
});

// --- 7.3 Hello Protocol and Skew Vectors ---
addVector({
  id: "hello_protocol_unsupported_app",
  direction: "extension_to_host",
  payloadObj: {
    type: "hello",
    protocol: 2,
    version: "2.0.0",
    brand: "chrome",
    inst: "inst_app",
  },
  expect: "unsupported",
  behind: "app",
});

addVector({
  id: "hello_protocol_unsupported_extension",
  direction: "extension_to_host",
  payloadObj: {
    type: "hello",
    protocol: 0,
    version: "0.1.0",
    brand: "chrome",
    inst: "inst_ext",
  },
  expect: "unsupported",
  behind: "extension",
});

addVector({
  id: "hello_protocol_version_skew_accepted",
  direction: "extension_to_host",
  payloadObj: {
    type: "hello",
    protocol: 1,
    version: "9.9.9",
    brand: "edge",
    inst: "inst2",
  },
  expect: "accept",
});

addVector({
  id: "hello_protocol_float_integral",
  direction: "extension_to_host",
  raw: '{"type":"hello","protocol":1.0,"version":"1.0.0","brand":"firefox","inst":"inst3"}',
  expect: "accept",
});

addVector({
  id: "hello_protocol_bad_number",
  direction: "extension_to_host",
  raw: '{"type":"hello","protocol":2.5,"version":"2.5.0","brand":"chrome","inst":"inst"}',
  expect: "refuse",
  code: "bad_number",
});

// --- 7.4 State Matrix and Boundary States ---
for (const cap of authority.enums.capture) {
  for (const del of authority.enums.delivery) {
    const isFailed = del === "failed";
    const failureCode = isFailed ? "relay_unavailable" : undefined;
    let gen;
    let period;
    if (cap === "permitted") {
      gen = "gen_1";
      period = "per_1";
    } else if (cap === "paused" || cap === "intake_off") {
      gen = "gen_1";
      period = del === "delivered" ? "per_1" : undefined;
    }

    const stateObj = {
      type: "state",
      freshness_ms: authority.policy.freshness_max_ms,
      capture: cap,
      delivery: del,
    };
    if (failureCode) stateObj.failure = failureCode;
    if (gen) stateObj.destination_generation = gen;
    if (period) stateObj.period_id = period;

    addVector({
      id: `state_matrix_${cap}_${del}`,
      direction: "host_to_extension",
      payloadObj: stateObj,
      expect: "accept",
    });
  }
}

addVector({
  id: "state_freshness_boundary_0",
  direction: "host_to_extension",
  payloadObj: {
    type: "state",
    capture: "permitted",
    delivery: "delivered",
    freshness_ms: 0,
    destination_generation: "g1",
    period_id: "p1",
  },
  expect: "accept",
});

addVector({
  id: "state_freshness_boundary_15000",
  direction: "host_to_extension",
  payloadObj: {
    type: "state",
    capture: "permitted",
    delivery: "delivered",
    freshness_ms: 15000,
    destination_generation: "g1",
    period_id: "p1",
  },
  expect: "accept",
});

addVector({
  id: "state_freshness_out_of_range_15001",
  direction: "host_to_extension",
  payloadObj: {
    type: "state",
    capture: "permitted",
    delivery: "delivered",
    freshness_ms: 15001,
    destination_generation: "g1",
    period_id: "p1",
  },
  expect: "refuse",
  code: "freshness_range",
});

addVector({
  id: "state_failure_independent_of_delivery",
  direction: "host_to_extension",
  payloadObj: {
    type: "state",
    freshness_ms: authority.policy.freshness_max_ms,
    capture: "permitted",
    delivery: "delivered",
    failure: "relay_unavailable",
    destination_generation: "g1",
    period_id: "p1",
  },
  expect: "accept",
});

addVector({
  id: "state_illegal_ids_when_not_paired",
  direction: "host_to_extension",
  payloadObj: {
    type: "state",
    freshness_ms: authority.policy.freshness_max_ms,
    capture: "not_paired",
    delivery: "idle",
    destination_generation: "g1",
    period_id: "p1",
  },
  expect: "refuse",
  code: "bad_state_ids",
});

addVector({
  id: "state_illegal_missing_ids_when_permitted",
  direction: "host_to_extension",
  payloadObj: {
    type: "state",
    freshness_ms: authority.policy.freshness_max_ms,
    capture: "permitted",
    delivery: "delivered",
  },
  expect: "refuse",
  code: "bad_state_ids",
});

// --- 7.5 ID Tests for Snapshot, Add, Update, Remove ---
const blockKinds = ["snapshot", "add", "update", "remove"];
for (const kind of blockKinds) {
  function makeBatchWithBlock(idVal, hasId = true) {
    const blk = hasId ? { id: idVal } : {};
    if (kind !== "remove") blk.text = "content";
    const record = kind === "snapshot"
      ? { t: "segment_start", ts: 100, blocks: [blk] }
      : { t: "delta", ts: 100, op: kind, block: blk };
    return {
      type: "batch",
      destination_generation: "g1",
      inst: "inst1",
      batch_id: "0123456789abcdef0123456789abcdef",
      queued_at_ms: 100,
      records: [record],
    };
  }

  // Missing id
  addVector({
    id: `id_missing_${kind}`,
    direction: "extension_to_host",
    payloadObj: makeBatchWithBlock(undefined, false),
    expect: "refuse",
    code: "bad_record",
    cause: "missing",
  });

  // Empty id
  addVector({
    id: `id_empty_${kind}`,
    direction: "extension_to_host",
    payloadObj: makeBatchWithBlock("", true),
    expect: "refuse",
    code: "bad_record",
    cause: "empty",
  });

  // Max length id (256)
  addVector({
    id: `id_max_len_${kind}`,
    direction: "extension_to_host",
    payloadObj: makeBatchWithBlock("x".repeat(256), true),
    expect: "accept",
  });

  // Over max length id (257)
  addVector({
    id: `id_over_max_len_${kind}`,
    direction: "extension_to_host",
    payloadObj: makeBatchWithBlock("x".repeat(257), true),
    expect: "refuse",
    code: "bad_record",
    cause: "too_long",
  });

  // Short nonempty id
  addVector({
    id: `id_short_${kind}`,
    direction: "extension_to_host",
    payloadObj: makeBatchWithBlock("b1", true),
    expect: "accept",
  });
}

// --- 7.6 Batch ID Formats ---
addVector({
  id: "batch_id_short_31",
  direction: "extension_to_host",
  payloadObj: {
    type: "batch",
    destination_generation: "g1",
    inst: "inst1",
    batch_id: "0123456789abcdef0123456789abcde",
    queued_at_ms: 100,
    records: [{ t: "delta", ts: 100, op: "remove", block: { id: "d1" } }],
  },
  expect: "refuse",
  code: "bad_batch_id",
});

addVector({
  id: "batch_id_long_33",
  direction: "extension_to_host",
  payloadObj: {
    type: "batch",
    destination_generation: "g1",
    inst: "inst1",
    batch_id: "0123456789abcdef0123456789abcdef0",
    queued_at_ms: 100,
    records: [{ t: "delta", ts: 100, op: "remove", block: { id: "d1" } }],
  },
  expect: "refuse",
  code: "bad_batch_id",
});

addVector({
  id: "batch_id_uppercase",
  direction: "extension_to_host",
  payloadObj: {
    type: "batch",
    destination_generation: "g1",
    inst: "inst1",
    batch_id: "0123456789ABCDEF0123456789ABCDEF",
    queued_at_ms: 100,
    records: [{ t: "delta", ts: 100, op: "remove", block: { id: "d1" } }],
  },
  expect: "refuse",
  code: "bad_batch_id",
});

addVector({
  id: "batch_id_hyphenated",
  direction: "extension_to_host",
  payloadObj: {
    type: "batch",
    destination_generation: "g1",
    inst: "inst1",
    batch_id: "01234567-89ab-cdef-0123-456789abcdef",
    queued_at_ms: 100,
    records: [{ t: "delta", ts: 100, op: "remove", block: { id: "d1" } }],
  },
  expect: "refuse",
  code: "bad_batch_id",
});

// --- 7.7 Number Lexemes ---
addVector({
  id: "batch_queued_at_ms_fraction_1000_0",
  direction: "extension_to_host",
  raw: '{"type":"batch","destination_generation":"g1","inst":"inst1","batch_id":"0123456789abcdef0123456789abcdef","queued_at_ms":1000.0,"records":[{"t":"segment_start","ctx":"c","ts":0,"blocks":[{"id":"b1","text":"x"}]}]}',
  expect: "accept",
});

addVector({
  id: "batch_queued_at_ms_exponential_1e3",
  direction: "extension_to_host",
  raw: '{"type":"batch","destination_generation":"g1","inst":"inst1","batch_id":"0123456789abcdef0123456789abcdef","queued_at_ms":1e3,"records":[{"t":"segment_start","ctx":"c","ts":0,"blocks":[{"id":"b1","text":"x"}]}]}',
  expect: "accept",
});

addVector({
  id: "batch_queued_at_ms_above_max",
  direction: "extension_to_host",
  raw: '{"type":"batch","destination_generation":"g1","inst":"inst1","batch_id":"0123456789abcdef0123456789abcdef","queued_at_ms":9007199254740992,"records":[{"t":"segment_start","ctx":"c","ts":0,"blocks":[{"id":"b1","text":"x"}]}]}',
  expect: "refuse",
  code: "bad_number",
});

addVector({
  id: "batch_queued_at_ms_negative",
  direction: "extension_to_host",
  raw: '{"type":"batch","destination_generation":"g1","inst":"inst1","batch_id":"0123456789abcdef0123456789abcdef","queued_at_ms":-10,"records":[{"t":"delta","ctx":"c","ts":100,"op":"remove","block":{"id":"d1"}}]}',
  expect: "refuse",
  code: "bad_number",
});

// --- 7.8 Retry Vectors (Same Identity and queued_at_ms) ---
addVector({
  id: "batch_retry_1",
  direction: "extension_to_host",
  payloadObj: {
    type: "batch",
    destination_generation: "retry_gen",
    inst: "retry_inst",
    batch_id: "0123456789abcdef0123456789abcdef",
    queued_at_ms: 1700000000000,
    records: [{ t: "delta", ts: 1700000000000, op: "add", block: { id: "b1", text: "try1" } }],
  },
  expect: "accept",
});

addVector({
  id: "batch_retry_2",
  direction: "extension_to_host",
  payloadObj: {
    type: "batch",
    destination_generation: "retry_gen",
    inst: "retry_inst",
    batch_id: "0123456789abcdef0123456789abcdef",
    queued_at_ms: 1700000000000,
    records: [{ t: "delta", ts: 1700000000000, op: "add", block: { id: "b1", text: "try2" } }],
  },
  expect: "accept",
});

// --- 7.9 Recovery Sequence Vectors ---
addVector({
  id: "batch_recovery_snapshot",
  direction: "extension_to_host",
  payloadObj: {
    type: "batch",
    destination_generation: "retry_gen",
    inst: "retry_inst",
    batch_id: "0123456789abcdef0123456789abcdef",
    queued_at_ms: 1700000000000,
    records: [
      {
        t: "segment_start",
        ts: 1700000000000,
        site: "example.com",
        n: 1,
        blocks: [{ id: "b1", text: "Recovery snapshot" }],
        snapshot_reason: "delivery_recovery",
      },
    ],
  },
  expect: "accept",
});

addVector({
  id: "boundary_recovery",
  direction: "host_to_extension",
  payloadObj: {
    type: "boundary",
    destination_generation: "retry_gen",
    period_id: "p_boundary",
  },
  expect: "accept",
});

addVector({
  id: "accepted_recovery_duplicate",
  direction: "host_to_extension",
  payloadObj: {
    type: "accepted",
    destination_generation: "retry_gen",
    inst: "retry_inst",
    batch_id: "0123456789abcdef0123456789abcdef",
    period_id: "p_original",
    result: "duplicate",
  },
  expect: "accept",
});

// --- 7.10 Context & Unicode Vectors ---
addVector({
  id: "batch_inst_mismatch_record_inst",
  direction: "extension_to_host",
  payloadObj: {
    type: "batch",
    destination_generation: "g1",
    inst: "inst1",
    batch_id: "0123456789abcdef0123456789abcdef",
    queued_at_ms: 100,
    records: [
      {
        t: "segment_start",
        ts: 100,
        inst: "mismatched_inst",
        n: 1,
        blocks: [{ id: "b1", text: "x" }],
      },
    ],
  },
  expect: "refuse",
  code: "bad_record",
  cause: "mismatch",
});

addVector({
  id: "batch_mixed_context",
  direction: "extension_to_host",
  payloadObj: {
    type: "batch",
    destination_generation: "g1",
    inst: "inst1",
    batch_id: "0123456789abcdef0123456789abcdef",
    queued_at_ms: 100,
    records: [
      { t: "delta", ts: 100, ctx: "ctx_a", op: "remove", block: { id: "d1" } },
      { t: "delta", ts: 100, ctx: "ctx_b", op: "remove", block: { id: "d2" } },
    ],
  },
  expect: "refuse",
  code: "mixed_context",
});

addVector({
  id: "unicode_astral_and_escapes",
  direction: "extension_to_host",
  payloadObj: {
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
        blocks: [{ id: "b1", text: "Astral: \u{1F600}, Control: \u0001, Separators: \u2028\u2029" }],
      },
    ],
  },
  expect: "accept",
});

addVector({
  id: "lone_surrogate_raw",
  direction: "extension_to_host",
  raw: '{"type":"batch","destination_generation":"g1","inst":"inst1","batch_id":"0123456789abcdef0123456789abcdef","queued_at_ms":100,"records":[{"t":"segment_start","ctx":"c","ts":100,"n":1,"blocks":[{"id":"b1","text":"\\uD800 alone"}]}]}',
  expect: "refuse",
  code: "lone_surrogate",
});

addVector({
  id: "sentinel_planted_in_failing_record",
  direction: "extension_to_host",
  payloadObj: {
    type: "batch",
    destination_generation: "g1",
    inst: "inst1",
    batch_id: "0123456789abcdef0123456789abcdef",
    queued_at_ms: 100,
    records: [
      {
        t: "segment_start",
        ts: 100,
        title: "ZQ_SENTINEL_do_not_echo in title",
        url: "https://example.com/ZQ_SENTINEL_do_not_echo",
        n: 1,
        blocks: [{ id: "", text: "ZQ_SENTINEL_do_not_echo in text" }],
      },
    ],
  },
  expect: "refuse",
  code: "bad_record",
  cause: "empty",
});

// Receipt variants share one family; class and reason are a coupled contract.
const receiptIdentity = { destination_generation: "g1", inst: "inst1", batch_id: "0123456789abcdef0123456789abcdef" };
for (const [classification, reasons] of Object.entries(authority.receipt_classes)) {
  for (const reason of reasons) {
    const value = { type: "accepted", result: "rejected", ...receiptIdentity, reason, class: classification };
    addVector({ id: "receipt_rejected_" + reason, direction: "host_to_extension", payloadObj: value, expect: "accept" });
    addVector({ id: "receipt_wrong_class_" + reason, direction: "host_to_extension", payloadObj: { ...value, class: classification === "retryable" ? "permanent" : "retryable" }, expect: "refuse", code: "invalid_receipt" });
  }
}
for (const result of ["accepted", "duplicate"]) {
  const value = { type: "accepted", result, ...receiptIdentity, period_id: "p_original" };
  addVector({ id: "receipt_success_" + result, direction: "host_to_extension", payloadObj: value, expect: "accept" });
  addVector({ id: "receipt_success_with_reason_" + result, direction: "host_to_extension", payloadObj: { ...value, reason: "snapshot_required", class: "retryable" }, expect: "refuse", code: "invalid_receipt" });
}
addVector({ id: "receipt_rejected_with_period", direction: "host_to_extension", payloadObj: { type: "accepted", result: "rejected", ...receiptIdentity, reason: "snapshot_required", class: "retryable", period_id: "p_wrong" }, expect: "refuse", code: "invalid_receipt" });
addVector({ id: "receipt_unknown_reason", direction: "host_to_extension", payloadObj: { type: "accepted", result: "rejected", ...receiptIdentity, reason: "unknown", class: "permanent" }, expect: "refuse", code: "invalid_receipt" });
for (const missing of ["destination_generation", "inst", "batch_id"]) {
  const value = { type: "accepted", result: "rejected", ...receiptIdentity, reason: "snapshot_required", class: "retryable" };
  delete value[missing];
  addVector({ id: "receipt_missing_" + missing, direction: "host_to_extension", payloadObj: value, expect: "refuse", code: "invalid_receipt" });
}
for (const type of ["state", "hello_ack"]) {
  for (const reason of ["resource_exhausted", "queue_full", "age_policy", "unaccepted_lost"]) {
    addVector({ id: type + "_capture_pressure_" + reason, direction: "host_to_extension", payloadObj: { type, capture: "intake_off", delivery: "kept_locally", freshness_ms: 15000, destination_generation: "g1", period_id: null, failure: reason }, expect: "accept" });
  }
  const custodyBase = { type, capture: "permitted", delivery: "failed", failure: "relay_unavailable", freshness_ms: 15000, destination_generation: "g1", period_id: "p1" };
  for (const full of [false, true]) {
    for (const stale of [false, true]) {
      addVector({ id: type + "_custody_" + full + "_" + stale, direction: "host_to_extension", payloadObj: { ...custodyBase, custody: { full, stale } }, expect: "accept" });
    }
  }
  addVector({ id: type + "_custody_omitted", direction: "host_to_extension", payloadObj: custodyBase, expect: "accept" });
  addVector({ id: type + "_custody_additive", direction: "host_to_extension", payloadObj: { ...custodyBase, custody: { full: false, stale: true, future_fact: "preserved" } }, expect: "accept" });
  for (const [suffix, custody] of [
    ["null", null], ["array", []], ["empty", {}],
    ["missing_full", { stale: true }], ["missing_stale", { full: true }],
    ["full_type", { full: 1, stale: false }], ["stale_type", { full: false, stale: "true" }],
  ]) {
    addVector({ id: type + "_custody_invalid_" + suffix, direction: "host_to_extension", payloadObj: { ...custodyBase, custody }, expect: "refuse", code: "missing_field" });
  }
  addVector({ id: type + "_null_unpaired", direction: "host_to_extension", payloadObj: { type, capture: "not_paired", delivery: "unknown", freshness_ms: 0, destination_generation: null, period_id: null }, expect: "accept" });
  addVector({ id: type + "_no_freshness", direction: "host_to_extension", payloadObj: { type, capture: "not_paired", delivery: "unknown" }, expect: "refuse", code: "missing_field" });
}

// Native batches require an explicit stable context even though historical journal rows may omit it.
const contextBase = { type: "batch", ...receiptIdentity, queued_at_ms: 100 };
const contextDelta = { t: "delta", ts: 100, ctx: "c", op: "remove", block: { id: "b" } };
const missingContext = { ...contextDelta };
delete missingContext.ctx;
for (const [suffix, records, cause] of [
  ["missing", [missingContext], "missing"],
  ["empty", [{ ...contextDelta, ctx: "" }], "empty"],
  ["missing_first", [missingContext, contextDelta], "missing"],
  ["missing_last", [contextDelta, missingContext], "missing"],
]) {
  addVector({ id: "batch_ctx_" + suffix, direction: "extension_to_host", payloadObj: { ...contextBase, records }, expect: "refuse", code: "bad_record", cause }, false);
}

// Bound parser resources identically across consumers; root object contributes one container.
for (const [id, containers, expect] of [
  ["json_depth_at_limit", authority.caps.json_max_depth, "accept"],
  ["json_depth_over_limit", authority.caps.json_max_depth + 1, "refuse"],
]) {
  let extra = null;
  for (let depth = 1; depth < containers; depth++) extra = [extra];
  const raw = JSON.stringify({ type: "hello", protocol: 1, version: "1.0.0", brand: "chrome", inst: "depth", extra });
  addVector({ id, direction: "extension_to_host", raw, expect, ...(expect === "refuse" ? { code: "bad_json" } : {}) });
}

const corpusJson = JSON.stringify(corpus, null, 2) + "\n";
writeArtifact("contracts/native-browser/corpus.json", corpusJson);

// 8. Generate contracts/native-browser/swift.json
const swiftJson = JSON.stringify(
  {
    constants: constantsObj,
    corpus,
  },
  null,
  2
) + "\n";
writeArtifact("contracts/native-browser/swift.json", swiftJson);

// 9. Generate contracts/native-browser/manifest.json
const artifactRelativePaths = [
  "contracts/native-browser/authority.json",
  "contracts/native-browser/browser.schema.json",
  "contracts/native-browser/envelope.schema.json",
  "contracts/native-browser/schemas.js",
  "contracts/native-browser/constants.js",
  "crates/native-browser-frame/src/constants.rs",
  "contracts/native-browser/corpus.json",
  "contracts/native-browser/recipes.json",
  "contracts/native-browser/swift.json",
  "contracts/native-browser/adoption.schema.json",
];

for (const channel of channels) {
  for (const browser of browsers) {
    for (const os of oses) {
      artifactRelativePaths.push(`contracts/native-browser/registration/${channel}/${browser}/${os}.json`);
    }
  }
}

const artifactsMap = {};
for (const rel of artifactRelativePaths) {
  const content = existsSync(join(outDir, rel))
    ? readFileSync(join(outDir, rel))
    : readFileSync(join(ROOT, rel));
  artifactsMap[rel] = sha256(content);
}

const manifestObj = {
  generator: {
    name: "solstone-native-browser-gen",
    version: "1.1.0",
  },
  bundle_version: authority.bundle_version,
  wire_protocol: authority.wire_protocol,
  journal: {
    id: authority.journal.id,
    revision: authority.journal.revision,
    path: authority.journal.path,
    sha256: authority.journal.sha256,
  },
  artifacts: artifactsMap,
  swift_check: "swift test --filter SolstoneNativeBrowserContract",
};

const manifestJson = JSON.stringify(manifestObj, null, 2) + "\n";
writeArtifact("contracts/native-browser/manifest.json", manifestJson);

console.log("Generated native-browser artifacts successfully.");
