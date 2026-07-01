// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc
//
// skim.cdp.mjs — the DOM-dependent half of the test story. The skim walk leans
// on real `innerText`, `checkVisibility()`, and layout — which jsdom/linkedom
// don't implement — so this drives a real headless Chrome over CDP (zero deps:
// node's global WebSocket + fetch + spawn). It loads the trimmed Gmail/Slack/
// article fixtures, injects blocks.js + adapters.js + skim.js, runs the skim,
// and asserts the visible content came through while hidden/skipped content did
// not. Run: `npm run smoke`.

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const PORT = 9333;
const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const extDir = here("../extension/");
const src = (f) => readFileSync(join(extDir, f), "utf8");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class CDP {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.id = 0;
    this.pending = new Map();
    this.ready = new Promise((res, rej) => {
      this.ws.onopen = () => res();
      this.ws.onerror = (e) => rej(new Error("ws error " + (e && e.message)));
    });
    this.ws.onmessage = (e) => {
      const m = JSON.parse(typeof e.data === "string" ? e.data : e.data.toString());
      if (m.id && this.pending.has(m.id)) {
        const { res, rej } = this.pending.get(m.id);
        this.pending.delete(m.id);
        m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
      }
    };
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    const msg = { id, method, params };
    if (sessionId) msg.sessionId = sessionId;
    this.ws.send(JSON.stringify(msg));
    return new Promise((res, rej) => this.pending.set(id, { res, rej }));
  }
  close() {
    try {
      this.ws.close();
    } catch (_e) {
      /* ignore */
    }
  }
}

async function waitVersion() {
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (r.ok) return r.json();
    } catch (_e) {
      /* not up yet */
    }
    await sleep(100);
  }
  throw new Error("headless chrome did not come up");
}

async function evaluate(cdp, sid, expression, returnByValue) {
  const r = await cdp.send("Runtime.evaluate", { expression, returnByValue, awaitPromise: true }, sid);
  if (r.exceptionDetails) throw new Error("eval failed: " + JSON.stringify(r.exceptionDetails));
  return returnByValue ? r.result.value : undefined;
}

async function navigate(cdp, sid, url) {
  await cdp.send("Page.navigate", { url }, sid);
  for (let i = 0; i < 100; i++) {
    const rs = await evaluate(cdp, sid, "document.readyState", true);
    if (rs === "complete") return;
    await sleep(50);
  }
}

const driver = (adapterName) => `(() => {
  const A = window.SolstoneAdapters, S = window.SolstoneSkim;
  const adapter = A[${JSON.stringify(adapterName)}] || A.GENERIC;
  const root = A.pickRoot(adapter, document);
  const blocks = S.skim(root, adapter);
  return { rootTag: root && root.tagName, n: blocks.length, blocks };
})()`;

async function skimFixture(cdp, sid, fixture, adapterName) {
  await navigate(cdp, sid, pathToFileURL(here("fixtures/" + fixture)).href);
  for (const f of ["lib/blocks.js", "adapters.js", "skim.js"]) await evaluate(cdp, sid, src(f), false);
  return evaluate(cdp, sid, driver(adapterName), true);
}

function allText(res) {
  return res.blocks.map((b) => b.text).join(" || ");
}
function hasBlock(res, pred) {
  return res.blocks.some(pred);
}

async function main() {
  const profile = mkdtempSync(join(tmpdir(), "sb-chrome-"));
  const chrome = spawn(
    "google-chrome",
    [
      "--headless=new",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-gpu",
      "--disable-extensions",
      "--remote-allow-origins=*",
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${profile}`,
      "about:blank",
    ],
    { stdio: "ignore" }
  );
  let cdp;
  let failures = 0;
  const check = (name, fn) => {
    try {
      fn();
      console.log("  ✔ " + name);
    } catch (e) {
      failures++;
      console.log("  x FAIL " + name + " — " + e.message);
    }
  };
  try {
    const v = await waitVersion();
    cdp = new CDP(v.webSocketDebuggerUrl);
    await cdp.ready;
    const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
    await cdp.send("Page.enable", {}, sessionId);
    await cdp.send("Runtime.enable", {}, sessionId);

    console.log("gmail fixture (GMAIL adapter):");
    const gmail = await skimFixture(cdp, sessionId, "gmail.html", "GMAIL");
    console.log("    blocks:", gmail.n, "| root:", gmail.rootTag);
    check("visible sender + subject present", () => {
      assert.ok(allText(gmail).includes("Dana Reeve"));
      assert.ok(allText(gmail).includes("Q3 board deck"));
      assert.ok(allText(gmail).includes("[solpbc/vit] PR #42 review requested"));
    });
    check("hidden row NOT observed (display:none)", () => assert.ok(!allText(gmail).includes("SECRET-HIDDEN")));
    check("nav region skipped (no Sent link text as nav)", () =>
      assert.ok(!hasBlock(gmail, (b) => b.type === "link" && b.text === "Sent")));
    check("h2 aria-level=1 typed as heading", () => assert.ok(hasBlock(gmail, (b) => b.type === "heading" && b.text === "Inbox")));
    check("message boundary carries app-stable id", () => assert.ok(hasBlock(gmail, (b) => b.id === "k:msg-aaa111")));

    console.log("slack fixture (SLACK adapter):");
    const slack = await skimFixture(cdp, sessionId, "slack.html", "SLACK");
    console.log("    blocks:", slack.n, "| root:", slack.rootTag);
    check("visible messages present", () => {
      assert.ok(allText(slack).includes("Priya Nadkarni"));
      assert.ok(allText(slack).includes("can we push the demo to 3pm"));
    });
    check("hidden message NOT observed (visibility:hidden)", () => assert.ok(!allText(slack).includes("SECRET-HIDDEN-SLACK")));
    check("sidebar skipped (no '# random')", () => assert.ok(!allText(slack).includes("# random")));
    check("message boundary carries app-stable id", () => assert.ok(hasBlock(slack, (b) => b.id === "k:1719600000.001")));

    console.log("article fixture (GENERIC adapter):");
    const art = await skimFixture(cdp, sessionId, "article.html", "GENERIC");
    console.log("    blocks:", art.n, "| root:", art.rootTag);
    check("h1 typed as heading", () => assert.ok(hasBlock(art, (b) => b.type === "heading" && b.text === "On structural trust")));
    check("paragraph text present", () => assert.ok(allText(art).includes("most invasive capture is also the most legally bound")));
    check("link carries host attr, not full url", () =>
      assert.ok(hasBlock(art, (b) => b.type === "link" && b.attrs && b.attrs.linkHost === "solpbc.org")));
    check("nav skipped (no 'Home' link)", () => assert.ok(!hasBlock(art, (b) => b.type === "link" && b.text === "Home")));

    console.log("\nsample gmail blocks:");
    for (const b of gmail.blocks.slice(0, 8)) console.log("   ", JSON.stringify(b));
  } finally {
    if (cdp) cdp.close();
    chrome.kill("SIGKILL");
    try {
      rmSync(profile, { recursive: true, force: true });
    } catch (_e) {
      /* ignore */
    }
  }
  console.log(failures ? `\n${failures} check(s) failed` : "\nall skim checks passed");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
