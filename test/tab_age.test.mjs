// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import fs from "node:fs";

function createTabAgeHarness(sessionData = {}) {
  const store = { ...sessionData };
  const mockChrome = {
    storage: {
      session: {
        get: async (key) => ({ [key]: store[key] }),
        set: async (obj) => { Object.assign(store, obj); },
      },
    },
  };
  const sandbox = {
    globalThis: null,
    chrome: mockChrome,
    console,
    Math,
    Number,
    Map,
    Object,
    Array,
    String,
  };
  sandbox.globalThis = sandbox;
  const code = fs.readFileSync(new URL("../extension/lib/tab_age.js", import.meta.url), "utf-8");
  vm.runInNewContext(code, sandbox);
  return { TabAge: sandbox.SolstoneTabAge, store, sandbox };
}

test("tab_age: age grows between two nowMs values for one tab", async () => {
  const { TabAge } = createTabAgeHarness();
  await TabAge.start([{ id: 101 }], 1000);

  const age1 = await TabAge.ageMs(101, 1500);
  assert.equal(age1, 500);

  const age2 = await TabAge.ageMs(101, 3000);
  assert.equal(age2, 2000);
});

test("tab_age: simulated restart uses persisted first-seen", async () => {
  const { TabAge: firstInstance, store } = createTabAgeHarness();
  await firstInstance.start([{ id: 202 }], 5000);
  assert.equal(await firstInstance.ageMs(202, 7000), 2000);

  // New module state (simulated background worker restart) sharing session store
  const { TabAge: secondInstance } = createTabAgeHarness(store);
  // Re-start at a much later timestamp
  await secondInstance.start([{ id: 202 }], 10000);

  // Age must still measure from original 5000, not 10000
  const ageAfterRestart = await secondInstance.ageMs(202, 12000);
  assert.equal(ageAfterRestart, 7000);
});

test("tab_age: read before bulk map load keeps persisted value rather than wake-time seed", async () => {
  const stored = { 303: 4000 };
  const { TabAge } = createTabAgeHarness({ tabFirstSeenEpochMs: stored });

  // Read before start() has been called
  const ageBeforeStart = await TabAge.ageMs(303, 6000);
  assert.equal(ageBeforeStart, 2000);

  // Now run start at wake time 6000; should not overwrite
  await TabAge.start([{ id: 303 }], 6000);
  const ageAfterStart = await TabAge.ageMs(303, 7000);
  assert.equal(ageAfterStart, 3000);
});

test("tab_age: forget then a new observation restarts age", async () => {
  const { TabAge } = createTabAgeHarness();
  await TabAge.noteCreated({ id: 404 }, 2000);
  assert.equal(await TabAge.ageMs(404, 3000), 1000);

  await TabAge.forget(404);

  // Next observation seeds afresh
  await TabAge.noteCreated({ id: 404 }, 8000);
  assert.equal(await TabAge.ageMs(404, 8500), 500);
});

test("tab_age: age never negative when nowMs is before first-seen (clamped at 0)", async () => {
  const { TabAge } = createTabAgeHarness();
  await TabAge.start([{ id: 505 }], 5000);

  // Time anomaly / backwards clock
  const clampedAge = await TabAge.ageMs(505, 3000);
  assert.equal(clampedAge, 0);

  // Non-integer tabId returns undefined
  assert.equal(await TabAge.ageMs("not an int", 6000), undefined);
  assert.equal(await TabAge.ageMs(null, 6000), undefined);
});

test("tab_age: incognito tabs are not stored by start or noteCreated", async () => {
  const { TabAge, store } = createTabAgeHarness();
  await TabAge.start([{ id: 601, incognito: true }, { id: 602, incognito: false }], 1000);

  await TabAge.noteCreated({ id: 603, incognito: true }, 1000);

  assert.equal(store.tabFirstSeenEpochMs["601"], undefined);
  assert.equal(store.tabFirstSeenEpochMs["603"], undefined);
  assert.equal(store.tabFirstSeenEpochMs["602"], 1000);
});

test("tab_age: old relative timestamps cannot become epoch ages", async () => {
  const { TabAge, store } = createTabAgeHarness({ tabFirstSeen: { 701: 600_000 } });
  const now = 1_800_000_000_000;
  await TabAge.start([{ id: 701 }], now);
  assert.equal(await TabAge.ageMs(701, now + 3000), 3000);
  assert.equal(store.tabFirstSeenEpochMs["701"], now);
});

for (const unavailable of ["absent", "rejected"]) {
  test(`tab_age: ${unavailable} session storage keeps a safe in-context lower bound`, async () => {
    function boot() {
      const { TabAge, sandbox } = createTabAgeHarness();
      if (unavailable === "absent") delete sandbox.chrome.storage.session;
      else sandbox.chrome.storage.session = {
        get: async () => { throw Error("storage unavailable"); },
        set: async () => { throw Error("storage unavailable"); },
      };
      return TabAge;
    }
    const first = boot();
    await first.start([{ id: 702 }], 1000);
    assert.equal(await first.ageMs(702, 4000), 3000);
    const second = boot();
    await second.start([{ id: 702 }], 5000);
    assert.equal(await second.ageMs(702, 6000), 1000);
  });
}
