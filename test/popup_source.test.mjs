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
  assert.match(popupSource, /Status\.derive\(state, extras\)/);
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

test("the page add binding routes through the disclosure-gated add flow", () => {
  assert.match(
    popupSource,
    /View\.addSite\((?:page\.origin \|\| )?page\.host,\s*Object\.assign\(siteEffects\(\),\s*\{\s*disclose:\s*presentDisclosure,?/s,
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
    chosenOrigins: ["https://mail.google.com"],
    grantedOrigins: ["https://mail.google.com"],
    inactiveOrigins: [],
    showPageIndicator: false,
    updateCheck: "no-update",
    capturePermitted: true,
    addSiteEligible: true,
  }, overrides);
}

test("the popup binder keeps refresh and add-action failure paths honest", async (t) => {
  const reconnects = [];
  const originalTimeout = globalThis.setTimeout;
  globalThis.setTimeout = fn => { reconnects.push(fn); return reconnects.length; };
  t.after(() => { globalThis.setTimeout = originalTimeout; });
  const ids = [
    "actionMessage", "verdict", "verdictDot", "verdictHeadline", "verdictSub",
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
      request: async () => {
        permissionRequests += 1;
        return true;
      },
      contains: async () => true,
    },
  };

  await import(new URL("../extension/lib/copy.js", import.meta.url));
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
  liveState = popupState({ chosenOrigins: [], grantedOrigins: [] });
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
    if (message.cmd === "addGrantedOrigin") {
      liveState = popupState({
        chosenOrigins: ["https://mail.google.com"],
        grantedOrigins: ["https://mail.google.com"],
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

  const failedAdd = nodes.pageSiteAction.onclick();
  nodes.disclosureConfirm.listeners.click();
  await failedAdd;
  assert.equal(nodes.actionMessage.textContent, "chrome doesn't let extensions work on this page");

  await nodes.pauseAction.onclick();
  assert.equal(nodes.actionMessage.textContent, "");

  pauseError = "Cannot read properties of undefined (reading 'foo')";
  await nodes.pauseAction.onclick();
  assert.notEqual(nodes.actionMessage.textContent, pauseError);
  assert.match(nodes.actionMessage.textContent, /^something went wrong/);

  // Status envelope, equal-epoch tab projections, and lower-epoch rejection.
  const origin = "https://mail.google.com";
  const status = (captureEpoch, overrides = {}) => popupState({
    captureEpoch,
    chosenOrigins: [origin],
    grantedOrigins: [origin],
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
    captureEpoch:17, connected:false, everConnected:false, chosenOrigins:[], grantedOrigins:[],
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
