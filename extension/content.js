// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc
//
// content.js — the per-tab observer. Runs in every granted-origin frame. It
// picks the adapter, shows the on-page indicator, skims the visible content,
// and relays the current block list to the service worker on load and whenever
// the page settles after a change. All segmenting / diffing / upload lives in
// the worker; this stays a thin, change-gated producer.
//
// Loaded after blocks.js, adapters.js, skim.js, indicator.js (see the
// registered content-script `js` order in background.js).

(function () {
  "use strict";

  const A = globalThis.SolstoneAdapters;
  const Skim = globalThis.SolstoneSkim;
  const Indicator = globalThis.SolstoneIndicator;

  const host = location.host;
  const adapter = A.adapterForHost(host);
  const DEBOUNCE_MS = 500;
  // A stable context id for THIS page instance (this tab's this load). Unique per
  // page so two tabs of the same host never collide, and a reload starts a fresh
  // context. The worker keys diff-state by this and tags every line with it.
  const CTX = "c" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

  let paused = false;
  let observer = null;
  let debounceTimer = null;
  let rootEl = null;
  let started = false;

  function meta() {
    return { url: location.href, title: document.title, adapter: adapter.name };
  }

  function send(msg) {
    try {
      chrome.runtime.sendMessage(Object.assign({ site: host, ctx: CTX }, msg), () => void chrome.runtime.lastError);
    } catch (_e) {
      // worker asleep / context invalidated — next settle will retry
    }
  }

  function doSkim(reason) {
    if (paused || !rootEl) return;
    let blocks;
    try {
      blocks = Skim.skim(rootEl, adapter);
    } catch (e) {
      send({ kind: "error", reason: String(e && e.message) });
      return;
    }
    send({ kind: "skim", reason, meta: meta(), blocks });
  }

  function scheduleSkim() {
    if (paused) return;
    clearTimeout(debounceTimer);
    // requestIdleCallback keeps the reflow that innerText forces off the hot path
    debounceTimer = setTimeout(() => {
      if (typeof requestIdleCallback === "function") requestIdleCallback(() => doSkim("change"), { timeout: 1000 });
      else doSkim("change");
    }, DEBOUNCE_MS);
  }

  function startObserving() {
    if (paused) return;
    rootEl = A.pickRoot(adapter, document);
    if (!rootEl) return;
    if (observer) observer.disconnect();
    observer = new MutationObserver(scheduleSkim);
    observer.observe(rootEl, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["aria-label", "aria-level", "role"] });
    Indicator.show(false);
    doSkim("initial");
  }

  function stopObserving() {
    if (observer) observer.disconnect();
    observer = null;
    clearTimeout(debounceTimer);
  }

  function setPaused(p) {
    paused = p;
    if (paused) {
      stopObserving();
      Indicator.show(true);
    } else {
      startObserving();
    }
  }

  // Boot: self-gate against the allowlist (the content script is registered for
  // the port-less hostname, so a tab at a non-allowlisted host:port must stay
  // dormant), then announce, learn the paused state, and wait for the SPA root.
  function boot() {
    if (started) return;
    started = true;
    try {
      chrome.storage.local.get("cfg", (r) => {
        const cfg = (r && r.cfg) || {};
        const allow = cfg.allowlist || [];
        const Hosts = globalThis.SolstoneHosts;
        if (Hosts && !Hosts.hostAllowed(location.host, allow)) {
          return; // this exact host:port isn't observed — no indicator, no skim
        }
        paused = !!cfg.paused;
        send({ kind: "hello", meta: meta() });
        Indicator.show(paused);
        waitForRoot();
      });
    } catch (_e) {
      // storage unavailable — fail closed (do not observe)
    }
  }

  // SPAs mount their content root after load; poll briefly for it.
  function waitForRoot() {
    let tries = 0;
    const iv = setInterval(() => {
      tries++;
      const r = A.pickRoot(adapter, document);
      const ready = r && (r.tagName !== "BODY" || r.children.length > 0);
      if (ready) {
        clearInterval(iv);
        if (!paused) startObserving();
        else Indicator.show(true);
      } else if (tries > 40) {
        clearInterval(iv); // ~20s; give up quietly, leave indicator
      }
    }, 500);
  }

  // Worker -> content messages (pause toggle, resnapshot nudge).
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg) return;
    if (msg.kind === "setPaused") setPaused(!!msg.paused);
    else if (msg.kind === "resnapshot") doSkim("segment-rotate");
    else if (msg.kind === "stop") {
      stopObserving();
      Indicator.remove();
    } else if (msg.kind === "ping") sendResponse({ ok: true, host, adapter: adapter.name });
    return false;
  });

  // Page Lifecycle resilience (per the research synthesis): flush a final skim
  // before the tab is hidden/frozen so the worker buffers the latest before any
  // freeze/discard; re-skim on resume / bfcache-restore. These are the reliable
  // signals — never `unload`/`beforeunload` (deprecated + break bfcache).
  function flush(reason) {
    if (!paused && rootEl) doSkim(reason);
  }
  document.addEventListener("visibilitychange", () => {
    if (paused) return;
    if (document.visibilityState === "hidden") flush("hidden");
    else if (rootEl) doSkim("visible");
    else startObserving();
  });
  window.addEventListener("freeze", () => flush("freeze"), { capture: true });
  window.addEventListener("resume", () => { if (!paused) doSkim("resume"); }, { capture: true });
  window.addEventListener("pageshow", (e) => { if (e.persisted && !paused) doSkim("bfcache-restore"); });

  window.addEventListener("pagehide", () => { flush("pagehide"); send({ kind: "bye" }); }, { once: true });

  if (document.readyState === "complete" || document.readyState === "interactive") boot();
  else window.addEventListener("DOMContentLoaded", boot, { once: true });
})();
