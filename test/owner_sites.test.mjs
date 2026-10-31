// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";

const sourcePath = new URL("../extension/lib/owner_sites.js", import.meta.url);
await import(new URL("../extension/lib/hosts.js", import.meta.url));

function loadApply() {
  const context = { globalThis: null, SolstoneHosts: globalThis.SolstoneHosts, URL };
  context.globalThis = context;
  vm.runInNewContext(fs.readFileSync(sourcePath, "utf8"), context);
  return context.SolstoneOwnerSites.apply;
}

function ownerState(overrides = {}) {
  return Object.assign({
    grantEpoch: 0,
    permissionEpoch: 0,
    chosen: [],
    granted: [],
    reservation: null,
    registration: {},
    enqueue: {},
  }, overrides);
}

test("owner-site transition rejects an epoch mismatch despite a live reservation", () => {
  assert.equal(fs.existsSync(sourcePath), true, "the owner-site transition module must be installed");
  const context = { globalThis: null };
  context.globalThis = context;
  vm.runInNewContext(fs.readFileSync(sourcePath, "utf8"), context);
  const apply = context.SolstoneOwnerSites?.apply;
  assert.equal(typeof apply, "function");

  const state = {
    grantEpoch: 0,
    permissionEpoch: 1,
    chosen: [],
    granted: [],
    reservation: {origin:"https://first.example", pattern:"*://first.example/*", expiresAt:120000},
    registration: {},
    enqueue: {},
  };
  const transition = apply(state, {
    type: "begin-add",
    origin: "https://first.example",
    now: 1,
    liveAuth: true,
    hasPerm: true,
    capturedGrantEpoch: 0,
    capturedPermissionEpoch: 0,
  });
  assert.equal(transition.result.ok, false);
  assert.equal(transition.result.error, "capture_unavailable");
  assert.equal(state.chosen.includes("https://first.example"), false);
  assert.equal(state.granted.includes("https://first.example"), false);
  assert.equal(state.reservation, null);
});

test("owner-site reserve and cancel change no owner choices or grants", () => {
  const apply = loadApply();
  const origin = "https://same.example";
  const sibling = "https://same.example:8443";
  const pattern = globalThis.SolstoneHosts.matchPatternFor("same.example");
  const state = ownerState({chosen:[sibling], granted:[sibling]});
  apply(state, {type:"reserve", origin, pattern, now:500});
  assert.equal(state.reservation.expiresAt, 120500);
  assert.equal(state.chosen.length, 1);
  assert.equal(state.granted.length, 1);
  apply(state, {type:"drop-reservation"});
  assert.equal(state.reservation, null);
  assert.equal(state.chosen[0], sibling);
  assert.equal(state.granted[0], sibling);
});

test("owner-site removal closes first and keeps only unrelated owner state", () => {
  const apply = loadApply();
  const origin = "https://same.example";
  const sibling = "https://same.example:8443";
  const state = ownerState({
    chosen:[origin, sibling], granted:[origin, sibling],
    reservation:{origin, pattern:"*://same.example/*", expiresAt:120000},
  });
  const removed = apply(state, {type:"owner-remove", origin});
  assert.equal(removed.effects[0], "publish-closed");
  assert.equal(state.chosen.length, 1);
  assert.equal(state.chosen[0], sibling);
  assert.equal(state.granted.length, 1);
  assert.equal(state.granted[0], sibling);
  assert.equal(state.grantEpoch, 1);
  assert.equal(state.reservation, null);

  const browserState = ownerState({chosen:[origin, sibling], granted:[origin, sibling]});
  const browser = apply(browserState, {type:"browser-removed", patterns:["*://same.example/*"]});
  assert.equal(browser.effects[0], "publish-closed");
  assert.equal(browserState.chosen.length, 2);
  assert.equal(browserState.granted.length, 0);
  assert.equal(browserState.permissionEpoch, 1);
});

test("owner-site permission publication honors epochs and shared patterns", () => {
  const apply = loadApply();
  const first = "https://same.example";
  const second = "https://same.example:8443";
  const pattern = globalThis.SolstoneHosts.matchPatternFor("same.example");
  const state = ownerState({chosen:[first, second]});
  apply(state, {type:"reserve", origin:first, pattern, now:0});
  const sameIntent = apply(state, {type:"browser-added-sync", patterns:[pattern], now:1});
  assert.equal(state.permissionEpoch, 0);
  assert.equal(sameIntent.result.epochAtStart, 0);
  const published = apply(state, {type:"publish-grants", livePatterns:[pattern], epochAtStart:0});
  assert.equal(published.result.ok, true);
  assert.equal(state.granted.length, 2);

  apply(state, {type:"browser-removed", patterns:[pattern]});
  const stale = apply(state, {type:"publish-grants", livePatterns:[pattern], epochAtStart:0});
  assert.equal(stale.result.stale, true);
  assert.equal(state.granted.length, 0);
  assert.equal(state.chosen.length, 2);

  const expired = apply(state, {type:"browser-added-sync", patterns:[pattern], now:120000});
  assert.equal(state.permissionEpoch, 2);
  assert.equal(expired.result.epochAtStart, 2);
});

test("owner-site fences preserve a choice only after its durable write", () => {
  const apply = loadApply();
  const origin = "https://same.example";
  const state = ownerState();
  const denied = apply(state, {
    type:"begin-add", origin, now:1, liveAuth:false, hasPerm:true,
    capturedGrantEpoch:0, capturedPermissionEpoch:0,
  });
  assert.equal(denied.result.error, "capture_unavailable");
  assert.equal(state.chosen.length, 0);
  assert.equal(state.granted.length, 0);

  const choiceState = ownerState({chosen:[origin], permissionEpoch:1});
  const permissionMoved = apply(choiceState, {
    type:"fence-add", origin, capturedGrantEpoch:0, capturedPermissionEpoch:0,
    phase:"after-choice-write",
  });
  assert.equal(permissionMoved.result.error, "capture_unavailable");
  assert.equal(choiceState.chosen.length, 1);
  assert.equal(choiceState.granted.length, 0);

  const withdrawn = ownerState({grantEpoch:1});
  const grantMoved = apply(withdrawn, {
    type:"fence-add", origin, capturedGrantEpoch:0, capturedPermissionEpoch:0,
    phase:"after-choice-write",
  });
  assert.equal(grantMoved.effects.includes("align-durable-to-memory"), true);
  assert.equal(withdrawn.chosen.length, 0);
  assert.equal(withdrawn.granted.length, 0);
});

test("owner-site registration status is per exact origin and failure keeps grant state", () => {
  const apply = loadApply();
  const origin = "https://same.example";
  const state = ownerState({chosen:[origin], granted:[origin]});
  apply(state, {type:"note-registration", origin, status:"failed", capturedGrantEpoch:0, capturedPermissionEpoch:0});
  assert.equal(state.registration[origin], "failed");
  assert.equal(state.chosen[0], origin);
  assert.equal(state.granted[0], origin);
  apply(state, {type:"note-registration", origin, status:"reload", capturedGrantEpoch:0, capturedPermissionEpoch:0});
  assert.equal(state.registration[origin], "reload");
  apply(state, {type:"note-registration", origin, status:"ready", capturedGrantEpoch:0, capturedPermissionEpoch:0});
  assert.equal(Object.hasOwn(state.registration, origin), false);
});
