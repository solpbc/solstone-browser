// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc
//
// sw_orchestration.mjs — end-to-end test of the REAL assembled service worker
// against a live local journal, without depending on headless content-script
// auto-injection. It loads the extension, opens the options page (an extension
// context with chrome.runtime), and from there drives the worker with the exact
// messages content.js sends: setConfig -> siteGranted -> hello -> skim
// (snapshot) -> skim (delta) -> flushNow -> getState. Then it verifies the
// segment landed in the journal under the test stream. Args: <port>.
//
// Uses a throwaway stream name (swtest.browser) so it never touches real data.

const PORT = Number(process.argv[2] || 9311);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class CDP {
  constructor(url) {
    this.ws = new WebSocket(url); this.id = 0; this.pending = new Map();
    this.ready = new Promise((res, rej) => { this.ws.onopen = () => res(); this.ws.onerror = (e) => rej(new Error("ws " + (e && e.message))); });
    this.ws.onmessage = (e) => { const m = JSON.parse(typeof e.data === "string" ? e.data : e.data.toString()); if (m.id && this.pending.has(m.id)) { const { res, rej } = this.pending.get(m.id); this.pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); } };
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id; const msg = { id, method, params }; if (sessionId) msg.sessionId = sessionId;
    this.ws.send(JSON.stringify(msg));
    return new Promise((res, rej) => this.pending.set(id, { res, rej }));
  }
}

const ORCH = `(async () => {
  const send = (m) => new Promise(r => chrome.runtime.sendMessage(m, resp => { void chrome.runtime.lastError; r(resp); }));
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const meta = { url:'https://swtest.example/inbox', title:'Inbox (2)', adapter:'generic' }; const ctx='test-ctx-1';
  const out = {};
  out.setConfig = await send({cmd:'setConfig', hostname:'swtest', segmentSec:15, journalUrl:'http://localhost:5015'});
  out.siteGranted = await send({cmd:'siteGranted', host:'swtest.example'});
  await send({kind:'hello', ctx, site:'swtest.example', meta});
  await send({kind:'skim', ctx, site:'swtest.example', meta, blocks:[
    {id:'h:title', type:'heading', depth:1, text:'Inbox'},
    {id:'k:m1', type:'message', depth:2, text:'hello from the orchestration test'}
  ]});
  await sleep(300);
  await send({kind:'skim', ctx, site:'swtest.example', meta, blocks:[
    {id:'h:title', type:'heading', depth:1, text:'Inbox'},
    {id:'k:m1', type:'message', depth:2, text:'hello from the orchestration test'},
    {id:'k:m2', type:'message', depth:2, text:'a second message arrived'}
  ]});
  await sleep(300);
  out.flush = await send({cmd:'flushNow'});
  await sleep(1000);
  const st = await send({cmd:'getState'});
  out.stream = st.stream; out.registered = st.registered; out.segmentsUploaded = st.health && st.health.segmentsUploaded;
  out.lastStatus = st.health && st.health.lastStatus; out.lastError = st.health && st.health.lastError;
  out.siteErrors = st.siteErrors;
  return JSON.stringify(out, null, 2);
})()`;

async function main() {
  // find extension id via the SW target
  let id = null;
  for (let i = 0; i < 30 && !id; i++) {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json().catch(() => []);
    const sw = list.find((t) => t.type === "service_worker" && (t.url || "").startsWith("chrome-extension://"));
    if (sw) id = sw.url.split("/")[2];
    else await sleep(500);
  }
  if (!id) { console.log("no extension service worker found"); process.exit(1); }
  console.log("extension id:", id);

  const ver = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
  const browser = new CDP(ver.webSocketDebuggerUrl);
  await browser.ready;
  const { targetId } = await browser.send("Target.createTarget", { url: `chrome-extension://${id}/options.html` });
  const { sessionId } = await browser.send("Target.attachToTarget", { targetId, flatten: true });
  await browser.send("Runtime.enable", {}, sessionId);
  // wait for the options page document to be ready
  for (let i = 0; i < 20; i++) {
    const rs = await browser.send("Runtime.evaluate", { expression: "document.readyState", returnByValue: true }, sessionId);
    if (rs.result.value === "complete") break;
    await sleep(200);
  }
  const r = await browser.send("Runtime.evaluate", { expression: ORCH, awaitPromise: true, returnByValue: true }, sessionId);
  if (r.exceptionDetails) { console.log("ORCH EXC:", JSON.stringify(r.exceptionDetails).slice(0, 400)); process.exit(1); }
  console.log("ORCHESTRATION RESULT:\n" + r.result.value);
  process.exit(0);
}
main().catch((e) => { console.error("ERR", e.message); process.exit(1); });
