// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

// Load frozen v0.5.9 oracle in an isolated VM context
function loadOracle() {
  const context = {
    globalThis: null,
    URL,
    Set,
    Array,
    String,
    RegExp,
  };
  context.globalThis = context;
  const hostsCode = fs.readFileSync(new URL("./fixtures/grant-oracle/hosts.js", import.meta.url), "utf8");
  const ownerSitesCode = fs.readFileSync(new URL("./fixtures/grant-oracle/owner_sites.js", import.meta.url), "utf8");
  vm.runInNewContext(hostsCode, context);
  vm.runInNewContext(ownerSitesCode, context);
  return {
    Hosts: context.SolstoneHosts,
    OwnerSites: context.SolstoneOwnerSites,
  };
}

// Load updated hosts.js
await import(new URL("../extension/lib/hosts.js", import.meta.url));
const NewHosts = globalThis.SolstoneHosts;
const oracle = loadOracle();

const ROWS = [
  {
    id: "A",
    chosen: ["https://bank.com"],
    exactOnly: "ABSENT",
    livePatterns: ["*://*/*"],
    pages: [
      "https://bank.com", "https://login.bank.com", "https://www.bank.com",
      "http://bank.com", "https://bank.com:8443", "https://notbank.com",
      "https://bank.com.evil.net", "https://bank.com./",
    ],
  },
  {
    id: "B",
    chosen: ["https://bank.com"],
    exactOnly: [],
    livePatterns: ["*://*/*"],
    pages: [
      "https://bank.com", "https://login.bank.com", "https://www.bank.com",
      "http://bank.com", "https://bank.com:8443", "https://notbank.com",
      "https://bank.com.evil.net", "https://bank.com./",
    ],
  },
  {
    id: "C",
    chosen: ["https://bank.com"],
    exactOnly: ["https://bank.com"],
    livePatterns: ["*://*.bank.com/*"],
    pages: [
      "https://bank.com", "https://login.bank.com", "https://www.bank.com",
      "http://bank.com", "https://bank.com:8443", "https://notbank.com",
      "https://bank.com.evil.net", "https://bank.com./",
    ],
  },
  {
    id: "D",
    chosen: ["https://bank.com"],
    exactOnly: [],
    siteWide: ["https://bank.com"],
    livePatterns: ["*://*/*"],
    pages: [
      "https://bank.com", "https://login.bank.com", "https://www.bank.com",
      "http://bank.com", "https://bank.com:8443", "https://notbank.com",
      "https://bank.com.evil.net", "https://bank.com./",
    ],
  },
  {
    id: "E",
    chosen: ["https://bank.com"],
    exactOnly: [],
    siteWide: ["https://bank.com"],
    livePatterns: ["*://*.bank.com/*"],
    pages: [
      "https://bank.com", "https://login.bank.com", "https://www.bank.com",
      "http://bank.com", "https://bank.com:8443", "https://notbank.com",
      "https://bank.com.evil.net", "https://bank.com./",
    ],
  },
  {
    id: "F",
    chosen: ["https://bank.com"],
    exactOnly: [],
    livePatterns: ["*://*.bank.com/*"],
    pages: [
      "https://bank.com", "https://login.bank.com", "https://www.bank.com",
      "http://bank.com", "https://bank.com:8443", "https://notbank.com",
      "https://bank.com.evil.net", "https://bank.com./",
    ],
  },
  {
    id: "G",
    chosen: ["https://bank.com"],
    exactOnly: [],
    livePatterns: ["https://bank.com/*"],
    pages: ["https://bank.com", "https://login.bank.com", "http://bank.com"],
  },
  {
    id: "H",
    chosen: ["https://bank.com"],
    exactOnly: [],
    livePatterns: ["https://*.bank.com/*"],
    pages: ["https://bank.com", "https://login.bank.com", "http://bank.com"],
  },
  {
    id: "I",
    chosen: ["https://bank.com"],
    exactOnly: [],
    livePatterns: ["<all_urls>"],
    pages: ["https://bank.com", "https://login.bank.com", "http://bank.com"],
  },
  {
    id: "J",
    chosen: ["https://bank.com"],
    exactOnly: [],
    livePatterns: ["http://*/*"],
    pages: ["https://bank.com", "https://login.bank.com", "http://bank.com"],
  },
  {
    id: "K",
    chosen: ["https://bank.com"],
    exactOnly: [],
    livePatterns: ["https://*/*"],
    pages: ["https://bank.com", "https://login.bank.com", "http://bank.com"],
  },
  {
    id: "L",
    chosen: ["https://bank.com"],
    exactOnly: [],
    livePatterns: ["*://bank.com:443/*"],
    pages: ["https://bank.com", "https://bank.com:443"],
  },
  {
    id: "M",
    chosen: ["http://localhost:5015"],
    exactOnly: [],
    livePatterns: ["*://localhost/*"],
    pages: ["http://localhost:5015", "http://localhost:8080", "https://localhost", "http://localhost"],
  },
  {
    id: "N",
    chosen: ["https://login.bank.com"],
    exactOnly: ["https://login.bank.com"],
    livePatterns: ["*://*.bank.com/*"],
    pages: ["https://login.bank.com", "https://a.login.bank.com", "https://bank.com"],
  },
  {
    id: "O",
    chosen: ["https://login.bank.com"],
    exactOnly: [],
    livePatterns: ["*://*.bank.com/*"],
    pages: ["https://login.bank.com", "https://a.login.bank.com", "https://bank.com"],
  },
  {
    id: "P",
    chosen: ["https://bank.com"],
    exactOnly: [],
    livePatterns: ["*://*.bank.com/*"],
    excludedHosts: ["bank.com"],
    pages: ["https://bank.com", "https://login.bank.com"],
  },
  {
    id: "Q",
    chosen: ["https://bank.com"],
    exactOnly: [],
    livePatterns: ["*://*.bank.com/*"],
    appLeftOut: ["bank.com"],
    excludedHosts: [],
    pages: ["https://bank.com", "https://login.bank.com"],
  },
  {
    id: "R",
    chosen: ["https://bank.com"],
    exactOnly: [],
    declinedHosts: ["bank.com"],
    livePatterns: ["*://*.bank.com/*"],
    pages: ["https://bank.com", "https://login.bank.com"],
  },
  {
    id: "S",
    chosen: [],
    siteMode: "all",
    allSitesConsent: 1,
    livePatterns: ["*://*/*"],
    pages: ["https://bank.com", "https://login.bank.com", "http://localhost:5015"],
  },
  {
    id: "T",
    chosen: [],
    siteMode: "all",
    allSitesConsent: 0,
    livePatterns: ["*://*/*"],
    pages: ["https://bank.com", "https://login.bank.com", "http://localhost:5015"],
  },
  {
    id: "U",
    chosen: [],
    siteMode: "all",
    allSitesConsent: 1,
    livePatterns: [],
    pages: ["https://bank.com", "https://login.bank.com", "http://localhost:5015"],
  },
  {
    id: "V",
    chosen: [],
    siteMode: "all",
    allSitesConsent: 1,
    livePatterns: ["<all_urls>"],
    pages: ["https://bank.com"],
  },
  {
    id: "W",
    chosen: [],
    siteMode: "all",
    allSitesConsent: 1,
    livePatterns: ["https://*/*"],
    pages: ["https://bank.com"],
  },
  {
    id: "X",
    chosen: ["https://bank.com"],
    exactOnly: [],
    sitePolicyPending: true,
    livePatterns: ["*://*.bank.com/*"],
    pages: ["https://bank.com"],
  },
  {
    id: "Y",
    chosen: ["https://www.bank.com"],
    exactOnly: [],
    livePatterns: ["*://*.www.bank.com/*"],
    pages: ["https://www.bank.com", "https://bank.com", "https://login.bank.com"],
  },
  {
    id: "Y2",
    chosen: ["https://bank.com"],
    exactOnly: [],
    livePatterns: ["*://*.bank.com/*"],
    pages: ["https://www.bank.com", "https://bank.com", "https://login.bank.com"],
  },
  {
    id: "Z",
    chosen: ["https://myhost.local"],
    exactOnly: [],
    livePatterns: ["*://*.myhost.local/*"],
    pages: ["https://myhost.local", "https://a.myhost.local"],
  },
  {
    id: "Z2",
    chosen: ["https://a.myhost.local"],
    exactOnly: [],
    livePatterns: ["*://*.myhost.local/*"],
    pages: ["https://myhost.local", "https://a.myhost.local"],
  },
  {
    id: "AA",
    chosen: ["https://bank.com", "https://other.com"],
    exactOnly: [],
    livePatterns: ["*://*.bank.com/*"],
    pages: ["https://bank.com", "https://other.com", "https://login.bank.com"],
  },
  {
    id: "AB",
    chosen: ["https://bank.com"],
    exactOnly: "ABSENT",
    livePatterns: [],
    pages: ["https://bank.com", "https://login.bank.com"],
  },
];

function ownerFence(row) {
  const exactKnown = row.exactOnly !== "ABSENT";
  const exact = exactKnown && Array.isArray(row.exactOnly) ? [...row.exactOnly] : [];
  return {
    entries: [...row.chosen],
    exact,
    exactKnown,
    siteWide: [...(row.siteWide || [])],
    declined: [...(row.declinedHosts || [])],
    answered: false,
    sawMore: false,
    cleanAt: null,
  };
}

function runRow(row) {
  // Oracle setup
  const state = {
    chosen: [...row.chosen],
    granted: [],
    siteWide: [...(row.siteWide || [])],
    permissionEpoch: 0,
    grantEpoch: 0,
    declinedHosts: new Set(row.declinedHosts || []),
  };
  if (row.exactOnly === "ABSENT") {
    state.exactOnlyKnown = false;
  } else {
    state.exactOnly = Array.isArray(row.exactOnly) ? [...row.exactOnly] : [];
    state.exactOnlyKnown = true;
  }

  oracle.OwnerSites.apply(state, {
    type: "publish-grants",
    livePatterns: row.livePatterns,
    epochAtStart: 0,
  });

  const broadGranted = row.livePatterns.includes("*://*/*");
  const oracleResults = {};
  for (const page of row.pages) {
    oracleResults[page] = oracle.Hosts.originGranted({
      sitePolicyPending: row.sitePolicyPending || false,
      excludedHosts: row.excludedHosts || [],
      appLeftOut: row.appLeftOut || [],
      siteMode: row.siteMode || "selected",
      allSitesConsent: row.allSitesConsent || 0,
      broadGranted,
      exactOnlyOrigins: state.exactOnly,
      siteWideOrigins: state.siteWide,
      grantedOrigins: state.granted,
      pendingRemoveOrigins: [],
    }, page);
  }

  const applied = NewHosts.applySnapshotToFence(ownerFence(row), row.livePatterns, {
    leftOutHosts: [...(row.excludedHosts || []), ...(row.appLeftOut || [])],
  });
  const fence = applied.fence;

  const fenceResults = {};
  for (const page of row.pages) {
    fenceResults[page] = NewHosts.originGranted({
      sitePolicyPending: row.sitePolicyPending || false,
      excludedHosts: row.excludedHosts || [],
      appLeftOut: row.appLeftOut || [],
      livePatterns: row.livePatterns,
      fence,
    }, page);
  }

  return { oracleResults, fenceResults };
}

test("oracle freeze and fence monotonicity", () => {
  const namedExpectedDiscrepancies = new Set([
    "C:https://login.bank.com",
    "C:https://www.bank.com",
    "R:https://bank.com",
    "R:https://login.bank.com",
    "S:https://bank.com",
    "S:https://login.bank.com",
    "S:http://localhost:5015",
  ]);

  let fenceTrueCount = 0;
  let oracleTrueCount = 0;
  const discoveredDiscrepancies = [];

  for (const row of ROWS) {
    const { oracleResults, fenceResults } = runRow(row);
    for (const page of row.pages) {
      const oVal = oracleResults[page];
      const fVal = fenceResults[page];

      if (fVal) fenceTrueCount++;
      if (oVal) oracleTrueCount++;

      if (fVal) {
        assert.equal(
          oVal,
          true,
          `Violation: fence-true implies oracle-true failed for row ${row.id} on ${page}`
        );
      }
      if (oVal && !fVal) {
        const key = `${row.id}:${page}`;
        discoveredDiscrepancies.push(key);
      }
    }
  }

  // Assert named oracle-true / fence-false cells
  for (const key of namedExpectedDiscrepancies) {
    assert.equal(
      discoveredDiscrepancies.includes(key),
      true,
      `Expected oracle-true/fence-false discrepancy missing for ${key}`
    );
  }

  // Ensure no other unexpected discrepancies for fenced rows
  assert.deepEqual(
    discoveredDiscrepancies.sort(),
    Array.from(namedExpectedDiscrepancies).sort()
  );
});

test("siteMode all reads stay on the fence applier, and a clean read auto-ends", () => {
  const wall = 1_000_000;
  for (const row of ROWS.filter((item) => item.siteMode === "all")) {
    const first = NewHosts.applySnapshotToFence(ownerFence(row), row.livePatterns, { wallNow: wall });
    const later = NewHosts.applySnapshotToFence(first.fence, row.livePatterns, { wallNow: wall + 60000 });
    if (row.id === "U") {
      assert.equal(first.ended, false);
      assert.ok(first.fence);
      assert.equal(first.fence.sawMore, false);
      assert.equal(first.fence.cleanAt, wall);
      assert.equal(later.ended, true);
      assert.ok(later.fence);
      assert.equal(later.fence.cleanAt, wall);
      const finished = NewHosts.finishFence(later.fence, row.livePatterns, []);
      assert.equal(finished.fence, null);
      const after = NewHosts.applySnapshotToFence(null, row.livePatterns, { wallNow: wall + 120000 });
      assert.equal(after.fence, null);
      assert.equal(after.ended, false);
    } else {
      assert.equal(first.ended, false);
      assert.equal(first.fence.sawMore, true);
      assert.notEqual(later.fence, null);
      assert.equal(later.ended, false);
      for (const page of row.pages) {
        assert.equal(NewHosts.originGranted({
          livePatterns: row.livePatterns,
          fence: later.fence,
        }, page), false, `${row.id}:${page}`);
      }
    }
  }
});

test("plainAllow grammar 7.1", () => {
  // *://*/* and <all_urls>
  assert.equal(NewHosts.plainAllow("*://*/*", "https://bank.com"), true);
  assert.equal(NewHosts.plainAllow("*://*/*", "http://bank.com"), true);
  assert.equal(NewHosts.plainAllow("<all_urls>", "https://bank.com"), true);
  assert.equal(NewHosts.plainAllow("<all_urls>", "http://bank.com"), true);
  assert.equal(NewHosts.plainAllow("*://*/*", "ftp://bank.com"), false);

  // http(s)://*/*
  assert.equal(NewHosts.plainAllow("http://*/*", "http://bank.com"), true);
  assert.equal(NewHosts.plainAllow("http://*/*", "https://bank.com"), false);
  assert.equal(NewHosts.plainAllow("https://*/*", "https://bank.com"), true);
  assert.equal(NewHosts.plainAllow("https://*/*", "http://bank.com"), false);

  // *://*.h/*
  assert.equal(NewHosts.plainAllow("*://*.bank.com/*", "https://bank.com"), true);
  assert.equal(NewHosts.plainAllow("*://*.bank.com/*", "http://login.bank.com"), true);
  assert.equal(NewHosts.plainAllow("*://*.bank.com/*", "https://bank.com:8443"), true);
  assert.equal(NewHosts.plainAllow("*://*.bank.com/*", "https://notbank.com"), false);
  assert.equal(NewHosts.plainAllow("*://*.bank.com/*", "https://bank.com.evil.net"), false);
  // .local is not special here
  assert.equal(NewHosts.plainAllow("*://*.myhost.local/*", "http://a.myhost.local"), true);
  assert.equal(NewHosts.plainAllow("*://*.myhost.local/*", "http://myhost.local"), true);

  // https://*.h/* and http://*.h/*
  assert.equal(NewHosts.plainAllow("https://*.bank.com/*", "https://bank.com"), true);
  assert.equal(NewHosts.plainAllow("https://*.bank.com/*", "http://bank.com"), false);
  assert.equal(NewHosts.plainAllow("http://*.bank.com/*", "http://bank.com"), true);
  assert.equal(NewHosts.plainAllow("http://*.bank.com/*", "https://bank.com"), false);

  // *://h/*
  assert.equal(NewHosts.plainAllow("*://bank.com/*", "https://bank.com"), true);
  assert.equal(NewHosts.plainAllow("*://bank.com/*", "http://bank.com"), true);
  assert.equal(NewHosts.plainAllow("*://bank.com/*", "https://bank.com:8443"), true);
  assert.equal(NewHosts.plainAllow("*://bank.com/*", "https://login.bank.com"), false);

  // https://h/* and http://h/*
  assert.equal(NewHosts.plainAllow("https://bank.com/*", "https://bank.com"), true);
  assert.equal(NewHosts.plainAllow("https://bank.com/*", "http://bank.com"), false);
  assert.equal(NewHosts.plainAllow("https://bank.com/*", "https://login.bank.com"), false);
  assert.equal(NewHosts.plainAllow("http://bank.com/*", "http://bank.com"), true);
  assert.equal(NewHosts.plainAllow("http://bank.com/*", "https://bank.com"), false);

  // Port-bearing pattern
  assert.equal(NewHosts.plainAllow("*://bank.com:443/*", "https://bank.com"), true);
  assert.equal(NewHosts.plainAllow("*://bank.com:443/*", "https://bank.com:8443"), false);
  assert.equal(NewHosts.plainAllow("*://bank.com:443/*", "http://bank.com"), false);
  assert.equal(NewHosts.plainAllow("http://localhost:5015/*", "http://localhost:5015"), true);
  assert.equal(NewHosts.plainAllow("http://localhost:5015/*", "http://localhost:8080"), false);

  // Anything else
  assert.equal(NewHosts.plainAllow("not a pattern", "https://bank.com"), false);
  assert.equal(NewHosts.plainAllow("*://*.bank.com/path", "https://bank.com"), false);
});

test("patternAccounted and broadLive", () => {
  assert.equal(NewHosts.broadLive(["*://*/*"]), true);
  assert.equal(NewHosts.broadLive(["<all_urls>"]), true);
  assert.equal(NewHosts.broadLive(["http://*/*"]), true);
  assert.equal(NewHosts.broadLive(["https://*/*"]), true);
  assert.equal(NewHosts.broadLive(["*://*.bank.com/*"]), false);
  assert.equal(NewHosts.broadLive([]), false);

  const fence1 = {
    entries: ["https://bank.com"],
    exact: [],
  };
  // Accounted for entry https://bank.com not exact
  assert.equal(NewHosts.patternAccounted("*://*.bank.com/*", fence1, []), true);
  assert.equal(NewHosts.patternAccounted("*://bank.com/*", fence1, []), true);

  const fence2 = {
    entries: ["https://login.bank.com"],
    exact: [],
  };
  // Beyond for entry https://login.bank.com
  assert.equal(NewHosts.patternAccounted("*://*.bank.com/*", fence2, []), false);

  // Left-out host makes pattern accounted (not beyond)
  assert.equal(NewHosts.patternAccounted("*://*.bank.com/*", fence2, ["bank.com"]), true);
  assert.equal(NewHosts.patternAccounted("https://*/*", fence1, ["bank.com"]), false);
});
