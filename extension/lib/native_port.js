// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

(function () {
  "use strict";

  const DB = globalThis.SolstoneDB;
  const Outbox = globalThis.SolstoneNativeOutbox;
  const Gate = globalThis.SolstoneCaptureGate;

  function getConsts() {
    const C = globalThis.SolstoneNativeBrowserConstants;
    if (!C) throw new Error("missing SolstoneNativeBrowserConstants");
    return C;
  }

  function resolveHostName(runtimeId) {
    const consts = getConsts();
    const table = consts.HOSTS_AND_IDS;
    if (!table || !runtimeId) return null;

    if (
      runtimeId === table.dev?.chrome_id ||
      runtimeId === table.dev?.edge_id ||
      runtimeId === table.dev?.firefox_id
    ) {
      return table.dev.host;
    }
    if (
      runtimeId === table.production?.chrome_id ||
      runtimeId === table.production?.edge_id ||
      runtimeId === table.production?.firefox_id
    ) {
      return table.production.host;
    }
    return null;
  }

  function resolveBrand() {
    const ua = typeof navigator !== "undefined" && navigator.userAgent ? navigator.userAgent : "";
    if (ua.includes("Firefox/")) return "firefox";
    if (ua.includes("Edg/")) return "edge";
    return "chrome";
  }

  function mintConnectionToken() {
    const bytes = new Uint8Array(16);
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      crypto.getRandomValues(bytes);
    }
    return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  class SolstoneNativePortController {
    constructor(options = {}) {
      this.connectNative = options.connectNative || (typeof chrome !== "undefined" && chrome.runtime?.connectNative ? chrome.runtime.connectNative.bind(chrome.runtime) : null);
      this.now = options.now || (() => (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now()));
      this.schedule = options.schedule || ((fn, ms) => {
        const timer = setTimeout(fn, ms);
        if (timer && typeof timer.unref === "function") timer.unref();
        return timer;
      });
      this.clearSchedule = options.clearSchedule || ((id) => clearTimeout(id));
      this.requestUpdateCheck = options.requestUpdateCheck || (typeof chrome !== "undefined" && chrome.runtime?.requestUpdateCheck ? chrome.runtime.requestUpdateCheck.bind(chrome.runtime) : null);
      this.onStatusChange = options.onStatusChange || null;
      this.runtimeId = options.runtimeId || (typeof chrome !== "undefined" && chrome.runtime?.id ? chrome.runtime.id : "");
      this.manifestVersion = options.manifestVersion || "0.2.0";
      this.inst = options.inst !== undefined ? options.inst : null;
      this.requestSnapshots = options.requestSnapshots || null;

      this.retryDelayMs = options.retryDelayMs || 5000;
      this.inflightAckMs = options.inflightAckMs || 5000;

      this.opEpoch = 0;
      this.connectionGeneration = 0;
      this.connectionToken = null;
      this.livePort = null;
      this.handshake = "closed"; // "closed" | "pending" | "ready"
      this.handshakeStartedAt = 0;
      this.destinationGeneration = null;

      this.hostCapture = null;
      this.hostDelivery = null;
      this.hostFailure = null;
      this.custody = null;

      this.lease = null;
      this.behind = null;
      this.pressure = { active: false };
      this.siteRejection = null;
      this.lossNotice = null;
      this.drift = null;

      this.drainOwner = false;
      this.inflightBatch = null;
      this.retryNotBefore = 0;

      this.everConnected = false;
      this.updateCheck = "pending";
      this.paused = false;
      this.grantedOrigins = new Set();
      this.consentVersion = 0;
      this.showPageIndicator = false;
      this.capturePermitted = false;
      this.brand = resolveBrand();
      this.hostName = resolveHostName(this.runtimeId);
    }

    notify() {
      if (typeof this.onStatusChange === "function") {
        this.onStatusChange(this.getStatus());
      }
    }

    getStatus() {
      const nowMs = this.now();
      const originGranted = this.grantedOrigins.size > 0;
      const capturePermitted = this.capturePermitted === true;

      const gate = Gate.computeDecision({
        lease: this.lease,
        paused: this.paused,
        consentVersion: this.consentVersion,
        originGranted,
        pressure: this.pressure,
        hostCapture: this.hostCapture,
        capturePermitted,
        now: nowMs,
      });

      return {
        inst: this.inst,
        everConnected: !!this.everConnected,
        connected: this.livePort != null,
        handshake: this.handshake,
        brand: this.brand,
        hostCapture: this.hostCapture,
        hostDelivery: this.hostDelivery,
        hostFailure: this.hostFailure,
        custody: this.custody ? { ...this.custody } : null,
        destinationGeneration: this.destinationGeneration,
        lease: this.lease ? { ...this.lease } : null,
        behind: this.behind,
        pressure: { ...this.pressure },
        siteRejection: this.siteRejection ? { ...this.siteRejection } : null,
        lossNotice: this.lossNotice ? { ...this.lossNotice } : null,
        drift: this.drift ? { ...this.drift } : null,
        paused: !!this.paused,
        consentVersion: this.consentVersion,
        grantedOrigins: Array.from(this.grantedOrigins),
        showPageIndicator: !!this.showPageIndicator,
        updateCheck: this.updateCheck,
        capturePermitted,
        gate,
      };
    }

    connect() {
      this.opEpoch++;
      this.connectionGeneration++;
      const currentEpoch = this.opEpoch;
      const currentGen = this.connectionGeneration;
      const currentToken = mintConnectionToken();
      this.connectionToken = currentToken;

      const oldPort = this.livePort;
      this.livePort = null;
      this.handshake = "closed";
      this.lease = null;
      this.drainOwner = false;
      this.inflightBatch = null;

      this.hostCapture = null;
      this.hostDelivery = null;
      this.hostFailure = null;
      this.custody = null;
      this.capturePermitted = false;

      if (oldPort) {
        try {
          oldPort.disconnect();
        } catch (_e) {
          /* ignore */
        }
      }

      const host = resolveHostName(this.runtimeId);
      this.hostName = host;
      if (!this.inst || !host || typeof this.connectNative !== "function") {
        this.handshake = "closed";
        this.notify();
        return;
      }

      let portObj = null;
      try {
        portObj = this.connectNative(host);
      } catch (_err) {
        this.livePort = null;
        this.handshake = "closed";
        this.notify();
        return;
      }

      if (!portObj) {
        this.livePort = null;
        this.handshake = "closed";
        this.notify();
        return;
      }

      this.livePort = portObj;
      this.handshake = "pending";
      this.handshakeStartedAt = this.now();

      const consts = getConsts();
      const helloMsg = {
        type: "hello",
        protocol: consts.WIRE_PROTOCOL,
        version: this.manifestVersion,
        brand: this.brand,
        inst: this.inst,
      };

      portObj.onMessage.addListener((msg) => {
        if (this.opEpoch !== currentEpoch || this.connectionGeneration !== currentGen || this.connectionToken !== currentToken) return;
        return this.handlePortMessage(msg, currentEpoch, currentGen, currentToken);
      });

      portObj.onDisconnect.addListener(() => {
        if (this.opEpoch !== currentEpoch || this.connectionGeneration !== currentGen || this.connectionToken !== currentToken) return;
        this.handlePortDisconnect(currentEpoch, currentGen, currentToken);
      });

      try {
        portObj.postMessage(helloMsg);
      } catch (_e) {
        this.handlePortDisconnect(currentEpoch, currentGen, currentToken);
      }
      this.notify();
    }

    async handlePortMessage(msg, epoch, gen, token) {
      if (this.opEpoch !== epoch || this.connectionGeneration !== gen || this.connectionToken !== token) return;
      const codec = globalThis.SolstoneNativeBrowser;
      const rawJson = typeof msg === "string" ? msg : JSON.stringify(msg);
      const decoded = codec.decode(rawJson, "host_to_extension");

      if (decoded.status !== "accept") {
        this.opEpoch++;
        this.handshake = "closed";
        this.lease = null;
        this.capturePermitted = false;
        if (this.livePort) {
          try { this.livePort.disconnect(); } catch (_e) {}
          this.livePort = null;
        }
        await Outbox.markAllSnapshotRequired();
        this.notify();
        return;
      }

      const val = decoded.value;
      const nowMs = this.now();

      if (val.type === "hello_ack" || val.type === "state") {
        if (val.type === "hello_ack") {
          this.handshake = "ready";
        }
        if (this.handshake !== "ready") {
          return;
        }

        this.hostCapture = val.capture;
        this.hostDelivery = val.delivery || null;
        this.hostFailure = val.failure || null;
        this.custody = val.custody ? { full: !!val.custody.full, stale: !!val.custody.stale } : null;
        this.behind = null;
        this.capturePermitted = codec.captureIsPermitted(val);

        if (val.type === "hello_ack" && val.capture !== "unavailable" && !this.everConnected) {
          const fence = { epoch: this.opEpoch, gen, token, port: this.livePort };
          let putOk = false;
          try {
            await DB.put("meta", true, "everConnected");
            putOk = true;
          } catch (_e) {
            // Keep everConnected false if put throws
          }
          if (this.opEpoch !== fence.epoch || this.connectionGeneration !== fence.gen || this.connectionToken !== fence.token || this.livePort !== fence.port) {
            return;
          }
          if (putOk) {
            this.everConnected = true;
          }
        }

        if (typeof val.destination_generation === "string" && val.destination_generation && val.destination_generation !== this.destinationGeneration) {
          const newGen = val.destination_generation;
          const fence = { epoch: this.opEpoch, gen, token, port: this.livePort };
          const retireRes = await Outbox.retireStaleGeneration(newGen);
          if (this.opEpoch !== fence.epoch || this.connectionGeneration !== fence.gen || this.connectionToken !== fence.token || this.livePort !== fence.port) {
            return;
          }
          this.destinationGeneration = newGen;
          if (retireRes?.count > 0) {
            this.lossNotice = { seq: retireRes.seq ?? 0, reason: "stale_generation", count: retireRes.count };
          }
        }

        if (this.capturePermitted) {
          this.lease = {
            token: this.connectionToken,
            generation: val.destination_generation,
            freshnessMs: val.freshness_ms,
            receivedAt: nowMs,
          };
        } else {
          this.lease = null;
        }

        this.notify();
        await this.drain();
        return;
      }

      if (val.type === "unsupported") {
        this.behind = val.behind || "extension";
        this.opEpoch++;
        this.handshake = "closed";
        this.lease = null;
        this.capturePermitted = false;
        if (this.livePort) {
          try { this.livePort.disconnect(); } catch (_e) {}
          this.livePort = null;
        }

        if (val.behind === "extension") {
          if (typeof this.requestUpdateCheck === "function") {
            this.updateCheck = "pending";
            this.notify();
            const fenceEpoch = this.opEpoch;
            try {
              const checkPromise = this.requestUpdateCheck();
              if (checkPromise && typeof checkPromise.then === "function") {
                checkPromise.then(
                  (status) => {
                    if (this.opEpoch !== fenceEpoch) return;
                    const st = typeof status === "string" ? status : status?.status;
                    if (st === "no_update" || st === "no-update") this.updateCheck = "no-update";
                    else if (st === "throttled") this.updateCheck = "throttled";
                    else if (st === "update_available" || st === "update-available") this.updateCheck = "update-available";
                    else this.updateCheck = "failure";
                    this.notify();
                  },
                  () => {
                    if (this.opEpoch !== fenceEpoch) return;
                    this.updateCheck = "failure";
                    this.notify();
                  }
                );
              }
            } catch (_e) {
              this.updateCheck = "failure";
              this.notify();
            }
          } else {
            this.updateCheck = "manual";
            this.notify();
          }
        }
        return;
      }

      if (val.type === "accepted") {
        if (this.handshake !== "ready") return;
        if (this.inflightBatch && this.inflightBatch.batchId === val.batch_id) {
          const batchId = val.batch_id;
          const fence = { epoch: this.opEpoch, gen, token, port: this.livePort, destGen: this.destinationGeneration };

          if (val.result === "accepted" || val.result === "duplicate") {
            await Outbox.removeBatch(batchId);
            if (this.opEpoch !== fence.epoch || this.livePort !== fence.port) return;
            if (this.inflightBatch?.batchId === batchId) {
              this.inflightBatch = null;
              this.drainOwner = false;
            }
            this.notify();
            await this.drain();
            return;
          } else if (val.result === "rejected") {
            const rejectRes = await Outbox.applyRejectedReceipt(batchId, val);
            if (this.opEpoch !== fence.epoch || this.livePort !== fence.port) return;
            if (this.inflightBatch?.batchId === batchId) {
              this.inflightBatch = null;
              this.drainOwner = false;
            }
            if (rejectRes?.seq) {
              this.lossNotice = { seq: rejectRes.seq, reason: val.reason, count: rejectRes.removed || 1 };
            }
            if (val.reason === "queue_full" || val.reason === "resource_exhausted") {
              this.retryNotBefore = this.now() + this.retryDelayMs;
              this.schedule(() => this.drain(), this.retryDelayMs);
            } else {
              await this.drain();
            }
            this.notify();
            return;
          }
        }
        return;
      }

      if (val.type === "boundary") {
        if (this.handshake !== "ready") return;
        const fence = { epoch: this.opEpoch, gen, token, port: this.livePort };
        await Outbox.markAllSnapshotRequired();
        if (this.opEpoch !== fence.epoch || this.connectionGeneration !== fence.gen || this.connectionToken !== fence.token || this.livePort !== fence.port) {
          return;
        }
        this.notify();
        if (typeof this.requestSnapshots === "function") {
          this.requestSnapshots();
        }
        return;
      }

      if (val.type === "bye") {
        this.opEpoch++;
        this.handshake = "closed";
        this.lease = null;
        this.capturePermitted = false;
        this.hostCapture = null;
        this.hostDelivery = null;
        this.hostFailure = null;
        this.custody = null;
        if (this.livePort) {
          try { this.livePort.disconnect(); } catch (_e) {}
          this.livePort = null;
        }
        await Outbox.markAllSnapshotRequired();
        this.notify();
      }
    }

    handlePortDisconnect(epoch, gen, token) {
      if (this.opEpoch !== epoch || this.connectionGeneration !== gen || this.connectionToken !== token) return;
      this.opEpoch++;
      this.livePort = null;
      this.handshake = "closed";
      this.lease = null;
      this.capturePermitted = false;
      this.drainOwner = false;
      this.inflightBatch = null;
      this.hostCapture = null;
      this.hostDelivery = null;
      this.hostFailure = null;
      this.custody = null;
      Outbox.markAllSnapshotRequired().catch(() => {});
      this.notify();
    }

    async poll(now) {
      const consts = getConsts();
      const codec = globalThis.SolstoneNativeBrowser;
      const monoNow = Number(now !== undefined ? now : this.now());
      const wallNow = Date.now();

      if (this.livePort && this.handshake === "pending" && this.handshakeStartedAt > 0) {
        if (codec.handshakeExpired(this.handshakeStartedAt, monoNow, consts.HANDSHAKE_MS_BUDGET)) {
          this.opEpoch++;
          if (this.livePort) {
            try { this.livePort.disconnect(); } catch (_e) {}
            this.livePort = null;
          }
          this.handshake = "closed";
          this.capturePermitted = false;
          this.notify();
        }
      }

      if (this.lease) {
        if (!codec.freshnessAuthorizesSkim(this.lease.receivedAt, this.lease.freshnessMs, monoNow)) {
          this.lease = null;
          this.hostCapture = null;
          this.hostDelivery = null;
          this.hostFailure = null;
          this.custody = null;
          this.capturePermitted = false;
          this.notify();
        }
      }

      try {
        const result = await Outbox.retireExpired(monoNow, wallNow);
        if (result && result.count > 0) {
          this.lossNotice = { seq: result.seq, reason: result.reason || result.disposition, count: result.count };
          this.notify();
        }
      } catch (_err) {
        // If retirement throws, do not connect or drain
        return;
      }

      if (!this.livePort) {
        this.connect();
      } else {
        await this.drain();
      }
    }

    async dismissLoss(seq) {
      if (this.lossNotice && this.lossNotice.seq === seq) {
        this.lossNotice = null;
        this.notify();
      }
      return Outbox.dismissLoss(seq);
    }

    async drain() {
      if (this.drainOwner || !this.livePort || this.handshake !== "ready") return;
      if (!this.destinationGeneration) return;
      if (!["permitted", "paused", "intake_off"].includes(this.hostCapture)) return;
      if (this.retryNotBefore && this.now() < this.retryNotBefore) return;

      this.drainOwner = true;
      const fence = {
        epoch: this.opEpoch,
        gen: this.connectionGeneration,
        token: this.connectionToken,
        port: this.livePort,
        destGen: this.destinationGeneration,
      };

      try {
        const head = await Outbox.getHead();
        if (
          this.opEpoch !== fence.epoch ||
          this.connectionGeneration !== fence.gen ||
          this.connectionToken !== fence.token ||
          this.livePort !== fence.port ||
          this.destinationGeneration !== fence.destGen
        ) {
          this.drainOwner = false;
          return;
        }

        if (!head || head.destinationGeneration !== this.destinationGeneration) {
          this.drainOwner = false;
          return;
        }

        const wireBatch = Outbox.buildWireBatch(head);
        Outbox.validateWireBatch(wireBatch);

        this.inflightBatch = {
          batchId: head.batchId,
          seq: head.seq,
          destinationGeneration: head.destinationGeneration,
          wireBatch,
          postedAt: this.now(),
        };

        this.livePort.postMessage(wireBatch);

        this.schedule(() => {
          if (this.inflightBatch?.batchId === head.batchId) {
            this.inflightBatch = null;
            this.drainOwner = false;
            this.drain();
          }
        }, this.inflightAckMs);
      } catch (_err) {
        this.drainOwner = false;
        this.inflightBatch = null;
      }
    }
  }

  globalThis.SolstoneNativePort = SolstoneNativePortController;
})();
