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
      this.requestUpdateCheck = options.requestUpdateCheck || (typeof chrome !== "undefined" && chrome.runtime?.requestUpdateCheck ? chrome.runtime.requestUpdateCheck.bind(chrome.runtime) : null);
      this.onStatusChange = options.onStatusChange || null;
      this.runtimeId = options.runtimeId || (typeof chrome !== "undefined" && chrome.runtime?.id ? chrome.runtime.id : "");
      this.manifestVersion = options.manifestVersion || "0.2.0";
      this.inst = options.inst || "00000000-0000-0000-0000-000000000000";

      this.livePort = null;
      this.connectionGeneration = 0;
      this.connectionToken = null;
      this.handshakeStartedAt = 0;
      this.lastIssuedAt = 0;
      this.lease = null;
      this.hostCapture = "unavailable";
      this.hostDelivery = "unknown";
      this.inflightBatch = null;
      this.everConnected = false;
      this.updateCheck = "pending";
      this.refusal = { reason: null, count: 0 };
      this.truncation = { active: false, blocks: false, text: false };
      this.backpressure = { active: false, reason: null };
      this.paused = false;
      this.grantedOrigins = new Set();
      this.consentVersion = 0;
      this.showPageIndicator = false;
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
      const phase = (!this.everConnected && !this.lease) ? "closed-start" : undefined;
      const gate = Gate.computeDecision({
        lease: this.lease,
        paused: this.paused,
        consentVersion: this.consentVersion,
        originGranted,
        backpressure: this.backpressure,
        hostCapture: this.hostCapture,
        phase,
        now: nowMs,
      });

      return {
        everConnected: !!this.everConnected,
        hostCapture: this.hostCapture,
        hostDelivery: this.hostDelivery,
        gate,
        backpressure: { ...this.backpressure },
        updateCheck: this.updateCheck,
        truncation: { ...this.truncation },
        refusal: { ...this.refusal },
        paused: !!this.paused,
        consentVersion: this.consentVersion,
        grantedOrigins: Array.from(this.grantedOrigins),
        showPageIndicator: !!this.showPageIndicator,
        connected: !!(this.livePort && this.lease),
        hostName: this.hostName,
        lease: this.lease ? { ...this.lease } : null,
      };
    }

    connect() {
      this.connectionGeneration++;
      const currentGen = this.connectionGeneration;
      const currentToken = mintConnectionToken();
      this.connectionToken = currentToken;

      const oldPort = this.livePort;
      this.livePort = null;
      this.lease = null;
      this.inflightBatch = null;

      if (oldPort) {
        try {
          oldPort.disconnect();
        } catch (_e) {
          /* ignore */
        }
      }

      const host = resolveHostName(this.runtimeId);
      this.hostName = host;
      if (!host || typeof this.connectNative !== "function") {
        this.hostCapture = "unavailable";
        this.notify();
        return;
      }

      try {
        this.livePort = this.connectNative(host);
      } catch (_err) {
        this.livePort = null;
        this.hostCapture = "unavailable";
        this.notify();
        return;
      }

      const consts = getConsts();
      this.handshakeStartedAt = this.now();
      const helloMsg = {
        type: "hello",
        protocol: consts.WIRE_PROTOCOL,
        version: this.manifestVersion,
        brand: resolveBrand(),
        inst: this.inst,
      };

      this.livePort.onMessage.addListener((msg) => {
        if (this.connectionGeneration !== currentGen || this.connectionToken !== currentToken) return;
        return this.handlePortMessage(msg, currentGen, currentToken);
      });

      this.livePort.onDisconnect.addListener(() => {
        if (this.connectionGeneration !== currentGen || this.connectionToken !== currentToken) return;
        this.handlePortDisconnect(currentGen, currentToken);
      });

      try {
        this.livePort.postMessage(helloMsg);
      } catch (_e) {
        this.handlePortDisconnect(currentGen, currentToken);
      }
      this.notify();
    }

    async handlePortMessage(msg, gen, token) {
      if (this.connectionGeneration !== gen || this.connectionToken !== token) return;
      const consts = getConsts();
      const codec = globalThis.SolstoneNativeBrowser;
      const rawJson = typeof msg === "string" ? msg : JSON.stringify(msg);
      const decoded = codec.decode(rawJson, "host_to_extension");

      if (decoded.status !== "accept") {
        this.refusal = { reason: decoded.code || "bad_json", count: 1 };
        this.lease = null;
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
        this.hostCapture = val.capture;
        this.hostDelivery = val.delivery;

        const permitted = codec.captureIsPermitted(val);
        const isHelloAck = val.type === "hello_ack";

        if (isHelloAck && !this.everConnected) {
          await DB.put("meta", true, "everConnected");
          this.everConnected = true;
        }

        if (permitted) {
          let canRenew = false;
          if (isHelloAck) {
            canRenew = true;
          } else if (this.lease && codec.mayRenewOnConnection(this.connectionToken, token, this.lastIssuedAt, nowMs, consts.STATE_RENEWAL_MS_INTERVAL)) {
            canRenew = true;
          }

          if (canRenew) {
            this.lastIssuedAt = nowMs;
            const prevGen = this.lease?.generation;
            this.lease = {
              token: this.connectionToken,
              generation: val.destination_generation,
              freshnessMs: val.freshness_ms,
              receivedAt: nowMs,
            };

            if (val.destination_generation && prevGen && prevGen !== val.destination_generation) {
              const retireRes = await Outbox.retireStaleGeneration(val.destination_generation);
              if (retireRes && retireRes.count > 0) {
                this.refusal = { reason: "stale-generation", count: retireRes.count };
              }
            }
          } else {
            this.lease = null;
            await Outbox.markAllSnapshotRequired();
            this.connect();
            return;
          }
        } else {
          this.lease = null;
          await Outbox.markAllSnapshotRequired();
        }

        this.notify();
        await this.drain();
        return;
      }

      if (val.type === "unsupported") {
        if (val.behind === "extension") {
          if (typeof this.requestUpdateCheck === "function") {
            this.updateCheck = "pending";
            this.notify();
            try {
              const checkPromise = this.requestUpdateCheck();
              if (checkPromise && typeof checkPromise.then === "function") {
                checkPromise.then(
                  (status) => {
                    const st = typeof status === "string" ? status : status?.status;
                    if (st === "no_update" || st === "no-update") this.updateCheck = "no-update";
                    else if (st === "throttled") this.updateCheck = "throttled";
                    else if (st === "update_available" || st === "update-available") this.updateCheck = "update-available";
                    else this.updateCheck = "failure";
                    this.notify();
                  },
                  () => {
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

      if (val.type === "boundary") {
        await Outbox.markAllSnapshotRequired();
        this.notify();
        return;
      }

      if (val.type === "accepted") {
        if (this.inflightBatch && this.inflightBatch.batchId === val.batch_id) {
          const batchId = val.batch_id;
          this.inflightBatch = null;
          if (val.result === "accepted" || val.result === "duplicate") {
            await Outbox.removeBatch(batchId);
          } else if (val.result === "rejected") {
            const rejectRes = await Outbox.applyRejectedReceipt(batchId, val);
            if (consts.RECEIPT_CLASSES?.permanent?.includes(val.reason)) {
              this.refusal = { reason: val.reason, count: (rejectRes && rejectRes.removed) || 1 };
            }
          }
        }
        this.notify();
        await this.drain();
        return;
      }

      if (val.type === "bye") {
        this.lease = null;
        if (this.livePort) {
          try { this.livePort.disconnect(); } catch (_e) {}
          this.livePort = null;
        }
        await Outbox.markAllSnapshotRequired();
        this.notify();
      }
    }

    handlePortDisconnect(gen, token) {
      if (this.connectionGeneration !== gen || this.connectionToken !== token) return;
      this.livePort = null;
      this.lease = null;
      this.inflightBatch = null;
      Outbox.markAllSnapshotRequired().catch(() => {});
      this.notify();
    }

    poll(now) {
      const consts = getConsts();
      const codec = globalThis.SolstoneNativeBrowser;
      const nowMs = Number(now !== undefined ? now : this.now());

      if (this.livePort && !this.lease && this.handshakeStartedAt > 0) {
        if (codec.handshakeExpired(this.handshakeStartedAt, nowMs, consts.HANDSHAKE_MS_BUDGET)) {
          if (this.livePort) {
            try { this.livePort.disconnect(); } catch (_e) {}
            this.livePort = null;
          }
          this.notify();
        }
      }

      if (this.lease) {
        if (!codec.freshnessAuthorizesSkim(this.lease.receivedAt, this.lease.freshnessMs, nowMs)) {
          this.lease = null;
          this.notify();
        }
      }

      Outbox.retireExpired(nowMs).then((result) => {
        if (result && result.count > 0) {
          this.refusal = { reason: "expired-unaccepted", count: result.count };
          this.notify();
        }
      }).catch(() => {});

      if (!this.livePort) {
        this.connect();
      } else {
        this.drain();
      }
    }

    async drain() {
      if (this.inflightBatch || !this.livePort || !this.lease) return;

      try {
        const head = await Outbox.getHead();
        if (!head) return;
        if (head.destinationGeneration !== this.lease.generation) return;

        const wireBatch = Outbox.buildWireBatch(head);
        Outbox.validateWireBatch(wireBatch);

        this.inflightBatch = {
          batchId: head.batchId,
          seq: head.seq,
          destinationGeneration: head.destinationGeneration,
          wireBatch,
        };

        this.livePort.postMessage(wireBatch);
      } catch (err) {
        this.inflightBatch = null;
        if (err.disposition === "batch-oversize" || err.disposition === "outbox-full") {
          this.backpressure = { active: true, reason: err.disposition };
          this.notify();
        }
      }
    }
  }

  globalThis.SolstoneNativePort = SolstoneNativePortController;
})();
