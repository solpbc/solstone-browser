// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

(function () {
  "use strict";

  function remotePaired(remote) {
    return !!(remote && remote.instanceId && remote.deviceToken && remote.homeSpki);
  }

  function normalize(cfg, extras) {
    cfg = cfg || {};
    extras = extras || {};
    const health = cfg.health || {};
    const remote = cfg.remote || null;
    const remotePending = cfg.remotePending || null;
    const paired = remotePaired(remote);
    const pending = !paired && !!(remotePending || remote);
    const dropped = extras.dropped || cfg.dropped || {};
    const streamName = cfg.stream || (cfg.hostname ? `${cfg.hostname}.browser` : "browser");

    return {
      journalUrl: cfg.journalUrl || "",
      hostname: cfg.hostname || "",
      stream: cfg.stream || "",
      streamName,
      localRegistered: !!cfg.key,
      paused: !!cfg.paused,
      allowlist: Array.isArray(cfg.allowlist) ? cfg.allowlist.slice() : [],
      pausedHosts: Object.assign({}, cfg.pausedHosts || {}),
      siteErrors: Object.assign({}, cfg.siteErrors || {}),
      health: {
        lastError: health.lastError || null,
        lastUploadAt: health.lastUploadAt || null,
        segmentsUploaded: Math.max(0, Number(health.segmentsUploaded || 0)),
        lastStatus: typeof health.lastStatus === "undefined" ? null : health.lastStatus,
        consecutiveFailures: Math.max(0, Number(health.consecutiveFailures || 0)),
      },
      remote: {
        paired,
        pending,
        instanceId: (remote && remote.instanceId) || "",
        relayOrigin: paired
          ? (remote && remote.relayOrigin) || ""
          : (remotePending && remotePending.relayOrigin) || (remote && remote.relayOrigin) || "",
        pairedAt: (remote && remote.pairedAt) || null,
      },
      waiting: Math.max(0, Number(typeof extras.waiting === "undefined" ? cfg.waiting || 0 : extras.waiting)),
      dropped: {
        segments: Math.max(0, Number(dropped.segments || 0)),
        lines: Math.max(0, Number(dropped.lines || 0)),
      },
    };
  }

  function connection(status) {
    status = status || {};
    const health = status.health || {};
    const remote = status.remote || {};
    let kind;

    if (remote.paired) {
      if (health.lastError) kind = "remote-error";
      else if (remote.pairedAt && Number(health.lastUploadAt || 0) >= Number(remote.pairedAt)) kind = "remote-connected";
      else kind = "remote-ready";
    } else if (remote.pending) {
      kind = "remote-pending";
    } else if (health.lastError) {
      kind = "local-error";
    } else if (status.localRegistered) {
      kind = "local-connected";
    } else {
      kind = "local-pending";
    }

    const remoteMode = kind.startsWith("remote-");
    const connected = kind === "local-connected" || kind === "remote-connected";
    const error = kind.endsWith("-error");
    const stateLabel = connected
      ? "connected"
      : error
        ? "can't reach"
        : kind === "remote-ready"
          ? "paired · waiting for first sync"
          : kind === "remote-pending"
            ? "pairing not finished"
            : "connecting";
    const destination = remoteMode ? "your home" : "this computer";
    const destinationDetail = kind === "remote-pending"
      ? "your home, once pairing finishes"
      : remoteMode
        ? "your home, reached over a sealed link"
        : "your journal on this computer";
    const consequence = kind === "local-error"
      ? "your journal isn't answering. what sol takes in is kept here, waiting to sync."
      : kind === "remote-error"
        ? "your home isn't answering. what sol takes in is kept here, waiting to sync."
        : "";

    return { kind, connected, stateLabel, destination, destinationDetail, consequence };
  }

  function iconState(status, entryMatchHosts) {
    status = status || {};
    entryMatchHosts = entryMatchHosts || {};
    const allowlist = status.allowlist || [];
    const totalSites = allowlist.length;
    const pausedHosts = status.pausedHosts || {};
    const sites = allowlist.filter((entry) => !pausedHosts[entryMatchHosts[entry] || entry]).length;
    const observing = sites > 0 && !status.paused;
    const siteErrs = status.siteErrors || {};
    const siteErrKeys = Object.keys(siteErrs);
    const conn = connection(status);
    const waiting = Math.max(0, Number(status.waiting || 0));
    const dropped = status.dropped || {};
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
    if (!conn.connected) {
      return {
        prefix: "icon-half-",
        title: `sol — ${label} · ${conn.stateLabel} · ${conn.destination}${waitingSuffix}`,
        badge,
      };
    }

    return { prefix: "icon", title: `sol — ${label} · ${conn.stateLabel} · ${conn.destination}`, badge };
  }

  function siteRowState(entry, state) {
    state = state || {};
    const siteErrors = state.siteErrors || {};
    if (siteErrors[entry]) return { kind: "error", label: siteErrors[entry] };
    if ((state.pausedHosts || {})[state.matchHost]) return { kind: "paused-browser", label: "paused by browser" };
    if (state.paused) return { kind: "paused", label: "paused" };
    const active = (state.activeSites || []).includes(entry);
    const conn = connection(state);
    if (active && conn.connected) return { kind: "on", label: "on now" };
    if (active && conn.kind === "remote-ready") return { kind: "waiting", label: "on — waiting for first sync" };
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

  globalThis.SolstoneStatus = { remotePaired, normalize, connection, iconState, siteRowState, updateHealth };
})();
