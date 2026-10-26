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
  assert.deepEqual(empty.map((section) => section.id), ["verdict", "page", "siteCount", "footer"]);
  const beforeAgreement = View.arrange(derived(), state({ consentVersion: 0 }), { host: "mail.google.com", ok: true });
  assert.deepEqual(beforeAgreement.map((section) => section.id), ["verdict", "page", "footer"]);

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
  assert.equal(sections.find((section) => section.id === "siteCount").mode, "selected");
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
    status: { consentVersion: 1, addSiteEligible: true },
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
    ["permission", "*://*.mail.google.com/*"],
    ["getState", undefined],
    ["addGrantedOrigin", "https://mail.google.com"],
  ]);
  assert.deepEqual(result, { ok: true });
});

test("addSite from a page origin names the host on the sheet and grants the origin", async () => {
  const calls = [];
  const result = await View.addSite("https://httpbin.org", {
    status: { consentVersion: 1, addSiteEligible: true },
    disclose: async (host) => { calls.push(["disclose", host]); return true; },
    cmd: async (message) => {
      calls.push([message.cmd, message.origin]);
      if (message.cmd === "getState") return { consentVersion: 1, addSiteEligible: true };
      return { ok: true };
    },
    requestPermission: async (request) => { calls.push(["permission", request.origins[0]]); return true; },
  });
  assert.deepEqual(calls, [
    ["disclose", "httpbin.org"],
    ["intendAddOrigin", "https://httpbin.org"],
    ["permission", "*://*.httpbin.org/*"],
    ["getState", undefined],
    ["addGrantedOrigin", "https://httpbin.org"],
  ]);
  assert.deepEqual(result, { ok: true });
});

test("an unconfirmed add reaches no mutation or permission effect", async () => {
  const calls = [];
  const result = await View.addSite("new.example", {
    status: { consentVersion: 1, addSiteEligible: true },
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
    status: { consentVersion: 1, addSiteEligible: true },
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

test("the page block names pages the extension never reads instead of offering an add", () => {
  const all = state({ siteMode: "all", allSitesConsent: 1, broadGranted: true, excludedHosts: ["bank.example"] });
  const page = (st, p) => View.arrange(derived(), st, p).find((section) => section.id === "page");

  for (const mode of [state(), all]) {
    const inPrivate = page(mode, { origin: "", host: "news.example", ok: false, kind: "private" });
    assert.equal(inPrivate.kind, "private");
    assert.equal(inPrivate.siteAction, null);
    assert.ok(inPrivate.pauseAction || mode.siteMode !== "all");
    const restricted = page(mode, { origin: "", host: "", ok: false, kind: "restricted" });
    assert.equal(restricted.kind, "restricted");
    assert.equal(restricted.siteAction, null);
  }

  const unseen = page(all, { origin: "", host: "", ok: false, kind: "unknown" });
  assert.equal(unseen.kind, "unknown");
  assert.equal(unseen.siteAction, null);
  // Selected mode keeps the unavailable add for a page it can't see.
  const unseenSelected = page(state(), { origin: "", host: "", ok: false, kind: "unknown" });
  assert.equal(unseenSelected.siteAction.disabled, true);

  const shared = page(all, { origin: "https://news.example", host: "news.example", ok: true, kind: "web" });
  assert.equal(shared.siteAction.id, "exclude-site");
  assert.ok(shared.note.includes("news.example"));
  const left = page(all, { origin: "https://bank.example", host: "bank.example", ok: true, kind: "web" });
  assert.equal(left.siteAction.id, "include-site");
  assert.equal(left.note, "");
  const noGrant = page(Object.assign({}, all, { broadGranted: false }), { origin: "https://news.example", host: "news.example", ok: true, kind: "web" });
  assert.equal(noGrant.note, "");

  const sharing = View.arrange(derived(), all, { origin: "", host: "", ok: false, kind: "unknown" }).find((section) => section.id === "siteCount");
  assert.equal(sharing.mode, "all");
});

test("regrantAllSites asks only under the current all-sites agreement and never changes the mode", async () => {
  const calls = [];
  const effects = (status, granted, fresh = status) => ({
    status,
    cmd: async (message) => { calls.push(message.cmd); return message.cmd === "getState" ? fresh : { ok: true }; },
    requestPermission: async (request) => { calls.push(["request", request.origins]); return granted; },
    removePermission: async (request) => { calls.push(["remove", request.origins]); return true; },
  });
  const all = { siteMode: "all", allSitesConsent: 1, consentVersion: 1 };
  assert.equal((await View.regrantAllSites(effects({ siteMode: "selected", consentVersion: 1 }, true))).error, "wrong_site_mode");
  assert.equal((await View.regrantAllSites(effects({ siteMode: "all", allSitesConsent: 0, consentVersion: 1 }, true))).error, "wrong_site_mode");
  assert.deepEqual(calls, []);
  assert.equal((await View.regrantAllSites(effects(all, false))).denied, true);
  assert.deepEqual(calls, ["intendAllSites", ["request", ["*://*/*"]], "clearAddIntent"]);
  calls.length = 0;
  assert.equal((await View.regrantAllSites(effects(all, true))).ok, true);
  assert.deepEqual(calls, ["intendAllSites", ["request", ["*://*/*"]], "clearAddIntent", "getState", "refreshSiteAccess"]);
  // A stale popup snapshot: the owner switched back meanwhile, so the grant is returned.
  calls.length = 0;
  assert.equal((await View.regrantAllSites(effects(all, true, { siteMode: "selected", allSitesConsent: 1 }))).error, "wrong_site_mode");
  assert.deepEqual(calls, ["intendAllSites", ["request", ["*://*/*"]], "clearAddIntent", "getState", ["remove", ["*://*/*"]]]);
  assert.ok(!calls.includes("setSiteMode"));
});

test("grantChosenSites asks once for chosen sites only", async () => {
  const requests = [];
  const sent = [];
  const result = await View.grantChosenSites(["https://mail.google.com", "https://app.slack.com", "https://never.example"], {
    status: { siteMode: "selected", chosenOrigins: ["https://mail.google.com", "https://app.slack.com"] },
    cmd: async (message) => { sent.push(message.cmd); return { ok: true }; },
    requestPermission: async (request) => { requests.push(request.origins); return true; },
  });
  assert.equal(result.ok, true);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].length, 2);
  assert.ok(!requests[0].some((pattern) => pattern.includes("never.example")));
  assert.deepEqual(sent, ["refreshSiteAccess"]);
  const wrongMode = await View.grantChosenSites(["https://mail.google.com"], {
    status: { siteMode: "all", chosenOrigins: ["https://mail.google.com"] }, cmd: async () => ({}), requestPermission: async () => true,
  });
  assert.equal(wrongMode.error, "wrong_site_mode");
});

test("a page under a chosen site shows that site's state and names it on remove", () => {
  const site = "https://bank.com";
  const st = state({ consentVersion: 1, chosenOrigins: [site], grantedOrigins: [site], capturePermitted: true,
    openTabs: { known: true, openOrigins: ["https://login.bank.com"], anyGrantedTabOpen: true } });
  const page = View.arrange(derived(st), st, { origin: "https://login.bank.com", host: "login.bank.com", ok: true, kind: "web" })
    .find((section) => section.id === "page");
  assert.equal(page.state, "on now");
  assert.equal(page.siteAction.id, "remove-site");
  assert.equal(page.siteAction.origin, site);
  assert.equal(page.siteAction.label, "remove bank.com");
  // Under an older exact-host grant the subdomain page isn't covered, so it says so.
  const older = { ...st, exactOnlyOrigins: [site] };
  const olderPage = View.arrange(derived(older), older, { origin: "https://login.bank.com", host: "login.bank.com", ok: true, kind: "web" })
    .find((section) => section.id === "page");
  assert.equal(olderPage.state, "not added");
  // On the site's own address the label stays as it was.
  const own = View.arrange(derived(st), st, { origin: site, host: "bank.com", ok: true, kind: "web" }).find((section) => section.id === "page");
  assert.equal(own.siteAction.label, "remove this site");
});

test("in all sites a page under a left-out site is left out, and leaving a www page out names the site", () => {
  const base = { consentVersion: 1, siteMode: "all", allSitesConsent: 1, broadGranted: true, capturePermitted: true };
  const left = state({ ...base, excludedHosts: ["bank.com"] });
  const leftPage = View.arrange(derived(left), left, { origin: "https://login.bank.com", host: "login.bank.com", ok: true, kind: "web" })
    .find((section) => section.id === "page");
  assert.equal(leftPage.state, "left out");
  assert.equal(leftPage.siteAction.id, "include-site");
  assert.equal(leftPage.siteAction.site, "bank.com");
  assert.equal(leftPage.siteAction.label, "include bank.com");
  const open = state({ ...base, excludedHosts: [] });
  const wwwPage = View.arrange(derived(open), open, { origin: "https://www.bank.com", host: "www.bank.com", ok: true, kind: "web" })
    .find((section) => section.id === "page");
  assert.equal(wwwPage.siteAction.id, "exclude-site");
  assert.equal(wwwPage.siteAction.site, "bank.com");
  assert.equal(wwwPage.note, "leaving it out covers all bank.com sites and pages. other sites shown inside them are still shared.");
});
