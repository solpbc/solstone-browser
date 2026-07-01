// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc
//
// relay_roundtrip.mjs — exercises the exact journal contract the extension's
// service worker uses, end-to-end, against a real local journal: register a
// browser observer, build a representative segment with lib/segment.js
// (segment-start snapshot + accumulated deltas), upload it via the same
// multipart /app/observer/ingest call background.js makes, then query the
// journal to confirm it landed under its own `<host>.browser` stream.
//
// Must run ON the journal machine (the register endpoint requires localhost) —
// the same place the extension runs. Run: `node test/relay_roundtrip.mjs`
// on the machine running the journal. Expects ./segment.js alongside, or imports
// the repo copy. Uses a dedicated `relaytest.browser` stream so the synthetic
// segment never lands in your real browser stream (override with HOSTNAME_OVERRIDE).

import assert from "node:assert/strict";

const JOURNAL = (process.env.JOURNAL_URL || "http://localhost:5015").replace(/\/+$/, "");
const HOSTNAME = process.env.HOSTNAME_OVERRIDE || "relaytest";

// load lib/segment.js (sets globalThis.SolstoneSegment)
let segUrl;
try {
  segUrl = new URL("./segment.js", import.meta.url);
  await import(segUrl);
  if (!globalThis.SolstoneSegment) throw new Error("not loaded");
} catch (_e) {
  await import(new URL("../extension/lib/segment.js", import.meta.url));
}
const S = globalThis.SolstoneSegment;

const blk = (id, text, type = "text", depth = 1, attrs) => ({ id, type, depth, text, ...(attrs ? { attrs } : {}) });

async function register() {
  const r = await fetch(JOURNAL + "/app/observer/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ platform: "browser", hostname: HOSTNAME, stream_type: "browser", version: "0.0.1", label: "relay round-trip check" }),
  });
  assert.ok(r.ok, "register HTTP " + r.status);
  return r.json();
}

async function upload(key, day, segment, meta, files) {
  const form = new FormData();
  form.append("day", day);
  form.append("segment", segment);
  form.append("meta", JSON.stringify(meta));
  for (const f of files) form.append("files", new Blob([f.text], { type: "application/octet-stream" }), f.name);
  const r = await fetch(JOURNAL + "/app/observer/ingest", {
    method: "POST",
    headers: { "X-Solstone-Observer": key, Authorization: "Bearer " + key },
    body: form,
  });
  const body = await r.json().catch(() => null);
  return { ok: r.ok, status: r.status, body };
}

async function getSegments(key, day) {
  const r = await fetch(JOURNAL + `/app/observer/ingest/segments/${day}`, {
    headers: { "X-Solstone-Observer": key, Authorization: "Bearer " + key },
  });
  return r.ok ? r.json() : null;
}

function buildGmailFile(now) {
  // segment-start snapshot of the inbox, then a couple of deltas (a new mail
  // arrives, the unread heading updates) — what the worker accumulates.
  const meta = { url: "https://mail.google.com/mail/u/0/#inbox", title: "Inbox (2)", adapter: "gmail" };
  const snap = [
    blk("h:inbox", "Inbox", "heading", 1, { level: "1" }),
    blk("k:msg-aaa111", "From Dana Reeve, subject Q3 board deck, 9:14 AM, unread", "row", 3, { label: "From Dana Reeve, subject Q3 board deck" }),
    blk("k:msg-aaa111:txt", "Q3 board deck — here is the latest draft", "text", 5),
  ];
  const lines = [S.snapshotLine("mail.google.com", meta, snap, now, 0)];
  // +12s: a new email arrives
  const d1 = S.diffBlocks(snap, [
    ...snap,
    blk("k:msg-ccc333", "From Priya Nadkarni, subject lunch?, 9:26 AM, unread", "row", 3, { label: "From Priya Nadkarni, subject lunch?" }),
    blk("k:msg-ccc333:txt", "are you free for lunch thursday?", "text", 5),
  ]);
  lines.push(...S.deltaLines("mail.google.com", d1, now + 12000, 12));
  // +20s: unread count heading updates
  const d2 = S.diffBlocks([blk("h:inbox", "Inbox", "heading", 1, { level: "1" })], [blk("h:inbox", "Inbox", "heading", 1, { level: "1" })]);
  void d2;
  lines.push(...S.deltaLines("mail.google.com", { added: [], updated: [blk("h:inbox", "Inbox (3)", "heading", 1, { level: "1" })], removed: [] }, now + 20000, 20));
  return { name: S.fileForSite("mail.google.com"), text: S.serializeJsonl(lines) };
}

function buildSlackFile(now) {
  const meta = { url: "https://app.slack.com/client/T1/C1", title: "#general", adapter: "slack" };
  const snap = [
    blk("k:1719600000.001", "Priya Nadkarni", "unit", 2, { label: "" }),
    blk("k:1719600000.001:txt", "can we push the demo to 3pm? I have a conflict at 2", "text", 4),
  ];
  const lines = [S.snapshotLine("app.slack.com", meta, snap, now, 0)];
  const d1 = S.diffBlocks(snap, [
    ...snap,
    blk("k:1719600120.002", "Marcus Webb", "unit", 2, { label: "" }),
    blk("k:1719600120.002:txt", "3pm works for me — moving the invite", "text", 4),
  ]);
  lines.push(...S.deltaLines("app.slack.com", d1, now + 30000, 30));
  return { name: S.fileForSite("app.slack.com"), text: S.serializeJsonl(lines) };
}

async function main() {
  console.log("journal:", JOURNAL, "| hostname:", HOSTNAME);
  const reg = await register();
  console.log("registered:", reg.name, "(" + reg.prefix + "…) proto v" + reg.protocol_version);
  assert.equal(reg.name, HOSTNAME + ".browser", "stream identity should be <host>.browser");

  const now = Date.now();
  const startMs = now - 120000; // a 2-minute-old segment
  const day = S.dayKey(startMs);
  const segment = S.segmentKey(startMs, 120);
  const files = [buildGmailFile(startMs), buildSlackFile(startMs)];
  console.log("uploading segment", day + "/" + segment, "files:", files.map((f) => f.name).join(", "));
  for (const f of files) console.log("   ", f.name, "—", f.text.trim().split("\n").length, "lines,", f.text.length, "bytes");

  const meta = { host: HOSTNAME, platform: "browser", stream: reg.name, observer: reg.name };
  const res = await upload(reg.key, day, segment, meta, files);
  console.log("ingest ->", res.status, JSON.stringify(res.body));
  assert.ok(res.ok, "ingest failed");
  assert.notEqual(res.body && res.body.status, "failed", "ingest reported contract failure: " + JSON.stringify(res.body));

  const segs = await getSegments(reg.key, day);
  assert.ok(Array.isArray(segs), "segments query failed");
  const found = segs.find((s) => (s.segment || s.key || s) === segment || JSON.stringify(s).includes(segment));
  console.log("segments query: our observer has", segs.length, "segment(s) today; ours present:", !!found);
  assert.ok(found, "uploaded segment not found in journal segments listing");

  // Emit a marker for the outer disk check.
  console.log(`DISK_CHECK ${day} ${reg.name} ${segment}`);
  console.log("\nRELAY ROUND-TRIP OK");
}

main().catch((e) => {
  console.error("RELAY ROUND-TRIP FAILED:", e.message);
  process.exit(1);
});
