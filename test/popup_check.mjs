// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const popupUrl = pathToFileURL(path.join(root, "extension", "popup.html")).href;
const outputDir = path.resolve(process.argv[2] || path.join(os.tmpdir(), "solstone-browser-popup-check"));
fs.mkdirSync(outputDir, { recursive: true });

function base() {
  return {
    ok: true,
    version: "0.0.13",
    activeSites: [],
    outbox: { entries: 0, lines: 0 },
    journalUrl: "http://localhost:5015",
    hostname: "laptop",
    stream: "",
    streamName: "laptop.browser",
    localRegistered: true,
    journalPermission: "granted",
    paused: false,
    allowlist: [],
    pausedHosts: {},
    siteErrors: {},
    health: {
      lastError: null,
      lastUploadAt: Date.now() - 60000,
      segmentsUploaded: 12,
      lastStatus: 200,
      consecutiveFailures: 0,
    },
    remote: {
      paired: false,
      pending: false,
      instanceId: "",
      relayOrigin: "",
      pairedAt: null,
    },
    waiting: 0,
    dropped: { segments: 0, lines: 0 },
  };
}

const THREE = ["mail.google.com", "app.slack.com", "github.com"];
const NINE = [
  "mail.google.com",
  "app.slack.com",
  "github.com",
  "linear.app",
  "notion.so",
  "docs.google.com",
  "calendar.google.com",
  "news.ycombinator.com",
  "console.cloud.google.com",
];
const FORTY = Array.from({ length: 40 }, (_value, index) => `site-${index}.example`);

function fixture(allowlist) {
  const state = base();
  state.allowlist = allowlist.slice();
  state.activeSites = allowlist.slice();
  return {
    state,
    tab: { id: 7, url: "https://mail.google.com/inbox" },
  };
}

const FIXTURES = {
  "0-sites": fixture([]),
  "3-sites": fixture(THREE),
  "9-sites": fixture(NINE),
  "40-sites": fixture(FORTY),
  "9-sites-revoked-dead-dropped": (() => {
    const value = fixture(NINE);
    value.state.activeSites = NINE.slice(0, 8);
    value.state.pausedHosts = { "console.cloud.google.com": true };
    value.state.health.lastError = "Failed to fetch";
    value.state.waiting = 1904;
    value.state.outbox = { entries: 2000, lines: 1890 };
    value.state.dropped = { segments: 43, lines: 1820 };
    return value;
  })(),
  paused: (() => {
    const value = fixture(THREE);
    value.state.activeSites = [];
    value.state.paused = true;
    value.state.waiting = 18;
    return value;
  })(),
  "no-journal": (() => {
    const value = fixture([]);
    value.state.journalUrl = "";
    value.state.localRegistered = false;
    value.state.health.lastUploadAt = null;
    value.state.health.segmentsUploaded = 0;
    return value;
  })(),
  "browser-paused": (() => {
    const value = fixture(THREE);
    value.state.activeSites = ["app.slack.com", "github.com"];
    value.state.pausedHosts = { "mail.google.com": true };
    return value;
  })(),
  "disclosure-local": Object.assign(fixture([]), { disclosure: true, focusConfirm: true }),
  "disclosure-remote": (() => {
    const value = fixture([]);
    value.state.localRegistered = false;
    value.state.remote = {
      paired: true,
      pending: false,
      instanceId: "018f0112-3456-789a-8bcd-ef0123456789",
      relayOrigin: "https://link.solstone.app",
      pairedAt: Date.now() - 86400000,
    };
    value.disclosure = true;
    return value;
  })(),
};

function chromeStub(value) {
  return {
    state: value.state,
    tab: value.tab,
  };
}

const executable = chromium.executablePath();
if (!fs.existsSync(executable)) {
  throw new Error("playwright chromium is absent; run make e2e-deps first");
}

const browser = await chromium.launch();
const results = [];

try {
  for (const [name, value] of Object.entries(FIXTURES)) {
    const page = await browser.newPage({ viewport: { width: 300, height: 2400 }, deviceScaleFactor: 2 });
    await page.addInitScript(({ state, tab }) => {
      window.chrome = {
        runtime: {
          sendMessage(message, callback) {
            const response = message.cmd === "getState" ? state : { ok: true };
            setTimeout(() => callback(response), 0);
          },
          openOptionsPage() {},
        },
        tabs: {
          query: async () => [tab],
          reload() {},
        },
        permissions: {
          request: async () => false,
          contains: async () => true,
        },
      };
    }, chromeStub(value));
    await page.goto(popupUrl);
    await page.waitForFunction(() => {
      const headline = document.getElementById("verdictHeadline");
      return headline && headline.textContent.length > 0;
    });
    if (value.disclosure) {
      await page.locator("#pageSiteAction").click();
      await page.locator("#disclosure:not([hidden])").waitFor();
      if (value.focusConfirm) {
        await page.keyboard.press("Tab");
        await page.keyboard.press("Shift+Tab");
      }
    }
    const height = await page.evaluate(() => Math.ceil(document.body.getBoundingClientRect().height));
    const result = { name, height, clipped: height > 600 };
    results.push(result);
    console.log(JSON.stringify(result));
    await page.setViewportSize({ width: 300, height: Math.min(height, 2400) });
    await page.waitForTimeout(120);
    await page.screenshot({ path: path.join(outputDir, `${name}.png`), fullPage: true });
    await page.close();
  }
} finally {
  await browser.close();
}

console.log(`popup screenshots: ${outputDir}`);
if (results.some((result) => result.clipped)) process.exitCode = 1;
