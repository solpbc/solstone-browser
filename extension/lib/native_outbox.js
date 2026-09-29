// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

(function () {
  "use strict";

  const DB = globalThis.SolstoneDB;
  const Seg = globalThis.SolstoneSegment;
  const Blocks = globalThis.SolstoneBlocks;
  const ageSamples = new Map(); // batchId -> { mono, floor }

  const activeTransactions = new Set();
  function checkAuthorization() {
    for (const check of activeTransactions) check();
  }
  function guardTransaction(t, authorize) {
    if (typeof authorize !== "function") return true;
    let active = true;
    const finish = () => { active = false; activeTransactions.delete(check); };
    const check = () => {
      if (!active) return true;
      let allowed = false;
      try { allowed = authorize() === true; } catch (_e) {}
      if (allowed) return true;
      const err = new Error("authorization_failed");
      err.code = "authorization_failed";
      t.__error = err;
      try { t.abort(); } catch (_e) {}
      finish();
      return false;
    };
    activeTransactions.add(check);
    t.addEventListener("complete", finish);
    t.addEventListener("abort", finish);
    // Check after all request listeners, while the transaction is abortable.
    t.addEventListener("success", () => { Promise.resolve().then(check); }, true);
    return check();
  }

  function appendLoss(meta, notice) {
    const previous = meta.get("lossNotice");
    previous.onsuccess = () => {
      const old = previous.result;
      meta.put({ ...notice, count: notice.count + (old?.count || 0) }, "lossNotice");
    };
  }

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
    const records = storedItem.sendSnapshot ? storedItem.snapshotRecords : storedItem.records;
    return {
      type: "batch",
      destination_generation: storedItem.destinationGeneration,
      inst: storedItem.inst,
      batch_id: storedItem.batchId,
      queued_at_ms: storedItem.queuedAtMs,
      records,
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

  async function enqueueSkim({ inst, ctx, destinationGeneration, senderUrl, site, title, adapter, blocks, nowMs, monotonicNow, authorize, writeObservation } = {}) {
    const mono = monotonicNow ?? performance.now();
    const consts = getConsts();
    const clonedBlocks = structuredClone(blocks || []);
    const ts = Math.floor(Number(nowMs !== undefined ? nowMs : Date.now()));
    const originUrl = Blocks.originPath(senderUrl || "");

    const truncatedTitle = Blocks.sliceCodePoints ? Blocks.sliceCodePoints(title || "", consts.TITLE_STRING_MAX || 8192) : (title || "");
    const truncatedSite = Blocks.sliceCodePoints ? Blocks.sliceCodePoints(site || "", consts.SITE_STRING_MAX || 512) : (site || "");
    const truncatedAdapter = Blocks.sliceCodePoints ? Blocks.sliceCodePoints(adapter || "", consts.ADAPTER_STRING_MAX || 64) : (adapter || "");

    const snapshotRec = Seg.snapshotLine(truncatedSite, { url: originUrl, title: truncatedTitle, adapter: truncatedAdapter }, clonedBlocks, ts, 0);
    snapshotRec.ctx = ctx;
    snapshotRec.inst = inst;

    const ctxKey = contextKeyFor(inst, ctx);

    const result = await DB.tx(["outbox", "producer", "meta"], "readwrite", (stores, t) => {
      const outboxStore = stores.outbox;
      const producerStore = stores.producer;
      if (!guardTransaction(t, authorize)) return;

      if (typeof authorize === "function") {
        try {
          const authOk = authorize();
          if (!authOk) {
            const err = new Error("authorization_failed");
            err.code = "authorization_failed";
            t.__error = err;
            t.abort();
            return;
          }
        } catch (authErr) {
          t.__error = authErr;
          t.abort();
          return;
        }
      }

      let cursor = null;
      let allItems = null;
      let allCursors = null;
      let pending = 3;

      function checkReady() {
        if (--pending > 0) return;
        try {
          const sortedItems = (allItems || []).sort((a, b) => (a.seq || 0) - (b.seq || 0));
          let outboxBytes = 0;
          let maxSeq = 0;
          for (const item of sortedItems) {
            outboxBytes += item.bytes || byteLengthOf(item);
            if (item.seq && item.seq > maxSeq) maxSeq = item.seq;
          }
          let producerBytes = 0;
          for (const c of (allCursors || [])) {
            producerBytes += byteLengthOf(c);
          }
          const totalBytes = outboxBytes + producerBytes;

          let recordsToUse = null;
          const snapshotRecords = [snapshotRec];
          const hasValidCursor = cursor && cursor.generation === destinationGeneration && cursor.snapshotRequired !== true && Array.isArray(cursor.blocks);

          if (hasValidCursor) {
            const diff = Seg.diffBlocks(cursor.blocks, clonedBlocks);
            if (diff.added.length === 0 && diff.updated.length === 0 && diff.removed.length === 0) {
              writeObservation?.(stores.meta);
              t.__result = { enqueued: false, disposition: "empty" };
              return;
            }
            const deltas = Seg.deltaLines(truncatedSite, diff, ts, 0);
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
            observedAgeMs: 0,
            ageSampleWallMs: ts,
            sendSnapshot: false,
          };

          // Pre-validate BOTH candidate wire batch AND snapshot recovery wire batch
          const wireBatch = buildWireBatch(storedItem);
          validateWireBatch(wireBatch);
          const recoveryBatch = buildWireBatch({ ...storedItem, sendSnapshot: true });
          validateWireBatch(recoveryBatch);

          // Reserve 64 bytes for bounded age metadata growth; accounting is
          // deliberately conservative even as clock values gain digits.
          let itemBytes = byteLengthOf(storedItem) + 64;
          storedItem.bytes = itemBytes;
          while (true) {
            const nextBytes = byteLengthOf(storedItem) + 64;
            if (nextBytes === storedItem.bytes) break;
            storedItem.bytes = nextBytes;
          }

          const nextCursor = {
            contextKey: ctxKey,
            inst,
            ctx,
            blocks: clonedBlocks,
            generation: destinationGeneration,
            snapshotRequired: false,
          };

          const cursorDelta = byteLengthOf(nextCursor) - (cursor ? byteLengthOf(cursor) : 0);
          if (totalBytes + storedItem.bytes + cursorDelta > consts.OUTBOX_BYTES_MAX) {
            const err = new Error("outbox-full");
            err.code = "outbox-full";
            err.disposition = "outbox-full";
            t.__error = err;
            t.abort();
            return;
          }

          if (typeof authorize === "function") {
            const authOk = authorize();
            if (!authOk) {
              const err = new Error("authorization_failed");
              err.code = "authorization_failed";
              t.__error = err;
              t.abort();
              return;
            }
          }

          writeObservation?.(stores.meta);
          outboxStore.add(storedItem);
          producerStore.put(nextCursor);

          const newTotalBytes = totalBytes + storedItem.bytes + cursorDelta;
          const pressure = { active: newTotalBytes >= consts.OUTBOX_BYTES_MAX };

          t.__result = {
            enqueued: true,
            batchId,
            seq: nextSeq,
            bytes: storedItem.bytes,
            pressure,
          };
        } catch (err) {
          t.__error = err;
          t.abort();
        }
      }

      const cursorReq = producerStore.get(ctxKey);
      cursorReq.onsuccess = () => {
        cursor = cursorReq.result;
        checkReady();
      };
      cursorReq.onerror = () => {
        t.__error = cursorReq.error;
        t.abort();
      };

      const allOutboxReq = outboxStore.getAll();
      allOutboxReq.onsuccess = () => {
        allItems = allOutboxReq.result;
        checkReady();
      };
      allOutboxReq.onerror = () => {
        t.__error = allOutboxReq.error;
        t.abort();
      };

      const allProducersReq = producerStore.getAll();
      allProducersReq.onsuccess = () => {
        allCursors = allProducersReq.result;
        checkReady();
      };
      allProducersReq.onerror = () => {
        t.__error = allProducersReq.error;
        t.abort();
      };
    });
    if (result?.enqueued) ageSamples.set(result.batchId, { mono, floor: 0 });
    return result;
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
    ageSamples.delete(batchId);
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

  async function pruneCursor(inst, ctx) {
    const ctxKey = contextKeyFor(inst, ctx);
    return DB.tx("producer", "readwrite", (producerStore) => {
      producerStore.delete(ctxKey);
      return true;
    });
  }

  async function applyRejectedReceipt(batchId, receipt) {
    return DB.tx(["outbox", "producer", "meta"], "readwrite", (stores, t) => {
      const outboxStore = stores.outbox;
      const producerStore = stores.producer;
      const metaStore = stores.meta;

      const itemReq = outboxStore.get(batchId);
      itemReq.onsuccess = () => {
        try {
          const item = itemReq.result;
          if (!item) {
            t.__result = { removed: 0, promotedBatchId: null };
            return;
          }

          const ctxKey = contextKeyFor(item.inst, item.ctx);
          const cursorReq = producerStore.get(ctxKey);

          cursorReq.onsuccess = () => {
            try {
              const cursor = cursorReq.result;
              if (cursor) {
                cursor.snapshotRequired = true;
                producerStore.put(cursor);
              }

              if (receipt.reason === "snapshot_required") {
                item.sendSnapshot = true;
                outboxStore.put(item);
                t.__result = { removed: 0, promotedBatchId: null };
                return;
              }

              const consts = getConsts();
              const permanentReasons = consts.RECEIPT_CLASSES?.permanent || [];
              if (permanentReasons.includes(receipt.reason)) {
                outboxStore.delete(batchId);
                ageSamples.delete(batchId);

                const lossSeqReq = metaStore.get("lossSeq");
                lossSeqReq.onsuccess = () => {
                  try {
                    const currentSeq = Number(lossSeqReq.result || 0);
                    const nextLossSeq = currentSeq + 1;
                    metaStore.put(nextLossSeq, "lossSeq");
                    appendLoss(metaStore, { seq: nextLossSeq, reason: receipt.reason, count: 1 });

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
                          descendant.sendSnapshot = true;
                          outboxStore.put(descendant);
                        }
                        t.__result = { removed: 1, promotedBatchId, seq: nextLossSeq };
                      } catch (err) {
                        t.__error = err;
                        t.abort();
                      }
                    };
                  } catch (err) {
                    t.__error = err;
                    t.abort();
                  }
                };
              } else {
                t.__result = { removed: 0, promotedBatchId: null };
              }
            } catch (err) {
              t.__error = err;
              t.abort();
            }
          };
        } catch (err) {
          t.__error = err;
          t.abort();
        }
      };
    });
  }

  async function retireExpired(monoNow, wallNow) {
    const consts = getConsts();
    const codec = globalThis.SolstoneNativeBrowser;
    const mono = Number(monoNow !== undefined ? monoNow : (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now()));
    const wall = Number(wallNow !== undefined ? wallNow : (monoNow !== undefined ? monoNow : Date.now()));

    return DB.tx(["outbox", "producer", "meta"], "readwrite", (stores, t) => {
      const outboxStore = stores.outbox;
      const producerStore = stores.producer;
      const metaStore = stores.meta;

      const allReq = outboxStore.getAll();
      let retiredCount = 0;

      allReq.onsuccess = () => {
        try {
          const allItems = allReq.result || [];
          const expiredByContext = new Map();

          for (const item of allItems) {
            const storedFloor = Number(item.observedAgeMs || 0);
            const sample = ageSamples.get(item.batchId);
            let floor = storedFloor;

            if (sample && sample.floor >= storedFloor) {
              floor = Math.max(storedFloor, sample.floor + Math.max(0, mono - sample.mono));
            } else if (typeof item.ageSampleWallMs === "number") {
              floor = storedFloor + Math.max(0, wall - item.ageSampleWallMs);
            } else {
              floor = storedFloor;
            }

            floor = Math.ceil(Math.max(floor, 0, wall - item.queuedAtMs));

            let isExpired = false;
            let reason = "expired_unaccepted";

            if (codec.futureBeyondTolerance(item.queuedAtMs, wall, consts.FUTURE_SKEW_MS_MAX)) {
              isExpired = true;
              reason = "age_policy";
            } else if (codec.queuedPastOutboxAge(0, floor, consts.OUTBOX_AGE_MS_MAX)) {
              isExpired = true;
              reason = "expired_unaccepted";
            }

            if (isExpired) {
              retiredCount++;
              outboxStore.delete(item.batchId);
              ageSamples.delete(item.batchId);
              const key = contextKeyFor(item.inst, item.ctx);
              if (!expiredByContext.has(key)) expiredByContext.set(key, []);
              expiredByContext.get(key).push({ item, reason });
            } else {
              item.observedAgeMs = floor;
              item.ageSampleWallMs = wall;
              ageSamples.set(item.batchId, { mono, floor });
              outboxStore.put(item);
            }
          }

          if (retiredCount > 0) {
            let noticeReason = "expired_unaccepted";
            for (const list of expiredByContext.values()) {
              if (list.some((e) => e.reason === "age_policy")) {
                noticeReason = "age_policy";
                break;
              }
            }

            const lossSeqReq = metaStore.get("lossSeq");
            lossSeqReq.onsuccess = () => {
              try {
                const currentSeq = Number(lossSeqReq.result || 0);
                const nextLossSeq = currentSeq + 1;
                metaStore.put(nextLossSeq, "lossSeq");
                appendLoss(metaStore, { seq: nextLossSeq, reason: noticeReason, count: retiredCount });

                for (const [ctxKey, expiredList] of expiredByContext) {
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

                  // Wall-clock jumps can expire noncontiguous rows. Repair
                  // every surviving run after a removed predecessor.
                  const removed = new Set(expiredList.map(e => e.item.batchId));
                  const sample = expiredList[0].item;
                  let needsSnapshot = false;
                  for (const row of allItems.filter(x => x.inst === sample.inst && x.ctx === sample.ctx)
                    .sort((a, b) => a.seq - b.seq)) {
                    if (removed.has(row.batchId)) { needsSnapshot = true; continue; }
                    if (needsSnapshot) {
                      row.sendSnapshot = true;
                      outboxStore.put(row);
                      needsSnapshot = false;
                    }
                  }
                }
                t.__result = { count: retiredCount, seq: nextLossSeq, reason: noticeReason, disposition: noticeReason };
              } catch (err) {
                t.__error = err;
                t.abort();
              }
            };
          } else {
            t.__result = { count: 0, seq: 0, reason: "clean", disposition: "clean" };
          }
        } catch (err) {
          t.__error = err;
          t.abort();
        }
      };
    });
  }

  async function retireStaleGeneration(newGeneration, authorize) {
    return DB.tx(["outbox", "producer", "meta"], "readwrite", (stores, t) => {
      if (!guardTransaction(t, authorize)) return;
      const outboxStore = stores.outbox;
      const producerStore = stores.producer;
      const metaStore = stores.meta;

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
              ageSamples.delete(item.batchId);
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

          // In each affected context where items were retired, promote the oldest surviving delta to sendSnapshot = true
          if (retiredCount > 0) {
            for (const ctxKey of staleContexts) {
              const survivors = allItems
                .filter((x) => x.destinationGeneration === newGeneration && contextKeyFor(x.inst, x.ctx) === ctxKey)
                .sort((a, b) => (a.seq || 0) - (b.seq || 0));
              if (survivors.length > 0 && !survivors[0].sendSnapshot && survivors[0].records && survivors[0].records.some((r) => r.t === "delta")) {
                survivors[0].sendSnapshot = true;
                outboxStore.put(survivors[0]);
              }
            }
          }

          if (retiredCount > 0) {
            const lossSeqReq = metaStore.get("lossSeq");
            lossSeqReq.onsuccess = () => {
              try {
                const currentSeq = Number(lossSeqReq.result || 0);
                const nextLossSeq = currentSeq + 1;
                metaStore.put(nextLossSeq, "lossSeq");
                appendLoss(metaStore, { seq: nextLossSeq, reason: "stale_generation", count: retiredCount });
                t.__result = { count: retiredCount, seq: nextLossSeq, disposition: "stale-generation" };
              } catch (err) {
                t.__error = err;
                t.abort();
              }
            };
          } else {
            t.__result = { count: 0, seq: 0, disposition: "stale-generation" };
          }
        } catch (err) {
          t.__error = err;
          t.abort();
          return;
        }
      };
    });
  }

  async function dismissLoss(seq) {
    return DB.tx("meta", "readwrite", (metaStore, t) => {
      const noticeReq = metaStore.get("lossNotice");
      noticeReq.onsuccess = () => {
        try {
          const notice = noticeReq.result;
          if (notice && notice.seq === seq) {
            metaStore.delete("lossNotice");
            t.__result = true;
          } else {
            t.__result = false;
          }
        } catch (err) {
          t.__error = err;
          t.abort();
        }
      };
    });
  }

  async function getCapacityStatus() {
    const consts = getConsts();
    return DB.tx(["outbox", "producer"], "readonly", (stores, t) => {
      const outboxStore = stores.outbox;
      const producerStore = stores.producer;

      const allOutboxReq = outboxStore.getAll();
      const allProducersReq = producerStore.getAll();

      let allItems = null;
      let allCursors = null;
      let pending = 2;

      function checkDone() {
        if (--pending > 0) return;
        try {
          let outboxBytes = 0;
          for (const item of (allItems || [])) {
            outboxBytes += item.bytes || byteLengthOf(item);
          }
          let producerBytes = 0;
          for (const c of (allCursors || [])) {
            producerBytes += byteLengthOf(c);
          }
          const totalBytes = outboxBytes + producerBytes;
          t.__result = {
            totalBytes,
            pressure: { active: totalBytes >= consts.OUTBOX_BYTES_MAX },
          };
        } catch (err) {
          t.__error = err;
          t.abort();
        }
      }

      allOutboxReq.onsuccess = () => {
        allItems = allOutboxReq.result;
        checkDone();
      };
      allOutboxReq.onerror = () => {
        t.__error = allOutboxReq.error;
        t.abort();
      };

      allProducersReq.onsuccess = () => {
        allCursors = allProducersReq.result;
        checkDone();
      };
      allProducersReq.onerror = () => {
        t.__error = allProducersReq.error;
        t.abort();
      };
    });
  }

  globalThis.SolstoneNativeOutbox = {
    checkAuthorization,
    enqueueSkim,
    getHead,
    getAll,
    removeBatch,
    markSnapshotRequired,
    markAllSnapshotRequired,
    pruneCursor,
    applyRejectedReceipt,
    retireExpired,
    retireStaleGeneration,
    dismissLoss,
    getCapacityStatus,
    buildWireBatch,
    validateWireBatch,
    byteLengthOf,
  };
})();
