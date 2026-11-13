// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { readFileSync } from "node:fs";
import { armClick, pageGestureRequest } from "./mock_chrome.mjs";

import {localizeHtmlFixture} from "./i18n_setup.mjs";

const root = new URL("../", import.meta.url);
const html = localizeHtmlFixture(await readFile(new URL("extension/popup.html", root), "utf8"));
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
  assert.match(popupSource, /Status\.present\(link, state, extras, Date\.now\(\)\)/);
  assert.match(popupSource, /Status\.derive\(shown, extras\)/);
  assert.match(viewSource, /SolstoneStatus\.siteRow\(/);
  assert.doesNotMatch(popupSource, /cfg\.key|localRegistered|journalUrl|journalPermission|journalIntent/);
});

test("popup has the tone mapping and dispatches actions", () => {
  for (const tone of ["ok", "calm", "attention", "unavailable"]) {
    assert.match(popupSource, new RegExp(`\\b${tone}: \\{ bandClass:`));
  }
  assert.match(popupSource, /TONE\[section\.tone\] \|\| TONE\.unavailable/);
  assert.match(popupSource, /runAction\(section\.action\)/);
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

test("the page add binding asks the browser from the add click", () => {
  assert.match(popupSource, /View\.addSite\(/);
  assert.doesNotMatch(popupSource, /disclose:|skipSheet/);
});

class FakeNode {
  constructor(id = "") {
    this.id = id;
    this.children = [];
    this.className = "";
    this.textContent = "";
    this.hidden = false;
    this.disabled = false;
    this._onclick = null;
    this.listeners = {};
    this.scrolledIntoView = 0;
  }

  scrollIntoView() {
    this.scrolledIntoView += 1;
  }

  addEventListener(type, listener) {
    this.listeners[type] = type === "click" ? armClick(listener) : listener;
  }

  append(...children) {
    this.children.push(...children);
  }

  replaceChildren(...children) {
    this.children = children;
  }

  focus() {}

  get onclick() {
    return this._onclick;
  }

  set onclick(listener) {
    this._onclick = typeof listener === "function" ? armClick(listener) : listener;
  }
}

function popupState(overrides = {}) {
  const next = Object.assign({
    inst: "00112233-4455-6677-8899-aabbccddeeff",
    captureEpoch: 1,
    everConnected: true,
    connected: true,
    handshake: "complete",
    brand: "chrome",
    platform: "mac",
    hostCapture: "permitted",
    hostDelivery: "delivered",
    hostFailure: null,
    lease: { token: "test", freshnessMs: 10000 },
    custody: { full: false, stale: false },
    behind: null,
    pressure: { active: false },
    siteErrors: { registration: {}, enqueue: {} },
    siteRejection: null,
    lossNotice: null,
    paused: false,
    consentVersion: 1,
    livePatterns: ["*://*.mail.google.com/*"],
    fence: null,
    excludedHosts: [],
    appLeftOut: [],
    showPageIndicator: false,
    updateCheck: "no-update",
    capturePermitted: true,
    addSiteEligible: true,
  }, overrides);
  if (!Object.hasOwn(overrides, "consentAccepted")) {
    next.consentAccepted = next.consentVersion === 1 || next.consentVersion === 2;
  }
  return next;
}

test("the popup binder keeps refresh and add-action failure paths honest", async (t) => {
  const reconnects = [];
  const originalTimeout = globalThis.setTimeout;
  globalThis.setTimeout = fn => { reconnects.push(fn); return reconnects.length; };
  t.after(() => { globalThis.setTimeout = originalTimeout; });
  const ids = [
    "aboutBlock", "aboutCopy", "aboutMessage", "actionMessage", "verdict", "verdictDot", "verdictHeadline", "verdictSub",
    "verdictReason", "verdictActions", "siteIssues", "siteIssueRows", "pageHost",
    "currentPageState", "pageSiteAction", "pauseAction", "siteCount", "siteCountText",
    "disclosure", "disclosureTitle", "disclosureWhat", "disclosureUnsent", "disclosureDestination",
    "disclosureDestinationDetail", "disclosureChrome", "disclosureConfirm",
    "disclosureCancel", "popupMain", "popupFooter", "allSitesLink", "settingsLink", "headerMark",
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
  let permissionAnswer = true;
  let optionsOpened = 0;
  let statusListener = null;
  let disconnectListener = null;
  let heldStateCallback = null;
  let holdNextState = false;
  let reloadCount = 0;
  const createdTabs = [];
  const sent = [];
  const mutationCommands = (messages) => messages.filter(
    (message) => ["addGrantedOrigin", "removeGrantedOrigin"].includes(message.cmd),
  );
  globalThis.chrome = {
    runtime: {
      getManifest: () => ({version: "0.2.0"}),
      sendMessage(message, callback) {
        sent.push(message);
        if (message.cmd === "getState" && holdNextState) {
          holdNextState = false;
          heldStateCallback = callback;
        } else callback(message.cmd === "getState" ? liveState : handleCommand(message));
      },
      openOptionsPage() {
        optionsOpened += 1;
      },
      reload() { reloadCount++; },
      connect() {
        return {
          onMessage: { addListener(fn) { statusListener = fn; } },
          onDisconnect: { addListener(fn) { disconnectListener = fn; } },
        };
      },
    },
    tabs: { query: (...args) => tabQuery(...args), create: (info) => createdTabs.push(info) },
    permissions: {
      request: pageGestureRequest(async () => {
        permissionRequests += 1;
        return permissionAnswer;
      }),
      contains: async () => true,
    },
  };

  await import(new URL("../extension/lib/copy.js", import.meta.url));
  await import(new URL("../extension/lib/about.js", import.meta.url));
  await import(new URL("../extension/lib/hosts.js", import.meta.url));
  await import(new URL("../extension/lib/status.js", import.meta.url));
  await import(new URL("../extension/lib/failures.js", import.meta.url));
  await import(new URL("../extension/lib/disclosure.js", import.meta.url));
  await import(new URL("../extension/lib/popup_view.js", import.meta.url));
  await import(new URL("../extension/lib/actions.js", import.meta.url));
  await import(new URL("../extension/popup.js", import.meta.url));
  await new Promise((resolve) => setImmediate(resolve));

  const verdictNode = nodes.verdict;
  assert.equal(verdictNode.id, "verdict");
  assert.equal(nodes.verdictHeadline.textContent, "on");
  const nativeFacts = {protocol_version: 1, os: "windows", os_version: "11 26100", arch: "arm64",
    journal_line: "journal 2.0.29 · ubuntu 24.04 · x86_64", journal_current: true, journal_seen_at_epoch_secs: 1700000000};
  liveState = popupState({about: nativeFacts});
  await globalThis.SolstonePopup.refresh();
  const displayed = nodes.aboutBlock.textContent;
  assert.equal(displayed, "solstone extension 0.2.0 · windows 11 26100 · arm64\njournal 2.0.29 · ubuntu 24.04 · x86_64");
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const clipboardWrites = [];
  let failClipboard = false, releaseClipboard;
  Object.defineProperty(globalThis, "navigator", {configurable: true, value: {clipboard: {writeText: async value => {
    if (failClipboard) throw new Error("clipboard refused");
    clipboardWrites.push(value);
    if (releaseClipboard === null) await new Promise(resolve => {releaseClipboard = resolve;});
  }}}});
  t.after(() => {
    if (navigatorDescriptor) Object.defineProperty(globalThis, "navigator", navigatorDescriptor);
    else delete globalThis.navigator;
  });
  await nodes.aboutCopy.listeners.click();
  assert.equal(clipboardWrites.at(-1), displayed);
  assert.equal(nodes.aboutCopy.textContent, "copied");
  failClipboard = true;
  await nodes.aboutCopy.listeners.click();
  assert.equal(nodes.aboutCopy.textContent, "copy");
  assert.equal(nodes.aboutMessage.textContent, "couldn't copy. select the text and copy it.");
  assert.equal(nodes.aboutBlock.textContent, displayed);
  failClipboard = false; releaseClipboard = null;
  const pendingCopy = nodes.aboutCopy.listeners.click();
  liveState = popupState({about: {...nativeFacts, journal_line: "journal 2.0.30"}});
  await globalThis.SolstonePopup.refresh();
  releaseClipboard(); await pendingCopy;
  assert.equal(clipboardWrites.at(-1), displayed);
  assert.equal(nodes.aboutCopy.textContent, "copy", "a completed older copy cannot confirm a different displayed block");
  liveState = popupState({ paused: true });
  statusListener({ type: "status", status: liveState });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(nodes.verdictHeadline.textContent, "paused in this browser");
  liveState = popupState();
  await globalThis.SolstonePopup.refresh();
  nodes.actionMessage.textContent = "previous action";

  liveState = popupState({
    hostCapture: "not_paired",
    chosenOrigins: ["https://mail.google.com"],
  });
  await globalThis.SolstonePopup.refresh();
  assert.equal(nodes.verdictHeadline.textContent, "the solstone app isn't paired yet");
  assert.equal(nodes.verdictActions.children.length, 0);
  nodes.actionMessage.textContent = "previous action";

  liveState = popupState({ paused: true });
  await globalThis.SolstonePopup.refresh();
  assert.strictEqual(nodes.verdict, verdictNode);
  assert.equal(nodes.verdictHeadline.textContent, "paused in this browser");
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
  liveState = popupState({ livePatterns: [] });
  await globalThis.SolstonePopup.refresh();

  let before = sent.length;
  let permissionsBefore = permissionRequests;
  permissionAnswer = false;
  const declined = nodes.pageSiteAction.onclick();
  assert.equal(permissionRequests, permissionsBefore + 1);
  await declined;
  assert.deepEqual(mutationCommands(sent.slice(before)), []);
  permissionAnswer = true;

  const rawRegistrationError = "Cannot access contents of url https://mail.google.com/";
  let pauseError = "";
  handleCommand = (message) => {
    if (message.cmd === "addGrantedOrigin") {
      liveState = popupState({
        livePatterns: ["*://*.mail.google.com/*"],
        registration: { "https://mail.google.com": "reload" },
      });
      return { ok: false, error: rawRegistrationError };
    }
    if (message.cmd === "setPaused") {
      if (pauseError) return { ok: false, error: pauseError };
      liveState.paused = message.paused;
      return { ok: true };
    }
    return { ok: true };
  };

  const scrolledBefore = nodes.actionMessage.scrolledIntoView;
  const failedAdd = nodes.pageSiteAction.onclick();
  await failedAdd;
  assert.equal(nodes.actionMessage.textContent, "Chrome doesn't let extensions work on this page");
  // The message sits at the end of a popup that scrolls: it's brought into view.
  assert.ok(nodes.actionMessage.scrolledIntoView > scrolledBefore);

  await nodes.pauseAction.onclick();
  assert.equal(nodes.actionMessage.textContent, "");

  pauseError = "Cannot read properties of undefined (reading 'foo')";
  await nodes.pauseAction.onclick();
  assert.notEqual(nodes.actionMessage.textContent, pauseError);
  assert.match(nodes.actionMessage.textContent, /^something went wrong/);

  const Copy = globalThis.SolstoneCopy;
  const Hosts = globalThis.SolstoneHosts;
  const named = Hosts.displayOrigin("https://mail.google.com");
  liveState = popupState({ livePatterns: ["*://*.mail.google.com/*"] });
  tabQuery = async () => [{ id: 7, url: "https://mail.google.com/inbox" }];
  await globalThis.SolstonePopup.refresh();
  handleCommand = () => ({ ok: true, result: "left_out_instead" });
  await nodes.pageSiteAction.onclick();
  assert.equal(nodes.actionMessage.textContent, Copy.leftOutAnnouncement(named));
  handleCommand = () => ({ ok: true });
  await nodes.pageSiteAction.onclick();
  assert.equal(nodes.actionMessage.textContent, Copy.removedAnnouncement(named));

  // Status envelope, equal-epoch tab projections, and lower-epoch rejection.
  const origin = "https://mail.google.com";
  const status = (captureEpoch, overrides = {}) => popupState({
    captureEpoch,
    livePatterns: ["*://*.mail.google.com/*"],
    ...overrides,
  });
  statusListener({type:"status", status:status(10)});
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(nodes.verdictReason.textContent, "");
  statusListener({type:"status", status:status(10, {
    openTabs:{known:true, openOrigins:[], anyGrantedTabOpen:false},
  })});
  await new Promise((resolve) => setImmediate(resolve));
  assert.notEqual(nodes.verdictReason.textContent, "");
  statusListener({type:"status", status:status(10, {
    openTabs:{known:true, openOrigins:[origin], anyGrantedTabOpen:true},
  })});
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(nodes.verdictReason.textContent, "");

  statusListener({type:"status", status:status(11, {paused:true})});
  await new Promise((resolve) => setImmediate(resolve));
  statusListener({type:"status", status:status(10)});
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(nodes.verdictHeadline.textContent, "paused in this browser");
  statusListener({type:"status", status:status(12)});
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(nodes.verdictHeadline.textContent, "on");

  holdNextState = true;
  const oldReply = globalThis.SolstonePopup.refresh();
  statusListener({type:"status", status:status(14, {paused:true})});
  await new Promise((resolve) => setImmediate(resolve));
  heldStateCallback(status(12));
  await oldReply;
  assert.equal(nodes.verdictHeadline.textContent, "paused in this browser");

  holdNextState = true;
  const preDisconnect = globalThis.SolstonePopup.refresh();
  liveState = status(14, {paused:true});
  disconnectListener();
  reconnects.shift()?.();
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  heldStateCallback(status(12));
  await preDisconnect;
  assert.equal(nodes.verdictHeadline.textContent, "paused in this browser");
  liveState = status(15);
  await globalThis.SolstonePopup.refresh();
  assert.equal(nodes.verdictHeadline.textContent, "on");

  // A failed active-tab lookup affects the page block, not background open tabs.
  tabQuery = async () => { throw new Error("active tab lookup failed"); };
  liveState = status(16, {openTabs:{known:true, openOrigins:[origin], anyGrantedTabOpen:true}});
  await globalThis.SolstonePopup.refresh();
  assert.equal(nodes.verdictHeadline.textContent, "on");

  // Popup get-app uses the exact app URL with no search string.
  statusListener({type:"status", status:popupState({
    captureEpoch:17, connected:false, everConnected:false, livePatterns:[],
  })});
  await new Promise((resolve) => setImmediate(resolve));
  await nodes.verdictActions.children[0].listeners.click();
  assert.equal(createdTabs.at(-1).url, "https://solstone.app");
  assert.equal(new URL(createdTabs.at(-1).url).search, "");

  // The Settings and update actions share one dispatcher with fresh-state validation.
  const action = globalThis.SolstoneActions;
  liveState = popupState({captureEpoch:18, behind:"extension", updateCheck:"update-available"});
  await action.run({id:"update-now"}, {
    cmd: (message) => message.cmd === "getState" ? liveState : {},
    refresh: async () => {},
    reload: () => { reloadCount++; },
  });
  assert.equal(reloadCount, 1);
  liveState.updateCheck = "no-update";
  await action.run({id:"update-now"}, {
    cmd: (message) => message.cmd === "getState" ? liveState : {},
    refresh: async () => {},
    reload: () => { reloadCount++; },
  });
  assert.equal(reloadCount, 1);

  liveState = popupState({
    captureEpoch:19,
    truncationByOrigin:{[origin]:{count:1, newestId:"doc:clip", dismissThroughId:"", pending:["doc:clip"]}},
  });
  await globalThis.SolstonePopup.refresh();
  handleCommand = (message) => message.cmd === "dismissTruncation"
    ? {ok:false, error:"storage_error"} : {ok:true};
  const truncationRow = nodes.siteIssueRows.children.find((node) => node.children.some((child) => child.textContent === "mail.google.com"));
  const visibleRows = nodes.siteIssueRows.children.length;
  await truncationRow.children.find((child) => child.listeners.click).listeners.click();
  assert.ok(nodes.actionMessage.textContent);
  assert.equal(nodes.siteIssueRows.children.length, visibleRows, "failed dismissal leaves the row rendered");
});

test("an open popup shows the app's answer even when the status channel stays silent", async (t) => {
  const timers = [];
  const originalTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn) => { timers.push(fn); return timers.length; };
  t.after(() => { globalThis.setTimeout = originalTimeout; });
  const ids = [
    "aboutBlock", "aboutCopy", "aboutMessage", "actionMessage", "verdict", "verdictDot", "verdictHeadline", "verdictSub",
    "verdictNote", "verdictReason", "verdictActions", "siteIssues", "siteIssueRows", "pageHost", "pageNote",
    "currentPageState", "pageSiteAction", "pageSiteSecondary", "pauseAction", "siteCount", "siteCountText",
    "disclosure", "disclosureConfirm", "disclosureCancel", "allSitesLink", "settingsLink", "headerMark",
  ];
  const nodes = Object.fromEntries(ids.map((id) => [id, new FakeNode(id)]));
  nodes.disclosure.hidden = true;
  globalThis.document = {
    visibilityState: "visible",
    getElementById: (id) => nodes[id],
    createElement: () => new FakeNode(),
    addEventListener() {},
  };
  const host = "example.com";
  const desktop = { screen: true, activity: true, sites: "on" };
  let liveState = popupState({ brand: "safari", captureEpoch: 5, livePatterns: [], fence: null, excludedHosts: [host], appLeftOut: [], desktop });
  let connects = 0;
  globalThis.chrome = {
    runtime: {
      getManifest: () => ({ version: "0.4.0" }),
      sendMessage(message, callback) { callback(message.cmd === "getState" ? { ok: true, ...liveState } : { ok: true }); },
      openOptionsPage() {},
      // Safari's failure: the channel opens and never delivers.
      connect() {
        connects += 1;
        return { onMessage: { addListener() {} }, onDisconnect: { addListener() {} } };
      },
    },
    tabs: { query: async () => [{ id: 3, url: `https://${host}/` }], create() {} },
    permissions: { request: pageGestureRequest(async () => true), contains: async () => true },
  };

  await import(new URL("../extension/popup.js?silent-channel", import.meta.url));
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  const Copy = globalThis.SolstoneCopy;
  assert.equal(nodes.pageNote.textContent, Copy.extensionLeftOut);
  assert.equal(timers.length, 1, "the open popup schedules one read");

  // The app answers: the background now has the site in the app's list, and
  // nothing arrives on the channel.
  liveState = { ...liveState, appLeftOut: [host] };
  await timers.shift()();
  assert.equal(nodes.pageNote.textContent, Copy.appLeftOutSitesOn);
  assert.equal(timers.length, 1, "the read is scheduled again");

  // An unchanged state is not repainted, so focus and controls stay put.
  nodes.pageNote.textContent = "unchanged";
  await timers.shift()();
  assert.equal(nodes.pageNote.textContent, "unchanged");

  // A restarted background starts its epoch over: the popup resubscribes and
  // still shows the newer state.
  const before = connects;
  liveState = { ...liveState, captureEpoch: 1, appLeftOut: [] };
  await timers.shift()();
  assert.equal(connects, before + 1);
  assert.equal(nodes.pageNote.textContent, Copy.extensionLeftOut);

  // A hidden popup doesn't read.
  globalThis.document.visibilityState = "hidden";
  liveState = { ...liveState, captureEpoch: 2, appLeftOut: [host] };
  nodes.pageNote.textContent = "hidden";
  await timers.shift()();
  assert.equal(nodes.pageNote.textContent, "hidden");
});

test("the popup reads the browser's grants after a failed add, through its own effects", () => {
  const source = readFileSync(new URL("../extension/popup.js", import.meta.url), "utf8");
  assert.match(source, /getAllPermissions: \(\) => chrome\.permissions\.getAll\(\)/);
});

test("popup: cleared notice from getStatus is first, including when consent is 0", async (t) => {
  const timers = [];
  const originalTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn) => { timers.push(fn); return timers.length; };
  t.after(() => { globalThis.setTimeout = originalTimeout; });

  class NoticeNode {
    constructor(id = "") {
      this.id = id;
      this.children = [];
      this.className = "";
      this.textContent = "";
      this.hidden = false;
      this.disabled = false;
      this.dataset = {};
      this.listeners = {};
      this.parentNode = null;
    }
    addEventListener(type, listener) {
      this.listeners[type] = type === "click" ? armClick(listener) : listener;
    }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    scrollIntoView() {}
    focus() {}
  }

  const ids = [
    "aboutBlock", "aboutCopy", "aboutMessage", "actionMessage", "verdict", "verdictDot", "verdictHeadline", "verdictSub",
    "verdictNote", "verdictReason", "verdictActions", "siteIssues", "siteIssueRows", "pageHost", "pageNote",
    "currentPageState", "pageSiteAction", "pageSiteSecondary", "pauseAction", "siteCount", "siteCountText",
    "disclosure", "disclosureTitle", "disclosureWhat", "disclosureUnsent", "disclosureDestination",
    "disclosureDestinationDetail", "disclosureChrome", "disclosureConfirm", "disclosureCancel",
    "popupMain", "popupFooter", "allSitesLink", "settingsLink", "headerMark", "pageLearn", "pageHint",
    "page",
  ];
  const nodes = Object.fromEntries(ids.map((id) => [id, new NoticeNode(id)]));
  nodes.disclosure.hidden = true;
  nodes.popupMain.children = ["verdict", "siteIssues", "page", "siteCount"].map((id) => {
    nodes[id].parentNode = nodes.popupMain;
    return nodes[id];
  });
  const findId = (node, id) => {
    if (!node) return null;
    if (node.id === id) return node;
    for (const child of node.children || []) {
      const found = findId(child, id);
      if (found) return found;
    }
    return null;
  };
  globalThis.document = {
    getElementById: (id) => nodes[id] || findId(nodes.popupMain, id),
    createElement: () => new NoticeNode(),
    addEventListener() {},
  };

  const sent = [];
  let liveState = null;
  let shareAnswer = { ok: true };
  let allowRequest = true;
  const pageUrl = "https://other.example/path";
  globalThis.chrome = {
    runtime: {
      getManifest: () => ({ version: "0.5.9" }),
      sendMessage(message, callback) {
        sent.push(message);
        if (message.cmd === "getState") callback(liveState);
        else if (message.cmd === "shareEverySite") callback(shareAnswer);
        else callback({ ok: true });
      },
      openOptionsPage() {},
      reload() {},
      connect() {
        return { onMessage: { addListener() {} }, onDisconnect: { addListener() {} } };
      },
    },
    tabs: { query: async () => [{ id: 4, url: pageUrl }], create() {} },
    permissions: { request: pageGestureRequest(async () => allowRequest), contains: async () => true, getAll: async () => ({ origins: [] }) },
  };

  await import("fake-indexeddb/auto");


const root = new URL("../", import.meta.url);
  for (const file of [
    "extension/native-browser/constants.js",
    "extension/native-browser/schemas.js",
    "extension/native-browser/schema-validator.js",
    "extension/native-browser/codec.js",
    "extension/lib/uuid.js",
    "extension/lib/db.js",
    "extension/lib/blocks.js",
    "extension/lib/hosts.js",
    "extension/lib/segment.js",
    "extension/lib/gate.js",
    "extension/lib/left_out.js",
    "extension/lib/native_outbox.js",
    "extension/lib/native_port.js",
    "extension/lib/copy.js",
    "extension/lib/about.js",
    "extension/lib/status.js",
    "extension/lib/failures.js",
    "extension/lib/disclosure.js",
    "extension/lib/popup_view.js",
    "extension/lib/actions.js",
  ]) {
    await import(new URL(file, root));
  }
  const PortController = globalThis.SolstoneNativePort;
  const Copy = globalThis.SolstoneCopy;
  const controller = new PortController({
    inst: "00000000-0000-0000-0000-000000000001",
    runtimeId: "fgfnkcefedeheoeamppkiiloncfekakf",
    connectNative: () => null,
  });
  controller.connectionGeneration = 1;
  controller.clearedNotice = true;
  controller.consentVersion = 0;
  liveState = controller.getStatus();
  assert.equal(liveState.clearedNotice, true);
  assert.equal(liveState.consentVersion, 0);

  await import(new URL("../extension/popup.js?group6-notices", import.meta.url));
  await globalThis.SolstonePopup.refresh();

  const notice = nodes.popupMain.children.find((child) => child.id === "clearedNotice");
  assert.equal(nodes.popupMain.children[0]?.id, "clearedNotice");
  assert.equal(notice.children[0].textContent, Copy.clearedStorageNotice());
  assert.equal(notice.children[1].textContent, "resume");
  const beforeResume = sent.length;
  await notice.children[1].listeners.click();
  assert.deepEqual(sent.slice(beforeResume).find((message) => message.cmd === "setPaused"), { cmd: "setPaused", paused: false });

  controller.clearedNotice = false;
  controller.consentVersion = 1;
  controller.hostCapture = "permitted";
  controller.capturePermitted = true;
  controller.lease = { token: "t", freshnessMs: 60000, receivedAt: Date.now(), standing: true };
  controller.paused = false;
  controller.fence = {
    entries: ["https://fenced.example"],
    siteWide: [],
    exact: ["https://fenced.example"],
    exactKnown: true,
    sawMore: true,
    answered: false,
  };
  controller.livePatterns = ["*://*/*"];
  controller.broadGrant = true;
  liveState = controller.getStatus();
  await globalThis.SolstonePopup.refresh();
  assert.equal(nodes.popupMain.children.find((child) => child.id === "clearedNotice"), undefined);
  const page = { origin: "https://other.example", host: "other.example", ok: true, kind: "web" };
  const arranged = globalThis.SolstonePopupView.arrange(null, liveState, page);
  const question = arranged.find((section) => section.id === "upgradeQuestion");
  const block = nodes.popupMain.children.find((child) => child.id === "upgradeQuestion");
  assert.ok(question);
  assert.equal(block.children[0].textContent, question.body);
  assert.deepEqual(block.children[1].children.map((button) => button.textContent), question.buttons.map((button) => button.label));
  const pageIndex = nodes.popupMain.children.findIndex((child) => child.id === "page");
  const questionIndex = nodes.popupMain.children.findIndex((child) => child.id === "upgradeQuestion");
  if (pageIndex >= 0) assert.ok(questionIndex < pageIndex);

  const shareButton = block.children[1].children.find((button) => button.textContent === question.buttons[0].label);
  await shareButton.listeners.click();
  assert.equal(nodes.actionMessage.textContent, Copy.accessCopy(liveState.brand).nowAllowed);

  shareAnswer = { ok: false, result: "share_held" };
  await block.children[1].children.find((button) => button.textContent === question.buttons[0].label).listeners.click();
  assert.equal(nodes.actionMessage.textContent, "");
  shareAnswer = { ok: true };

  allowRequest = false;
  const declinedFrom = sent.length;
  await nodes.popupMain.children.find((child) => child.id === "upgradeQuestion").children[1].children[0].listeners.click();
  assert.equal(nodes.actionMessage.textContent, Copy.accessCopy(liveState.brand).declined);
  assert.equal(sent.slice(declinedFrom).some((message) => message.cmd === "shareEverySite"), false);
  allowRequest = true;

  controller.fence = null;
  controller.livePatterns = [];
  controller.broadGrant = false;
  liveState = controller.getStatus();
  await globalThis.SolstonePopup.refresh();
  assert.equal(nodes.currentPageState.textContent, "not added");
  assert.equal(nodes.pageSiteAction.hidden, false);

  const unavailable = controller.getStatus();
  unavailable.permissionsUnavailable = true;
  liveState = unavailable;
  await globalThis.SolstonePopup.refresh();
  assert.equal(nodes.currentPageState.textContent, Copy.actionFailure("permissions_unavailable", unavailable.brand));
  assert.equal(nodes.pageSiteAction.hidden, true);
  assert.doesNotMatch(popupSource, /stays paused/);
});

test("Safari's iPad popover gets a width of its own instead of shrinking to its words", () => {
  assert.match(popupSource, /SolstoneCopy\?\.PLACE === "this ipad"\) document\.documentElement\.classList\.add\("ipad"\)/);
  assert.match(html, /:root\.ipad body \{ width: 360px; \}/);
});

test("popup: declining the browser's prompt reads plain, and only a policy block is red", () => {
  assert.equal(globalThis.SolstoneI18n.t("browser.copy.adddenied"), "permission declined. nothing added.");
  assert.match(popupSource, /showDenied: \(\) => showActionMessage\(globalThis\.SolstoneCopy\.accessCopy\(state\?\.brand\)\.declined\),/);
  assert.match(popupSource, /showActionMessage\(blocked \|\| t\("browser.copy.adddenied"\), blocked \? "bad" : "ok"\)/);
});
