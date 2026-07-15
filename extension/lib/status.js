// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

(function () {
  "use strict";

  function iconState(cfg, entryMatchHosts) {
    cfg = cfg || {};
    entryMatchHosts = entryMatchHosts || {};
    const allowlist = cfg.allowlist || [];
    const totalSites = allowlist.length;
    const pausedHosts = cfg.pausedHosts || {};
    const sites = allowlist.filter((entry) => !pausedHosts[entryMatchHosts[entry] || entry]).length;
    const observing = sites > 0 && !cfg.paused;
    const health = cfg.health || {};
    const siteErrs = cfg.siteErrors || {};
    const siteErrKeys = Object.keys(siteErrs);
    const connected = !!cfg.key && !health.lastError;
    const waiting = Math.max(0, Number(cfg.waiting || 0));
    const dropped = cfg.dropped || {};
    const badge = "";
    const waitingSuffix = waiting > 0 ? ` — ${waiting} update${waiting > 1 ? "s" : ""} waiting to sync` : "";

    if (totalSites === 0) return { prefix: "icon-paused-", title: "sol — add a site to begin", badge };
    if (sites === 0) {
      return { prefix: "icon-paused-", title: "sol — paused by browser — allow again in settings", badge };
    }
    if (!observing) {
      return { prefix: "icon-paused-", title: "sol — paused", badge };
    }

    if ((dropped.segments || 0) > 0) {
      return { prefix: "icon-error-", title: "sol — some updates couldn't be kept — open settings", badge: "!" };
    }

    if (siteErrKeys.length) {
      return { prefix: "icon-error-", title: "sol — " + (siteErrs[siteErrKeys[0]] || "needs attention"), badge: "!" };
    }

    const n = sites;
    const label = `on ${n} site${n > 1 ? "s" : ""}`;
    if (!connected) {
      return {
        prefix: "icon-half-",
        title: `sol — ${label} · ${cfg.key ? "can't reach your journal" : "connecting to your journal"}${waitingSuffix}`,
        badge,
      };
    }

    return { prefix: "icon", title: `sol — ${label} · connected`, badge };
  }

  function siteRowState(entry, state) {
    state = state || {};
    const siteErrors = state.siteErrors || {};
    if (siteErrors[entry]) return { kind: "error", label: siteErrors[entry] };
    if ((state.pausedHosts || {})[state.matchHost]) return { kind: "paused-browser", label: "paused by browser" };
    if (state.paused) return { kind: "paused", label: "paused" };
    const active = (state.activeSites || []).includes(entry);
    if (active && state.connected) return { kind: "on", label: "on now" };
    if (active) return { kind: "waiting", label: "on — waiting to sync" };
    if (entry === state.pageHost) return { kind: "reload", label: "reload this tab to begin" };
    return { kind: "idle", label: "added — open or reload a tab" };
  }

  function updateHealth(prev, res) {
    const h = Object.assign({}, prev || {});
    if (typeof res.status !== "undefined") h.lastStatus = res.status;
    if (res.ok) {
      h.lastError = null;
      h.consecutiveFailures = 0;
    } else {
      h.lastError = res.error || `HTTP ${res.status}`;
      h.consecutiveFailures = (h.consecutiveFailures || 0) + 1;
    }
    return h;
  }

  globalThis.SolstoneStatus = { iconState, siteRowState, updateHealth };
})();
