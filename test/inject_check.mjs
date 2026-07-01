// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc
// Reliable injection check using PAGE main-world eval only (no flaky
// extension-context eval): navigate to the fixture after the extension is warm,
// then confirm the content script ran by detecting its on-page indicator pill.
// Args: <port> <fixtureUrl>.
const PORT = Number(process.argv[2] || 9312);
const FIX = process.argv[3] || "http://localhost:8123/gmail.html";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
class CDP {
  constructor(url) {
    this.ws = new WebSocket(url); this.id = 0; this.pending = new Map();
    this.ready = new Promise((res, rej) => { this.ws.onopen = () => res(); this.ws.onerror = (e) => rej(new Error("ws " + (e && e.message))); });
    this.ws.onmessage = (e) => { const m = JSON.parse(typeof e.data === "string" ? e.data : e.data.toString()); if (m.id && this.pending.has(m.id)) { const { res, rej } = this.pending.get(m.id); this.pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); } };
  }
  send(method, params = {}) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params })); return new Promise((res, rej) => this.pending.set(id, { res, rej })); }
}
async function main() {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
  const page = list.find((t) => t.type === "page");
  if (!page) { console.log("no page target"); process.exit(1); }
  const c = new CDP(page.webSocketDebuggerUrl);
  await c.ready;
  await c.send("Page.enable");
  await c.send("Runtime.enable");
  await c.send("Page.navigate", { url: FIX });
  for (let i = 0; i < 60; i++) {
    const rs = await c.send("Runtime.evaluate", { expression: "document.readyState", returnByValue: true });
    if (rs.result.value === "complete") break;
    await sleep(250);
  }
  await sleep(4000); // give the content script its document_idle + boot + skim
  const probe = `JSON.stringify({ url: location.href, indicator_present: !!document.getElementById('solstone-observer-indicator-host'), has_role_main: !!document.querySelector('[role="main"]'), cs_loaded: document.documentElement.getAttribute('data-sol-cs-loaded'), cs_boot: document.documentElement.getAttribute('data-sol-cs-boot') })`;
  const r = await c.send("Runtime.evaluate", { expression: probe, returnByValue: true });
  console.log("PAGE:", r.result.value);
  process.exit(0);
}
main().catch((e) => { console.error("ERR", e.message); process.exit(1); });
