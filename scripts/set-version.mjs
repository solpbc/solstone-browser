// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc
//
// set-version.mjs — stamp one version across the four files where it lives so
// they never drift: extension/manifest.json, package.json, package-lock.json,
// and extension/background.js.
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

const preparedEdits = edits.map(({ file, re, sub }) => {
  const before = readFileSync(file, "utf8");
  if (!re.test(before)) { console.error(`set-version: no version match in ${file}`); process.exit(1); }
  return { file, after: before.replace(re, sub) };
});

const lockPath = join(ROOT, "package-lock.json");
const lockBefore = readFileSync(lockPath, "utf8");
let lockEdits = 0;
const lockAfter = lockBefore.replace(
  /("name":\s*"solstone-browser",\s*\n\s*"version":\s*")\d+\.\d+\.\d+(")/g,
  (_match, prefix, suffix) => {
    lockEdits += 1;
    return `${prefix}${V}${suffix}`;
  },
);
if (lockEdits !== 2) {
  console.error(`set-version: expected 2 solstone-browser versions in package-lock.json, found ${lockEdits}`);
  process.exit(1);
}
for (const { file, after } of preparedEdits) writeFileSync(file, after);
writeFileSync(lockPath, lockAfter);

// read-back verify
const m = JSON.parse(readFileSync(join(ROOT, "extension", "manifest.json"), "utf8")).version;
const p = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version;
const lock = JSON.parse(readFileSync(lockPath, "utf8"));
const b = (readFileSync(join(ROOT, "extension", "background.js"), "utf8").match(/const VERSION = "([^"]+)"/) || [])[1];
if (m !== V || p !== V || lock.version !== V || lock.packages?.[""]?.version !== V || b !== V) {
  console.error(
    `set-version: verify failed (manifest=${m} package=${p} lock=${lock.version}/${lock.packages?.[""]?.version} background=${b})`,
  );
  process.exit(1);
}
console.log(`version set to ${V} across manifest.json, package.json, package-lock.json, background.js`);
