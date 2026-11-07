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

  // The exact pattern accepted for site_rule and excludedHostname.
  const SITE_RULE_HOST_PATTERN = "^(\\[[0-9a-fA-F:.]+\\]|(?:\\d{1,3}\\.){3}\\d{1,3}|[a-zA-Z0-9_-]+(?:\\.[a-zA-Z0-9_-]+)*)$";

  function siteRuleHostPattern() {
    return SITE_RULE_HOST_PATTERN;
  }

  // Pure classifier for incoming browser permissions.
  function classifySiteGrant(pattern) {
    const p = String(pattern || "").trim();
    if (!p || p === "<all_urls>" || p === "*://*/*") return null;
    if (/:\d+\/\*$/.test(p)) return null;
    if (/^https?:\/\/\*\.[^/]+\/\*$/.test(p)) return null;

    const siteWild = /^\*:\/\/\*\.([^/]+)\/\*$/.exec(p);
    if (siteWild) {
      const H = siteWild[1].toLowerCase();
      if (!H || H.includes(":") || H === "*") return null;
      const scheme = isLocalHostname(H) ? "http:" : "https:";
      return { host: H, origin: `${scheme}//${H}`, siteWide: true, exactOnly: false };
    }

    const siteExact = /^\*:\/\/([^/]+)\/\*$/.exec(p);
    if (siteExact) {
      const H = siteExact[1].toLowerCase();
      if (!H || H.includes(":") || H.startsWith("*.") || H === "*") return null;
      const scheme = isLocalHostname(H) ? "http:" : "https:";
      return { host: H, origin: `${scheme}//${H}`, siteWide: true, exactOnly: true };
    }

    const schemeExact = /^(https?):\/\/([^/]+)\/\*$/.exec(p);
    if (schemeExact) {
      const scheme = schemeExact[1].toLowerCase();
      const H = schemeExact[2].toLowerCase();
      if (!H || H.includes(":") || H.startsWith("*.") || H === "*") return null;
      return { host: H, origin: `${scheme}://${H}`, siteWide: false, exactOnly: true };
    }

    return null;
  }

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

  // A site an owner names covers that name and every name under it: bank.com
  // is bank.com, www.bank.com, login.bank.com and so on. A local name (a
  // machine, a router) has nothing under it, so it stays exact.
  function coversSubdomains(hostname) {
    const host = String(hostname || "").toLowerCase();
    return host.includes(".") && !isLocalHostname(host) && isPlainHostname(host.replace(/_/g, "-"));
  }

  // The pattern this site is granted and registered under, port stripped:
  // `*://*.bank.com/*` matches bank.com itself and every subdomain.
  function matchPatternFor(host) {
    const hostname = matchHostFor(host);
    return coversSubdomains(hostname) ? `*://*.${hostname}/*` : `*://${hostname}/*`;
  }

  // The exact-host pattern a site added before sites covered their subdomains
  // was granted under. It still counts for that host alone.
  function exactPatternFor(host) {
    return `*://${matchHostFor(host)}/*`;
  }

  function sitePatternsFor(host) {
    return [...new Set([matchPatternFor(host), exactPatternFor(host)])];
  }

  // What the browser grants a chosen site: "site" (it and its subdomains),
  // "exact" (an older grant for the host alone), or null.
  function grantLevel(host, livePatterns, marked = false, scheme = null) {
    const live = new Set(livePatterns || []);
    const h = matchHostFor(host);
    if (marked) {
      if (live.has(`*://*.${h}/*`)) return "site";
      if (live.has(`*://${h}/*`)) return "exact";
      // A wider site grant covers it too: Safari keeps only the broadest
      // pattern, so allowing the parent drops this entry's own. The all-sites
      // pattern still doesn't count for an entry adopted from a browser grant.
      return coveredByWiderSite(h, live) ? "site" : null;
    }
    if (live.has(matchPatternFor(h))) return "site";
    if (live.has(exactPatternFor(h))) return "exact";
    const s = scheme ? scheme.replace(/:$/, "").toLowerCase() : null;
    if ((!s || s === "https") && live.has(`https://${h}/*`)) return "exact";
    if ((!s || s === "http") && live.has(`http://${h}/*`)) return "exact";
    if (live.has("*://*/*")) return "site";
    // A wider site grant covers the names under it. Firefox doesn't record a
    // request that a wider grant already covers, so it lists only the wider one.
    return coveredByWiderSite(h, live) ? "site" : null;
  }

  function coveredByWiderSite(h, live) {
    for (const pattern of live) {
      const site = patternSiteHost(pattern);
      if (site && site !== h && hostCovers(site, h)) return true;
    }
    return false;
  }

  // Which chosen sites cover only their exact address. Whether a site is
  // granted and how much of it is read are separate: a site widens only when
  // the browser grants its own whole-site pattern. A wider site's grant, the
  // all-sites grant, or its own grant lapsing never changes it, so a site
  // added before sites covered their subdomains is never widened silently.
  // With no stored answer yet (`priorKnown` false), a site the browser covers
  // only through someone else's pattern counts as exact until the owner widens it.
  function exactScope({ chosen, live, prior, priorKnown }) {
    const liveSet = new Set(live || []);
    const before = new Set(prior || []);
    const exact = [];
    for (const origin of chosen || []) {
      let host = "";
      let scheme = "";
      try {
        const u = new URL(origin);
        host = matchHostFor(u.host);
        scheme = u.protocol.replace(/:$/, "");
      } catch (_e) {
        continue;
      }
      if (!host) continue;
      if (liveSet.has(matchPatternFor(host))) continue;
      const ownExact = liveSet.has(exactPatternFor(host)) ||
        ((scheme === "https") && liveSet.has(`https://${host}/*`)) ||
        ((scheme === "http") && liveSet.has(`http://${host}/*`));
      if (ownExact) { exact.push(origin); continue; }
      if (priorKnown) {
        if (before.has(origin)) exact.push(origin);
        continue;
      }
      if (liveSet.has("*://*/*") || coveredByWiderSite(host, liveSet)) exact.push(origin);
    }
    return exact.sort();
  }

  // The host a site pattern covers (`*://*.bank.com/*` → bank.com), if any.
  function patternSiteHost(pattern) {
    const match = /^\*:\/\/\*\.([^/]+)\/\*$/.exec(String(pattern || ""));
    return match ? match[1].toLowerCase() : null;
  }

  // Whether `hostname` falls under the site named `siteHost`.
  function hostCovers(siteHost, hostname) {
    const site = String(siteHost || "").toLowerCase();
    const host = String(hostname || "").toLowerCase();
    if (!site || !host) return false;
    return host === site || (coversSubdomains(site) && host.endsWith(`.${site}`));
  }

  // Whether a page origin falls under a chosen site origin: same scheme and
  // port, and the site's host or a name under it. `exactOnly` limits an older
  // grant to the host alone. `siteWide` ignores scheme and port.
  function originCoveredBy(siteOrigin, origin, exactOnly = false, siteWide = false) {
    try {
      const site = new URL(siteOrigin);
      const page = new URL(origin);
      if (!siteWide) {
        if (site.protocol !== page.protocol || site.port !== page.port) return false;
      }
      return exactOnly ? site.hostname === page.hostname : hostCovers(site.hostname, page.hostname);
    } catch (_e) { return false; }
  }

  // The chosen site a page belongs to, if any. A site under an older
  // exact-host grant covers its own address alone.
  function siteForOrigin(chosen, origin, exactOnly = [], siteWide = []) {
    const entries = Array.from(chosen || []);
    const exact = new Set(exactOnly || []);
    const wide = new Set(siteWide || []);
    return entries.find((entry) => entry === origin) ||
      entries.find((entry) => originCoveredBy(entry, origin, exact.has(entry), wide.has(entry))) || null;
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

  // A name an owner types with www in front means the site itself: www.bank.com
  // is bank.com. Only for a registrable-looking name, so www.mail.google.com
  // stays as typed.
  const SECOND_LEVELS = new Set(["co", "com", "org", "net", "ac", "gov", "edu", "ne", "or", "go"]);
  function registrableLooking(host) {
    const labels = host.split(".");
    if (labels.length === 2) return labels.every(Boolean);
    return labels.length === 3 && labels.every(Boolean) && labels[2].length === 2 && SECOND_LEVELS.has(labels[1]);
  }

  function siteHostname(hostname) {
    const host = String(hostname || "").toLowerCase().replace(/^\*\./, "").replace(/^\.+/, "").replace(/\.+$/, "");
    if (host.startsWith("www.") && registrableLooking(host.slice(4))) return host.slice(4);
    return host;
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
    // `*.bank.com` says what leaving out bank.com already does.
    const raw = String(input || "").trim().replace(/^(https?:\/\/)?(?:\*|%2a)\./i, "$1");
    if (!raw || /\s/.test(raw)) return null;
    if (!/^https?:\/\//i.test(raw) && raw.includes("/")) return null;
    try {
      const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
      if (!/^https?:$/.test(url.protocol) || url.username || url.password) return null;
      const host = siteHostname(url.hostname);
      return new RegExp(SITE_RULE_HOST_PATTERN).test(host) ? host : null;
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

  function isBroadPattern(pattern) {
    const raw = String(pattern || "").trim();
    return raw === "*://*/*" || raw === "<all_urls>" || raw === "http://*/*" || raw === "https://*/*";
  }

  function broadLive(patterns) {
    return (patterns || []).some((p) => isBroadPattern(p));
  }

  // Section 7.1 plain grammar check.
  function plainAllow(pattern, url) {
    let u;
    try {
      u = (url instanceof URL) ? url : new URL(String(url));
    } catch (_e) {
      return false;
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;

    const p = String(pattern || "").trim();
    if (p === "*://*/*" || p === "<all_urls>") return true;
    if (p === "http://*/*") return u.protocol === "http:";
    if (p === "https://*/*") return u.protocol === "https:";

    if (!p.endsWith("/*")) return false;

    let scheme = "";
    let rest = "";
    if (p.startsWith("*://")) {
      scheme = "*";
      rest = p.slice(4, -2);
    } else if (p.startsWith("https://")) {
      scheme = "https";
      rest = p.slice(8, -2);
    } else if (p.startsWith("http://")) {
      scheme = "http";
      rest = p.slice(7, -2);
    } else {
      return false;
    }

    if (scheme === "https" && u.protocol !== "https:") return false;
    if (scheme === "http" && u.protocol !== "http:") return false;

    let wildcard = false;
    if (rest.startsWith("*.")) {
      wildcard = true;
      rest = rest.slice(2);
    }

    if (!rest || rest.includes("*") || rest.includes("/")) return false;

    const { hostname: patternHostRaw, port: patternPort } = splitHost(rest);
    const patternHost = patternHostRaw.toLowerCase();
    if (!patternHost) return false;

    if (patternPort) {
      const uPort = u.port || (u.protocol === "https:" ? "443" : "80");
      if (uPort !== patternPort) return false;
    }

    const pageHost = u.hostname.toLowerCase();
    if (wildcard) {
      return pageHost === patternHost || pageHost.endsWith(`.${patternHost}`);
    }
    return pageHost === patternHost;
  }

  // Whether a browser grant pattern is accounted for by the fence.
  function patternAccounted(pattern, fence, leftOutHosts) {
    if (!fence) return false;
    const p = String(pattern || "").trim();

    let pHost = null;
    const mHost = /^(?:\*|https?):\/\/(?:\*\.)?([^/:]+)(?::\d+)?\/\*$/.exec(p);
    if (mHost && mHost[1] !== "*") {
      pHost = mHost[1].toLowerCase();
    }
    if (pHost && Array.isArray(leftOutHosts) && leftOutHosts.length > 0) {
      const normalizedPHost = siteHostname(pHost);
      const isLeftOut = leftOutHosts.some((excluded) => {
        const exh = siteHostname(excluded);
        return normalizedPHost === exh || normalizedPHost.endsWith(`.${exh}`);
      });
      if (isLeftOut) return true;
    }

    let h = null;
    const mWild = /^\*:\/\/\*\.([^/:]+)\/\*$/.exec(p);
    if (mWild) {
      h = mWild[1].toLowerCase();
    } else {
      const mExact = /^(?:\*|https):\/\/([^/*:]+)\/\*$/.exec(p);
      if (mExact) {
        h = mExact[1].toLowerCase();
      }
    }
    if (!h || h === "*") return false;

    const exactSet = new Set(fence.exact || []);
    const entries = Array.from(fence.entries || []);
    for (const entry of entries) {
      let eu;
      try {
        eu = new URL(entry);
      } catch (_e) {
        continue;
      }
      if (eu.protocol === "https:" && !eu.port && eu.hostname.toLowerCase() === h) {
        if (!exactSet.has(entry)) {
          return true;
        }
      }
    }
    return false;
  }

  function fenceAllows(fence, url, livePatterns, excludedHosts = [], appLeftOut = []) {
    if (!fence) return false;
    let u;
    try {
      u = (url instanceof URL) ? url : new URL(String(url));
    } catch (_e) {
      return false;
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;

    const rawHost = u.hostname.toLowerCase();
    const effectiveLeftOut = [...(excludedHosts || []), ...(appLeftOut || [])];
    if (effectiveLeftOut.some((site) => hostCovers(site, rawHost))) return false;

    const declined = fence.declined || [];
    if (declined.some((site) => hostCovers(site, rawHost))) return false;

    const exactSet = (fence.exactKnown === false)
      ? new Set(fence.entries || [])
      : new Set(fence.exact || []);
    const siteWideSet = new Set(fence.siteWide || []);

    const entries = Array.from(fence.entries || []);
    for (const entry of entries) {
      let entryHost = "";
      let entryScheme = "";
      try {
        const eu = new URL(entry);
        entryHost = eu.host;
        entryScheme = eu.protocol;
      } catch (_e) {
        continue;
      }
      const lvl = grantLevel(entryHost, livePatterns, siteWideSet.has(entry), entryScheme);
      if (!lvl) continue;
      if (originCoveredBy(entry, u.origin, exactSet.has(entry), siteWideSet.has(entry))) {
        return true;
      }
    }
    return false;
  }

  function beyondExample(fence, patterns, leftOutHosts) {
    const unaccounted = (patterns || []).filter((p) => !patternAccounted(p, fence, leftOutHosts));
    if (unaccounted.length === 0) return null;
    if (unaccounted.some((p) => isBroadPattern(p))) {
      return { kind: "every" };
    }

    const fenceHostnames = new Set();
    for (const entry of (fence?.entries || [])) {
      try {
        const u = new URL(entry);
        if (u.hostname) fenceHostnames.add(u.hostname.toLowerCase());
      } catch (_e) {}
    }

    function getPatternHost(p) {
      const raw = String(p || "").trim();
      const m = /^(?:\*|https?):\/\/(?:\*\.)?([^/:]+)(?::\d+)?\/\*$/.exec(raw);
      if (m && m[1] !== "*") return m[1].toLowerCase();
      return raw;
    }

    for (const p of unaccounted) {
      const host = getPatternHost(p);
      if (host && fenceHostnames.has(host)) {
        return { kind: "wider", host };
      }
    }

    const firstHost = getPatternHost(unaccounted[0]);
    return { kind: "other", host: firstHost };
  }

  // Owner scope and the browser's broad grant are separate facts. Effective
  // document access is additionally enforced by each browser-mediated read.
  function originGranted(state, origin) {
    if (!state || state.sitePolicyPending) return false;
    let url;
    try { url = (origin instanceof URL) ? origin : new URL(origin); } catch (_e) { return false; }
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;

    if (state.fence !== null && state.fence !== undefined) {
      return fenceAllows(state.fence, url, state.livePatterns, state.excludedHosts, state.appLeftOut);
    }

    const siteHost = siteHostname(url.hostname);
    const leftOutHosts = [...(state.excludedHosts || []), ...(state.appLeftOut || [])];
    const isLeftOut = leftOutHosts.some((site) => {
      const exh = siteHostname(site);
      return siteHost === exh || siteHost.endsWith(`.${exh}`);
    });
    if (isLeftOut) return false;

    if (Array.isArray(state.livePatterns)) {
      return state.livePatterns.some((pattern) => plainAllow(pattern, url));
    }
    return false;
  }

  function isValidHostInput(input) {
    const raw = String(input || "").trim();
    if (!raw || /\s/.test(raw) || raw.includes("/")) return false;
    const host = raw.replace(/:\d+$/, "").toLowerCase();
    if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host)) return true;
    return /^[a-z0-9-]+(?:\.[a-z0-9-]+)*$/.test(host);
  }

  // A site the owner adds is one origin, which covers its subdomains. A pasted
  // http(s) address keeps its scheme and port; a typed one means https, or http
  // for a local name such as localhost or a router's address. Any path is
  // dropped, and a leading www. or *. names the site itself.
  function chosenOrigin(input) {
    const raw = String(input || "").trim().replace(/^(https?:\/\/)?(?:\*|%2a)\./i, "$1");
    if (!raw || /\s/.test(raw)) return null;
    const pasted = /^https?:\/\//i.test(raw);
    if (!pasted && /^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) return null;
    try {
      let url = new URL(pasted ? raw : `https://${raw}`);
      if (url.username || url.password) return null;
      const hostname = siteHostname(url.hostname);
      if (!isPlainHostname(hostname)) return null;
      const scheme = pasted ? url.protocol : (isLocalHostname(hostname) ? "http:" : "https:");
      url = new URL(`${scheme}//${hostname}${url.port ? `:${url.port}` : ""}`);
      return url.origin;
    } catch (_e) { return null; }
  }

  // Snapshot applier bookkeeping for fence exact marks, sawMore, and auto-end.
  function applySnapshotToFence(fence, appliedPatterns, options = {}) {
    if (!fence) return { fence: null, ended: false };
    const { wallNow = Date.now(), tombstoneFiltered = false, leftOutHosts = [] } = options;
    const applied = appliedPatterns || [];
    const liveSet = new Set(applied);

    let exact = [...(fence.exact || [])];
    let exactKnown = fence.exactKnown;
    if (!exactKnown) {
      exact = exactScope({
        chosen: fence.entries || [],
        live: applied,
        prior: exact,
        priorKnown: false,
      });
      exactKnown = true;
    } else {
      const exactSet = new Set(exact);
      for (const entry of fence.entries || []) {
        try {
          const u = new URL(entry);
          const h = matchHostFor(u.host);
          const s = u.protocol.replace(/:$/, "").toLowerCase();
          const ownExact = liveSet.has(`*://${h}/*`) ||
            (s === "https" && liveSet.has(`https://${h}/*`)) ||
            (s === "http" && liveSet.has(`http://${h}/*`));
          if (ownExact && !exactSet.has(entry)) {
            exactSet.add(entry);
            exact.push(entry);
          }
        } catch (_e) {}
      }
      exact.sort();
    }

    let sawMore = fence.sawMore || false;
    let cleanAt = fence.cleanAt ?? null;

    let isClean = true;
    if (tombstoneFiltered) {
      isClean = false;
    }

    for (const pattern of applied) {
      if (!patternAccounted(pattern, { ...fence, exact, exactKnown }, leftOutHosts)) {
        sawMore = true;
        cleanAt = null;
        isClean = false;
        break;
      }
    }

    if ((fence.entries || []).length > 0 && applied.length === 0) {
      isClean = false;
    }

    if (sawMore) {
      isClean = false;
    }

    let ended = false;
    let updatedFence = {
      ...fence,
      exact,
      exactKnown,
      sawMore,
      cleanAt,
    };

    if (isClean) {
      if (cleanAt === null) {
        cleanAt = wallNow;
        updatedFence.cleanAt = cleanAt;
      } else if (wallNow >= cleanAt) {
        if (wallNow - cleanAt >= 60000) {
          ended = true;
          updatedFence = null;
        }
      }
    }

    return { fence: updatedFence, ended };
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
    displayOrigin,
    storedExcludedHostname,
    coversSubdomains,
    exactPatternFor,
    sitePatternsFor,
    grantLevel,
    exactScope,
    hostCovers,
    originCoveredBy,
    siteForOrigin,
    siteHostname,
    patternSiteHost,
    classifySiteGrant,
    siteRuleHostPattern,
    plainAllow,
    patternAccounted,
    isBroadPattern,
    broadLive,
    fenceAllows,
    applySnapshotToFence,
    beyondExample,
  };
})();
