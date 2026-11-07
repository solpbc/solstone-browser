// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc
import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { webcrypto } from "node:crypto";

function rig(sendNativeMessage) {
  let timers = 0;
  const context = vm.createContext({ navigator: { userAgent: "iPhone", platform: "iPhone" }, crypto: webcrypto,
    setInterval() { timers++; return 1; }, setTimeout() { timers++; return 1; } });
  for (const file of ["safari_port.js", "safari_ios_port.js"]) {
    vm.runInContext(readFileSync(new URL(`../extension/lib/${file}`, import.meta.url), "utf8"), context);
  }
  const port = context.SolstoneSafariPort.connect({ sendNativeMessage }, "app.solstone.browser");
  return { port, tick: () => port.refresh(), timers: () => timers };
}

test("iOS serializes replies, coalesces refreshes and ignores replies after disconnect", async () => {
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
});

test("iOS exchanges only when asked: no hello, batch or refresh means no message and no timer", async () => {
  const posted = [];
  const r = rig(async (_host, request) => { posted.push(request); return { v: 1, c: request.c, f: [] }; });
  await new Promise(done => setImmediate(done));
  assert.equal(posted.length, 0);
  assert.equal(r.timers(), 0);
  r.port.postMessage({ type: "hello" });
  await new Promise(done => setImmediate(done));
  assert.equal(posted.length, 1);
  assert.equal(r.timers(), 0);
  r.port.refresh();
  await new Promise(done => setImmediate(done));
  assert.equal(posted.length, 2);
  assert.equal(posted[1].f, undefined);
  r.port.disconnect();
  r.port.refresh();
  await new Promise(done => setImmediate(done));
  assert.equal(posted.length, 2);
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
  assert.equal(phone.MOBILE_DISCLOSURE_EDITS.length, 3);
  assert.doesNotMatch(phone.DISCLOSURE_BODY, /this computer|unless you turn that off/);
  assert.match(phone.DISCLOSURE_BODY, /takes in nothing from private browsing/);
  assert.doesNotMatch(phone.DISCLOSURE_BODY, /pausing (Safari in )?the solstone app/);
  assert.match(phone.DISCLOSURE_BODY, /pause any time in the solstone extension\. pausing doesn't hold back/);
  assert.match(phone.step3Body("safari"), /Safari's page menu/);
  const pad = copyFor({ userAgent: "Mozilla/5.0 (Macintosh)", platform: "MacIntel", maxTouchPoints: 5 });
  assert.equal(pad.PLACE, "this ipad");
});

test("a computer keeps its words unchanged", () => {
  const mac = copyFor({ userAgent: "Mozilla/5.0 (Macintosh)", platform: "MacIntel", maxTouchPoints: 0 });
  assert.equal(mac.PLACE, "this computer");
  assert.match(mac.DISCLOSURE_BODY, /solstone app on this computer\. from there/);
  assert.match(mac.DISCLOSURE_BODY, /unless you turn that off in settings/);
});
