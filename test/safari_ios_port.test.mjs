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
  const port = context.SolstoneSafariPort.connect({ sendNativeMessage }, "app.solstone.browser");
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
  assert.equal(posted[0].host, "app.solstone.browser");
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

test("a desktop Safari keeps the dispatch port", () => {
  const context = vm.createContext({ navigator: { userAgent: "Macintosh", platform: "MacIntel", maxTouchPoints: 0 }, crypto: webcrypto });
  for (const file of ["safari_port.js", "safari_ios_port.js"]) {
    vm.runInContext(readFileSync(new URL(`../extension/lib/${file}`, import.meta.url), "utf8"), context);
  }
  assert.equal(context.SolstoneSafariPort.ios, undefined);
});

function copyFor(navigator) {
  const context = vm.createContext({ navigator });
  vm.runInContext(readFileSync(new URL("../extension/lib/copy.js", import.meta.url), "utf8"), context);
  return context.SolstoneCopy;
}

test("on iPhone the words name the phone and say reading continues while the app is closed", () => {
  const phone = copyFor({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X)", platform: "iPhone" });
  assert.equal(phone.PLACE, "this iphone");
  assert.match(phone.DISCLOSURE_BODY, /solstone app on this iphone\./);
  assert.match(phone.DISCLOSURE_BODY, /the solstone extension keeps taking in the sites you choose while the solstone app is closed/);
  assert.doesNotMatch(phone.DISCLOSURE_BODY, /this computer|unless you turn that off/);
  const pad = copyFor({ userAgent: "Mozilla/5.0 (Macintosh)", platform: "MacIntel", maxTouchPoints: 5 });
  assert.equal(pad.PLACE, "this ipad");
});

test("a computer keeps its words unchanged", () => {
  const mac = copyFor({ userAgent: "Mozilla/5.0 (Macintosh)", platform: "MacIntel", maxTouchPoints: 0 });
  assert.equal(mac.PLACE, "this computer");
  assert.match(mac.DISCLOSURE_BODY, /solstone app on this computer\. from there/);
  assert.match(mac.DISCLOSURE_BODY, /unless you turn that off in settings/);
});
