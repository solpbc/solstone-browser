// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

(function () {
  "use strict";

  const SUB_FLOWING = "going to your journal at your home, sealed on the way";
  const SUB_QUEUED = "kept here, going to your journal at your home when it answers";
  const SUB_BY_KIND = {
    on: SUB_FLOWING,
    idle: SUB_FLOWING,
    "first-sync-pending": SUB_FLOWING,
    dropped: SUB_QUEUED,
    unreachable: SUB_QUEUED,
    "browser-paused": SUB_FLOWING,
    "site-error": SUB_FLOWING,
    paused: "nothing is being taken in",
    "no-journal": "nothing is being taken in, and nothing is going anywhere",
    "pairing-unfinished": "nowhere yet. pairing isn't finished.",
    "no-sites": "nothing is taken in until you add a site.",
    unavailable: "",
  };
  const DESTINATION_SUB_KINDS = new Set([
    "on",
    "idle",
    "first-sync-pending",
    "dropped",
    "unreachable",
    "browser-paused",
    "site-error",
  ]);
  const ICON_BY_KIND = {
    dropped: { prefix: "icon-attention-", badge: "!" },
    "browser-paused": { prefix: "icon-attention-", badge: "!" },
    "site-error": { prefix: "icon-attention-", badge: "!" },
    paused: { prefix: "icon-paused-", badge: "" },
    "no-sites": { prefix: "icon-paused-", badge: "" },
    "no-journal": { prefix: "icon-paused-", badge: "" },
    "pairing-unfinished": { prefix: "icon-paused-", badge: "" },
    unreachable: { prefix: "icon-offline-", badge: "" },
    "first-sync-pending": { prefix: "icon", badge: "" },
    unavailable: { prefix: "icon-error-", badge: "" },
    on: { prefix: "icon", badge: "" },
    idle: { prefix: "icon", badge: "" },
  };

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

    return {
      hostname: cfg.hostname || "",
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
      outboxLines: Math.max(0, Number(typeof extras.outboxLines === "undefined" ? cfg.outboxLines || 0 : extras.outboxLines)),
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
    let kind = "unpaired";
    if (remote.paired) {
      if (health.lastError) kind = "remote-error";
      else if (remote.pairedAt && Number(health.lastUploadAt || 0) >= Number(remote.pairedAt)) kind = "remote-connected";
      else kind = "remote-ready";
    } else if (remote.pending) {
      kind = "remote-pending";
    }

    const connected = kind === "remote-connected";
    let stateLabel = "not paired";
    let destination = "nowhere yet";
    let destinationDetail = "your journal at your home, once you pair it";
    let consequence = "set up your journal first. until then, browser updates wait here.";
    if (kind === "remote-connected") {
      stateLabel = "connected";
      destination = "your home";
      destinationDetail = "your home, reached over a sealed link";
      consequence = "";
    } else if (kind === "remote-ready") {
      stateLabel = "paired · waiting for first sync";
      destination = "your home";
      destinationDetail = "your home, reached over a sealed link";
      consequence = "";
    } else if (kind === "remote-error") {
      stateLabel = "can't reach";
      destination = "your home";
      destinationDetail = "your home, reached over a sealed link";
      consequence = "the connection to your journal is unavailable. browser updates wait here until they can go into your journal.";
    } else if (kind === "remote-pending") {
      stateLabel = "pairing not finished";
      destination = "your home";
      destinationDetail = "your home, once pairing finishes";
      consequence = "";
    }

    return { kind, connected, stateLabel, destination, destinationDetail, consequence };
  }

  function isRecord(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  function subFor(kind) {
    return SUB_BY_KIND[kind];
  }

  function unavailableVerdict() {
    return {
      kind: "unavailable",
      tone: "unavailable",
      headline: "status unavailable",
      sub: SUB_BY_KIND.unavailable,
      reason: "",
      actions: [{ id: "open-settings", label: "open settings" }],
      also: [],
    };
  }

  function verdictForConnection(conn, status, extras) {
    if (
      !isRecord(status)
      || !Array.isArray(status.allowlist)
      || !isRecord(status.health)
      || !isRecord(status.dropped)
    ) {
      throw new Error("status is not a normalize() output");
    }

    extras = extras || {};
    if (Object.prototype.hasOwnProperty.call(extras, "activeSites") && !Array.isArray(extras.activeSites)) {
      throw new Error("activeSites is not an array");
    }

    const allowlist = status.allowlist;
    const pausedHosts = status.pausedHosts || {};
    const siteErrors = status.siteErrors || {};
    const entryMatchHosts = extras.entryMatchHosts || {};
    const journalUnreachable = conn.kind === "remote-error";
    const browserPausedCount = allowlist.filter((entry) => pausedHosts[entryMatchHosts[entry] ?? entry]).length;
    const siteErrorCount = Object.keys(siteErrors).length;

    // The first live rung wins. Every other live rung becomes `also`, in this
    // same order. The terminal `on` and `idle` fallbacks never appear there.
    const ladder = [
      { kind: "dropped", fires: Number(status.dropped.segments || 0) > 0 },
      { kind: "unreachable", fires: journalUnreachable },
      { kind: "paused", fires: !!status.paused },
      { kind: "browser-paused", fires: browserPausedCount > 0 },
      { kind: "site-error", fires: siteErrorCount > 0 },
      { kind: "no-journal", fires: conn.kind === "unpaired" },
      { kind: "pairing-unfinished", fires: conn.kind === "remote-pending" },
      { kind: "no-sites", fires: allowlist.length === 0 },
      { kind: "first-sync-pending", fires: conn.kind === "remote-ready" },
    ];
    const winner = ladder.find((entry) => entry.fires);
    let kind;
    let also;
    if (winner) {
      kind = winner.kind;
      also = ladder.filter((entry) => entry !== winner && entry.fires).map((entry) => entry.kind);
    } else {
      // Unreachable under today's connection(): every non-connected kind is
      // caught above. This assert keeps a future kind from silently earning green.
      if (!conn.connected) throw new Error(`unhandled connection kind: ${conn.kind}`);
      kind = Object.prototype.hasOwnProperty.call(extras, "activeSites") && extras.activeSites.length === 0 ? "idle" : "on";
      also = [];
    }

    let tone;
    let headline;
    let reason = "";
    let actions = [];
    switch (kind) {
      case "dropped":
        tone = "attention";
        headline = "some updates couldn't be kept";
        if (journalUnreachable) {
          reason = "the connection to your journal was unavailable for a while. the oldest waiting updates were dropped to make room.";
          actions = [{ id: "try-now", label: "try now" }];
        } else {
          reason = "the oldest waiting updates were dropped to make room.";
          if (extras.outbox && extras.outbox.lines === 0) actions = [{ id: "dismiss", label: "dismiss" }];
        }
        break;
      case "unreachable":
        tone = "attention";
        headline = "can't reach your journal";
        // connection() is the single source of consequence copy. A fallback
        // literal here would recreate the parallel truth source this verdict removes.
        reason = conn.consequence;
        actions = [{ id: "try-now", label: "try now" }];
        break;
      case "paused":
        tone = "calm";
        headline = "paused";
        if (status.waiting > 0) reason = "what you shared earlier is waiting to go into your journal.";
        break;
      case "browser-paused":
        tone = "attention";
        headline = browserPausedCount === 1
          ? "1 site paused by your browser"
          : `${browserPausedCount} sites paused by your browser`;
        reason = "site access is no longer available. allow it again to resume the affected sites.";
        break;
      case "site-error":
        tone = "attention";
        headline = siteErrorCount === 1 ? "1 site needs attention" : `${siteErrorCount} sites need attention`;
        break;
      case "no-journal":
        tone = "calm";
        headline = "no journal yet";
        actions = [{ id: "set-up", label: "set up your journal" }];
        break;
      case "pairing-unfinished":
        tone = "calm";
        headline = "pairing isn't finished";
        actions = [{ id: "set-up", label: "finish pairing" }];
        break;
      case "no-sites":
        tone = "calm";
        headline = "no sites yet";
        break;
      case "first-sync-pending":
        tone = "calm";
        headline = "paired, nothing sent yet";
        reason = "the first pages go out on the next batch.";
        break;
      case "idle":
        tone = "ok";
        headline = "on";
        reason = "none of your sites are open right now.";
        break;
      case "on":
        tone = "ok";
        headline = "on";
        if (status.outboxLines > 0) reason = `${status.outboxLines} update${status.outboxLines === 1 ? "" : "s"} from earlier waiting to sync.`;
        break;
      default:
        throw new Error(`unknown verdict kind: ${kind}`);
    }

    return { kind, tone, headline, sub: subFor(kind), reason, actions, also };
  }

  function verdict(status, extras) {
    try {
      return verdictForConnection(connection(status), status, extras);
    } catch (err) {
      console.warn("[solstone] status verdict unavailable", err);
      return unavailableVerdict();
    }
  }

  function iconState(status, secondArg) {
    const extras = secondArg && typeof secondArg === "object" && ["activeSites", "outbox", "entryMatchHosts"].some(
      (key) => Object.prototype.hasOwnProperty.call(secondArg, key) && typeof secondArg[key] !== "string"
    )
      ? secondArg
      : { entryMatchHosts: secondArg || {} };
    const result = verdict(status, extras);
    const icon = ICON_BY_KIND[result.kind];
    let title = `solstone · ${result.headline}`;
    if (DESTINATION_SUB_KINDS.has(result.kind)) title += ` · ${result.sub}`;
    return { prefix: icon.prefix, title, badge: icon.badge };
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
    if (active && conn.kind === "remote-ready") return { kind: "waiting", label: "on, waiting for first sync" };
    if (active) return { kind: "waiting", label: "on, waiting to sync" };
    if (entry === state.pageHost) return { kind: "reload", label: "reload this tab to begin" };
    return { kind: "idle", label: "added. open or reload a tab" };
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

  globalThis.SolstoneStatus = {
    remotePaired,
    normalize,
    connection,
    verdictForConnection,
    verdict,
    iconState,
    siteRowState,
    updateHealth,
  };
})();
