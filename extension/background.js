// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc
//
// background.js — the MV3 service worker. It is the persistent (event-driven)
// half of the observer: it holds the journal registration, buffers each tab's
// skims into a 5-minute segment in chrome.storage, rotates + uploads segments
// via chrome.alarms, and owns the opt-in per-site lifecycle (grant -> register
// a content script -> observe; revoke -> tear down). All segment / diff / JSONL
// work is delegated to lib/segment.js so it stays pure and tested.
//
// Why the worker can be the observer (no separate native host for the Chrome
// desktop spike): the journal already runs on the same machine and exposes a
// localhost ingest API that does segmentation-on-receipt. The worker registers
// as its own observer and uploads finished segments directly. MV3 ephemerality
// is handled by persisting all state to chrome.storage and waking on alarms.

importScripts("lib/blocks.js", "lib/hosts.js", "lib/segment.js", "lib/status.js", "journal.js");

const Seg = globalThis.SolstoneSegment;
const H = globalThis.SolstoneHosts;
const J = globalThis.SolstoneJournal;
const VERSION = "0.0.9";
const BOOT_MS = Date.now();

const CONTENT_SCRIPT_FILES = ["lib/blocks.js", "lib/hosts.js", "adapters.js", "skim.js", "indicator.js", "content.js"];
const ROTATE_ALARM = "rotate";
const MAX_LINES = 4000; // per-site per-segment safety cap

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
  siteErrors: {}, // host -> last registration/observe error string
  health: { lastError: null, lastUploadAt: null, segmentsUploaded: 0, lastStatus: null },
};

// ---- storage helpers -------------------------------------------------------

async function getCfg() {
  const r = await chrome.storage.local.get("cfg");
  return Object.assign({}, DEFAULT_CFG, r.cfg || {}, {
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

function newSeg(now) {
  const ms = now || Date.now();
  // ctxs: keyed by a content-minted context id (one per observed tab/page load),
  // each { host, tabId, meta, snapshotWritten, active, lines, last }.
  return { startMs: ms, day: Seg.dayKey(ms), ctxs: {} };
}
function round1(x) {
  return Math.round(x * 10) / 10;
}

// Serialize all segment read-modify-write through one chain to avoid races
// between concurrent content-script messages.
let segChain = Promise.resolve();
function withSeg(fn) {
  segChain = segChain.then(fn, fn);
  return segChain;
}

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
    next.health = Object.assign({}, next.health, { lastError: null });
    await setCfg(next);
    console.log(`[solstone] registered as ${res.name} (${res.prefix}…)`);
    return next;
  })();
  try {
    return await registering;
  } catch (e) {
    const next = await getCfg();
    next.health = Object.assign({}, next.health, { lastError: String(e && e.message) });
    await setCfg(next);
    console.warn("[solstone] registration failed:", e);
    throw e;
  } finally {
    registering = null;
  }
}

// ---- per-site lifecycle ----------------------------------------------------

function hostFromOrigin(origin) {
  const m = /^\*?:?\/\/(?:\*\.)?([^/*]+)/.exec(origin) || /^https?:\/\/([^/]+)/.exec(origin);
  return m ? m[1] : null;
}

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

async function addSite(host) {
  const cfg = await getCfg();
  if (!cfg.allowlist.includes(host)) cfg.allowlist.push(host);
  try {
    await registerSite(host);
    delete cfg.siteErrors[host];
  } catch (e) {
    cfg.siteErrors[host] = String((e && e.message) || e) || "could not observe this site";
    console.warn("[solstone] registerSite failed for", host, e);
  }
  await setCfg(cfg);
  await updateBadge();
  return cfg.siteErrors[host] || null;
}

// Remove a site. `byHostname` (used by the browser-side revoke handler) removes
// every allowlist entry sharing the host's hostname; otherwise just the exact
// entry. The shared content script is unregistered only when no sibling entry
// still needs that hostname.
async function unregisterSite(host, { removePerm = true, byHostname = false } = {}) {
  const matchHost = H.matchHostFor(host);
  const cfg = await getCfg();
  const removed = cfg.allowlist.filter((h) => (byHostname ? H.matchHostFor(h) === matchHost : h === host));
  cfg.allowlist = cfg.allowlist.filter((h) => !removed.includes(h));
  for (const h of removed) delete cfg.siteErrors[h];

  const siblingShares = cfg.allowlist.some((h) => H.matchHostFor(h) === matchHost);
  if (!siblingShares) {
    try {
      await chrome.scripting.unregisterContentScripts({ ids: ["cs-" + matchHost] });
    } catch (_e) {
      /* already gone */
    }
  }
  await setCfg(cfg);

  // Halt live tabs on the removed host(s).
  try {
    const tabs = await chrome.tabs.query({ url: H.matchPatternFor(host) });
    for (const tab of tabs) {
      if (tab.id != null) chrome.tabs.sendMessage(tab.id, { kind: "stop" }, () => void chrome.runtime.lastError);
    }
  } catch (_e) {
    /* ignore */
  }
  if (removePerm && !siblingShares) {
    try {
      await chrome.permissions.remove({ origins: [H.matchPatternFor(host)] });
    } catch (_e) {
      /* ignore */
    }
  }
  await withSeg(async () => {
    const seg = await getSeg();
    let changed = false;
    if (seg) {
      for (const e of Object.values(seg.ctxs)) {
        if (removed.includes(e.host) && e.active) {
          e.active = false;
          changed = true;
        }
      }
    }
    if (changed) await setSeg(seg);
  });
  await updateBadge();
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
  if (!H.hostAllowed(site, cfg.allowlist)) return; // ignore non-allowlisted hosts
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
  if (!H.hostAllowed(site, cfg.allowlist)) return; // only observe allowlisted host:port
  ensureRegistered().catch(() => {}); // lazy; upload retries if not ready
  await withSeg(async () => {
    let seg = await getSeg();
    const now = Date.now();
    const day = Seg.dayKey(now);
    if (!seg || seg.day !== day) {
      if (seg && hasLines(seg)) await flushSeg(seg, now);
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
// `force` (manual "send buffered now") bypasses idle.
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
  if (!files.length) return; // fully idle — no segment created
  let cfg;
  try {
    cfg = await ensureRegistered();
  } catch (_e) {
    console.warn("[solstone] cannot upload segment — journal unreachable; segment dropped");
    return;
  }
  const duration = Math.max(1, Math.floor((now - seg.startMs) / 1000));
  const segment = Seg.segmentKey(seg.startMs, duration);
  const meta = { host: cfg.hostname || "local", platform: "browser", stream: cfg.stream, observer: cfg.stream };
  let res;
  try {
    res = await J.uploadSegment(cfg.journalUrl, cfg.key, { day: seg.day, segment, meta, files });
  } catch (e) {
    await recordHealth({ ok: false, status: 0, body: { error: String(e && e.message) } });
    return;
  }
  await recordHealth(res);
  if (res.ok && !res.failed) {
    Object.assign(sigs, nextSigs);
    await chrome.storage.local.set({ sigs });
  }
  console.log(`[solstone] segment ${seg.day}/${segment} -> ${res.ok ? (res.duplicate ? "duplicate" : "stored") : "HTTP " + res.status}`);
}

async function recordHealth(res) {
  const cfg = await getCfg();
  const h = Object.assign({}, cfg.health);
  h.lastStatus = res.status;
  if (res.ok) {
    h.lastUploadAt = Date.now();
    if (!res.duplicate) h.segmentsUploaded = (h.segmentsUploaded || 0) + 1;
    h.lastError = null;
  } else {
    h.lastError = (res.body && (res.body.detail || res.body.error)) || `HTTP ${res.status}`;
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
  if (cfg.paused || !cfg.allowlist.length) return;
  let c;
  try {
    c = await ensureRegistered();
  } catch (_e) {
    return; // journal unreachable — nothing to beacon to
  }
  const seg = await getSeg();
  const pending = seg ? Object.values(seg.ctxs).reduce((n, e) => n + (e.lines ? e.lines.length : 0), 0) : 0;
  const siteErrs = Object.keys(c.siteErrors || {}).length;
  await J.relayEvent(c.journalUrl, c.key, "observe", "status", {
    host: c.hostname || "local",
    platform: "browser",
    name: c.stream,
    stream_type: "browser",
    version: VERSION,
    uptime: Math.floor((Date.now() - BOOT_MS) / 1000),
    last_successful_sync: c.health && c.health.lastUploadAt ? Math.floor(c.health.lastUploadAt / 1000) : null,
    pending_queue_depth: pending,
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
    await flushSeg(seg, now);
    const next = newSeg(now);
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
    await setSeg(next);
    await pruneSigs(next);
  });
}

// Force an immediate upload of whatever is buffered (popup "flush now" / demo).
async function flushNow() {
  await withSeg(async () => {
    const seg = await getSeg();
    if (!seg) return;
    const now = Date.now();
    await flushSeg(seg, now, true); // manual flush bypasses idle
    const next = newSeg(now);
    for (const [ctx, e] of Object.entries(seg.ctxs)) {
      if (e.active && e.last && e.last.length) {
        const line = Seg.snapshotLine(e.host, e.meta, e.last, now, 0);
        line.ctx = ctx;
        next.ctxs[ctx] = { host: e.host, tabId: e.tabId, meta: e.meta, snapshotWritten: true, active: true, last: e.last, lines: [line] };
      }
    }
    await setSeg(next);
    await pruneSigs(next);
  });
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
  const { prefix, title, badge } = globalThis.SolstoneStatus.iconState(cfg);
  try {
    await chrome.action.setIcon({ path: ICON_SET(prefix) });
    await chrome.action.setTitle({ title });
    await chrome.action.setBadgeText({ text: badge });
    if (badge) await chrome.action.setBadgeBackgroundColor({ color: "#9F2D2D" });
  } catch (_e) {
    /* action unavailable */
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
          siteErrors: cfg.siteErrors,
          activeSites,
          activeContexts,
          pendingLines,
          health: cfg.health,
          version: VERSION,
        });
        break;
      }
      case "siteGranted": {
        const err = await addSite(msg.host);
        sendResponse({ ok: !err, error: err || undefined });
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
          sendResponse({ ok: true, stream: cfg.stream });
        } catch (e) {
          sendResponse({ ok: false, error: String(e && e.message) });
        }
        break;
      case "flushNow":
        await flushNow();
        sendResponse({ ok: true });
        break;
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
    rotateIfDue();
    emitStatus();
  }
});

chrome.permissions.onRemoved.addListener(async (perms) => {
  for (const o of perms.origins || []) {
    const host = hostFromOrigin(o);
    if (host) await unregisterSite(host, { removePerm: false, byHostname: true });
  }
});

async function init() {
  await chrome.alarms.create(ROTATE_ALARM, { periodInMinutes: 1 });
  // Re-assert content-script registrations for the allowlist (idempotent).
  const cfg = await getCfg();
  for (const host of cfg.allowlist) {
    try {
      const granted = await chrome.permissions.contains({ origins: [`*://${host}/*`] });
      if (granted) await registerSite(host);
      else cfg.allowlist = cfg.allowlist.filter((h) => h !== host);
    } catch (_e) {
      /* ignore */
    }
  }
  await setCfg(cfg);
  await updateBadge();
}

chrome.runtime.onInstalled.addListener(init);
chrome.runtime.onStartup.addListener(init);
