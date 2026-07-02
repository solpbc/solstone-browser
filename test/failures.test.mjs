// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import assert from "node:assert/strict";
import test from "node:test";

await import(new URL("../extension/lib/failures.js", import.meta.url));

const F = globalThis.SolstoneFailures;

test("classify maps network failures", () => {
  const line = "your journal didn't answer — is solstone running on this computer?";
  assert.equal(F.classify("TypeError: Failed to fetch", 0), line);
  assert.equal(F.classify("NetworkError when attempting to fetch", undefined), line);
});

test("classify maps HTTP failures", () => {
  assert.equal(F.classify("register failed: HTTP 404 {}", undefined), "your journal said no (HTTP 404) — try again, or check settings");
  assert.equal(F.classify("boom", 500), "your journal said no (HTTP 500) — try again, or check settings");
});

test("classify maps chrome-restricted failures", () => {
  assert.equal(F.classify("Cannot access chrome:// URL", undefined), "chrome doesn't allow observing this page");
});

test("classify maps unmapped failures", () => {
  assert.equal(F.classify("weird thing happened", undefined), "something went wrong — weird thing happened");
});

test("classify truncates long unmapped failures", () => {
  const result = F.classify("x".repeat(100), undefined);
  assert.equal(result.endsWith("…"), true);
  assert.ok(result.length <= "something went wrong — ".length + 81);
});
