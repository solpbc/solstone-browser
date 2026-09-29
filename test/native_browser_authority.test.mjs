// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PINNED_JOURNAL_SHA256 = "c14e66318587b8fa451ef1363e113885bdd80a41ce680b0c62fcc9033460a2e1";

function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

test("authority and schema digest match pinned hash", () => {
  const schemaBytes = readFileSync(join(ROOT, "contracts/native-browser/browser.schema.json"));
  assert.equal(sha256(schemaBytes), PINNED_JOURNAL_SHA256);

  const authority = JSON.parse(readFileSync(join(ROOT, "contracts/native-browser/authority.json"), "utf8"));
  assert.equal(authority.journal.sha256, PINNED_JOURNAL_SHA256);
  assert.equal(authority.journal.id, "solstone-journal-format:browser-jsonl");
  assert.equal(authority.bundle_version, "1.0.1");
  assert.equal(authority.wire_protocol, 1);
});

test("check-native-browser drift checker exits 0", () => {
  const result = execFileSync("node", [join(ROOT, "scripts/check-native-browser.mjs")], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  assert.match(result, /check-native-browser: all generated artifacts match/);
});

test("adoption schema required names and consts", () => {
  const adoption = JSON.parse(readFileSync(join(ROOT, "contracts/native-browser/adoption.schema.json"), "utf8"));
  const expectedRequired = [
    "bundle_path",
    "source_revision",
    "bundle_version",
    "wire_protocol",
    "manifest_sha256",
    "journal_schema_id",
    "journal_schema_sha256",
    "journal_schema_revision",
  ];
  assert.deepEqual(adoption.required, expectedRequired);
  assert.equal(adoption.additionalProperties, false);
  assert.equal(adoption.properties.bundle_path.const, "contracts/native-browser");
  assert.equal(adoption.properties.bundle_version.const, "1.0.1");
  assert.equal(adoption.properties.wire_protocol.const, 1);
  assert.equal(adoption.properties.journal_schema_sha256.const, PINNED_JOURNAL_SHA256);
});

test("manifest wire and bundle fields", () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, "contracts/native-browser/manifest.json"), "utf8"));
  assert.deepEqual(manifest.generator, { name: "solstone-native-browser-gen", version: "1.0.1" });
  assert.equal(manifest.bundle_version, "1.0.1");
  assert.equal(manifest.wire_protocol, 1);
  assert.equal(manifest.journal.sha256, PINNED_JOURNAL_SHA256);
  assert.equal(manifest.swift_check, "swift test --filter SolstoneNativeBrowserContract");
  assert.ok(manifest.artifacts["contracts/native-browser/authority.json"]);
  assert.ok(manifest.artifacts["contracts/native-browser/envelope.schema.json"]);
  assert.ok(manifest.artifacts["crates/native-browser-frame/src/constants.rs"]);
});


test("Swift export carries the same constants and corpus as canonical artifacts", async () => {
  const swift = JSON.parse(readFileSync(join(ROOT, "contracts/native-browser/swift.json"), "utf8"));
  const corpus = JSON.parse(readFileSync(join(ROOT, "contracts/native-browser/corpus.json"), "utf8"));
  await import(new URL("../contracts/native-browser/constants.js", import.meta.url));
  await import(new URL("../contracts/native-browser/schemas.js", import.meta.url));
  assert.deepEqual(swift.constants, globalThis.SolstoneNativeBrowserConstants);
  assert.deepEqual(swift.corpus, corpus);
  assert.deepEqual(globalThis.SolstoneNativeBrowserSchemas.journal, JSON.parse(readFileSync(join(ROOT, "contracts/native-browser/browser.schema.json"), "utf8")));
  assert.deepEqual(globalThis.SolstoneNativeBrowserSchemas.envelope, JSON.parse(readFileSync(join(ROOT, "contracts/native-browser/envelope.schema.json"), "utf8")));
  const manifest = JSON.parse(readFileSync(join(ROOT, "contracts/native-browser/manifest.json"), "utf8"));
  for (const [path, digest] of Object.entries(manifest.artifacts)) assert.equal(sha256(readFileSync(join(ROOT, path))), digest, path);
});
