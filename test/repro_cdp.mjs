// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc
//
// repro_cdp.mjs — attach to a running headless Chrome over CDP, tap the
// extension's service-worker console + the observed page's console, then dump
// the worker's chrome.storage state. This is how you read extension logs from
// the CLI: launch Chrome with --remote-debugging-port, then speak CDP to the
// service_worker / page targets. Args: <port> <pageUrlSubstr> <waitSec>.

const PORT = Number(process.argv[2] || 9300);
const PAGE_MATCH = process.argv[3] || "gmail";
const WAIT_SEC = Number(process.argv[4] || 75);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class CDP {
  constructor(url, tag) {
    this.tag = tag;
    this.ws = new WebSocket(url);
    this.id = 0;
    this.pending = new Map();
    this.ready = new Promise((res, rej) => {
      this.ws.onopen = () => res();
      this.ws.onerror = (e) => rej(new Error("ws " + (e && e.message)));
    });
    this.ws.onmessage = (e) => {
      const m = JSON.parse(typeof e.data === "string" ? e.data : e.data.toString());
      if (m.id && this.pending.has(m.id)) {
        const { res, rej } = this.pending.get(m.id);
        this.pending.delete(m.id);
        m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
      } else if (m.method === "Runtime.consoleAPICalled") {
        const args = (m.params.args || []).map((a) => (a.value !== undefined ? a.value : a.description)).join(" ");
        console.log(`[${this.tag}:${m.params.type}] ${args}`);
      } else if (m.method === "Runtime.exceptionThrown") {
        const d = m.params.exceptionDetails;
        console.log(`[${this.tag}:EXCEPTION] ${d.exception ? d.exception.description : d.text}`);
      }
    };
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res, rej) => this.pending.set(id, { res, rej }));
  }
}

async function targets() {
  const r = await fetch(`http://127.0.0.1:${PORT}/json`);
  return r.json();
}

async function findTarget(pred, timeoutMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const list = await targets().catch(() => []);
    const hit = list.find(pred);
    if (hit) return hit;
    await sleep(300);
  }
  return null;
}

async function main() {
  const sw = await findTarget((t) => t.type === "service_worker", 15000);
  if (!sw) {
    console.log("NO service_worker target found — extension SW not running");
  } else {
    console.log("service worker:", sw.url);
  }
  const page = await findTarget((t) => t.type === "page" && (t.url || "").includes(PAGE_MATCH), 15000);
  console.log("page:", page ? page.url : "(none)");

  const swc = sw ? new CDP(sw.webSocketDebuggerUrl, "SW") : null;
  const pgc = page ? new CDP(page.webSocketDebuggerUrl, "PAGE") : null;
  if (swc) {
    await swc.ready;
    await swc.send("Runtime.enable");
  }
  if (pgc) {
    await pgc.ready;
    await pgc.send("Runtime.enable");
  }

  console.log(`\n--- capturing console for ${WAIT_SEC}s (segment rotation should fire) ---`);
  await sleep(WAIT_SEC * 1000);

  if (swc) {
    console.log("\n--- service-worker chrome.storage state ---");
    const expr = `(async () => {
      const r = await chrome.storage.local.get(['cfg','seg']);
      const cfg = r.cfg || {}; const seg = r.seg || {};
      const sites = seg.sites || {};
      return JSON.stringify({
        registered: !!cfg.key, stream: cfg.stream, hostname: cfg.hostname,
        journalUrl: cfg.journalUrl, segmentSec: cfg.segmentSec, paused: cfg.paused,
        allowlist: cfg.allowlist, health: cfg.health,
        seg_day: seg.day,
        seg_sites: Object.fromEntries(Object.entries(sites).map(([k,v]) => [k, {active: v.active, lines: (v.lines||[]).length, snapshotWritten: v.snapshotWritten}]))
      }, null, 2);
    })()`;
    try {
      const res = await swc.send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
      console.log(res.result.value);
    } catch (e) {
      console.log("storage dump failed:", e.message);
    }
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
