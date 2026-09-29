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
    return this._textContent;
  }

  set textContent(value) {
    this._textContent = String(value);
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
  const ids = [
    "pageHeader", "pageTitle", "pageSubTitle", "welcomeView", "settingsView",
    "warmCard", "warmKinship0", "warmKinship1", "warmKinship2", "stepsCard",
    "step1Section", "step1HeadingRow", "step1Check", "step1Heading", "step1Body", "step1Actions", "step1ActionBtn",
    "step2Section", "step2HeadingRow", "step2Check", "step2Heading", "step2Content", "step2DisclosureBody",
    "step2PendingText", "step2Actions", "agreeDisclosureBtn", "step2Completed", "step2ReReadDetails", "step2ReadAgain", "step2ReReadBody",
    "step3Section", "step3HeadingRow", "step3Check", "step3Heading", "step3Content", "step3Body", "welcomeShowPageIndicator", "welcomeSiteList",
    "statusCard", "statusLead", "statusStateChip", "statusReason", "sitesCard",
    "statusAlso", "statusActions",
    "sitesMain", "addForm", "newHost", "addBtn", "siteList", "siteDisclosure",
    "siteDisclosureTitle", "siteDisclosureWhat", "siteDisclosureUnsent", "siteDisclosureDestination",
    "siteDisclosureDestinationDetail", "siteDisclosureChrome", "siteDisclosureConfirm",
    "siteDisclosureCancel", "indicatorCard", "showPageIndicator", "disclosureCard",
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
          liveState = optionsState(Object.assign({}, liveState, {
            consentVersion: 1,
            chosenOrigins: [],
            grantedOrigins: [],
          }));
          callback({ ok: true });
        } else if (message.cmd === "dismissTruncation") {
          callback(dismissResponse);
        } else callback({ ok: true });
      },
      connect() {
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
      request: async () => true,
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

  // 3. Live permitted host with consent unset and no sites (app-first)
  liveState = optionsState({ hostCapture: "permitted", consentVersion: 0, chosenOrigins: [] });
  await globalThis.SolstoneOptions.refresh();
  assert.equal(nodes.step1Heading.textContent, globalThis.SolstoneStatus.welcomeHold(liveState).heading);
  assert.equal(nodes.step1Check.hidden, false);
  assert.equal(nodes.agreeDisclosureBtn.hidden, false);
  assert.equal(nodes.agreeDisclosureBtn.textContent, "agree and go on");
  assert.equal(nodes.step2DisclosureBody.textContent, C.DISCLOSURE_BODY);

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

  // 6. acknowledgeDisclosure returning { ok: true } reveals read it again with DISCLOSURE_BODY
  ackResponse = { ok: true, consentVersion: 1 };
  await nodes.agreeDisclosureBtn.listeners.click();
  assert.equal(nodes.step2Completed.hidden, false);
  assert.equal(nodes.step2ReReadBody.textContent, C.DISCLOSURE_BODY);

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
  assert.equal(nodes.actionMessage.textContent, "mail.google.com added.");

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
  assert.equal(nodes.siteList.children[0].children[0].children[0].textContent, "same.example");
  assert.equal(nodes.siteList.children[1].children[0].children[0].textContent, "same.example");
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
  await nodes.siteList.children[0].children[1].children[0].listeners.click();
  assert.equal(sentMessages.findLast((message) => message.cmd === "intendAddOrigin").origin, httpOrigin);
  assert.equal(sentMessages.findLast((message) => message.cmd === "addGrantedOrigin").origin, httpOrigin);
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
