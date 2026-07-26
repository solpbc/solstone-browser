// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const html = await readFile(new URL("extension/options.html", root), "utf8");
const optionsSource = await readFile(new URL("extension/options.js", root), "utf8");
const backgroundSource = await readFile(new URL("extension/background.js", root), "utf8");

test("options HTML fixes the region, heading, and form contract", () => {
  const ids = ["pageHeader", "intro", "firstRun", "journalCard", "sitesCard", "indicatorCard", "actionMessage", "pageFooter"];
  const positions = ids.map((id) => html.indexOf(`id="${id}"`));
  assert.ok(positions.every((position) => position >= 0));
  assert.deepEqual(positions, positions.slice().sort((a, b) => a - b));
  assert.match(html, /<title>sol settings<\/title>/);
  assert.match(html, /<h1 id="pageTitle">[\s\S]*?sol\s*<span class="desc">settings<\/span>[\s\S]*?<\/h1>/);
  for (const heading of ["your journal", "your sites", "on-page marker"]) {
    assert.equal((html.match(new RegExp(`<h2>${heading}<\\/h2>`, "g")) || []).length, 1, heading);
  }

  const choiceStart = html.indexOf('<fieldset id="destinationChoice">');
  const connectionStart = html.indexOf('<form id="connForm"');
  const connectionEnd = html.indexOf("</form>", connectionStart);
  const connectionForm = html.slice(connectionStart, connectionEnd);
  const remoteStart = html.indexOf('<div id="remoteDestination"');
  assert.ok(choiceStart < connectionStart);
  assert.match(connectionForm, /id="hostname"/);
  assert.match(connectionForm, /id="segmentSec"/);
  assert.match(connectionForm, /id="streamLabel"/);
  assert.match(connectionForm, /id="saveBtn"/);
  assert.match(connectionForm, /id="localDestination"[\s\S]*id="journalUrl"[\s\S]*id="registerBtn"/);
  assert.equal((connectionForm.match(/<form\b/g) || []).length, 1);
  assert.ok(connectionEnd < remoteStart);
  assert.match(html.slice(remoteStart), /id="pairForm"[\s\S]*id="pairBtn"[\s\S]*id="unpairBtn"/);
});

test("options consumes shared derivations and removes every retired selector", () => {
  assert.match(optionsSource, /Status\.connection\(state\)/);
  assert.match(optionsSource, /Status\.verdict\(state,/);
  assert.match(optionsSource, /Status\.siteRowState\(entry,/);
  assert.match(optionsSource, /Disclosure\.firstRun\(state\)/);
  assert.match(optionsSource, /View\.addSite\(host,/);
  assert.match(optionsSource, /View\.grantSite\(action\.host,/);
  assert.match(optionsSource, /journalLead"\)\.textContent = verdict\.sub/);
  assert.match(optionsSource, /journalStateChip"\)\.textContent = verdict\.headline/);
  assert.match(optionsSource, /journalStateChip"\)\.className = `state-chip \$\{verdict\.tone\}`/);
  assert.doesNotMatch(optionsSource, /cfg\.key|localRegistered|requestSiteAccess/);
  assert.doesNotMatch(optionsSource, /innerHTML/);
  assert.match(optionsSource, /document\.createElement\(/);
  assert.match(optionsSource, /\.textContent\s*=/);
  assert.doesNotMatch(html, /lib\/escape\.js/);

  const retired = [
    "waitingDetails", "waitingSummary", "waitingBody", "connStatus",
    "pairStatus", "remoteState", "addStatus",
  ];
  for (const id of retired) {
    assert.doesNotMatch(html, new RegExp(`id=["']${id}["']`), id);
    assert.doesNotMatch(optionsSource, new RegExp(`\\(["']${id}["']\\)`), id);
  }
});

test("options keeps technical journal details behind the details disclosure", () => {
  const detailsStart = html.indexOf('<details id="journalDetails">');
  const detailsEnd = html.indexOf("</details>", detailsStart);
  const details = html.slice(detailsStart, detailsEnd);
  assert.ok(detailsStart > html.indexOf('<section id="journalCard"'));
  for (const id of ["pairInstanceId", "pairRelayOrigin", "journalError", "lastSyncDetail", "waitingRow", "lossDetail"]) {
    assert.match(details, new RegExp(`id=["']${id}["']`), id);
  }
  assert.match(details, /<summary id="journalDetailsSummary">journal details<\/summary>/);
  assert.doesNotMatch(html, /\btitle=/);
  assert.match(optionsSource, /Failures\.classify\(health\.lastError, health\.lastStatus\)/);
});

test("options applies the shared accessibility and color layer", () => {
  assert.match(html, /<fieldset id="destinationChoice">[\s\S]*<legend>where your journal lives<\/legend>/);
  assert.match(html, /id="destinationLocal" type="radio" name="journalDestination"/);
  assert.match(html, /id="destinationRemote" type="radio" name="journalDestination"/);
  assert.match(html, /id="firstRunChange"[^>]+aria-label="change where your journal lives"[^>]*>change<\/button>/);
  assert.match(html, /id="actionMessage"[^>]+aria-live="polite"/);
  assert.match(html, /\[hidden\]\s*\{\s*display:\s*none !important;/);
  assert.match(html, /button:focus-visible,\s*a:focus-visible,\s*input:focus-visible,\s*summary:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--focus\)[^}]*outline-offset:\s*2px/s);
  assert.doesNotMatch(html, /outline\s*:\s*(?:none|0)\b/i);
  assert.match(html, /--focus:\s*#B06A1A;/);
  assert.match(html, /--field-line:\s*#96896F;/);
  assert.doesNotMatch(html, /--orange-ink/);
  assert.equal((html.match(/#B06A1A/g) || []).length, 1);
  assert.match(html, /\.site button\s*\{[^}]*min-height:\s*24px[^}]*font-size:\s*12px/s);
  assert.match(html, /\.action-message\.ok\s*\{[^}]*color:\s*var\(--success-ink\)/);
  assert.match(html, /\.action-message\.bad\s*\{[^}]*color:\s*var\(--bad\)/);
});

test("options source fixes the predicates, destination state, and install opening", () => {
  assert.match(optionsSource, /allowlist\.length !== 0/);
  assert.match(optionsSource, /!!\(state && state\.journalUrl\) && connection\.kind\.startsWith\("local-"\)/);
  assert.match(optionsSource, /row\.hidden = total === 0/);
  assert.match(optionsSource, /loss\.hidden = Number\(dropped\.segments \|\| 0\) <= 0/);
  assert.match(optionsSource, /destinationOverride === derived/);
  assert.match(optionsSource, /destinationOverride \|\| derived/);
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
    ok: true,
    journalUrl: "http://localhost:5015",
    hostname: "laptop",
    streamName: "laptop.browser",
    segmentSec: 300,
    showPageIndicator: false,
    version: "0.0.13",
    localRegistered: true,
    journalPermission: "granted",
    paused: false,
    allowlist: [],
    pausedHosts: {},
    siteErrors: {},
    health: { lastError: null, lastUploadAt: 20, segmentsUploaded: 1, lastStatus: 200, consecutiveFailures: 0 },
    remote: { paired: false, pending: false, instanceId: "", relayOrigin: "", pairedAt: null },
    activeSites: [],
    waiting: 0,
    dropped: { segments: 0, lines: 0 },
    outbox: { entries: 0, lines: 0 },
  }, overrides);
}

function bufferedPreview(overrides = {}) {
  return Object.assign({
    ok: true,
    totalLines: 0,
    perHost: [],
    waiting: 0,
    outbox: { entries: 0, lines: 0 },
    dropped: { segments: 0, lines: 0 },
  }, overrides);
}

function descendantText(node) {
  return [node.textContent, ...node.children.flatMap((child) => descendantText(child))].join(" ");
}

test("the options binder drives disclosure, destinations, details, waiting, and loss", async () => {
  const ids = [
    "actionMessage", "firstRun", "firstRunHeading", "firstRunComposition", "firstRunCovenant",
    "firstRunScope", "firstRunWhat", "firstRunUnsent", "firstRunNever", "firstRunAbsolutes", "firstRunDestination",
    "firstRunDestinationDetail", "firstRunNothingYet", "firstRunChange", "journalCard",
    "journalLead", "journalStateChip", "destinationLocal", "destinationRemote",
    "localDestination", "remoteDestination", "connForm", "hostname", "segmentSec", "streamLabel",
    "saveBtn", "journalUrl", "registerBtn", "pairForm", "pairLink", "pairBtn", "unpairBtn",
    "flushBtn", "journalLink", "journalDetails", "pairInstanceId", "pairRelayOrigin", "journalError",
    "lastSyncDetail", "waitingRow", "waitingPreview", "lossDetail", "sitesMain", "addForm", "newHost",
    "addBtn", "siteList", "siteDisclosure", "siteDisclosureTitle", "siteDisclosureWhat", "siteDisclosureUnsent",
    "siteDisclosureDestination", "siteDisclosureDestinationDetail", "siteDisclosureChrome",
    "siteDisclosureConfirm", "siteDisclosureCancel", "showPageIndicator", "ver",
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

  let liveState = optionsState();
  let preview = bufferedPreview();
  let permissionRequests = 0;
  let siteIntentResult = { ok: true, added: true };
  const sent = [];
  const actionOrder = [];
  globalThis.chrome = {
    runtime: {
      sendMessage(message, callback) {
        sent.push(message);
        if (message.cmd === "getState") callback(liveState);
        else if (message.cmd === "getBufferedPreview") callback(preview);
        else if (message.cmd === "journalIntent") {
          callback({
            ok: true,
            journalUrl: message.journalUrl,
            changed: message.journalUrl !== liveState.journalUrl,
            previous: {
              journalUrl: liveState.journalUrl,
              journalPermission: liveState.journalPermission,
            },
          });
        } else if (message.cmd === "journalIntentResolve") {
          callback({ ok: true, granted: true });
        } else if (message.cmd === "setConfig") {
          liveState = optionsState(Object.assign({}, liveState, {
            hostname: typeof message.hostname === "string" ? message.hostname : liveState.hostname,
            journalUrl: typeof message.journalUrl === "string" ? message.journalUrl : liveState.journalUrl,
            segmentSec: typeof message.segmentSec === "number" ? message.segmentSec : liveState.segmentSec,
          }));
          callback({ ok: true });
        } else if (message.cmd === "siteIntent") {
          actionOrder.push("siteIntent");
          callback(siteIntentResult);
        } else if (message.cmd === "siteGranted") {
          actionOrder.push("siteGranted");
          liveState = optionsState({ allowlist: [message.host], activeSites: [message.host] });
          callback({ ok: true });
        } else if (message.cmd === "clearDropped") {
          preview = bufferedPreview();
          liveState = optionsState({ allowlist: liveState.allowlist });
          callback({ ok: true });
        } else callback({ ok: true });
      },
    },
    permissions: {
      request: async () => {
        permissionRequests += 1;
        actionOrder.push("permission");
        return true;
      },
    },
  };

  await import(new URL("../extension/lib/hosts.js", import.meta.url));
  await import(new URL("../extension/lib/status.js", import.meta.url));
  await import(new URL("../extension/lib/pairlink.js", import.meta.url));
  await import(new URL("../extension/lib/failures.js", import.meta.url));
  await import(new URL("../extension/lib/disclosure.js", import.meta.url));
  await import(new URL("../extension/lib/popup_view.js", import.meta.url));
  await import(new URL("../extension/options.js", import.meta.url));
  await new Promise((resolve) => setImmediate(resolve));

  let expectedDisclosure = globalThis.SolstoneDisclosure.firstRun(liveState);
  assert.equal(nodes.firstRun.hidden, false);
  assert.equal(nodes.firstRunDestination.textContent, expectedDisclosure.destination.label);
  assert.equal(nodes.firstRunDestinationDetail.textContent, expectedDisclosure.destination.detail);
  assert.equal(nodes.journalLink.hidden, false);
  assert.equal(nodes.journalLink.href, liveState.journalUrl);
  assert.equal(nodes.waitingRow.hidden, true);
  assert.equal(nodes.lossDetail.hidden, true);
  assert.equal(nodes.actionMessage.textContent, "");

  nodes.firstRunChange.listeners.click();
  assert.equal(nodes.destinationLocal.focusCount, 1);

  nodes.destinationRemote.checked = true;
  nodes.destinationLocal.checked = false;
  nodes.destinationRemote.listeners.change();
  await globalThis.SolstoneOptions.refresh();
  assert.equal(nodes.destinationRemote.checked, true, "a manual choice survives refresh");
  assert.equal(nodes.remoteDestination.hidden, false);

  const instanceId = "instance-8cf0e2";
  const relayOrigin = "https://relay.example";
  liveState = optionsState({
    remote: { paired: true, pending: false, instanceId, relayOrigin, pairedAt: 10 },
  });
  await globalThis.SolstoneOptions.refresh();
  expectedDisclosure = globalThis.SolstoneDisclosure.firstRun(liveState);
  assert.equal(nodes.destinationRemote.checked, true);
  assert.equal(nodes.firstRunDestination.textContent, expectedDisclosure.destination.label);
  assert.equal(nodes.firstRunDestinationDetail.textContent, expectedDisclosure.destination.detail);
  assert.equal(nodes.journalLink.hidden, true, "a stale local URL never exposes a remote journal link");
  assert.equal(nodes.journalLink.href, undefined);
  assert.match(descendantText(nodes.pairInstanceId), new RegExp(instanceId));
  assert.match(descendantText(nodes.pairRelayOrigin), new RegExp(relayOrigin));
  for (const id of [
    "journalLead", "journalStateChip", "hostname", "segmentSec", "streamLabel", "journalUrl",
    "localDestination", "remoteDestination",
  ]) {
    assert.doesNotMatch(descendantText(nodes[id]), new RegExp(`${instanceId}|${relayOrigin}`), id);
  }

  liveState = optionsState();
  await globalThis.SolstoneOptions.refresh();
  assert.equal(
    nodes.destinationLocal.checked,
    true,
    "the override clears once state catches up, so a later unpair re-derives",
  );
  assert.equal(nodes.destinationRemote.checked, false);
  assert.equal(nodes.localDestination.hidden, false);
  assert.equal(nodes.remoteDestination.hidden, true);

  nodes.destinationRemote.checked = true;
  nodes.destinationLocal.checked = false;
  nodes.destinationRemote.listeners.change();
  nodes.hostname.value = "remote-laptop";
  nodes.segmentSec.value = "120";
  nodes.journalUrl.value = "";
  const preservedJournalUrl = liveState.journalUrl;
  let permissionsBefore = permissionRequests;
  let sentBefore = sent.length;
  await nodes.connForm.listeners.submit({ preventDefault() {} });
  assert.equal(permissionRequests, permissionsBefore, "remote save never requests permission for the hidden local address");
  assert.deepEqual(
    sent.slice(sentBefore).find((message) => message.cmd === "setConfig"),
    { cmd: "setConfig", hostname: "remote-laptop", journalUrl: preservedJournalUrl, segmentSec: 120 },
    "remote save persists shared fields and preserves the stored local address",
  );
  assert.equal(nodes.actionMessage.textContent, "settings saved.");
  assert.equal(nodes.actionMessage.className, "action-message ok");

  nodes.destinationLocal.checked = true;
  nodes.destinationRemote.checked = false;
  nodes.destinationLocal.listeners.change();
  nodes.hostname.value = "local-laptop";
  nodes.segmentSec.value = "90";
  nodes.journalUrl.value = "http://localhost:6015";
  permissionsBefore = permissionRequests;
  sentBefore = sent.length;
  await nodes.connForm.listeners.submit({ preventDefault() {} });
  assert.equal(permissionRequests, permissionsBefore + 1, "local save keeps the journal permission flow");
  assert.equal(sent.slice(sentBefore).some((message) => message.cmd === "journalIntent"), true);
  assert.equal(sent.slice(sentBefore).some((message) => message.cmd === "journalIntentResolve"), true);
  assert.deepEqual(
    sent.slice(sentBefore).find((message) => message.cmd === "setConfig"),
    { cmd: "setConfig", hostname: "local-laptop", journalUrl: "http://localhost:6015", segmentSec: 90 },
  );

  nodes.segmentSec.value = "29";
  await nodes.connForm.listeners.submit({ preventDefault() {} });
  assert.equal(nodes.actionMessage.textContent, "minimum 30 seconds");
  assert.equal(nodes.actionMessage.className, "action-message bad", "failures use a distinct action-message tone");

  liveState = optionsState({ allowlist: ["mail.google.com"], activeSites: ["mail.google.com"] });
  await globalThis.SolstoneOptions.refresh();
  assert.equal(nodes.firstRun.hidden, true, "the allowlist alone ends first run");

  preview = bufferedPreview({
    waiting: 3,
    perHost: [{ host: "mail.google.com", count: 2, texts: ["inbox", "message"] }],
    dropped: { segments: 1, lines: 7 },
  });
  liveState = optionsState({
    allowlist: ["mail.google.com"],
    waiting: 3,
    dropped: { segments: 1, lines: 7 },
  });
  await globalThis.SolstoneOptions.refresh();
  assert.equal(nodes.waitingRow.hidden, false);
  assert.match(descendantText(nodes.waitingPreview), /3 updates waiting to sync\./);
  assert.equal(nodes.lossDetail.hidden, false);
  assert.match(descendantText(nodes.lossDetail), /some updates couldn't be kept/);
  assert.match(descendantText(nodes.lossDetail), /7 updates/);
  assert.equal(nodes.lossDetail.children.at(-1).textContent, "dismiss");

  preview = bufferedPreview();
  liveState = optionsState();
  await globalThis.SolstoneOptions.refresh();
  assert.equal(nodes.waitingRow.hidden, true);
  assert.equal(descendantText(nodes.waitingPreview).trim(), "");
  assert.equal(nodes.lossDetail.hidden, true);

  nodes.newHost.value = "mail.google.com";
  permissionsBefore = permissionRequests;
  sentBefore = sent.length;
  let pending = nodes.addForm.listeners.submit({ preventDefault() {} });
  assert.equal(nodes.siteDisclosure.hidden, false);
  nodes.siteDisclosureCancel.listeners.click();
  await pending;
  assert.equal(permissionRequests, permissionsBefore);
  assert.equal(sent.slice(sentBefore).some((message) => message.cmd === "siteIntent"), false);
  assert.equal(nodes.newHost.focusCount, 1);

  sentBefore = sent.length;
  pending = nodes.addForm.listeners.submit({ preventDefault() {} });
  assert.equal(nodes.siteDisclosure.hidden, false);
  documentListeners.keydown({ key: "Escape" });
  await pending;
  assert.equal(permissionRequests, permissionsBefore);
  assert.equal(sent.slice(sentBefore).some((message) => message.cmd === "siteIntent"), false);
  assert.equal(nodes.newHost.focusCount, 2);

  actionOrder.length = 0;
  pending = nodes.addForm.listeners.submit({ preventDefault() {} });
  assert.equal(nodes.siteDisclosure.hidden, false);
  assert.equal(permissionRequests, permissionsBefore, "permission is unreachable before confirmation");
  nodes.siteDisclosureConfirm.listeners.click();
  await pending;
  assert.deepEqual(actionOrder, ["siteIntent", "permission", "siteGranted"]);
  assert.equal(permissionRequests, permissionsBefore + 1);
  assert.equal(nodes.newHost.focusCount, 4, "confirmation restores focus before and after refresh");
  assert.equal(nodes.newHost.value, "", "a successful add clears the host");

  siteIntentResult = { ok: false };
  nodes.newHost.value = "calendar.google.com";
  permissionsBefore = permissionRequests;
  actionOrder.length = 0;
  pending = nodes.addForm.listeners.submit({ preventDefault() {} });
  nodes.siteDisclosureConfirm.listeners.click();
  await pending;
  assert.deepEqual(actionOrder, ["siteIntent"]);
  assert.equal(permissionRequests, permissionsBefore);
  assert.equal(nodes.newHost.value, "calendar.google.com", "a failed add preserves the host");
  assert.equal(nodes.actionMessage.className, "action-message bad");

  nodes.actionMessage.textContent = "";
  liveState = optionsState({
    allowlist: ["mail.google.com"],
    health: { lastError: "TypeError: Failed to fetch", lastUploadAt: 20, segmentsUploaded: 1, lastStatus: 0 },
  });
  await globalThis.SolstoneOptions.refresh();
  assert.match(nodes.actionMessage.textContent, /can't reach your journal/);
  const writes = nodes.actionMessage.textWrites;
  await globalThis.SolstoneOptions.refresh();
  assert.equal(nodes.actionMessage.textWrites, writes, "unchanged refreshes do not repeat the live message");
});
