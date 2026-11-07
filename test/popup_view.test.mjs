// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

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
    livePatterns: [],
    fence: null,
    excludedHosts: [],
    appLeftOut: [],
    showPageIndicator: false,
    updateCheck: "no-update",
    capturePermitted: true,
    addSiteEligible: true,
    consentAccepted: true,
  };
  const next = Object.assign(base, overrides);
  if (!Object.hasOwn(overrides, "consentAccepted")) {
    next.consentAccepted = next.consentVersion === 1 || next.consentVersion === 2;
  }
  return next;
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
    livePatterns: ["*://*.mail.google.com/*", "*://*.app.slack.com/*"],
    registration: { "https://app.slack.com": "failed" },
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

  const configured = state({ livePatterns: ["*://*.example.com/*"], openTabs: { known: true, openOrigins: [], anyGrantedTabOpen: false } });
  const remove = View.arrange(derived(), configured, { origin: "https://example.com", host: "example.com", ok: true }).find((s) => s.id === "page");
  assert.equal(remove.siteAction.id, "remove-site");
  assert.ok(remove.state);

  const unsupported = View.arrange(derived(), state(), { host: "", ok: false }).find((s) => s.id === "page");
  assert.equal(unsupported.state, "this page can't be added");
  assert.equal(unsupported.siteAction.disabled, true);

  const paused = View.arrange(derived(), state({ paused: true, livePatterns: ["*://*.example.com/*"] }), { origin: "https://example.com", host: "example.com", ok: true }).find((s) => s.id === "page");
  assert.deepEqual(paused.pauseAction, { id: "set-paused", label: "resume", primary: true });
});

test("arrange preserves exact origins and exposes truncation as a separate attention row", () => {
  const first = "https://same.example";
  const second = "https://same.example:8443";
  const s = state({
    livePatterns: [first + "/*", second + "/*"],
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

test("addSite asks the browser without a sheet", async () => {
  const calls = [];
  const result = await View.addSite("second.example", {
    status: { consentAccepted: true, addSiteEligible: true, fence: null },
    cmd: async (message) => {
      calls.push([message.cmd]);
      if (message.cmd === "getState") return { consentAccepted: true, addSiteEligible: true };
      return { ok: true };
    },
    requestPermission: async () => { calls.push(["permission"]); return true; },
  });
  assert.equal(result.ok, true);
  assert.equal(calls.some(([name]) => name === "intendAddOrigin"), false);
  assert.ok(calls.some(([name]) => name === "permission"));
});

test("grantSite with a fence calls intendAddOrigin before the permission request", async () => {
  const calls = [];
  const fence = { entries: [], exact: [], siteWide: [] };
  const result = await View.grantSite("mail.google.com", {
    status: { consentAccepted: true, addSiteEligible: true, fence, livePatterns: [] },
    cmd: async (message) => {
      calls.push([message.cmd, message.origin || message.host]);
      if (message.cmd === "getState") return { consentAccepted: true, addSiteEligible: true };
      return { ok: true };
    },
    requestPermission: async (request) => { calls.push(["permission", request.origins[0]]); return true; },
  });
  assert.deepEqual(calls, [
    ["intendAddOrigin", "https://mail.google.com"],
    ["permission", "*://*.mail.google.com/*"],
    ["getState", undefined],
    ["addGrantedOrigin", "https://mail.google.com"],
  ]);
  assert.deepEqual(result, { ok: true });
});

test("grantSite without a fence does not call intendAddOrigin", async () => {
  const calls = [];
  await View.grantSite("https://httpbin.org", {
    status: { consentAccepted: true, addSiteEligible: true, fence: null },
    cmd: async (message) => {
      calls.push(message.cmd);
      if (message.cmd === "getState") return { consentAccepted: true };
      return { ok: true };
    },
    requestPermission: async () => { calls.push("permission"); return true; },
  });
  assert.equal(calls.includes("intendAddOrigin"), false);
  assert.ok(calls.includes("permission"));
  assert.ok(calls.indexOf("permission") < calls.indexOf("getState"));
});

test("an ineligible add reaches no permission effect", async () => {
  const calls = [];
  const result = await View.addSite("new.example", {
    status: { consentAccepted: false, addSiteEligible: true },
    cmd: async () => { calls.push("mutation"); },
    requestPermission: async () => { calls.push("permission"); },
  });
  assert.equal(result.ineligible, true);
  assert.deepEqual(calls, []);
});

test("a declined grant clears add intent", async () => {
  const calls = [];
  const result = await View.addSite("example.com", {
    status: { consentAccepted: true, addSiteEligible: true, fence: { entries: [] }, livePatterns: [] },
    cmd: async (message) => {
      calls.push(message.cmd);
      return { ok: true, consentAccepted: true };
    },
    requestPermission: async () => false,
  });
  assert.deepEqual(calls, ["intendAddOrigin", "clearAddIntent"]);
  assert.deepEqual(result, { ok: false, denied: true });
});

test("grantSite sends intendAddOrigin before permission and checks eligibility", async () => {
  const calls = [];
  const result = await View.grantSite("example.com", {
    status: { consentAccepted: true, addSiteEligible: true, fence: { entries: [] }, livePatterns: [] },
    cmd: async (message) => {
      calls.push(message.cmd);
      if (message.cmd === "getState") return { consentAccepted: true, addSiteEligible: true };
      return { ok: true };
    },
    requestPermission: async () => { calls.push("permission"); return true; },
  });
  assert.deepEqual(calls, ["intendAddOrigin", "permission", "getState", "addGrantedOrigin"]);
  assert.deepEqual(result, { ok: true });
});

test("the page block names pages the extension never reads instead of offering an add", () => {
  const all = state({ broadGrant: true, fence: null, livePatterns: ["*://*/*"], excludedHosts: ["bank.example"] });
  const page = (st, p) => View.arrange(derived(), st, p).find((section) => section.id === "page");

  for (const mode of [state(), all]) {
    const inPrivate = page(mode, { origin: "", host: "news.example", ok: false, kind: "private" });
    assert.equal(inPrivate.kind, "private");
    assert.equal(inPrivate.siteAction, null);
    assert.ok(inPrivate.pauseAction || !mode.broadGrant);
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
  // A left-out page names what keeps it out in both modes (section 7).
  assert.equal(left.note, "the solstone extension leaves it out.");
  const noGrant = page(Object.assign({}, all, { broadGrant: false, livePatterns: [] }), { origin: "https://news.example", host: "news.example", ok: true, kind: "web" });
  assert.equal(noGrant.note, "");

  const sharing = View.arrange(derived(), all, { origin: "", host: "", ok: false, kind: "unknown" }).find((section) => section.id === "siteCount");
  assert.equal(sharing.mode, "all");
});

test("a page under a chosen site shows that site's state and names it on remove", () => {
  const site = "https://bank.com";
  const st = state({ consentVersion: 1, livePatterns: ["*://*.bank.com/*"], capturePermitted: true,
    openTabs: { known: true, openOrigins: ["https://login.bank.com"], anyGrantedTabOpen: true } });
  const page = View.arrange(derived(st), st, { origin: "https://login.bank.com", host: "login.bank.com", ok: true, kind: "web" })
    .find((section) => section.id === "page");
  assert.equal(page.state, "on now");
  assert.equal(page.siteAction.id, "remove-site");
  assert.equal(page.siteAction.origin, site);
  assert.equal(page.siteAction.label, "remove bank.com");
  // Under an older exact-host grant the subdomain page isn't covered, so it says so.
  const older = { ...st, livePatterns: ["*://bank.com/*"] };
  const olderPage = View.arrange(derived(older), older, { origin: "https://login.bank.com", host: "login.bank.com", ok: true, kind: "web" })
    .find((section) => section.id === "page");
  assert.equal(olderPage.state, "not added");
  // On the site's own address the label stays as it was.
  const own = View.arrange(derived(st), st, { origin: site, host: "bank.com", ok: true, kind: "web" }).find((section) => section.id === "page");
  assert.equal(own.siteAction.label, "remove this site");
});

test("in all sites a page under a left-out site is left out, and leaving a www page out names the site", () => {
  const base = { consentVersion: 1, broadGrant: true, fence: null, livePatterns: ["*://*/*"], capturePermitted: true };
  const left = state({ ...base, excludedHosts: ["bank.com"] });
  const leftPage = View.arrange(derived(left), left, { origin: "https://login.bank.com", host: "login.bank.com", ok: true, kind: "web" })
    .find((section) => section.id === "page");
  assert.equal(leftPage.state, "left out");
  assert.equal(leftPage.siteAction.id, "include-site");
  assert.equal(leftPage.siteAction.site, "bank.com");
  assert.equal(leftPage.siteAction.label, "stop leaving bank.com out");
  const open = state({ ...base, excludedHosts: [] });
  const wwwPage = View.arrange(derived(open), open, { origin: "https://www.bank.com", host: "www.bank.com", ok: true, kind: "web" })
    .find((section) => section.id === "page");
  assert.equal(wwwPage.siteAction.id, "exclude-site");
  assert.equal(wwwPage.siteAction.site, "bank.com");
  assert.equal(wwwPage.note, "leaving it out covers all bank.com sites and pages. other sites shown inside them are still shared.");
});

test("a verdict note stays off the headline when the app reports paused and reading is open", () => {
  const open = state({
    livePatterns: ["*://*.example.com/*"],
    consentVersion: 1,
    hostCapture: "permitted",
    capturePermitted: true,
    hostDelivery: "delivered",
  });
  const quiet = Status.derive(open, { anyGrantedTabOpen: true });
  const quietVerdict = View.arrange(quiet, open, { host: "example.com", ok: true }).find((section) => section.id === "verdict");
  assert.equal(quiet.kind, "on");
  assert.equal(quietVerdict.headline, quiet.headline);
  assert.equal(quietVerdict.sub, quiet.sub);
  assert.equal(quietVerdict.appPausedNote, "");

  const reported = state({ ...open, appReportedPaused: true });
  const derived = Status.derive(reported, { anyGrantedTabOpen: true });
  const verdict = View.arrange(derived, reported, { host: "example.com", ok: true }).find((section) => section.id === "verdict");
  assert.equal(verdict.kind, "on");
  assert.equal(verdict.mark, "healthy");
  assert.equal(verdict.headline, derived.headline);
  assert.equal(verdict.sub, derived.sub);
  assert.equal(verdict.reason, derived.reason);
  assert.equal(typeof verdict.appPausedNote, "string");
  assert.ok(verdict.appPausedNote.length > 0);
  assert.notEqual(verdict.appPausedNote, verdict.headline);
  assert.notEqual(verdict.appPausedNote, verdict.sub);
  assert.notEqual(verdict.appPausedNote, verdict.reason);
});

test("secondary leave-out, include rules, and note keys in popup arrange", () => {
  const page = (st, p) => View.arrange(derived(), st, p).find((section) => section.id === "page");

  // 1. Unchosen web page in selected mode offers secondary leave-out
  const unchosen = state({ siteMode: "selected", chosenOrigins: [] });
  const pUnchosen = page(unchosen, { origin: "https://example.com", host: "example.com", ok: true, kind: "web" });
  assert.equal(pUnchosen.siteSecondary?.id, "leave-out");
  assert.equal(pUnchosen.siteSecondary?.label, "leave this site out");

  // 2. Chosen web page has no secondary leave-out
  const chosen = state({ livePatterns: ["*://*.example.com/*"] });
  const pChosen = page(chosen, { origin: "https://example.com", host: "example.com", ok: true, kind: "web" });
  assert.equal(pChosen.siteSecondary, null);

  // 3. Left-out web page gets include-site action
  const leftOutLocal = state({ siteMode: "selected", excludedHosts: ["example.com"] });
  const pLeftLocal = page(leftOutLocal, { origin: "https://example.com", host: "example.com", ok: true, kind: "web" });
  assert.equal(pLeftLocal.siteAction?.id, "include-site");
  assert.equal(pLeftLocal.siteSecondary, null);

  // 4. App-only left out with leftOutCapable: gets include-site
  const leftOutAppCapable = state({ siteMode: "selected", appLeftOut: ["example.com"], leftOutCapable: true });
  const pLeftAppCapable = page(leftOutAppCapable, { origin: "https://example.com", host: "example.com", ok: true, kind: "web" });
  assert.equal(pLeftAppCapable.siteAction?.id, "include-site");

  // 5. App-only left out without leftOutCapable: siteAction is null
  const leftOutAppIncapable = state({ siteMode: "selected", appLeftOut: ["example.com"], leftOutCapable: false });
  const pLeftAppIncapable = page(leftOutAppIncapable, { origin: "https://example.com", host: "example.com", ok: true, kind: "web" });
  assert.equal(pLeftAppIncapable.siteAction, null);

  // 6. Note keys: desktop notes appear on page Note for not-added page
  const withDesktop = state({
    siteMode: "selected",
    chosenOrigins: [],
    desktop: { screen: true, activity: false, sites: "on" },
  });
  const pDesktop = page(withDesktop, { origin: "https://example.com", host: "example.com", ok: true, kind: "web" });
  assert.equal(pDesktop.note, globalThis.SolstoneCopy.desktopScreenOn);

  // But desktop note does not override private, restricted, or unknown
  const pPrivate = page(withDesktop, { origin: "", host: "example.com", ok: false, kind: "private" });
  assert.notEqual(pPrivate.note, globalThis.SolstoneCopy.desktopScreenOn);
});

test("one scheme is not every site, and a covering grant keeps its row", () => {
  const oneScheme = state({ broadGrant: true, livePatterns: ["http://*/*"], fence: null });
  const onePage = View.arrange(derived(), oneScheme, { origin: "https://bank.com", host: "bank.com", ok: true, kind: "web" })
    .find((section) => section.id === "page");
  const oneCount = View.arrange(derived(), oneScheme, { origin: "https://bank.com", host: "bank.com", ok: true, kind: "web" })
    .find((section) => section.id === "siteCount");
  assert.equal(onePage.siteAction?.id, "add-site");
  assert.equal(oneCount.mode, "selected");
  assert.equal(oneCount.text, "no sites yet");

  const covered = state({
    broadGrant: true,
    livePatterns: ["http://*/*", "*://*.bank.com/*", "https://bank.com/*", "*://bank.com/*"],
    fence: null,
  });
  const bankPage = View.arrange(derived(), covered, { origin: "https://bank.com", host: "bank.com", ok: true, kind: "web" })
    .find((section) => section.id === "page");
  const bankCount = View.arrange(derived(), covered, { origin: "https://bank.com", host: "bank.com", ok: true, kind: "web" })
    .find((section) => section.id === "siteCount");
  assert.equal(bankPage.siteAction?.id, "remove-site");
  assert.equal(bankCount.mode, "selected");
  assert.equal(bankCount.text, "1 site");
});

test("grantSite succeeds post-grant when consent stays accepted even if addSiteEligible is false", async () => {
  const calls = [];
  let postGrant = false;
  const result = await View.grantSite("example.com", {
    status: { consentAccepted: true, addSiteEligible: true, fence: { entries: [] }, livePatterns: [] },
    cmd: async (message) => {
      calls.push(message.cmd);
      if (message.cmd === "getState") {
        if (!postGrant) return { consentAccepted: true, addSiteEligible: true };
        return { consentAccepted: true, addSiteEligible: false };
      }
      return { ok: true };
    },
    requestPermission: async () => { calls.push("permission"); postGrant = true; return true; },
  });
  assert.deepEqual(calls, ["intendAddOrigin", "permission", "getState", "addGrantedOrigin"]);
  assert.deepEqual(result, { ok: true });
});

test("consent revoked during the permission await does not call addGrantedOrigin", async () => {
  const calls = [];
  const result = await View.grantSite("example.com", {
    status: { consentAccepted: true, addSiteEligible: true, fence: { entries: [] }, livePatterns: [] },
    cmd: async (message) => {
      calls.push(message.cmd);
      if (message.cmd === "getState") return { consentVersion: 0, consentAccepted: false };
      return { ok: true };
    },
    requestPermission: async () => {
      calls.push("permission");
      return true;
    },
  });
  assert.deepEqual(calls, ["intendAddOrigin", "permission", "getState", "clearAddIntent"]);
  assert.equal(calls.includes("addGrantedOrigin"), false);
  assert.deepEqual(result, { ok: false, denied: true, ineligible: true });
});

test("popup_view: site-wide page shows added site state, not not added", () => {
  const pageSec = (st, p) => View.arrange(derived(), st, p).find((s) => s.id === "page");
  const s = state({
    fence: {
      entries: ["https://measure.test"],
      siteWide: ["https://measure.test"],
      exact: [],
      exactKnown: true,
    },
    livePatterns: ["*://*.measure.test/*"],
  });
  const p = pageSec(s, { origin: "http://measure.test:8766", host: "measure.test", ok: true, kind: "web" });
  assert.notEqual(p.state, "not added");
  assert.equal(p.siteAction?.id, "remove-site");
});

test("popup_view: note keys partition by kind and assert pageNoteKey only", () => {
  const pageSec = (st, p) => View.arrange(derived(), st, p).find((s) => s.id === "page");

  // not-added: screen true
  const s1 = state({ siteMode: "selected", chosenOrigins: [], desktop: { screen: true, activity: false, sites: "on" } });
  assert.equal(pageSec(s1, { origin: "https://x.com", host: "x.com", ok: true, kind: "web" }).pageNoteKey, "desktopScreenOn");

  // not-added: activity true, screen not true
  const s2 = state({ siteMode: "selected", chosenOrigins: [], desktop: { screen: false, activity: true, sites: "on" } });
  assert.equal(pageSec(s2, { origin: "https://x.com", host: "x.com", ok: true, kind: "web" }).pageNoteKey, "desktopActivityOn");

  // not-added: otherwise empty
  const s3 = state({ siteMode: "selected", chosenOrigins: [], desktop: null });
  assert.equal(pageSec(s3, { origin: "https://x.com", host: "x.com", ok: true, kind: "web" }).pageNoteKey, "");

  // left-out: app covers & sites on
  const s4 = state({ siteMode: "selected", appLeftOut: ["x.com"], desktop: { screen: true, activity: true, sites: "on" } });
  assert.equal(pageSec(s4, { origin: "https://x.com", host: "x.com", ok: true, kind: "web" }).pageNoteKey, "appLeftOutSitesOn");

  // left-out: app covers & sites needs_access
  const s5 = state({ siteMode: "selected", appLeftOut: ["x.com"], desktop: { screen: true, activity: true, sites: "needs_access" } });
  assert.equal(pageSec(s5, { origin: "https://x.com", host: "x.com", ok: true, kind: "web" }).pageNoteKey, "appLeftOutNeedsAccess");

  // left-out: app covers & sites not_checked
  const s6 = state({ siteMode: "selected", appLeftOut: ["x.com"], desktop: { screen: true, activity: true, sites: "not_checked" } });
  assert.equal(pageSec(s6, { origin: "https://x.com", host: "x.com", ok: true, kind: "web" }).pageNoteKey, "appLeftOutNotChecked");

  // left-out: app covers & desktop null (app away)
  const s7 = state({ siteMode: "selected", appLeftOut: ["x.com"], desktop: null });
  assert.equal(pageSec(s7, { origin: "https://x.com", host: "x.com", ok: true, kind: "web" }).pageNoteKey, "appLeftOutAppAway");

  // left-out: app does not cover (local only or migrated) even when desktop.sites is on
  const s8 = state({ siteMode: "selected", appLeftOut: [], excludedHosts: ["x.com"], desktop: { screen: true, activity: true, sites: "on" } });
  assert.equal(pageSec(s8, { origin: "https://x.com", host: "x.com", ok: true, kind: "web" }).pageNoteKey, "extensionLeftOut");
});

test("a page the app's list also covers offers no include while the app can't be told", () => {
  const derived = () => Status.derive(state(), {});
  const st = state({ siteMode: "selected", excludedHosts: ["bank.com"], appLeftOut: ["bank.com"], leftOutCapable: false });
  const section = View.arrange(derived(), st, { origin: "https://bank.com", host: "bank.com", ok: true, kind: "web" })
    .find((s) => s.id === "page");
  assert.equal(section.state, "left out");
  assert.equal(section.siteAction, null);
  const capable = View.arrange(derived(), Object.assign({}, st, { leftOutCapable: true }), { origin: "https://bank.com", host: "bank.com", ok: true, kind: "web" })
    .find((s) => s.id === "page");
  assert.equal(capable.siteAction.id, "include-site");
});

test("a left-out page covered by the app names the app, not the screen, when neither screen nor activity goes in", () => {
  const C = globalThis.SolstoneCopy;
  const page = { origin: "https://bank.com", host: "bank.com", ok: true, kind: "web" };
  const base = { appLeftOut: ["bank.com"], excludedHosts: [] };
  assert.equal(C.popupNoteKey(Object.assign({}, base, { desktop: { screen: false, activity: false, sites: "needs_access" } }), page, "left-out"), "appLeftOutAppAway");
  assert.equal(C.popupNoteKey(Object.assign({}, base, { desktop: { screen: true, activity: false, sites: "needs_access" } }), page, "left-out"), "appLeftOutNeedsAccess");
  assert.equal(C.popupNoteKey(Object.assign({}, base, { appLeftOut: ["bank.com"], desktop: { screen: true, activity: true, sites: "needs_access" } }), page, "not-added"), "desktopNeedsAccess");
  assert.equal(C.popupNoteKey(Object.assign({}, base, { appLeftOut: [], desktop: { screen: true, activity: true, sites: "needs_access" } }), page, "not-added"), "desktopScreenOn");
  assert.equal(C.popupNoteKey(Object.assign({}, base, { desktop: { screen: true, activity: true, sites: "on" } }), page, "not-added"), "desktopScreenOn");
  assert.equal(C.popupNoteKey(Object.assign({}, base, { desktop: { screen: true, activity: true, sites: "on" } }), page, "left-out"), "appLeftOutSitesOn");
});

test("on a phone the popup is one site, one action and one row: the rest needs the owner or lives in settings", () => {
  const load = (navigator) => {
    const context = vm.createContext({ navigator, URL });
    for (const file of ["copy.js", "hosts.js", "status.js", "popup_view.js"]) {
      vm.runInContext(readFileSync(new URL(`../extension/lib/${file}`, import.meta.url), "utf8"), context);
    }
    return context.SolstonePopupView;
  };
  const state = { brand: "safari", consentVersion: 1, consentAccepted: true, addSiteEligible: true, hostCapture: "permitted", capturePermitted: true,
    connected: true, handshake: "ready", everConnected: true, connectionGeneration: 1, siteMode: "selected", chosenOrigins: [], grantedOrigins: [],
    lease: { token: "t", generation: "g", receivedAt: 1, freshnessMs: 5000, standing: true }, custody: { full: false }, pressure: {} };
  const page = { origin: "https://eff.org", host: "eff.org", ok: true, kind: "web" };
  const section = (sections, id) => sections.find((item) => item.id === id);
  const phone = load({ userAgent: "Mozilla/5.0 (iPhone)", platform: "iPhone", maxTouchPoints: 5 });
  const onPhone = phone.arrange(null, state, page);
  assert.equal(section(onPhone, "verdict").quiet, true);
  assert.equal(section(onPhone, "page").siteAction.id, "add-site");
  assert.equal(section(onPhone, "page").siteSecondary, null);
  assert.equal(section(onPhone, "page").pauseAction, null);
  assert.equal(section(onPhone, "siteIssues"), undefined);
  assert.equal(section(phone.arrange(null, { ...state, paused: true }, page), "page").pauseAction.label, "resume");
  const unpaired = section(phone.arrange(null, { ...state, hostCapture: "not_paired", capturePermitted: false, addSiteEligible: false, lease: null }, page), "verdict");
  assert.notEqual(unpaired.quiet, true);
  const broadPhone = phone.arrange(null, { ...state, broadGrant: true, fence: null, livePatterns: ["*://*/*"] }, page);
  assert.equal(section(broadPhone, "page").siteAction.id, "exclude-site");
  const mac = load({ userAgent: "Mozilla/5.0 (Macintosh)", platform: "MacIntel", maxTouchPoints: 0 });
  const onMac = mac.arrange(null, state, page);
  assert.equal(section(onMac, "verdict").quiet, false);
  assert.equal(section(onMac, "page").siteSecondary.id, "leave-out");
});

test("a phone add uses grantSite and does not pass through a sheet", () => {
  const popup = readFileSync(new URL("../extension/popup.js", import.meta.url), "utf8");
  const options = readFileSync(new URL("../extension/options.js", import.meta.url), "utf8");
  assert.match(popup, /View\.addSite\(/);
  assert.match(options, /View\.addSite\(/);
  assert.doesNotMatch(popup, /disclose:|skipSheet/);
  assert.doesNotMatch(options, /disclose:|skipSheet/);
});

test("popup_view: fenced every-site, upgrade questions, and permissionsUnavailable", () => {
  const fenced = state({
    fence: {
      entries: ["https://fenced.example"],
      siteWide: [],
      exact: ["https://fenced.example"],
      exactKnown: true,
      sawMore: false,
      answered: false,
    },
    livePatterns: ["*://*/*"],
  });
  const pNotAdded = View.arrange(derived(), fenced, { origin: "https://other.example", host: "other.example", ok: true, kind: "web" })
    .find((s) => s.id === "page");
  assert.equal(pNotAdded.siteAction?.id, "add-site");
  const countSec = View.arrange(derived(), fenced, { origin: "https://other.example", host: "other.example", ok: true, kind: "web" })
    .find((s) => s.id === "siteCount");
  assert.doesNotMatch(countSec.text, /every site/);

  const sawMore = state({
    fence: {
      entries: ["https://fenced.example"],
      siteWide: [],
      exact: [],
      exactKnown: true,
      sawMore: true,
      answered: false,
    },
    livePatterns: ["*://*/*"],
  });
  const qSec = View.arrange(derived(), sawMore, { origin: "https://fenced.example", host: "fenced.example", ok: true, kind: "web" })
    .find((s) => s.id === "upgradeQuestion");
  assert.ok(qSec);
  assert.equal(qSec.kind, "upgrade-question");
  const btnIds = qSec.buttons.map((b) => b.id);
  assert.ok(btnIds.includes("share-every-site") || btnIds.includes("share-them-too"));
  assert.ok(btnIds.includes("keep-my-sites"));

  const answered = state({
    fence: {
      entries: ["https://fenced.example"],
      siteWide: [],
      exact: [],
      exactKnown: true,
      sawMore: true,
      answered: true,
    },
    livePatterns: ["*://*/*"],
  });
  const noQSec = View.arrange(derived(), answered, { origin: "https://fenced.example", host: "fenced.example", ok: true, kind: "web" })
    .find((s) => s.id === "upgradeQuestion");
  assert.equal(noQSec, undefined);

  const permUnavail = state({ permissionsUnavailable: true });
  const pNoAdd = View.arrange(derived(), permUnavail, { origin: "https://other.example", host: "other.example", ok: true, kind: "web" })
    .find((s) => s.id === "page");
  assert.equal(pNoAdd.siteAction, null);
  assert.equal(pNoAdd.state, globalThis.SolstoneCopy.actionFailure("permissions_unavailable", permUnavail.brand));
  const stillPlain = View.arrange(derived(), state(), { origin: "https://other.example", host: "other.example", ok: true, kind: "web" })
    .find((s) => s.id === "page");
  assert.equal(stillPlain.state, "not added");
  assert.equal(stillPlain.siteAction?.id, "add-site");
});

test("agreement page: canAdd follows consentAccepted", () => {
  const st = state({
    consentVersion: 2,
    consentAccepted: true,
    addSiteEligible: true,
    livePatterns: ["*://*.example.com/*"],
    fence: null,
  });
  const page = View.arrange(derived(), st, { origin: "https://news.example", host: "news.example", ok: true, kind: "web" })
    .find((section) => section.id === "page");
  assert.equal(page.siteAction.id, "add-site");
  assert.equal(page.siteAction.disabled, false);
});

test("agreement page: site count follows consentAccepted", () => {
  const st = state({
    consentVersion: 2,
    consentAccepted: true,
    livePatterns: ["*://*.example.com/*"],
    fence: null,
  });
  const count = View.arrange(derived(), st, { origin: "https://example.com", host: "example.com", ok: true })
    .find((section) => section.id === "siteCount");
  assert.ok(count);
});

test("agreement page: grantSite refuses before the prompt when consent is not accepted", async () => {
  const calls = [];
  const result = await View.grantSite("news.example", {
    status: { consentVersion: 2, consentAccepted: false, addSiteEligible: true, fence: null, livePatterns: [] },
    cmd: async (message) => { calls.push(message.cmd); return { ok: true }; },
    requestPermission: async (request) => { calls.push(request); return true; },
  });
  assert.equal(result.ineligible, true);
  assert.equal(calls.length, 0);
});

test("agreement page: grantSite refuses after the prompt when consent is not accepted", async () => {
  const calls = [];
  const result = await View.grantSite("news.example", {
    status: { consentVersion: 2, consentAccepted: true, addSiteEligible: true, fence: null, livePatterns: [] },
    cmd: async (message) => {
      calls.push(message.cmd);
      if (message.cmd === "getState") return { ok: true, consentVersion: 2, consentAccepted: false };
      return { ok: true };
    },
    requestPermission: async () => { calls.push("request"); return true; },
  });
  assert.equal(result.ineligible, true);
  assert.equal(calls.includes("request"), true);
  assert.equal(calls.includes("addGrantedOrigin"), false);
});

test("agreement page: addSite cancels when consent is not accepted", async () => {
  const calls = [];
  const result = await View.addSite("news.example", {
    status: { consentVersion: 2, consentAccepted: false, addSiteEligible: true, fence: null, livePatterns: [] },
    cmd: async (message) => { calls.push(message.cmd); return { ok: true }; },
    requestPermission: async () => { calls.push("request"); return true; },
  });
  assert.equal(result.cancelled, true);
  assert.equal(result.ineligible, true);
  assert.equal(calls.includes("request"), false);
});
