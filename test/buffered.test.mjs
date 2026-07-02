// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { test } from "node:test";
import assert from "node:assert/strict";

await import(new URL("../extension/lib/buffered.js", import.meta.url));
const B = globalThis.SolstoneBuffered;

test("summarize handles an empty segment", () => {
  assert.deepEqual(B.summarize(null), { totalLines: 0, perHost: [] });
});

test("summarize groups hosts, counts all lines, skips remove text, and caps to ten", () => {
  const lines = [
    { t: "segment_start", blocks: [{ text: "one" }, { text: "" }, { text: "two" }] },
    { t: "delta", op: "add", block: { text: "three" } },
    { t: "delta", op: "update", block: { text: "four" } },
    { t: "delta", op: "remove", block: { id: "gone" } },
    ...Array.from({ length: 9 }, (_, i) => ({ t: "delta", op: "add", block: { text: `later ${i + 1}` } })),
  ];
  const seg = {
    ctxs: {
      a: { host: "mail.google.com", lines },
      b: { host: "app.slack.com", lines: [{ t: "delta", op: "add", block: { text: "slack" } }] },
      c: { host: "mail.google.com", lines: [{ t: "delta", op: "update", block: { text: "merged" } }] },
    },
  };

  assert.deepEqual(B.summarize(seg), {
    totalLines: 15,
    perHost: [
      {
        host: "mail.google.com",
        count: 14,
        texts: ["later 1", "later 2", "later 3", "later 4", "later 5", "later 6", "later 7", "later 8", "later 9", "merged"],
      },
      { host: "app.slack.com", count: 1, texts: ["slack"] },
    ],
  });
});
