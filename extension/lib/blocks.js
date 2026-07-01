// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc
//
// blocks.js — the block model + pure helpers shared by the skim walker
// (content script) and the segment differ (service worker).
//
// Authored as a classic script that publishes `globalThis.SolstoneBlocks`, so
// it works three ways with no build step:
//   - injected first in a content script `js: [...]` array  -> global
//   - `importScripts('lib/blocks.js')` in the MV3 worker     -> global on `self`
//   - `await import(...)` from a node test                   -> sets globalThis
//
// A "block" is the unit of observed structure:
//   { id, type, depth, text, attrs }
// `type` is derived from ARIA role first, then semantic tag, then a heuristic.
// `text` is the visible text (innerText oracle, capped). `attrs` carries a few
// semantic attributes (aria-label, href host, level) — never raw HTML.

(function () {
  "use strict";

  const MAX_TEXT = 2000; // per-block visible-text cap
  const MAX_BLOCKS = 1500; // per-skim block cap (virtualized lists only render a window anyway)

  // ARIA role -> block type. Roles we care about for inbox/chat/tracker structure.
  const ROLE_TYPE = {
    heading: "heading",
    article: "message",
    listitem: "listitem",
    row: "row",
    gridcell: "cell",
    cell: "cell",
    rowheader: "cell",
    columnheader: "cell",
    list: "list",
    listbox: "list",
    grid: "list",
    table: "list",
    navigation: "region",
    main: "region",
    complementary: "region",
    region: "region",
    banner: "region",
    contentinfo: "region",
    dialog: "region",
    alert: "alert",
    status: "alert",
    link: "link",
    button: "button",
    textbox: "field",
    searchbox: "field",
  };

  // Semantic tag -> block type (fallback when no usable role).
  const TAG_TYPE = {
    H1: "heading",
    H2: "heading",
    H3: "heading",
    H4: "heading",
    H5: "heading",
    H6: "heading",
    LI: "listitem",
    TR: "row",
    TD: "cell",
    TH: "cell",
    ARTICLE: "message",
    SECTION: "region",
    NAV: "region",
    MAIN: "region",
    ASIDE: "region",
    HEADER: "region",
    FOOTER: "region",
    A: "link",
    BUTTON: "button",
    BLOCKQUOTE: "quote",
  };

  // Pure: derive a block type from role/tag/level strings. Unit-testable with
  // no DOM. `role` may be "" / null; `tag` is an uppercase tagName; `hasLevel`
  // marks an explicit aria-level (forces heading).
  function typeFromRoleTag(role, tag, hasLevel) {
    if (hasLevel) return "heading";
    const r = (role || "").trim().toLowerCase();
    if (r && Object.prototype.hasOwnProperty.call(ROLE_TYPE, r)) return ROLE_TYPE[r];
    const t = (tag || "").toUpperCase();
    if (Object.prototype.hasOwnProperty.call(TAG_TYPE, t)) return TAG_TYPE[t];
    return "text";
  }

  // Pure: small stable string hash (FNV-1a, 32-bit) -> base36. Used for content
  // identity when an app-stable id is unavailable.
  function hashStr(s) {
    let h = 0x811c9dc5;
    const str = String(s);
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(36);
  }

  // Zero-width / invisible chars that email preheaders + trackers stuff into the
  // DOM (soft-hyphen, CGJ, Mongolian vowel separator, ZWSP/ZWNJ/ZWJ, word-joiner,
  // BOM). Stripping them makes identical content hash identically (kills
  // preheader-junk churn) and collapses pure-invisible runs to empty.
  const INVISIBLE = /[­͏᠎​-‍⁠﻿]/g;

  // Pure: count of non-whitespace characters — used to drop junk (single-char,
  // separator-only, or invisible-only) blocks.
  function visibleLen(s) {
    return String(s || "").replace(/\s/g, "").length;
  }

  // Pure: strip invisibles, collapse whitespace, trim, cap length.
  function normalizeText(s) {
    if (s == null) return "";
    let out = String(s).replace(/[ \t ]+/g, " ").replace(/\s*\n\s*/g, "\n").replace(INVISIBLE, "").trim();
    if (out.length > MAX_TEXT) out = out.slice(0, MAX_TEXT) + "…";
    return out;
  }

  // Pure: derive a block id. Prefer an app-stable id from `stableId` (e.g. a
  // data-message-id the adapter pulled off the node); else hash type+depth+text.
  // Stable across virtualized-list node recycling when an app id exists.
  function blockId(stableId, type, depth, text) {
    if (stableId) return "k:" + String(stableId).slice(0, 80);
    return "h:" + hashStr(type + "|" + depth + "|" + text.slice(0, 200));
  }

  // DOM helper (browser-only): read the few semantic attrs worth keeping.
  function readAttrs(el) {
    const attrs = {};
    const label = el.getAttribute && (el.getAttribute("aria-label") || el.getAttribute("title"));
    if (label) attrs.label = normalizeText(label).slice(0, 300);
    const level = el.getAttribute && el.getAttribute("aria-level");
    if (level) attrs.level = level;
    if (el.tagName === "A" && el.getAttribute("href")) {
      // keep only the host, never the full URL (privacy: no query strings/tokens)
      try {
        const u = new URL(el.getAttribute("href"), "http://x.invalid");
        if (u.host && u.host !== "x.invalid") attrs.linkHost = u.host;
      } catch (_e) {
        /* ignore unparseable hrefs */
      }
    }
    return attrs;
  }

  globalThis.SolstoneBlocks = {
    MAX_TEXT,
    MAX_BLOCKS,
    ROLE_TYPE,
    TAG_TYPE,
    typeFromRoleTag,
    hashStr,
    normalizeText,
    visibleLen,
    blockId,
    readAttrs,
  };
})();
