// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc
//
// hosts.js — port-safe host handling. Chrome match patterns (used by
// chrome.scripting.registerContentScripts and chrome.permissions.request) do
// NOT allow a port in the host, so a site like `localhost:5015` can't be
// registered as `*://localhost:5015/*` — that throws. We register the content
// script for the port-less hostname (`*://localhost/*`) and let the content
// script self-gate on the exact allowlist entry, which restores port precision.
//
// Published as `globalThis.SolstoneHosts` (classic-script + node-import, same
// pattern as the other lib/* files).

(function () {
  "use strict";

  // Split "name:port" -> {hostname, port}. Conservative: only treats a trailing
  // ":<digits>" as a port (leaves IPv6 literals and bare hosts alone).
  function splitHost(host) {
    const h = String(host || "").trim().toLowerCase();
    const i = h.lastIndexOf(":");
    if (i > 0 && /^\d+$/.test(h.slice(i + 1)) && !h.slice(0, i).includes(":")) {
      return { hostname: h.slice(0, i), port: h.slice(i + 1) };
    }
    return { hostname: h, port: "" };
  }

  // The host to use in a Chrome match pattern / permission origin (no port).
  function matchHostFor(host) {
    return splitHost(host).hostname;
  }

  // A valid match pattern for a host, port stripped.
  function matchPatternFor(host) {
    return `*://${matchHostFor(host)}/*`;
  }

  // Self-gate: should a tab currently at `locationHost` be observed, given the
  // owner's allowlist? Rules:
  //   - exact "host:port" entry  -> observe only that exact host:port
  //   - port-less entry          -> observe that hostname on any port
  // This gives port precision despite the coarse (port-less) match pattern.
  function hostAllowed(locationHost, allowlist) {
    const lh = String(locationHost || "").toLowerCase();
    const lhn = splitHost(lh).hostname;
    for (const entry of allowlist || []) {
      const e = String(entry || "").toLowerCase();
      if (!e) continue;
      if (e === lh) return true;
      const es = splitHost(e);
      if (!es.port && es.hostname === lhn) return true;
    }
    return false;
  }

  function hostObservable(locationHost, allowlist, pausedHosts) {
    if (!hostAllowed(locationHost, allowlist)) return false;
    return !((pausedHosts || {})[matchHostFor(locationHost)]);
  }

  function isValidHostInput(input) {
    const raw = String(input || "").trim();
    if (!raw || /\s/.test(raw) || raw.includes("/")) return false;
    const host = raw.replace(/:\d+$/, "").toLowerCase();
    if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host)) return true;
    return /^[a-z0-9-]+(?:\.[a-z0-9-]+)*$/.test(host);
  }

  globalThis.SolstoneHosts = { splitHost, matchHostFor, matchPatternFor, hostAllowed, hostObservable, isValidHostInput };
})();
