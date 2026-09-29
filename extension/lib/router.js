// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

(function () {
  "use strict";

  const Blocks = globalThis.SolstoneBlocks;
  const DB = globalThis.SolstoneDB;
  const Gate = globalThis.SolstoneCaptureGate;
  const Outbox = globalThis.SolstoneNativeOutbox;

  const frameBindings = new Map(); // key: frameKey -> { realmToken, documentId, ctx, origin, url, tabId, frameId }
  let ctxCounter = 0;

  function mintCtx() {
    ctxCounter++;
    const random = new Uint8Array(8);
    crypto.getRandomValues(random);
    const randHex = [...random].map((b) => b.toString(16).padStart(2, "0")).join("");
    return `ctx-${ctxCounter}-${randHex}`;
  }

  function frameKeyFor(tabId, frameId) {
    return `${tabId}:${frameId || 0}`;
  }

  function destroyBinding(tabId, frameId) {
    if (tabId !== undefined && frameId !== undefined) {
      frameBindings.delete(frameKeyFor(tabId, frameId));
    } else if (tabId !== undefined) {
      for (const [key, binding] of frameBindings) {
        if (binding.tabId === tabId) frameBindings.delete(key);
      }
    }
  }

  function normalizeOrigin(input) {
    if (typeof input !== "string" || !input.trim()) return null;
    try {
      const u = new URL(input.trim());
      if (u.protocol !== "http:" && u.protocol !== "https:") return null;
      return u.origin;
    } catch (_e) {
      return null;
    }
  }

  function isExtensionPageSender(sender, runtimeId) {
    if (!sender) return false;
    if (sender.id !== runtimeId) return false;
    if (sender.tab) return false;
    const url = sender.url || "";
    return url.startsWith("chrome-extension://") || url.startsWith("moz-extension://");
  }

  async function route(msg, sender, deps = {}) {
    const runtimeId = deps.runtimeId || (typeof chrome !== "undefined" && chrome.runtime?.id ? chrome.runtime.id : "");
    if (!sender || sender.id !== runtimeId) {
      return { ok: false, error: "bad_sender" };
    }

    const port = deps.port;
    if (!port) {
      return { ok: false, error: "port_unavailable" };
    }

    if (isExtensionPageSender(sender, runtimeId)) {
      if (!msg || typeof msg !== "object") {
        return { ok: false, error: "bad_message" };
      }

      switch (msg.cmd) {
        case "getState": {
          return { ok: true, ...port.getStatus() };
        }

        case "acknowledgeDisclosure": {
          if (msg.version === Gate.CONSENT_VERSION) {
            try {
              await DB.put("meta", Gate.CONSENT_VERSION, "consentVersion");
              port.consentVersion = Gate.CONSENT_VERSION;
              port.notify();
              return { ok: true, consentVersion: port.consentVersion };
            } catch (_err) {
              return { ok: false, error: "storage_error" };
            }
          }
          return { ok: false, error: "invalid_consent_version" };
        }

        case "addGrantedOrigin": {
          const origin = normalizeOrigin(msg.origin);
          if (!origin) return { ok: false, error: "invalid_origin" };
          port.grantedOrigins.add(origin);
          if (deps.setCfg) {
            await deps.setCfg({ grantedOrigins: Array.from(port.grantedOrigins) }).catch(() => {});
          }
          if (typeof deps.registerSite === "function") {
            try {
              const u = new URL(origin);
              await deps.registerSite(u.host);
            } catch (_e) {
              /* ignore */
            }
          }
          port.notify();
          return { ok: true, origin };
        }

        case "removeGrantedOrigin": {
          const origin = normalizeOrigin(msg.origin);
          if (!origin) return { ok: false, error: "invalid_origin" };
          port.grantedOrigins.delete(origin);
          if (deps.setCfg) {
            await deps.setCfg({ grantedOrigins: Array.from(port.grantedOrigins) }).catch(() => {});
          }
          if (typeof deps.unregisterSite === "function") {
            try {
              const u = new URL(origin);
              await deps.unregisterSite(u.host);
            } catch (_e) {
              /* ignore */
            }
          }
          await Outbox.markAllSnapshotRequired();
          port.notify();
          return { ok: true, origin };
        }

        case "setPaused": {
          port.paused = !!msg.paused;
          if (deps.setCfg) {
            await deps.setCfg({ paused: port.paused }).catch(() => {});
          }
          if (typeof deps.broadcastPause === "function") {
            deps.broadcastPause(port.paused);
          }
          if (port.paused) {
            await Outbox.markAllSnapshotRequired().catch(() => {});
          }
          port.notify();
          return { ok: true, paused: port.paused };
        }

        case "setConfig": {
          if (typeof msg.showPageIndicator === "boolean") {
            port.showPageIndicator = msg.showPageIndicator;
            if (deps.setCfg) {
              await deps.setCfg({ showPageIndicator: port.showPageIndicator }).catch(() => {});
            }
            if (typeof deps.broadcastIndicator === "function") {
              deps.broadcastIndicator(port.showPageIndicator);
            }
            port.notify();
            return { ok: true };
          }
          return { ok: true };
        }

        default:
          return { ok: false, error: "unknown_command" };
      }
    }

    if (!sender.tab || sender.tab.id == null) {
      return { ok: false, error: "unauthorized" };
    }

    const tabId = sender.tab.id;
    const frameId = sender.frameId || 0;
    const fKey = frameKeyFor(tabId, frameId);

    let senderOrigin = null;
    let senderUrl = "";

    if (sender.url === "about:blank") {
      senderOrigin = normalizeOrigin(sender.origin);
      if (!senderOrigin || !port.grantedOrigins.has(senderOrigin)) {
        return { ok: false, error: "origin_not_granted" };
      }
      senderUrl = Blocks.originPath(senderOrigin + "/");
    } else {
      senderOrigin = normalizeOrigin(sender.origin || (sender.url ? new URL(sender.url).origin : ""));
      if (!senderOrigin || !port.grantedOrigins.has(senderOrigin)) {
        return { ok: false, error: "origin_not_granted" };
      }
      senderUrl = Blocks.originPath(sender.url || "");
    }

    let frameSite = "";
    try {
      frameSite = new URL(senderUrl).host;
    } catch (_e) {
      frameSite = senderOrigin;
    }

    const realmToken = msg.realmToken;
    if (!realmToken || typeof realmToken !== "string") {
      return { ok: false, error: "missing_realm_token" };
    }

    let binding = frameBindings.get(fKey);
    const docId = sender.documentId || null;

    if (binding) {
      if (
        binding.realmToken !== realmToken ||
        (docId && binding.documentId && binding.documentId !== docId) ||
        binding.origin !== senderOrigin
      ) {
        frameBindings.delete(fKey);
        binding = null;
      }
    }

    if (!binding) {
      binding = {
        tabId,
        frameId,
        realmToken,
        documentId: docId,
        origin: senderOrigin,
        ctx: mintCtx(),
        url: senderUrl,
      };
      frameBindings.set(fKey, binding);
    }

    switch (msg.kind) {
      case "hello": {
        return {
          ok: true,
          ctx: binding.ctx,
          lease: port.lease ? { ...port.lease } : null,
          consentVersion: port.consentVersion,
          paused: port.paused,
          showPageIndicator: port.showPageIndicator,
          grantedOrigins: Array.from(port.grantedOrigins),
          hostCapture: port.hostCapture,
        };
      }

      case "skim": {
        const nowMs = port.now();
        const gateDecision = Gate.computeDecision({
          lease: port.lease,
          paused: port.paused,
          consentVersion: port.consentVersion,
          originGranted: port.grantedOrigins.has(senderOrigin),
          backpressure: port.backpressure,
          hostCapture: port.hostCapture,
          now: nowMs,
        });

        if (!gateDecision.open) {
          return { ok: false, error: "gate_closed", reason: gateDecision.reason };
        }

        const meta = msg.meta || {};
        const title = typeof meta.title === "string" ? meta.title : "";
        const adapter = typeof meta.adapter === "string" ? meta.adapter : "generic";
        const blocksList = Array.isArray(msg.blocks) ? msg.blocks : [];

        const consts = globalThis.SolstoneNativeBrowserConstants;
        const textMax = (consts && consts.TEXT_MAX) || Blocks.MAX_TEXT || 2001;
        const blocksTruncated = blocksList.length >= Blocks.MAX_BLOCKS;
        const textTruncated = blocksList.some((b) => b && typeof b.text === "string" && b.text.length === textMax && b.text.endsWith("…"));
        port.truncation = {
          active: blocksTruncated || textTruncated,
          blocks: blocksTruncated,
          text: textTruncated,
        };
        port.notify();

        try {
          const result = await Outbox.enqueueSkim({
            inst: port.inst,
            ctx: binding.ctx,
            destinationGeneration: port.lease.generation,
            senderUrl,
            site: frameSite,
            title,
            adapter,
            blocks: blocksList,
            nowMs,
          });

          if (result && result.enqueued) {
            port.drain();
          }
          return {
            ok: true,
            result: {
              enqueued: !!result.enqueued,
              disposition: result.disposition || null,
              batchId: result.batchId || null,
              seq: result.seq || null,
            },
          };
        } catch (err) {
          if (err.disposition === "batch-oversize" || err.disposition === "outbox-full") {
            port.backpressure = { active: true, reason: err.disposition };
            port.notify();
          }
          return { ok: false, error: err.code || "enqueue_failed" };
        }
      }

      case "bye": {
        frameBindings.delete(fKey);
        return { ok: true };
      }

      default:
        return { ok: false, error: "unknown_message_kind" };
    }
  }

  globalThis.SolstoneRouter = {
    route,
    destroyBinding,
    normalizeOrigin,
    frameBindings,
  };
})();
