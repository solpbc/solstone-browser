// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

await import(new URL("../extension/lib/copy.js", import.meta.url));
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
    lease: { expiresAt: Date.now() + 60000 },
    connectionGeneration: 1,
    connectionToken: "token-1",
    behind: null,
    pressure: { active: false },
    siteNotices: [],
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

  assert.equal(S.derive(mockStatus({ hostCapture: "intake_off", hostFailure: "unaccepted_lost" })).kind, "lost-and-held");
  assert.equal(S.derive(mockStatus({ hostCapture: "intake_off", hostFailure: "unaccepted_lost" })).mark, "attention");
  assert.equal(S.derive(mockStatus({ hostCapture: "intake_off", hostFailure: "unaccepted_lost" })).badge, "!");

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

  assert.equal(S.derive(mockStatus({ siteNotices: [{ origin: "https://example.com", kind: "registration", bound: "reload" }] })).kind, "site-error");
  assert.equal(S.derive(mockStatus({ siteNotices: [{ origin: "https://example.com", kind: "registration", bound: "reload" }] })).mark, "attention");
  assert.equal(S.derive(mockStatus({ siteNotices: [{ origin: "https://example.com", kind: "registration", bound: "reload" }] })).badge, "!");

  // Layer 6
  assert.equal(S.derive(mockStatus({ hostDelivery: "failed" })).kind, "delivery-failed");
  assert.equal(S.derive(mockStatus({ hostDelivery: "failed" })).mark, "offline");

  // Layer 7
  assert.equal(S.derive(mockStatus({ hostDelivery: "unknown" })).kind, "connecting");
  assert.equal(S.derive(mockStatus({ hostDelivery: "unknown" })).mark, "connecting");
  assert.equal(S.derive(mockStatus({ hostDelivery: "unknown" })).connecting, "delivery");

  assert.equal(S.derive(mockStatus(), { anyGrantedTabOpen: false }).kind, "idle");
  assert.equal(S.derive(mockStatus(), { anyGrantedTabOpen: false }).mark, "healthy");

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

test("siteRow distinguishes paused, truncated, reload-tab, idle, and on-now", () => {
  const status = mockStatus();

  // 1. paused-by-browser
  assert.deepEqual(S.siteRow("example.com", mockStatus({ inactiveOrigins: ["https://example.com"] })), {
    kind: "paused-by-browser",
    label: "paused by chrome",
    action: { id: "allow-again", label: "allow again" },
  });

  // 2. paused
  assert.deepEqual(S.siteRow("example.com", mockStatus({ paused: true })), {
    kind: "paused",
    label: "paused",
    action: null,
  });

  // 3. pressure-here
  assert.deepEqual(S.siteRow("example.com", mockStatus({ pressure: { active: true } }), { activeSites: ["example.com"] }), {
    kind: "pressure-here",
    label: "no room for more right now",
    action: null,
  });

  // 4. truncated
  assert.deepEqual(S.siteRow("example.com", mockStatus({ siteNotices: [{ origin: "https://example.com", kind: "truncation", bound: "1" }] })), {
    kind: "truncated",
    label: "part of this page was too long to keep",
    action: { id: "dismiss-truncation", label: "dismiss", bound: "1" },
  });

  // 5. reload-tab
  assert.deepEqual(S.siteRow("example.com", mockStatus({ siteNotices: [{ origin: "https://example.com", kind: "registration", bound: "reload" }] }), { activeSites: ["example.com"] }), {
    kind: "reload-tab",
    label: "reload this tab to begin",
    action: null,
  });

  // 6. added-idle
  assert.deepEqual(S.siteRow("example.com", mockStatus(), { activeSites: [] }), {
    kind: "added-idle",
    label: "added. open or reload a tab",
    action: null,
  });

  // 7. not-taken-in
  assert.deepEqual(S.siteRow("example.com", mockStatus({ hostCapture: "intake_off" }), { activeSites: ["example.com"] }), {
    kind: "not-taken-in",
    label: "not taken in right now",
    action: null,
  });

  // 8. on-now
  assert.deepEqual(S.siteRow("example.com", mockStatus(), { activeSites: ["example.com"] }), {
    kind: "on-now",
    label: "on now",
    action: null,
  });
});
