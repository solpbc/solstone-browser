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


test("production and development resolve to disjoint registration authority", () => {
  for (const browser of ["chrome", "edge", "firefox"]) {
    for (const os of ["macos", "linux", "windows"]) {
      const production = Codec.renderRegistration("production", browser, os, "/Applications/Test App.app/Contents/MacOS/host");
      const development = Codec.renderRegistration("dev", browser, os, "/Applications/Test App.app/Contents/MacOS/host");
      assert.notEqual(production.path, development.path);
      assert.notEqual(production.manifest.name, development.manifest.name);
      const key = browser === "firefox" ? "allowed_extensions" : "allowed_origins";
      assert.equal(production.manifest[key].length, 1);
      assert.equal(development.manifest[key].length, 1);
      assert.notEqual(production.manifest[key][0], development.manifest[key][0]);
      assert.equal(JSON.parse(production.json).path, "/Applications/Test App.app/Contents/MacOS/host");
    }
  }
});

test("launch layouts bind caller identity to the manifest allowlist for every platform", () => {
  for (const channel of ["production", "dev"]) {
    for (const browser of ["chrome", "edge", "firefox"]) {
      for (const os of ["macos", "linux", "windows"]) {
        const layout = Constants.REGISTRATION.argv[`${browser}_${os}`];
        const registration = Codec.renderRegistration(channel, browser, os);
        const args = browser === "firefox"
          ? ["/owned/manifest.json", Constants.HOSTS_AND_IDS[channel].firefox_id]
          : [registration.manifest.allowed_origins[0], ...(os === "windows" ? ["--parent-window=0"] : [])];
        assert.equal(args.length, layout.arguments_after_executable.length);
        assert.equal(args[layout.identity_argument], registration.manifest[layout.identity_source][0]);
        assert.equal(layout.arguments_after_executable[layout.identity_argument], browser === "firefox" ? "extension_id" : "origin");
      }
    }
  }
  assert.equal(Constants.REGISTRATION.windows.hive, "HKEY_CURRENT_USER");
  assert.deepEqual(Constants.REGISTRATION.windows.registry_views, ["32", "64"]);
  for (const suffix of Object.values(Constants.REGISTRATION.suffixes)) assert.equal(suffix.includes("WOW6432Node"), false);
});
