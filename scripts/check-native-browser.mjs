// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { readFileSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PINNED_JOURNAL_SHA256 = "c14e66318587b8fa451ef1363e113885bdd80a41ce680b0c62fcc9033460a2e1";

function sha256(bytesOrStr) {
  return createHash("sha256").update(bytesOrStr).digest("hex");
}

const schemaPath = join(ROOT, "contracts/native-browser/browser.schema.json");
const authorityPath = join(ROOT, "contracts/native-browser/authority.json");

if (!existsSync(schemaPath)) {
  console.error("Missing contracts/native-browser/browser.schema.json");
  process.exit(1);
}
if (!existsSync(authorityPath)) {
  console.error("Missing contracts/native-browser/authority.json");
  process.exit(1);
}

const schemaBytes = readFileSync(schemaPath);
const schemaHash = sha256(schemaBytes);
const authority = JSON.parse(readFileSync(authorityPath, "utf8"));
const authorityJournalHash = authority.journal?.sha256;

if (schemaHash !== PINNED_JOURNAL_SHA256) {
  console.error(`Journal schema digest mismatch: expected ${PINNED_JOURNAL_SHA256}, got ${schemaHash}`);
  process.exit(1);
}

if (authorityJournalHash !== PINNED_JOURNAL_SHA256) {
  console.error(`Authority journal sha256 mismatch: expected ${PINNED_JOURNAL_SHA256}, got ${authorityJournalHash}`);
  process.exit(1);
}

// Generate into a temp directory under /var/tmp (scratch on disk rule)
const tmpPrefix = "/var/tmp/solstone-gen-check-";
let tempDir;
try {
  tempDir = mkdtempSync(tmpPrefix);
} catch (_e) {
  tempDir = mkdtempSync("/tmp/solstone-gen-check-");
}

try {
  execFileSync("node", [join(ROOT, "scripts/generate-native-browser.mjs"), "--out", tempDir], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  const manifestPath = join(ROOT, "contracts/native-browser/manifest.json");
  if (!existsSync(manifestPath)) {
    console.error("Missing manifest.json in workspace");
    process.exit(1);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const artifacts = Object.keys(manifest.artifacts || {});

  const nonGeneratedInputs = new Set([
    "contracts/native-browser/authority.json",
    "contracts/native-browser/browser.schema.json",
  ]);
  const allToCheck = new Set(artifacts.filter((p) => !nonGeneratedInputs.has(p)));
  allToCheck.add("contracts/native-browser/manifest.json");
  allToCheck.add("crates/native-browser-frame/src/constants.rs");

  for (const relPath of allToCheck) {
    const existingFile = join(ROOT, relPath);
    const generatedFile = join(tempDir, relPath);

    if (!existsSync(existingFile)) {
      console.error(`Mismatch: missing in workspace: ${relPath}`);
      process.exit(1);
    }
    if (!existsSync(generatedFile)) {
      console.error(`Mismatch: not generated in temp: ${relPath}`);
      process.exit(1);
    }

    const existingContent = readFileSync(existingFile);
    const generatedContent = readFileSync(generatedFile);

    if (Buffer.compare(existingContent, generatedContent) !== 0) {
      console.error(`Drift mismatch in generated artifact: ${relPath}`);
      process.exit(1);
    }
  }

  const extensionPairs = [
    { ext: "extension/native-browser/constants.js", canonical: "contracts/native-browser/constants.js" },
    { ext: "extension/native-browser/schemas.js", canonical: "contracts/native-browser/schemas.js" },
    { ext: "extension/native-browser/schema-validator.js", canonical: "native-browser/schema-validator.js" },
    { ext: "extension/native-browser/codec.js", canonical: "native-browser/codec.js" },
  ];
  for (const { ext, canonical } of extensionPairs) {
    const extFile = join(ROOT, ext);
    const canFile = join(ROOT, canonical);
    if (!existsSync(extFile) || !existsSync(canFile)) {
      console.error(`Missing file for extension comparison: ${ext} or ${canonical}`);
      process.exit(1);
    }
    const extContent = readFileSync(extFile);
    const canContent = readFileSync(canFile);
    if (Buffer.compare(extContent, canContent) !== 0) {
      console.error(`Mismatch between ${ext} and ${canonical}`);
      process.exit(1);
    }
  }

  console.log("check-native-browser: all generated artifacts match");
} finally {
  if (tempDir && existsSync(tempDir)) {
    rmSync(tempDir, { recursive: true, force: true });
  }
}
