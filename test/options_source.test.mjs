// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { readFileSync } from "node:fs";
import { armClick, pageGestureRequest } from "./mock_chrome.mjs";

const root = new URL("../", import.meta.url);
const html = await readFile(new URL("extension/options.html", root), "utf8");
const optionsSource = await readFile(new URL("extension/options.js", root), "utf8");
const backgroundSource = await readFile(new URL("extension/background.js", root), "utf8");

test("options HTML fixes the region, heading, and layout contract", () => {
  const ids = ["pageHeader", "welcomeView", "settingsView", "actionMessage", "pageFooter"];
  const positions = ids.map((id) => html.indexOf(`id="${id}"`));
  assert.ok(positions.every((position) => position >= 0));
  assert.deepEqual(positions, positions.slice().sort((a, b) => a - b));
  assert.match(html, /<title>solstone settings<\/title>/);
  assert.match(html, /<h1 id="pageTitle">[\s\S]*?solstone\s*<span class="desc" id="pageSubTitle">in your browser<\/span>[\s\S]*?<\/h1>/);
});

test("options consumes shared derivations and removes every retired selector", () => {
  assert.match(optionsSource, /Status\.derive\(state\)/);
  assert.match(optionsSource, /Status\.siteRow\(/);
  assert.match(optionsSource, /View\.addSite\(/);
  assert.match(optionsSource, /View\.grantSite\(/);
  assert.doesNotMatch(optionsSource, /cfg\.key|localRegistered|requestSiteAccess/);
  assert.doesNotMatch(optionsSource, /innerHTML/);
  assert.match(optionsSource, /document\.createElement\(/);
  assert.match(optionsSource, /\.textContent\s*=/);

  const retired = [
    "waitingDetails", "waitingSummary", "waitingBody", "connStatus",
    "pairStatus", "remoteState", "addStatus", "connForm", "pairForm",
    "hostname", "segmentSec", "saveBtn", "pairLink", "pairBtn", "unpairBtn", "flushBtn",
    "destinationChoice", "destinationLocal", "destinationRemote", "localDestination",
    "remoteDestination", "journalUrl", "registerBtn", "streamLabel", "journalLink",
  ];
  for (const id of retired) {
    assert.doesNotMatch(html, new RegExp(`id=["']${id}["']`), id);
    assert.doesNotMatch(optionsSource, new RegExp(`\\(["']${id}["']\\)`), id);
  }
});

test("options applies the shared accessibility and color layer", () => {
  assert.match(html, /id="actionMessage"[^>]+aria-live="polite"/);
  assert.match(html, /\[hidden\]\s*\{\s*display:\s*none !important;/);
  assert.match(html, /button:focus-visible,\s*input:focus-visible,\s*summary:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--focus\)[^}]*outline-offset:\s*2px/s);
  assert.doesNotMatch(html, /outline\s*:\s*(?:none|0)\b/i);
  assert.match(html, /--focus:\s*#B06A1A;/);
  assert.match(html, /--field-line:\s*#96896F;/);
  assert.match(html, /\.site button\s*\{[^}]*min-height:\s*24px[^}]*font-size:\s*12px/s);
  assert.match(html, /\.action-message\.ok\s*\{[^}]*color:\s*var\(--success-ink\)/);
  assert.match(html, /\.action-message\.bad\s*\{[^}]*color:\s*var\(--bad\)/);
  assert.match(html, /body\s*\{[^}]*box-sizing:\s*border-box[^}]*overflow-x:\s*hidden/s);
  assert.match(html, /\.site-host\s*\{[^}]*overflow-wrap:\s*anywhere/s);
});

test("options source fixes install opening and adds a site from the form", () => {
  assert.match(optionsSource, /View\.addSite\(/);
  assert.doesNotMatch(optionsSource, /disclose:|skipSheet|Disclosure\.addSite/);
  assert.match(backgroundSource, /onInstalled\.addListener\(\(details\) => \{[\s\S]*details\.reason === "install"[\s\S]*openOptionsPage\(\)[\s\S]*init\(\)/);
  assert.match(backgroundSource, /onStartup\.addListener\(init\)/);
});

class FakeNode {
  constructor(id = "") {
    this.id = id;
    this.children = [];
    this.className = "";
    this.hidden = false;
    this.disabled = false;
    this.checked = false;
    this.value = "";
    this.type = "";
    this.href = undefined;
    this.listeners = {};
    this.dataset = {};
    this.parentNode = null;
    this.focusCount = 0;
    this.textWrites = 0;
    this._textContent = "";
  }

  get textContent() {
    return this._textContent + this.children.map((child) => child.textContent).join("");
  }

  set textContent(value) {
    this._textContent = String(value);
    this.children = [];
    this.textWrites += 1;
  }

  addEventListener(type, listener) {
    this.listeners[type] = (type === "click" || type === "submit") ? armClick(listener) : listener;
  }

  append(...children) {
    for (const child of children) {
      this.children.push(child);
      if (child) child.parentNode = this;
    }
  }

  appendChild(child) {
    this.append(child);
    return child;
  }

  insertBefore(child, before) {
    const at = before ? this.children.indexOf(before) : -1;
    if (at >= 0) this.children.splice(at, 0, child);
    else this.children.push(child);
    if (child) child.parentNode = this;
  }

  replaceChildren(...children) {
    this.children = children;
  }

  removeAttribute(name) {
    if (name === "href") this.href = undefined;
  }

  focus() {
    this.focusCount += 1;
  }
}

function optionsState(overrides = {}) {
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
    consentVersion: 0,
    livePatterns: [],
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

test("the options binder drives Welcome mode, disclosure agreement, and Settings mode", async (t) => {
  const reconnects = [];
  const originalTimeout = globalThis.setTimeout;
  globalThis.setTimeout = fn => { reconnects.push(fn); return reconnects.length; };
  t.after(() => { globalThis.setTimeout = originalTimeout; });
  const windowListeners = {};
  globalThis.window = { addEventListener(type, listener) { windowListeners[type] = listener; } };
  let statusConnects = 0;
  const ids = [
    "pageHeader", "pageTitle", "pageSubTitle", "welcomeView", "settingsView",
    "warmCard", "warmKinship0", "warmKinship1", "warmKinship2", "stepsCard",
    "step1Section", "step1HeadingRow", "step1Check", "step1Heading", "step1Body", "step1Actions", "step1ActionBtn",
    "step2Section", "step2HeadingRow", "step2Check", "step2Heading", "step2Content", "step2DisclosureBody",
    "step2PendingText", "step2Actions", "agreeDisclosureBtn", "step2Completed", "step2ReReadDetails", "step2ReadAgain", "step2ReReadBody",
    "step3Section", "step3HeadingRow", "step3Check", "step3Heading", "step3Content", "step3Body", "welcomeOffersBlock", "welcomeSiteList",
    "statusCard", "statusLead", "statusStateChip", "statusReason", "sitesCard",
    "statusAlso", "statusActions", "sitesHeading", "siteInputLabel", "siteModeHelp",
    "modeSelected", "modeSelectedTitle", "modeSelectedCurrent", "modeSelectedBody", "modeSelectedBtn",
    "modeAll", "modeAllTitle", "modeAllCurrent", "modeAllBody", "modeAllBtn", "broadInSelectedNote",
    "accessPanel", "accessGranted", "accessMissing", "accessTitle", "accessBody", "accessSteps", "accessReturn",
    "accessAllow", "accessCheck", "accessChecking", "accessDenied", "accessDeniedTitle", "accessDeniedList", "accessDeniedHelp",
    "offersBlock", "listHeading", "regrant", "regrantLine", "regrantBtn", "exactOnly", "exactOnlyLine", "exactOnlyBtn", "siteInputError", "leftOutDetails", "leftOutSummary", "leftOutList", "keptNote", "siteDisclosureLeaveOut",
    "sitesMain", "addForm", "newHost", "addBtn", "siteList", "siteDisclosure",
    "siteDisclosureTitle", "siteDisclosureWhat", "siteDisclosureUnsent", "siteDisclosureDestination",
    "siteDisclosureDestinationDetail", "siteDisclosureChrome", "siteDisclosureConfirm",
    "siteDisclosureCancel", "pauseWithAppCard", "pauseWithApp", "disclosureCard",
    "disclosureDetails", "settingsDisclosureBody", "actionMessage", "pageFooter", "ver", "optionsMark",
  ];
  const nodes = Object.fromEntries(ids.map((id) => [id, new FakeNode(id)]));
  nodes.siteDisclosure.hidden = true;
  const documentListeners = {};
  globalThis.document = {
    getElementById: (id) => nodes[id],
    createElement: () => new FakeNode(),
    addEventListener(type, listener) {
      documentListeners[type] = listener;
    },
  };

  let liveState = null;
  let ackResponse = { ok: true, consentVersion: 1 };
  let statusListener = null;
  let disconnectListener = null;
  let heldStateCallback = null;
  let holdNextState = false;
  let reloadCount = 0;
  let dismissResponse = {ok:true};
  let permissionAnswer = true;
  let permissionRequests = 0;
  let lastPermissionRequest = null;
  let removeResponse = { ok: true };
  const sentMessages = [];
  const appTabs = [];
  globalThis.chrome = {
    runtime: {
      sendMessage(message, callback) {
        sentMessages.push(message);
        if (message.cmd === "getState") {
          if (holdNextState) {
            holdNextState = false;
            heldStateCallback = callback;
          } else callback(liveState);
        }
        else if (message.cmd === "setConfig") {
          liveState = optionsState(Object.assign({}, liveState, {
            showPageIndicator: message.showPageIndicator,
          }));
          callback({ ok: true });
        } else if (message.cmd === "acknowledgeDisclosure") {
          if (ackResponse.ok) {
            liveState = optionsState(Object.assign({}, liveState, {
              consentVersion: 2,
              consentAccepted: true,
            }));
          }
          callback(ackResponse);
        } else if (message.cmd === "addGrantedOrigin") {
          liveState = optionsState(Object.assign({}, liveState, {
            consentVersion: liveState.consentVersion || 2,
            consentAccepted: true,
            chosenOrigins: ["https://mail.google.com"],
            grantedOrigins: ["https://mail.google.com"],
          }));
          callback({ ok: true, origin: message.origin, registration: "ready" });
        } else if (message.cmd === "removeGrantedOrigin") {
          if (removeResponse.ok) {
            liveState = optionsState(Object.assign({}, liveState, {
              consentAccepted: true,
              chosenOrigins: [],
              grantedOrigins: [],
            }));
          }
          callback(removeResponse);
        } else if (message.cmd === "dismissTruncation") {
          callback(dismissResponse);
        } else callback({ ok: true });
      },
      connect() {
        statusConnects += 1;
        return {
          onMessage: { addListener(fn) { statusListener = fn; } },
          onDisconnect: { addListener(fn) { disconnectListener = fn; } },
        };
      },
      openOptionsPage() {},
      reload() { reloadCount++; },
    },
    tabs: { create: (info) => appTabs.push(info) },
    permissions: {
      request: pageGestureRequest(async (request) => {
        permissionRequests += 1;
        lastPermissionRequest = request;
        return permissionAnswer;
      }),
    },
  };

  await import(new URL("../extension/lib/copy.js", import.meta.url));
  await import(new URL("../extension/lib/hosts.js", import.meta.url));
  await import(new URL("../extension/lib/status.js", import.meta.url));
  await import(new URL("../extension/lib/failures.js", import.meta.url));
  await import(new URL("../extension/lib/disclosure.js", import.meta.url));
  await import(new URL("../extension/lib/popup_view.js", import.meta.url));
  await import(new URL("../extension/lib/actions.js", import.meta.url));
  await import(new URL("../extension/options.js", import.meta.url));
  await new Promise((resolve) => setImmediate(resolve));

  const C = globalThis.SolstoneCopy;
  function findId(node, id) {
    if (!node) return null;
    if (node.id === id) return node;
    for (const child of node.children || []) {
      const found = findId(child, id);
      if (found) return found;
    }
    return null;
  }
  nodes.accessAllow.parentNode = nodes.accessPanel;

  // 1. No status yet
  liveState = null;
  await globalThis.SolstoneOptions.refresh();
  assert.equal(nodes.step1Heading.textContent, "looking for the solstone app on this computer…");
  assert.equal(nodes.step1Check.hidden, true);

  liveState = optionsState({ connected: false, everConnected: false });
  statusListener({ type: "status", status: liveState });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(nodes.step1Heading.textContent, "can't reach the solstone app");
  nodes.step1ActionBtn.listeners.click();
  assert.equal(appTabs.length, 1);
  assert.equal(appTabs[0].url, "https://solstone.app");
  assert.equal(new URL(appTabs[0].url).search, "");

  // 2. Can't-reach status
  liveState = optionsState({ connected: false, everConnected: false });
  await globalThis.SolstoneOptions.refresh();
  assert.equal(nodes.step1Heading.textContent, "can't reach the solstone app");
  assert.equal(nodes.step1Body.textContent, globalThis.SolstoneStatus.welcomeHold(liveState).body);
  assert.equal(nodes.step1ActionBtn.hidden, false);
  assert.equal(nodes.step1ActionBtn.textContent, "get the solstone app");
  assert.equal(nodes.step1Check.hidden, true);

  // 2b. The app's helper answered (the app is installed), or this is Safari,
  // where the extension comes inside the app: open it, never download it again.
  for (const patch of [{ appAnswered: true }, { brand: "safari" }]) {
    liveState = optionsState(Object.assign({ connected: false, everConnected: false }, patch));
    await globalThis.SolstoneOptions.refresh();
    assert.equal(nodes.step1Heading.textContent, "can't reach the solstone app");
    assert.equal(nodes.step1Body.textContent, C.STEP1_OPEN_APP_BODY);
    assert.equal(nodes.step1ActionBtn.hidden, true);
    assert.equal(nodes.step2PendingText.textContent, C.STEP2_PENDING);
  }

  // 3. Live permitted host with consent unset and no sites (app-first)
  liveState = optionsState({ hostCapture: "permitted", consentVersion: 0, chosenOrigins: [] });
  await globalThis.SolstoneOptions.refresh();
  assert.equal(nodes.step1Heading.textContent, globalThis.SolstoneStatus.welcomeHold(liveState).heading);
  assert.equal(nodes.step1Check.hidden, false);
  assert.equal(nodes.welcomeView.dataset.rules, "chrome");
  assert.equal(nodes.agreeDisclosureBtn.hidden, true);
  assert.equal(nodes.step3Section.hidden, true);
  assert.equal(findId(nodes.welcomeView, "firstRunEverySite").dataset.act, "agree");
  assert.equal(findId(nodes.welcomeView, "firstRunOneSite").dataset.act, "agree");
  assert.equal(findId(nodes.welcomeView, "firstRunEverySite").hidden, false);
  assert.equal(findId(nodes.welcomeView, "firstRunOneSite").hidden, false);
  assert.equal(nodes.step2DisclosureBody.textContent, C.DISCLOSURE_BODY.replace(/^- /gm, "").replaceAll("\n", ""));

  // 4. hostCapture: "paused" with consent unset
  liveState = optionsState({ hostCapture: "paused", consentVersion: 0, chosenOrigins: [] });
  await globalThis.SolstoneOptions.refresh();
  assert.equal(nodes.step1Heading.textContent, globalThis.SolstoneStatus.welcomeHold(liveState).heading);
  assert.equal(nodes.step1Check.hidden, false);
  assert.equal(findId(nodes.welcomeView, "firstRunOneSite").dataset.act, "agree");

  // 5. acknowledgeDisclosure returning failure stays on the welcome page
  ackResponse = { ok: false, error: "storage_error" };
  await findId(nodes.welcomeView, "firstRunOneSite").listeners.click();
  assert.equal(nodes.welcomeView.hidden, false);
  assert.equal(nodes.settingsView.hidden, true);
  assert.equal(nodes.actionMessage.textContent, "couldn't save that. try again.");

  // 6. acknowledgeDisclosure returning { ok: true } reveals settings and lands on the first site
  ackResponse = { ok: true, consentVersion: 2 };
  const newHostFocus = nodes.newHost.focusCount;
  await findId(nodes.welcomeView, "firstRunOneSite").listeners.click();
  // Settings replaces the welcome page, and the owner lands on the first site.
  assert.equal(nodes.newHost.focusCount, newHostFocus + 1);
  assert.equal(nodes.siteModeHelp.hidden, false);
  assert.equal(nodes.siteModeHelp.textContent, C.addHelp(liveState.brand));
  assert.equal(nodes.welcomeView.hidden, true);
  assert.equal(nodes.settingsView.hidden, false);
  assert.equal(nodes.modeSelected.hidden, true);
  assert.equal(nodes.modeAll.hidden, true);
  assert.equal(nodes.step2ReReadBody.textContent, C.DISCLOSURE_BODY.replace(/^- /gm, "").replaceAll("\n", ""));

  const settle = async () => { for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve)); };
  const savedState = liveState;

  // Unfenced and broad: stop-sharing control exists for non-safari
  liveState = optionsState({ consentVersion: 1, brand: "chrome", broadGrant: true, fence: null, livePatterns: ["*://*/*"], excludedHosts: ["bank.example"] });
  await globalThis.SolstoneOptions.refresh();
  assert.equal(nodes.accessPanel.hidden, false);
  assert.equal(nodes.accessAllow.hidden, false);
  assert.equal(nodes.accessAllow.textContent, "stop sharing every site");
  assert.equal(nodes.leftOutDetails.hidden, false);

  liveState = optionsState({
    consentVersion: 1,
    brand: "chrome",
    broadGrant: true,
    fence: null,
    livePatterns: ["http://*/*", "*://*.bank.com/*"],
  });
  await globalThis.SolstoneOptions.refresh();
  assert.equal(nodes.accessAllow.hidden, false);
  assert.equal(nodes.accessAllow.textContent, "share every site");
  assert.match(nodes.siteList.textContent, /bank\.com/);
  const oneSchemeBefore = permissionRequests;
  const oneSchemeFrom = sentMessages.length;
  const oneSchemeClick = nodes.accessAllow.listeners.click();
  assert.equal(permissionRequests, oneSchemeBefore + 1);
  assert.deepEqual(lastPermissionRequest.origins, ["*://*/*"]);
  await oneSchemeClick;
  const oneSchemeSent = sentMessages.slice(oneSchemeFrom);
  assert.ok(oneSchemeSent.some((message) => message.cmd === "shareEverySite"));
  assert.equal(oneSchemeSent.some((message) => message.cmd === "stopSharingEverySite"), false);

  liveState = optionsState({
    consentVersion: 1,
    brand: "chrome",
    broadGrant: true,
    fence: null,
    livePatterns: ["http://*/*"],
  });
  await globalThis.SolstoneOptions.refresh();
  assert.equal(nodes.accessAllow.textContent, "share every site");
  assert.equal(nodes.siteList.children.length, 0);
  const schemeBefore = permissionRequests;
  const schemeFrom = sentMessages.length;
  const schemeClick = nodes.accessAllow.listeners.click();
  assert.equal(permissionRequests, schemeBefore + 1);
  assert.deepEqual(lastPermissionRequest.origins, ["*://*/*"]);
  await schemeClick;
  assert.ok(sentMessages.slice(schemeFrom).some((message) => message.cmd === "shareEverySite"));

  // Fenced: every-site access panel is hidden
  liveState = optionsState({ consentVersion: 1, brand: "chrome", fence: { entries: ["https://example.com"], exact: [], siteWide: [] }, livePatterns: ["*://*/*"] });
  await globalThis.SolstoneOptions.refresh();
  assert.equal(nodes.accessPanel.hidden, true);

  // Fenced, nothing beyond the fence: offer share every site. Not the upgrade question.
  function findClick(node, label) {
    if (!node) return null;
    if (node.listeners?.click && node._textContent === label) return node;
    for (const child of node.children || []) {
      const found = findClick(child, label);
      if (found) return found;
    }
    return null;
  }
  liveState = optionsState({
    consentVersion: 1,
    brand: "chrome",
    fence: { entries: ["https://example.com"], exact: [], siteWide: [], sawMore: false, answered: false },
    livePatterns: ["*://*.example.com/*"],
  });
  await globalThis.SolstoneOptions.refresh();
  assert.equal(nodes.accessPanel.hidden, false);
  assert.equal(nodes.accessAllow.hidden, false);
  assert.equal(nodes.accessAllow.textContent, "share every site");
  assert.equal(findClick(nodes.settingsView, "share them too"), null);
  let requestsBefore = permissionRequests;
  let fromShare = sentMessages.length;
  let shareClick = nodes.accessAllow.listeners.click();
  assert.equal(permissionRequests, requestsBefore + 1);
  assert.deepEqual(lastPermissionRequest.origins, ["*://*/*"]);
  assert.equal(sentMessages.slice(fromShare).some((message) => message.cmd === "intendAddOrigin"), false);
  await shareClick;
  assert.ok(sentMessages.slice(fromShare).some((message) => message.cmd === "shareEverySite"));

  liveState = optionsState({
    consentVersion: 1,
    brand: "safari",
    fence: { entries: ["https://example.com"], exact: [], siteWide: [], sawMore: false, answered: false },
    livePatterns: ["*://*.example.com/*"],
  });
  await globalThis.SolstoneOptions.refresh();
  // Safari can't be asked, so a held Safari owner gets Safari's own steps, not a button that does nothing.
  assert.equal(nodes.accessAllow.hidden, true);
  assert.equal(nodes.accessBody.textContent, "only the sites Safari already allows are on. to share every site:");
  assert.equal(nodes.accessSteps.hidden, false);
  assert.equal(nodes.accessCheck.hidden, false);

  liveState = optionsState({
    consentVersion: 1,
    brand: "chrome",
    fence: { entries: ["https://example.com"], exact: [], exactKnown: true, siteWide: [], declined: [], answered: false, sawMore: true },
    livePatterns: ["*://*/*"],
  });
  await globalThis.SolstoneOptions.refresh();
  const upgradeShare = findClick(nodes.settingsView, "share every site");
  assert.ok(upgradeShare);
  requestsBefore = permissionRequests;
  shareClick = upgradeShare.listeners.click();
  assert.equal(permissionRequests, requestsBefore + 1);
  assert.deepEqual(lastPermissionRequest.origins, ["*://*/*"]);
  await shareClick;

  liveState = optionsState({
    consentVersion: 1,
    brand: "chrome",
    fence: { entries: ["https://example.com"], exact: [], exactKnown: true, siteWide: [], declined: [], answered: true, sawMore: true },
    livePatterns: ["*://*.example.com/*"],
  });
  await globalThis.SolstoneOptions.refresh();
  const quietShare = findClick(nodes.settingsView, "share every site");
  assert.ok(quietShare);
  requestsBefore = permissionRequests;
  shareClick = quietShare.listeners.click();
  assert.equal(permissionRequests, requestsBefore + 1);
  assert.deepEqual(lastPermissionRequest.origins, ["*://*/*"]);
  await shareClick;
  // The quiet offer isn't filled: taking in more is never the visually preselected answer.
  const quietButtons = [];
  (function collect(node) {
    if (!node) return;
    if (node.id === "share-every-site") quietButtons.push(node);
    for (const child of node.children || []) collect(child);
  })(nodes.settingsView);
  assert.ok(quietButtons.length > 0);
  assert.equal(quietButtons.at(-1).className, "");

  // Safari can't be asked, so its quiet offer shows only while Safari allows every site.
  const keptFence = { entries: ["https://example.com"], exact: [], exactKnown: true, siteWide: [], declined: [], answered: true, sawMore: true };
  liveState = optionsState({ consentVersion: 1, brand: "safari", fence: keptFence, livePatterns: ["*://*.example.com/*"] });
  const quietOf = (st) => globalThis.SolstoneOptions.optionsModel(st).find((sec) => sec.kind === "upgrade-quiet");
  assert.equal(quietOf(liveState).action, null);
  liveState = optionsState({ consentVersion: 1, brand: "safari", fence: keptFence, livePatterns: ["*://*/*"] });
  assert.equal(quietOf(liveState).action.label, "share every site");
  liveState = optionsState({ consentVersion: 1, brand: "chrome", fence: keptFence, livePatterns: ["*://*.example.com/*"] });
  assert.equal(quietOf(liveState).action.label, "share every site");

  // Safari's own steps carry no title: an owner who chose one at a time reads them too.
  liveState = optionsState({
    consentVersion: 1,
    brand: "safari",
    fence: null,
    livePatterns: ["http://127.0.0.1/*"],
  });
  await globalThis.SolstoneOptions.refresh();
  assert.equal(nodes.accessTitle.textContent, "");
  assert.equal(nodes.accessBody.textContent, "only the sites Safari already allows are on. to share every site:");
  assert.equal(nodes.accessSteps.hidden, false);
  assert.equal(nodes.accessCheck.hidden, false);

  // Coming back to the page reconnects the status channel before trusting it
  const connectsBefore = statusConnects;
  let from = sentMessages.length;
  windowListeners.focus();
  await settle();
  assert.equal(statusConnects, connectsBefore + 1);
  assert.ok(sentMessages.slice(from).some((m) => m.cmd === "getState"));

  liveState = savedState;
  await globalThis.SolstoneOptions.refresh();

  // 7. Step 1 with custody.full, hostCapture: "permitted", and lossNotice shows full-store headline and not dropped reason
  liveState = optionsState({
    custody: { full: true, stale: false },
    hostCapture: "permitted",
    lossNotice: { seq: 1, count: 2, reason: "dropped" },
    consentVersion: 0,
  });
  await globalThis.SolstoneOptions.refresh();
  assert.equal(nodes.step1Heading.textContent, "no room for more right now");
  assert.equal(nodes.step1Check.hidden, true);

  // 8. Site added message: "{host} added." + "what you share there now goes into your journal." only when on-now
  liveState = optionsState({
    consentVersion: 1,
    chosenOrigins: [],
    grantedOrigins: [],
    hostCapture: "permitted",
    capturePermitted: true,
  });
  await globalThis.SolstoneOptions.refresh();
  nodes.newHost.value = "mail.google.com";
  let requestsBeforeConfirm = permissionRequests;
  let pending = nodes.addForm.listeners.submit({ preventDefault() {} });
  // The request starts inside the add click, before its first await.
  assert.equal(permissionRequests, requestsBeforeConfirm + 1);
  assert.deepEqual(lastPermissionRequest.origins, ["*://*.mail.google.com/*"]);
  await pending;
  assert.equal(nodes.actionMessage.textContent, "all mail.google.com sites and pages added.");
  assert.equal(sentMessages.some((message) => message.cmd === "intendAddOrigin"), false);

  // A pasted address adds its origin, keeping an http scheme and port.
  for (const [typed, origin, announced] of [
    ["https://example.com/some/page", "https://example.com", "all example.com sites and pages added."],
    ["http://localhost:5015/", "http://localhost:5015", "http://localhost:5015 added."],
    ["httpbin.org", "https://httpbin.org", "all httpbin.org sites and pages added."],
    ["https://www.example.org/login", "https://example.org", "all example.org sites and pages added."],
  ]) {
    nodes.newHost.value = typed;
    const beforeAdd = sentMessages.length;
    pending = nodes.addForm.listeners.submit({ preventDefault() {} });
    await pending;
    assert.equal(nodes.siteInputError.hidden, true, typed);
    assert.equal(sentMessages.slice(beforeAdd).some((message) => message.cmd === "intendAddOrigin"), false);
    assert.equal(sentMessages.findLast((message) => message.cmd === "addGrantedOrigin").origin, origin);
    assert.equal(nodes.actionMessage.textContent, announced);
  }

  // Typed with a path and no scheme, the address still adds its site.
  nodes.newHost.value = "github.com/solpbc/solstone";
  pending = nodes.addForm.listeners.submit({ preventDefault() {} });
  await pending;
  assert.equal(nodes.siteInputError.hidden, true);
  assert.equal(sentMessages.findLast((message) => message.cmd === "addGrantedOrigin").origin, "https://github.com");

  // A site already on the list is named as such, with no sheet and no prompt.
  liveState = optionsState({
    consentVersion: 1,
    fence: { entries: ["https://mail.google.com"], exact: [], siteWide: [] },
  });
  await globalThis.SolstoneOptions.refresh();
  let before = sentMessages.length;
  nodes.newHost.value = "https://mail.google.com/mail/u/0/";
  await nodes.addForm.listeners.submit({ preventDefault() {} });
  assert.equal(nodes.actionMessage.textContent, "mail.google.com is already on your list.");
  assert.equal(nodes.siteDisclosure.hidden, true);
  assert.equal(sentMessages.slice(before).some((message) => message.cmd === "intendAddOrigin"), false);

  // Adding while it can't happen (paused, app away) says so instead of nothing.
  liveState = optionsState({ consentVersion: 1, paused: true, addSiteEligible: false });
  await globalThis.SolstoneOptions.refresh();
  nodes.newHost.value = "example.org";
  await nodes.addForm.listeners.submit({ preventDefault() {} });
  assert.equal(nodes.actionMessage.textContent, C.ADD_NOT_NOW);
  assert.equal(nodes.newHost.value, "example.org");
  // ...and a paused settings page carries its own resume.
  const resume = nodes.statusActions.children.find((node) => node.textContent === "resume");
  assert.ok(resume, "settings offers resume while paused");
  before = sentMessages.length;
  await resume.listeners.click();
  assert.deepEqual(sentMessages.slice(before).find((message) => message.cmd === "setPaused"), { cmd: "setPaused", paused: false });

  // The browser's prompt declined: said, not silent.
  liveState = optionsState({ consentVersion: 1 });
  await globalThis.SolstoneOptions.refresh();
  permissionAnswer = false;
  nodes.newHost.value = "example.org";
  pending = nodes.addForm.listeners.submit({ preventDefault() {} });
  await pending;
  permissionAnswer = true;
  assert.equal(nodes.actionMessage.textContent, C.ADD_DENIED);

  // Removing a site says what happened to it.
  liveState = optionsState({ consentVersion: 1, livePatterns: ["*://*.mail.google.com/*"] });
  await globalThis.SolstoneOptions.refresh();
  // A removal that wasn't saved is never announced as done.
  removeResponse = { ok: false, saved: false, origin: "https://mail.google.com" };
  await nodes.siteList.children[0].children[1].children.at(-1).listeners.click();
  assert.equal(nodes.actionMessage.textContent, "couldn't save that. try again.");
  removeResponse = { ok: true, result: "left_out_instead" };
  await nodes.siteList.children[0].children[1].children.at(-1).listeners.click();
  assert.equal(nodes.actionMessage.textContent, C.leftOutAnnouncement("mail.google.com"));
  removeResponse = { ok: true };
  await nodes.siteList.children[0].children[1].children.at(-1).listeners.click();
  assert.equal(nodes.actionMessage.textContent, C.removedAnnouncement("mail.google.com"));

  // Putting a left-out site back from the left-out list names the site.
  for (const [excludedHosts, said] of [
    [["bank.com"], "all bank.com sites and pages are no longer left out."],
    [["localhost"], "localhost is no longer left out."],
  ]) {
    liveState = optionsState({ consentVersion: 1, broadGrant: true, fence: null, livePatterns: ["*://*/*"], excludedHosts });
    await globalThis.SolstoneOptions.refresh();
    assert.equal(nodes.leftOutDetails.hidden, false);
    await nodes.leftOutList.children[0].children[1].listeners.click();
    assert.equal(nodes.actionMessage.textContent, said);
  }

  // When on-now (extras activeSites has origin)
  liveState = optionsState({
    consentVersion: 1,
    livePatterns: ["*://*.mail.google.com/*"],
    hostCapture: "permitted",
    capturePermitted: true,
  });
  // Verify siteRow directly for on-now text format
  liveState.openTabs = {
    known: true,
    openOrigins: ["https://mail.google.com"],
    anyGrantedTabOpen: true,
  };
  const onNowRow = globalThis.SolstoneStatus.siteRow("https://mail.google.com", liveState);
  assert.equal(onNowRow.kind, "on-now");

  // Exact-origin rows keep same-host ports separate, and remove sends the row origin.
  const firstOrigin = "https://same.example";
  const secondOrigin = "https://same.example:8443";
  liveState = optionsState({
    consentVersion: 1,
    fence: { entries: [firstOrigin, secondOrigin], exact: [], siteWide: [] },
    livePatterns: [firstOrigin + "/*", secondOrigin + "/*"],
    openTabs: {known:true, openOrigins:[firstOrigin], anyGrantedTabOpen:true},
  });
  await globalThis.SolstoneOptions.refresh();
  assert.equal(nodes.siteList.children.length, 2);
  // Each row names its port, so the two entries never look the same.
  assert.equal(nodes.siteList.children[0].children[0].children[0].textContent, "same.example");
  assert.equal(nodes.siteList.children[1].children[0].children[0].textContent, "same.example:8443");
  await nodes.siteList.children[1].children[1].children.at(-1).listeners.click();
  assert.equal(sentMessages.findLast((message) => message.cmd === "removeGrantedOrigin").origin, secondOrigin);

  const httpOrigin = "http://same.example";
  liveState = optionsState({
    consentVersion: 1,
    fence: { entries: [httpOrigin], exact: [], siteWide: [] },
    livePatterns: [httpOrigin + "/*"],
    truncationByOrigin: {
      [httpOrigin]: { count: 2, newestId: "doc:2", dismissThroughId: "", pending: ["doc:1", "doc:2"] },
      "https://removed.example": { count: 1, newestId: "old:1", dismissThroughId: "", pending: ["old:1"] },
    },
  });
  await globalThis.SolstoneOptions.refresh();
  const dismissRow = nodes.siteList.children.find((node) => node.className === "site-issue");
  dismissResponse = {ok:false, error:"storage_error"};
  await dismissRow.children.at(-1).listeners.click();
  const dismissal = sentMessages.findLast((message) => message.cmd === "dismissTruncation");
  assert.equal(dismissal.origin, httpOrigin);
  assert.equal(dismissal.bound, "doc:2");
  assert.ok(nodes.actionMessage.textContent);
  assert.ok(nodes.siteList.children.includes(dismissRow), "failed dismissal keeps the visible notice");
  const removedNotice = nodes.siteList.children.filter((node) => node.className === "site-issue").at(-1);
  dismissResponse = {ok:true};
  await removedNotice.children.at(-1).listeners.click();
  assert.equal(sentMessages.findLast((message) => message.cmd === "dismissTruncation").origin, "https://removed.example");
  assert.equal(sentMessages.findLast((message) => message.cmd === "dismissTruncation").bound, "old:1");

  // Status messages use the posted envelope; same epoch tab updates apply, older capture state does not.
  const openState = optionsState({
    captureEpoch: 20, consentVersion: 1, livePatterns: [firstOrigin + "/*"],
    openTabs: {known:false, openOrigins:null, anyGrantedTabOpen:null},
  });
  statusListener({type:"status", status:openState});
  assert.equal(nodes.statusReason.textContent, "");
  statusListener({type:"status", status:Object.assign({}, openState, {
    openTabs:{known:true, openOrigins:[], anyGrantedTabOpen:false},
  })});
  assert.notEqual(nodes.statusReason.textContent, "");
  statusListener({type:"status", status:Object.assign({}, openState, {
    openTabs:{known:true, openOrigins:[firstOrigin], anyGrantedTabOpen:true},
  })});
  assert.equal(nodes.statusReason.textContent, "");

  const paused = optionsState({captureEpoch:21, consentVersion:1, paused:true, livePatterns: [firstOrigin + "/*"]});
  statusListener({type:"status", status:paused});
  await new Promise((resolve) => setImmediate(resolve));
  statusListener({type:"status", status:optionsState({captureEpoch:20, consentVersion:1, livePatterns: [firstOrigin + "/*"]})});
  assert.equal(nodes.statusStateChip.textContent, "paused in this browser");
  statusListener({type:"status", status:optionsState({captureEpoch:22, consentVersion:1, livePatterns: [firstOrigin + "/*"]})});
  assert.equal(nodes.statusStateChip.textContent, "on");

  holdNextState = true;
  const staleRefresh = globalThis.SolstoneOptions.refresh();
  statusListener({type:"status", status:optionsState({captureEpoch:24, consentVersion:1, paused:true, livePatterns: [firstOrigin + "/*"]})});
  heldStateCallback(optionsState({captureEpoch:22, consentVersion:1, livePatterns: [firstOrigin + "/*"]}));
  await staleRefresh;
  assert.equal(nodes.statusStateChip.textContent, "paused in this browser");

  liveState = optionsState({captureEpoch:24, consentVersion:1, paused:true, livePatterns: [firstOrigin + "/*"]});
  holdNextState = true;
  const beforeDisconnect = globalThis.SolstoneOptions.refresh();
  disconnectListener();
  reconnects.shift()?.();
  await new Promise((resolve) => setImmediate(resolve));
  heldStateCallback(optionsState({captureEpoch:22, livePatterns: [firstOrigin + "/*"]}));
  await beforeDisconnect;
  assert.equal(nodes.statusStateChip.textContent, "paused in this browser");
  liveState = optionsState({captureEpoch:25, consentVersion:1, livePatterns: [firstOrigin + "/*"]});
  await globalThis.SolstoneOptions.refresh();
  assert.equal(nodes.statusStateChip.textContent, "on");

  // Settings renders secondary headlines and dispatches the primary action.
  liveState = optionsState({
    captureEpoch: 26, consentVersion: 1, livePatterns: [firstOrigin + "/*"],
    behind:"extension", updateCheck:"update-available", custody:{full:false, stale:true},
  });
  await globalThis.SolstoneOptions.refresh();
  assert.ok(nodes.statusAlso.children.length > 0);
  assert.equal(nodes.statusActions.children.length, 1);
  await nodes.statusActions.children[0].listeners.click();
  assert.equal(reloadCount, 1);
  liveState.updateCheck = "no-update";
  await nodes.statusActions.children[0].listeners.click();
  assert.equal(reloadCount, 1);

  // 9. Nothing in settings or the welcome offers an icon on the pages owners see
  assert.doesNotMatch(html, /indicatorCard|ShowPageIndicator|showPageIndicator/);
});

test("settings reads the browser's grants after a failed add, through its own effects", () => {
  const source = readFileSync(new URL("../extension/options.js", import.meta.url), "utf8");
  assert.match(source, /getAllPermissions: \(\) => chrome\.permissions\.getAll\(\)/);
});

test("options: cleared notice precedes welcome, and the share sentences use accessCopy", async (t) => {
  const timers = [];
  const originalTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn) => { timers.push(fn); return timers.length; };
  t.after(() => { globalThis.setTimeout = originalTimeout; });

  class OptionNode {
    constructor(id = "") {
      this.id = id;
      this.children = [];
      this.className = "";
      this.hidden = false;
      this.disabled = false;
      this.checked = false;
      this.value = "";
      this.type = "";
      this.listeners = {};
      this.dataset = {};
      this.parentNode = null;
      this.tagName = "";
      this._textContent = "";
    }
    get textContent() {
      return this._textContent + this.children.map((child) => child.textContent).join("");
    }
    set textContent(value) {
      this._textContent = String(value);
      this.children = [];
    }
    get firstChild() { return this.children[0] || null; }
    addEventListener(type, listener) {
      this.listeners[type] = type === "click" ? armClick(listener) : listener;
    }
    append(...children) {
      for (const child of children) {
        child.parentNode = this;
        this.children.push(child);
      }
    }
    appendChild(child) { this.append(child); }
    replaceChildren(...children) {
      this.children = [];
      this.append(...children);
    }
    insertBefore(node, before) {
      this.children = this.children.filter((child) => child !== node);
      const at = before ? this.children.indexOf(before) : -1;
      this.children.splice(at < 0 ? this.children.length : at, 0, node);
      node.parentNode = this;
    }
    remove() {
      if (this.parentNode && Array.isArray(this.parentNode.children)) {
        this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
      }
      this.parentNode = null;
    }
    focus() {}
  }

  const ids = [
    "pageHeader", "pageTitle", "pageSubTitle", "welcomeView", "settingsView",
    "warmCard", "warmKinship0", "warmKinship1", "warmKinship2",
    "step1Heading", "step1Check", "step1Body", "step1ActionBtn",
    "step2Heading", "step2Check", "step2Content", "step2PendingText", "agreeDisclosureBtn", "step2Completed",
    "step2DisclosureBody", "step2ReReadBody", "step3Heading", "step3Content", "step3Check", "step3Body",
    "welcomeSiteList",
    "statusCard", "statusLead", "statusStateChip", "statusReason", "statusAlso", "statusActions",
    "sitesHeading", "siteInputLabel", "siteModeHelp", "modeSelected", "modeAll", "offersBlock",
    "broadInSelectedNote", "accessPanel", "accessGranted", "accessMissing", "accessTitle", "accessBody",
    "accessSteps", "accessReturn", "accessAllow", "accessCheck", "accessChecking",
    "accessDenied", "accessDeniedTitle", "accessDeniedList", "accessDeniedHelp",
    "listHeading", "regrant", "exactOnly", "keptNote", "leftOutDetails", "leftOutSummary", "leftOutList",
    "addForm", "newHost", "addBtn", "siteList", "pauseWithApp", "actionMessage",
    "ver", "optionsMark", "settingsDisclosureBody", "siteDisclosure", "pauseSwitch",
  ];
  const nodes = Object.fromEntries(ids.map((id) => [id, new OptionNode(id)]));
  const wrap = new OptionNode("wrap");
  wrap.children = [nodes.welcomeView, nodes.settingsView];
  nodes.welcomeView.parentNode = wrap;
  nodes.settingsView.parentNode = wrap;
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
    getElementById: (id) => nodes[id] || findId(wrap, id),
    createElement: (tag) => {
      const node = new OptionNode();
      node.tagName = tag;
      return node;
    },
    addEventListener() {},
  };
  globalThis.window = { addEventListener() {} };

  const sent = [];
  let liveState = null;
  let shareAnswer = { ok: true };
  let stopAnswer = { ok: true, result: "every_site_off_some" };
  let allowRequest = true;
  let permissionRequests = 0;
  globalThis.chrome = {
    runtime: {
      sendMessage(message, callback) {
        sent.push(message);
        if (message.cmd === "getState") callback(liveState);
        else if (message.cmd === "shareEverySite") callback(shareAnswer);
        else if (message.cmd === "stopSharingEverySite") callback(stopAnswer);
        else callback({ ok: true });
      },
      connect() {
        return { onMessage: { addListener() {} }, onDisconnect: { addListener() {} }, disconnect() {} };
      },
      openOptionsPage() {},
      reload() {},
    },
    tabs: { create() {} },
    permissions: {
      request: pageGestureRequest(async () => {
        permissionRequests += 1;
        return allowRequest;
      }),
    },
  };

  await import("fake-indexeddb/auto");
  const root = new URL("../", import.meta.url);
  for (const file of [
    "extension/lib/copy.js",
    "extension/lib/hosts.js",
    "extension/lib/status.js",
    "extension/lib/failures.js",
    "extension/lib/disclosure.js",
    "extension/lib/popup_view.js",
    "extension/lib/actions.js",
    "extension/native-browser/constants.js",
    "extension/native-browser/schemas.js",
    "extension/native-browser/schema-validator.js",
    "extension/native-browser/codec.js",
    "extension/lib/uuid.js",
    "extension/lib/db.js",
    "extension/lib/blocks.js",
    "extension/lib/segment.js",
    "extension/lib/gate.js",
    "extension/lib/left_out.js",
    "extension/lib/native_outbox.js",
    "extension/lib/native_port.js",
  ]) {
    await import(new URL(file, root));
  }
  const Copy = globalThis.SolstoneCopy;
  const Status = globalThis.SolstoneStatus;
  const controller = new globalThis.SolstoneNativePort({
    inst: "00000000-0000-0000-0000-000000000001",
    runtimeId: "fgfnkcefedeheoeamppkiiloncfekakf",
    connectNative: () => null,
  });
  controller.connectionGeneration = 1;
  controller.clearedNotice = true;
  controller.consentVersion = 0;
  liveState = controller.getStatus();

  await import(new URL("../extension/options.js?group6-notices", import.meta.url));
  await globalThis.SolstoneOptions.refresh();

  assert.equal(nodes.welcomeView.hidden, false);
  assert.equal(wrap.children[0].id, "welcomeClearedNotice");
  assert.equal(wrap.children[1], nodes.welcomeView);
  assert.equal(wrap.children[0].children[0].textContent, Copy.clearedStorageNotice());
  assert.equal(wrap.children[0].children[1].textContent, "resume");
  assert.equal(nodes.step1Heading.textContent, Status.welcomeHold(liveState).heading);
  assert.equal(nodes.step2Heading.textContent, "what the solstone extension takes in");
  assert.equal(nodes.step3Heading.textContent, "choose your first site");
  assert.equal(nodes.warmKinship0.textContent, Copy.WARM_CARD[0]);
  assert.equal(nodes.warmKinship1.textContent, Copy.WARM_CARD[1]);
  assert.equal(nodes.warmKinship2.textContent, Copy.WARM_CARD[2]);
  assert.equal(nodes.step3Body.textContent, Copy.step3Body(liveState.brand));
  const beforeResume = sent.length;
  await wrap.children[0].children[1].listeners.click();
  assert.deepEqual(sent.slice(beforeResume).find((message) => message.cmd === "setPaused"), { cmd: "setPaused", paused: false });

  function section(kind) {
    const walk = (node, found = []) => {
      if (!node) return found;
      if (node.dataset && node.dataset.kind === kind) found.push(node);
      for (const child of node.children || []) walk(child, found);
      return found;
    };
    return walk(nodes.settingsView)[0];
  }
  function buttonLabeled(rootNode, label) {
    const walk = (node) => {
      if (!node) return null;
      if (node.listeners?.click && node._textContent === label) return node;
      for (const child of node.children || []) {
        const found = walk(child);
        if (found) return found;
      }
      return null;
    };
    return walk(rootNode);
  }

  controller.clearedNotice = false;
  controller.consentVersion = 1;
  controller.hostCapture = "permitted";
  controller.capturePermitted = true;
  controller.lease = { token: "t", freshnessMs: 60000, receivedAt: Date.now(), standing: true };
  controller.paused = false;
  controller.fence = null;
  controller.broadGrant = true;
  controller.livePatterns = ["*://*/*"];
  controller.brand = "chrome";
  liveState = controller.getStatus();
  await globalThis.SolstoneOptions.refresh();
  assert.equal(nodes.welcomeView.hidden, true);
  assert.equal(wrap.children.find((child) => child.id === "welcomeClearedNotice"), undefined);
  assert.equal(nodes.accessBody.textContent, Copy.everySiteOnLine(liveState.brand));

  controller.brand = "safari";
  liveState = controller.getStatus();
  await globalThis.SolstoneOptions.refresh();
  assert.ok(nodes.accessBody.textContent.includes(Copy.everySiteOnLine(liveState.brand)));
  assert.ok(nodes.accessBody.textContent.includes(Copy.safariStopLine()));

  controller.brand = "chrome";
  controller.broadGrant = false;
  controller.fence = {
    entries: ["https://example.com"], exact: [], siteWide: [], sawMore: false, answered: false,
  };
  controller.livePatterns = ["*://*.example.com/*"];
  liveState = controller.getStatus();
  await globalThis.SolstoneOptions.refresh();
  const requestsBefore = permissionRequests;
  await nodes.accessAllow.listeners.click();
  assert.equal(permissionRequests, requestsBefore + 1);
  assert.equal(nodes.actionMessage.textContent, Copy.accessCopy(liveState.brand).nowAllowed);

  controller.fence = {
    entries: ["https://example.com"], exact: [], exactKnown: true, siteWide: [], sawMore: true, answered: false,
  };
  controller.livePatterns = ["*://*/*"];
  controller.broadGrant = true;
  liveState = controller.getStatus();
  await globalThis.SolstoneOptions.refresh();
  const upgrade = section("upgrade-question");
  assert.ok(upgrade);
  assert.equal(upgrade.children.some((child) => child.tagName === "h2"), false);
  assert.equal(upgrade.children[0].textContent, Copy.fenceQuestion(liveState.brand, "every").body);
  await buttonLabeled(upgrade, "share every site").listeners.click();
  assert.equal(nodes.actionMessage.textContent, Copy.accessCopy(liveState.brand).nowAllowed);

  controller.fence = {
    entries: ["https://example.com"], exact: [], exactKnown: true, siteWide: [], sawMore: true, answered: true,
  };
  controller.livePatterns = ["*://*.example.com/*"];
  controller.broadGrant = false;
  liveState = controller.getStatus();
  await globalThis.SolstoneOptions.refresh();
  const quiet = section("upgrade-quiet");
  assert.ok(quiet);
  await buttonLabeled(quiet, "share every site").listeners.click();
  assert.equal(nodes.actionMessage.textContent, Copy.accessCopy(liveState.brand).nowAllowed);

  allowRequest = false;
  controller.fence = {
    entries: ["https://example.com"], exact: [], siteWide: [], sawMore: false, answered: false,
  };
  controller.livePatterns = ["*://*.example.com/*"];
  liveState = controller.getStatus();
  await globalThis.SolstoneOptions.refresh();
  const declinedFrom = sent.length;
  await nodes.accessAllow.listeners.click();
  assert.equal(nodes.actionMessage.textContent, Copy.accessCopy(liveState.brand).declined);
  assert.equal(sent.slice(declinedFrom).some((message) => message.cmd === "shareEverySite"), false);
  allowRequest = true;

  controller.brand = "safari";
  liveState = controller.getStatus();
  await globalThis.SolstoneOptions.refresh();
  const safariRequests = permissionRequests;
  await nodes.accessAllow.listeners.click();
  assert.equal(permissionRequests, safariRequests);
  assert.equal(nodes.actionMessage.textContent, Copy.accessCopy("safari").nowAllowed);
  controller.brand = "chrome";

  shareAnswer = { ok: false, result: "share_held" };
  liveState = controller.getStatus();
  await globalThis.SolstoneOptions.refresh();
  await nodes.accessAllow.listeners.click();
  assert.notEqual(nodes.actionMessage.textContent, Copy.accessCopy(liveState.brand).nowAllowed);
  assert.equal(nodes.actionMessage.textContent.includes("something went wrong"), false);
  assert.equal(nodes.actionMessage.textContent.includes("couldn't save that"), false);
  shareAnswer = { ok: true };

  controller.fence = null;
  controller.broadGrant = true;
  controller.livePatterns = ["*://*/*"];
  liveState = controller.getStatus();
  await globalThis.SolstoneOptions.refresh();
  await nodes.accessAllow.listeners.click();
  const stop = section("stop-some");
  assert.ok(stop);
  assert.equal(stop.children[0].textContent, Copy.stopResultCopy(liveState.brand, "every_site_off_some"));
  await globalThis.SolstoneOptions.refresh();
  assert.equal(section("stop-some"), undefined);

  const stained = controller.getStatus();
  stained.browserDeniedOrigins = ["https://denied.example"];
  liveState = stained;
  await globalThis.SolstoneOptions.refresh();
  assert.equal(nodes.accessDenied.hidden, true);
  assert.equal(nodes.accessDeniedList.children.length, 0);

  const unchecked = controller.getStatus();
  unchecked.permissionsUnavailable = true;
  liveState = unchecked;
  await globalThis.SolstoneOptions.refresh();
  assert.equal(nodes.siteModeHelp.textContent, Copy.actionFailure("permissions_unavailable", unchecked.brand));

  assert.doesNotMatch(optionsSource, /adoptedAnnouncement|dismissAdoptionNotices|browserDeniedOrigins|h2\.textContent = sec\.title|FENCE_QUESTION|FENCE_QUIET_LINE|CLEARED_STORAGE_NOTICE/);
  assert.doesNotMatch(optionsSource, /stays paused/);
});
