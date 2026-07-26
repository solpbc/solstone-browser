// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

(function () {
  "use strict";

  const SUB_FLOWING = {
    local: "going to your journal on this computer",
    remote: "going to your journal at your home, sealed on the way",
  };
  const SUB_QUEUED = {
    local: "kept here, going to your journal on this computer when it answers",
    remote: "kept here, going to your journal at your home when it answers",
  };
  const SUB_BY_KIND = {
    on: SUB_FLOWING,
    idle: SUB_FLOWING,
    "first-sync-pending": SUB_FLOWING,
    dropped: SUB_QUEUED,
    unreachable: SUB_QUEUED,
    "permission-required": SUB_QUEUED,
    "browser-paused": SUB_FLOWING,
    "site-error": SUB_FLOWING,
    paused: "nothing is being taken in",
    "no-journal": "nothing is being taken in, and nothing is going anywhere",
    "pairing-unfinished": "nowhere yet. pairing isn't finished.",
    "no-sites": "sol takes in nothing until you add a site",
    unavailable: "",
  };
  const DESTINATION_SUB_KINDS = new Set([
    "on",
    "idle",
    "first-sync-pending",
    "dropped",
    "unreachable",
    "permission-required",
    "browser-paused",
    "site-error",
  ]);
  const ICON_BY_KIND = {
    dropped: { prefix: "icon-error-", badge: "!" },
    "browser-paused": { prefix: "icon-error-", badge: "!" },
    "site-error": { prefix: "icon-error-", badge: "!" },
    paused: { prefix: "icon-paused-", badge: "" },
    "no-sites": { prefix: "icon-paused-", badge: "" },
    "no-journal": { prefix: "icon-paused-", badge: "" },
    "pairing-unfinished": { prefix: "icon-paused-", badge: "" },
    unreachable: { prefix: "icon-half-", badge: "" },
    // Same authorization axis as `browser-paused`, so the same treatment. Chrome
    // has not granted the journal address and never will on its own, so the
    // half-sun reads as "connecting", which is the one thing this is not doing.
    "permission-required": { prefix: "icon-error-", badge: "!" },
    "first-sync-pending": { prefix: "icon-half-", badge: "" },
    unavailable: { prefix: "icon-half-", badge: "" },
    on: { prefix: "icon", badge: "" },
    idle: { prefix: "icon", badge: "" },
  };

  function remotePaired(remote) {
    return !!(remote && remote.instanceId && remote.deviceToken && remote.homeSpki);
  }

  function normalizeJournalPermission(value) {
    return ["unknown", "granted", "missing"].includes(value) ? value : "unknown";
  }

  function journalPermissionAfterCheck(value, granted, resolveMissing) {
    const prior = normalizeJournalPermission(value);
    if (granted === null) return prior;
    if (granted) return "granted";
    return prior === "granted" || prior === "missing" || resolveMissing ? "missing" : "unknown";
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
    const journalPermission = normalizeJournalPermission(cfg.journalPermission);

    return {
      journalUrl: cfg.journalUrl || "",
      hostname: cfg.hostname || "",
      stream: cfg.stream || "",
      streamName,
      localRegistered: !!cfg.key,
      journalPermission,
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
    let kind;

    if (remote.paired) {
      if (health.lastError) kind = "remote-error";
      else if (remote.pairedAt && Number(health.lastUploadAt || 0) >= Number(remote.pairedAt)) kind = "remote-connected";
      else kind = "remote-ready";
    } else if (remote.pending) {
      kind = "remote-pending";
    } else if (status.journalPermission === "missing") {
      kind = "local-permission-required";
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
      : kind === "local-permission-required"
        ? "needs permission"
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
    const consequence = kind === "local-permission-required"
      ? "your journal address isn't allowed yet. what sol takes in stays here until you allow it."
      : kind === "local-error"
        ? "your journal isn't answering. what sol takes in is kept here, waiting to sync."
        : kind === "remote-error"
          ? "your home isn't answering. what sol takes in is kept here, waiting to sync."
          : "";

    return { kind, connected, stateLabel, destination, destinationDetail, consequence };
  }

  function isRecord(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  function subFor(kind, conn) {
    const cell = SUB_BY_KIND[kind];
    return typeof cell === "string" ? cell : cell[conn.kind.startsWith("remote-") ? "remote" : "local"];
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

  function verdict(status, extras) {
    try {
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
      const conn = connection(status);
      const journalUnreachable = !!status.health.lastError;
      const browserPausedCount = allowlist.filter((entry) => pausedHosts[entryMatchHosts[entry] ?? entry]).length;
      const siteErrorCount = Object.keys(siteErrors).length;

      // The first live rung wins. Every other live rung becomes `also`, in this
      // same order. The terminal `on` and `idle` fallbacks never appear there.
      const ladder = [
        { kind: "dropped", fires: Number(status.dropped.segments || 0) > 0 },
        // Outranks `unreachable` deliberately, mirroring connection()'s own order:
        // when chrome has taken back the journal address, a retry cannot succeed
        // until the owner allows it, so "can't reach · try now" would misdirect.
        { kind: "permission-required", fires: conn.kind === "local-permission-required" },
        { kind: "unreachable", fires: journalUnreachable },
        { kind: "paused", fires: !!status.paused },
        { kind: "browser-paused", fires: browserPausedCount > 0 },
        { kind: "site-error", fires: siteErrorCount > 0 },
        { kind: "no-journal", fires: conn.kind === "local-pending" },
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
            reason = "your journal hasn't answered for a while. sol kept what it could here, and dropped the oldest to make room.";
            actions = [{ id: "try-now", label: "try now" }];
          } else {
            reason = "sol was offline too long and dropped the oldest to make room.";
            if (extras.outbox && extras.outbox.lines === 0) actions = [{ id: "dismiss", label: "dismiss" }];
          }
          break;
        case "permission-required":
          tone = "attention";
          headline = "your journal needs permission";
          // Same single-source rule as `unreachable`: connection() owns this copy.
          reason = conn.consequence;
          actions = [{ id: "set-up", label: "allow your journal" }];
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
          if (status.waiting > 0) reason = "what sol took in earlier is waiting to sync.";
          break;
        case "browser-paused":
          tone = "attention";
          headline = browserPausedCount === 1
            ? "1 site paused by your browser"
            : `${browserPausedCount} sites paused by your browser`;
          reason = "chrome took back access. sol paused rather than quietly forgetting.";
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

      return { kind, tone, headline, sub: subFor(kind, conn), reason, actions, also };
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
    let title = `sol · ${result.headline}`;
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
    normalizeJournalPermission,
    journalPermissionAfterCheck,
    normalize,
    connection,
    verdict,
    iconState,
    siteRowState,
    updateHealth,
  };
})();
