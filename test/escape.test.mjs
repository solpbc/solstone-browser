// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { test } from "node:test";
import assert from "node:assert/strict";

await import(new URL("../extension/lib/escape.js", import.meta.url));
const E = globalThis.SolstoneEscape;

function assertEscaped(input) {
  const out = E.escapeHtml(input);
  assert.equal(/[<>"']/.test(out), false);
  assert.equal(/&(?!amp;|lt;|gt;|quot;|#39;)/.test(out), false);
  return out;
}

test("escapeHtml escapes individual dangerous characters", () => {
  assert.equal(E.escapeHtml("<>&\"'"), "&lt;&gt;&amp;&quot;&#39;");
  assertEscaped("<");
  assertEscaped(">");
  assertEscaped("&");
  assertEscaped('"');
  assertEscaped("'");
});

test("escapeHtml escapes html payloads", () => {
  assert.equal(assertEscaped("<img src=x onerror=alert(1)>"), "&lt;img src=x onerror=alert(1)&gt;");
  assert.equal(assertEscaped("<script>alert('x')</script>"), "&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;");
});

test("escapeHtml coerces non-string input", () => {
  assert.equal(E.escapeHtml(null), "");
  assert.equal(E.escapeHtml(42), "42");
});
