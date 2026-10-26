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

test("an action failure says what happened in owner words, never an internal code", () => {
  const C = globalThis.SolstoneCopy;
  assert.equal(F.classify("storage_error", { brand: "chrome" }), "couldn't save that. try again.");
  assert.equal(F.classify("permissions_changed", { brand: "firefox" }), "Firefox's permissions changed while saving. try again.");
  for (const code of ["capture_unavailable", "permission_not_granted", "registration_failed"]) {
    assert.equal(F.classify(code, { brand: "chrome" }), "couldn't add the site. try again.");
  }
  assert.equal(F.classify("missing_consent", { brand: "chrome" }), "finish setting up first.");
  assert.equal(F.classify("invalid_host", { brand: "chrome" }), C.FIELD_ERROR);
  for (const raw of ["weird thing happened", "policy_unavailable", "x".repeat(100), "<b>", null]) {
    const said = F.classify(raw, { brand: "chrome" });
    assert.equal(said, "something went wrong. try again.", String(raw));
  }
});

test("a site's row names its problem without internal codes", () => {
  const C = globalThis.SolstoneCopy;
  assert.equal(C.classifyFailure("failed", "chrome"), "couldn't start on this site. remove it and add it again.");
  assert.equal(C.classifyFailure("enqueue_failed", "chrome"), "a page from this site couldn't be kept. the extension tries again when the page changes.");
  assert.equal(C.classifyFailure("outbox-full", "chrome"), "no room for more from this site right now");
  assert.equal(C.classifyFailure("batch-oversize", "chrome"), "a page from this site couldn't be kept");
  assert.equal(C.classifyFailure("capture_unavailable", "chrome"), "something went wrong on this site");
  assert.equal(C.classifyFailure("Cannot access a chrome:// URL", "edge"), "Edge doesn't let extensions work on this page");
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
