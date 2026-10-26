// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc
//
// hosts.js — port-safe host handling. Chrome content-script match patterns do
// NOT allow a port in the host, so a site like `localhost:5015` can't be
// registered as `*://localhost:5015/*` — that throws. We register the content
// script for the port-less hostname (`*://localhost/*`) and let the content
// script self-gate on the exact allowlist entry, which restores port precision.
// Permission origins are different: they preserve the URL's port exactly.
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

  // The port-less host used by content-script match patterns and per-site grants.
  function matchHostFor(host) {
    return splitHost(host).hostname;
  }

  // A valid match pattern for a host, port stripped.
  function matchPatternFor(host) {
    return `*://${matchHostFor(host)}/*`;
  }

  function permissionOriginForUrl(input) {
    const raw = String(input || "").trim();
    if (!raw) return "";
    try {
      const url = new URL(raw);
      if (url.protocol !== "http:" && url.protocol !== "https:") return "";
      return `${url.origin}/*`;
    } catch (_e) {
      return "";
    }
  }

  function permissionPatternHostname(pattern) {
    const raw = String(pattern || "").trim();
    const wildcard = /^\*:\/\/([^/]+)\/\*$/.exec(raw);
    if (wildcard) return splitHost(wildcard[1]).hostname;
    try {
      return new URL(raw).hostname.toLowerCase();
    } catch (_e) {
      return "";
    }
  }

  // Permission removal is broader than exact getAll() membership: Chrome can
  // remove a port-bearing grant with a port-less pattern. Compare hostnames so
  // a site cleanup cannot silently sever the journal or relay it still needs.
  function removalSubsumesProtectedOrigin(removalPattern, protectedOrigins) {
    const removedHostname = permissionPatternHostname(removalPattern);
    if (!removedHostname) return false;
    return [...(protectedOrigins || [])].some((origin) => permissionPatternHostname(origin) === removedHostname);
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

  const ALL_SITES_CONSENT_VERSION = 1;

  // A hostname an owner can name: letters, digits and hyphens in dotted labels,
  // or a dotted IPv4 address. Browsers disagree on odd input (Chromium keeps a
  // `*` as `%2a`, Node refuses it), so the parsed result is checked as text.
  function isPlainHostname(hostname) {
    const host = String(hostname || "");
    if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host)) return true;
    return /^[a-z0-9-]+(?:\.[a-z0-9-]+)*$/.test(host);
  }

  function isLocalHostname(hostname) {
    const host = String(hostname || "").toLowerCase();
    return host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") ||
      /^(?:\d{1,3}\.){3}\d{1,3}$/.test(host);
  }

  // The other half of a bare/www pair: bank.com <-> www.bank.com. Only for a
  // registrable-looking name, so mail.google.com has no twin.
  const SECOND_LEVELS = new Set(["co", "com", "org", "net", "ac", "gov", "edu", "ne", "or", "go"]);
  function registrableLooking(host) {
    const labels = host.split(".");
    if (labels.length === 2) return labels.every(Boolean);
    return labels.length === 3 && labels.every(Boolean) && labels[2].length === 2 && SECOND_LEVELS.has(labels[1]);
  }

  // Symmetric by construction: X and www.X pair only when X looks registrable.
  function wwwTwin(hostname) {
    const host = String(hostname || "").toLowerCase();
    if (!host || isLocalHostname(host) || !isPlainHostname(host)) return null;
    if (host.startsWith("www.")) {
      const bare = host.slice(4);
      return registrableLooking(bare) ? bare : null;
    }
    return registrableLooking(host) ? `www.${host}` : null;
  }

  // How a chosen origin is named on screen: its host and port, with http://
  // shown when it isn't https, so two entries never look the same.
  function displayOrigin(origin) {
    try {
      const url = new URL(origin);
      return url.protocol === "http:" ? `http://${url.host}` : url.host;
    } catch (_e) { return String(origin || ""); }
  }

  function excludedHostname(input) {
    const raw = String(input || "").trim();
    if (!raw || /\s/.test(raw)) return null;
    try {
      const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
      if (!/^https?:$/.test(url.protocol) || url.username || url.password) return null;
      const host = url.hostname.toLowerCase().replace(/^\.+/, "").replace(/\.+$/, "");
      if (/^\[[0-9a-f:.]+\]$/.test(host)) return host;
      // Browsers open hosts with an underscore, so one can be left out.
      return isPlainHostname(host.replace(/_/g, "-")) ? host : null;
    } catch (_e) { return null; }
  }

  // A left-out entry saved by an earlier version. Leaving a site out only ever
  // narrows reading, so a stored entry is kept unless it can match nothing (a
  // `*` that Chromium saved as `%2a`); it is never dropped for being unusual.
  function storedExcludedHostname(input) {
    const strict = excludedHostname(input);
    if (strict) return strict;
    const raw = String(input || "").trim().toLowerCase();
    if (!raw || /[\s*%/@]/.test(raw)) return null;
    return raw.replace(/^\.+/, "").replace(/\.+$/, "") || null;
  }

  // A `*` asks for every subdomain, which a left-out site can't mean.
  function isWildcardInput(input) {
    return String(input || "").includes("*");
  }

  // Owner scope and the browser's broad grant are separate facts. Effective
  // document access is additionally enforced by each browser-mediated read.
  function originGranted(state, origin) {
    if (state.sitePolicyPending) return false;
    let url;
    try { url = new URL(origin); } catch (_e) { return false; }
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    if (state.siteMode === "all") {
      return state.allSitesConsent === ALL_SITES_CONSENT_VERSION && state.broadGranted === true &&
        !(state.excludedHosts || []).includes(url.hostname.toLowerCase());
    }
    return Array.from(state.grantedOrigins || []).includes(url.origin);
  }

  function isValidHostInput(input) {
    const raw = String(input || "").trim();
    if (!raw || /\s/.test(raw) || raw.includes("/")) return false;
    const host = raw.replace(/:\d+$/, "").toLowerCase();
    if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host)) return true;
    return /^[a-z0-9-]+(?:\.[a-z0-9-]+)*$/.test(host);
  }

  // A site the owner adds is one origin. A pasted http(s) address keeps its
  // scheme and port; a typed one means https, or http for a local name such as
  // localhost or a router's address. Any path is dropped either way.
  function chosenOrigin(input) {
    const raw = String(input || "").trim();
    if (!raw || /\s/.test(raw)) return null;
    const pasted = /^https?:\/\//i.test(raw);
    if (!pasted && /^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) return null;
    try {
      let url = new URL(pasted ? raw : `https://${raw}`);
      if (url.username || url.password) return null;
      const hostname = url.hostname.toLowerCase().replace(/\.+$/, "");
      if (!isPlainHostname(hostname)) return null;
      const scheme = pasted ? url.protocol : (isLocalHostname(hostname) ? "http:" : "https:");
      url = new URL(`${scheme}//${hostname}${url.port ? `:${url.port}` : ""}`);
      return url.origin;
    } catch (_e) { return null; }
  }

  globalThis.SolstoneHosts = {
    splitHost,
    matchHostFor,
    matchPatternFor,
    permissionOriginForUrl,
    removalSubsumesProtectedOrigin,
    hostAllowed,
    hostObservable,
    ALL_SITES_CONSENT_VERSION,
    excludedHostname,
    originGranted,
    isValidHostInput,
    chosenOrigin,
    isLocalHostname,
    wwwTwin,
    displayOrigin,
    isWildcardInput,
    storedExcludedHostname,
  };
})();
