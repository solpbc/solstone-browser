// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

await import(new URL("../extension/lib/copy.js", import.meta.url));
await import(new URL("../extension/lib/hosts.js", import.meta.url));
await import(new URL("../extension/lib/status.js", import.meta.url));

const S = globalThis.SolstoneStatus;

function mockStatus(overrides = {}) {
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
    destinationGeneration: 1,
    lease: { token: "t", freshnessMs: 60000, receivedAt: 0 },
    connectionGeneration: 1,
    connectionToken: "token-1",
    behind: null,
    pressure: { active: false },
    openTabs: { known: false, openOrigins: null, anyGrantedTabOpen: null },
    registration: {},
    enqueue: {},
    siteRejection: null,
    lossNotice: null,
    drift: null,
    paused: false,
    consentVersion: 1,
    chosenOrigins: ["https://example.com"],
    grantedOrigins: ["https://example.com"],
    inactiveOrigins: [],
    showPageIndicator: false,
    updateCheck: "no-update",
    capturePermitted: true,
    addSiteEligible: true,
    gate: { open: true },
  }, overrides);
}

test("derive emits the exact status derivation shape", () => {
  const status = mockStatus();
  const derived = S.derive(status, { anyGrantedTabOpen: true });
  assert.ok(typeof derived === "object" && derived !== null);
  assert.equal(derived.kind, "on");
  assert.equal(derived.mark, "healthy");
  assert.equal(derived.badge, "");
  assert.equal(derived.headline, "on");
  assert.equal(derived.sub, "reaching your journal");
  assert.equal(derived.reason, "");
  assert.equal(derived.action, null);
  assert.deepEqual(derived.also, []);
  assert.equal(derived.connecting, null);
});

test("derive ladder covers all layer kinds and marks", () => {
  // Layer 0
  assert.equal(S.derive(null).kind, "unavailable");
  assert.equal(S.derive(null).mark, "error");
  assert.equal(S.derive(undefined).kind, "unavailable");

  // Layer 1
  assert.equal(S.derive(mockStatus({ behind: "extension" })).kind, "update-extension");
  assert.equal(S.derive(mockStatus({ behind: "extension" })).mark, "attention");
  assert.equal(S.derive(mockStatus({ behind: "extension", updateCheck: "update-available" })).action?.id, "update-now");

  assert.equal(S.derive(mockStatus({ behind: "app" })).kind, "update-app");
  assert.equal(S.derive(mockStatus({ behind: "app" })).mark, "attention");
  assert.equal(S.derive(mockStatus({ behind: "app" })).badge, "!");

  // Layer 2
  assert.equal(S.derive(mockStatus({ connected: false })).kind, "cant-reach-app");
  assert.equal(S.derive(mockStatus({ connected: false, everConnected: false })).mark, "paused");
  assert.equal(S.derive(mockStatus({ connected: false, everConnected: true })).mark, "offline");

  assert.equal(S.derive(mockStatus({ handshake: "pending" })).kind, "connecting");
  assert.equal(S.derive(mockStatus({ handshake: "pending" })).mark, "connecting");
  assert.equal(S.derive(mockStatus({ handshake: "pending" })).connecting, "handshake");

  // Layer 2 handshake connecting does NOT fire when custody.full === true
  assert.notEqual(S.derive(mockStatus({ capturePermitted: false, custody: { full: true } })).kind, "connecting");

  // Layer 3
  assert.equal(S.derive(mockStatus({ hostCapture: "not_paired" })).kind, "not-paired");
  assert.equal(S.derive(mockStatus({ hostCapture: "not_paired" })).mark, "paused");

  assert.equal(S.derive(mockStatus({ consentVersion: 0 })).kind, "consent-needed");
  assert.equal(S.derive(mockStatus({ consentVersion: 0 })).mark, "paused");

  assert.equal(S.derive(mockStatus({ hostCapture: "paused" })).kind, "app-paused");
  assert.equal(S.derive(mockStatus({ hostCapture: "paused" })).mark, "paused");

  assert.equal(S.derive(mockStatus({ hostCapture: "intake_off", hostFailure: null })).kind, "intake-off");
  assert.equal(S.derive(mockStatus({ hostCapture: "intake_off", hostFailure: null })).mark, "paused");

  assert.equal(S.derive(mockStatus({ paused: true })).kind, "paused-here");
  assert.equal(S.derive(mockStatus({ paused: true })).mark, "paused");

  assert.equal(S.derive(mockStatus({ chosenOrigins: [] })).kind, "no-sites");
  assert.equal(S.derive(mockStatus({ chosenOrigins: [] })).mark, "paused");

  // Layer 4
  assert.equal(S.derive(mockStatus({ custody: { full: true } })).kind, "app-store-full");
  assert.equal(S.derive(mockStatus({ custody: { full: true } })).mark, "offline");

  const lostAndHeld = S.derive(mockStatus({ hostCapture: "intake_off", hostFailure: "unaccepted_lost" }));
  assert.equal(lostAndHeld.kind, "lost-and-held");
  assert.equal(lostAndHeld.mark, "attention");
  assert.equal(lostAndHeld.badge, "!");
  assert.equal(lostAndHeld.action, null);
  assert.notEqual(S.derive(mockStatus({ hostCapture: "permitted", hostFailure: null })).kind, "lost-and-held");

  assert.equal(S.derive(mockStatus({ hostCapture: "intake_off", hostFailure: "resource_exhausted" })).kind, "intake-held");
  assert.equal(S.derive(mockStatus({ hostCapture: "intake_off", hostFailure: "resource_exhausted" })).mark, "offline");

  assert.equal(S.derive(mockStatus({ pressure: { active: true } })).kind, "pressure-here");
  assert.equal(S.derive(mockStatus({ pressure: { active: true } })).mark, "offline");

  // Layer 5
  assert.equal(S.derive(mockStatus({ lossNotice: { seq: 1, count: 2 } })).kind, "dropped");
  assert.equal(S.derive(mockStatus({ lossNotice: { seq: 1, count: 2 } })).mark, "attention");
  assert.equal(S.derive(mockStatus({ lossNotice: { seq: 1, count: 2 } })).badge, "!");

  assert.equal(S.derive(mockStatus({ custody: { stale: true, full: false } })).kind, "waiting-over-a-week");
  assert.equal(S.derive(mockStatus({ custody: { stale: true, full: false } })).mark, "attention");
  assert.equal(S.derive(mockStatus({ custody: { stale: true, full: false } })).badge, "!");

  assert.equal(S.derive(mockStatus({ inactiveOrigins: ["https://example.com"] })).kind, "sites-paused-by-browser");
  assert.equal(S.derive(mockStatus({ inactiveOrigins: ["https://example.com"] })).mark, "attention");
  assert.equal(S.derive(mockStatus({ inactiveOrigins: ["https://example.com"] })).badge, "!");

  assert.equal(S.derive(mockStatus({ registration: { "https://example.com": "failed" } })).kind, "site-error");
  assert.equal(S.derive(mockStatus({ registration: { "https://example.com": "failed" } })).mark, "attention");
  assert.equal(S.derive(mockStatus({ registration: { "https://example.com": "failed" } })).badge, "!");

  // Layer 6
  assert.equal(S.derive(mockStatus({ hostDelivery: "failed" })).kind, "delivery-failed");
  assert.equal(S.derive(mockStatus({ hostDelivery: "failed" })).mark, "offline");

  // Layer 7
  assert.equal(S.derive(mockStatus({ hostDelivery: "unknown" })).kind, "connecting");
  assert.equal(S.derive(mockStatus({ hostDelivery: "unknown" })).mark, "connecting");
  assert.equal(S.derive(mockStatus({ hostDelivery: "unknown" })).connecting, "delivery");

  assert.equal(S.derive(mockStatus(), { anyGrantedTabOpen: false }).kind, "idle");
  assert.equal(S.derive(mockStatus(), { anyGrantedTabOpen: false }).mark, "healthy");

  const unknownTabs = S.derive(mockStatus());
  assert.equal(unknownTabs.kind, "on");
  assert.notEqual(unknownTabs.kind, "idle");
  assert.equal(unknownTabs.reason, "");
  assert.equal(S.welcomeHold(mockStatus({
    capturePermitted: false,
    lease: {token:"t", freshnessMs:0, receivedAt:0},
  })).met, false);
  assert.equal(S.welcomeHold(mockStatus({connected:false})).met, false);
  assert.equal(S.welcomeHold(mockStatus({hostCapture:"unavailable"})).met, false);

  assert.equal(S.derive(mockStatus(), { anyGrantedTabOpen: true }).kind, "on");
  assert.equal(S.derive(mockStatus(), { anyGrantedTabOpen: true }).mark, "healthy");
  assert.equal(S.derive(mockStatus({ hostDelivery: "kept_locally" }), { anyGrantedTabOpen: true }).sub, "kept on this computer, waiting to go into your journal");
  assert.equal(S.derive(mockStatus({ hostDelivery: "idle" }), { anyGrantedTabOpen: true }).sub, "nothing waiting to go into your journal");
  assert.equal(S.derive(mockStatus({ hostDelivery: "delivered", hostFailure: "something" }), { anyGrantedTabOpen: true }).sub, "the last pages reached your journal");
});

test("iconState produces valid prefix and badge across six marks", () => {
  const marks = ["healthy", "paused", "attention", "offline", "error", "connecting"];
  const prefixMap = {
    healthy: "icon",
    paused: "icon-paused-",
    attention: "icon-attention-",
    offline: "icon-offline-",
    error: "icon-error-",
    connecting: "icon-connecting-",
  };

  for (const mark of marks) {
    let status;
    if (mark === "healthy") status = mockStatus();
    else if (mark === "paused") status = mockStatus({ paused: true });
    else if (mark === "attention") status = mockStatus({ behind: "extension" });
    else if (mark === "offline") status = mockStatus({ hostDelivery: "failed" });
    else if (mark === "error") status = null;
    else if (mark === "connecting") status = mockStatus({ handshake: "pending" });

    const icon = S.iconState(status, { anyGrantedTabOpen: true });
    assert.equal(icon.prefix, prefixMap[mark]);
    for (const size of [16, 48, 128]) {
      assert.equal(
        fs.existsSync(new URL(`../extension/icons/${icon.prefix}${size}.png`, import.meta.url)),
        true,
        `${icon.prefix}${size}.png must exist`,
      );
    }
  }
});

test("derive enforces precedence order across all 8 layers", () => {
  // Layer 1 > Layer 2
  const skewOverCantReach = S.derive(mockStatus({ behind: "extension", connected: false }));
  assert.equal(skewOverCantReach.kind, "update-extension");
  assert.ok(skewOverCantReach.also.some((a) => a.kind === "cant-reach-app"));

  // Layer 2 > Layer 3
  const cantReachOverPaused = S.derive(mockStatus({ connected: false, paused: true }));
  assert.equal(cantReachOverPaused.kind, "cant-reach-app");
  assert.ok(cantReachOverPaused.also.some((a) => a.kind === "paused-here"));

  // Layer 3 > Layer 4
  const pausedOverStoreFull = S.derive(mockStatus({ paused: true, custody: { full: true } }));
  assert.equal(pausedOverStoreFull.kind, "paused-here");
  assert.ok(pausedOverStoreFull.also.some((a) => a.kind === "app-store-full"));

  // Layer 4 > Layer 5
  const storeFullOverDropped = S.derive(mockStatus({ custody: { full: true }, lossNotice: { seq: 1, count: 1 } }));
  assert.equal(storeFullOverDropped.kind, "app-store-full");
  assert.ok(storeFullOverDropped.also.some((a) => a.kind === "dropped"));

  // Layer 5 > Layer 6
  const droppedOverDeliveryFailed = S.derive(mockStatus({ lossNotice: { seq: 1, count: 1 }, hostDelivery: "failed" }));
  assert.equal(droppedOverDeliveryFailed.kind, "dropped");
  assert.ok(droppedOverDeliveryFailed.also.some((a) => a.kind === "delivery-failed"));

  // Layer 6 > Layer 7
  const deliveryFailedOverOn = S.derive(mockStatus({ hostDelivery: "failed" }), { anyGrantedTabOpen: true });
  assert.equal(deliveryFailedOverOn.kind, "delivery-failed");
  // 'on' is never in also
  assert.equal(deliveryFailedOverOn.also.some((a) => a.kind === "on"), false);
});

test("siteRow uses exact origin, authority precedence, and unknown tabs", () => {
  const origin = "https://example.com";
  const open = { known: true, openOrigins: [origin], anyGrantedTabOpen: true };

  const browserPaused = S.siteRow(origin, mockStatus({ inactiveOrigins: [origin] }));
  assert.equal(browserPaused.kind, "paused-by-browser");
  assert.equal(browserPaused.action.id, "allow-again");

  assert.equal(S.siteRow(origin, mockStatus({ paused: true })).kind, "paused");

  assert.equal(S.siteRow(origin, mockStatus({
    registration: { [origin]: "reload" }, openTabs: open,
  })).kind, "reload-tab");

  assert.equal(S.siteRow(origin, mockStatus({
    openTabs: { known: true, openOrigins: [], anyGrantedTabOpen: false },
  })).kind, "added-idle");

  assert.equal(S.siteRow(origin, mockStatus({ hostCapture: "intake_off", openTabs: open })).kind, "not-taken-in");

  assert.equal(S.siteRow(origin, mockStatus({ openTabs: open })).kind, "on-now");

  assert.equal(S.siteRow(origin, mockStatus()).kind, "added");
  assert.equal(S.siteRow("http://example.com", mockStatus({ openTabs: open })).kind, "not-taken-in");
  assert.equal(S.siteRow(origin, mockStatus({
    registration: { [origin]: "failed" }, inactiveOrigins: [origin],
  })).kind, "error");
});

test("projectOpenTabs distinguishes unknown, empty, and exact granted origins", () => {
  assert.deepEqual(S.projectOpenTabs(null), { known: false, openOrigins: null, anyGrantedTabOpen: null });
  assert.deepEqual(S.projectOpenTabs("not tabs"), { known: false, openOrigins: null, anyGrantedTabOpen: null });
  assert.deepEqual(S.projectOpenTabs([]), { known: true, openOrigins: [], anyGrantedTabOpen: false });
  assert.deepEqual(S.projectOpenTabs([
    { url: "https://example.com/a" }, { url: "https://example.com/b" },
    { url: "http://example.com/" }, { url: "ftp://example.com/file" },
  ], { grantedOrigins: ["https://example.com"] }), {
    known: true,
    openOrigins: ["http://example.com", "https://example.com"],
    anyGrantedTabOpen: true,
  });
  assert.deepEqual(S.projectOpenTabs([{url:"https://unrelated.example/"}], {
    grantedOrigins:["https://example.com"],
  }), {
    known:true,
    openOrigins:["https://unrelated.example"],
    anyGrantedTabOpen:false,
  });
});

test("welcomeHold selects only the specified blockers from derive items", () => {
  assert.equal(S.welcomeHold(mockStatus({ consentVersion: 0, chosenOrigins: [] })).met, true);
  assert.equal(S.welcomeHold(mockStatus({ hostCapture: "not_paired" })).heading, "the solstone app isn't paired yet");
  assert.equal(S.welcomeHold(mockStatus({ hostCapture: "intake_off" })).heading, "browser pages are off in the solstone app");
  assert.equal(S.welcomeHold(mockStatus({ custody: { full: false, stale: true } })).met, true);
  assert.equal(S.welcomeHold(mockStatus({ custody: { full: true, stale: false } })).met, false);
  assert.equal(S.welcomeHold(mockStatus({ hostCapture: "unavailable" })).met, false);
  assert.equal(S.derive(new Proxy({}, { get() { throw new Error("fixture"); } })).kind, "unavailable");
});

test("a private tab on an added site never counts as open", () => {
  const grantedOrigins = ["https://example.com"];
  const projected = S.projectOpenTabs([{ url: "https://example.com/a", incognito: true }], { grantedOrigins });
  assert.deepEqual(projected, { known: true, openOrigins: [], anyGrantedTabOpen: false });
  const normal = S.projectOpenTabs([{ url: "https://example.com/a", incognito: false }], { grantedOrigins });
  assert.equal(normal.anyGrantedTabOpen, true);
});

test("Safari's manual update points to the solstone app, not Firefox", () => {
  const item = S.derive({ brand: "safari", behind: "extension", updateCheck: "manual" }).items[0];
  assert.equal(item.kind, "update-extension");
  assert.match(item.reason, /update the solstone app/);
  assert.doesNotMatch(item.reason, /Firefox/);
});

test("all-sites site rows never offer a per-site grant", () => {
  const all = (over = {}) => mockStatus(Object.assign({ siteMode: "all", allSitesConsent: 1, broadGranted: true,
    excludedHosts: ["left.example"], browserDeniedOrigins: ["https://denied.example"],
    openTabs: { known: true, openOrigins: ["https://news.example"], anyGrantedTabOpen: true } }, over));
  assert.equal(S.siteRow("https://news.example", all()).kind, "on-now");
  assert.equal(S.siteRow("https://quiet.example", all()).kind, "included");
  assert.equal(S.siteRow("https://left.example", all()).kind, "excluded");
  assert.equal(S.siteRow("https://denied.example", all()).kind, "denied-by-browser");
  assert.equal(S.siteRow("https://news.example", all({ paused: true })).kind, "paused");
  assert.equal(S.siteRow("https://news.example", all({ broadGranted: false })).kind, "not-taken-in");
  assert.equal(S.siteRow("https://news.example", all({ sitePolicyPending: true })).kind, "not-taken-in");
  assert.equal(S.siteRow("https://news.example", all({ allSitesRegistration: "failed" })).kind, "not-taken-in");
  for (const over of [{}, { broadGranted: false }, { paused: true }]) {
    for (const origin of ["https://news.example", "https://denied.example", "https://left.example"]) {
      assert.equal(S.siteRow(origin, all(over)).action, null);
    }
  }
});

test("missing all-sites access asks in the browser that can answer", () => {
  const missing = (brand) => S.derive(mockStatus({ brand, siteMode: "all", allSitesConsent: 1, broadGranted: false }));
  assert.equal(missing("chrome").kind, "all-sites-access");
  assert.equal(missing("chrome").action.id, "allow-all-sites");
  assert.equal(missing("firefox").action.id, "allow-all-sites");
  assert.equal(missing("safari").action.id, "open-settings");
  const stale = S.derive(mockStatus({ siteMode: "all", allSitesConsent: 0, broadGranted: true }));
  assert.equal(stale.kind, "all-sites-agreement");
  assert.equal(stale.action.id, "open-settings");
  const failed = S.derive(mockStatus({ siteMode: "all", allSitesConsent: 1, broadGranted: true, allSitesRegistration: "failed" }));
  assert.equal(failed.kind, "all-sites-registration");
  assert.equal(failed.action.id, "retry-all-sites");
});

test("an installed app that isn't open is opened, never downloaded again", () => {
  const C = globalThis.SolstoneCopy;
  const fresh = mockStatus({ everConnected: false, connected: false, hostCapture: null });
  const unknown = S.derive(fresh);
  assert.equal(unknown.kind, "cant-reach-app");
  assert.equal(unknown.action.id, "get-app");
  for (const patch of [{ appAnswered: true }, { brand: "safari" }]) {
    const derived = S.derive({ ...fresh, ...patch });
    assert.equal(derived.kind, "cant-reach-app");
    assert.equal(derived.mark, "paused");
    assert.equal(derived.reason, "the solstone app on this computer isn't answering. open it to go on.");
    assert.equal(derived.action, null);
    assert.equal(S.welcomeHold({ ...fresh, ...patch }).body, C.STEP1_OPEN_APP_BODY);
    assert.equal(S.welcomeHold({ ...fresh, ...patch }).action, null);
  }
});

test("on Linux a lost app names its next step", () => {
  const derived = S.derive(mockStatus({ platform: "linux", connected: false, hostCapture: null }));
  assert.equal(derived.kind, "cant-reach-app");
  assert.equal(derived.reason, globalThis.SolstoneCopy.linuxCantReachAppReason());
});

test("several sites the browser took back are allowed again with one prompt", () => {
  const two = S.derive(mockStatus({ consentVersion: 1, chosenOrigins: ["https://a.example", "https://b.example"],
    grantedOrigins: [], inactiveOrigins: ["https://a.example", "https://b.example"] }));
  const item = two.items.find((it) => it.kind === "sites-paused-by-browser");
  assert.deepEqual(item.action, { id: "allow-again-all", label: "allow them again" });
  const one = S.derive(mockStatus({ consentVersion: 1, chosenOrigins: ["https://a.example"],
    grantedOrigins: [], inactiveOrigins: ["https://a.example"] }));
  assert.equal(one.items.find((it) => it.kind === "sites-paused-by-browser").action, null);
});

test("a site's error row never shows an internal code", () => {
  const row = S.siteRow("https://a.example", mockStatus({ consentVersion: 1, chosenOrigins: ["https://a.example"],
    grantedOrigins: ["https://a.example"], registration: { "https://a.example": "failed" } }));
  assert.equal(row.kind, "error");
  assert.equal(row.label, "couldn't start on this site. remove it and add it again.");
});
