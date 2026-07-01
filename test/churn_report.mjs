// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc
//
// churn_report.mjs — structure-only health/churn summary of the suze.browser
// stream for a given day. Prints per-segment delta composition + id scheme so
// we can tell real change from render churn. NEVER prints observed text.
// Run on the journal host: `node churn_report.mjs [YYYYMMDD] [stream] [root]`.

import fs from "node:fs";
import path from "node:path";

// LOCAL date — the journal stores segments by local day, not UTC.
const _now = new Date();
const day =
  process.argv[2] ||
  `${_now.getFullYear()}${String(_now.getMonth() + 1).padStart(2, "0")}${String(_now.getDate()).padStart(2, "0")}`;
const stream = process.argv[3] || "suze.browser";
const root = process.argv[4] || path.join(process.env.HOME, "journal", "chronicle");
const dir = path.join(root, day, stream);

if (!fs.existsSync(dir)) {
  console.log(`no ${stream} dir for ${day} at ${dir}`);
  process.exit(0);
}

const segs = fs
  .readdirSync(dir)
  .filter((d) => /^\d{6}_\d+$/.test(d))
  .sort();

console.log(`stream ${stream} · day ${day} · ${segs.length} segment(s)`);
console.log("seg            site                    lines  snapN  add  upd  rem   ids(k:/k::vol/h:)  cap?");

let totalDeltas = 0;
let capped = 0;
for (const seg of segs) {
  const segDir = path.join(dir, seg);
  const files = fs.readdirSync(segDir).filter((f) => f.startsWith("browser_") && f.endsWith(".jsonl"));
  for (const f of files) {
    let lines;
    try {
      lines = fs.readFileSync(path.join(segDir, f), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    } catch (_e) {
      continue;
    }
    const snap = lines[0] || {};
    const deltas = lines.slice(1);
    const ops = { add: 0, update: 0, remove: 0 };
    let kStable = 0, kVol = 0, hHash = 0;
    for (const d of deltas) {
      ops[d.op] = (ops[d.op] || 0) + 1;
      const id = (d.block && d.block.id) || "";
      if (id.startsWith("k::")) kVol++;
      else if (id.startsWith("k:")) kStable++;
      else if (id.startsWith("h:")) hHash++;
    }
    totalDeltas += deltas.length;
    const isCap = lines.length >= 4000;
    if (isCap) capped++;
    const site = (snap.site || f).slice(0, 22).padEnd(22);
    console.log(
      `${seg.padEnd(14)} ${site} ${String(lines.length).padStart(5)}  ${String(snap.n || 0).padStart(5)}  ` +
        `${String(ops.add).padStart(3)}  ${String(ops.update).padStart(3)}  ${String(ops.remove).padStart(3)}   ` +
        `${kStable}/${kVol}/${hHash}`.padEnd(16) + `  ${isCap ? "CAP!" : ""}`
    );
  }
}
console.log(`\ntotals: ${totalDeltas} deltas across ${segs.length} segments; ${capped} segment(s) hit the 4000 cap`);
console.log("read: pure add/remove + high k::vol = render-id churn (bad); updates + h: ids tracking real change = healthy");
