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
  assert.match(html, />solstone<\/span>\s*<span class="desc">in your browser</);
  assert.match(html, /<section id="verdict"[^>]+role="status">/);
  assert.match(html, /<h1 id="verdictHeadline" class="v-head"><\/h1>/);
  assert.match(html, /<section id="disclosure"[^>]+hidden>/);
});

test("popup consumes the upstream status derivations without recreating them", () => {
  assert.match(popupSource, /Status\.verdict\(state,/);
  assert.match(viewSource, /SolstoneStatus\.siteRowState\(entry,/);
  assert.doesNotMatch(popupSource, /cfg\.key|localRegistered|journalUrl|journalPermission|journalIntent/);
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
  assert.match(popupSource, /function setUp\(\) \{\s*openSettings\(\);\s*\}/);
});

test("popup uses real DOM construction and removes all retired selectors", () => {
  assert.doesNotMatch(popupSource, /innerHTML/);
  assert.match(popupSource, /document\.createElement\(/);
  assert.match(popupSource, /\.textContent\s*=/);

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

test("the empty loss block and its competing predicates are gone", () => {
  assert.doesNotMatch(`${html}\n${popupSource}`, /lossBtn|lossText|id=["']loss["']|dropped\.segments\s*>/);
});

test("the page add binding routes through the disclosure-gated add flow", () => {
  assert.match(
    popupSource,
    /View\.addSite\(page\.host,\s*Object\.assign\(siteEffects\(\),\s*\{\s*disclose:\s*presentDisclosure,/s,
  );
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
    paused: false,
    allowlist: ["mail.google.com"],
    pausedHosts: {},
    siteErrors: {},
    health: { lastError: null, lastUploadAt: 1, segmentsUploaded: 1, lastStatus: 200, consecutiveFailures: 0 },
    remote: {
      paired: true,
      pending: false,
      instanceId: "00112233445566778899aabbccddeeff",
      relayOrigin: "https://relay.example",
      pairedAt: 1,
    },
    activeSites: ["mail.google.com"],
    waiting: 0,
    dropped: { segments: 0, lines: 0 },
    outbox: { entries: 0, lines: 0 },
  }, overrides);
}

test("the popup binder keeps refresh and add-action failure paths honest", async () => {
  const ids = [
    "actionMessage", "verdict", "verdictDot", "verdictHeadline", "verdictSub",
    "verdictReason", "verdictActions", "siteIssues", "siteIssueRows", "pageHost",
    "currentPageState", "pageSiteAction", "pauseAction", "siteCount", "siteCountText",
    "disclosure", "disclosureTitle", "disclosureWhat", "disclosureUnsent", "disclosureDestination",
    "disclosureDestinationDetail", "disclosureChrome", "disclosureConfirm",
    "disclosureCancel", "popupMain", "popupFooter", "allSitesLink", "settingsLink",
  ];
  const nodes = Object.fromEntries(ids.map((id) => [id, new FakeNode(id)]));
  nodes.disclosure.hidden = true;
  const documentListeners = {};
  globalThis.document = {
    getElementById: (id) => nodes[id],
    createElement: () => new FakeNode(),
    addEventListener(type, listener) {
      documentListeners[type] = listener;
    },
  };

  let liveState = popupState();
  let tabQuery = async () => [{ id: 7, url: "https://mail.google.com/inbox" }];
  let handleCommand = () => ({ ok: true });
  let permissionRequests = 0;
  let optionsOpened = 0;
  const sent = [];
  const mutationCommands = (messages) => messages.filter(
    (message) => ["siteIntent", "siteGranted", "removeSite"].includes(message.cmd),
  );
  globalThis.chrome = {
    runtime: {
      sendMessage(message, callback) {
        sent.push(message);
        callback(message.cmd === "getState" ? liveState : handleCommand(message));
      },
      openOptionsPage() {
        optionsOpened += 1;
      },
    },
    tabs: { query: (...args) => tabQuery(...args) },
    permissions: {
      request: async () => {
        permissionRequests += 1;
        return true;
      },
      contains: async () => true,
    },
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

  liveState = popupState({
    remote: { paired: false, pending: false, instanceId: "", relayOrigin: "", pairedAt: null },
    activeSites: [],
  });
  await globalThis.SolstonePopup.refresh();
  assert.equal(nodes.verdictHeadline.textContent, "no journal yet");
  assert.equal(nodes.verdictActions.children[0].textContent, "set up your journal");
  await nodes.verdictActions.children[0].listeners.click();
  assert.equal(optionsOpened, 1);
  assert.equal(permissionRequests, 0);
  nodes.actionMessage.textContent = "previous action";

  liveState = popupState({ paused: true, activeSites: [] });
  await globalThis.SolstonePopup.refresh();
  assert.strictEqual(nodes.verdict, verdictNode);
  assert.equal(nodes.verdictHeadline.textContent, "paused");
  assert.equal(nodes.actionMessage.textContent, "previous action");

  liveState = { ok: false, error: "worker state unavailable" };
  tabQuery = async () => {
    throw new Error("tab lookup failed");
  };
  await globalThis.SolstonePopup.refresh();
  assert.strictEqual(nodes.verdict, verdictNode);
  assert.equal(nodes.verdictHeadline.textContent, "status unavailable");
  assert.equal(nodes.verdictActions.children.length, 1);
  assert.equal(nodes.verdictActions.children[0].textContent, "open settings");
  assert.equal(nodes.siteIssues.hidden, true);
  assert.equal(nodes.siteCount.hidden, true);

  tabQuery = async () => [{ id: 7, url: "https://mail.google.com/inbox" }];
  liveState = popupState({ allowlist: [], activeSites: [] });
  await globalThis.SolstonePopup.refresh();

  let before = sent.length;
  let permissionsBefore = permissionRequests;
  const cancelled = nodes.pageSiteAction.onclick();
  assert.equal(nodes.disclosure.hidden, false);
  nodes.disclosureCancel.listeners.click();
  await cancelled;
  assert.deepEqual(mutationCommands(sent.slice(before)), []);
  assert.equal(permissionRequests, permissionsBefore);

  before = sent.length;
  permissionsBefore = permissionRequests;
  const escaped = nodes.pageSiteAction.onclick();
  assert.equal(nodes.disclosure.hidden, false);
  documentListeners.keydown({ key: "Escape" });
  await escaped;
  assert.deepEqual(mutationCommands(sent.slice(before)), []);
  assert.equal(permissionRequests, permissionsBefore);

  const rawRegistrationError = "Cannot access contents of url https://mail.google.com/";
  let pauseError = "";
  handleCommand = (message) => {
    if (message.cmd === "siteIntent") {
      liveState = popupState({ allowlist: [message.host], activeSites: [] });
      return { ok: true, added: true };
    }
    if (message.cmd === "siteGranted") {
      liveState.siteErrors[message.host] = rawRegistrationError;
      return { ok: false, error: rawRegistrationError };
    }
    if (message.cmd === "setPaused") {
      if (pauseError) return { ok: false, error: pauseError };
      liveState.paused = message.paused;
      return { ok: true };
    }
    return { ok: true };
  };

  const failedAdd = nodes.pageSiteAction.onclick();
  nodes.disclosureConfirm.listeners.click();
  await failedAdd;
  const issueWhy = nodes.siteIssueRows.children[0].children[1];
  assert.equal(nodes.actionMessage.textContent, "chrome doesn't allow extensions on this page");
  assert.equal(issueWhy.textContent, "chrome doesn't allow extensions on this page");
  for (const node of [nodes.actionMessage, nodes.currentPageState, issueWhy]) {
    assert.equal(node.textContent.includes(rawRegistrationError), false);
  }

  await nodes.pauseAction.onclick();
  assert.equal(nodes.actionMessage.textContent, "");

  pauseError = "Cannot read properties of undefined (reading 'foo')";
  await nodes.pauseAction.onclick();
  assert.notEqual(nodes.actionMessage.textContent, pauseError);
  assert.match(nodes.actionMessage.textContent, /^something went wrong/);
});
