// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import assert from "node:assert/strict";
import test from "node:test";

await import(new URL("../extension/lib/copy.js", import.meta.url));
await import(new URL("../extension/lib/hosts.js", import.meta.url));
await import(new URL("../extension/lib/status.js", import.meta.url));
await import(new URL("../extension/lib/failures.js", import.meta.url));
await import(new URL("../extension/lib/popup_view.js", import.meta.url));

const Status = globalThis.SolstoneStatus;
const View = globalThis.SolstonePopupView;

function state(overrides = {}) {
  const base = {
    inst: "00112233-4455-6677-8899-aabbccddeeff",
    everConnected: true,
    connected: true,
    handshake: "complete",
    brand: "chrome",
    platform: "mac",
    hostCapture: "permitted",
    hostDelivery: "delivered",
    custody: { full: false, stale: false },
    behind: null,
    pressure: { active: false },
    lease: { token: "t", freshnessMs: 10000, receivedAt: 0 },
    openTabs: { known: false, openOrigins: null, anyGrantedTabOpen: null },
    truncationByOrigin: {},
    registration: {},
    enqueue: {},
    lossNotice: null,
    paused: false,
    consentVersion: 1,
    chosenOrigins: [],
    grantedOrigins: [],
    inactiveOrigins: [],
    showPageIndicator: false,
    updateCheck: "no-update",
    capturePermitted: true,
    addSiteEligible: true,
  };
  return Object.assign(base, overrides);
}

function derived(overrides = {}) {
  return Object.assign({
    kind: "on",
    mark: "healthy",
    badge: "",
    headline: "on",
    sub: "reaching your journal",
    reason: "",
    action: null,
    also: [],
    connecting: null,
  }, overrides);
}

test("arrange returns sections in the fixed render order and omits absent sections", () => {
  const empty = View.arrange(derived(), state(), { host: "mail.google.com", ok: true });
  assert.deepEqual(empty.map((section) => section.id), ["verdict", "page", "footer"]);

  const configured = state({
    chosenOrigins: ["https://mail.google.com", "https://app.slack.com"],
    grantedOrigins: ["https://mail.google.com"],
    inactiveOrigins: ["https://app.slack.com"],
  });
  const sections = View.arrange(derived(), configured, { origin: "https://mail.google.com", host: "mail.google.com", ok: true });
  assert.deepEqual(sections.map((section) => section.id), ["verdict", "siteIssues", "page", "siteCount", "footer"]);
});

test("siteCountLine follows the all-on, all-paused, mixed, zero-on, and singular rules", () => {
  assert.equal(View.siteCountLine([]), "");
  assert.equal(View.siteCountLine([{ kind: "on-now" }]), "1 site, all on");
  assert.equal(View.siteCountLine([{ kind: "paused" }]), "1 site, all paused");
  assert.equal(View.siteCountLine([{ kind: "paused-by-browser" }]), "1 site, all paused");
  assert.equal(View.siteCountLine([{ kind: "on-now" }, { kind: "on-now" }]), "2 sites, all on");
  assert.equal(View.siteCountLine([{ kind: "paused" }, { kind: "paused" }]), "2 sites, all paused");
  assert.equal(View.siteCountLine([{ kind: "on-now" }, { kind: "added-idle" }, { kind: "truncated" }]), "3 sites, 1 on");
  assert.equal(View.siteCountLine([{ kind: "added-idle" }, { kind: "truncated" }]), "2 sites");
  assert.doesNotMatch(View.siteCountLine([{ kind: "added-idle" }]), /0 on/);
});

test("page descriptors cover add, remove, unsupported, and pause actions", () => {
  const add = View.arrange(derived(), state(), { origin: "https://example.com", host: "example.com", ok: true }).find((s) => s.id === "page");
  assert.deepEqual(add.siteAction, { id: "add-site", label: "add this site", disabled: false, primary: true });
  assert.equal(add.state, "not added");

  const configured = state({ chosenOrigins: ["https://example.com"], grantedOrigins: ["https://example.com"], openTabs: { known: true, openOrigins: [], anyGrantedTabOpen: false } });
  const remove = View.arrange(derived(), configured, { origin: "https://example.com", host: "example.com", ok: true }).find((s) => s.id === "page");
  assert.equal(remove.siteAction.id, "remove-site");
  assert.ok(remove.state);

  const unsupported = View.arrange(derived(), state(), { host: "", ok: false }).find((s) => s.id === "page");
  assert.equal(unsupported.state, "this page can't be added");
  assert.equal(unsupported.siteAction.disabled, true);

  const paused = View.arrange(derived(), state({ paused: true, chosenOrigins: ["https://example.com"] }), { origin: "https://example.com", host: "example.com", ok: true }).find((s) => s.id === "page");
  assert.deepEqual(paused.pauseAction, { id: "set-paused", label: "resume", primary: true });
});

test("arrange preserves exact origins and exposes truncation as a separate attention row", () => {
  const first = "https://same.example";
  const second = "https://same.example:8443";
  const s = state({
    chosenOrigins: [first, second],
    grantedOrigins: [first, second],
    openTabs: { known: true, openOrigins: [first], anyGrantedTabOpen: true },
    truncationByOrigin: {
      [second]: { count: 3, newestId: "doc:id", dismissThroughId: "", pending: ["a", "b", "doc:id"] },
    },
  });
  const sections = View.arrange(derived(), s, { origin: second, host: "same.example", ok: true });
  assert.equal(sections.find((section) => section.id === "siteCount").text, "2 sites, 1 on");
  assert.ok(sections.find((section) => section.id === "page").state);
  const row = sections.find((section) => section.id === "siteIssues").rows.find((item) => item.kind === "truncated");
  assert.equal(row.origin, second);
  assert.equal(row.count, 3);
  assert.equal(row.action.id, "dismiss-truncation");
  assert.equal(row.action.origin, second);
  assert.equal(row.action.bound, "doc:id");

  const httpPage = View.arrange(derived(), state({ chosenOrigins: [first], grantedOrigins: [first] }), {
    origin: "http://same.example", host: "same.example", ok: true,
  }).find((section) => section.id === "page");
  assert.equal(httpPage.state, "not added");
});

test("addSite confirms before intent and permission in exact order", async () => {
  const calls = [];
  const result = await View.addSite("mail.google.com", {
    disclose: async (host) => { calls.push(["disclose", host]); return true; },
    cmd: async (message) => {
      calls.push([message.cmd, message.origin || message.host]);
      if (message.cmd === "getState") return { consentVersion: 1, addSiteEligible: true };
      return { ok: true };
    },
    requestPermission: async (request) => { calls.push(["permission", request.origins[0]]); return true; },
  });
  assert.deepEqual(calls, [
    ["disclose", "mail.google.com"],
    ["intendAddOrigin", "https://mail.google.com"],
    ["permission", "*://mail.google.com/*"],
    ["getState", undefined],
    ["addGrantedOrigin", "https://mail.google.com"],
  ]);
  assert.deepEqual(result, { ok: true });
});

test("an unconfirmed add reaches no mutation or permission effect", async () => {
  const calls = [];
  const result = await View.addSite("new.example", {
    disclose: async () => { calls.push("disclose"); return false; },
    cmd: async () => { calls.push("mutation"); },
    requestPermission: async () => { calls.push("permission"); },
  });
  assert.deepEqual(result, { ok: false, cancelled: true });
  assert.deepEqual(calls, ["disclose"]);
});

test("a declined grant clears add intent", async () => {
  const calls = [];
  const result = await View.addSite("example.com", {
    disclose: async () => true,
    cmd: async (message) => {
      calls.push(message.cmd);
      return { ok: true };
    },
    requestPermission: async () => false,
  });
  assert.deepEqual(calls, ["intendAddOrigin", "clearAddIntent"]);
  assert.deepEqual(result, { ok: false, denied: true });
});

test("grantSite sends intendAddOrigin before permission and checks eligibility", async () => {
  const calls = [];
  const result = await View.grantSite("example.com", {
    cmd: async (message) => {
      calls.push(message.cmd);
      if (message.cmd === "getState") return { consentVersion: 1, addSiteEligible: true };
      return { ok: true };
    },
    requestPermission: async () => { calls.push("permission"); return true; },
  });
  assert.deepEqual(calls, ["intendAddOrigin", "permission", "getState", "addGrantedOrigin"]);
  assert.deepEqual(result, { ok: true });
});
