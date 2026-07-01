// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

(function () {
  "use strict";

  function iconState(cfg) {
    cfg = cfg || {};
    const sites = (cfg.allowlist || []).length;
    const observing = sites > 0 && !cfg.paused;
    const siteErrs = cfg.siteErrors || {};
    const siteErrKeys = Object.keys(siteErrs);
    const connected = !!cfg.key && !((cfg.health || {}).lastError);
    const badge = "";

    if (!observing) {
      if (sites === 0) return { prefix: "icon-paused-", title: "solstone — add a site to begin", badge };
      return { prefix: "icon-paused-", title: "solstone — paused", badge };
    }

    if (siteErrKeys.length) {
      return { prefix: "icon-error-", title: "solstone — " + (siteErrs[siteErrKeys[0]] || "needs attention"), badge: "!" };
    }

    const n = sites;
    const label = `observing ${n} site${n > 1 ? "s" : ""}`;
    if (!connected) {
      return {
        prefix: "icon-half-",
        title: `solstone — ${label} · ${cfg.key ? "can't reach your journal" : "connecting to your journal"}`,
        badge,
      };
    }

    return { prefix: "icon", title: `solstone — ${label} · connected`, badge };
  }

  globalThis.SolstoneStatus = { iconState };
})();
