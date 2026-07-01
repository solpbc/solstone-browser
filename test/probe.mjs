// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc
// Decisive probe: evaluate, in the live service worker, the exact match
// patterns addSite() builds — port-bearing (localhost:5015) vs portless
// (mail.google.com) — to confirm why a port-bearing observed site registers
// no content script. Args: <port>.
const PORT = Number(process.argv[2] || 9300);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class CDP {
  constructor(url) {
    this.ws = new WebSocket(url); this.id = 0; this.pending = new Map();
    this.ready = new Promise((res, rej) => { this.ws.onopen = () => res(); this.ws.onerror = (e) => rej(new Error("ws " + (e && e.message))); });
    this.ws.onmessage = (e) => { const m = JSON.parse(typeof e.data === "string" ? e.data : e.data.toString()); if (m.id && this.pending.has(m.id)) { const { res, rej } = this.pending.get(m.id); this.pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); } };
  }
  send(method, params = {}) { const id = ++this.id; this.ws.send(JSON.stringify({ id, method, params })); return new Promise((res, rej) => this.pending.set(id, { res, rej })); }
}

const expr = `(async () => {
  const out = {};
  try { await chrome.scripting.registerContentScripts([{id:'probe-port', matches:['*://localhost:5015/*'], js:['content.js'], runAt:'document_idle'}]); out.portPattern_localhost5015='ACCEPTED'; await chrome.scripting.unregisterContentScripts({ids:['probe-port']}); }
  catch(e){ out.portPattern_localhost5015='REJECTED: '+(e&&e.message); }
  try { await chrome.scripting.registerContentScripts([{id:'probe-gmail', matches:['*://mail.google.com/*'], js:['content.js'], runAt:'document_idle'}]); out.portless_mailgoogle='ACCEPTED'; await chrome.scripting.unregisterContentScripts({ids:['probe-gmail']}); }
  catch(e){ out.portless_mailgoogle='REJECTED: '+(e&&e.message); }
  try { out.perm_request_port_origin_format = (await chrome.permissions.contains({origins:['*://localhost:5015/*']})); }
  catch(e){ out.perm_request_port_origin_format='ERR: '+(e&&e.message); }
  out.registered_cs = (await chrome.scripting.getRegisteredContentScripts()).map(c=>({id:c.id,matches:c.matches}));
  return JSON.stringify(out, null, 2);
})()`;

async function main() {
  let sw = null;
  for (let i = 0; i < 30 && !sw; i++) {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
    sw = list.find((t) => t.type === "service_worker" && (t.url || "").startsWith("chrome-extension://"));
    if (!sw) await sleep(500);
  }
  if (!sw) { console.log("no extension service worker target"); process.exit(1); }
  console.log("attached SW:", sw.url);
  const c = new CDP(sw.webSocketDebuggerUrl);
  await c.ready;
  await c.send("Runtime.enable");
  const r = await c.send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) console.log("EXC:", JSON.stringify(r.exceptionDetails));
  console.log(r.result.value);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
