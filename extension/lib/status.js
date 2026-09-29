// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

(function () {
  "use strict";

  const PREFIX_BY_MARK = {
    healthy: "icon",
    paused: "icon-paused-",
    attention: "icon-attention-",
    offline: "icon-offline-",
    error: "icon-error-",
    connecting: "icon-connecting-",
  };

  function derive(status, extras) {
    const C = globalThis.SolstoneCopy;
    extras = extras || {};

    if (!status || typeof status !== "object" || status.ok === false) {
      return {
        kind: "unavailable",
        mark: "error",
        badge: "",
        headline: "status unavailable",
        sub: "",
        reason: "the solstone extension can't show its status right now.",
        action: { id: "open-settings", label: "open settings" },
        also: [],
        connecting: null,
      };
    }

    try {
      const brand = status.brand || "";
      const platform = status.platform || "";
      const bName = C ? C.browserName(brand) : "your browser";
      const chosenOrigins = Array.isArray(status.chosenOrigins) ? status.chosenOrigins : [];
      const grantedOrigins = Array.isArray(status.grantedOrigins) ? status.grantedOrigins : [];
      const inactiveOrigins = Array.isArray(status.inactiveOrigins) ? status.inactiveOrigins : [];
      const siteNotices = Array.isArray(status.siteNotices) ? status.siteNotices : [];
      const hostCapture = status.hostCapture;
      const hostDelivery = status.hostDelivery;
      const hostFailure = status.hostFailure;
      const custody = status.custody;
      const lease = status.lease;
      const capturePermitted = status.capturePermitted === true;
      const paused = !!status.paused;
      const pressure = status.pressure || {};
      const consentVersion = status.consentVersion;
      const updateCheck = status.updateCheck || "pending";
      const behind = status.behind;
      const connected = !!status.connected;
      const handshake = status.handshake;
      const everConnected = !!status.everConnected;
      const lossNotice = status.lossNotice;

      const anyGrantedTabOpen = typeof extras.anyGrantedTabOpen === "boolean" ? extras.anyGrantedTabOpen : (
        Array.isArray(extras.activeSites) ? extras.activeSites.length > 0 : true
      );

      const items = [];

      // Layer 1: Version Skew
      if (behind === "extension") {
        let reason = `the solstone app on this computer needs a newer version of this extension. ${bName} hasn't found it yet; it checks again on its own.`;
        let action = null;
        if (updateCheck === "pending") {
          reason = `the solstone app on this computer needs a newer version of this extension. ${bName} is checking for it now.`;
        } else if (updateCheck === "manual") {
          reason = `the solstone app on this computer needs a newer version of this extension. in Firefox, open Add-ons and themes, then choose Check for Updates from the gear menu.`;
        } else if (updateCheck === "update-available") {
          reason = "the update is ready.";
          action = { id: "update-now", label: "update now" };
        }
        items.push({
          layer: 1,
          kind: "update-extension",
          mark: "attention",
          badge: "!",
          headline: "update the solstone extension",
          sub: "nothing new is taken in until it's updated",
          reason,
          action,
          connecting: null,
        });
      } else if (behind === "app") {
        const reason = platform === "linux" ? "" : "this extension needs a newer version of the solstone app on this computer. look under updates in the solstone app's settings.";
        items.push({
          layer: 1,
          kind: "update-app",
          mark: "attention",
          badge: "!",
          headline: "update the solstone app",
          sub: "nothing new is taken in until it's updated",
          reason,
          action: null,
          connecting: null,
        });
      }

      // Layer 2: Transport & Host Reachability
      const isHandshakeConnecting = (connected && handshake === "pending") ||
        (hostCapture === "permitted" && !capturePermitted && custody?.full !== true && (!lease || lease.freshnessMs === 0));

      if (isHandshakeConnecting) {
        items.push({
          layer: 2,
          kind: "connecting",
          mark: "connecting",
          badge: "",
          headline: "connecting to the solstone app",
          sub: "",
          reason: "",
          action: null,
          connecting: "handshake",
        });
      } else if (!connected || hostCapture == null || hostCapture === "unavailable") {
        let reason = "";
        let action = null;
        let mark = "offline";
        if (!everConnected) {
          mark = "paused";
          reason = "the solstone extension works with the solstone app on this computer. if the solstone app isn't on this computer yet, get it at solstone.app.";
          action = { id: "get-app", label: "get the solstone app" };
        } else if (connected) {
          reason = "the solstone app on this computer isn't answering. open it to go on.";
        } else if (platform !== "linux") {
          reason = "open the solstone app on this computer. if it's already open, look under sources in its settings.";
        }
        items.push({
          layer: 2,
          kind: "cant-reach-app",
          mark,
          badge: "",
          headline: "can't reach the solstone app",
          sub: "nothing is taken in until it answers",
          reason,
          action,
          connecting: null,
        });
      }

      // Layer 3: App Mode & Consent
      if (hostCapture === "not_paired") {
        items.push({
          layer: 3,
          kind: "not-paired",
          mark: "paused",
          badge: "",
          headline: "the solstone app isn't paired yet",
          sub: "nothing is taken in until it is",
          reason: "pair the solstone app on this computer with your journal, then come back.",
          action: null,
          connecting: null,
        });
      }

      if (consentVersion !== 1) {
        items.push({
          layer: 3,
          kind: "consent-needed",
          mark: "paused",
          badge: "",
          headline: "finish setting up",
          sub: "nothing is taken in until you do",
          reason: "read what the solstone extension takes in, then choose your first site.",
          action: { id: "finish-setup", label: "finish setting up" },
          connecting: null,
        });
      }

      if (hostCapture === "paused") {
        items.push({
          layer: 3,
          kind: "app-paused",
          mark: "paused",
          badge: "",
          headline: "the solstone app is paused",
          sub: "nothing new is taken in",
          reason: "pausing doesn't hold back what's already taken in. resume from the solstone app.",
          action: null,
          connecting: null,
        });
      }

      if (hostCapture === "intake_off" && (!hostFailure || hostFailure === "relay_unavailable" || hostFailure === "journal_rejected")) {
        const reason = platform === "linux" ? "" : "turn browser pages back on under sources in the solstone app's settings.";
        items.push({
          layer: 3,
          kind: "intake-off",
          mark: "paused",
          badge: "",
          headline: "browser pages are off in the solstone app",
          sub: "nothing new is taken in",
          reason,
          action: null,
          connecting: null,
        });
      }

      if (paused) {
        items.push({
          layer: 3,
          kind: "paused-here",
          mark: "paused",
          badge: "",
          headline: "paused in this browser",
          sub: "nothing new is taken in from this browser",
          reason: "pausing doesn't hold back what's already taken in.",
          action: null,
          connecting: null,
        });
      }

      if (chosenOrigins.length === 0) {
        items.push({
          layer: 3,
          kind: "no-sites",
          mark: "paused",
          badge: "",
          headline: "no sites yet",
          sub: "nothing is taken in until you add a site",
          reason: "open a site you want to share and choose add this site.",
          action: null,
          connecting: null,
        });
      }

      // Layer 4: Custody Limits & Storage Pressure
      const isQueueFullStore = hostCapture === "intake_off" && hostFailure === "queue_full" && custody?.full !== false;
      const isPermittedStoreFull = custody?.full === true && hostCapture === "permitted" && hostCapture !== "intake_off";

      if (isPermittedStoreFull || isQueueFullStore) {
        items.push({
          layer: 4,
          kind: "app-store-full",
          mark: "offline",
          badge: "",
          headline: "no room for more right now",
          sub: "nothing new is taken in until there's room",
          reason: "the room on this computer for what you share from your browsers is full. new pages are taken in again once there's room. the solstone app has the details.",
          action: null,
          connecting: null,
        });
      }

      if (hostCapture === "intake_off" && hostFailure === "unaccepted_lost") {
        items.push({
          layer: 4,
          kind: "lost-and-held",
          mark: "attention",
          badge: "!",
          headline: "some pages couldn't be kept",
          sub: "nothing new is taken in right now",
          reason: "part of what you shared from your browsers couldn't be kept, so it won't go into your journal. the solstone app has the details.",
          action: null,
          connecting: null,
        });
        if (custody?.full === true && !items.some(it => it.kind === "app-store-full")) {
          items.push({
            layer: 4,
            kind: "app-store-full",
            mark: "offline",
            badge: "",
            headline: "no room for more right now",
            sub: "nothing new is taken in until there's room",
            reason: "the room on this computer for what you share from your browsers is full. new pages are taken in again once there's room. the solstone app has the details.",
            action: null,
            connecting: null,
          });
        }
      } else if (
        hostCapture === "intake_off" &&
        (hostFailure === "local_io" || hostFailure === "resource_exhausted" || hostFailure === "age_policy" || (hostFailure === "queue_full" && custody?.full === false))
      ) {
        items.push({
          layer: 4,
          kind: "intake-held",
          mark: "offline",
          badge: "",
          headline: "nothing new is taken in right now",
          sub: "",
          reason: "the solstone app on this computer isn't taking in new pages right now.",
          action: null,
          connecting: null,
        });
        if (custody?.full === true && !items.some(it => it.kind === "app-store-full")) {
          items.push({
            layer: 4,
            kind: "app-store-full",
            mark: "offline",
            badge: "",
            headline: "no room for more right now",
            sub: "nothing new is taken in until there's room",
            reason: "the room on this computer for what you share from your browsers is full. new pages are taken in again once there's room. the solstone app has the details.",
            action: null,
            connecting: null,
          });
        }
      }

      if (pressure?.active && hostCapture === "permitted") {
        items.push({
          layer: 4,
          kind: "pressure-here",
          mark: "offline",
          badge: "",
          headline: "no room for more right now",
          sub: "nothing new is taken in until there's room",
          reason: "what you shared from this browser is waiting for the solstone app to accept it. new pages are taken in again once there's room.",
          action: null,
          connecting: null,
        });
      }

      // Layer 5: Local Losses, Stale Custody & Site Errors
      if (lossNotice != null) {
        items.push({
          layer: 5,
          kind: "dropped",
          mark: "attention",
          badge: "!",
          headline: "some pages couldn't be kept",
          sub: "",
          reason: "part of what you shared from this browser couldn't be kept, so it won't go into your journal.",
          action: { id: "dismiss-loss", label: "dismiss" },
          connecting: null,
        });
      }

      if (custody?.stale === true) {
        items.push({
          layer: 5,
          kind: "waiting-over-a-week",
          mark: "attention",
          badge: "!",
          headline: "some pages have waited more than a week",
          sub: "",
          reason: "some pages from your browsers have waited more than a week to go into your journal. they're still kept on this computer. the solstone app has the details.",
          action: null,
          connecting: null,
        });
      }

      if (inactiveOrigins.length > 0) {
        const n = inactiveOrigins.length;
        const headline = n === 1 ? `1 site paused by ${bName}` : `${n} sites paused by ${bName}`;
        items.push({
          layer: 5,
          kind: "sites-paused-by-browser",
          mark: "attention",
          badge: "!",
          headline,
          sub: "",
          reason: `${bName} took back this extension's access. allow it again to go on.`,
          action: null,
          connecting: null,
        });
      }

      const hasSiteErrors = siteNotices.some((sn) => sn.kind === "enqueue" || sn.kind === "registration");
      if (hasSiteErrors) {
        const siteErrorCount = new Set(siteNotices.filter((sn) => sn.kind === "enqueue" || sn.kind === "registration").map((sn) => sn.origin)).size;
        const headline = siteErrorCount === 1 ? "1 site needs attention" : `${siteErrorCount} sites need attention`;
        items.push({
          layer: 5,
          kind: "site-error",
          mark: "attention",
          badge: "!",
          headline,
          sub: "",
          reason: "",
          action: null,
          connecting: null,
        });
      }

      // Layer 6: Remote Delivery Failure
      if (hostDelivery === "failed") {
        items.push({
          layer: 6,
          kind: "delivery-failed",
          mark: "offline",
          badge: "",
          headline: "not reaching your journal",
          sub: "kept on this computer for now",
          reason: "what you share from this browser is kept on this computer for now. the solstone app has the details.",
          action: null,
          connecting: null,
        });
      }

      // Layer 7: Active Capture
      const effectiveGateOpen = hostCapture === "permitted" && capturePermitted && custody?.full !== true &&
        consentVersion === 1 && !paused && !pressure?.active;

      const layers0to4Clear = !items.some((it) => it.layer >= 0 && it.layer <= 4);

      if (effectiveGateOpen && layers0to4Clear) {
        if (hostDelivery === "unknown" || hostDelivery == null) {
          items.push({
            layer: 7,
            kind: "connecting",
            mark: "connecting",
            badge: "",
            headline: "on",
            sub: "no word yet on whether it's reaching your journal",
            reason: "",
            action: null,
            connecting: "delivery",
          });
        } else {
          let deliverySub = "";
          if (hostDelivery === "delivered") {
            deliverySub = hostFailure ? "the last pages reached your journal" : "reaching your journal";
          } else if (hostDelivery === "kept_locally") {
            deliverySub = "kept on this computer, waiting to go into your journal";
          } else if (hostDelivery === "idle") {
            deliverySub = "nothing waiting to go into your journal";
          }

          if (!anyGrantedTabOpen) {
            items.push({
              layer: 7,
              kind: "idle",
              mark: "healthy",
              badge: "",
              headline: "on",
              sub: deliverySub,
              reason: "none of your sites are open right now.",
              action: null,
              connecting: null,
            });
          } else {
            items.push({
              layer: 7,
              kind: "on",
              mark: "healthy",
              badge: "",
              headline: "on",
              sub: deliverySub,
              reason: "",
              action: null,
              connecting: null,
            });
          }
        }
      }

      const winner = items[0] || {
        layer: 0,
        kind: "unavailable",
        mark: "error",
        badge: "",
        headline: "status unavailable",
        sub: "",
        reason: "the solstone extension can't show its status right now.",
        action: { id: "open-settings", label: "open settings" },
        connecting: null,
      };

      const also = items
        .filter((it) => it !== winner && it.kind !== "on" && it.kind !== "idle")
        .map((it) => ({ kind: it.kind, headline: it.headline, action: it.action }));

      return {
        kind: winner.kind,
        mark: winner.mark,
        badge: winner.badge,
        headline: winner.headline,
        sub: winner.sub,
        reason: winner.reason,
        action: winner.action,
        also,
        connecting: winner.connecting,
      };
    } catch (_err) {
      return {
        kind: "unavailable",
        mark: "error",
        badge: "",
        headline: "status unavailable",
        sub: "",
        reason: "the solstone extension can't show its status right now.",
        action: { id: "open-settings", label: "open settings" },
        also: [],
        connecting: null,
      };
    }
  }

  function iconState(status, extras) {
    const result = derive(status, extras);
    const prefix = PREFIX_BY_MARK[result.mark] || "icon-error-";
    let title = `solstone · ${result.headline}`;
    const shouldAppendSub = result.kind === "delivery-failed" ||
      (result.kind === "connecting" && result.connecting === "delivery") ||
      result.kind === "on" || result.kind === "idle";
    if (shouldAppendSub && result.sub) {
      title += ` · ${result.sub}`;
    }
    return { prefix, title, badge: result.badge || "" };
  }

  function siteRow(entry, status, extras) {
    const C = globalThis.SolstoneCopy;
    status = status || {};
    extras = extras || {};
    const bName = C ? C.browserName(status.brand) : "your browser";
    const inactiveOrigins = Array.isArray(status.inactiveOrigins) ? status.inactiveOrigins : [];
    const grantedOrigins = Array.isArray(status.grantedOrigins) ? status.grantedOrigins : [];
    const siteNotices = Array.isArray(status.siteNotices) ? status.siteNotices : [];
    const openTabOrigins = Array.isArray(extras.openTabOrigins) ? extras.openTabOrigins : (
      extras.activeSites ? extras.activeSites : []
    );

    const isInactive = inactiveOrigins.some((o) => o === entry || (o.startsWith("http") && new URL(o).host === entry));
    if (isInactive) {
      return {
        kind: "paused-by-browser",
        label: `paused by ${bName}`,
        action: { id: "allow-again", label: "allow again" },
      };
    }

    if (status.paused || status.hostCapture === "paused") {
      return {
        kind: "paused",
        label: "paused",
        action: null,
      };
    }

    const isGranted = grantedOrigins.some((o) => o === entry || (o.startsWith("http") && new URL(o).host === entry));
    const isTabOpen = openTabOrigins.some((o) => o === entry || (o.startsWith("http") && new URL(o).host === entry));

    if (status.pressure?.active && isGranted && isTabOpen) {
      return {
        kind: "pressure-here",
        label: "no room for more right now",
        action: null,
      };
    }

    const truncNotice = siteNotices.find((n) => n.kind === "truncation" && (n.origin === entry || (n.origin.startsWith("http") && new URL(n.origin).host === entry)));
    if (truncNotice) {
      return {
        kind: "truncated",
        label: "part of this page was too long to keep",
        action: { id: "dismiss-truncation", label: "dismiss", bound: truncNotice.bound },
      };
    }

    const regNotice = siteNotices.find((n) => n.kind === "registration" && (n.origin === entry || (n.origin.startsWith("http") && new URL(n.origin).host === entry)));
    if (regNotice && regNotice.bound === "reload" && isTabOpen) {
      return {
        kind: "reload-tab",
        label: "reload this tab to begin",
        action: null,
      };
    }

    if (isGranted && !isTabOpen && (!regNotice || regNotice.bound !== "failed")) {
      return {
        kind: "added-idle",
        label: "added. open or reload a tab",
        action: null,
      };
    }

    const capturePermitted = status.capturePermitted === true;
    const isCapturable = isGranted && status.consentVersion === 1 && !status.paused && !status.pressure?.active &&
      status.hostCapture === "permitted" && capturePermitted && status.custody?.full !== true &&
      (!regNotice || regNotice.bound !== "failed");

    if (!isCapturable) {
      return {
        kind: "not-taken-in",
        label: "not taken in right now",
        action: null,
      };
    }

    if (isTabOpen) {
      return {
        kind: "on-now",
        label: "on now",
        action: null,
      };
    }

    return {
      kind: "added-idle",
      label: "added. open or reload a tab",
      action: null,
    };
  }

  globalThis.SolstoneStatus = {
    derive,
    iconState,
    siteRow,
  };
})();
