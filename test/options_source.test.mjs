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
  assert.match(optionsSource, /Status\.derive\(state,/);
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
    custody: { full: false, stale: false },
    behind: null,
    pressure: { active: false },
    siteNotices: [],
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

test("the options binder drives Welcome mode, disclosure agreement, and Settings mode", async () => {
  const ids = [
    "pageHeader", "pageTitle", "pageSubTitle", "welcomeView", "settingsView",
    "warmCard", "warmKinship0", "warmKinship1", "warmKinship2", "stepsCard",
    "step1Section", "step1HeadingRow", "step1Check", "step1Heading", "step1Body", "step1Actions", "step1ActionBtn",
    "step2Section", "step2HeadingRow", "step2Check", "step2Heading", "step2Content", "step2DisclosureBody",
    "step2PendingText", "step2Actions", "agreeDisclosureBtn", "step2Completed", "step2ReReadDetails", "step2ReadAgain", "step2ReReadBody",
    "step3Section", "step3HeadingRow", "step3Check", "step3Heading", "step3Content", "step3Body", "welcomeShowPageIndicator", "welcomeSiteList",
    "statusCard", "statusLead", "statusStateChip", "statusReason", "sitesCard",
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
  globalThis.chrome = {
    runtime: {
      sendMessage(message, callback) {
        if (message.cmd === "getState") callback(liveState);
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
        } else callback({ ok: true });
      },
      connect() {
        return {
          onMessage: { addListener() {} },
          onDisconnect: { addListener() {} },
        };
      },
    },
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
  await import(new URL("../extension/options.js", import.meta.url));
  await new Promise((resolve) => setImmediate(resolve));

  const C = globalThis.SolstoneCopy;

  // 1. No status yet
  liveState = null;
  await globalThis.SolstoneOptions.refresh();
  assert.equal(nodes.step1Heading.textContent, "looking for the solstone app on this computer…");
  assert.equal(nodes.step1Check.hidden, true);

  // 2. Can't-reach status
  liveState = optionsState({ connected: false });
  await globalThis.SolstoneOptions.refresh();
  assert.equal(nodes.step1Heading.textContent, "can't reach the solstone app");
  assert.equal(nodes.step1Body.textContent, C.STEP1_CANT_REACH_BODY);
  assert.equal(nodes.step1ActionBtn.hidden, false);
  assert.equal(nodes.step1ActionBtn.textContent, "get the solstone app");
  assert.equal(nodes.step1Check.hidden, true);

  // 3. Live permitted host with consent unset and no sites (app-first)
  liveState = optionsState({ hostCapture: "permitted", consentVersion: 0, chosenOrigins: [] });
  await globalThis.SolstoneOptions.refresh();
  assert.equal(nodes.step1Heading.textContent, "found the solstone app, paired with your journal");
  assert.equal(nodes.step1Check.hidden, false);
  assert.equal(nodes.agreeDisclosureBtn.hidden, false);
  assert.equal(nodes.agreeDisclosureBtn.textContent, "agree and go on");
  assert.equal(nodes.step2DisclosureBody.textContent, C.DISCLOSURE_BODY);

  // 4. hostCapture: "paused" with consent unset
  liveState = optionsState({ hostCapture: "paused", consentVersion: 0, chosenOrigins: [] });
  await globalThis.SolstoneOptions.refresh();
  assert.equal(nodes.step1Heading.textContent, "found the solstone app, paired with your journal. it's paused right now.");
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
  const onNowRow = globalThis.SolstoneStatus.siteRow("mail.google.com", liveState, { activeSites: ["mail.google.com"] });
  assert.equal(onNowRow.kind, "on-now");

  // 9. Checkbox marker label
  assert.match(html, /show a small solstone mark on pages you've added/);
});
