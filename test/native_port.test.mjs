// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import assert from "node:assert/strict";
import test from "node:test";

import "fake-indexeddb/auto";
await import(new URL("../extension/native-browser/constants.js", import.meta.url));
await import(new URL("../extension/native-browser/schemas.js", import.meta.url));
await import(new URL("../extension/native-browser/schema-validator.js", import.meta.url));
await import(new URL("../extension/native-browser/codec.js", import.meta.url));
await import(new URL("../extension/lib/uuid.js", import.meta.url));
await import(new URL("../extension/lib/db.js", import.meta.url));
await import(new URL("../extension/lib/blocks.js", import.meta.url));
await import(new URL("../extension/lib/segment.js", import.meta.url));
await import(new URL("../extension/lib/gate.js", import.meta.url));
await import(new URL("../extension/lib/native_outbox.js", import.meta.url));
await import(new URL("../extension/lib/native_port.js", import.meta.url));
await import(new URL("../extension/lib/router.js", import.meta.url));

const Constants = globalThis.SolstoneNativeBrowserConstants;
const Codec = globalThis.SolstoneNativeBrowser;
const Gate = globalThis.SolstoneCaptureGate;
const Outbox = globalThis.SolstoneNativeOutbox;
const DB = globalThis.SolstoneDB;
const PortController = globalThis.SolstoneNativePort;
const Router = globalThis.SolstoneRouter;

async function resetDB() {
  await DB.clear("outbox");
  await DB.clear("producer");
  await DB.clear("meta");
}

class MockPort {
  constructor() {
    this.sent = [];
    this.disconnectHandlers = [];
    this.messageHandlers = [];
    this.disconnected = false;
  }

  postMessage(msg) {
    if (this.disconnected) throw new Error("Port disconnected");
    this.sent.push(msg);
  }

  disconnect() {
    if (this.disconnected) return;
    this.disconnected = true;
    for (const h of this.disconnectHandlers) h();
  }

  onMessage = {
    addListener: (h) => this.messageHandlers.push(h),
  };

  onDisconnect = {
    addListener: (h) => this.disconnectHandlers.push(h),
  };

  async receive(msg) {
    for (const h of this.messageHandlers) {
      const res = h(msg);
      if (res && typeof res.then === "function") await res;
    }
  }
}

test("handshake: sends hello on connect and accepts valid hello_ack", async () => {
  await resetDB();
  const mockPort = new MockPort();
  const statusUpdates = [];

  const controller = new PortController({
    runtimeId: "fgfnkcefedeheoeamppkiiloncfekakf",
    connectNative: (host) => {
      assert.equal(host, "app.solstone.browser.dev");
      return mockPort;
    },
    onStatusChange: (s) => statusUpdates.push(s),
  });

  controller.connect();

  assert.equal(mockPort.sent.length, 1);
  const helloMsg = mockPort.sent[0];
  assert.equal(helloMsg.type, "hello");
  assert.equal(helloMsg.protocol, Constants.WIRE_PROTOCOL);
  assert.equal(helloMsg.version, "0.2.0");

  assert.equal(controller.lease, null);

  await mockPort.receive({
    type: "hello_ack",
    capture: "permitted",
    delivery: "delivered",
    freshness_ms: 10000,
    destination_generation: "gen-alpha",
    period_id: "period-1",
  });

  assert.ok(controller.lease);
  assert.equal(controller.lease.generation, "gen-alpha");
  assert.equal(controller.lease.token, controller.connectionToken);
  assert.equal(controller.hostCapture, "permitted");
  assert.equal(controller.hostDelivery, "delivered");
  assert.equal(controller.everConnected, true);
});

test("port: freshness closes at the deadline", () => {
  const receivedAt = 10000;
  const freshnessMs = 5000;
  assert.equal(Codec.freshnessAuthorizesSkim(receivedAt, freshnessMs, receivedAt + freshnessMs - 1), true);
  assert.equal(Codec.freshnessAuthorizesSkim(receivedAt, freshnessMs, receivedAt + freshnessMs), false);
});

test("port: malformed reply omits payload marker", async () => {
  await resetDB();
  const mockPort = new MockPort();
  const controller = new PortController({
    runtimeId: "fgfnkcefedeheoeamppkiiloncfekakf",
    connectNative: () => mockPort,
  });

  controller.connect();
  const secretMarker = "SECRET_PLANTED_MARKER_xyz123";

  await mockPort.receive({
    type: "hello_ack",
    capture: "not_a_valid_capture_state",
    delivery: "delivered",
    freshness_ms: 10000,
    destination_generation: "gen-alpha",
    period_id: "period-1",
    injectedMarker: secretMarker,
  });

  const statusJson = JSON.stringify(controller.getStatus());
  assert.equal(statusJson.includes(secretMarker), false);
  assert.equal(controller.lease, null);
  assert.equal(controller.livePort, null);
  assert.equal(mockPort.disconnected, true);
});

test("port: behind app does not request an extension update", async () => {
  await resetDB();
  const mockPort = new MockPort();
  let checkCalled = false;

  const controller = new PortController({
    runtimeId: "fgfnkcefedeheoeamppkiiloncfekakf",
    connectNative: () => mockPort,
    requestUpdateCheck: async () => {
      checkCalled = true;
      return { status: "update_available" };
    },
  });

  controller.connect();
  await mockPort.receive({
    type: "unsupported",
    protocol: 2,
    behind: "app",
  });

  await new Promise((r) => queueMicrotask(r));
  assert.equal(checkCalled, false);
  assert.equal(controller.updateCheck, "pending");
});

test("port: update check settles to no-update", async () => {
  await resetDB();
  const mockPort = new MockPort();
  const controller = new PortController({
    runtimeId: "fgfnkcefedeheoeamppkiiloncfekakf",
    connectNative: () => mockPort,
    requestUpdateCheck: async () => ({ status: "no_update" }),
  });
  controller.connect();
  await mockPort.receive({ type: "unsupported", protocol: 1, behind: "extension" });
  await new Promise((r) => queueMicrotask(r));
  assert.equal(controller.updateCheck, "no-update");
});

test("port: update check settles to throttled", async () => {
  await resetDB();
  const mockPort = new MockPort();
  const controller = new PortController({
    runtimeId: "fgfnkcefedeheoeamppkiiloncfekakf",
    connectNative: () => mockPort,
    requestUpdateCheck: async () => ({ status: "throttled" }),
  });
  controller.connect();
  await mockPort.receive({ type: "unsupported", protocol: 1, behind: "extension" });
  await new Promise((r) => queueMicrotask(r));
  assert.equal(controller.updateCheck, "throttled");
});

test("port: update check settles to failure", async () => {
  await resetDB();
  const mockPort = new MockPort();
  const controller = new PortController({
    runtimeId: "fgfnkcefedeheoeamppkiiloncfekakf",
    connectNative: () => mockPort,
    requestUpdateCheck: async () => { throw new Error("network"); },
  });
  controller.connect();
  await mockPort.receive({ type: "unsupported", protocol: 1, behind: "extension" });
  await new Promise((r) => queueMicrotask(r));
  assert.equal(controller.updateCheck, "failure");
});

test("port: update check settles to update-available", async () => {
  await resetDB();
  const mockPort = new MockPort();
  const controller = new PortController({
    runtimeId: "fgfnkcefedeheoeamppkiiloncfekakf",
    connectNative: () => mockPort,
    requestUpdateCheck: async () => ({ status: "update_available" }),
  });
  controller.connect();
  await mockPort.receive({ type: "unsupported", protocol: 1, behind: "extension" });
  await new Promise((r) => queueMicrotask(r));
  assert.equal(controller.updateCheck, "update-available");
});

test("port: poll reconnects after disconnect", async () => {
  await resetDB();
  let connectCount = 0;

  const controller = new PortController({
    runtimeId: "fgfnkcefedeheoeamppkiiloncfekakf",
    connectNative: () => {
      connectCount++;
      return new MockPort();
    },
  });

  controller.connect();
  assert.equal(connectCount, 1);

  controller.livePort.disconnect();
  assert.equal(controller.livePort, null);

  controller.poll(2000);
  assert.equal(connectCount, 2);
  assert.ok(controller.livePort);
});

test("port: retired port cannot reopen capture", async () => {
  await resetDB();
  const port1 = new MockPort();
  const port2 = new MockPort();
  let count = 0;

  const controller = new PortController({
    runtimeId: "fgfnkcefedeheoeamppkiiloncfekakf",
    connectNative: () => {
      count++;
      return count === 1 ? port1 : port2;
    },
  });

  controller.connect();
  assert.equal(controller.connectionGeneration, 1);

  controller.connect();
  assert.equal(controller.connectionGeneration, 2);

  // Late message on port1
  await port1.receive({
    type: "hello_ack",
    capture: "permitted",
    delivery: "delivered",
    freshness_ms: 10000,
    destination_generation: "gen-old",
    period_id: "p-old",
  });

  port1.disconnect();

  assert.equal(controller.lease, null);
  assert.equal(controller.hostCapture, "unavailable");
  assert.equal(controller.hostDelivery, "unknown");
  assert.equal(controller.everConnected, false);
});

test("port: capture and delivery stay distinct and accept is not delivered", async () => {
  await resetDB();
  const mockPort = new MockPort();
  const controller = new PortController({
    runtimeId: "fgfnkcefedeheoeamppkiiloncfekakf",
    connectNative: () => mockPort,
  });

  controller.connect();
  await mockPort.receive({
    type: "hello_ack",
    capture: "permitted",
    delivery: "idle",
    freshness_ms: 10000,
    destination_generation: "gen-1",
    period_id: "p-1",
  });

  assert.equal(controller.hostCapture, "permitted");
  assert.equal(controller.hostDelivery, "idle");

  // Inflight batch accepted receipt should not alter hostDelivery to "delivered"
  controller.inflightBatch = { batchId: "b-123" };
  await mockPort.receive({
    type: "accepted",
    result: "accepted",
    batch_id: "b-123",
    destination_generation: "gen-1",
    inst: controller.inst,
    period_id: "p-1",
  });

  assert.equal(controller.hostDelivery, "idle");
});

test("port: restart with everConnected leaves capture closed", async () => {
  await resetDB();
  await DB.put("meta", true, "everConnected");

  const port1 = new MockPort();
  const controller1 = new PortController({
    runtimeId: "fgfnkcefedeheoeamppkiiloncfekakf",
    connectNative: () => port1,
  });
  controller1.everConnected = true;

  const status1 = controller1.getStatus();
  assert.equal(status1.gate.open, false);
  assert.equal(status1.everConnected, true);

  controller1.connect();
  await port1.receive({
    type: "hello_ack",
    capture: "permitted",
    delivery: "delivered",
    freshness_ms: 10000,
    destination_generation: "gen-same",
    period_id: "p-1",
  });

  const token1 = controller1.lease.token;

  // New connection with the same destination_generation gets a new token
  const port2 = new MockPort();
  const controller2 = new PortController({
    runtimeId: "fgfnkcefedeheoeamppkiiloncfekakf",
    connectNative: () => port2,
  });
  controller2.connect();
  await port2.receive({
    type: "hello_ack",
    capture: "permitted",
    delivery: "delivered",
    freshness_ms: 10000,
    destination_generation: "gen-same",
    period_id: "p-1",
  });

  const token2 = controller2.lease.token;
  assert.notEqual(token1, token2);
});

test("port: paused drain delivers the promoted snapshot", async () => {
  await resetDB();

  // Frame 1: 3 skims (A, B, C)
  const bA = await Outbox.enqueueSkim({
    inst: "00000000-0000-0000-0000-000000000001",
    ctx: "ctx-frame-1",
    destinationGeneration: "gen-1",
    senderUrl: "https://mail.google.com/mail/u/0",
    site: "mail.google.com",
    title: "Inbox",
    adapter: "gmail",
    blocks: [{ id: "1", type: "text", depth: 0, text: "A" }],
    nowMs: 1000,
  });

  const bB = await Outbox.enqueueSkim({
    inst: "00000000-0000-0000-0000-000000000001",
    ctx: "ctx-frame-1",
    destinationGeneration: "gen-1",
    senderUrl: "https://mail.google.com/mail/u/0",
    site: "mail.google.com",
    title: "Inbox",
    adapter: "gmail",
    blocks: [{ id: "1", type: "text", depth: 0, text: "A" }, { id: "2", type: "text", depth: 0, text: "B" }],
    nowMs: 2000,
  });

  const bC = await Outbox.enqueueSkim({
    inst: "00000000-0000-0000-0000-000000000001",
    ctx: "ctx-frame-1",
    destinationGeneration: "gen-1",
    senderUrl: "https://mail.google.com/mail/u/0",
    site: "mail.google.com",
    title: "Inbox",
    adapter: "gmail",
    blocks: [{ id: "1", type: "text", depth: 0, text: "A" }, { id: "2", type: "text", depth: 0, text: "B" }, { id: "3", type: "text", depth: 0, text: "C" }],
    nowMs: 3000,
  });

  // Frame 2: 1 skim
  const bOther = await Outbox.enqueueSkim({
    inst: "00000000-0000-0000-0000-000000000001",
    ctx: "ctx-frame-2",
    destinationGeneration: "gen-1",
    senderUrl: "https://docs.google.com/doc",
    site: "docs.google.com",
    title: "Doc",
    adapter: "generic",
    blocks: [{ id: "doc-1", type: "text", depth: 0, text: "Doc content" }],
    nowMs: 4000,
  });

  const mockPort1 = new MockPort();
  const c1 = new PortController({
    inst: "00000000-0000-0000-0000-000000000001",
    runtimeId: "fgfnkcefedeheoeamppkiiloncfekakf",
    connectNative: () => mockPort1,
  });

  c1.connect();
  await mockPort1.receive({
    type: "hello_ack",
    capture: "permitted",
    delivery: "delivered",
    freshness_ms: 10000,
    destination_generation: "gen-1",
    period_id: "p-1",
  });

  // Head batch is A
  assert.equal(mockPort1.sent.length, 2); // hello + batch A
  const sentA = mockPort1.sent[1];
  assert.equal(sentA.batch_id, bA.batchId);

  // Accept A
  await mockPort1.receive({
    type: "accepted",
    result: "accepted",
    batch_id: bA.batchId,
    destination_generation: "gen-1",
    inst: c1.inst,
    period_id: "p-1",
  });

  // Next sent is B
  assert.equal(mockPort1.sent.length, 3);
  const sentB = mockPort1.sent[2];
  assert.equal(sentB.batch_id, bB.batchId);

  // Permanently reject B
  await mockPort1.receive({
    type: "accepted",
    result: "rejected",
    reason: "oversize",
    class: "permanent",
    batch_id: bB.batchId,
    destination_generation: "gen-1",
    inst: c1.inst,
  });

  // New controller, same DB, paused = true
  const mockPort2 = new MockPort();
  const c2 = new PortController({
    inst: "00000000-0000-0000-0000-000000000001",
    runtimeId: "fgfnkcefedeheoeamppkiiloncfekakf",
    connectNative: () => mockPort2,
  });
  c2.paused = true;
  c2.consentVersion = 1;
  c2.grantedOrigins.add("https://mail.google.com");

  c2.connect();
  await mockPort2.receive({
    type: "hello_ack",
    capture: "permitted",
    delivery: "delivered",
    freshness_ms: 10000,
    destination_generation: "gen-1",
    period_id: "p-1",
  });

  // Next post is C's saved snapshot, C's original batch id, C's original queued_at_ms
  assert.equal(mockPort2.sent.length, 2); // hello + batch C
  const sentC = mockPort2.sent[1];
  assert.equal(sentC.batch_id, bC.batchId);
  assert.equal(sentC.queued_at_ms, 3000);
  assert.equal(sentC.records.length, 1);
  assert.equal(sentC.records[0].t, "segment_start");
  assert.equal(sentC.records[0].blocks.length, 3);

  // Check frame 2 row is unchanged
  const allOutbox = await Outbox.getAll();
  const otherRow = allOutbox.find((x) => x.batchId === bOther.batchId);
  assert.ok(otherRow);
  assert.equal(otherRow.records[0].t, "segment_start");
  assert.equal(otherRow.records[0].blocks[0].text, "Doc content");

  // runIfPermitted on paused status stays 0
  let skimHookCalled = 0;
  Gate.runIfPermitted(c2.getStatus().gate, {
    skim: () => { skimHookCalled++; },
  });
  assert.equal(skimHookCalled, 0);

  // Lost-ack resend on new controller with same inflight batch
  const mockPort3 = new MockPort();
  const c3 = new PortController({
    inst: "00000000-0000-0000-0000-000000000001",
    runtimeId: "fgfnkcefedeheoeamppkiiloncfekakf",
    connectNative: () => mockPort3,
  });
  c3.connect();
  await mockPort3.receive({
    type: "hello_ack",
    capture: "permitted",
    delivery: "idle",
    freshness_ms: 10000,
    destination_generation: "gen-1",
    period_id: "p-1",
  });
  assert.equal(mockPort3.sent[1].batch_id, bC.batchId);
  assert.equal(mockPort3.sent[1].queued_at_ms, 3000);

  // Duplicate removal without setting delivered
  await mockPort3.receive({
    type: "accepted",
    result: "duplicate",
    batch_id: bC.batchId,
    destination_generation: "gen-1",
    inst: c3.inst,
    period_id: "p-1",
  });
  assert.notEqual(c3.hostDelivery, "delivered");
  const remainingAfterDup = await Outbox.getAll();
  assert.equal(remainingAfterDup.some((x) => x.batchId === bC.batchId), false);
});

test("port: lost ack resends identical batch and enforces one inflight", async () => {
  await resetDB();
  const b1 = await Outbox.enqueueSkim({
    inst: "00000000-0000-0000-0000-000000000001",
    ctx: "ctx-1",
    destinationGeneration: "gen-1",
    senderUrl: "https://mail.google.com/mail/u/0",
    site: "mail.google.com",
    title: "Inbox",
    adapter: "gmail",
    blocks: [{ id: "1", type: "text", depth: 0, text: "Hello" }],
    nowMs: 1000,
  });

  let portCount = 0;
  let mockPort1 = null;
  let mockPort2 = null;

  const controller = new PortController({
    inst: "00000000-0000-0000-0000-000000000001",
    runtimeId: "fgfnkcefedeheoeamppkiiloncfekakf",
    connectNative: () => {
      portCount++;
      if (portCount === 1) {
        mockPort1 = new MockPort();
        return mockPort1;
      }
      mockPort2 = new MockPort();
      return mockPort2;
    },
  });

  controller.connect();
  await mockPort1.receive({
    type: "hello_ack",
    capture: "permitted",
    delivery: "delivered",
    freshness_ms: 10000,
    destination_generation: "gen-1",
    period_id: "p-1",
  });

  // After a batch has been posted
  assert.equal(mockPort1.sent.length, 2); // hello + batch
  const firstBatch = mockPort1.sent[1];
  assert.equal(firstBatch.batch_id, b1.batchId);

  // One inflight: a second drain while the first is outstanding does not post another batch
  await controller.drain();
  assert.equal(mockPort1.sent.length, 2);

  // Disconnect that port object without an accepted message
  mockPort1.disconnect();

  // Connect again and await the new hello_ack
  controller.connect();
  await mockPort2.receive({
    type: "hello_ack",
    capture: "permitted",
    delivery: "delivered",
    freshness_ms: 10000,
    destination_generation: "gen-1",
    period_id: "p-1",
  });

  assert.equal(mockPort2.sent.length, 2); // hello + resent batch
  const secondBatch = mockPort2.sent[1];

  // The next posted batch equals the previous one on batch_id, records, destination_generation, and queued_at_ms
  assert.equal(secondBatch.batch_id, firstBatch.batch_id);
  assert.deepEqual(secondBatch.records, firstBatch.records);
  assert.equal(secondBatch.destination_generation, firstBatch.destination_generation);
  assert.equal(secondBatch.queued_at_ms, firstBatch.queued_at_ms);
});

test("port: snapshot_required replaces deltas with saved snapshot", async () => {
  await resetDB();
  const b1 = await Outbox.enqueueSkim({
    inst: "00000000-0000-0000-0000-000000000001",
    ctx: "ctx-1",
    destinationGeneration: "gen-1",
    senderUrl: "https://mail.google.com/mail/u/0",
    site: "mail.google.com",
    title: "Inbox",
    adapter: "gmail",
    blocks: [{ id: "1", type: "text", depth: 0, text: "Initial" }],
    nowMs: 1000,
  });

  const b2 = await Outbox.enqueueSkim({
    inst: "00000000-0000-0000-0000-000000000001",
    ctx: "ctx-1",
    destinationGeneration: "gen-1",
    senderUrl: "https://mail.google.com/mail/u/0",
    site: "mail.google.com",
    title: "Inbox",
    adapter: "gmail",
    blocks: [{ id: "1", type: "text", depth: 0, text: "Initial" }, { id: "2", type: "text", depth: 0, text: "Delta" }],
    nowMs: 2000,
  });

  const mockPort = new MockPort();
  const controller = new PortController({
    inst: "00000000-0000-0000-0000-000000000001",
    runtimeId: "fgfnkcefedeheoeamppkiiloncfekakf",
    connectNative: () => mockPort,
  });

  controller.connect();
  await mockPort.receive({
    type: "hello_ack",
    capture: "permitted",
    delivery: "idle",
    freshness_ms: 10000,
    destination_generation: "gen-1",
    period_id: "p-1",
  });

  // First batch is b1
  assert.equal(mockPort.sent.length, 2);
  await mockPort.receive({
    type: "accepted",
    result: "accepted",
    batch_id: b1.batchId,
    destination_generation: "gen-1",
    inst: controller.inst,
    period_id: "p-1",
  });

  // Second batch is b2 (deltas)
  assert.equal(mockPort.sent.length, 3);
  const sentB2 = mockPort.sent[2];
  assert.equal(sentB2.batch_id, b2.batchId);
  assert.equal(sentB2.records[0].t, "delta");

  // While that batch is inflight, send accepted with result: "rejected", reason: "snapshot_required", class: "retryable"
  await mockPort.receive({
    type: "accepted",
    result: "rejected",
    reason: "snapshot_required",
    class: "retryable",
    batch_id: b2.batchId,
    destination_generation: "gen-1",
    inst: controller.inst,
  });

  // The next post uses the same batch_id and queued_at_ms, and records are the saved snapshot (t: "segment_start")
  assert.equal(mockPort.sent.length, 4);
  const retriedB2 = mockPort.sent[3];
  assert.equal(retriedB2.batch_id, b2.batchId);
  assert.equal(retriedB2.queued_at_ms, 2000);
  assert.equal(retriedB2.records.length, 1);
  assert.equal(retriedB2.records[0].t, "segment_start");
  assert.equal(retriedB2.records[0].blocks.length, 2);

  // hostDelivery is not delivered
  assert.notEqual(controller.hostDelivery, "delivered");

  // No skim hook runs
  let skimHookRan = false;
  Gate.runIfPermitted(controller.getStatus().gate, {
    skim: () => { skimHookRan = true; },
  });
  assert.equal(skimHookRan, false);
});

test("port: boundary during retry keeps sendable records as deltas and sets producer snapshotRequired", async () => {
  await resetDB();
  const b1 = await Outbox.enqueueSkim({
    inst: "00000000-0000-0000-0000-000000000001",
    ctx: "ctx-1",
    destinationGeneration: "gen-1",
    senderUrl: "https://mail.google.com/mail/u/0",
    site: "mail.google.com",
    title: "Inbox",
    adapter: "gmail",
    blocks: [{ id: "1", type: "text", depth: 0, text: "Initial" }],
    nowMs: 1000,
  });

  const b2 = await Outbox.enqueueSkim({
    inst: "00000000-0000-0000-0000-000000000001",
    ctx: "ctx-1",
    destinationGeneration: "gen-1",
    senderUrl: "https://mail.google.com/mail/u/0",
    site: "mail.google.com",
    title: "Inbox",
    adapter: "gmail",
    blocks: [{ id: "1", type: "text", depth: 0, text: "Initial" }, { id: "2", type: "text", depth: 0, text: "Delta" }],
    nowMs: 2000,
  });

  const mockPort = new MockPort();
  const controller = new PortController({
    inst: "00000000-0000-0000-0000-000000000001",
    runtimeId: "fgfnkcefedeheoeamppkiiloncfekakf",
    connectNative: () => mockPort,
  });

  controller.connect();
  await mockPort.receive({
    type: "hello_ack",
    capture: "permitted",
    delivery: "idle",
    freshness_ms: 10000,
    destination_generation: "gen-1",
    period_id: "p-1",
  });

  // Accept b1 so b2 (delta batch) is posted
  await mockPort.receive({
    type: "accepted",
    result: "accepted",
    batch_id: b1.batchId,
    destination_generation: "gen-1",
    inst: controller.inst,
    period_id: "p-1",
  });

  assert.equal(mockPort.sent.length, 3);
  const sentB2 = mockPort.sent[2];
  assert.equal(sentB2.batch_id, b2.batchId);
  assert.equal(sentB2.records[0].t, "delta");

  // Send boundary for that generation
  await mockPort.receive({
    type: "boundary",
    destination_generation: "gen-1",
    period_id: "p-2",
  });

  // Read the outbox row
  const row = await DB.get("outbox", b2.batchId);
  assert.ok(row);
  assert.equal(row.records[0].t, "delta");
  assert.ok(row.snapshotRecords);
  assert.equal(row.snapshotRecords[0].t, "segment_start");

  // The producer cursor's snapshotRequired is true
  const cursorKey = `${controller.inst}\nctx-1`;
  const cursor = await DB.get("producer", cursorKey);
  assert.ok(cursor);
  assert.equal(cursor.snapshotRequired, true);
});

test("router: caller mutation after route does not affect stored records", async () => {
  await resetDB();
  const mockPort = new MockPort();
  const port = new PortController({
    inst: "00000000-0000-0000-0000-000000000001",
    runtimeId: "fgfnkcefedeheoeamppkiiloncfekakf",
    connectNative: () => mockPort,
  });

  port.connect();
  await mockPort.receive({
    type: "hello_ack",
    capture: "permitted",
    delivery: "delivered",
    freshness_ms: 10000,
    destination_generation: "gen-1",
    period_id: "p-1",
  });

  const extSender = {
    id: "fgfnkcefedeheoeamppkiiloncfekakf",
    url: "chrome-extension://fgfnkcefedeheoeamppkiiloncfekakf/popup.html",
  };

  await Router.route({ cmd: "acknowledgeDisclosure", version: 1 }, extSender, { runtimeId: "fgfnkcefedeheoeamppkiiloncfekakf", port });
  await Router.route({ cmd: "addGrantedOrigin", origin: "https://mail.google.com" }, extSender, { runtimeId: "fgfnkcefedeheoeamppkiiloncfekakf", port });

  const contentSender = {
    id: "fgfnkcefedeheoeamppkiiloncfekakf",
    tab: { id: 101 },
    frameId: 0,
    url: "https://mail.google.com/mail/u/0",
    origin: "https://mail.google.com",
  };

  const helloRes = await Router.route({ kind: "hello", realmToken: "realm-mut" }, contentSender, { runtimeId: "fgfnkcefedeheoeamppkiiloncfekakf", port });
  assert.equal(helloRes.ok, true);

  const blockObj = { id: "b1", type: "heading", depth: 0, text: "Original Text" };
  const skimRes = await Router.route(
    {
      kind: "skim",
      realmToken: "realm-mut",
      meta: { title: "Inbox", adapter: "gmail" },
      blocks: [blockObj],
    },
    contentSender,
    { runtimeId: "fgfnkcefedeheoeamppkiiloncfekakf", port }
  );
  assert.equal(skimRes.ok, true);

  // After route resolves, mutate the block object's text
  blockObj.text = "Mutated Text";

  const allOutbox = await Outbox.getAll();
  assert.equal(allOutbox.length, 1);
  assert.equal(allOutbox[0].records[0].blocks[0].text, "Original Text");
  assert.equal(allOutbox[0].snapshotRecords[0].blocks[0].text, "Original Text");
});

