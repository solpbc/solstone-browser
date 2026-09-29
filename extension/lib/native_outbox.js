// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

(function () {
  "use strict";

  const DB = globalThis.SolstoneDB;
  const Seg = globalThis.SolstoneSegment;
  const Blocks = globalThis.SolstoneBlocks;

  function getConsts() {
    const C = globalThis.SolstoneNativeBrowserConstants;
    if (!C) throw new Error("missing SolstoneNativeBrowserConstants");
    return C;
  }

  function mintBatchId() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  function byteLengthOf(value) {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
  }

  function contextKeyFor(inst, ctx) {
    return `${inst}\n${ctx}`;
  }

  function buildWireBatch(storedItem) {
    return {
      type: "batch",
      destination_generation: storedItem.destinationGeneration,
      inst: storedItem.inst,
      batch_id: storedItem.batchId,
      queued_at_ms: storedItem.queuedAtMs,
      records: storedItem.records,
    };
  }

  function validateWireBatch(wireBatch) {
    const codec = globalThis.SolstoneNativeBrowser;
    if (!codec || typeof codec.decode !== "function") {
      throw new Error("missing native-browser codec decode");
    }
    const jsonStr = JSON.stringify(wireBatch);
    const decoded = codec.decode(jsonStr, "extension_to_host");
    if (decoded.status !== "accept") {
      const err = new Error("invalid wire batch: " + (decoded.code || "refuse"));
      err.code = decoded.code;
      throw err;
    }
    return true;
  }

  async function enqueueSkim({ inst, ctx, destinationGeneration, senderUrl, site, title, adapter, blocks, nowMs } = {}) {
    const consts = getConsts();
    const clonedBlocks = structuredClone(blocks || []);
    const ts = Math.floor(Number(nowMs !== undefined ? nowMs : Date.now()));
    const originUrl = Blocks.originPath(senderUrl || "");
    const snapshotRec = Seg.snapshotLine(site, { url: originUrl, title: title || "", adapter: adapter || "" }, clonedBlocks, ts, 0);
    snapshotRec.ctx = ctx;
    snapshotRec.inst = inst;

    const ctxKey = contextKeyFor(inst, ctx);

    return DB.tx(["outbox", "producer"], "readwrite", (stores, t) => {
      const outboxStore = stores.outbox;
      const producerStore = stores.producer;

      const cursorReq = producerStore.get(ctxKey);
      const allOutboxReq = outboxStore.getAll();

      cursorReq.onsuccess = () => {
        try {
          const cursor = cursorReq.result;
          allOutboxReq.onsuccess = () => {
            try {
              const allItems = (allOutboxReq.result || []).sort((a, b) => (a.seq || 0) - (b.seq || 0));
              let totalBytes = 0;
              let maxSeq = 0;
              for (const item of allItems) {
                totalBytes += item.bytes || byteLengthOf(item);
                if (item.seq && item.seq > maxSeq) maxSeq = item.seq;
              }

              let recordsToUse = null;
              const snapshotRecords = [snapshotRec];
              const hasValidCursor = cursor && cursor.generation === destinationGeneration && cursor.snapshotRequired !== true && Array.isArray(cursor.blocks);

              if (hasValidCursor) {
                const diff = Seg.diffBlocks(cursor.blocks, clonedBlocks);
                if (diff.added.length === 0 && diff.updated.length === 0 && diff.removed.length === 0) {
                  t.__result = { enqueued: false, disposition: "empty" };
                  return;
                }
                const deltas = Seg.deltaLines(site, diff, ts, 0);
                for (const d of deltas) {
                  d.ctx = ctx;
                  d.inst = inst;
                }

                const candidateWireBatch = {
                  type: "batch",
                  destination_generation: destinationGeneration,
                  inst,
                  batch_id: "00000000000000000000000000000000",
                  queued_at_ms: ts,
                  records: deltas,
                };

                const deltasCountOk = deltas.length <= consts.DELTA_RECORDS_MAX;
                const deltasBytesOk = byteLengthOf(candidateWireBatch) <= consts.EXTENSION_TO_HOST_MAX;

                if (deltasCountOk && deltasBytesOk) {
                  recordsToUse = deltas;
                } else {
                  const snapshotWire = {
                    type: "batch",
                    destination_generation: destinationGeneration,
                    inst,
                    batch_id: "00000000000000000000000000000000",
                    queued_at_ms: ts,
                    records: snapshotRecords,
                  };
                  if (byteLengthOf(snapshotWire) <= consts.EXTENSION_TO_HOST_MAX) {
                    recordsToUse = snapshotRecords;
                  } else {
                    const err = new Error("batch-oversize");
                    err.code = "batch-oversize";
                    err.disposition = "batch-oversize";
                    t.__error = err;
                    t.abort();
                    return;
                  }
                }
              } else {
                const snapshotWire = {
                  type: "batch",
                  destination_generation: destinationGeneration,
                  inst,
                  batch_id: "00000000000000000000000000000000",
                  queued_at_ms: ts,
                  records: snapshotRecords,
                };
                if (byteLengthOf(snapshotWire) <= consts.EXTENSION_TO_HOST_MAX) {
                  recordsToUse = snapshotRecords;
                } else {
                  const err = new Error("batch-oversize");
                  err.code = "batch-oversize";
                  err.disposition = "batch-oversize";
                  t.__error = err;
                  t.abort();
                  return;
                }
              }

              const batchId = mintBatchId();
              const nextSeq = maxSeq + 1;
              const storedItem = {
                batchId,
                seq: nextSeq,
                inst,
                ctx,
                destinationGeneration,
                queuedAtMs: ts,
                records: recordsToUse,
                snapshotRecords,
                bytes: 0,
              };

              const wireBatch = buildWireBatch(storedItem);
              validateWireBatch(wireBatch);

              let itemBytes = byteLengthOf(storedItem);
              storedItem.bytes = itemBytes;
              while (true) {
                const nextBytes = byteLengthOf(storedItem);
                if (nextBytes === storedItem.bytes) break;
                storedItem.bytes = nextBytes;
              }

              if (totalBytes + storedItem.bytes > consts.OUTBOX_BYTES_MAX) {
                const err = new Error("outbox-full");
                err.code = "outbox-full";
                err.disposition = "outbox-full";
                t.__error = err;
                t.abort();
                return;
              }

              outboxStore.add(storedItem);

              const nextCursor = {
                contextKey: ctxKey,
                inst,
                ctx,
                blocks: clonedBlocks,
                generation: destinationGeneration,
                snapshotRequired: false,
              };
              producerStore.put(nextCursor);

              t.__result = { enqueued: true, batchId, seq: nextSeq, bytes: storedItem.bytes };
            } catch (err) {
              t.__error = err;
              t.abort();
              return;
            }
          };
        } catch (err) {
          t.__error = err;
          t.abort();
          return;
        }
      };
    });
  }

  async function getHead() {
    return DB.tx("outbox", "readonly", (outboxStore, t) => {
      const req = outboxStore.getAll();
      req.onsuccess = () => {
        try {
          const items = (req.result || []).sort((a, b) => (a.seq || 0) - (b.seq || 0));
          t.__result = items[0] || null;
        } catch (err) {
          t.__error = err;
          t.abort();
        }
      };
    });
  }

  async function getAll() {
    return DB.tx("outbox", "readonly", (outboxStore, t) => {
      const req = outboxStore.getAll();
      req.onsuccess = () => {
        try {
          const items = (req.result || []).sort((a, b) => (a.seq || 0) - (b.seq || 0));
          t.__result = items;
        } catch (err) {
          t.__error = err;
          t.abort();
        }
      };
    });
  }

  async function removeBatch(batchId) {
    return DB.tx("outbox", "readwrite", (outboxStore) => {
      outboxStore.delete(batchId);
      return true;
    });
  }

  async function markSnapshotRequired(inst, ctx) {
    const ctxKey = contextKeyFor(inst, ctx);
    return DB.tx("producer", "readwrite", (producerStore, t) => {
      const req = producerStore.get(ctxKey);
      req.onsuccess = () => {
        try {
          const cursor = req.result;
          if (cursor) {
            cursor.snapshotRequired = true;
            producerStore.put(cursor);
          }
        } catch (err) {
          t.__error = err;
          t.abort();
        }
      };
    });
  }

  async function markAllSnapshotRequired() {
    return DB.tx("producer", "readwrite", (producerStore, t) => {
      const req = producerStore.getAll();
      req.onsuccess = () => {
        try {
          for (const cursor of req.result || []) {
            cursor.snapshotRequired = true;
            producerStore.put(cursor);
          }
        } catch (err) {
          t.__error = err;
          t.abort();
        }
      };
    });
  }

  async function applyRejectedReceipt(batchId, receipt) {
    return DB.tx(["outbox", "producer"], "readwrite", (stores, t) => {
      const outboxStore = stores.outbox;
      const producerStore = stores.producer;

      const itemReq = outboxStore.get(batchId);
      itemReq.onsuccess = () => {
        try {
          const item = itemReq.result;
          if (!item) {
            t.__result = { removed: 0, promotedBatchId: null };
            return;
          }

          if (receipt.reason === "snapshot_required") {
            item.records = item.snapshotRecords;
            let itemBytes = byteLengthOf(item);
            item.bytes = itemBytes;
            while (true) {
              const nextBytes = byteLengthOf(item);
              if (nextBytes === item.bytes) break;
              item.bytes = nextBytes;
            }
            outboxStore.put(item);
            t.__result = { removed: 0, promotedBatchId: null };
            return;
          }

          const consts = getConsts();
          const permanentReasons = consts.RECEIPT_CLASSES?.permanent || [];
          if (permanentReasons.includes(receipt.reason)) {
            outboxStore.delete(batchId);
            const ctxKey = contextKeyFor(item.inst, item.ctx);

            const cursorReq = producerStore.get(ctxKey);
            cursorReq.onsuccess = () => {
              try {
                const cursor = cursorReq.result;
                if (cursor) {
                  cursor.snapshotRequired = true;
                  producerStore.put(cursor);
                }
              } catch (err) {
                t.__error = err;
                t.abort();
                return;
              }
            };

            const allReq = outboxStore.getAll();
            allReq.onsuccess = () => {
              try {
                const remaining = (allReq.result || [])
                  .filter((x) => x.inst === item.inst && x.ctx === item.ctx && (x.seq || 0) > (item.seq || 0))
                  .sort((a, b) => (a.seq || 0) - (b.seq || 0));

                let promotedBatchId = null;
                if (remaining.length > 0) {
                  const descendant = remaining[0];
                  promotedBatchId = descendant.batchId;
                  descendant.records = descendant.snapshotRecords;
                  let dBytes = byteLengthOf(descendant);
                  descendant.bytes = dBytes;
                  while (true) {
                    const nextBytes = byteLengthOf(descendant);
                    if (nextBytes === descendant.bytes) break;
                    descendant.bytes = nextBytes;
                  }
                  outboxStore.put(descendant);
                }
                t.__result = { removed: 1, promotedBatchId };
              } catch (err) {
                t.__error = err;
                t.abort();
                return;
              }
            };
          } else {
            t.__result = { removed: 0, promotedBatchId: null };
          }
        } catch (err) {
          t.__error = err;
          t.abort();
          return;
        }
      };
    });
  }

  async function retireExpired(nowMs) {
    const consts = getConsts();
    const codec = globalThis.SolstoneNativeBrowser;
    const now = Number(nowMs !== undefined ? nowMs : Date.now());

    return DB.tx(["outbox", "producer"], "readwrite", (stores, t) => {
      const outboxStore = stores.outbox;
      const producerStore = stores.producer;

      const allReq = outboxStore.getAll();
      let retiredCount = 0;

      allReq.onsuccess = () => {
        try {
          const allItems = allReq.result || [];
          const expiredByContext = new Map();

          for (const item of allItems) {
            if (codec.queuedPastOutboxAge(item.queuedAtMs, now, consts.OUTBOX_AGE_MS_MAX)) {
              retiredCount++;
              outboxStore.delete(item.batchId);
              const key = contextKeyFor(item.inst, item.ctx);
              if (!expiredByContext.has(key)) expiredByContext.set(key, []);
              expiredByContext.get(key).push(item);
            }
          }

          if (retiredCount > 0) {
            for (const [ctxKey, expiredItems] of expiredByContext) {
              const cursorReq = producerStore.get(ctxKey);
              cursorReq.onsuccess = () => {
                try {
                  const cursor = cursorReq.result;
                  if (cursor) {
                    cursor.snapshotRequired = true;
                    producerStore.put(cursor);
                  }
                } catch (err) {
                  t.__error = err;
                  t.abort();
                  return;
                }
              };

              const maxExpiredSeq = Math.max(...expiredItems.map((e) => e.seq || 0));
              const sample = expiredItems[0];
              const remaining = allItems
                .filter((x) => x.inst === sample.inst && x.ctx === sample.ctx && (x.seq || 0) > maxExpiredSeq)
                .sort((a, b) => (a.seq || 0) - (b.seq || 0));

              if (remaining.length > 0) {
                const descendant = remaining[0];
                descendant.records = descendant.snapshotRecords;
                let dBytes = byteLengthOf(descendant);
                descendant.bytes = dBytes;
                while (true) {
                  const nextBytes = byteLengthOf(descendant);
                  if (nextBytes === descendant.bytes) break;
                  descendant.bytes = nextBytes;
                }
                outboxStore.put(descendant);
              }
            }
          }
          t.__result = { count: retiredCount, disposition: "expired-unaccepted" };
        } catch (err) {
          t.__error = err;
          t.abort();
          return;
        }
      };
    });
  }

  async function retireStaleGeneration(newGeneration) {
    return DB.tx(["outbox", "producer"], "readwrite", (stores, t) => {
      const outboxStore = stores.outbox;
      const producerStore = stores.producer;

      const allReq = outboxStore.getAll();
      let retiredCount = 0;

      allReq.onsuccess = () => {
        try {
          const allItems = allReq.result || [];
          const staleContexts = new Set();
          for (const item of allItems) {
            if (item.destinationGeneration !== newGeneration) {
              retiredCount++;
              outboxStore.delete(item.batchId);
              staleContexts.add(contextKeyFor(item.inst, item.ctx));
            }
          }
          for (const ctxKey of staleContexts) {
            const cursorReq = producerStore.get(ctxKey);
            cursorReq.onsuccess = () => {
              try {
                const cursor = cursorReq.result;
                if (cursor) {
                  cursor.snapshotRequired = true;
                  producerStore.put(cursor);
                }
              } catch (err) {
                t.__error = err;
                t.abort();
                return;
              }
            };
          }
          t.__result = { count: retiredCount, disposition: "stale-generation" };
        } catch (err) {
          t.__error = err;
          t.abort();
          return;
        }
      };
    });
  }

  globalThis.SolstoneNativeOutbox = {
    enqueueSkim,
    getHead,
    getAll,
    removeBatch,
    markSnapshotRequired,
    markAllSnapshotRequired,
    applyRejectedReceipt,
    retireExpired,
    retireStaleGeneration,
    buildWireBatch,
    validateWireBatch,
    byteLengthOf,
  };
})();
