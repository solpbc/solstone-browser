// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

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

test("options source fixes install opening and disclosure routing", () => {
  assert.match(optionsSource, /Disclosure\.addSite\(host, state\)/);
  assert.match(optionsSource, /disclose: presentDisclosure/);
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
    this.listeners[type] = listener;
  }

  append(...children) {
    this.children.push(...children);
  }

  appendChild(child) {
    this.children.push(child);
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
    consentVersion: 0,
    chosenOrigins: [],
    grantedOrigins: [],
    inactiveOrigins: [],
    showPageIndicator: false,
    updateCheck: "no-update",
    capturePermitted: true,
    addSiteEligible: true,
  }, overrides);
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
    "step3Section", "step3HeadingRow", "step3Check", "step3Heading", "step3Content", "step3Body", "welcomeShowPageIndicator", "welcomeOffersBlock", "welcomeSiteList",
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
    "siteDisclosureCancel", "indicatorCard", "showPageIndicator", "pauseWithAppCard", "pauseWithApp", "disclosureCard",
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
              consentVersion: 1,
            }));
          }
          callback(ackResponse);
        } else if (message.cmd === "addGrantedOrigin") {
          liveState = optionsState(Object.assign({}, liveState, {
            consentVersion: 1,
            chosenOrigins: ["https://mail.google.com"],
            grantedOrigins: ["https://mail.google.com"],
          }));
          callback({ ok: true, origin: message.origin, registration: "ready" });
        } else if (message.cmd === "removeGrantedOrigin") {
          if (removeResponse.ok) {
            liveState = optionsState(Object.assign({}, liveState, {
              consentVersion: 1,
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
      request: async () => permissionAnswer,
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
  assert.equal(nodes.agreeDisclosureBtn.hidden, false);
  assert.equal(nodes.agreeDisclosureBtn.textContent, "agree and go on");
  assert.equal(nodes.step2DisclosureBody.textContent, C.DISCLOSURE_BODY.replace(/^- /gm, "").replaceAll("\n", ""));

  // 4. hostCapture: "paused" with consent unset
  liveState = optionsState({ hostCapture: "paused", consentVersion: 0, chosenOrigins: [] });
  await globalThis.SolstoneOptions.refresh();
  assert.equal(nodes.step1Heading.textContent, globalThis.SolstoneStatus.welcomeHold(liveState).heading);
  assert.equal(nodes.step1Check.hidden, false);
  assert.equal(nodes.agreeDisclosureBtn.hidden, false);

  // 5. acknowledgeDisclosure returning failure does not reveal read it again
  ackResponse = { ok: false, error: "storage_error" };
  await nodes.agreeDisclosureBtn.listeners.click();
  assert.equal(nodes.step2Completed.hidden, true);
  assert.equal(nodes.agreeDisclosureBtn.hidden, false);
  // The failure shows on the welcome page, where the owner pressed the button.
  assert.equal(nodes.step2PendingText.hidden, false);
  assert.equal(nodes.step2PendingText.textContent, "couldn't save that. try again.");

  // 6. acknowledgeDisclosure returning { ok: true } reveals read it again with DISCLOSURE_BODY
  ackResponse = { ok: true, consentVersion: 1 };
  const newHostFocus = nodes.newHost.focusCount;
  await nodes.agreeDisclosureBtn.listeners.click();
  // Settings replaces the welcome page, and the owner lands on the first site.
  assert.equal(nodes.newHost.focusCount, newHostFocus + 1);
  assert.equal(nodes.siteModeHelp.hidden, false);
  assert.equal(nodes.siteModeHelp.textContent, C.addHelp(liveState.brand));
  assert.equal(nodes.welcomeView.hidden, true);
  assert.equal(nodes.settingsView.hidden, false);
  assert.match(nodes.modeSelected.className, /\bcurrent\b/);
  assert.equal(nodes.modeSelectedBtn.hidden, true);
  assert.equal(nodes.modeAllBtn.hidden, false);
  assert.equal(nodes.step2ReReadBody.textContent, C.DISCLOSURE_BODY.replace(/^- /gm, "").replaceAll("\n", ""));

  // 6b. All sites has its own agreement. Opening and cancelling it changes nothing.
  const settle = async () => { for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve)); };
  const scopeCommands = (from) => sentMessages.slice(from).filter((m) => ["setSiteMode", "intendAllSites"].includes(m.cmd));
  const savedState = liveState;
  let from = sentMessages.length;
  const cancelled = nodes.modeAllBtn.listeners.click();
  await settle();
  assert.equal(nodes.siteDisclosure.hidden, false);
  assert.equal(nodes.sitesMain.hidden, true);
  assert.ok(nodes.siteDisclosureTitle.focusCount > 0, "the agreement is read from its title");
  assert.deepEqual(scopeCommands(from), []);
  const returnFocus = nodes.modeAllBtn.focusCount;
  nodes.siteDisclosureCancel.listeners.click();
  await cancelled;
  assert.equal(nodes.siteDisclosure.hidden, true);
  assert.equal(nodes.sitesMain.hidden, false);
  assert.equal(nodes.modeAllBtn.focusCount, returnFocus + 1);
  assert.deepEqual(scopeCommands(from), []);

  // Agreeing asks the browser in the same gesture, then records the agreement.
  from = sentMessages.length;
  const agreed = nodes.modeAllBtn.listeners.click();
  await settle();
  nodes.siteDisclosureConfirm.listeners.click();
  await agreed;
  await settle();
  const scope = scopeCommands(from);
  assert.deepEqual(scope.map((m) => m.cmd), ["intendAllSites", "setSiteMode"]);
  assert.equal(scope[1].mode, "all");
  assert.equal(scope[1].agreed, true);

  // Safari answers only in its own settings: steps and a re-check, no prompt button.
  liveState = optionsState({ consentVersion: 1, brand: "safari", siteMode: "all", allSitesConsent: 1, broadGranted: false,
    chosenOrigins: ["https://mail.google.com"], excludedHosts: ["bank.example"] });
  await globalThis.SolstoneOptions.refresh();
  assert.equal(nodes.accessPanel.hidden, false);
  assert.equal(nodes.accessMissing.hidden, false);
  assert.equal(nodes.accessAllow.hidden, true);
  assert.equal(nodes.accessCheck.hidden, false);
  assert.equal(nodes.accessSteps.children.length, 3);
  assert.equal(nodes.modeAllBtn.hidden, true);
  assert.equal(nodes.modeSelectedBtn.hidden, false);
  assert.equal(nodes.siteList.children.length, 1);
  assert.equal(nodes.keptNote.hidden, false);
  // Access granted in Safari's settings is picked up on the re-check and announced.
  liveState = optionsState(Object.assign({}, liveState, { broadGranted: true, allSitesRegistration: "ready" }));
  from = sentMessages.length;
  await nodes.accessCheck.listeners.click();
  assert.ok(sentMessages.slice(from).some((m) => m.cmd === "refreshSiteAccess"));
  assert.equal(nodes.accessMissing.hidden, true);
  assert.equal(nodes.accessGranted.hidden, false);
  assert.match(nodes.actionMessage.className, /\bok\b/);

  // Chrome without the broad grant offers the browser's prompt directly.
  liveState = optionsState(Object.assign({}, liveState, { brand: "chrome", broadGranted: false }));
  await globalThis.SolstoneOptions.refresh();
  assert.equal(nodes.accessAllow.hidden, false);
  assert.equal(nodes.accessCheck.hidden, true);

  // Switching back is immediate and names the browser re-grant it needs.
  liveState = optionsState({ consentVersion: 1, siteMode: "selected", allSitesConsent: 1,
    chosenOrigins: ["https://mail.google.com", "https://app.slack.com"], grantedOrigins: [],
    inactiveOrigins: ["https://mail.google.com", "https://app.slack.com"], excludedHosts: ["bank.example"] });
  from = sentMessages.length;
  await nodes.modeSelectedBtn.listeners.click();
  const back = sentMessages.slice(from).find((m) => m.cmd === "setSiteMode");
  assert.equal(back.mode, "selected");
  assert.equal(back.agreed, undefined);
  assert.equal(nodes.regrant.hidden, false);
  assert.ok(nodes.sitesHeading.focusCount > 0);
  // Coming back to the page reconnects the status channel before trusting it,
  // because Safari can restart the background without closing the old one.
  const connectsBefore = statusConnects;
  from = sentMessages.length;
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
  let pending = nodes.addForm.listeners.submit({ preventDefault() {} });
  nodes.siteDisclosureConfirm.listeners.click();
  await pending;
  assert.equal(nodes.actionMessage.textContent, "all mail.google.com sites and pages added.");
  // The sheet says the whole site before anything is asked of the browser.
  assert.equal(globalThis.SolstoneCopy.sheetCopy("mail.google.com", "chrome").title, "add all mail.google.com sites and pages?");

  // A pasted address adds its origin, keeping an http scheme and port.
  for (const [typed, origin, announced] of [
    ["https://example.com/some/page", "https://example.com", "all example.com sites and pages added."],
    ["http://localhost:5015/", "http://localhost:5015", "http://localhost:5015 added."],
    ["httpbin.org", "https://httpbin.org", "all httpbin.org sites and pages added."],
    ["https://www.example.org/login", "https://example.org", "all example.org sites and pages added."],
  ]) {
    nodes.newHost.value = typed;
    pending = nodes.addForm.listeners.submit({ preventDefault() {} });
    nodes.siteDisclosureConfirm.listeners.click();
    await pending;
    assert.equal(nodes.siteInputError.hidden, true, typed);
    assert.equal(sentMessages.findLast((message) => message.cmd === "intendAddOrigin").origin, origin);
    assert.equal(sentMessages.findLast((message) => message.cmd === "addGrantedOrigin").origin, origin);
    assert.equal(nodes.actionMessage.textContent, announced);
  }

  // Typed with a path and no scheme, the address still adds its site.
  nodes.newHost.value = "github.com/solpbc/solstone";
  pending = nodes.addForm.listeners.submit({ preventDefault() {} });
  nodes.siteDisclosureConfirm.listeners.click();
  await pending;
  assert.equal(nodes.siteInputError.hidden, true);
  assert.equal(sentMessages.findLast((message) => message.cmd === "addGrantedOrigin").origin, "https://github.com");

  // A site already on the list is named as such, with no sheet and no prompt.
  liveState = optionsState({ consentVersion: 1, chosenOrigins: ["https://mail.google.com"], grantedOrigins: ["https://mail.google.com"] });
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
  nodes.siteDisclosureConfirm.listeners.click();
  await pending;
  permissionAnswer = true;
  assert.equal(nodes.actionMessage.textContent, C.ADD_DENIED);

  // Removing a site says what happened to it.
  liveState = optionsState({ consentVersion: 1, chosenOrigins: ["https://mail.google.com"], grantedOrigins: ["https://mail.google.com"] });
  await globalThis.SolstoneOptions.refresh();
  // A removal that wasn't saved is never announced as done.
  removeResponse = { ok: false, saved: false, origin: "https://mail.google.com" };
  await nodes.siteList.children[0].children[1].children.at(-1).listeners.click();
  assert.equal(nodes.actionMessage.textContent, "couldn't save that. try again.");
  removeResponse = { ok: true };
  await nodes.siteList.children[0].children[1].children.at(-1).listeners.click();
  assert.equal(nodes.actionMessage.textContent, C.removedAnnouncement("mail.google.com"));

  // Leaving out and putting back name the whole site, except a local name.
  for (const [excludedHosts, said] of [
    [["bank.com"], "all bank.com sites and pages are included again."],
    [["localhost"], "localhost included again."],
  ]) {
    liveState = optionsState({ consentVersion: 1, siteMode: "all", allSitesConsent: 1, broadGranted: true, excludedHosts });
    await globalThis.SolstoneOptions.refresh();
    await nodes.siteList.children[0].children[1].children.at(-1).listeners.click();
    assert.equal(nodes.actionMessage.textContent, said);
  }
  liveState = optionsState({ consentVersion: 1, siteMode: "all", allSitesConsent: 1, broadGranted: true, excludedHosts: [] });
  await globalThis.SolstoneOptions.refresh();
  assert.equal(nodes.siteModeHelp.textContent, C.LEAVE_OUT_HELP);
  nodes.newHost.value = "*.bank.com";
  await nodes.addForm.listeners.submit({ preventDefault() {} });
  assert.deepEqual(sentMessages.findLast((message) => message.cmd === "setLeftOut"), { cmd: "setLeftOut", host: "bank.com", out: true });
  assert.equal(nodes.actionMessage.textContent, "all bank.com sites and pages left out. other sites shown inside them are still shared.");

  // A site added before sites covered their subdomains is offered the rest.
  liveState = optionsState({ consentVersion: 1, chosenOrigins: ["https://old.example"], grantedOrigins: ["https://old.example"],
    exactOnlyOrigins: ["https://old.example"] });
  await globalThis.SolstoneOptions.refresh();
  assert.equal(nodes.exactOnly.hidden, false);
  assert.equal(nodes.exactOnlyLine.textContent, "old.example covers only that address. to include all old.example sites and pages, allow them in Chrome.");
  assert.equal(nodes.exactOnlyBtn.textContent, "allow all old.example sites");
  before = sentMessages.length;
  await nodes.exactOnlyBtn.listeners.click();
  assert.ok(sentMessages.slice(before).some((message) => message.cmd === "refreshSiteAccess"));

  // When on-now (extras activeSites has origin)
  liveState = optionsState({
    consentVersion: 1,
    chosenOrigins: ["https://mail.google.com"],
    grantedOrigins: ["https://mail.google.com"],
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
    chosenOrigins: [firstOrigin, secondOrigin],
    grantedOrigins: [firstOrigin, secondOrigin],
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
    consentVersion:1,
    chosenOrigins:[httpOrigin],
    grantedOrigins:[],
    inactiveOrigins:[httpOrigin],
    truncationByOrigin:{
      [httpOrigin]:{count:2, newestId:"doc:2", dismissThroughId:"", pending:["doc:1","doc:2"]},
      "https://removed.example":{count:1, newestId:"old:1", dismissThroughId:"", pending:["old:1"]},
    },
  });
  await globalThis.SolstoneOptions.refresh();
  // "allow again" gives the browser's access back to an already-chosen site
  // directly, so it works even while adding new sites can't.
  assert.equal(nodes.siteList.children[0].children[0].children[0].textContent, "http://same.example");
  before = sentMessages.length;
  await nodes.siteList.children[0].children[1].children[0].listeners.click();
  assert.ok(sentMessages.slice(before).some((message) => message.cmd === "refreshSiteAccess"));
  assert.equal(sentMessages.slice(before).some((message) => message.cmd === "intendAddOrigin"), false);
  liveState = optionsState({
    consentVersion:1,
    chosenOrigins:[httpOrigin],
    grantedOrigins:[],
    inactiveOrigins:[httpOrigin],
    truncationByOrigin:{
      [httpOrigin]:{count:2, newestId:"doc:2", dismissThroughId:"", pending:["doc:1","doc:2"]},
      "https://removed.example":{count:1, newestId:"old:1", dismissThroughId:"", pending:["old:1"]},
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
    captureEpoch: 20, consentVersion: 1, chosenOrigins: [firstOrigin], grantedOrigins: [firstOrigin],
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

  const paused = optionsState({captureEpoch:21, consentVersion:1, paused:true, chosenOrigins:[firstOrigin], grantedOrigins:[firstOrigin]});
  statusListener({type:"status", status:paused});
  await new Promise((resolve) => setImmediate(resolve));
  statusListener({type:"status", status:optionsState({captureEpoch:20, consentVersion:1, chosenOrigins:[firstOrigin], grantedOrigins:[firstOrigin]})});
  assert.equal(nodes.statusStateChip.textContent, "paused in this browser");
  statusListener({type:"status", status:optionsState({captureEpoch:22, consentVersion:1, chosenOrigins:[firstOrigin], grantedOrigins:[firstOrigin]})});
  assert.equal(nodes.statusStateChip.textContent, "on");

  holdNextState = true;
  const staleRefresh = globalThis.SolstoneOptions.refresh();
  statusListener({type:"status", status:optionsState({captureEpoch:24, consentVersion:1, paused:true, chosenOrigins:[firstOrigin], grantedOrigins:[firstOrigin]})});
  heldStateCallback(optionsState({captureEpoch:22, consentVersion:1, chosenOrigins:[firstOrigin], grantedOrigins:[firstOrigin]}));
  await staleRefresh;
  assert.equal(nodes.statusStateChip.textContent, "paused in this browser");

  liveState = optionsState({captureEpoch:24, consentVersion:1, paused:true, chosenOrigins:[firstOrigin], grantedOrigins:[firstOrigin]});
  holdNextState = true;
  const beforeDisconnect = globalThis.SolstoneOptions.refresh();
  disconnectListener();
  reconnects.shift()?.();
  await new Promise((resolve) => setImmediate(resolve));
  heldStateCallback(optionsState({captureEpoch:22, chosenOrigins:[firstOrigin], grantedOrigins:[firstOrigin]}));
  await beforeDisconnect;
  assert.equal(nodes.statusStateChip.textContent, "paused in this browser");
  liveState = optionsState({captureEpoch:25, consentVersion:1, chosenOrigins:[firstOrigin], grantedOrigins:[firstOrigin]});
  await globalThis.SolstoneOptions.refresh();
  assert.equal(nodes.statusStateChip.textContent, "on");

  // Settings renders secondary headlines and dispatches the primary action.
  liveState = optionsState({
    captureEpoch: 26, consentVersion: 1, chosenOrigins:[firstOrigin], grantedOrigins:[firstOrigin],
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

  // 9. Checkbox marker label
  assert.match(html, /show a small solstone mark on pages you've added/);
});
