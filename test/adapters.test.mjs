// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc
//
// Tests for the adapter stable-id guard — the fix for the Gmail delta-churn
// found in the founder dogfood (volatile `:xxx` render-ids were used as keys).

import { test } from "node:test";
import assert from "node:assert/strict";

await import(new URL("../extension/lib/blocks.js", import.meta.url));
await import(new URL("../extension/adapters.js", import.meta.url));
const A = globalThis.SolstoneAdapters;

// a tiny element stub: { attrs: {...} } -> getAttribute
const el = (attrs) => ({ getAttribute: (k) => (k in attrs ? attrs[k] : null) });

test("isVolatileId rejects Gmail colon-prefixed render-ids", () => {
  assert.equal(A.isVolatileId(":mk"), true);
  assert.equal(A.isVolatileId(":my:k64xxd"), true);
  assert.equal(A.isVolatileId(":1vxl9at"), true);
  assert.equal(A.isVolatileId(""), true);
  assert.equal(A.isVolatileId(null), true);
});

test("isVolatileId keeps real stable ids", () => {
  assert.equal(A.isVolatileId("msg-f:1820abc"), false);
  assert.equal(A.isVolatileId("thread-123"), false);
  assert.equal(A.isVolatileId("1719600000.001"), false);
});

test("stableIdFor skips volatile id, prefers a real message id", () => {
  // only a volatile colon-id -> null (walker falls back to content hash)
  assert.equal(A.stableIdFor(el({ id: ":mk" }), A.GMAIL), null);
  // a real legacy-message-id is preferred over the volatile id
  assert.equal(A.stableIdFor(el({ "data-legacy-message-id": "msg-aaa111", id: ":mk" }), A.GMAIL), "msg-aaa111");
  // Slack's stable data-item-key survives
  assert.equal(A.stableIdFor(el({ "data-item-key": "1719600000.001", id: ":x" }), A.SLACK), "1719600000.001");
});
