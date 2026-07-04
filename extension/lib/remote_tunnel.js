// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc
//
// Relay framing for this lode:
// - Pair WS: ws(s)://<relay-host>/pair/window, subprotocols ["spl-v1", "spl-pair.<RK hex>"].
//   Binary PairHello is "SBP1" || 0x01. Identity is text JSON. Sealed pairing
//   messages are binary enc(65) || ct.
// - Data WS: ws(s)://<relay-host>/session/dial?instance=<id>&token=<device_token>,
//   subprotocol ["spl-v1"]. One blob per tunnel: Offer, Ready, Sealed chunks
//   (<=64 KiB per send), Ack.
// These paths and frames are this-lode-authoritative and must match sibling
// relay/home lodes.

(function () {
  "use strict";

  const PAIR_DIAL_PATH = "/pair/window";
  const DATA_DIAL_PATH = "/session/dial";
  const CHUNK_BYTES = 64 * 1024;

  function wsUrl(relayOrigin, path) {
    const u = new URL(path, relayOrigin);
    u.protocol = u.protocol === "http:" ? "ws:" : "wss:";
    return u;
  }

  function connect(url, protocols) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url.href, protocols);
      ws.binaryType = "arraybuffer";
      const queue = [];
      const waiters = [];
      let closed = false;
      let closeReason = "";

      function push(item) {
        const waiter = waiters.shift();
        if (waiter) waiter.resolve(item);
        else queue.push(item);
      }

      ws.onopen = () => {
        resolve({
          sendBinary(u8) {
            ws.send(u8);
          },
          sendText(s) {
            ws.send(String(s));
          },
          recvBinary() {
            return recv("binary");
          },
          recvText() {
            return recv("text");
          },
          close() {
            try {
              ws.close();
            } catch (_e) {}
          },
        });
      };
      ws.onerror = () => {
        if (ws.readyState !== WebSocket.OPEN) reject(new Error("WebSocket connection failed"));
      };
      ws.onclose = (ev) => {
        closed = true;
        closeReason = `WebSocket closed ${ev.code}${ev.reason ? " " + ev.reason : ""}`;
        while (waiters.length) waiters.shift().reject(new Error(closeReason));
      };
      ws.onmessage = (ev) => {
        if (typeof ev.data === "string") push({ type: "text", data: ev.data });
        else push({ type: "binary", data: new Uint8Array(ev.data) });
      };

      function recv(type) {
        const idx = queue.findIndex((m) => m.type === type);
        if (idx >= 0) return Promise.resolve(queue.splice(idx, 1)[0].data);
        if (closed) return Promise.reject(new Error(closeReason || "WebSocket closed"));
        return new Promise((resolveRecv, rejectRecv) => {
          waiters.push({
            resolve(item) {
              if (item.type === type) resolveRecv(item.data);
              else {
                queue.push(item);
                recv(type).then(resolveRecv, rejectRecv);
              }
            },
            reject: rejectRecv,
          });
        });
      }
    });
  }

  function dialPair(relayOrigin, rkHex) {
    return connect(wsUrl(relayOrigin, PAIR_DIAL_PATH), ["spl-v1", "spl-pair." + rkHex]);
  }

  function dialData(relayOrigin, instanceId, deviceToken) {
    const u = wsUrl(relayOrigin, DATA_DIAL_PATH);
    u.searchParams.set("instance", instanceId);
    u.searchParams.set("token", deviceToken);
    return connect(u, ["spl-v1"]);
  }

  function sendChunked(ws, bytes) {
    for (let off = 0; off < bytes.byteLength; off += CHUNK_BYTES) {
      ws.sendBinary(bytes.slice(off, off + CHUNK_BYTES));
    }
  }

  globalThis.SolstoneRemoteTunnel = { PAIR_DIAL_PATH, DATA_DIAL_PATH, CHUNK_BYTES, dialPair, dialData, sendChunked };
})();
