// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc
//
// e2e.mjs — the agentic integration harness. It proves the live MV3 messaging
// path the unit tests can't reach:
//
//     dynamically-registered content script  ──▶  service worker  ──▶  relay POST
//
// end-to-end under browser automation with NO physical display. This is the leg
// the prototype flagged as un-verifiable headlessly; it is verifiable — the fix
// is two binary choices (documented in AGENTS.md § agentic e2e):
//
//   1. Playwright's `channel:'chromium'` — selects the real new-headless build,
//      not the extension-blind `chromium-headless-shell`. This build injects MV3
//      content scripts (static AND dynamic) with no display and no Xvfb.
//   2. Load the extension via `--load-extension` (Chrome-for-Testing / the
//      Playwright chromium build honor it; *branded* Chrome dropped it in 137).
//
// Faithfulness note on permissions: the shipped extension gains host access to an
// observed site through the per-site optional_host_permissions grant, which needs
// a real user gesture and CANNOT be driven under headless automation (verified —
// see the non-gating probe at the end; the live opt-in UX is what GUIDED.md
// covers). So this harness pre-grants the fixture origin by adding it to a THROW-
// AWAY copy of the manifest's host_permissions. That isolates the question this
// harness answers — "does our DYNAMIC chrome.scripting.registerContentScripts
// registration inject and drive the full relay under new-headless?" — from the
// orthogonal permission-UI question. The content script is still registered
// dynamically at runtime (the exact call registerSite() makes), never statically.
//
// Run:  npm run e2e         (needs one-time `npx playwright install chromium`)

import { createServer } from "node:http";
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const EXT_SRC = fileURLToPath(new URL("../extension", import.meta.url));
const GRANT_PATTERN = "*://127.0.0.1/*"; // what registerSite() registers + the shipped opt-in requests
// Mirrors background.js CONTENT_SCRIPT_FILES + registerSite()'s registration options.
const CONTENT_SCRIPT_FILES = ["lib/blocks.js", "lib/hosts.js", "adapters.js", "skim.js", "indicator.js", "content.js"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`);
  return cond;
};

// ---- the stub journal: records every /app/observer/ingest POST (parsed as real
// multipart via undici's global Response.formData — no deps) so we can assert the
// batched segment POST the worker makes. Also serves a skimmable /observe-test page.
const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>solstone browser-observer e2e page</title></head>
<body>
  <header><nav aria-label="Primary"><a href="/home">Home</a></nav></header>
  <main>
    <h1>On structural trust</h1>
    <p>The most invasive observer is also the most legally bound — that is the whole test.</p>
    <ul aria-label="messages">
      <li role="row" data-message-id="e2e-1">From Test Sender, subject e2e message one, 9:14 AM</li>
      <li role="row" data-message-id="e2e-2">From Another Sender, subject e2e message two, 9:26 AM</li>
    </ul>
    <p hidden>SECRET-HIDDEN should never be observed</p>
    <a href="https://solpbc.org/x?tok=SECRET-QUERY">a labelled link</a>
  </main>
</body></html>`;

function startStub() {
  const received = { registers: [], ingests: [], events: [] };
  let keySeq = 0;
  const json = (res, code, obj) => {
    res.writeHead(code, { "content-type": "application/json", "access-control-allow-origin": "*" });
    res.end(JSON.stringify(obj));
  };
  const readBuf = async (req) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    return Buffer.concat(chunks);
  };
  const server = createServer(async (req, res) => {
    const path = new URL(req.url, `http://${req.headers.host}`).pathname;
    try {
      if (req.method === "GET" && path === "/observe-test") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        return res.end(PAGE);
      }
      // Browsers auto-request /favicon.ico; answer it so it isn't a stray 404 in
      // the observed page's console (that noise is the stub's, not the extension's).
      if (req.method === "GET" && path === "/favicon.ico") { res.writeHead(204); return res.end(); }
      if (req.method === "GET" && path === "/__/received") return json(res, 200, received);
      if (req.method === "POST" && path === "/app/observer/register") {
        let desc = {};
        try { desc = JSON.parse((await readBuf(req)).toString("utf8")); } catch (_e) {}
        const name = `${desc.hostname || "local"}.browser`;
        const key = `e2ekey-${++keySeq}-${desc.hostname || "local"}`;
        received.registers.push({ at: Date.now(), descriptor: desc, name, key });
        return json(res, 200, { key, name, prefix: key.slice(0, 8), protocol_version: 1 });
      }
      if (req.method === "POST" && path === "/app/observer/ingest") {
        const buf = await readBuf(req);
        const auth = req.headers["authorization"] || req.headers["x-solstone-observer"] || "";
        const fd = await new Response(buf, { headers: { "content-type": req.headers["content-type"] } }).formData();
        const files = [];
        for (const f of fd.getAll("files")) {
          const text = typeof f === "string" ? f : await f.text();
          files.push({ name: (f && f.name) || "?", bytes: Buffer.byteLength(text), text });
        }
        let meta = null;
        try { meta = JSON.parse(fd.get("meta") || "null"); } catch (_e) {}
        received.ingests.push({ at: Date.now(), day: fd.get("day"), segment: fd.get("segment"), meta, files, authPresent: !!auth });
        return json(res, 200, { status: "ok", segment: fd.get("segment"), files: files.map((f) => f.name) });
      }
      if (req.method === "POST" && path === "/app/observer/ingest/event") {
        let ev = null;
        try { ev = JSON.parse((await readBuf(req)).toString("utf8")); } catch (_e) {}
        received.events.push({ at: Date.now(), event: ev });
        return json(res, 200, { ok: true });
      }
      if (req.method === "GET" && path.startsWith("/app/observer/ingest/segments/")) {
        const day = path.split("/").pop();
        return json(res, 200, received.ingests.filter((i) => i.day === day).map((i) => ({ segment: i.segment, files: i.files.map((f) => f.name) })));
      }
      json(res, 404, { error: "not found", path });
    } catch (e) {
      json(res, 500, { error: String(e && e.message) });
    }
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port; // ephemeral — never clashes with a real journal on 5015
      resolve({ port, url: `http://127.0.0.1:${port}`, received, close: () => server.close() });
    });
  });
}

// ---- a throwaway extension copy with the fixture origin pre-granted (see the
// faithfulness note in the header). The content script stays DYNAMICALLY registered.
function makeTestExt() {
  const dir = mkdtempSync(join(tmpdir(), "sb-e2e-ext-"));
  cpSync(EXT_SRC, join(dir, "extension"), { recursive: true });
  const mfPath = join(dir, "extension", "manifest.json");
  const mf = JSON.parse(readFileSync(mfPath, "utf8"));
  mf.host_permissions = Array.from(new Set([...(mf.host_permissions || []), GRANT_PATTERN]));
  writeFileSync(mfPath, JSON.stringify(mf, null, 2));
  return join(dir, "extension");
}

async function getSW(context) {
  let [sw] = context.serviceWorkers();
  if (!sw) sw = await context.waitForEvent("serviceworker", { timeout: 15000 });
  return sw;
}

async function main() {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch (_e) {
    console.error("playwright not installed. Run: npm install  &&  npx playwright install chromium");
    process.exit(2);
  }

  const stub = await startStub();
  const observedHost = `127.0.0.1:${stub.port}`;
  const extDir = makeTestExt();
  const userDataDir = mkdtempSync(join(tmpdir(), "sb-e2e-profile-"));

  console.log("\n=== solstone-browser agentic e2e (content script -> SW -> relay) ===");
  console.log(`stub relay + page: ${stub.url}`);
  console.log(`extension (throwaway, fixture origin pre-granted): ${extDir}\n`);

  let context;
  try {
    try {
      context = await chromium.launchPersistentContext(userDataDir, {
        channel: "chromium", // load-bearing: the real new-headless build, not the extension-blind shell
        headless: true,
        args: [`--disable-extensions-except=${extDir}`, `--load-extension=${extDir}`],
      });
    } catch (e) {
      console.error("could not launch the 'chromium' channel:", e.message);
      console.error("Run the one-time browser install: npx playwright install chromium");
      process.exit(2);
    }

    // Capture cleanliness signals from the moment the extension loads: console
    // errors/warnings (context-level events cover the service worker AND all
    // extension pages) and uncaught exceptions. Used by the clean-load checks below.
    const consoleErrs = [], consoleWarns = [], uncaught = [];
    context.on("console", (msg) => {
      const t = msg.type();
      if (t === "error") consoleErrs.push(msg.text());
      else if (t === "warning") consoleWarns.push(msg.text());
    });
    context.on("weberror", (e) => uncaught.push(String((e.error && e.error()) || e)));

    // 1. SW present == the 'chromium' channel resolved to the extension-capable build.
    const sw = await getSW(context);
    ok("service worker present (channel:'chromium' resolved to the real build, not the shell)", !!sw);
    const extId = /chrome-extension:\/\/([a-p]+)\//.exec(sw.url())?.[1];
    ok("extension id resolved from SW url", !!extId, extId);
    console.log(`  chrome UA: ${await sw.evaluate(() => self.navigator.userAgent)}`);

    // 2. Point the observer at the stub + opt the fixture host into the allowlist.
    await sw.evaluate(async ({ journalUrl, host }) => {
      await chrome.storage.local.set({
        cfg: {
          journalUrl, hostname: "e2e", key: "", stream: "", protocolVersion: null,
          segmentSec: 300, paused: false, allowlist: [host], siteErrors: {},
          health: { lastError: null, lastUploadAt: null, segmentsUploaded: 0, lastStatus: null },
        },
      });
    }, { journalUrl: stub.url, host: observedHost });

    // 3. Dynamic registration — the EXACT call registerSite() makes.
    const reg = await sw.evaluate(async ({ files, pattern }) => {
      try {
        await chrome.scripting.registerContentScripts([{
          id: "cs-127.0.0.1", matches: [pattern], js: files,
          runAt: "document_idle", allFrames: true, persistAcrossSessions: true,
        }]);
        return { ok: true, registered: (await chrome.scripting.getRegisteredContentScripts()).map((g) => g.id) };
      } catch (e) {
        return { ok: false, error: String(e && e.message) };
      }
    }, { files: CONTENT_SCRIPT_FILES, pattern: GRANT_PATTERN });
    ok("chrome.scripting.registerContentScripts succeeded (DYNAMIC registration)", reg.ok, reg.error || reg.registered?.join(","));

    // 4. Navigate a FRESH page — injection here is via the dynamic registration
    // (registration only affects future loads; no executeScript into open tabs).
    const page = await context.newPage();
    await page.goto(`${stub.url}/observe-test`, { waitUntil: "domcontentloaded" });

    // 5. THE injection assertion under new-headless.
    let injected = true;
    try {
      await page.waitForFunction(() => !!document.getElementById("solstone-observer-indicator-host"), { timeout: 12000 });
    } catch (_e) { injected = false; }
    ok("DYNAMIC content script INJECTED under new-headless (on-page indicator mounted)", injected);

    // 6. content-script -> SW messaging: a snapshot buffered for this context.
    await sleep(1500);
    const seg = await sw.evaluate(async () => (await chrome.storage.local.get("seg")).seg || null);
    const ctxs = seg ? Object.values(seg.ctxs || {}) : [];
    const withLines = ctxs.filter((e) => e.lines && e.lines.length);
    ok("SW received the skim (a context with >=1 buffered line)", withLines.length > 0,
      `contexts=${ctxs.length} lines=${withLines.reduce((n, e) => n + e.lines.length, 0)}`);
    const snap = withLines[0]?.lines?.[0];
    ok("buffered line is a segment_start snapshot with observed blocks", !!snap && snap.t === "segment_start" && snap.blocks?.length > 0, snap ? `blocks=${snap.blocks?.length}` : "none");
    if (snap) {
      const txt = JSON.stringify(snap.blocks);
      ok("observed text present (heading skimmed)", /On structural trust/.test(txt));
      ok("hidden content NOT observed (privacy oracle held)", !/SECRET-HIDDEN/.test(txt));
    }

    // 7. relay leg: force a flush from the popup (an extension page can message the
    // SW; the SW can't message its own listener) and assert the batched POST landed.
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extId}/popup.html`, { waitUntil: "domcontentloaded" });
    await popup.evaluate(() => new Promise((res) => chrome.runtime.sendMessage({ cmd: "flushNow" }, () => res(true))));

    let landed = false;
    for (let i = 0; i < 40 && !landed; i++) { landed = stub.received.ingests.length > 0; if (!landed) await sleep(250); }
    ok("batched segment POST reached the relay (/app/observer/ingest)", landed, `ingests=${stub.received.ingests.length}`);
    if (landed) {
      const first = stub.received.ingests[0];
      ok("register happened first (observer minted a key)", stub.received.registers.length > 0, stub.received.registers.map((r) => r.name).join(","));
      ok("ingest carried the bearer key", first.authPresent === true);
      const bfile = first.files.find((f) => /^browser_.*\.jsonl$/.test(f.name));
      ok("POST carried a browser_<host>.jsonl segment file", !!bfile, first.files.map((f) => f.name).join(","));
      ok("segment file opens with a segment_start line", !!bfile && /"t":"segment_start"/.test(bfile.text));
      ok("segment_start carries the skimmed heading", !!bfile && /On structural trust/.test(bfile.text));
      ok("relayed segment does NOT carry hidden content", !bfile || !/SECRET-HIDDEN/.test(bfile.text));
    }

    // 8. NON-GATING diagnostic: confirm (and document) that the optional-permission
    // grant cannot be obtained headlessly — why this harness pre-grants the origin.
    const opts = await context.newPage();
    await opts.goto(`chrome-extension://${extId}/options.html`, { waitUntil: "domcontentloaded" });
    await opts.evaluate(() => {
      const b = document.createElement("button");
      b.id = "__grant";
      b.addEventListener("click", () => { window.__g = chrome.permissions.request({ origins: ["*://example.test/*"] }).then((v) => v, (e) => "ERR:" + e.message); });
      document.body.appendChild(b);
    });
    await opts.click("#__grant");
    const grant = await Promise.race([opts.evaluate(() => window.__g), sleep(5000).then(() => "blocked")]);
    const after = await opts.evaluate(() => chrome.permissions.contains({ origins: ["*://example.test/*"] }));
    console.log(`  note optional_host_permissions grant under headless automation: request()=>${JSON.stringify(grant)} contains(after)=${after} => ${after ? "granted" : "not automatable (guided mode covers the live opt-in)"}`);

    // 9. clean-load: the extension loaded + ran with no errors. Ignore the benign
    // registration-race warning the SW logs when a skim arrives before the lazy
    // ensureRegistered() resolves (expected, self-heals on the retry).
    console.log("\n  -- clean load (no errors / exceptions) --");
    const extErr = await sw.evaluate(async () => {
      const c = (await chrome.storage.local.get("cfg")).cfg || {};
      return { lastError: (c.health && c.health.lastError) || null, siteErrors: Object.keys(c.siteErrors || {}).length };
    });
    ok("service worker still alive (no crash/restart)", context.serviceWorkers().length > 0);
    ok("no uncaught exceptions (SW or any extension/observed page)", uncaught.length === 0, uncaught.join(" | "));
    ok("no console errors from the extension or observed page", consoleErrs.length === 0, consoleErrs.join(" | "));
    ok("extension self-reports no error (health.lastError null, 0 site errors)", !extErr.lastError && extErr.siteErrors === 0, `lastError=${extErr.lastError} siteErrors=${extErr.siteErrors}`);
    if (consoleWarns.length) console.log("  note console warnings (non-fatal):", JSON.stringify(consoleWarns));

    console.log(`\n=== e2e: ${fail === 0 ? "ALL " + pass + " CHECKS PASS" : pass + " pass / " + fail + " FAIL"} ===`);
  } finally {
    if (context) await context.close();
    stub.close();
    for (const d of [userDataDir, join(extDir, "..")]) {
      try { rmSync(d, { recursive: true, force: true }); } catch (_e) {}
    }
  }
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error("E2E ERROR:", e); process.exit(2); });
