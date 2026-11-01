// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

// A site and a site under it both chosen, and how much of a site is read.
// Safari keeps only the broadest grant: allowing a parent drops the grant of
// every site under it, exact or whole-site, and a request for a parent while
// it allows a site under it resolves true without asking or granting.

import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";

await import(new URL("../extension/lib/copy.js", import.meta.url));
await import(new URL("../extension/lib/hosts.js", import.meta.url));
await import(new URL("../extension/lib/status.js", import.meta.url));
await import(new URL("../extension/lib/failures.js", import.meta.url));
await import(new URL("../extension/lib/popup_view.js", import.meta.url));

const H = globalThis.SolstoneHosts;
const View = globalThis.SolstonePopupView;

function loadApply() {
  const context = { globalThis: null, SolstoneHosts: H, URL };
  context.globalThis = context;
  vm.runInNewContext(fs.readFileSync(new URL("../extension/lib/owner_sites.js", import.meta.url), "utf8"), context);
  return context.SolstoneOwnerSites.apply;
}

function ownerState(overrides = {}) {
  return Object.assign({
    grantEpoch: 0, permissionEpoch: 0, chosen: [], granted: [], exactOnly: [], siteWide: [],
    reservation: null, registration: {}, enqueue: {},
  }, overrides);
}

function copyFor(navigator) {
  const context = vm.createContext({ navigator });
  vm.runInContext(fs.readFileSync(new URL("../extension/lib/copy.js", import.meta.url), "utf8"), context);
  return context.SolstoneCopy;
}

// --- grantLevel: an entry adopted from a browser grant (marked) ---

test("grantLevel: a marked entry under a live wider site grant is granted", () => {
  assert.equal(H.grantLevel("x.pair.test", ["*://*.pair.test/*"], true), "site");
  assert.equal(H.grantLevel("a.b.pair.test", ["*://*.pair.test/*"], true), "site");
  assert.equal(H.grantLevel("x.pair.test", [], true), null);
  // The all-sites grant still doesn't count for a marked entry.
  assert.equal(H.grantLevel("x.pair.test", ["*://*/*"], true), null);
  // Its own patterns come first: its own exact grant still reads exact.
  assert.equal(H.grantLevel("x.pair.test", ["*://x.pair.test/*", "*://*.pair.test/*"], true), "exact");
});

test("grantLevel: a covering grant never counts for the parent or a sibling", () => {
  for (const marked of [true, false]) {
    assert.equal(H.grantLevel("pair.test", ["*://*.x.pair.test/*"], marked), null);
    assert.equal(H.grantLevel("y.pair.test", ["*://*.x.pair.test/*"], marked), null);
    assert.equal(H.grantLevel("xpair.test", ["*://*.pair.test/*"], marked), null);
    assert.equal(H.grantLevel("pair.test.evil", ["*://*.pair.test/*"], marked), null);
  }
});

// --- exactScope: how much of a site is read ---

const X = "https://x.p2.test";

test("exactScope: an exact-only site whose own grant is gone stays exact under a covering grant", () => {
  const known = { chosen: [X], prior: [X], priorKnown: true };
  assert.deepEqual(H.exactScope({ ...known, live: ["*://*.p2.test/*"] }), [X]);
  assert.deepEqual(H.exactScope({ ...known, live: ["*://*/*"] }), [X]);
  assert.deepEqual(H.exactScope({ ...known, live: [] }), [X]);
});

test("exactScope: a site widens only when its own whole-site grant is live", () => {
  assert.deepEqual(H.exactScope({ chosen: [X], prior: [X], priorKnown: true, live: ["*://*.x.p2.test/*"] }), []);
  assert.deepEqual(H.exactScope({ chosen: [X], prior: [], priorKnown: true, live: ["*://x.p2.test/*"] }), [X]);
  assert.deepEqual(H.exactScope({ chosen: [X], prior: [], priorKnown: true, live: ["https://x.p2.test/*"] }), [X]);
  // A whole-site entry under a covering grant stays whole-site.
  assert.deepEqual(H.exactScope({ chosen: [X], prior: [], priorKnown: true, live: ["*://*.p2.test/*"] }), []);
});

test("exactScope: with no stored answer, a site covered only by someone else's grant counts as exact", () => {
  const first = { chosen: [X], prior: [], priorKnown: false };
  assert.deepEqual(H.exactScope({ ...first, live: ["*://*.p2.test/*"] }), [X]);
  assert.deepEqual(H.exactScope({ ...first, live: ["*://*/*"] }), [X]);
  assert.deepEqual(H.exactScope({ ...first, live: ["*://*.x.p2.test/*"] }), []);
  assert.deepEqual(H.exactScope({ ...first, live: ["*://x.p2.test/*"] }), [X]);
  assert.deepEqual(H.exactScope({ ...first, live: [] }), []);
});

test("exactScope: a port doesn't change which site it is", () => {
  const ported = "http://x.p2.test:8766";
  assert.deepEqual(H.exactScope({ chosen: [ported], prior: [ported], priorKnown: true, live: ["*://*.p2.test/*"] }), [ported]);
  assert.deepEqual(H.exactScope({ chosen: [ported], prior: [ported], priorKnown: true, live: ["*://*.x.p2.test/*"] }), []);
});

// --- owner_sites: the scope rule through the state machine ---

test("publish-grants: a marked sub-site stays granted when only its parent's grant is live", () => {
  const apply = loadApply();
  const out = apply(ownerState({ chosen: [X], siteWide: [X] }), {
    type: "publish-grants", livePatterns: ["*://*.p2.test/*"], epochAtStart: 0,
  });
  assert.deepEqual(out.state.granted, [X]);
  assert.deepEqual(out.state.exactOnly, []);
});

test("publish-grants: an exact-only site under a covering grant keeps its mark", () => {
  const apply = loadApply();
  const out = apply(ownerState({ chosen: [X], exactOnly: [X] }), {
    type: "publish-grants", livePatterns: ["*://*.p2.test/*"], epochAtStart: 0,
  });
  assert.deepEqual(out.state.granted, [X]);
  assert.deepEqual(out.state.exactOnly, [X]);
});

test("browser-removed: a lapsed exact-only site keeps its mark while chosen", () => {
  const apply = loadApply();
  const out = apply(ownerState({ chosen: [X], granted: [X], exactOnly: [X] }), {
    type: "browser-removed", patterns: ["*://x.p2.test/*"],
  });
  assert.deepEqual(out.state.granted, []);
  assert.deepEqual(out.state.exactOnly, [X]);
});

// --- router: the change hook that persists the list ---

test("applyOwnerEvent reports a changed exact-only list, and not an unchanged one or a removal", async () => {
  await import(new URL("../extension/lib/owner_sites.js", import.meta.url));
  await import(new URL("../extension/lib/router.js", import.meta.url));
  const Router = globalThis.SolstoneRouter;
  const seen = [];
  const port = {
    chosenOrigins: new Set([X]), grantedOrigins: new Set(), exactOnlyOrigins: new Set([X]),
    exactOnlyKnown: true, siteWideOrigins: [], permissionEpoch: 0, ownerSites: {},
    onExactOnlyChange: (list) => seen.push(list),
  };
  Router.applyOwnerEvent(port, { type: "publish-grants", livePatterns: ["*://*.p2.test/*"], epochAtStart: 0 });
  assert.deepEqual(seen, []);
  Router.applyOwnerEvent(port, { type: "publish-grants", livePatterns: ["*://*.x.p2.test/*"], epochAtStart: 0 });
  assert.deepEqual(seen, [[]]);
  port.exactOnlyOrigins = new Set([X]);
  Router.applyOwnerEvent(port, { type: "owner-remove", origin: X, coveringHosts: [] });
  assert.equal(seen.length, 1);
  assert.equal(port.exactOnlyOrigins.has(X), false);
});

// --- grantSite: a failed add names the granted site under it ---

function addEffects({ granted = false, live = [], added = { ok: true }, getAll = true } = {}) {
  const calls = [];
  const effects = {
    status: { consentVersion: 1, addSiteEligible: true },
    cmd: async (message) => {
      calls.push(message.cmd);
      if (message.cmd === "getState") return { consentVersion: 1, addSiteEligible: true };
      if (message.cmd === "addGrantedOrigin") return added;
      return { ok: true };
    },
    requestPermission: async () => { calls.push("permission"); return granted; },
  };
  if (getAll === "throws") effects.getAllPermissions = async () => { throw new Error("fixture"); };
  else if (getAll) effects.getAllPermissions = async () => ({ origins: live });
  return { effects, calls };
}

test("grantSite names the site under it when Safari refuses the parent", async () => {
  let { effects } = addEffects({ granted: false, live: ["*://*.x.pair.test/*"] });
  assert.deepEqual(await View.grantSite("pair.test", effects), { ok: false, denied: true, blockedBy: "x.pair.test" });
  // Safari says yes without granting: the add then fails, whatever its error.
  ({ effects } = addEffects({ granted: true, live: ["*://*.x.pair.test/*"], added: { ok: false, error: "permission_not_granted" } }));
  assert.deepEqual(await View.grantSite("https://pair.test", effects), { ok: false, denied: true, blockedBy: "x.pair.test" });
  ({ effects } = addEffects({ granted: true, live: ["*://*.x.pair.test/*"], added: { ok: false, error: "capture_unavailable" } }));
  assert.equal((await View.grantSite("https://pair.test", effects)).blockedBy, "x.pair.test");
  // The page's port isn't part of the site.
  ({ effects } = addEffects({ granted: false, live: ["*://*.x.q.test/*"] }));
  assert.equal((await View.grantSite("http://q.test:8766", effects)).blockedBy, "x.q.test");
});

test("grantSite names nothing when nothing under the site explains the failure", async () => {
  const cases = [
    [],
    ["*://*.pair.test/*"],
    ["*://*.xpair.test/*"],
    ["*://*.pair.test.evil/*"],
    ["*://x.pair.test/*"],
  ];
  for (const live of cases) {
    const { effects } = addEffects({ granted: false, live });
    assert.equal((await View.grantSite("pair.test", effects)).blockedBy, undefined, JSON.stringify(live));
  }
  // Adding the sub-site under a granted parent isn't this case.
  let { effects } = addEffects({ granted: false, live: ["*://*.pair.test/*"] });
  assert.equal((await View.grantSite("x.pair.test", effects)).blockedBy, undefined);
  // The site's own grant is live: the failure came after the browser said yes.
  ({ effects } = addEffects({ granted: true, live: ["*://*.pair.test/*", "*://*.x.pair.test/*"], added: { ok: false, error: "registration_failed" } }));
  assert.deepEqual(await View.grantSite("pair.test", effects), { ok: false, error: "registration_failed" });
  // No way to read the grants, or reading them fails: the result is unchanged.
  ({ effects } = addEffects({ granted: false, live: ["*://*.x.pair.test/*"], getAll: false }));
  assert.deepEqual(await View.grantSite("pair.test", effects), { ok: false, denied: true });
  ({ effects } = addEffects({ granted: false, getAll: "throws" }));
  assert.deepEqual(await View.grantSite("pair.test", effects), { ok: false, denied: true });
});

test("grantSite still asks the browser before reading its grants", async () => {
  const { effects, calls } = addEffects({ granted: false, live: ["*://*.x.pair.test/*"] });
  const original = effects.getAllPermissions;
  effects.getAllPermissions = async () => { calls.push("getAll"); return original(); };
  await View.addSite("pair.test", { ...effects, disclose: (_host, confirm) => confirm() });
  assert.ok(calls.indexOf("permission") >= 0 && calls.indexOf("permission") < calls.indexOf("getAll"), calls.join(","));
});

// --- grantChosenSites: widening asks for the whole site ---

test("grantChosenSites with widen asks for the whole site of an exact-only entry", async () => {
  let requested = [];
  await View.grantChosenSites(["https://old.example"], {
    status: { siteMode: "selected", chosenOrigins: ["https://old.example"], exactOnlyOrigins: ["https://old.example"] },
    cmd: async () => ({ ok: true }),
    requestPermission: async (req) => { requested = req.origins; return true; },
  }, { widen: true });
  assert.deepEqual(requested, ["*://*.old.example/*"]);
});

// --- copy: which browser gets which words (keys, not words) ---

test("the add-failed line is only for Safari on a Mac", () => {
  const C = globalThis.SolstoneCopy;
  assert.ok(C.addBlockedBelow("safari", "pair.test", "x.pair.test").length > 0);
  for (const brand of ["chrome", "edge", "firefox", undefined]) {
    assert.equal(C.addBlockedBelow(brand, "pair.test", "x.pair.test"), "");
  }
  const pad = copyFor({ userAgent: "Mozilla/5.0 (Macintosh)", platform: "MacIntel", maxTouchPoints: 5 });
  assert.equal(pad.addBlockedBelow("safari", "pair.test", "x.pair.test"), "");
  const phone = copyFor({ userAgent: "Mozilla/5.0 (iPhone)", platform: "iPhone" });
  assert.equal(phone.addBlockedBelow("safari", "pair.test", "x.pair.test"), "");
});

test("Safari's exact-only bar offers no button; other browsers keep it", () => {
  const C = globalThis.SolstoneCopy;
  for (const hosts of [["old.example"], ["a.example", "b.example"]]) {
    const safari = C.exactOnlyCopy("safari", hosts);
    assert.ok(safari.line.length > 0);
    assert.equal(safari.label, "");
    assert.ok(C.exactOnlyCopy("chrome", hosts).label.length > 0);
  }
});
