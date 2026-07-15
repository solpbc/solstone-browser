// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc
//
// background.js — the MV3 service worker. It is the persistent (event-driven)
// half of the observer: it holds the journal registration, buffers each tab's
// skims into a 5-minute segment in chrome.storage, rotates segments via
// chrome.alarms, and delivers through either local multipart POST or a paired
// HPKE relay tunnel. It also owns the opt-in per-site lifecycle (grant ->
// register a content script -> observe; revoke -> tear down). All segment /
// diff / JSONL work is delegated to lib/segment.js so it stays pure and tested.
//
// Why the worker can be the observer (no separate native host for the Chrome
// desktop spike): in local mode, the journal already runs on the same machine
// and exposes a localhost ingest API that does segmentation-on-receipt. Remote
// mode keeps the same segment model but seals blobs before sending them through
// the relay. MV3 ephemerality is handled by persisting state to chrome.storage
// and IndexedDB and waking on alarms.

importScripts("vendor/hpke/hpke-core-1.9.0.iife.js", "lib/blocks.js", "lib/hosts.js", "lib/reconcile.js", "lib/segment.js", "lib/status.js", "lib/buffered.js", "lib/outbox.js", "lib/db.js", "lib/uuid.js", "lib/pairlink.js", "lib/remote_blob.js", "lib/identity.js", "lib/outbox_store.js", "lib/remote_tunnel.js", "journal.js");

const Seg = globalThis.SolstoneSegment;
const H = globalThis.SolstoneHosts;
const Reconcile = globalThis.SolstoneReconcile;
const J = globalThis.SolstoneJournal;
const Outbox = globalThis.SolstoneOutbox;
const DB = globalThis.SolstoneDB;
const OutboxStore = globalThis.SolstoneOutboxStore;
const Pairlink = globalThis.SolstonePairlink;
const Identity = globalThis.SolstoneIdentity;
const RemoteBlob = globalThis.SolstoneRemoteBlob;
const RemoteTunnel = globalThis.SolstoneRemoteTunnel;
const Uuid = globalThis.SolstoneUuid;
const VERSION = "0.0.13";
const BOOT_MS = Date.now();

const CONTENT_SCRIPT_FILES = ["lib/blocks.js", "lib/hosts.js", "adapters.js", "skim.js", "indicator.js", "content.js"];
const ROTATE_ALARM = "rotate";
const MAX_LINES = 4000; // per-site per-segment safety cap
const REMOTE_FRAME_TIMEOUT_MS = 5000;

const DEFAULT_CFG = {
  journalUrl: "http://localhost:5015",
  hostname: "desktop", // the short machine name -> stream "<hostname>.browser"; set to your machine name in options
  key: "",
  stream: "",
  protocolVersion: null,
  segmentSec: 300,
  paused: false,
  showPageIndicator: false,
  allowlist: [],
  pausedHosts: {},
  remote: null,
  remotePending: null,
  siteErrors: {}, // host -> last registration/observe error string
  health: { lastError: null, lastUploadAt: null, segmentsUploaded: 0, lastStatus: null, consecutiveFailures: 0 },
};

// ---- storage helpers -------------------------------------------------------

async function getCfg() {
  const r = await chrome.storage.local.get("cfg");
  return Object.assign({}, DEFAULT_CFG, r.cfg || {}, {
    pausedHosts: Object.assign({}, (r.cfg && r.cfg.pausedHosts) || {}),
    siteErrors: Object.assign({}, (r.cfg && r.cfg.siteErrors) || {}),
    health: Object.assign({}, DEFAULT_CFG.health, (r.cfg && r.cfg.health) || {}),
  });
}
async function setCfg(cfg) {
  await chrome.storage.local.set({ cfg });
}
async function getSeg() {
  const r = await chrome.storage.local.get("seg");
  const seg = r.seg || null;
  // Migration: a pre-v0.0.6 segment is keyed `seg.sites` (no `ctxs`). Discard it
  // so every reader starts fresh in the per-context format instead of reading
  // `seg.ctxs` off undefined.
  if (seg && !seg.ctxs) return null;
  return seg;
}
async function setSeg(seg) {
  await chrome.storage.local.set({ seg });
}
async function getDropped() {
  return OutboxStore.getDropped();
}

function newSeg(now) {
  const ms = now || Date.now();
  // ctxs: keyed by a content-minted context id (one per observed tab/page load),
  // each { host, tabId, meta, snapshotWritten, active, lines, last }.
  return { startMs: ms, day: Seg.dayKey(ms), ctxs: {} };
}
function round1(x) {
  return Math.round(x * 10) / 10;
}
function normalizeDropped(dropped) {
  return {
    segments: Math.max(0, Number((dropped && dropped.segments) || 0)),
    lines: Math.max(0, Number((dropped && dropped.lines) || 0)),
  };
}
function pendingLinesForSeg(seg) {
  return seg ? Object.values(seg.ctxs || {}).reduce((n, e) => n + (e.lines ? e.lines.length : 0), 0) : 0;
}
function uploadMeta(cfg) {
  return { host: cfg.hostname || "local", platform: "browser", stream: cfg.stream, observer: cfg.stream };
}
async function waitingSummary(seg) {
  const dropped = await getDropped();
  const outboxInfo = await OutboxStore.counts();
  const outboxLines = outboxInfo.lines;
  const summary = Outbox.summary({ segPendingLines: pendingLinesForSeg(seg), outboxLines, dropped });
  return { summary, outboxInfo, dropped: summary.dropped };
}

function isRemotePaired(cfg) {
  return !!(cfg.remote && cfg.remote.instanceId && cfg.remote.deviceToken && cfg.remote.homeSpki);
}

function hex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function bytesFromHex(s) {
  const raw = String(s || "");
  if (!/^(?:[0-9a-fA-F]{2})*$/.test(raw)) throw new Error("invalid hex");
  return Uint8Array.from(raw.match(/../g)?.map((x) => Number.parseInt(x, 16)) || []);
}

function b64url(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s) {
  const b64 = String(s || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob(padded);
  return Uint8Array.from(raw, (ch) => ch.charCodeAt(0));
}

function concatBytes(parts) {
  const total = parts.reduce((n, p) => n + p.byteLength, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.byteLength;
  }
  return out;
}

function bytesEqual(a, b) {
  if (!a || !b || a.byteLength !== b.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < a.byteLength; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function backoffMs(attempts) {
  return Math.min(5 * 60 * 1000, 1000 * Math.pow(2, Math.min(8, Math.max(0, attempts))));
}

// Serialize all segment read-modify-write through one chain to avoid races
// between concurrent content-script messages.
let segChain = Promise.resolve();
function withSeg(fn) {
  segChain = segChain.then(fn, fn);
  return segChain;
}

let lifecycleChain = Promise.resolve();
function withLifecycle(fn) {
  lifecycleChain = lifecycleChain.then(fn, fn);
  return lifecycleChain;
}

let draining = false;

// ---- registration ----------------------------------------------------------

let registering = null;
async function ensureRegistered() {
  const cfg = await getCfg();
  if (cfg.key) return cfg;
  if (registering) return registering;
  registering = (async () => {
    const descriptor = {
      platform: "browser",
      hostname: cfg.hostname || "local",
      stream_type: "browser",
      version: VERSION,
      label: "solstone browser observer (prototype)",
    };
    const res = await J.register(cfg.journalUrl, descriptor);
    const next = await getCfg();
    next.key = res.key;
    next.stream = res.name;
    next.protocolVersion = res.protocol_version;
    next.health = globalThis.SolstoneStatus.updateHealth(next.health, { ok: true });
    await setCfg(next);
    console.log(`[solstone] registered as ${res.name} (${res.prefix}…)`);
    return next;
  })();
  try {
    return await registering;
  } catch (e) {
    const next = await getCfg();
    next.health = globalThis.SolstoneStatus.updateHealth(next.health, { ok: false, status: (e && e.status) || 0, error: String(e && e.message) });
    await setCfg(next);
    console.warn("[solstone] registration failed:", e);
    throw e;
  } finally {
    registering = null;
  }
}

// ---- per-site lifecycle ----------------------------------------------------

// Register the content script for a host. Uses a PORT-LESS match pattern
// (Chrome match patterns reject ports); the content script self-gates on the
// exact allowlist entry to restore port precision. Throws on a bad pattern so
// the caller can record + surface the error.
async function registerSite(host) {
  const id = "cs-" + H.matchHostFor(host); // dedupe by hostname (one cs per hostname)
  const pattern = H.matchPatternFor(host);
  try {
    await chrome.scripting.unregisterContentScripts({ ids: [id] });
  } catch (_e) {
    /* not registered yet */
  }
  await chrome.scripting.registerContentScripts([
    {
      id,
      matches: [pattern],
      js: CONTENT_SCRIPT_FILES,
      runAt: "document_idle",
      allFrames: true,
      persistAcrossSessions: true,
    },
  ]);
  // Inject into already-open matching tabs (registration only affects future loads).
  try {
    const tabs = await chrome.tabs.query({ url: pattern });
    for (const tab of tabs) {
      if (tab.id == null) continue;
      try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: CONTENT_SCRIPT_FILES });
      } catch (_e) {
        /* restricted page / not yet permitted */
      }
    }
  } catch (_e) {
    /* host permission not yet effective */
  }
}

async function unregisterContentScript(matchHost) {
  try {
    await chrome.scripting.unregisterContentScripts({ ids: ["cs-" + matchHost] });
  } catch (_e) {
    /* already gone */
  }
}

async function stopHostTabs(matchHost, keepAllowlist) {
  try {
    const tabs = await chrome.tabs.query({ url: H.matchPatternFor(matchHost) });
    for (const tab of tabs) {
      if (typeof keepAllowlist !== "undefined") {
        try {
          if (H.hostAllowed(new URL(tab.url).host, keepAllowlist)) continue;
        } catch (_e) {
          /* missing / invalid tab URL: stop it to fail closed */
        }
      }
      if (tab.id != null) chrome.tabs.sendMessage(tab.id, { kind: "stop" }, () => void chrome.runtime.lastError);
    }
  } catch (_e) {
    /* ignore */
  }
}

async function deactivateSiteContexts(entries) {
  await withSeg(async () => {
    const seg = await getSeg();
    let changed = false;
    if (seg) {
      for (const e of Object.values(seg.ctxs)) {
        if (entries.includes(e.host) && e.active) {
          e.active = false;
          changed = true;
        }
      }
    }
    if (changed) await setSeg(seg);
  });
}

async function siteIntent(host) {
  return withLifecycle(async () => {
    const cfg = await getCfg();
    const added = !cfg.allowlist.includes(host);
    if (added) cfg.allowlist.push(host);
    cfg.pausedHosts[H.matchHostFor(host)] = true;
    await setCfg(cfg);
    await updateBadge();
    return added;
  });
}

async function relayIntent(relayOrigin) {
  return withLifecycle(async () => {
    const cfg = await getCfg();
    cfg.remotePending = relayOrigin ? { relayOrigin } : null;
    await setCfg(cfg);
  });
}

async function addSite(host) {
  return withLifecycle(async () => {
    let cfg = await getCfg();
    if (!cfg.allowlist.includes(host)) cfg.allowlist.push(host);
    delete cfg.pausedHosts[H.matchHostFor(host)];
    await setCfg(cfg);

    let error = null;
    try {
      await registerSite(host);
    } catch (e) {
      error = String((e && e.message) || e) || "could not read this site";
      console.warn("[solstone] registerSite failed for", host, e);
    }

    cfg = await getCfg();
    if (error) cfg.siteErrors[host] = error;
    else delete cfg.siteErrors[host];
    await setCfg(cfg);
    await updateBadge();
    if (!error) drainOutbox();
    return error;
  });
}

// Remove one exact allowlist entry. The content script and permission are shared
// by hostname, so they remain while a port sibling still needs them.
async function unregisterSite(host) {
  return withLifecycle(async () => {
    const matchHost = H.matchHostFor(host);
    const cfg = await getCfg();
    const removed = cfg.allowlist.filter((h) => h === host);
    cfg.allowlist = cfg.allowlist.filter((h) => h !== host);
    for (const h of removed) delete cfg.siteErrors[h];

    const siblingShares = cfg.allowlist.some((h) => H.matchHostFor(h) === matchHost);
    if (!siblingShares) delete cfg.pausedHosts[matchHost];
    await setCfg(cfg);

    if (!siblingShares) await unregisterContentScript(matchHost);
    await stopHostTabs(matchHost, cfg.allowlist);
    if (!siblingShares) {
      try {
        await chrome.permissions.remove({ origins: [H.matchPatternFor(matchHost)] });
      } catch (_e) {
        /* ignore */
      }
    }
    await deactivateSiteContexts(removed);
    await updateBadge();
  });
}

function permissionOriginForRelay(relayOrigin) {
  const u = new URL(relayOrigin);
  return `${u.origin}/*`;
}

function permissionExemptOrigins(cfg) {
  const origins = [];
  for (const remote of [cfg.remote, cfg.remotePending]) {
    if (!remote || !remote.relayOrigin) continue;
    try {
      origins.push(permissionOriginForRelay(remote.relayOrigin));
    } catch (_e) {
      /* invalid stale state cannot identify a permission origin */
    }
  }
  return origins;
}

function hasObservableSites(cfg) {
  return cfg.allowlist.some((host) => !cfg.pausedHosts[H.matchHostFor(host)]);
}

function entryMatchHosts(cfg) {
  return Object.fromEntries(cfg.allowlist.map((host) => [host, H.matchHostFor(host)]));
}

async function runReconcile() {
  return withLifecycle(async () => {
    const cfg = await getCfg();
    let granted = null;
    try {
      const perms = await chrome.permissions.getAll();
      granted = perms.origins || [];
    } catch (_e) {
      /* unknown grant state fails closed with no actions */
    }
    const manifestOrigins = chrome.runtime.getManifest().host_permissions || [];
    const actions = Reconcile.reconcile({
      granted,
      manifestOrigins,
      exemptOrigins: permissionExemptOrigins(cfg),
      allowlist: cfg.allowlist,
      pausedHosts: cfg.pausedHosts,
    });
    if (!actions.length) return actions;

    let siteStateChanged = false;
    for (const action of actions) {
      if (action.op === "pause") {
        cfg.pausedHosts[action.matchHost] = true;
        await setCfg(cfg);
        await unregisterContentScript(action.matchHost);
        await stopHostTabs(action.matchHost);
        await deactivateSiteContexts(action.entries);
        siteStateChanged = true;
      } else if (action.op === "resume") {
        delete cfg.pausedHosts[action.matchHost];
        await setCfg(cfg);
        try {
          await registerSite(action.entries[0]);
          siteStateChanged = true;
        } catch (e) {
          console.warn("[solstone] registerSite failed while resuming", action.matchHost, e);
          cfg.pausedHosts[action.matchHost] = true;
          await setCfg(cfg);
        }
      } else if (action.op === "release") {
        const current = await getCfg();
        const currentSites = new Set(current.allowlist.map((host) => H.matchPatternFor(host)));
        const currentExempt = new Set(permissionExemptOrigins(current));
        if (manifestOrigins.includes(action.origin) || currentSites.has(action.origin) || currentExempt.has(action.origin)) continue;
        try {
          await chrome.permissions.remove({ origins: [action.origin] });
        } catch (e) {
          console.warn("[solstone] could not release unused origin", action.origin, e);
        }
      }
    }
    if (siteStateChanged) await updateBadge();
    return actions;
  });
}

// ---- skim ingest -----------------------------------------------------------

function capLines(entry) {
  if (entry.lines.length > MAX_LINES) {
    entry.capped = true;
    entry.lines = [entry.lines[0]].concat(entry.lines.slice(-(MAX_LINES - 1)));
  }
}

async function markActive(ctx, site, tabId, meta) {
  if (!ctx) return;
  const cfg = await getCfg();
  if (!H.hostObservable(site, cfg.allowlist, cfg.pausedHosts)) return; // ignore unavailable hosts
  await withSeg(async () => {
    let seg = await getSeg();
    const day = Seg.dayKey(Date.now());
    if (!seg || seg.day !== day) seg = newSeg();
    const e = seg.ctxs[ctx] || (seg.ctxs[ctx] = { host: site, tabId, meta, snapshotWritten: false, lines: [], last: [] });
    e.host = site;
    e.tabId = tabId;
    e.meta = meta || e.meta;
    e.active = true;
    await setSeg(seg);
  });
}

async function markInactive(ctx) {
  await withSeg(async () => {
    const seg = await getSeg();
    if (seg && seg.ctxs[ctx]) {
      seg.ctxs[ctx].active = false;
      await setSeg(seg);
    }
  });
}

// A hard-closed tab (no pagehide fired) — finalize its contexts so they stop
// being re-snapshotted; their buffered lines flush on the next rotation.
async function markInactiveByTab(tabId) {
  await withSeg(async () => {
    const seg = await getSeg();
    if (!seg) return;
    let changed = false;
    for (const e of Object.values(seg.ctxs)) {
      if (e.tabId === tabId && e.active) {
        e.active = false;
        changed = true;
      }
    }
    if (changed) await setSeg(seg);
  });
}

async function handleSkim(ctx, site, tabId, meta, blocks) {
  if (!ctx) return;
  const cfg = await getCfg();
  if (cfg.paused) return;
  if (!H.hostObservable(site, cfg.allowlist, cfg.pausedHosts)) return; // only read available allowlisted host:port
  if (!isRemotePaired(cfg)) ensureRegistered().catch(() => {}); // lazy; upload retries if not ready
  await withSeg(async () => {
    let seg = await getSeg();
    const now = Date.now();
    const day = Seg.dayKey(now);
    if (!seg || seg.day !== day) {
      if (seg && hasLines(seg)) {
        const r = await flushSeg(seg, now);
        const next = newSeg(now);
        try {
          await commitFlushedTransition(next, r);
          await pruneSigs(next);
          await updateBadge();
          drainOutbox();
        } catch (e) {
          await recordHealth({ ok: false, status: 0, body: { error: String(e && e.message) } });
          return;
        }
      }
      seg = newSeg(now);
    }
    const rel = round1((now - seg.startMs) / 1000);
    const e = seg.ctxs[ctx] || (seg.ctxs[ctx] = { host: site, tabId, meta, snapshotWritten: false, lines: [], last: [] });
    e.host = site;
    e.tabId = tabId;
    e.meta = meta || e.meta;
    e.active = true;
    if (!e.snapshotWritten) {
      const line = Seg.snapshotLine(site, e.meta, blocks, now, rel);
      line.ctx = ctx;
      e.lines.push(line);
      e.snapshotWritten = true;
    } else {
      const diff = Seg.diffBlocks(e.last, blocks);
      if (diff.added.length || diff.updated.length || diff.removed.length) {
        for (const l of Seg.deltaLines(site, diff, now, rel)) {
          l.ctx = ctx;
          e.lines.push(l);
        }
      }
    }
    e.last = blocks;
    capLines(e);
    await setSeg(seg);
  });
}

function hasLines(seg) {
  return Object.values(seg.ctxs).some((e) => e.lines && e.lines.length);
}

// ---- rotation + upload -----------------------------------------------------

// Stable signature of a context's current snapshot (block ids + text) for idle detection.
function sigBlocks(blocks) {
  let s = "";
  for (const b of blocks || []) s += b.id + "|" + b.text + "\n";
  return globalThis.SolstoneBlocks.hashStr(s);
}

// Keep the idle-signature store bounded to contexts that are still live (in the
// given segment) — closed-tab contexts drop out here.
async function pruneSigs(seg) {
  const sigs = (await chrome.storage.local.get("sigs")).sigs || {};
  const live = {};
  for (const ctx of Object.keys(seg.ctxs)) if (ctx in sigs) live[ctx] = sigs[ctx];
  await chrome.storage.local.set({ sigs: live });
}

// Build + upload the segment. Idle rule (per context): a context whose buffer is
// just the snapshot (no deltas) AND whose snapshot is unchanged from the last one
// we uploaded is SKIPPED — so an idle page produces no segment at all. Surviving
// contexts are grouped by host into one file per host (rows carry their `ctx`).
// `force` (manual "send now") bypasses idle.
async function flushSeg(seg, now, force = false) {
  const sigs = (await chrome.storage.local.get("sigs")).sigs || {};
  const byHost = {}; // host -> concatenated lines (ctx-tagged)
  const nextSigs = {};
  for (const [ctx, e] of Object.entries(seg.ctxs)) {
    if (!e.lines || !e.lines.length) continue;
    const hasDeltas = e.lines.length > 1;
    const sig = sigBlocks(e.last);
    if (!force && !hasDeltas && sigs[ctx] === sig) continue; // idle context — skip
    (byHost[e.host] = byHost[e.host] || []).push(...e.lines);
    nextSigs[ctx] = sig;
  }
  const files = Object.entries(byHost).map(([host, lines]) => ({
    name: Seg.fileForSite(host),
    text: Seg.serializeJsonl(lines),
  }));
  if (!files.length) return { outcome: "empty", nextSigs: {} }; // fully idle — no segment created
  const duration = Math.max(1, Math.floor((now - seg.startMs) / 1000));
  const segment = Seg.segmentKey(seg.startMs, duration);
  const cfg0 = await getCfg();
  const meta = uploadMeta(cfg0);
  const entry = { day: seg.day, segment, files, meta };
  if (isRemotePaired(cfg0)) return { outcome: "queued", entry: Object.assign({ mode: "remote" }, entry), nextSigs };
  let cfg;
  try {
    cfg = await ensureRegistered();
  } catch (_e) {
    console.warn("[solstone] cannot upload segment — journal unreachable; queued in offline outbox");
    return { outcome: "queued", entry: Object.assign({ mode: "local" }, entry), nextSigs };
  }
  let res;
  try {
    res = await J.uploadSegment(cfg.journalUrl, cfg.key, { day: seg.day, segment, meta, files });
  } catch (e) {
    await recordHealth({ ok: false, status: 0, body: { error: String(e && e.message) } });
    return { outcome: "queued", entry: Object.assign({ mode: "local" }, entry), nextSigs };
  }
  await recordHealth(res);
  const delivered = !!(res && res.ok && !res.failed);
  console.log(`[solstone] segment ${seg.day}/${segment} -> ${delivered ? (res.duplicate ? "duplicate" : "stored") : "HTTP " + (res && res.status)}`);
  return delivered ? { outcome: "uploaded", nextSigs } : { outcome: "queued", entry: Object.assign({ mode: "local" }, entry), nextSigs };
}

function carryActiveContexts(seg, next, now) {
  // carry forward only still-active contexts, each re-opening with a snapshot;
  // inactive (closed-tab) contexts fall away here after their flush.
  for (const [ctx, e] of Object.entries(seg.ctxs)) {
    if (e.active && e.last && e.last.length) {
      const line = Seg.snapshotLine(e.host, e.meta, e.last, now, 0);
      line.ctx = ctx;
      next.ctxs[ctx] = {
        host: e.host,
        tabId: e.tabId,
        meta: e.meta,
        snapshotWritten: true,
        active: true,
        last: e.last,
        lines: [line],
      };
    }
  }
}

async function commitFlushedTransition(next, r) {
  const sigs = (await chrome.storage.local.get("sigs")).sigs || {};
  if (r && (r.outcome === "uploaded" || r.outcome === "queued")) Object.assign(sigs, r.nextSigs || {});
  if (r && r.entry) await OutboxStore.enqueue(r.entry);
  await chrome.storage.local.set({ seg: next, sigs });
}

async function recordHealth(res) {
  const cfg = await getCfg();
  const error = (res.body && (res.body.detail || res.body.error)) || null;
  const h = globalThis.SolstoneStatus.updateHealth(cfg.health, { ok: res.ok, status: res.status, error });
  if (res.ok) {
    h.lastUploadAt = Date.now();
    if (!res.duplicate) h.segmentsUploaded = (h.segmentsUploaded || 0) + 1;
  }
  cfg.health = h;
  await setCfg(cfg);
  await updateBadge(); // reflect connected/error on the icon
}

// Diagnostics beacon so the journal observer dashboard reads "connected"
// between uploads (mirrors the tmux/native observers' observe.status). Carries
// only the observer's own health — never observed content.
async function emitStatus() {
  const cfg = await getCfg();
  if (cfg.paused || !hasObservableSites(cfg)) return;
  if (isRemotePaired(cfg)) return;
  let c;
  try {
    c = await ensureRegistered();
  } catch (_e) {
    return; // journal unreachable — nothing to beacon to
  }
  const seg = await getSeg();
  const { summary } = await waitingSummary(seg);
  const siteErrs = Object.keys(c.siteErrors || {}).length;
  await J.relayEvent(c.journalUrl, c.key, "observe", "status", {
    host: c.hostname || "local",
    platform: "browser",
    name: c.stream,
    stream_type: "browser",
    version: VERSION,
    uptime: Math.floor((Date.now() - BOOT_MS) / 1000),
    last_successful_sync: c.health && c.health.lastUploadAt ? Math.floor(c.health.lastUploadAt / 1000) : null,
    pending_queue_depth: summary.waiting,
    recent_error_count: siteErrs + (c.health && c.health.lastError ? 1 : 0),
    last_error_reason: (c.health && c.health.lastError) || (siteErrs ? Object.values(c.siteErrors)[0] : null),
  });
}

async function rotateIfDue() {
  await withSeg(async () => {
    const seg = await getSeg();
    if (!seg) return;
    const cfg = await getCfg();
    const now = Date.now();
    if ((now - seg.startMs) / 1000 < cfg.segmentSec) return;
    const r = await flushSeg(seg, now);
    const next = newSeg(now);
    carryActiveContexts(seg, next, now);
    try {
      await commitFlushedTransition(next, r);
    } catch (e) {
      await recordHealth({ ok: false, status: 0, body: { error: String(e && e.message) } });
      return;
    }
    await pruneSigs(next);
    await updateBadge();
    drainOutbox();
  });
}

// Force an immediate upload of whatever is buffered (popup "flush now" / demo).
async function flushNow() {
  return withSeg(async () => {
    const seg = await getSeg();
    if (!seg) return { ok: true, outcome: "empty" };
    const now = Date.now();
    const r = await flushSeg(seg, now, true); // manual flush bypasses idle
    const next = newSeg(now);
    carryActiveContexts(seg, next, now);
    try {
      await commitFlushedTransition(next, r);
    } catch (e) {
      await recordHealth({ ok: false, status: 0, body: { error: String(e && e.message) } });
      return { ok: false, outcome: "failed" };
    }
    await pruneSigs(next);
    await updateBadge();
    drainOutbox();
    return { ok: r.outcome !== "failed", outcome: r.outcome || "empty" };
  });
}

async function markBackoff(entry, error) {
  const attempts = Math.max(0, Number(entry.attempts || 0)) + 1;
  await OutboxStore.setBackoff(entry, Date.now() + backoffMs(attempts), String((error && error.message) || error || "delivery failed"), attempts);
}

function recvRemoteFrame(ws, stage) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer = null;
    const settle = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };
    timer = setTimeout(() => settle(reject, new Error(`${stage} timed out after ${REMOTE_FRAME_TIMEOUT_MS}ms`)), REMOTE_FRAME_TIMEOUT_MS);
    ws.recvBinary().then((value) => settle(resolve, value), (error) => settle(reject, error));
  });
}

async function deliverLocalOutboxEntry(entry, cfg) {
  let c = cfg;
  try {
    c = c.key ? c : await ensureRegistered();
  } catch (e) {
    await markBackoff(entry, e);
    return false;
  }
  let res;
  try {
    res = await J.uploadSegment(c.journalUrl, c.key, { day: entry.day, segment: entry.segment, meta: entry.meta || uploadMeta(c), files: entry.files });
  } catch (e) {
    await recordHealth({ ok: false, status: 0, body: { error: String(e && e.message) } });
    await markBackoff(entry, e);
    return false;
  }
  await recordHealth(res);
  const delivered = !!(res && res.ok && !res.failed);
  if (!delivered) await markBackoff(entry, `HTTP ${res && res.status}`);
  return delivered;
}

async function deliverRemoteOutboxEntry(entry, cfg) {
  if (!isRemotePaired(cfg)) {
    await markBackoff(entry, "not paired");
    return false;
  }
  let ws = null;
  try {
    const ident = await Identity.ensureIdentity();
    const blobId = bytesFromHex(entry.blob_id);
    const instanceId16 = Uuid.bytesFromUuidString(cfg.remote.instanceId);
    const recipientSpki = fromB64url(cfg.remote.homeSpki);
    const plaintext = await RemoteBlob.packPlaintext(entry.files, {
      v: 1,
      day: entry.day,
      segment: entry.segment,
      host: (entry.meta && entry.meta.host) || cfg.hostname || "local",
      meta: entry.meta || uploadMeta(cfg),
    });
    const info = RemoteBlob.blobInfo(instanceId16, ident.senderFp);
    const ctLen = plaintext.byteLength + 16; // AES-GCM ciphertext is plaintext plus 16-byte tag.
    const offer = RemoteBlob.offerBytes({ senderFp: ident.senderFp, blobId, ctLen });
    const sealed = await RemoteBlob.sealBlob({
      recipientSpki,
      senderPrivateKey: ident.privateKey,
      senderPublicKey: ident.publicKey,
      info,
      aad: offer,
      plaintext,
    });
    if (sealed.ct.byteLength !== ctLen) throw new Error(`HPKE ct_len mismatch: expected ${ctLen}, got ${sealed.ct.byteLength}`);

    ws = await RemoteTunnel.dialData(cfg.remote.relayOrigin, cfg.remote.instanceId, cfg.remote.deviceToken);
    ws.sendBinary(offer);
    const ready = RemoteBlob.parseReady(await recvRemoteFrame(ws, "remote Ready"));
    if (!ready.ok) throw new Error(`relay rejected blob with status ${ready.status}`);
    RemoteTunnel.sendChunked(ws, concatBytes([sealed.enc, sealed.ct]));
    const ack = RemoteBlob.parseAck(await recvRemoteFrame(ws, "remote ACK"));
    const expected = await RemoteBlob.ackTag(sealed.kAck, ack.status, blobId);
    if (!bytesEqual(ack.blobId, blobId)) throw new Error("ACK blob_id mismatch");
    if (!bytesEqual(ack.tag, expected)) throw new Error("ACK tag mismatch");
    if (ack.status !== 0x00 && ack.status !== 0x01) throw new Error(`ACK retry status ${ack.status}`);
    await recordHealth({ ok: true, status: 200, body: null, duplicate: ack.status === 0x01 });
    return true;
  } catch (e) {
    await recordHealth({ ok: false, status: 0, body: { error: String(e && e.message) } });
    await markBackoff(entry, e);
    return false;
  } finally {
    if (ws) ws.close();
  }
}

async function drainOutbox() {
  if (draining) return;
  draining = true;
  try {
    while (true) {
      const entry = await OutboxStore.head();
      if (!entry) break;
      if (entry.nextAttemptAt && entry.nextAttemptAt > Date.now()) break;
      const cfg = await getCfg();
      const delivered = entry.mode === "remote" ? await deliverRemoteOutboxEntry(entry, cfg) : await deliverLocalOutboxEntry(entry, cfg);
      if (!delivered) break;
      await OutboxStore.removeHeadIf(entry);
      await updateBadge();
    }
  } finally {
    draining = false;
  }
}

async function probe() {
  const cfg = await getCfg();
  if (!cfg.key) {
    try {
      const c = await ensureRegistered();
      drainOutbox();
      return { ok: true, stream: c.stream };
    } catch (e) {
      return { ok: false, status: (e && e.status) || 0, error: String(e && e.message) };
    }
  }
  const day = Seg.dayKey(Date.now());
  const res = await J.checkConnection(cfg.journalUrl, cfg.key, day);
  const next = await getCfg();
  next.health = globalThis.SolstoneStatus.updateHealth(next.health, { ok: res.ok, status: res.status, error: res.ok ? null : res.error });
  await setCfg(next);
  await updateBadge();
  if (res.ok) drainOutbox();
  return { ok: res.ok, status: res.status, error: res.error, stream: cfg.stream };
}

// ---- pause + badge ---------------------------------------------------------

async function setPausedAll(paused) {
  const cfg = await getCfg();
  cfg.paused = paused;
  await setCfg(cfg);
  for (const host of cfg.allowlist) {
    try {
      const tabs = await chrome.tabs.query({ url: H.matchPatternFor(host) }); // port-safe: match patterns reject ports
      for (const tab of tabs) {
        if (tab.id != null) chrome.tabs.sendMessage(tab.id, { kind: "setPaused", paused }, () => void chrome.runtime.lastError);
      }
    } catch (_e) {
      /* ignore */
    }
  }
  await updateBadge();
}

async function setIndicatorAll(show) {
  const cfg = await getCfg();
  for (const host of cfg.allowlist) {
    try {
      const tabs = await chrome.tabs.query({ url: H.matchPatternFor(host) }); // port-safe: match patterns reject ports
      for (const tab of tabs) {
        if (tab.id != null) chrome.tabs.sendMessage(tab.id, { kind: "setIndicator", show, allowlist: cfg.allowlist }, () => void chrome.runtime.lastError);
      }
    } catch (_e) {
      /* ignore */
    }
  }
}

// Icon-as-status: swap the official sol ring-state marks (observing / paused /
// error) so the toolbar icon is a live status light, per the research synthesis.
const ICON_SET = (prefix) => ({
  16: `icons/${prefix}16.png`,
  48: `icons/${prefix}48.png`,
  128: `icons/${prefix}128.png`,
});

async function updateBadge() {
  const cfg = await getCfg();
  const seg = await getSeg();
  const { summary } = await waitingSummary(seg);
  const { prefix, title, badge } = globalThis.SolstoneStatus.iconState(
    Object.assign({}, cfg, { waiting: summary.waiting, dropped: summary.dropped }),
    entryMatchHosts(cfg),
  );
  try {
    await chrome.action.setIcon({ path: ICON_SET(prefix) });
    await chrome.action.setTitle({ title });
    await chrome.action.setBadgeText({ text: badge });
    if (badge) await chrome.action.setBadgeBackgroundColor({ color: "#9F2D2D" });
  } catch (_e) {
    /* action unavailable */
  }
}

// ---- remote pairing --------------------------------------------------------

async function verifyHomeIdentity(parsedLink, identityMsg) {
  const pkHSpki = fromB64url(identityMsg.pkH_spki);
  const caSpki = fromB64url(identityMsg.ca_spki);
  const sig = fromB64url(identityMsg.sig);
  const instanceId16 = Uuid.bytesFromUuidString(identityMsg.instance_id);
  const caFp = new Uint8Array(await crypto.subtle.digest("SHA-256", caSpki)).slice(0, 16);
  if (!bytesEqual(caFp, parsedLink.caFpSpki)) throw new Error("home CA fingerprint mismatch");
  const caKey = await crypto.subtle.importKey("spki", caSpki, { name: "ECDSA", namedCurve: "P-256" }, true, ["verify"]);
  const signed = concatBytes([new TextEncoder().encode("spl-pair-browser-v1"), pkHSpki, instanceId16]);
  const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, caKey, sig, signed);
  if (!ok) throw new Error("home identity signature invalid");
  return { pkHSpki, caSpki, instanceId16 };
}

async function pairRemote(link) {
  const cfg = await getCfg();
  const ident = await Identity.ensureIdentity();
  const parsed = Pairlink.parseLink(link);
  const rk = await Pairlink.deriveRK(parsed.SBytes);
  let ws = null;
  try {
    ws = await RemoteTunnel.dialPair(parsed.relayOrigin, hex(rk));
    const reader = ws.reader();
    ws.sendBinary(concatBytes([new TextEncoder().encode("SBP1"), Uint8Array.of(0x01)]));
    const identityMsg = JSON.parse(new TextDecoder().decode(await reader.readU32Frame()));
    if (!identityMsg.pkH_spki || !identityMsg.ca_spki || !identityMsg.instance_id || !identityMsg.sig) {
      throw new Error("pair identity missing required fields");
    }
    const verified = await verifyHomeIdentity(parsed, identityMsg);
    const hello = new TextEncoder().encode(JSON.stringify({
      S: b64url(parsed.SBytes),
      ext_pub_spki: b64url(ident.spki),
      device_label: cfg.hostname || "browser",
    }));
    const sealedHello = await RemoteBlob.sealBase({
      recipientSpki: verified.pkHSpki,
      info: verified.instanceId16,
      plaintext: hello,
    });
    ws.sendU32Frame(concatBytes([sealedHello.enc, sealedHello.ct]));
    const sealedReply = await reader.readU32Frame();
    if (sealedReply.byteLength < 66) throw new Error("sealed pair reply too short");
    const replyBytes = await RemoteBlob.openBaseSealed({
      recipientPrivateKey: ident.privateKey,
      recipientPublicKey: ident.publicKey,
      enc: sealedReply.slice(0, 65),
      info: verified.instanceId16,
      ct: sealedReply.slice(65),
    });
    const reply = JSON.parse(new TextDecoder().decode(replyBytes));
    if (reply.instance_id !== identityMsg.instance_id) throw new Error("pair reply instance mismatch");
    if (!reply.home_attestation) throw new Error("pair reply missing home_attestation");
    const enrolled = await J.enrollDevice(parsed.relayOrigin, { instance_id: reply.instance_id, home_attestation: reply.home_attestation });
    if (!enrolled.device_token) throw new Error("enroll response missing device_token");
    await withLifecycle(async () => {
      const next = await getCfg();
      next.remote = {
        instanceId: reply.instance_id,
        deviceToken: enrolled.device_token,
        homeSpki: identityMsg.pkH_spki,
        relayOrigin: parsed.relayOrigin,
        expiresAt: enrolled.expires_at || null,
        pairedAt: Date.now(),
      };
      next.remotePending = null;
      await setCfg(next);
    });
    drainOutbox();
    return { ok: true, instanceId: reply.instance_id };
  } finally {
    if (ws) ws.close();
  }
}

// ---- UI command router -----------------------------------------------------

async function handleCommand(msg, sendResponse) {
  try {
    switch (msg.cmd) {
      case "getState": {
        const cfg = await getCfg();
        const seg = await getSeg();
        const ctxs = seg ? Object.values(seg.ctxs) : [];
        const activeSites = [...new Set(ctxs.filter((e) => e.active).map((e) => e.host))];
        const activeContexts = ctxs.filter((e) => e.active).length;
        const pendingLines = ctxs.reduce((n, e) => n + (e.lines ? e.lines.length : 0), 0);
        const { summary, outboxInfo } = await waitingSummary(seg);
        sendResponse({
          ok: true,
          journalUrl: cfg.journalUrl,
          hostname: cfg.hostname,
          stream: cfg.stream,
          registered: !!cfg.key,
          segmentSec: cfg.segmentSec,
          paused: cfg.paused,
          showPageIndicator: cfg.showPageIndicator,
          allowlist: cfg.allowlist,
          pausedHosts: cfg.pausedHosts,
          siteErrors: cfg.siteErrors,
          activeSites,
          activeContexts,
          pendingLines,
          outbox: outboxInfo,
          dropped: summary.dropped,
          waiting: summary.waiting,
          health: cfg.health,
          remote: cfg.remote ? { paired: isRemotePaired(cfg), instanceId: cfg.remote.instanceId, relayOrigin: cfg.remote.relayOrigin } : { paired: false },
          version: VERSION,
        });
        break;
      }
      case "getBufferedPreview": {
        const seg = await getSeg();
        const { summary, outboxInfo, dropped } = await waitingSummary(seg);
        sendResponse({ ok: true, ...globalThis.SolstoneBuffered.summarize(seg), waiting: summary.waiting, outbox: outboxInfo, dropped });
        break;
      }
      case "clearDropped": {
        const cleared = await OutboxStore.clearDropped();
        await updateBadge();
        sendResponse({ ok: true, dropped: cleared });
        break;
      }
      case "siteGranted": {
        const err = await addSite(msg.host);
        sendResponse({ ok: !err, error: err || undefined });
        break;
      }
      case "siteIntent": {
        const added = await siteIntent(msg.host);
        sendResponse({ ok: true, added });
        break;
      }
      case "relayIntent":
        await relayIntent(msg.relayOrigin);
        sendResponse({ ok: true });
        break;
      case "relayIntentClear":
        await relayIntent(null);
        sendResponse({ ok: true });
        break;
      case "pairRemote": {
        try {
          sendResponse(await pairRemote(msg.link));
        } catch (e) {
          await relayIntent(null);
          sendResponse({ ok: false, error: String((e && e.message) || e || "pairing failed") });
        }
        break;
      }
      case "unpairRemote": {
        await withLifecycle(async () => {
          const cfg = await getCfg();
          cfg.remote = null;
          cfg.remotePending = null;
          await setCfg(cfg);
        });
        await updateBadge();
        sendResponse({ ok: true });
        break;
      }
      case "removeSite":
        await unregisterSite(msg.host);
        sendResponse({ ok: true });
        break;
      case "setPaused":
        await setPausedAll(!!msg.paused);
        sendResponse({ ok: true });
        break;
      case "setConfig": {
        const cfg = await getCfg();
        let reset = false;
        let indicatorChanged = false;
        if (typeof msg.hostname === "string" && msg.hostname !== cfg.hostname) {
          cfg.hostname = msg.hostname.trim();
          reset = true; // hostname changes the stream identity -> re-register
        }
        if (typeof msg.journalUrl === "string" && msg.journalUrl !== cfg.journalUrl) {
          cfg.journalUrl = msg.journalUrl.trim().replace(/\/+$/, "");
          reset = true;
        }
        if (typeof msg.segmentSec === "number" && msg.segmentSec >= 30) cfg.segmentSec = Math.floor(msg.segmentSec);
        if (typeof msg.showPageIndicator === "boolean" && msg.showPageIndicator !== cfg.showPageIndicator) {
          cfg.showPageIndicator = msg.showPageIndicator;
          indicatorChanged = true;
        }
        if (reset) {
          cfg.key = "";
          cfg.stream = "";
        }
        await setCfg(cfg);
        if (indicatorChanged) await setIndicatorAll(cfg.showPageIndicator);
        sendResponse({ ok: true });
        break;
      }
      case "registerNow":
        try {
          const cfg = await ensureRegistered();
          drainOutbox();
          sendResponse({ ok: true, stream: cfg.stream });
        } catch (e) {
          sendResponse({ ok: false, error: String(e && e.message) });
        }
        break;
      case "probe": {
        const r = await probe();
        sendResponse(r);
        break;
      }
      case "flushNow": {
        const r = await flushNow();
        sendResponse(r);
        break;
      }
      default:
        sendResponse({ ok: false, error: "unknown command" });
    }
  } catch (e) {
    sendResponse({ ok: false, error: String(e && e.message) });
  }
}

// ---- wiring ----------------------------------------------------------------

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return false;
  if (msg.cmd) {
    handleCommand(msg, sendResponse);
    return true; // async sendResponse
  }
  const tabId = sender && sender.tab ? sender.tab.id : undefined;
  switch (msg.kind) {
    case "hello":
      markActive(msg.ctx, msg.site, tabId, msg.meta);
      break;
    case "skim":
      handleSkim(msg.ctx, msg.site, tabId, msg.meta, msg.blocks || []);
      break;
    case "bye":
      markInactive(msg.ctx);
      break;
    case "error":
      console.warn("[solstone] content error", msg.site, msg.reason);
      break;
  }
  return false;
});

// A hard-closed tab (no pagehide) — finalize its contexts cleanly.
chrome.tabs.onRemoved.addListener((tabId) => {
  markInactiveByTab(tabId);
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ROTATE_ALARM) {
    rotateIfDue().then(() => drainOutbox()).catch((e) => console.warn("[solstone] rotation failed", e));
    runReconcile().then(() => emitStatus()).catch((e) => console.warn("[solstone] reconciliation failed", e));
  }
});

chrome.permissions.onRemoved.addListener(() => {
  runReconcile().catch((e) => console.warn("[solstone] reconciliation failed after permission removal", e));
});

chrome.permissions.onAdded.addListener(() => {
  runReconcile().catch((e) => console.warn("[solstone] reconciliation failed after permission addition", e));
});

async function migrateOutboxV1() {
  if (await DB.get("meta", "migratedOutboxV1")) return;
  const legacy = await chrome.storage.local.get(["outbox", "dropped"]);
  const entries = Array.isArray(legacy.outbox) ? legacy.outbox : [];
  for (const entry of entries) await OutboxStore.enqueue(Object.assign({ mode: "local" }, entry));
  const oldDropped = normalizeDropped(legacy.dropped);
  if (oldDropped.segments || oldDropped.lines) {
    const current = await OutboxStore.getDropped();
    await OutboxStore.setDropped({
      segments: current.segments + oldDropped.segments,
      lines: current.lines + oldDropped.lines,
    });
  }
  await DB.put("meta", true, "migratedOutboxV1");
  if ("outbox" in legacy || "dropped" in legacy) await chrome.storage.local.remove(["outbox", "dropped"]);
}

async function init() {
  await chrome.alarms.create(ROTATE_ALARM, { periodInMinutes: 1 });
  await migrateOutboxV1();
  await runReconcile();
  // Re-assert one content-script registration per available hostname so file-list
  // changes take effect even though registrations persist across sessions.
  await withLifecycle(async () => {
    const cfg = await getCfg();
    const registeredHosts = new Set();
    for (const host of cfg.allowlist) {
      const matchHost = H.matchHostFor(host);
      if (cfg.pausedHosts[matchHost] || registeredHosts.has(matchHost)) continue;
      registeredHosts.add(matchHost);
      try {
        await registerSite(host);
      } catch (e) {
        console.warn("[solstone] registerSite re-assertion failed for", matchHost, e);
      }
    }
  });
  await updateBadge();
}

chrome.runtime.onInstalled.addListener(init);
chrome.runtime.onStartup.addListener(init);
