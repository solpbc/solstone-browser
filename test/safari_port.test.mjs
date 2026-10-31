// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import assert from "node:assert/strict";
import test from "node:test";

import "fake-indexeddb/auto";
for (const name of ["native-browser/constants.js", "native-browser/schemas.js", "native-browser/schema-validator.js",
  "native-browser/codec.js", "lib/uuid.js", "lib/db.js", "lib/blocks.js", "lib/segment.js", "lib/gate.js",
  "lib/native_outbox.js", "lib/safari_port.js"]) {
  await import(new URL("../extension/" + name, import.meta.url));
}
await import(new URL("../extension/lib/native_port.js", import.meta.url));

const SafariPort = globalThis.SolstoneSafariPort;
const PortController = globalThis.SolstoneNativePort;
const SAFARI_ID = globalThis.SolstoneNativeBrowserConstants.HOSTS_AND_IDS.production.safari_id;

function fakeRuntime(scheme = "safari-web-extension://4B2C/") {
  const native = { posted: [], disconnected: false, message: [], disconnect: [] };
  return {
    native,
    getURL: () => scheme,
    connectNative: () => ({
      postMessage: (m) => native.posted.push(m),
      disconnect: () => { native.disconnected = true; for (const l of native.disconnect) l(); },
      onMessage: { addListener: (l) => native.message.push(l) },
      onDisconnect: { addListener: (l) => native.disconnect.push(l) },
    }),
  };
}

test("safari port: frames reach only their own connection, in order", () => {
  const runtime = fakeRuntime();
  const port = SafariPort.connect(runtime, "app.solstone.browser", () => "conn-a");
  const got = [];
  port.onMessage.addListener((frame) => got.push(frame));
  const deliver = (m) => runtime.native.message.forEach((l) => l(m));
  deliver({ name: "f", userInfo: { c: "conn-b", f: '{"type":"state"}' } });
  deliver({ name: "f", userInfo: { c: "conn-a", f: '{"type":"hello_ack"}' } });
  deliver({ c: "conn-a", f: ['{"type":"state"}', '{"type":"boundary"}'] });
  deliver({ c: "conn-a" });
  assert.deepEqual(got, ['{"type":"hello_ack"}', '{"type":"state"}', '{"type":"boundary"}']);
});

test("safari port: outgoing frames carry the connection id and exact text", () => {
  const runtime = fakeRuntime();
  const port = SafariPort.connect(runtime, "app.solstone.browser", () => "conn-a");
  port.postMessage({ type: "hello", brand: "safari" });
  assert.deepEqual(runtime.native.posted, [{ c: "conn-a", f: '{"type":"hello","brand":"safari"}' }]);
});

test("safari port: a closed relay ends the port once; local disconnect stays silent", () => {
  const runtime = fakeRuntime();
  const port = SafariPort.connect(runtime, "h", () => "conn-a");
  let ended = 0;
  const got = [];
  port.onDisconnect.addListener(() => ended++);
  port.onMessage.addListener((frame) => got.push(frame));
  runtime.native.message.forEach((l) => l({ c: "conn-a", f: ['{"type":"hello_ack"}'], closed: true }));
  runtime.native.message.forEach((l) => l({ name: "f", userInfo: { c: "conn-a", f: '{"type":"state"}' } }));
  runtime.native.disconnect.forEach((l) => l());
  assert.deepEqual(got, ['{"type":"hello_ack"}']);
  assert.equal(ended, 1);
  assert.throws(() => port.postMessage({ type: "batch" }));

  const second = SafariPort.connect(fakeRuntime(), "h", () => "conn-b");
  let secondEnded = 0;
  second.onDisconnect.addListener(() => secondEnded++);
  second.disconnect();
  assert.equal(secondEnded, 0);
});

test("safari port: Safari is recognised by its extension scheme, not its user agent", () => {
  assert.equal(SafariPort.isSafari(fakeRuntime()), true);
  assert.equal(SafariPort.isSafari(fakeRuntime("chrome-extension://abc/")), false);
});

test("safari port: the controller says hello as safari through the shim", () => {
  const runtime = fakeRuntime();
  globalThis.chrome = { runtime };
  try {
    const controller = new PortController({ runtimeId: SAFARI_ID, inst: "inst-safari", schedule: () => 0 });
    assert.equal(controller.brand, "safari");
    assert.equal(controller.hostName, "app.solstone.browser");
    controller.connect();
    const hello = JSON.parse(runtime.native.posted[0].f);
    assert.equal(hello.type, "hello");
    assert.equal(hello.brand, "safari");
    assert.equal(hello.inst, "inst-safari");
  } finally {
    delete globalThis.chrome;
  }
});

test("safari port: resolveHostName supports safari_ios_id", () => {
  const table = globalThis.SolstoneNativeBrowserConstants.HOSTS_AND_IDS;
  const prodHost = table.production.host;
  const prodIosId = table.production.safari_ios_id;
  assert.equal(PortController.resolveHostName(prodIosId), prodHost);
  assert.equal(PortController.resolveHostName(table.dev.safari_ios_id), null);
  assert.equal(PortController.resolveHostName(""), null);
});

