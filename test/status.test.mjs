// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

await import(new URL("../extension/lib/status.js", import.meta.url));

const S = globalThis.SolstoneStatus;

const cells = [
  [{}, { prefix: "icon-paused-", title: "solstone — add a site to begin", badge: "" }],
  [{ allowlist: ["x"], paused: true }, { prefix: "icon-paused-", title: "solstone — paused", badge: "" }],
  [{ allowlist: ["x"], paused: true, siteErrors: { x: "boom" } }, { prefix: "icon-paused-", title: "solstone — paused", badge: "" }],
  [{ allowlist: ["x"], siteErrors: { x: "boom" } }, { prefix: "icon-error-", title: "solstone — boom", badge: "!" }],
  [{ allowlist: ["x"] }, { prefix: "icon-half-", title: "solstone — observing 1 site · connecting to your journal", badge: "" }],
  [
    { allowlist: ["x"], key: "k", health: { lastError: "down" } },
    { prefix: "icon-half-", title: "solstone — observing 1 site · can't reach your journal", badge: "" },
  ],
  [{ allowlist: ["a", "b"], key: "k" }, { prefix: "icon", title: "solstone — observing 2 sites · connected", badge: "" }],
  [
    { allowlist: ["x"], key: "k", health: { lastError: "down", consecutiveFailures: 1 } },
    { prefix: "icon-half-", title: "solstone — observing 1 site · can't reach your journal", badge: "" },
  ],
  [
    { allowlist: ["x"], key: "k", health: { lastError: "down", consecutiveFailures: 2 } },
    {
      prefix: "icon-error-",
      title: "solstone — observing 1 site · can't reach your journal — recent observations may not be kept",
      badge: "!",
    },
  ],
  [
    { allowlist: ["x"], health: { lastError: "down", consecutiveFailures: 1 } },
    { prefix: "icon-half-", title: "solstone — observing 1 site · connecting to your journal", badge: "" },
  ],
  [
    { allowlist: ["x"], health: { lastError: "down", consecutiveFailures: 2 } },
    {
      prefix: "icon-error-",
      title: "solstone — observing 1 site · can't reach your journal — recent observations may not be kept",
      badge: "!",
    },
  ],
  [
    { allowlist: ["x"], key: "k", health: { lastError: "down" } },
    { prefix: "icon-half-", title: "solstone — observing 1 site · can't reach your journal", badge: "" },
  ],
  [
    { allowlist: ["x"], key: "k", siteErrors: { x: "boom" }, health: { lastError: "down", consecutiveFailures: 2 } },
    {
      prefix: "icon-error-",
      title: "solstone — observing 1 site · can't reach your journal — recent observations may not be kept",
      badge: "!",
    },
  ],
];

test("iconState returns the accepted toolbar status cells", () => {
  for (const [cfg, expected] of cells) {
    assert.deepEqual(S.iconState(cfg), expected);
  }
});

test("iconState handles sparse config defensively", () => {
  assert.doesNotThrow(() => S.iconState({}));
  assert.doesNotThrow(() => S.iconState({ allowlist: ["x"] }));
});

test("all emitted toolbar icon assets exist", () => {
  for (const prefix of ["icon-paused-", "icon-error-", "icon-half-", "icon"]) {
    for (const size of [16, 48, 128]) {
      assert.equal(fs.existsSync(new URL(`../extension/icons/${prefix}${size}.png`, import.meta.url)), true);
    }
  }
});

test("updateHealth tracks consecutive journal failures without touching upload fields", () => {
  let h = S.updateHealth({}, { ok: false, status: 0, error: "x" });
  assert.equal(h.consecutiveFailures, 1);
  assert.equal(h.lastError, "x");
  assert.equal(h.lastStatus, 0);

  h = S.updateHealth(h, { ok: false, status: 500, error: "y" });
  assert.equal(h.consecutiveFailures, 2);

  h = S.updateHealth(h, { ok: true });
  assert.equal(h.consecutiveFailures, 0);
  assert.equal(h.lastError, null);

  h = S.updateHealth({ lastError: "y" }, { ok: false });
  assert.equal(h.consecutiveFailures, 1);
});

test("toolbar titles stay in observer voice", () => {
  for (const title of cells.map(([, expected]) => expected.title)) {
    assert.doesNotMatch(title, /captures|records|monitors|watches|tracks/i);
  }
});
