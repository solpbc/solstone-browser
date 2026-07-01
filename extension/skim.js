// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc
//
// skim.js — the visibility-aware semantic DOM "skim" walker. Given an app root
// and an adapter, it produces a compact, ordered list of blocks describing the
// *visible* text + rough layout — no screenshots, no HTML, no hidden content.
//
// Two block kinds come out of one walk:
//   - boundary blocks: adapter-recognized structural units (a Gmail row, a
//     Slack message). They carry the app-stable id + aria-label so deltas key
//     to the right message across virtualized-list node recycling.
//   - content blocks: any visible element that *directly* contains text. One
//     block per text-bearing element, typed by ARIA role / semantic tag, at
//     its depth. Content keyed under its nearest boundary id when there is one.
//
// Classic content script -> publishes `globalThis.SolstoneSkim`. Depends on
// `globalThis.SolstoneBlocks` (loaded first) and `globalThis.SolstoneAdapters`.

(function () {
  "use strict";

  const B = globalThis.SolstoneBlocks;

  // Real-browser visibility oracle. Prefers checkVisibility (Baseline 2024),
  // falls back to layout heuristics for older engines / test stubs.
  function isVisible(el) {
    if (!el || el.nodeType !== 1) return false;
    if (typeof el.checkVisibility === "function") {
      return el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
    }
    // Fallback: rendered box present.
    if (el.getClientRects && el.getClientRects().length === 0) return false;
    if ("offsetParent" in el && el.offsetParent === null) {
      // offsetParent is null for position:fixed too — accept those via rects.
      if (el.getClientRects && el.getClientRects().length > 0) return true;
      return false;
    }
    return true;
  }

  // The visible text contributed *directly* by an element (its immediate text
  // node children), normalized. This is what makes one element = one content
  // block, with no ancestor/descendant text duplication.
  function directText(el) {
    let s = "";
    for (const node of el.childNodes) {
      if (node.nodeType === 3) s += node.nodeValue; // text node
    }
    return B.normalizeText(s);
  }

  function matchesAny(el, selector) {
    if (!selector || !el.matches) return false;
    try {
      return el.matches(selector);
    } catch (_e) {
      return false;
    }
  }

  // Walk an element subtree, emitting blocks into `out`. `boundaryId` is the
  // nearest adapter boundary's stable id (or null), threaded down so content
  // keys to its message. `depth` is the structural depth from the root.
  function walk(el, adapter, out, depth, boundaryId) {
    if (out.length >= B.MAX_BLOCKS) return;
    if (!isVisible(el)) return; // hidden subtree -> skip entirely
    if (matchesAny(el, adapter.skip)) return; // app chrome we never observe

    const tag = el.tagName;
    if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT" || tag === "SVG") return;

    let nextBoundaryId = boundaryId;

    // Boundary block: adapter-recognized structural unit. Only emit it if it
    // carries an app-stable id OR a label — a bare boundary with neither (real
    // Gmail rows, whose aria-label lives elsewhere) is dead weight, so we skip
    // it and let its content blocks stand on their own.
    if (matchesAny(el, adapter.boundary)) {
      const A = globalThis.SolstoneAdapters;
      const sid = A.stableIdFor(el, adapter);
      const attrs = B.readAttrs(el);
      const label = attrs.label || "";
      if (sid || label) {
        const role = el.getAttribute && el.getAttribute("role");
        const type = B.typeFromRoleTag(role, tag, false);
        const utype = type === "text" ? "unit" : type;
        const id = B.blockId(sid, utype, depth, label);
        const block = { id, type: utype, depth, text: label };
        if (Object.keys(attrs).length) block.attrs = attrs;
        out.push(block);
      }
      if (sid) nextBoundaryId = sid;
    }

    // Content block: this element directly contains visible text. Drop junk —
    // single-char / separator / invisible-only runs carry no meaning.
    const text = directText(el);
    if (text && B.visibleLen(text) > 1) {
      const role = el.getAttribute && el.getAttribute("role");
      const hasLevel = !!(el.getAttribute && el.getAttribute("aria-level"));
      const type = B.typeFromRoleTag(role, tag, hasLevel);
      const attrs = B.readAttrs(el);
      const keyed = boundaryId ? boundaryId + ":" + B.hashStr(text) : null;
      const id = B.blockId(keyed, type, depth, text);
      const block = { id, type, depth, text };
      if (Object.keys(attrs).length) block.attrs = attrs;
      out.push(block);
    }

    // Recurse: open shadow root first (its content is "inside" this element),
    // then light-DOM children.
    if (el.shadowRoot) {
      for (const child of el.shadowRoot.children) {
        walk(child, adapter, out, depth + 1, nextBoundaryId);
      }
    }
    for (const child of el.children) {
      walk(child, adapter, out, depth + 1, nextBoundaryId);
    }
  }

  // Public: skim a root element with an adapter. Returns an array of blocks.
  function skim(root, adapter) {
    const out = [];
    if (!root) return out;
    walk(root, adapter, out, 0, null);
    return out;
  }

  globalThis.SolstoneSkim = { skim, isVisible, directText };
})();
