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
    const prepared = Object.assign({}, entry, {
      blob_id: entry.blob_id || mintBlobId(),
      createdAt: entry.createdAt || Date.now(),
      attempts: Math.max(0, Number(entry.attempts || 0)),
      nextAttemptAt: Math.max(0, Number(entry.nextAttemptAt || 0)),
      lastError: entry.lastError || null,
    });
    const cumulative = { segments: 0, lines: 0 };
    return DB.tx(["outbox", "meta"], "readwrite", (_os, t) => {
      const outbox = t.objectStore("outbox");
      const meta = t.objectStore("meta");
      const rowsReq = outbox.getAll();
      rowsReq.onsuccess = () => {
        const rows = rowsReq.result.sort(byId);
        const droppedReq = meta.get("dropped");
        droppedReq.onsuccess = () => {
          const prior = normalizeDropped(droppedReq.result);
          const plan = O.enqueue(rows, prepared, O.OUTBOX_CAP);
          const evictedCount = rows.length + 1 - plan.outbox.length;
          const evictedIds = rows.slice(0, evictedCount).map((row) => row.id);
          cumulative.segments = prior.segments + plan.dropped.segments;
          cumulative.lines = prior.lines + plan.dropped.lines;
          for (const id of evictedIds) outbox.delete(id);
          outbox.add(prepared);
          meta.put(cumulative, "dropped");
        };
      };
      return cumulative;
    });
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
