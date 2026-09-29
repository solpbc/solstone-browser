// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

(function () {
  "use strict";

  const A = globalThis.SolstoneAdapters;
  const Skim = globalThis.SolstoneSkim;
  const Indicator = globalThis.SolstoneIndicator;
  const Gate = globalThis.SolstoneCaptureGate;

  const realmTokenBytes = new Uint8Array(16);
  crypto.getRandomValues(realmTokenBytes);
  const REALM_TOKEN = [...realmTokenBytes].map((b) => b.toString(16).padStart(2, "0")).join("");

  const DEBOUNCE_MS = 500;

  let lease = null;
  let paused = false;
  let consentVersion = 0;
  let originGranted = false;
  let showIndicator = false;
  let hostCapture = "unavailable";
  let phase = "closed-start";
  let adapter = null;
  let observer = null;
  let debounceTimer = null;
  let rootEl = null;
  let started = false;

  function now() {
    return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
  }

  function getDecision() {
    return Gate.computeDecision({
      lease,
      paused,
      consentVersion,
      originGranted,
      hostCapture,
      phase,
      now: now(),
    });
  }

  function getHooks() {
    return {
      discover: () => {
        if (!adapter) adapter = A.adapterForHost(location.host);
        return A.pickRoot(adapter, document);
      },
      readMeta: () => {
        if (!adapter) adapter = A.adapterForHost(location.host);
        return {
          title: document.title,
          adapter: adapter.name,
        };
      },
      skim: (targetRoot) => {
        if (!adapter) adapter = A.adapterForHost(location.host);
        return Skim.skim(targetRoot, adapter);
      },
    };
  }

  function send(msg) {
    try {
      chrome.runtime.sendMessage(Object.assign({ realmToken: REALM_TOKEN }, msg), () => void chrome.runtime.lastError);
    } catch (_e) {
      /* worker asleep / context invalidated */
    }
  }

  function doSkim(reason) {
    const decision = getDecision();
    const executed = Gate.runIfPermitted(decision, {
      readMeta: getHooks().readMeta,
      skim: () => {
        if (!rootEl) {
          if (!adapter) adapter = A.adapterForHost(location.host);
          rootEl = A.pickRoot(adapter, document);
        }
        if (!rootEl) return null;
        return Skim.skim(rootEl, adapter);
      },
    });

    if (!executed || !executed.blocks) return;
    send({ kind: "skim", reason, meta: executed.meta, blocks: executed.blocks });
  }

  function scheduleSkim() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (typeof requestIdleCallback === "function") {
        requestIdleCallback(() => {
          doSkim("change");
        }, { timeout: 1000 });
      } else {
        doSkim("change");
      }
    }, DEBOUNCE_MS);
  }

  function startObserving() {
    const decision = getDecision();
    const discovered = Gate.runIfPermitted(decision, {
      discover: getHooks().discover,
    });
    if (!discovered || !discovered.root) return;
    rootEl = discovered.root;

    if (observer) observer.disconnect();
    observer = new MutationObserver(scheduleSkim);
    observer.observe(rootEl, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["aria-label", "aria-level", "role"],
    });

    if (showIndicator) Indicator.show(false);
    doSkim("initial");
  }

  function stopObserving() {
    if (observer) observer.disconnect();
    observer = null;
    clearTimeout(debounceTimer);
  }

  function handleLeaseUpdate(newLease, newPaused, newConsentVersion, grantedOriginsList, newShowIndicator, newHostCapture) {
    if (newLease) {
      lease = {
        token: newLease.token,
        generation: newLease.generation,
        freshnessMs: newLease.freshnessMs,
        receivedAt: now(),
      };
    } else {
      lease = null;
    }
    if (typeof newPaused === "boolean") paused = newPaused;
    if (typeof newConsentVersion === "number") consentVersion = newConsentVersion;
    originGranted = Array.isArray(grantedOriginsList) && grantedOriginsList.includes(location.origin);
    if (typeof newShowIndicator === "boolean") showIndicator = newShowIndicator;
    if (typeof newHostCapture === "string") hostCapture = newHostCapture;

    phase = "running";

    const decision = getDecision();
    if (decision.open) {
      if (!observer && !rootEl) waitForRoot();
      else if (!observer && rootEl) startObserving();
    } else {
      stopObserving();
      if (showIndicator && paused) Indicator.show(true);
      else if (!showIndicator) Indicator.remove();
    }
  }

  function waitForRoot() {
    let tries = 0;
    let iv = null;
    iv = setInterval(() => {
      tries++;
      const decision = getDecision();
      const discovered = Gate.runIfPermitted(decision, {
        discover: getHooks().discover,
      });
      const r = discovered && discovered.root;
      const ready = r && (r.tagName !== "BODY" || r.children.length > 0);
      if (ready) {
        if (iv !== null) clearInterval(iv);
        rootEl = r;
        startObserving();
      } else if (tries > 40 || !decision.open) {
        if (iv !== null) clearInterval(iv);
      }
    }, 500);
  }

  function boot() {
    if (started) return;
    started = true;
    try {
      chrome.runtime.sendMessage({ kind: "hello", realmToken: REALM_TOKEN }, (response) => {
        if (!response || !response.ok) return;
        handleLeaseUpdate(
          response.lease,
          response.paused,
          response.consentVersion,
          response.grantedOrigins,
          response.showPageIndicator,
          response.hostCapture
        );
      });
    } catch (_e) {
      /* ignore */
    }
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || !sender) return false;
    if (sender.id !== chrome.runtime.id || sender.tab) return false;

    if (msg.kind === "leaseUpdate") {
      handleLeaseUpdate(msg.lease, msg.paused, msg.consentVersion, msg.grantedOrigins, msg.showIndicator, msg.hostCapture);
    } else if (msg.kind === "setPaused") {
      paused = !!msg.paused;
      const decision = getDecision();
      if (decision.open) startObserving();
      else stopObserving();
      if (showIndicator) Indicator.show(paused);
    } else if (msg.kind === "resnapshot") {
      doSkim("change");
    } else if (msg.kind === "stop") {
      stopObserving();
      Indicator.remove();
    } else if (msg.kind === "setIndicator") {
      showIndicator = !!msg.show;
      if (showIndicator) Indicator.show(paused);
      else Indicator.remove();
    } else if (msg.kind === "ping") {
      sendResponse({ ok: true });
    }
    return false;
  });

  function flush(reason) {
    doSkim(reason);
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush("hidden");
    else if (rootEl) doSkim("visible");
    else startObserving();
  });

  window.addEventListener("freeze", () => flush("freeze"), { capture: true });
  window.addEventListener("resume", () => {
    doSkim("resume");
  }, { capture: true });
  window.addEventListener("pageshow", (e) => {
    if (e.persisted) {
      doSkim("bfcache-restore");
    }
  });

  window.addEventListener("pagehide", () => {
    flush("pagehide");
    send({ kind: "bye" });
  }, { once: true });

  if (document.readyState === "complete" || document.readyState === "interactive") boot();
  else window.addEventListener("DOMContentLoaded", boot, { once: true });
})();
