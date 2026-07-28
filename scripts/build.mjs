// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc
//
// build.mjs — produce a clean, versioned, installable artifact in dist/.
//
// The extension has no compile step (classic scripts, loaded unpacked), so a
// "build" is: (1) verify the version agrees across the four places it lives,
// (2) copy extension/ to a versioned staging dir with nothing but runtime files,
// (3) produce separate development and Chrome Web Store ZIPs, and (4) reopen
// and validate both archives. The staged folder is what you Load unpacked.
//
// Run: `make dist` (gated on `make ci`) or `node scripts/build.mjs`.

import { cpSync, rmSync, mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, statSync, unlinkSync, symlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyReleaseArtifacts } from "./verify-package.mjs";

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
  const lock = JSON.parse(readFileSync(join(ROOT, "package-lock.json"), "utf8"));
  const bg = (readFileSync(join(EXT, "background.js"), "utf8").match(/const VERSION = "([^"]+)"/) || [])[1];
  return { manifest, pkg, lock: lock.version, lockPackage: lock.packages?.[""]?.version, bg };
}
const v = versions();
if (!v.manifest) fail("no version in extension/manifest.json");
if (v.pkg !== v.manifest || v.lock !== v.manifest || v.lockPackage !== v.manifest || v.bg !== v.manifest) {
  fail(
    `version drift — align all four files, then rebuild (try: make set-version V=${v.manifest}):\n` +
      `  extension/manifest.json : ${v.manifest}\n  package.json            : ${v.pkg}\n` +
      `  package-lock.json       : ${v.lock} / ${v.lockPackage}\n  extension/background.js : ${v.bg}`
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

// ---- 3. create distinct, deterministic development and Store ZIPs. The source
// and load-unpacked package retain the key; only the Store staging copy omits
// development/distribution fields that the dashboard rejects. ----
const devZipPath = join(DIST, `${NAME}-${VERSION}-dev.zip`);
const cwsZipPath = join(DIST, `${NAME}-${VERSION}-cws.zip`);
const cwsStage = join(DIST, `.${NAME}-${VERSION}-cws`);
const PY = String.raw`import pathlib,sys,zipfile
stage=pathlib.Path(sys.argv[1])
destination=sys.argv[2]
with zipfile.ZipFile(destination,"w",zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
  for source in sorted(path for path in stage.rglob("*") if path.is_file()):
    relative=source.relative_to(stage).as_posix()
    info=zipfile.ZipInfo(relative,(1980,1,1,0,0,0))
    info.compress_type=zipfile.ZIP_DEFLATED
    info.external_attr=(0o100644 & 0xffff) << 16
    archive.writestr(info,source.read_bytes(),compress_type=zipfile.ZIP_DEFLATED,compresslevel=9)`;

function zipTree(source, destination) {
  try {
    execFileSync("python3", ["-c", PY, source, destination], {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 30_000,
      maxBuffer: 4 * 1024 * 1024,
    });
  } catch (error) {
    throw new Error(`python3 could not create ${destination}: ${error.message}`);
  }
}

let packageError = null;
try {
  cpSync(stage, cwsStage, { recursive: true });
  const cwsManifestPath = join(cwsStage, "manifest.json");
  const cwsManifest = JSON.parse(readFileSync(cwsManifestPath, "utf8"));
  delete cwsManifest.key;
  delete cwsManifest.update_url;
  writeFileSync(cwsManifestPath, `${JSON.stringify(cwsManifest, null, 2)}\n`);
  zipTree(stage, devZipPath);
  zipTree(cwsStage, cwsZipPath);
  verifyReleaseArtifacts({ root: ROOT, version: VERSION, stagePath: stage, devZipPath, cwsZipPath });
} catch (error) {
  packageError = error;
} finally {
  rmSync(cwsStage, { recursive: true, force: true });
}
if (packageError) fail(packageError.message);

// ---- 4. the stable reload target: dist/current -> the validated version.
// Load unpacked dist/current ONCE; every `make dist` re-points it and you just
// hit reload in Chrome. The manifest `key` pins the extension id, so the id (and
// your granted sites / allowlist) survive across reloads and version bumps.
const current = join(DIST, "current");
symlinkSync(`${NAME}-${VERSION}`, current); // relative target inside dist/ (DIST was rm'd above, so it's fresh)

// ---- summary ----
console.log(`\nsolstone-browser ${VERSION} — release build`);
console.log(`  version agrees across manifest.json / package.json / package-lock.json / background.js`);
console.log(`  staged ${files} runtime files`);
console.log(`  package checks passed by reopening both ZIPs`);
console.log(`\n  Load unpacked THIS once, then just hit reload after each build:`);
console.log(`    ${current}   ->   ${NAME}-${VERSION}`);
console.log(`\n  versioned build: ${stage}`);
console.log(`  development ZIP (retains pinned id): ${devZipPath}`);
console.log(`  Chrome Web Store upload candidate (no key/update_url): ${cwsZipPath}`);
console.log(`  dashboard upload remains the authoritative Store validation`);
console.log(`\nrelease build OK`);
