// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const manifestPath = fileURLToPath(new URL("../extension/manifest.json", import.meta.url));
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const expectedPermissions = ["storage", "unlimitedStorage", "alarms", "scripting", "activeTab"];
const expectedOptionalHostPermissions = ["*://*/*"];
const PIN_RATIONALE = "The Chrome Web Store listing declaration, the privacy policy (clo/compliance/privacy-policy.md § \"from the browser extension\"), and the in-product disclosure (extension/lib/disclosure.js) all describe this surface and all three must move together. Any addition to this permission or injection surface must be argued for, not just added.";

test("manifest permission and injection surfaces stay pinned", () => {
  assert.deepStrictEqual(
    manifest.permissions,
    expectedPermissions,
    `manifest permissions changed: observed ${JSON.stringify(manifest.permissions)}; expected ${JSON.stringify(expectedPermissions)}. ${PIN_RATIONALE}`,
  );
  assert.deepStrictEqual(
    manifest.optional_host_permissions,
    expectedOptionalHostPermissions,
    `manifest optional_host_permissions changed: observed ${JSON.stringify(manifest.optional_host_permissions)}; expected ${JSON.stringify(expectedOptionalHostPermissions)}. ${PIN_RATIONALE}`,
  );

  const hostPermissions = { present: Object.hasOwn(manifest, "host_permissions"), value: manifest.host_permissions };
  assert.equal(
    hostPermissions.present,
    false,
    `manifest host_permissions changed: observed ${JSON.stringify(hostPermissions)}; expected ${JSON.stringify({ present: false })}. ${PIN_RATIONALE}`,
  );

  const optionalPermissions = { present: Object.hasOwn(manifest, "optional_permissions"), value: manifest.optional_permissions };
  assert.equal(
    optionalPermissions.present,
    false,
    `manifest optional_permissions changed: observed ${JSON.stringify(optionalPermissions)}; expected ${JSON.stringify({ present: false })}. ${PIN_RATIONALE}`,
  );

  const contentScripts = { present: Object.hasOwn(manifest, "content_scripts"), value: manifest.content_scripts };
  assert.equal(
    contentScripts.present,
    false,
    `manifest content_scripts changed: observed ${JSON.stringify(contentScripts)}; expected ${JSON.stringify({ present: false })}. ${PIN_RATIONALE}`,
  );
});
