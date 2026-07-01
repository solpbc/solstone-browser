// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc
//
// build.mjs — produce a clean, versioned, installable artifact in dist/.
//
// The extension has no compile step (classic scripts, loaded unpacked), so a
// "build" is: (1) verify the version agrees across the three places it lives,
// (2) copy extension/ to a versioned staging dir with nothing but runtime files,
// (3) zip it (Web-Store-ready; also handy to attach to a release). The staged
// folder is what you Load-unpacked; the zip is the portable/store artifact.
//
// Run: `make dist` (gated on `make ci`) or `node scripts/build.mjs`.

import { cpSync, rmSync, mkdirSync, readFileSync, existsSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const NAME = "solstone-browser";
const EXT = join(ROOT, "extension");
const DIST = join(ROOT, "dist");
// runtime cruft that must never ship even if it lands in extension/
const CRUFT = new Set([".DS_Store"]);
const CRUFT_EXT = [".log", ".map"];

function fail(msg) {
  console.error("build: " + msg);
  process.exit(1);
}

// ---- 1. version, single source of truth = manifest, guarded against drift ----
function versions() {
  const manifest = JSON.parse(readFileSync(join(EXT, "manifest.json"), "utf8")).version;
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version;
  const bg = (readFileSync(join(EXT, "background.js"), "utf8").match(/const VERSION = "([^"]+)"/) || [])[1];
  return { manifest, pkg, bg };
}
const v = versions();
if (!v.manifest) fail("no version in extension/manifest.json");
if (v.pkg !== v.manifest || v.bg !== v.manifest) {
  fail(
    `version drift — align all three, then rebuild (try: make set-version V=${v.manifest}):\n` +
      `  extension/manifest.json : ${v.manifest}\n  package.json            : ${v.pkg}\n  extension/background.js : ${v.bg}`
  );
}
const VERSION = v.manifest;

// ---- 2. stage a clean copy of extension/ ----
const stage = join(DIST, `${NAME}-${VERSION}`);
rmSync(DIST, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
cpSync(EXT, stage, { recursive: true });

// prune cruft, count files
let files = 0;
(function walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (CRUFT.has(e) || CRUFT_EXT.some((x) => e.endsWith(x))) unlinkSync(p);
    else files++;
  }
})(stage);

if (!existsSync(join(stage, "manifest.json"))) fail("staged copy is missing manifest.json");

// ---- 3. zip (manifest.json at the archive root). Prefer python3 (present on the
// journal host, where `zip` may not be); fall back to `zip`; else folder-only. ----
const zipPath = join(DIST, `${NAME}-${VERSION}.zip`);
const PY = `import sys,zipfile,os
stage,zp=sys.argv[1],sys.argv[2]
with zipfile.ZipFile(zp,'w',zipfile.ZIP_DEFLATED) as z:
  for r,_,fs in os.walk(stage):
    for f in fs:
      full=os.path.join(r,f); z.write(full,os.path.relpath(full,stage))`;
let zipped = null;
function tryRun(cmd, args) { try { execFileSync(cmd, args, { stdio: "ignore" }); return true; } catch (_e) { return false; } }
if (tryRun("python3", ["-c", PY, stage, zipPath])) zipped = "python3";
else if (tryRun("bash", ["-c", `cd ${JSON.stringify(stage)} && zip -qr ${JSON.stringify(zipPath)} .`])) zipped = "zip";

// ---- summary ----
console.log(`\nsolstone-browser ${VERSION} — release build`);
console.log(`  version agrees across manifest.json / package.json / background.js`);
console.log(`  staged ${files} runtime files`);
console.log(`\n  Load unpacked (Chrome -> chrome://extensions -> Load unpacked):`);
console.log(`    ${stage}`);
if (zipped) console.log(`\n  zip (Web-Store / release artifact, via ${zipped}):\n    ${zipPath}`);
else console.log(`\n  (no zipper found — folder only; install with Load unpacked above)`);
console.log(`\nrelease build OK`);
