// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const manifestPath = fileURLToPath(new URL("../extension/manifest.json", import.meta.url));
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const expectedPermissions = ["storage", "unlimitedStorage", "alarms", "scripting", "activeTab", "nativeMessaging"];
const expectedOptionalHostPermissions = ["*://*/*"];
const expectedCsp = "script-src 'self'; object-src 'self'; connect-src 'none'";
const expectedDataCollection = ["websiteContent", "browsingActivity", "personalCommunications"];

test("manifest permission and injection surfaces stay pinned", () => {
  assert.deepStrictEqual(manifest.permissions, expectedPermissions);
  assert.deepStrictEqual(manifest.optional_host_permissions, expectedOptionalHostPermissions);
  assert.equal(manifest.content_security_policy?.extension_pages, expectedCsp);
  assert.equal(manifest.minimum_chrome_version, "121");
  assert.equal(manifest.incognito, "not_allowed");
  assert.equal(manifest.browser_specific_settings?.gecko?.id, "browser.dev@solstone.app");
  assert.equal(manifest.browser_specific_settings?.gecko?.strict_min_version, "140.0");
  assert.deepStrictEqual(manifest.browser_specific_settings?.gecko?.data_collection_permissions?.required, expectedDataCollection);
  assert.equal(manifest.background?.service_worker, "background.js");
  assert.ok(Array.isArray(manifest.background?.scripts) && manifest.background.scripts.length > 0);
  assert.equal(manifest.background.scripts.at(-1), "background.js");

  assert.equal(Object.hasOwn(manifest, "host_permissions"), false);
  assert.equal(Object.hasOwn(manifest, "optional_permissions"), false);
  assert.equal(Object.hasOwn(manifest, "content_scripts"), false);
});
