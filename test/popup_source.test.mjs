// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const html = await readFile(new URL("extension/popup.html", root), "utf8");
const popupSource = await readFile(new URL("extension/popup.js", root), "utf8");
const viewSource = await readFile(new URL("extension/lib/popup_view.js", root), "utf8");

test("popup HTML fixes the section order and heading contract", () => {
  const ids = ["verdict", "siteIssues", "page", "siteCount", "popupFooter"];
  const positions = ids.map((id) => html.indexOf(`id="${id}"`));
  assert.ok(positions.every((position) => position >= 0));
  assert.deepEqual(positions, positions.slice().sort((a, b) => a - b));
  assert.match(html, /<img[^>]+alt=""/);
  assert.match(html, />sol<\/span>\s*<span class="desc">in your browser</);
  assert.match(html, /<section id="verdict"[^>]+role="status">/);
  assert.match(html, /<h1 id="verdictHeadline" class="v-head"><\/h1>/);
  assert.match(html, /<section id="disclosure"[^>]+hidden>/);
});

test("popup consumes the upstream status derivations without recreating them", () => {
  assert.match(popupSource, /Status\.verdict\(state,/);
  assert.match(popupSource, /SolstoneStatus\.connection\(state\)/);
  assert.match(viewSource, /SolstoneStatus\.siteRowState\(entry,/);
  assert.doesNotMatch(popupSource, /cfg\.key|localRegistered/);
  assert.doesNotMatch(popupSource, /(?:allowlist\.length|sites)\s*>\s*0\s*&&\s*!\s*(?:state\.)?paused/);
  assert.doesNotMatch(`${popupSource}\n${viewSource}`, /switch\s*\(/);

  // connection() and siteRowState() are intentionally allowed. They consume
  // the upstream decisions; cfg.key, localRegistered, and the combined site
  // count plus pause predicate would create parallel decisions here.
});

test("popup has exactly the four tone and four verdict-action lookup entries", () => {
  for (const tone of ["ok", "calm", "attention", "unavailable"]) {
    assert.match(popupSource, new RegExp(`\\b${tone}: \\{ bandClass:`));
  }
  for (const action of ["try-now", "dismiss", "open-settings", "set-up"]) {
    assert.match(popupSource, new RegExp(`["']?${action}["']?:`));
  }
  assert.match(popupSource, /TONE\[section\.tone\] \|\| TONE\.unavailable/);
  assert.match(popupSource, /ACTION\[section\.action\.id\]/);
});

test("popup uses real DOM construction and removes all retired selectors", () => {
  assert.doesNotMatch(popupSource, /innerHTML/);
  assert.match(popupSource, /document\.createElement\(/);
  assert.match(popupSource, /\.textContent\s*=/);
  assert.doesNotMatch(html, /lib\/escape\.js/);

  const retired = [
    "journalState", "pauseState", "pageState", "pinHint", "streamLabel",
    "consequence", "loss", "lossBtn", "lossText", "consequenceText",
    "tryBtn", "sites", "addBtn", "pauseBtn", "err", "optsLink",
  ];
  for (const id of retired) {
    assert.doesNotMatch(html, new RegExp(`id=["']${id}["']`), id);
    assert.doesNotMatch(popupSource, new RegExp(`\\(["']${id}["']\\)`), id);
  }
  assert.doesNotMatch(html, /title=/);
});

test("every popup control gets the required focus treatment", () => {
  assert.match(html, /button:focus-visible,\s*a:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--focus\)[^}]*outline-offset:\s*2px/s);
  assert.doesNotMatch(html, /outline\s*:\s*(?:none|0)\b/i);
});

test("popup color tokens keep orange out of normal-size text and strengthen control borders", () => {
  assert.match(html, /--focus:\s*#B06A1A;/);
  assert.match(html, /--success:\s*#3F9D6A;/);
  assert.match(html, /--warn:\s*#C99A2E;/);
  assert.match(html, /--field-line:\s*#96896F;/);
  assert.doesNotMatch(html, /--orange-ink|--line2|#e2d7bf/i);

  const colorValues = [...html.matchAll(/\bcolor\s*:\s*([^;}]+)/gi)].map((match) => match[1]);
  assert.equal(colorValues.some((value) => /#b06a1a/i.test(value)), false);
  assert.equal((html.match(/#B06A1A/g) || []).length, 1);
  assert.match(html, /button\s*\{[^}]*border:\s*1px solid var\(--field-line\)/s);
  assert.match(html, /button\.primary\s*\{[^}]*border-color:\s*var\(--orange\)/s);
});

function assertOwnerCopy(files) {
  const joined = files.join("\n");
  assert.doesNotMatch(joined, /\u2014|capture|record|monitor|watch|track|observ(?:e|es|ed|ing|ation)|\busers?\b|prototype/i);
  assert.doesNotMatch(joined, /local journal|journal service|journal host|\ba server\b|sol browser/i);
}

test("the four A7-L2 owner-copy files obey the copy bans", async () => {
  // L3 AC 14 owns the repository-wide sweep, including frozen failures.js.
  const files = await Promise.all([
    "extension/popup.html",
    "extension/popup.js",
    "extension/lib/disclosure.js",
    "extension/lib/popup_view.js",
  ].map((path) => readFile(new URL(path, root), "utf8")));
  assertOwnerCopy(files);
  assert.throws(() => assertOwnerCopy(["prototype users observe\u2014everything"]));
});

test("the empty loss block and its competing predicates are gone", () => {
  assert.doesNotMatch(`${html}\n${popupSource}`, /lossBtn|lossText|id=["']loss["']|dropped\.segments\s*>/);
});

class FakeNode {
  constructor(id = "") {
    this.id = id;
    this.children = [];
    this.className = "";
    this.textContent = "";
    this.hidden = false;
    this.disabled = false;
    this.onclick = null;
    this.listeners = {};
  }

  addEventListener(type, listener) {
    this.listeners[type] = listener;
  }

  append(...children) {
    this.children.push(...children);
  }

  replaceChildren(...children) {
    this.children = children;
  }

  focus() {}
}

function popupState(overrides = {}) {
  return Object.assign({
    ok: true,
    journalUrl: "http://localhost:5015",
    localRegistered: true,
    journalPermission: "granted",
    paused: false,
    allowlist: ["mail.google.com"],
    pausedHosts: {},
    siteErrors: {},
    health: { lastError: null, lastUploadAt: 1, segmentsUploaded: 1, lastStatus: 200, consecutiveFailures: 0 },
    remote: { paired: false, pending: false, relayOrigin: "", pairedAt: null },
    activeSites: ["mail.google.com"],
    waiting: 0,
    dropped: { segments: 0, lines: 0 },
    outbox: { entries: 0, lines: 0 },
  }, overrides);
}

test("refresh preserves the verdict live-region node while changing its children", async () => {
  const ids = [
    "actionMessage", "verdict", "verdictDot", "verdictHeadline", "verdictSub",
    "verdictReason", "verdictActions", "siteIssues", "siteIssueRows", "pageHost",
    "currentPageState", "pageSiteAction", "pauseAction", "siteCount", "siteCountText",
    "disclosure", "disclosureTitle", "disclosureWhat", "disclosureDestination",
    "disclosureDestinationDetail", "disclosureChrome", "disclosureConfirm",
    "disclosureCancel", "popupMain", "popupFooter", "allSitesLink", "settingsLink",
  ];
  const nodes = Object.fromEntries(ids.map((id) => [id, new FakeNode(id)]));
  nodes.disclosure.hidden = true;
  globalThis.document = {
    getElementById: (id) => nodes[id],
    createElement: () => new FakeNode(),
    addEventListener() {},
  };

  let liveState = popupState();
  globalThis.chrome = {
    runtime: {
      sendMessage(message, callback) {
        callback(message.cmd === "getState" ? liveState : { ok: true });
      },
      openOptionsPage() {},
    },
    tabs: { query: async () => [{ id: 7, url: "https://mail.google.com/inbox" }] },
    permissions: { request: async () => true, contains: async () => true },
  };

  await import(new URL("../extension/lib/hosts.js", import.meta.url));
  await import(new URL("../extension/lib/status.js", import.meta.url));
  await import(new URL("../extension/lib/failures.js", import.meta.url));
  await import(new URL("../extension/lib/disclosure.js", import.meta.url));
  await import(new URL("../extension/lib/popup_view.js", import.meta.url));
  await import(new URL("../extension/popup.js", import.meta.url));
  await new Promise((resolve) => setImmediate(resolve));

  const verdictNode = nodes.verdict;
  assert.equal(verdictNode.id, "verdict");
  assert.equal(nodes.verdictHeadline.textContent, "on");
  nodes.actionMessage.textContent = "previous action";

  liveState = popupState({ paused: true, activeSites: [] });
  await globalThis.SolstonePopup.refresh();
  assert.strictEqual(nodes.verdict, verdictNode);
  assert.equal(nodes.verdictHeadline.textContent, "paused");
  assert.equal(nodes.actionMessage.textContent, "previous action");
});
