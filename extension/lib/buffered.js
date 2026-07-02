// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

(function () {
  "use strict";

  function summarize(seg) {
    const byHost = new Map();
    for (const e of Object.values(seg ? seg.ctxs || {} : {})) {
      const host = e.host || "";
      if (!byHost.has(host)) byHost.set(host, { host, count: 0, texts: [] });
      const bucket = byHost.get(host);
      for (const line of e.lines || []) {
        bucket.count++;
        if (line.t === "segment_start") {
          for (const block of line.blocks || []) {
            if (block && block.text) bucket.texts.push(block.text);
          }
        } else if (line.t === "delta" && (line.op === "add" || line.op === "update") && line.block && line.block.text) {
          bucket.texts.push(line.block.text);
        }
      }
    }

    const perHost = Array.from(byHost.values()).map((h) => ({
      host: h.host,
      count: h.count,
      texts: h.texts.slice(-10),
    }));
    return { totalLines: perHost.reduce((n, h) => n + h.count, 0), perHost };
  }

  globalThis.SolstoneBuffered = { summarize };
})();
