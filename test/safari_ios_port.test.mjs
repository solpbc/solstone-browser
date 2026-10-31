// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc
import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";

function rig(sendNativeMessage) {
  let tick, cleared = false;
  const context = vm.createContext({ navigator: { userAgent: "iPhone", platform: "iPhone" }, crypto: webcrypto,
    setInterval(fn) { tick = fn; return 1; }, clearInterval() { cleared = true; } });
  for (const file of ["safari_port.js", "safari_ios_port.js"]) {
    vm.runInContext(readFileSync(new URL(`../extension/lib/${file}`, import.meta.url), "utf8"), context);
  }
  const port = context.SolstoneSafariPort.connect({ sendNativeMessage });
  return { port, tick: () => tick(), cleared: () => cleared };
}

test("iOS serializes replies, coalesces polls and ignores replies after disconnect", async () => {
  const posted = [], received = [];
  let resolve;
  const r = rig((host, request) => {
    posted.push({ host, request });
    return new Promise(done => { resolve = done; });
  });
  r.port.onMessage.addListener(frame => received.push(frame));
  r.port.postMessage({ type: "hello" });
  await Promise.resolve();
  r.tick(); r.tick();
  assert.equal(posted.length, 1);
  assert.equal(posted[0].host, "app.solstone.swift");
  resolve({ v: 1, c: r.port.id, f: ["first", "second"] });
  await new Promise(done => setImmediate(done));
  assert.deepEqual(received, ["first", "second"]);
  r.tick();
  await Promise.resolve();
  r.port.disconnect();
  resolve({ v: 1, c: r.port.id, f: ["late"] });
  await new Promise(done => setImmediate(done));
  assert.deepEqual(received, ["first", "second"]);
  assert.equal(r.cleared(), true);
});

test("iOS closes once when the native exchange fails or replies to another connection", async () => {
  const r = rig(async () => ({ v: 1, c: "other", f: ["wrong"] }));
  let closed = 0;
  r.port.onDisconnect.addListener(() => closed++);
  r.port.postMessage({ type: "hello" });
  await new Promise(done => setImmediate(done));
  assert.equal(closed, 1);
  assert.throws(() => r.port.postMessage({ type: "batch" }));
});
