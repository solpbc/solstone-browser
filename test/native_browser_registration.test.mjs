// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

await import(new URL("../contracts/native-browser/constants.js", import.meta.url));
await import(new URL("../native-browser/codec.js", import.meta.url));

const Codec = globalThis.SolstoneNativeBrowser;
const Constants = globalThis.SolstoneNativeBrowserConstants;

test("all 18 registration templates match renderRegistration exactly", () => {
  const channels = ["production", "dev"];
  const browsers = ["chrome", "edge", "firefox"];
  const oses = ["linux", "macos", "windows"];

  for (const channel of channels) {
    for (const browser of browsers) {
      for (const os of oses) {
        const rendered = Codec.renderRegistration(channel, browser, os);
        const templatePath = join(
          ROOT,
          `contracts/native-browser/registration/${channel}/${browser}/${os}.json`
        );
        const templateJson = JSON.parse(readFileSync(templatePath, "utf8"));

        assert.deepEqual(rendered.manifest, templateJson, `mismatch in ${templatePath}`);

        if (browser === "firefox") {
          assert.ok(rendered.manifest.allowed_extensions);
          assert.equal(rendered.manifest.allowed_origins, undefined);
          assert.equal(rendered.manifest.allowed_extensions.length, 1);
          assert.equal(rendered.manifest.allowed_extensions[0].includes("*"), false);
        } else {
          assert.ok(rendered.manifest.allowed_origins);
          assert.equal(rendered.manifest.allowed_extensions, undefined);
          assert.equal(rendered.manifest.allowed_origins.length, 1);
          assert.equal(rendered.manifest.allowed_origins[0].includes("*"), false);
        }

        if (os === "windows") {
          assert.equal(rendered.filename.endsWith(".json"), false);
        } else {
          assert.ok(rendered.filename.endsWith(".json"));
        }
      }
    }
  }
});

test("registration renderer paths, basenames, and config root", () => {
  // Linux custom config root
  const renderedLinux = Codec.renderRegistration(
    "production",
    "chrome",
    "linux",
    "/custom/bin/host",
    "/opt/custom_home"
  );
  assert.equal(
    renderedLinux.path,
    "/opt/custom_home/.config/google-chrome/NativeMessagingHosts/app.solstone.browser.json"
  );
  assert.equal(renderedLinux.filename, "app.solstone.browser.json");
  assert.equal(renderedLinux.manifest.path, "/custom/bin/host");

  // Windows custom root
  const renderedWin = Codec.renderRegistration(
    "dev",
    "edge",
    "windows",
    "C:\\custom\\host.exe",
    "HKCU"
  );
  assert.equal(
    renderedWin.path,
    "HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\app.solstone.browser.dev"
  );
  assert.equal(renderedWin.filename, "app.solstone.browser.dev");

  // Production render whose config root contains dev host name still ends with production host
  const renderedTricky = Codec.renderRegistration(
    "production",
    "chrome",
    "linux",
    "/bin/host",
    "/home/user/app.solstone.browser.dev"
  );
  assert.ok(
    renderedTricky.path.endsWith("/.config/google-chrome/NativeMessagingHosts/app.solstone.browser.json")
  );
  assert.equal(renderedTricky.filename, "app.solstone.browser.json");

  // Dev Firefox id check
  assert.equal(Constants.HOSTS_AND_IDS.dev.firefox_id, "browser.dev@solstone.app");
});
