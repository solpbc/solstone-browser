// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(`${ROOT}/package.json`);
require("fake-indexeddb/auto");
for (const p of [
  "native-browser/constants.js",
  "native-browser/schemas.js",
  "native-browser/schema-validator.js",
  "native-browser/codec.js",
  "lib/uuid.js",
  "lib/db.js",
  "lib/blocks.js",
  "lib/hosts.js",
  "lib/segment.js",
  "lib/gate.js",
  "lib/native_outbox.js",
  "lib/native_port.js",
])
  await import(`${ROOT}/extension/${p}`);
const DB = globalThis.SolstoneDB,
  O = globalThis.SolstoneNativeOutbox,
  C = globalThis.SolstoneNativePort;
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
};
class P {
  sent = [];
  mh = [];
  dh = [];
  onMessage = { addListener: (h) => this.mh.push(h) };
  onDisconnect = { addListener: (h) => this.dh.push(h) };
  postMessage(m) {
    this.sent.push(m);
  }
  disconnect() {
    this.dh.forEach((h) => h());
  }
  receive(m) {
    return Promise.all(this.mh.map((h) => h(m)));
  }
}
const ack = (capture = "permitted", g = "A", type = "hello_ack") => ({
  type,
  capture,
  delivery: "delivered",
  freshness_ms: capture === "permitted" ? 15000 : 0,
  destination_generation: ["unavailable", "not_paired"].includes(capture)
    ? null
    : g,
  period_id: ["unavailable", "not_paired"].includes(capture) ? null : "period",
});
async function reset() {
  for (const s of ["meta", "outbox", "producer"]) await DB.clear(s);
}
async function enqueue(g = "A") {
  return O.enqueueSkim({
    inst: "00000000-0000-0000-0000-000000000001",
    ctx: "ctx-" + g,
    destinationGeneration: g,
    senderUrl: "https://example.com/page",
    site: "example.com",
    title: "Page",
    adapter: "generic",
    blocks: [{ id: "1", type: "text", depth: 0, text: "synthetic" }],
    nowMs: Date.now(),
  });
}
function setup() {
  const ports = [],
    timers = [],
    clock = { now: 100 };
  const c = new C({
    inst: "00000000-0000-0000-0000-000000000001",
    runtimeId: "fgfnkcefedeheoeamppkiiloncfekakf",
    connectNative: () => {
      const p = new P();
      ports.push(p);
      return p;
    },
    now: () => clock.now,
    schedule: (fn, ms) => {
      timers.push({ fn, ms });
      return timers.length;
    },
  });
  c.consentVersion = 1;
  c.grantedOrigins.add("https://example.com");
  c.connect();
  return { c, ports, timers, clock, p: ports[0] };
}
async function run(name, fn) {
  await test(name, async () => {
    await reset();
    await fn();
  });
}
await run("late hello cannot open capture", async () => {
  const { c, p, clock } = setup();
  clock.now += 6000;
  await p.receive(ack());
  assert.equal(c.getStatus().gate.open, false);
});
await run("duplicate hello cannot renew lease", async () => {
  const { c, p, clock } = setup();
  await p.receive(ack());
  clock.now += 1000;
  await p.receive(ack());
  assert.equal(c.lease.receivedAt, 100);
});
await run(
  "older blocked hello cannot overwrite destination or delete current queue",
  async () => {
    const { c, p } = setup();
    const d = deferred(),
      entered = deferred(),
      oldPut = DB.put;
    let heldFirstWrite = false;
    DB.put = async (...a) => {
      if (a[2] === "everConnected" && !heldFirstWrite) {
        heldFirstWrite = true;
        entered.resolve();
        await d.promise;
      }
      return oldPut(...a);
    };
    try {
      const pending = p.receive(ack("permitted", "A"));
      await entered.promise;
      await p.receive(ack("permitted", "B", "state"));
      const item = await enqueue("B");
      assert.equal(c.destinationGeneration, "B");
      d.resolve();
      await pending;
      assert.equal(c.destinationGeneration, "B");
      assert.equal(
        (await O.getAll()).some((x) => x.batchId === item.batchId),
        true,
      );
    } finally {
      DB.put = oldPut;
    }
  },
);
await run("getHead continuation cannot post after unavailable", async () => {
  const { c, p } = setup();
  await p.receive(ack());
  await enqueue();
  const d = deferred(),
    oldGet = O.getHead;
  O.getHead = async () => {
    const head = await oldGet();
    await d.promise;
    return head;
  };
  try {
    const pending = c.drain();
    await p.receive(ack("unavailable", "A", "state"));
    d.resolve();
    await pending;
    assert.equal(c.hostCapture, "unavailable");
    assert.equal(p.sent.filter((m) => m.type === "batch").length, 0);
  } finally {
    O.getHead = oldGet;
  }
});
await run("repeated snapshot refusals are paced", async () => {
  const { c, p, clock } = setup();
  const item = await enqueue();
  await p.receive(ack());
  for (let i = 0; i < 4; i++)
    await p.receive({
      type: "accepted",
      batch_id: item.batchId,
      result: "rejected",
      reason: "snapshot_required",
      class: "retryable",
      inst: c.inst,
      destination_generation: "A",
    });
  assert.equal(p.sent.filter((m) => m.type === "batch").length, 1);
});
await run("obsolete drain cannot release replacement ownership", async () => {
  const { c, p, ports } = setup();
  await p.receive(ack());
  await enqueue();
  const oldHead = await O.getHead();
  const ds = [deferred(), deferred()],
    entered = deferred();
  let calls = 0;
  const oldGet = O.getHead;
  O.getHead = async () => {
    const i = calls++;
    if (i < 2) {
      if (i === 1) entered.resolve();
      await ds[i].promise;
    }
    return oldHead;
  };
  try {
    const old = c.drain();
    c.connect();
    const newer = ports[1].receive(ack());
    await entered.promise;
    ds[0].resolve();
    await old;
    assert.ok(c.drainOwner);
    await c.drain();
    ds[1].resolve();
    await newer;
    assert.equal(ports[1].sent.filter((m) => m.type === "batch").length, 1);
  } finally {
    O.getHead = oldGet;
  }
});
await run("old ACK timer cannot take replacement operation", async () => {
  const { c, p, ports, timers } = setup();
  await enqueue();
  await p.receive(ack());
  const timer = timers.at(-1);
  c.connect();
  await ports[1].receive(ack());
  assert.equal(ports[1].sent.filter((m) => m.type === "batch").length, 1);
  timer.fn();
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
  assert.equal(ports[1].sent.filter((m) => m.type === "batch").length, 1);
});
await run("expired status omits host facts immediately", async () => {
  const { c, p, clock } = setup();
  await p.receive({ ...ack(), custody: { full: false, stale: true } });
  clock.now += 15000;
  const s = c.getStatus();
  assert.equal(s.gate.open, false);
  assert.equal(s.hostCapture, null);
  assert.equal(s.custody, null);
});
await run("unsupported clears previous host facts", async () => {
  const { c, p } = setup();
  await p.receive({ ...ack(), custody: { full: false, stale: true } });
  await p.receive({ type: "unsupported", protocol: 2, behind: "app" });
  const s = c.getStatus();
  assert.equal(s.connected, false);
  assert.equal(s.hostCapture, null);
  assert.equal(s.custody, null);
});
await run("obsolete generation promotion cannot mutate replacement queue", async () => {
  const { c, p, ports } = setup();
  c.everConnected = true;
  const d = deferred(),
    entered = deferred(),
    oldPromote = O.promoteHeldForGeneration;
  O.promoteHeldForGeneration = async (g, authorize) => {
    if (g === "A") {
      entered.resolve();
      await d.promise;
    }
    return oldPromote(g, authorize);
  };
  try {
    const pending = p.receive(ack("permitted", "A"));
    await entered.promise;
    c.connect();
    await ports[1].receive(ack("permitted", "B"));
    const item = await enqueue("B");
    d.resolve();
    await pending;
    assert.equal(c.destinationGeneration, "B");
    assert.equal(
      (await O.getAll()).some((x) => x.batchId === item.batchId),
      true,
    );
  } finally {
    O.promoteHeldForGeneration = oldPromote;
  }
});
await run("concurrent drains post once and paused delivery works", async () => {
  const { c, p } = setup();
  await p.receive(ack("paused"));
  await enqueue();
  await Promise.all([c.drain(), c.drain(), c.drain()]);
  assert.equal(c.lease, null);
  assert.equal(c.handshake, "ready");
  assert.equal(p.sent.filter((m) => m.type === "batch").length, 1);
});
await run("not-paired recovers through state on same port", async () => {
  const { c, p } = setup();
  await p.receive(ack("not_paired"));
  assert.equal(c.getStatus().gate.open, false);
  await p.receive(ack("permitted", "A", "state"));
  assert.equal(c.getStatus().gate.open, true);
});
await run("ACK timer cannot repost during receipt transaction", async () => {
  const { c, p, timers } = setup();
  const item = await enqueue();
  await p.receive(ack());
  const d = deferred(),
    oldRemove = O.removeBatch;
  O.removeBatch = async (id) => {
    await d.promise;
    return oldRemove(id);
  };
  try {
    const receiving = p.receive({
      type: "accepted",
      batch_id: item.batchId,
      result: "accepted",
      inst: c.inst,
      destination_generation: "A",
      period_id: "period",
    });
    timers.at(-1).fn();
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    assert.equal(p.sent.filter((m) => m.type === "batch").length, 1);
    d.resolve();
    await receiving;
  } finally {
    O.removeBatch = oldRemove;
  }
});
await run("unsupported app transition publishes closure", async () => {
  const { c, p } = setup();
  let notifications = 0;
  c.onStatusChange = () => notifications++;
  await p.receive(ack());
  const before = notifications;
  await p.receive({ type: "unsupported", protocol: 2, behind: "app" });
  assert.equal(c.getStatus().behind, "app");
  assert.equal(c.livePort, null);
  assert.ok(notifications > before);
});

await run(
  "receipt storage rejection releases ownership and retries after backoff",
  async () => {
    const { c, p, timers, clock } = setup();
    const item = await enqueue();
    await p.receive(ack());
    const remove = O.removeBatch;
    O.removeBatch = async () => {
      throw Error("fixture write failure");
    };
    try {
      await p.receive({
        type: "accepted",
        result: "accepted",
        batch_id: item.batchId,
        inst: c.inst,
        destination_generation: "A",
        period_id: "period",
      });
    } finally {
      O.removeBatch = remove;
    }
    assert.equal(c.inflightBatch, null);
    assert.equal(c.drainOwner, false);
    await c.drain();
    assert.equal(p.sent.filter((x) => x.type === "batch").length, 1);
    clock.now += c.retryDelayMs;
    await c.drain();
    assert.equal(p.sent.filter((x) => x.type === "batch").length, 2);
    assert.equal(p.sent.at(-1).batch_id, item.batchId);
  },
);

await run(
  "custody full does not preserve host facts beyond positive freshness",
  async () => {
    const { c, p, clock } = setup();
    await p.receive({ ...ack(), custody: { full: true, stale: true } });
    assert.equal(c.lease, null);
    clock.now += 15000;
    assert.equal(c.getStatus().custody, null);
    await c.poll();
    assert.equal(c.hostCapture, null);
  },
);

await run(
  "hello persistence cannot retain facts after spending the entire lease",
  async () => {
    const { c, p, clock } = setup(),
      original = DB.put;
    DB.put = async (...args) => {
      if (args[2] === "everConnected") clock.now += 15000;
      return original(...args);
    };
    try {
      await p.receive({ ...ack(), custody: { full: false, stale: true } });
    } finally {
      DB.put = original;
    }
    assert.equal(c.getStatus().hostDelivery, null);
    assert.equal(c.getStatus().custody, null);
  },
);

await run("all retryable refusals are paced including age policy", async () => {
  const { c, p } = setup(),
    item = await enqueue();
  await p.receive(ack());
  for (let i = 0; i < 4; i++)
    await p.receive({
      type: "accepted",
      result: "rejected",
      class: "retryable",
      reason: "age_policy",
      batch_id: item.batchId,
      inst: c.inst,
      destination_generation: "A",
    });
  assert.equal(p.sent.filter((x) => x.type === "batch").length, 1);
});

await run("cached legacy expiry cannot spin through repeated host state updates", async () => {
  const { c, p, clock } = setup(), item = await enqueue();
  await p.receive(ack());
  const first = p.sent.find(message => message.type === "batch");
  const refusal = {
    type: "accepted", result: "rejected", class: "permanent", reason: "expired_unaccepted",
    batch_id: item.batchId, inst: c.inst, destination_generation: "A",
  };
  for (let attempt = 0; attempt < 3; attempt++) {
    await p.receive(refusal);
    for (let update = 0; update < 4; update++) {
      await p.receive(ack("permitted", "A", "state"));
      await c.drain();
    }
    assert.equal(p.sent.filter(message => message.type === "batch").length, attempt + 1);
    assert.ok(await DB.get("outbox", item.batchId));
    assert.equal(await DB.get("meta", "lossNotice"), undefined);
    clock.now += c.retryDelayMs;
    await c.drain();
    const posts = p.sent.filter(message => message.type === "batch");
    assert.equal(posts.length, attempt + 2);
    assert.equal(posts.at(-1).batch_id, first.batch_id);
    assert.deepEqual(posts.at(-1).records, first.records);
  }
});

await run(
  "bye publishes closure before snapshot marking finishes",
  async () => {
    const { c, p } = setup();
    await p.receive(ack());
    const original = O.markAllSnapshotRequired,
      stalled = deferred();
    O.markAllSnapshotRequired = () => stalled.promise;
    let status;
    c.onStatusChange = (value) => (status = value);
    const pending = p.receive({ type: "bye", reason: "update" });
    try {
      assert.equal(status.connected, false);
      assert.equal(status.capturePermitted, false);
    } finally {
      stalled.resolve();
      O.markAllSnapshotRequired = original;
      await pending;
    }
  },
);

await run(
  "receipt followed by failed capacity read does not strand the next batch",
  async () => {
    const { c, p, clock } = setup();
    const first = await enqueue();
    await O.enqueueSkim({
      inst: c.inst,
      ctx: "second",
      destinationGeneration: "A",
      senderUrl: "https://example.com/second",
      site: "example.com",
      title: "Second",
      adapter: "generic",
      blocks: [{ id: "1", type: "text", depth: 0, text: "second" }],
      nowMs: Date.now(),
    });
    await p.receive(ack());
    const original = O.getCapacityStatus;
    O.getCapacityStatus = async () => {
      throw Error("fixture read failure");
    };
    try {
      await p.receive({
        type: "accepted",
        result: "accepted",
        batch_id: first.batchId,
        inst: c.inst,
        destination_generation: "A",
        period_id: "period",
      });
    } finally {
      O.getCapacityStatus = original;
    }
    assert.equal(c.inflightBatch, null);
    clock.now += c.retryDelayMs;
    await c.drain();
    assert.equal(p.sent.filter((x) => x.type === "batch").length, 2);
    assert.notEqual(p.sent.at(-1).batch_id, first.batchId);
  },
);
