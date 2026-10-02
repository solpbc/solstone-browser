// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import assert from "node:assert/strict";
import test from "node:test";

await import(new URL("../extension/lib/copy.js", import.meta.url));
await import(new URL("../extension/lib/failures.js", import.meta.url));

const F = globalThis.SolstoneFailures;

test("classify maps restricted failures", () => {
  assert.equal(F.classify("Cannot access chrome:// URL", { brand: "chrome" }), "Chrome doesn't let extensions work on this page");
  assert.equal(F.classify("moz-extension:// blocked", { brand: "firefox" }), "Firefox doesn't let extensions work on this page");
});

test("classify maps unmapped failures with token escaping", () => {
  assert.equal(F.classify("weird thing happened", { brand: "chrome" }), "something went wrong on this site: weird thing happened");
});

test("classify truncates long unmapped failures", () => {
  const result = F.classify("x".repeat(100), { brand: "chrome" });
  assert.equal(result.endsWith("…"), true);
  assert.ok(result.length <= "something went wrong on this site: ".length + 81);
});

test("contentScriptRegistrationSatisfied absorbs only an existing requested id", () => {
  assert.equal(F.contentScriptRegistrationSatisfied("cs-127.0.0.1", [
    { id: "cs-other.test" },
    { id: "cs-127.0.0.1" },
  ]), true);
  assert.equal(F.contentScriptRegistrationSatisfied("cs-127.0.0.1", []), false);
  assert.equal(F.contentScriptRegistrationSatisfied("cs-127.0.0.1", [{ id: "cs-other.test" }]), false);
  assert.equal(F.contentScriptRegistrationSatisfied("cs-127.0.0.1", null), false);
});
