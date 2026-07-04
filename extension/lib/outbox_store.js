// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

(function () {
  "use strict";

  const DB = globalThis.SolstoneDB;
  const O = globalThis.SolstoneOutbox;
  const U = globalThis.SolstoneUuid;

  function normalizeDropped(dropped) {
    return {
      segments: Math.max(0, Number((dropped && dropped.segments) || 0)),
      lines: Math.max(0, Number((dropped && dropped.lines) || 0)),
    };
  }

  function hex(bytes) {
    return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  function byId(a, b) {
    return (a.id || 0) - (b.id || 0);
  }

  async function all() {
    return (await DB.getAll("outbox")).sort(byId);
  }

  async function getDropped() {
    return normalizeDropped(await DB.get("meta", "dropped"));
  }

  async function setDropped(dropped) {
    await DB.put("meta", normalizeDropped(dropped), "dropped");
  }

  function mintBlobId() {
    const random = new Uint8Array(10);
    crypto.getRandomValues(random);
    return hex(U.uuidv7Bytes(Date.now(), random));
  }

  async function enqueue(entry) {
    const before = await all();
    const prepared = Object.assign({}, entry, {
      blob_id: entry.blob_id || mintBlobId(),
      createdAt: entry.createdAt || Date.now(),
      attempts: Math.max(0, Number(entry.attempts || 0)),
      nextAttemptAt: Math.max(0, Number(entry.nextAttemptAt || 0)),
      lastError: entry.lastError || null,
    });
    const computed = O.enqueue(before, prepared, O.OUTBOX_CAP);
    for (let i = 0; i < computed.dropped.segments; i++) {
      if (before[i]) await DB.del("outbox", before[i].id);
    }
    await DB.add("outbox", prepared);
    if (computed.dropped.segments || computed.dropped.lines) {
      const dropped = await getDropped();
      dropped.segments += computed.dropped.segments;
      dropped.lines += computed.dropped.lines;
      await setDropped(dropped);
      return dropped;
    }
    return getDropped();
  }

  async function head() {
    return (await all())[0] || null;
  }

  async function removeHeadIf(entry) {
    const current = await head();
    if (current && entry && current.id === entry.id) {
      await DB.del("outbox", current.id);
      return true;
    }
    return false;
  }

  async function counts() {
    const entries = await all();
    return { entries: entries.length, lines: O.outboxLineCount(entries) };
  }

  async function clearDropped() {
    if ((await counts()).entries > 0) return getDropped();
    const dropped = { segments: 0, lines: 0 };
    await setDropped(dropped);
    return dropped;
  }

  async function setBackoff(entry, nextAttemptAt, lastError, attempts) {
    if (!entry || entry.id == null) return;
    const current = await DB.get("outbox", entry.id);
    if (!current) return;
    current.nextAttemptAt = Math.max(0, Number(nextAttemptAt || 0));
    current.lastError = lastError || null;
    current.attempts = Math.max(0, Number(attempts || 0));
    await DB.put("outbox", current);
  }

  globalThis.SolstoneOutboxStore = { enqueue, head, removeHeadIf, all, counts, getDropped, clearDropped, setBackoff, setDropped };
})();
