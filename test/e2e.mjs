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
import vm from "node:vm";
import { createHash } from "node:crypto";

await import(new URL("../extension/lib/pairlink.js", import.meta.url));
await import(new URL("../extension/lib/uuid.js", import.meta.url));
await import(new URL("../extension/lib/remote_blob.js", import.meta.url));

function loadHpke() {
  const code = readFileSync(new URL("../extension/vendor/hpke/hpke-core-1.9.0.iife.js", import.meta.url), "utf8");
  const ctx = { crypto: globalThis.crypto, TextEncoder, TextDecoder, Uint8Array, ArrayBuffer };
  ctx.globalThis = ctx;
  vm.runInNewContext(code, ctx);
  return ctx.SolstoneHpke;
}

globalThis.SolstoneHpke = loadHpke();

const EXT_SRC = fileURLToPath(new URL("../extension", import.meta.url));
const GRANT_PATTERN = "*://127.0.0.1/*"; // what registerSite() registers + the shipped opt-in requests
// Mirrors background.js CONTENT_SCRIPT_FILES + registerSite()'s registration options.
const CONTENT_SCRIPT_FILES = ["lib/blocks.js", "lib/hosts.js", "adapters.js", "skim.js", "indicator.js", "content.js"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const P = globalThis.SolstonePairlink;
const U = globalThis.SolstoneUuid;
const RB = globalThis.SolstoneRemoteBlob;
const te = new TextEncoder();
const td = new TextDecoder();

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  cond ? pass++ : fail++;
  console.log(`  ${cond ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`);
  return cond;
};

const hex = (bytes) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
const fromHex = (s) => Uint8Array.from(s.match(/../g).map((x) => Number.parseInt(x, 16)));
const concat = (parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.byteLength, 0));
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.byteLength; }
  return out;
};
const b64url = (bytes) => Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s) => new Uint8Array(Buffer.from(String(s).replace(/-/g, "+").replace(/_/g, "/"), "base64"));
const bytesEqual = (a, b) => Buffer.from(a).equals(Buffer.from(b));

function nextWsMessage(ws) {
  if (typeof ws.nextMessage === "function") return ws.nextMessage();
  return new Promise((resolve, reject) => {
    const onMessage = (data, isBinary) => {
      cleanup();
      resolve(isBinary ? new Uint8Array(data) : String(data));
    };
    const onClose = () => {
      cleanup();
      reject(new Error("websocket closed"));
    };
    const onError = (e) => {
      cleanup();
      reject(e);
    };
    const cleanup = () => {
      ws.off("message", onMessage);
      ws.off("close", onClose);
      ws.off("error", onError);
    };
    ws.on("message", onMessage);
    ws.on("close", onClose);
    ws.on("error", onError);
  });
}

function wsAccept(key) {
  return createHash("sha1").update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
}

function wsFrame(data, opcode) {
  const payload = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const len = payload.length;
  const header = len < 126 ? Buffer.from([0x80 | opcode, len])
    : len <= 0xffff ? Buffer.from([0x80 | opcode, 126, (len >>> 8) & 255, len & 255])
      : Buffer.from([0x80 | opcode, 127, 0, 0, 0, 0, (len / 0x1000000) & 255, (len >>> 16) & 255, (len >>> 8) & 255, len & 255]);
  return Buffer.concat([header, payload]);
}

function rawWs(socket) {
  let buf = Buffer.alloc(0);
  const queue = [];
  const waiters = [];
  let closed = false;
  function push(data) {
    const waiter = waiters.shift();
    if (waiter) waiter.resolve(data);
    else queue.push(data);
  }
  function fail(err) {
    closed = true;
    while (waiters.length) waiters.shift().reject(err);
  }
  function parse() {
    while (buf.length >= 2) {
      const b0 = buf[0], b1 = buf[1];
      const opcode = b0 & 0x0f;
      const masked = !!(b1 & 0x80);
      let len = b1 & 0x7f;
      let off = 2;
      if (len === 126) {
        if (buf.length < off + 2) return;
        len = buf.readUInt16BE(off); off += 2;
      } else if (len === 127) {
        if (buf.length < off + 8) return;
        const hi = buf.readUInt32BE(off), lo = buf.readUInt32BE(off + 4); off += 8;
        len = hi * 2 ** 32 + lo;
      }
      if (!masked) return fail(new Error("client frame was not masked"));
      if (buf.length < off + 4 + len) return;
      const mask = buf.subarray(off, off + 4); off += 4;
      const payload = Buffer.from(buf.subarray(off, off + len));
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
      buf = buf.subarray(off + len);
      if (opcode === 0x8) { socket.end(wsFrame(Buffer.alloc(0), 0x8)); return fail(new Error("websocket closed")); }
      if (opcode === 0x9) { socket.write(wsFrame(payload, 0xA)); continue; }
      if (opcode === 0x1) push(payload.toString("utf8"));
      else if (opcode === 0x2) push(new Uint8Array(payload));
    }
  }
  socket.on("data", (chunk) => { buf = Buffer.concat([buf, chunk]); parse(); });
  socket.on("close", () => fail(new Error("websocket closed")));
  socket.on("error", fail);
  return {
    send(data) {
      const opcode = typeof data === "string" ? 0x1 : 0x2;
      socket.write(wsFrame(data, opcode));
    },
    close() {
      try { socket.end(wsFrame(Buffer.alloc(0), 0x8)); } catch (_e) {}
    },
    nextMessage() {
      if (queue.length) return Promise.resolve(queue.shift());
      if (closed) return Promise.reject(new Error("websocket closed"));
      return new Promise((resolve, reject) => waiters.push({ resolve, reject }));
    },
  };
}

function acceptRawWs(req, socket) {
  const protocols = String(req.headers["sec-websocket-protocol"] || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!protocols.includes("spl-v1")) {
    socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
    socket.destroy();
    return null;
  }
  socket.write([
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${wsAccept(req.headers["sec-websocket-key"])}`,
    "Sec-WebSocket-Protocol: spl-v1",
    "\r\n",
  ].join("\r\n"));
  return rawWs(socket);
}

function parseOffer(bytes) {
  const b = new Uint8Array(bytes);
  if (td.decode(b.slice(0, 4)) !== "SBO1") throw new Error("bad Offer magic");
  const ctLen = b.slice(59, 67).reduce((n, x) => (n << 8n) | BigInt(x), 0n);
  return {
    bytes: b,
    senderFp: b.slice(11, 43),
    blobId: b.slice(43, 59),
    ctLen: Number(ctLen),
  };
}

async function gunzip(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

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

async function startStub() {
  const received = { registers: [], ingests: [], events: [], pairs: [], remoteBlobs: [] };
  const seenSegments = new Set();
  const seenBlobIds = new Set();
  let rejectIngest = false;
  let rejectRemoteReady = false;
  let dropRemoteAck = false;
  let corruptRemoteAck = false;
  let keySeq = 0;
  let deviceToken = "";
  let extPubSpki = null;
  const S = fromHex("0123456789abcdef");
  const caKp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const homeKp = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const caSpki = new Uint8Array(await crypto.subtle.exportKey("spki", caKp.publicKey));
  const pkHSpki = new Uint8Array(await crypto.subtle.exportKey("spki", homeKp.publicKey));
  const caFp = new Uint8Array(await crypto.subtle.digest("SHA-256", caSpki)).slice(0, 16);
  const instanceId = "018f0112-3456-789a-8bcd-ef0123456789";
  const instanceId16 = U.bytesFromUuidString(instanceId);
  const expectedRk = hex(await P.deriveRK(S));
  let pairLink = "";
  let badPairLink = "";

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
      if (req.method === "POST" && path === "/enroll/device") {
        let body = {};
        try { body = JSON.parse((await readBuf(req)).toString("utf8")); } catch (_e) {}
        if (body.instance_id !== instanceId || !body.home_attestation) return json(res, 400, { error: "bad enrollment" });
        deviceToken = `device-token-${Date.now()}`;
        received.enroll = body;
        return json(res, 200, { device_token: deviceToken, expires_at: Date.now() + 3600_000 });
      }
      if (req.method === "POST" && path === "/app/observer/register") {
        let desc = {};
        try { desc = JSON.parse((await readBuf(req)).toString("utf8")); } catch (_e) {}
        const name = `${desc.hostname || "local"}.browser`;
        const key = `e2ekey-${++keySeq}-${desc.hostname || "local"}`;
        received.registers.push({ at: Date.now(), descriptor: desc, name, key });
        return json(res, 200, { key, name, prefix: key.slice(0, 8), protocol_version: 1 });
      }
      if (req.method === "POST" && path === "/app/observer/ingest") {
        if (rejectIngest) return json(res, 503, { error: "stub outage" });
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
        const day = fd.get("day");
        const segment = fd.get("segment");
        const key = `${day}/${segment}`;
        if (seenSegments.has(key)) return json(res, 200, { status: "duplicate", segment, files: files.map((f) => f.name) });
        seenSegments.add(key);
        received.ingests.push({ at: Date.now(), day, segment, meta, files, authPresent: !!auth });
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
  async function handlePair(ws, req) {
    try {
      const protocols = String(req.headers["sec-websocket-protocol"] || "");
      if (!protocols.split(",").map((s) => s.trim()).includes(`spl-pair.${expectedRk}`)) throw new Error("missing expected pair subprotocol");
      const hello = await nextWsMessage(ws);
      if (!bytesEqual(hello, concat([te.encode("SBP1"), Uint8Array.of(1)]))) throw new Error("bad PairHello");
      const signed = concat([te.encode("spl-pair-browser-v1"), pkHSpki, instanceId16]);
      const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, caKp.privateKey, signed));
      ws.send(JSON.stringify({ pkH_spki: b64url(pkHSpki), ca_spki: b64url(caSpki), instance_id: instanceId, sig: b64url(sig) }));
      const sealedHello = await nextWsMessage(ws);
      const opened = await RB.openBaseSealed({
        recipientPrivateKey: homeKp.privateKey,
        recipientPublicKey: homeKp.publicKey,
        enc: sealedHello.slice(0, 65),
        info: instanceId16,
        ct: sealedHello.slice(65),
      });
      const parsed = JSON.parse(td.decode(opened));
      extPubSpki = fromB64url(parsed.ext_pub_spki);
      received.pairs.push({ hello: true, deviceLabel: parsed.device_label, S: parsed.S, extPubSpki: parsed.ext_pub_spki });
      const reply = te.encode(JSON.stringify({ instance_id: instanceId, home_attestation: "stub-attestation" }));
      const sealedReply = await RB.sealBase({ recipientSpki: extPubSpki, info: instanceId16, plaintext: reply });
      ws.send(Buffer.from(concat([sealedReply.enc, sealedReply.ct])));
    } catch (e) {
      received.pairError = String(e && e.message);
      try { ws.close(); } catch (_e) {}
    }
  }

  async function handleData(ws, req) {
    try {
      const url = new URL(req.url, "http://127.0.0.1");
      if (url.searchParams.get("instance") !== instanceId || url.searchParams.get("token") !== deviceToken) throw new Error("bad data dial credentials");
      const offer = parseOffer(await nextWsMessage(ws));
      ws.send(Buffer.from(Uint8Array.from([...te.encode("SBR1"), 0x01, rejectRemoteReady ? 0x02 : 0x00])));
      if (rejectRemoteReady) return;
      const needed = 65 + offer.ctLen;
      let sealed = new Uint8Array();
      while (sealed.byteLength < needed) sealed = concat([sealed, await nextWsMessage(ws)]);
      const suite = new globalThis.SolstoneHpke.CipherSuite({
        kem: new globalThis.SolstoneHpke.DhkemP256HkdfSha256(),
        kdf: new globalThis.SolstoneHpke.HkdfSha256(),
        aead: new globalThis.SolstoneHpke.Aes256Gcm(),
      });
      const senderPublicKey = await crypto.subtle.importKey("spki", extPubSpki, { name: "ECDH", namedCurve: "P-256" }, true, []);
      const ctx = await suite.createRecipientContext({
        recipientKey: homeKp.privateKey,
        enc: sealed.slice(0, 65),
        info: RB.blobInfo(instanceId16, offer.senderFp),
        senderPublicKey,
      });
      const plaintext = new Uint8Array(await ctx.open(sealed.slice(65, needed), offer.bytes));
      const tarBytes = await gunzip(plaintext);
      const files = RB.untar(tarBytes).map((f) => ({ name: f.name, text: td.decode(f.bytes), bytes: f.bytes.byteLength }));
      const blob = JSON.parse(files.find((f) => f.name === "blob.json")?.text || "{}");
      const segmentFile = files.find((f) => /^browser_.*\.jsonl$/.test(f.name));
      const blobIdHex = hex(offer.blobId);
      const duplicate = seenBlobIds.has(blobIdHex);
      seenBlobIds.add(blobIdHex);
      const kAck = new Uint8Array(await ctx.export(te.encode("spl-blob-ack-v1"), 32));
      let tag = await RB.ackTag(kAck, duplicate ? 0x01 : 0x00, offer.blobId);
      if (corruptRemoteAck) tag = Uint8Array.from(tag, (b, i) => (i === 0 ? b ^ 0xff : b));
      const record = { blobId: blobIdHex, blob, files, segmentText: segmentFile?.text || "", ackValid: !corruptRemoteAck, duplicate };
      received.remoteBlobs.push(record);
      if (!dropRemoteAck) ws.send(Buffer.from(concat([te.encode("SBA1"), Uint8Array.of(0x01, duplicate ? 0x01 : 0x00), offer.blobId, tag])));
    } catch (e) {
      received.remoteError = String(e && e.message);
      try { ws.close(); } catch (_e) {}
    }
  }

  server.on("upgrade", (req, socket, head) => {
    const path = new URL(req.url, "http://127.0.0.1").pathname;
    if (path !== "/pair/window" && path !== "/session/dial") return socket.destroy();
    if (head && head.length) socket.unshift(head);
    const ws = acceptRawWs(req, socket);
    if (!ws) return;
    if (path === "/pair/window") handlePair(ws, req);
    else handleData(ws, req);
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port; // ephemeral — never clashes with a real journal on 5015
      const url = `http://127.0.0.1:${port}`;
      pairLink = P.linkFromBlob(P.buildBlob({ S, caFpSpki: caFp, relayOrigin: url }));
      badPairLink = P.linkFromBlob(P.buildBlob({ S, caFpSpki: new Uint8Array(16), relayOrigin: url }));
      resolve({
        port,
        url,
        pairLink: () => pairLink,
        badPairLink: () => badPairLink,
        instanceId,
        received,
        setIngestReject: (v) => { rejectIngest = !!v; },
        setRemoteReadyReject: (v) => { rejectRemoteReady = !!v; },
        setDropRemoteAck: (v) => { dropRemoteAck = !!v; },
        setCorruptRemoteAck: (v) => { corruptRemoteAck = !!v; },
        close: () => { server.close(); },
      });
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

    // Spy on chrome.action.setIcon so we can assert the live updateBadge -> setIcon
    // wiring (the pure state matrix is unit-tested in test/status.test.mjs).
    await sw.evaluate(() => {
      globalThis.__icons = [];
      const orig = chrome.action.setIcon.bind(chrome.action);
      chrome.action.setIcon = (d) => { try { globalThis.__icons.push(d && d.path && d.path["16"]); } catch (_e) {} return orig(d); };
    });

    // 2. Point the observer at the stub + opt the fixture host into the allowlist.
    //    (showPageIndicator is left at its default — false — so we verify off-by-default.)
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

    // 5. THE injection assertion under new-headless — independent of the (now
    // opt-in, off-by-default) on-page marker: the content script ran and skimmed
    // to the SW. Wait for a buffered line to appear.
    let seg = null, injected = false;
    for (let i = 0; i < 48 && !injected; i++) {
      seg = await sw.evaluate(async () => (await chrome.storage.local.get("seg")).seg || null);
      injected = !!(seg && Object.values(seg.ctxs || {}).some((e) => e.lines && e.lines.length));
      if (!injected) await sleep(250);
    }
    ok("DYNAMIC content script INJECTED under new-headless (ran + skimmed to the SW)", injected);

    // 5b. The on-page marker is OFF by default — nothing mounted on the page.
    const markerOff = await page.evaluate(() => !document.getElementById("solstone-observer-indicator-host"));
    ok("on-page marker is OFF by default (no indicator injected)", markerOff);

    // 6. that buffered line is a segment_start snapshot with observed content.
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

    // 7a. Outage round-trip: a failed send is kept in the offline outbox; when
    // the stub recovers, probe triggers drain and the original day/segment lands.
    await sleep(1100);
    await sw.evaluate(async () => {
      const r = await chrome.storage.local.get("seg");
      if (r.seg) {
        r.seg.startMs = Date.now();
        r.seg.day = globalThis.SolstoneSegment.dayKey(r.seg.startMs);
        await chrome.storage.local.set({ seg: r.seg });
      }
    });
    const beforeOutageIngests = stub.received.ingests.length;
    stub.setIngestReject(true);
    const queued = await popup.evaluate(() => new Promise((res) => chrome.runtime.sendMessage({ cmd: "flushNow" }, (r) => res(r || {}))));
    ok("outage send-now reports queued", queued.outcome === "queued", JSON.stringify(queued));
    const queuedState = await sw.evaluate(async () => {
      return { outbox: await globalThis.SolstoneOutboxStore.all(), dropped: await globalThis.SolstoneOutboxStore.getDropped() };
    });
    ok("outage leaves a durable outbox entry", queuedState.outbox.length > 0, `outbox=${queuedState.outbox.length}`);
    ok("outage does not count loss", (queuedState.dropped.segments || 0) === 0 && (queuedState.dropped.lines || 0) === 0, JSON.stringify(queuedState.dropped));
    stub.setIngestReject(false);
    await sleep(400);
    await sw.evaluate(async () => {
      const entry = await globalThis.SolstoneOutboxStore.head();
      if (entry) await globalThis.SolstoneOutboxStore.setBackoff(entry, 0, null, entry.attempts || 0);
    });
    await popup.evaluate(() => new Promise((res) => chrome.runtime.sendMessage({ cmd: "probe" }, () => res(true))));
    let drained = false;
    for (let i = 0; i < 40 && !drained; i++) {
      drained = await sw.evaluate(async () => (await globalThis.SolstoneOutboxStore.all()).length === 0);
      if (!drained) await sleep(250);
    }
    ok("recovered journal drains the offline outbox", drained);
    ok("drain delivered the queued segment exactly once", stub.received.ingests.length === beforeOutageIngests + 1, `ingests=${stub.received.ingests.length}`);

    // 7b. Live toggle: enabling the on-page marker mounts it on the already-open
    // observed tab (exercises setIndicatorAll -> the hostAllowed-gated content path).
    await popup.evaluate(() => new Promise((res) => chrome.runtime.sendMessage({ cmd: "setConfig", showPageIndicator: true }, () => res(true))));
    let markerOn = false;
    try { await page.waitForFunction(() => !!document.getElementById("solstone-observer-indicator-host"), { timeout: 6000 }); markerOn = true; } catch (_e) {}
    ok("enabling the on-page marker mounts it live on the observed tab", markerOn);

    // 7c. Icon wiring: after a successful upload the state is observing + connected,
    // so updateBadge must have driven the full-sun icon via iconState.
    const icons = await sw.evaluate(() => globalThis.__icons || []);
    ok("updateBadge drove the toolbar icon to full sun (observing + journal connected)",
      icons.length > 0 && icons[icons.length - 1] === "icons/icon16.png", icons.slice(-4).join(",") || "no setIcon calls");

    console.log("\n  -- remote HPKE relay path --");
    const surfaces = await sw.evaluate(async ({ stubPort }) => {
      const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
      const fromHex = (s) => Uint8Array.from(s.match(/../g).map((x) => Number.parseInt(x, 16)));
      const identity1 = await globalThis.SolstoneIdentity.ensureIdentity();
      const identity2 = await globalThis.SolstoneIdentity.ensureIdentity();
      const packed = await globalThis.SolstoneRemoteBlob.packPlaintext([{ name: "browser_probe.jsonl", text: "{\"t\":\"segment_start\"}\n" }], {
        v: 1, day: "20260704", segment: "120000_1", host: "probe", meta: { observer: "probe.browser" },
      });
      const gunzipped = new Uint8Array(await new Response(new Blob([packed]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer());
      const unpacked = globalThis.SolstoneRemoteBlob.untar(gunzipped).map((f) => ({ name: f.name, text: new TextDecoder().decode(f.bytes) }));
      const hpke = globalThis.SolstoneHpke;
      const fixture = {
        info: "4f6465206f6e2061204772656369616e2055726e",
        skRm: "d9f10996a02cd6c9dbda1d1f225f18f781ea3c893b8c2a6cb2e266e59f3cd9a9",
        pkSm: "04ece9b48cc98ee03ba742fe1218a3fbec960cc34b6e1defdcd3285276f39028e95b90f9526607565888766a1101f429dc3ec87364b5c8c613f0a081881950427f",
        enc: "04a7aeac79fda402674ef247c12d6f5fdfd21498d896b67ff04ec181382d4516b7662be32b4a2ae817c2d57104ecb6fcaa527438939810612d1b3d0af36ffc66ce",
        aad: "436f756e742d30",
        pt: "4265617574792069732074727574682c20747275746820626561757479",
        ct: "59b9890aabf94c1d502c39d8d356989ab0880ed43e984255db7b32a8d7b0ad5beba799a4ec326a0ddca3dd5e5d",
        exp: "6c0386ae15b1b834a5247ca5595b4e102347cbcdc65de64832f36008ce9c9483",
      };
      const suite = new hpke.CipherSuite({ kem: new hpke.DhkemP256HkdfSha256(), kdf: new hpke.HkdfSha256(), aead: new hpke.Aes256Gcm() });
      const recipient = await suite.createRecipientContext({
        recipientKey: await suite.kem.deserializePrivateKey(fromHex(fixture.skRm)),
        senderPublicKey: await suite.kem.deserializePublicKey(fromHex(fixture.pkSm)),
        enc: fromHex(fixture.enc),
        info: fromHex(fixture.info),
      });
      let wsConstructed = false;
      try {
        const ws = new WebSocket(`ws://127.0.0.1:${stubPort}/nope`);
        wsConstructed = true;
        setTimeout(() => { try { ws.close(); } catch (_e) {} }, 50);
      } catch (_e) {}
      return {
        identity: {
          privateExtractable: identity1.privateKey.extractable,
          senderFpLen: identity1.senderFp.byteLength,
          stableFp: hex(identity1.senderFp) === hex(identity2.senderFp),
        },
        compressionRoundTrip: unpacked.some((f) => f.name === "blob.json") && unpacked.some((f) => f.name === "browser_probe.jsonl" && /segment_start/.test(f.text)),
        hpkePt: hex(await recipient.open(fromHex(fixture.ct), fromHex(fixture.aad))),
        hpkeExp: hex(await recipient.export(new Uint8Array(), 32)),
        fixturePt: fixture.pt,
        fixtureExp: fixture.exp,
        wsConstructed,
      };
    }, { stubPort: stub.port });
    ok("SW identity CryptoKey is non-extractable and senderFp is stable", surfaces.identity.privateExtractable === false && surfaces.identity.senderFpLen === 32 && surfaces.identity.stableFp, JSON.stringify(surfaces.identity));
    ok("SW CompressionStream packPlaintext -> gunzip -> untar round-trips", surfaces.compressionRoundTrip);
    ok("SW vendored HPKE opens RFC 9180 fixture and exports expected secret", surfaces.hpkePt === surfaces.fixturePt && surfaces.hpkeExp === surfaces.fixtureExp, `${surfaces.hpkePt}/${surfaces.hpkeExp}`);
    ok("SW WebSocket construction to relay origin is not permission-blocked", surfaces.wsConstructed);

    const badPair = await popup.evaluate((link) => new Promise((res) => chrome.runtime.sendMessage({ cmd: "pairRemote", link }, (r) => res(r || {}))), stub.badPairLink());
    const remoteAfterBadPair = await sw.evaluate(async () => ((await chrome.storage.local.get("cfg")).cfg || {}).remote || null);
    ok("bad CA fingerprint aborts pairing", badPair.ok === false && !remoteAfterBadPair, JSON.stringify(badPair));

    const pair = await popup.evaluate((link) => new Promise((res) => chrome.runtime.sendMessage({ cmd: "pairRemote", link }, (r) => res(r || {}))), stub.pairLink());
    const remoteCfg = await sw.evaluate(async () => ((await chrome.storage.local.get("cfg")).cfg || {}).remote || null);
    ok("pairRemote succeeds against stub relay", pair.ok === true && pair.instanceId === stub.instanceId, JSON.stringify(pair));
    ok("pairing stores remote config", !!(remoteCfg && remoteCfg.instanceId === stub.instanceId && remoteCfg.deviceToken && remoteCfg.homeSpki && remoteCfg.relayOrigin === stub.url), JSON.stringify(remoteCfg));
    ok("stub saw PairHello and enroll", stub.received.pairs.length > 0 && !!stub.received.enroll, `pairs=${stub.received.pairs.length} enroll=${!!stub.received.enroll}`);

    await sleep(1100);
    await sw.evaluate(async () => {
      const r = await chrome.storage.local.get("seg");
      if (r.seg) {
        r.seg.startMs = Date.now();
        r.seg.day = globalThis.SolstoneSegment.dayKey(r.seg.startMs);
        await chrome.storage.local.set({ seg: r.seg });
      }
    });
    const beforeRemoteBlobs = stub.received.remoteBlobs.length;
    const remoteFlush = await popup.evaluate(() => new Promise((res) => chrome.runtime.sendMessage({ cmd: "flushNow" }, (r) => res(r || {}))));
    ok("remote send-now queues for sealed drain", remoteFlush.outcome === "queued", JSON.stringify(remoteFlush));
    let remoteDelivered = false;
    for (let i = 0; i < 50 && !remoteDelivered; i++) {
      remoteDelivered = stub.received.remoteBlobs.length > beforeRemoteBlobs && await sw.evaluate(async () => (await globalThis.SolstoneOutboxStore.all()).length === 0);
      if (!remoteDelivered) await sleep(250);
    }
    const firstRemote = stub.received.remoteBlobs.at(-1);
    ok("sealed uplink reaches stub and IDB outbox drains after valid ACK", remoteDelivered, `remoteBlobs=${stub.received.remoteBlobs.length}`);
    ok("sealed segment carries heading and excludes hidden content", !!firstRemote && /On structural trust/.test(firstRemote.segmentText) && !/SECRET-HIDDEN/.test(firstRemote.segmentText));
    ok("stub ACK for sealed blob was tag-valid", !!firstRemote && firstRemote.ackValid === true);

    stub.setRemoteReadyReject(true);
    await sleep(1100);
    await sw.evaluate(async () => {
      const r = await chrome.storage.local.get("seg");
      if (r.seg) {
        r.seg.startMs = Date.now();
        r.seg.day = globalThis.SolstoneSegment.dayKey(r.seg.startMs);
        await chrome.storage.local.set({ seg: r.seg });
      }
    });
    const beforeRejectBlobs = stub.received.remoteBlobs.length;
    const rejectedFlush = await popup.evaluate(() => new Promise((res) => chrome.runtime.sendMessage({ cmd: "flushNow" }, (r) => res(r || {}))));
    let retained = null;
    for (let i = 0; i < 30 && !retained; i++) {
      const state = await sw.evaluate(async () => ({ outbox: await globalThis.SolstoneOutboxStore.all(), dropped: await globalThis.SolstoneOutboxStore.getDropped() }));
      if (state.outbox.length) retained = state;
      else await sleep(250);
    }
    const retainedBlobId = retained?.outbox?.[0]?.blob_id;
    ok("Ready-reject sealed send is retained in IDB", rejectedFlush.outcome === "queued" && !!retainedBlobId, JSON.stringify(rejectedFlush));
    ok("sealed outage does not count loss", retained && retained.dropped.segments === 0 && retained.dropped.lines === 0, JSON.stringify(retained && retained.dropped));

    const survival = await sw.evaluate(async () => {
      const a = await globalThis.SolstoneIdentity.ensureIdentity();
      const outA = await globalThis.SolstoneOutboxStore.all();
      const b = await globalThis.SolstoneIdentity.ensureIdentity();
      const outB = await globalThis.SolstoneOutboxStore.all();
      const hx = (u) => [...u].map((x) => x.toString(16).padStart(2, "0")).join("");
      return { sameFp: hx(a.senderFp) === hx(b.senderFp), outboxReloads: outA.length === outB.length && outB.length > 0, realRestartForced: false };
    });
    ok("IDB survival proxy: identity and retained outbox reload across independent SW reads", survival.sameFp && survival.outboxReloads, JSON.stringify(survival));
    console.log("  note SW teardown: true worker restart not forced here; asserted strongest stable proxy (independent SW reads).");

    stub.setRemoteReadyReject(false);
    await sleep(400);
    await sw.evaluate(async (expectedBlobId) => {
      const entry = await globalThis.SolstoneOutboxStore.head();
      if (entry && entry.blob_id === expectedBlobId) await globalThis.SolstoneOutboxStore.setBackoff(entry, 0, null, entry.attempts || 0);
    }, retainedBlobId);
    await popup.evaluate(() => new Promise((res) => chrome.runtime.sendMessage({ cmd: "probe" }, () => res(true))));
    let remoteRecovered = false;
    for (let i = 0; i < 50 && !remoteRecovered; i++) {
      remoteRecovered = stub.received.remoteBlobs.length === beforeRejectBlobs + 1 && await sw.evaluate(async () => (await globalThis.SolstoneOutboxStore.all()).length === 0);
      if (!remoteRecovered) await sleep(250);
    }
    const recoveredBlob = stub.received.remoteBlobs.at(-1);
    ok("sealed outage drains after relay recovers", remoteRecovered);
    ok("sealed retry preserves blob_id and delivers exactly once after recovery", recoveredBlob && recoveredBlob.blobId === retainedBlobId && stub.received.remoteBlobs.length === beforeRejectBlobs + 1, `retained=${retainedBlobId} got=${recoveredBlob && recoveredBlob.blobId}`);

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
