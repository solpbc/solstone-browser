// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

(function () {
  "use strict";

  const OUTBOX_CAP = 2000;

  function normalizeDropped(dropped) {
    return {
      segments: Math.max(0, Number((dropped && dropped.segments) || 0)),
      lines: Math.max(0, Number((dropped && dropped.lines) || 0)),
    };
  }

  function lineCount(entry) {
    let n = 0;
    for (const f of (entry && entry.files) || []) {
      n += String((f && f.text) || "")
        .split("\n")
        .filter(Boolean).length;
    }
    return n;
  }

  function outboxLineCount(outbox) {
    return (Array.isArray(outbox) ? outbox : []).reduce((n, entry) => n + lineCount(entry), 0);
  }

  function enqueue(outbox, entry, cap) {
    const limit = Math.max(0, Math.floor(Number(cap)));
    const next = (Array.isArray(outbox) ? outbox : []).slice();
    next.push(entry);
    const dropped = { segments: 0, lines: 0 };
    while (next.length > limit) {
      const evicted = next.shift();
      dropped.segments++;
      dropped.lines += lineCount(evicted);
    }
    return { outbox: next, dropped };
  }

  function head(outbox) {
    return Array.isArray(outbox) && outbox.length ? outbox[0] : null;
  }

  function removeHead(outbox) {
    return Array.isArray(outbox) ? outbox.slice(1) : [];
  }

  function clearDropped(state) {
    const outbox = Array.isArray(state && state.outbox) ? state.outbox : [];
    const dropped = normalizeDropped(state && state.dropped);
    if (outbox.length) return { outbox, dropped };
    return { outbox, dropped: { segments: 0, lines: 0 } };
  }

  function summary(input) {
    const segPendingLines = Math.max(0, Number((input && input.segPendingLines) || 0));
    const outboxLines = Math.max(0, Number((input && input.outboxLines) || 0));
    const dropped = normalizeDropped(input && input.dropped);
    return { waiting: segPendingLines + outboxLines, segPendingLines, outboxLines, dropped };
  }

  globalThis.SolstoneOutbox = {
    OUTBOX_CAP,
    enqueue,
    head,
    removeHead,
    lineCount,
    outboxLineCount,
    clearDropped,
    summary,
  };
})();
