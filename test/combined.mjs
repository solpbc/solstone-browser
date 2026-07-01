// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc
// Check: (1) did the content script inject (its indicator pill is in the page
// DOM, visible from the main world), (2) what has the worker buffered. Args: <port>.
const PORT = Number(process.argv[2] || 9301);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
class CDP {
  constructor(url) {
    this.ws = new WebSocket(url); this.id = 0; this.pending = new Map();
    this.ready = new Promise((res, rej) => { this.ws.onopen = () => res(); this.ws.onerror = (e) => rej(new Error("ws " + (e && e.message))); });
    this.ws.onmessage = (e) => { const m = JSON.parse(typeof e.data === "string" ? e.data : e.data.toString()); if (m.id && this.pending.has(m.id)) { const { res, rej } = this.pending.get(m.id); this.pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); } };
  }
  send(method, params = {}) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params })); return new Promise((res, rej) => this.pending.set(id, { res, rej })); }
}
async function evalOn(t, expr) {
  const c = new CDP(t.webSocketDebuggerUrl); await c.ready; await c.send("Runtime.enable");
  const r = await c.send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  return r.exceptionDetails ? "EXC: " + JSON.stringify(r.exceptionDetails).slice(0, 300) : r.result.value;
}
async function main() {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
  const page = list.find((t) => t.type === "page" && (t.url || "").includes("gmail"));
  const sw = list.find((t) => t.type === "service_worker");
  console.log("page target:", page ? page.url : "(none)", "| sw target:", sw ? "present" : "(dormant/none)");
  if (page) {
    const pageProbe = `JSON.stringify({
      readyState: document.readyState,
      indicator_present: !!document.getElementById('solstone-observer-indicator-host'),
      has_role_main: !!document.querySelector('[role="main"]'),
      body_children: document.body ? document.body.children.length : -1
    })`;
    console.log("PAGE:", await evalOn(page, pageProbe));
  }
  if (sw) {
    const swProbe = `(async () => { const r = await chrome.storage.local.get(['cfg','seg']); const cfg=r.cfg||{}, seg=r.seg||{}, sites=seg.sites||{};
      return JSON.stringify({ registered: !!cfg.key, stream: cfg.stream, hostname: cfg.hostname, segmentSec: cfg.segmentSec, paused: cfg.paused, health: cfg.health,
        seg_day: seg.day, seg_sites: Object.fromEntries(Object.entries(sites).map(([k,v])=>[k,{active:v.active,lines:(v.lines||[]).length}])) }); })()`;
    console.log("SW STORAGE:", await evalOn(sw, swProbe));
  }
  process.exit(0);
}
main().catch((e) => { console.error("ERR", e.message); process.exit(1); });
