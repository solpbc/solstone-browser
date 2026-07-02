// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

(function () {
  "use strict";

  function iconState(cfg) {
    cfg = cfg || {};
    const sites = (cfg.allowlist || []).length;
    const observing = sites > 0 && !cfg.paused;
    const health = cfg.health || {};
    const siteErrs = cfg.siteErrors || {};
    const siteErrKeys = Object.keys(siteErrs);
    const connected = !!cfg.key && !health.lastError;
    const waiting = Math.max(0, Number(cfg.waiting || 0));
    const dropped = cfg.dropped || {};
    const badge = "";
    const waitingSuffix = waiting > 0 ? ` — ${waiting} update${waiting > 1 ? "s" : ""} waiting to sync` : "";

    if (!observing) {
      if (sites === 0) return { prefix: "icon-paused-", title: "solstone — add a site to begin", badge };
      return { prefix: "icon-paused-", title: "solstone — paused", badge };
    }

    if ((dropped.segments || 0) > 0) {
      return { prefix: "icon-error-", title: "solstone — some observations couldn't be kept — open settings", badge: "!" };
    }

    if (siteErrKeys.length) {
      return { prefix: "icon-error-", title: "solstone — " + (siteErrs[siteErrKeys[0]] || "needs attention"), badge: "!" };
    }

    const n = sites;
    const label = `observing ${n} site${n > 1 ? "s" : ""}`;
    if (!connected) {
      return {
        prefix: "icon-half-",
        title: `solstone — ${label} · ${cfg.key ? "can't reach your journal" : "connecting to your journal"}${waitingSuffix}`,
        badge,
      };
    }

    return { prefix: "icon", title: `solstone — ${label} · connected`, badge };
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

  globalThis.SolstoneStatus = { iconState, updateHealth };
})();
