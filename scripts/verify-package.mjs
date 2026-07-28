// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc
//
// verify-package.mjs — reopen and validate the release artifacts produced by
// scripts/build.mjs. The Chrome Web Store dashboard remains the authoritative
// upload gate; this catches the package-shape regressions we can prove offline.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const NAME = "solstone-browser";
const EXPECTED_DEV_ID = "fgfnkcefedeheoeamppkiiloncfekakf";
const EXPECTED_PERMISSIONS = ["storage", "unlimitedStorage", "alarms", "scripting", "activeTab"];
const EXPECTED_OPTIONAL_HOST_PERMISSIONS = ["*://*/*"];
const ZIP_INSPECT = String.raw`
import json,sys,zipfile
with zipfile.ZipFile(sys.argv[1], "r") as archive:
    infos = [entry for entry in archive.infolist() if not entry.is_dir()]
    manifests = [entry for entry in infos if entry.filename == "manifest.json"]
    print(json.dumps({
        "names": [entry.filename for entry in infos],
        "manifest_count": len(manifests),
        "manifest_text": archive.read(manifests[0]).decode("utf-8") if len(manifests) == 1 else None,
    }))
`;

function fail(message) {
  throw new Error(message);
}

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail(`${label} is not valid JSON: ${error.message}`);
  }
}

function inspectZip(path, label) {
  if (!existsSync(path)) fail(`${label} does not exist: ${path}`);
  let result;
  try {
    result = execFileSync("python3", ["-c", ZIP_INSPECT, path], {
      encoding: "utf8",
      timeout: 30_000,
      maxBuffer: 4 * 1024 * 1024,
    });
  } catch (error) {
    fail(`${label} could not be opened as a ZIP: ${error.message}`);
  }
  const inspected = JSON.parse(result);
  assert.equal(inspected.manifest_count, 1, `${label} must contain exactly one manifest.json at the ZIP root`);
  let manifest;
  try {
    manifest = JSON.parse(inspected.manifest_text);
  } catch (error) {
    fail(`${label} root manifest.json is not valid JSON: ${error.message}`);
  }
  return { files: new Set(inspected.names), manifest };
}

export function extensionIdFromKey(key) {
  const digest = createHash("sha256").update(Buffer.from(key, "base64")).digest("hex").slice(0, 32);
  return [...digest].map((nibble) => String.fromCharCode(97 + Number.parseInt(nibble, 16))).join("");
}

function manifestRuntimeReferences(manifest) {
  const references = [];
  const add = (label, value) => {
    if (typeof value === "string" && value) references.push({ label, path: value });
  };
  const addMap = (label, value) => {
    for (const [size, path] of Object.entries(value || {})) add(`${label}.${size}`, path);
  };

  add("background.service_worker", manifest.background?.service_worker);
  add("action.default_popup", manifest.action?.default_popup);
  addMap("action.default_icon", manifest.action?.default_icon);
  add("options_page", manifest.options_page);
  add("options_ui.page", manifest.options_ui?.page);
  add("devtools_page", manifest.devtools_page);
  add("side_panel.default_path", manifest.side_panel?.default_path);
  addMap("icons", manifest.icons);
  addMap("chrome_url_overrides", manifest.chrome_url_overrides);
  for (const [index, script] of (manifest.content_scripts || []).entries()) {
    for (const [fileIndex, path] of (script.js || []).entries()) add(`content_scripts.${index}.js.${fileIndex}`, path);
    for (const [fileIndex, path] of (script.css || []).entries()) add(`content_scripts.${index}.css.${fileIndex}`, path);
  }
  for (const [index, page] of (manifest.sandbox?.pages || []).entries()) add(`sandbox.pages.${index}`, page);
  for (const [index, group] of (manifest.web_accessible_resources || []).entries()) {
    for (const [fileIndex, path] of (group.resources || []).entries()) {
      if (!/[*?]/.test(path)) add(`web_accessible_resources.${index}.${fileIndex}`, path);
    }
  }
  return references;
}

function assertApprovedSurface(manifest, label) {
  assert.deepStrictEqual(
    manifest.permissions,
    EXPECTED_PERMISSIONS,
    `${label} permissions differ from the approved surface`,
  );
  assert.deepStrictEqual(
    manifest.optional_host_permissions,
    EXPECTED_OPTIONAL_HOST_PERMISSIONS,
    `${label} optional_host_permissions differ from the approved surface`,
  );
  for (const field of ["host_permissions", "optional_permissions", "content_scripts"]) {
    assert.equal(Object.hasOwn(manifest, field), false, `${label} unexpectedly contains ${field}`);
  }
}

function assertRuntimeFiles(manifest, hasFile, label) {
  const references = manifestRuntimeReferences(manifest);
  assert.ok(references.length > 0, `${label} manifest did not expose any runtime-file references`);
  for (const reference of references) {
    assert.ok(
      hasFile(reference.path),
      `${label} references missing runtime file ${reference.path} at ${reference.label}`,
    );
  }
  return references.length;
}

function assertChromeVersion(version, label) {
  const components = String(version).split(".");
  assert.ok(
    components.length >= 1 &&
      components.length <= 4 &&
      components.every((part) => /^(0|[1-9]\d*)$/.test(part) && Number(part) <= 65_535),
    `${label} version is not a valid Chrome extension version: ${JSON.stringify(version)}`,
  );
}

function assertCwsManifest(manifest, label) {
  for (const field of ["manifest_version", "name", "version", "description", "icons"]) {
    assert.ok(Object.hasOwn(manifest, field), `${label} is missing required manifest field ${field}`);
  }
  assert.equal(manifest.manifest_version, 3, `${label} must be Manifest V3`);
  assert.equal(typeof manifest.name, "string", `${label} name must be a string`);
  assert.ok(manifest.name.length > 0 && manifest.name.length <= 75, `${label} name exceeds Chrome's 75-character limit`);
  assert.equal(typeof manifest.description, "string", `${label} description must be a string`);
  assert.ok(
    manifest.description.length > 0 && manifest.description.length <= 132,
    `${label} description exceeds Chrome's 132-character limit`,
  );
  assert.ok(manifest.icons && Object.keys(manifest.icons).length > 0, `${label} icons must not be empty`);
  assertChromeVersion(manifest.version, label);
  assert.equal(Object.hasOwn(manifest, "key"), false, `${label} must not contain key`);
  assert.equal(Object.hasOwn(manifest, "update_url"), false, `${label} must not contain update_url`);
}

export function verifyReleaseArtifacts({
  root = ROOT,
  version,
  sourceManifestPath = join(root, "extension", "manifest.json"),
  stagePath,
  devZipPath,
  cwsZipPath,
} = {}) {
  const sourceManifest = readJson(sourceManifestPath, "source manifest");
  const releaseVersion = version || sourceManifest.version;
  if (!releaseVersion) fail("source manifest has no version");

  const resolvedStage = stagePath || join(root, "dist", `${NAME}-${releaseVersion}`);
  const resolvedDevZip = devZipPath || join(root, "dist", `${NAME}-${releaseVersion}-dev.zip`);
  const resolvedCwsZip = cwsZipPath || join(root, "dist", `${NAME}-${releaseVersion}-cws.zip`);
  const stageManifest = readJson(join(resolvedStage, "manifest.json"), "load-unpacked manifest");
  const devZip = inspectZip(resolvedDevZip, "development ZIP");
  const cwsZip = inspectZip(resolvedCwsZip, "Chrome Web Store ZIP");

  assert.deepStrictEqual(stageManifest, sourceManifest, "load-unpacked manifest must match the source manifest");
  assert.deepStrictEqual(devZip.manifest, sourceManifest, "development ZIP manifest must match the source manifest");

  const expectedCwsManifest = structuredClone(sourceManifest);
  delete expectedCwsManifest.key;
  delete expectedCwsManifest.update_url;
  assert.deepStrictEqual(
    cwsZip.manifest,
    expectedCwsManifest,
    "Chrome Web Store manifest may differ from source only by omitting key and update_url",
  );

  for (const [label, manifest] of [
    ["source manifest", sourceManifest],
    ["load-unpacked manifest", stageManifest],
    ["development ZIP manifest", devZip.manifest],
    ["Chrome Web Store manifest", cwsZip.manifest],
  ]) {
    assert.equal(manifest.version, releaseVersion, `${label} version differs from ${releaseVersion}`);
    assertApprovedSurface(manifest, label);
  }

  for (const [label, manifest] of [
    ["source manifest", sourceManifest],
    ["load-unpacked manifest", stageManifest],
    ["development ZIP manifest", devZip.manifest],
  ]) {
    assert.equal(typeof manifest.key, "string", `${label} must retain the development key`);
    assert.equal(extensionIdFromKey(manifest.key), EXPECTED_DEV_ID, `${label} derives the wrong development extension id`);
  }

  assertCwsManifest(cwsZip.manifest, "Chrome Web Store manifest");
  const stageReferences = assertRuntimeFiles(
    stageManifest,
    (path) => {
      const resolved = resolve(resolvedStage, path);
      return existsSync(resolved) && !relative(resolvedStage, resolved).startsWith("..");
    },
    "load-unpacked package",
  );
  const devReferences = assertRuntimeFiles(devZip.manifest, (path) => devZip.files.has(path), "development ZIP");
  const cwsReferences = assertRuntimeFiles(cwsZip.manifest, (path) => cwsZip.files.has(path), "Chrome Web Store ZIP");
  assert.equal(devReferences, stageReferences, "development ZIP runtime-reference count differs from load-unpacked");
  assert.equal(cwsReferences, stageReferences, "Chrome Web Store ZIP runtime-reference count differs from load-unpacked");

  return {
    version: releaseVersion,
    developmentId: EXPECTED_DEV_ID,
    runtimeReferences: cwsReferences,
    stagePath: resolvedStage,
    devZipPath: resolvedDevZip,
    cwsZipPath: resolvedCwsZip,
  };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const result = verifyReleaseArtifacts();
    console.log(`package-check OK — solstone-browser ${result.version}`);
    console.log(`  source / load-unpacked / development ZIP id: ${result.developmentId}`);
    console.log(`  Chrome Web Store ZIP: root MV3 manifest, ${result.runtimeReferences} runtime-file references present`);
    console.log("  Chrome Web Store ZIP: key/update_url absent; permission and injection surface pinned");
  } catch (error) {
    console.error(`package-check: ${error.message}`);
    process.exit(1);
  }
}
