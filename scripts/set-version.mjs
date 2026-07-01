// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc
//
// set-version.mjs — stamp one version across the three places it lives so they
// never drift: extension/manifest.json, package.json, extension/background.js.
// Targeted line replacement (no JSON reformatting), then a read-back verify.
//
// Run: `make set-version V=0.0.8`  (or `node scripts/set-version.mjs 0.0.8`)

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const V = (process.argv[2] || "").trim();
if (!/^\d+\.\d+\.\d+$/.test(V)) {
  console.error(`set-version: need a semver X.Y.Z (got ${JSON.stringify(process.argv[2])}). Usage: make set-version V=0.0.8`);
  process.exit(1);
}

const edits = [
  { file: join(ROOT, "extension", "manifest.json"), re: /("version":\s*")\d+\.\d+\.\d+(")/, sub: `$1${V}$2` },
  { file: join(ROOT, "package.json"), re: /("version":\s*")\d+\.\d+\.\d+(")/, sub: `$1${V}$2` },
  { file: join(ROOT, "extension", "background.js"), re: /(const VERSION = ")\d+\.\d+\.\d+(")/, sub: `$1${V}$2` },
];

for (const { file, re, sub } of edits) {
  const before = readFileSync(file, "utf8");
  if (!re.test(before)) { console.error(`set-version: no version match in ${file}`); process.exit(1); }
  const after = before.replace(re, sub);
  writeFileSync(file, after);
}

// read-back verify
const m = JSON.parse(readFileSync(join(ROOT, "extension", "manifest.json"), "utf8")).version;
const p = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version;
const b = (readFileSync(join(ROOT, "extension", "background.js"), "utf8").match(/const VERSION = "([^"]+)"/) || [])[1];
if (m !== V || p !== V || b !== V) { console.error(`set-version: verify failed (manifest=${m} package=${p} background=${b})`); process.exit(1); }
console.log(`version set to ${V} across manifest.json, package.json, background.js`);
