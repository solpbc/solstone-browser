// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc
//
// Relay framing for this lode:
// - Pair WS: ws(s)://<relay-host>/session/pair-dial, subprotocols
//   ["spl-v1", "spl-pair.<RK hex>"]. Pairing is a length-delimited binary byte
//   stream: msg1 = bare 5 bytes "SBP1" || 0x01 (no length prefix);
//   msg2/msg3/msg4 are each u32-big-endian length prefixed; msg3/msg4 payloads
//   are enc(65) || ct.
// - Data WS: ws(s)://<relay-host>/session/dial?instance=<id>&token=<device_token>,
//   subprotocol ["spl-v1"]. One blob per tunnel: Offer, Ready, Sealed chunks
//   (<=64 KiB per send), Ack.
// These paths and frames are this-lode-authoritative and must match sibling
// relay/home lodes.

(function () {
  "use strict";

  const PAIR_DIAL_PATH = "/session/pair-dial";
  const DATA_DIAL_PATH = "/session/dial";
  const CHUNK_BYTES = 64 * 1024;

  function wsUrl(relayOrigin, path) {
    const u = new URL(path, relayOrigin);
    u.protocol = u.protocol === "http:" ? "ws:" : "wss:";
    return u;
  }

  function frameU32(payload) {
    const len = payload.byteLength >>> 0;
    const out = new Uint8Array(4 + payload.byteLength);
    out[0] = (len >>> 24) & 0xff; out[1] = (len >>> 16) & 0xff; out[2] = (len >>> 8) & 0xff; out[3] = len & 0xff;
    out.set(payload, 4);
    return out;
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
          sendU32Frame(payload) {
            ws.send(frameU32(payload));
          },
          recvBinary() {
            return recv("binary");
          },
          reader() {
            let buf = new Uint8Array(0);
            const readExactly = async (n) => {
              while (buf.byteLength < n) {
                const chunk = await recv("binary");
                const merged = new Uint8Array(buf.byteLength + chunk.byteLength);
                merged.set(buf); merged.set(chunk, buf.byteLength);
                buf = merged;
              }
              const out = buf.slice(0, n);
              buf = buf.slice(n);
              return out;
            };
            const readU32Frame = async () => {
              const h = await readExactly(4);
              const len = ((h[0] << 24) | (h[1] << 16) | (h[2] << 8) | h[3]) >>> 0;
              return readExactly(len);
            };
            return { readExactly, readU32Frame };
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
