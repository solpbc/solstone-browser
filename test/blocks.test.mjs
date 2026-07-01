// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc
//
// Pure-logic tests for the block helpers (role/tag typing, hashing, id, text
// normalization). DOM accessors (readAttrs, the walk) are covered in real
// Chrome — see test/skim.cdp.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";

await import(new URL("../extension/lib/blocks.js", import.meta.url));
const B = globalThis.SolstoneBlocks;

test("typeFromRoleTag: ARIA role wins over tag", () => {
  assert.equal(B.typeFromRoleTag("heading", "DIV", false), "heading");
  assert.equal(B.typeFromRoleTag("listitem", "DIV", false), "listitem");
  assert.equal(B.typeFromRoleTag("article", "DIV", false), "message");
  assert.equal(B.typeFromRoleTag("row", "DIV", false), "row");
});

test("typeFromRoleTag: falls back to semantic tag", () => {
  assert.equal(B.typeFromRoleTag("", "H2", false), "heading");
  assert.equal(B.typeFromRoleTag(null, "LI", false), "listitem");
  assert.equal(B.typeFromRoleTag("", "A", false), "link");
  assert.equal(B.typeFromRoleTag("", "TR", false), "row");
});

test("typeFromRoleTag: aria-level forces heading", () => {
  assert.equal(B.typeFromRoleTag("", "DIV", true), "heading");
  assert.equal(B.typeFromRoleTag("listitem", "DIV", true), "heading");
});

test("typeFromRoleTag: unknown => text", () => {
  assert.equal(B.typeFromRoleTag("", "DIV", false), "text");
  assert.equal(B.typeFromRoleTag("presentation", "SPAN", false), "text");
});

test("hashStr is deterministic and collision-light", () => {
  assert.equal(B.hashStr("hello"), B.hashStr("hello"));
  assert.notEqual(B.hashStr("hello"), B.hashStr("hellp"));
  assert.match(B.hashStr("x"), /^[0-9a-z]+$/);
});

test("normalizeText collapses whitespace and trims", () => {
  assert.equal(B.normalizeText("  a   b\t c  "), "a b c");
  assert.equal(B.normalizeText("line1\n\n  line2"), "line1\nline2");
  assert.equal(B.normalizeText(null), "");
});

test("normalizeText caps at MAX_TEXT", () => {
  const long = "x".repeat(B.MAX_TEXT + 500);
  const out = B.normalizeText(long);
  assert.ok(out.length <= B.MAX_TEXT + 1); // +1 for the ellipsis
  assert.ok(out.endsWith("…"));
});

test("normalizeText strips invisible/zero-width chars (preheader junk)", () => {
  assert.equal(B.normalizeText("a​b"), "ab"); // zero-width space
  assert.equal(B.normalizeText("hi⁠ there"), "hi there"); // word-joiner, space kept
  assert.equal(B.normalizeText("­‌͏᠎"), ""); // pure invisible -> empty
  assert.equal(B.normalizeText("͏ ­͏ ­͏"), ""); // real Gmail preheader padding -> empty
});

test("visibleLen counts non-whitespace only", () => {
  assert.equal(B.visibleLen("  -  "), 1);
  assert.equal(B.visibleLen("hi"), 2);
  assert.equal(B.visibleLen("​ ­"), 2); // invisibles are non-whitespace pre-normalize
  assert.equal(B.visibleLen(B.normalizeText("​ ­")), 0); // but normalize strips them
});

test("blockId: app-stable id path", () => {
  const id = B.blockId("msg-123", "message", 2, "hi");
  assert.equal(id, "k:msg-123");
});

test("blockId: hash path is stable for same inputs", () => {
  const a = B.blockId(null, "text", 3, "same text");
  const b = B.blockId(null, "text", 3, "same text");
  const c = B.blockId(null, "text", 3, "different");
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^h:/);
});

test("blockId truncates very long stable ids", () => {
  const id = B.blockId("z".repeat(200), "x", 0, "");
  assert.ok(id.length <= 82); // "k:" + 80
});
