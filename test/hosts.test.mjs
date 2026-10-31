// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc
//
// Pure-logic tests for the port-safe host helpers — the fix for "observing a
// host:port site silently failed" (Chrome match patterns reject ports).

import { test } from "node:test";
import assert from "node:assert/strict";

await import(new URL("../extension/lib/hosts.js", import.meta.url));
const H = globalThis.SolstoneHosts;

test("all-sites requires explicit scope agreement and live broad access; a left-out site covers its subdomains", () => {
  const state = {siteMode:"all", allSitesConsent:H.ALL_SITES_CONSENT_VERSION, broadGranted:true,
    excludedHosts:["example.com"], chosenOrigins:[], grantedOrigins:[]};
  assert.equal(H.originGranted(state, "https://new.example"), true);
  assert.equal(H.originGranted(state, "https://example.com:8443/path"), false);
  assert.equal(H.originGranted(state, "http://example.com"), false);
  assert.equal(H.originGranted(state, "https://mail.example.com"), false);
  assert.equal(H.originGranted(state, "https://notexample.com"), true);
  assert.equal(H.originGranted(state, "https://example.com.evil.net"), true);
  for (const patch of [{allSitesConsent:0},{broadGranted:false},{sitePolicyPending:true}]) {
    assert.equal(H.originGranted({...state,...patch}, "https://new.example"), false);
  }
  for (const origin of ["file:///tmp/a", "chrome://settings", "about:blank", "not a URL"]) {
    assert.equal(H.originGranted(state, origin), false);
  }
  assert.equal(H.excludedHostname("https://EXAMPLE.com:8443/path"), "example.com");
  assert.equal(H.excludedHostname("*.example.com"), "example.com");
  assert.equal(H.excludedHostname("https://person:secret@example.com"), null);
  const selected = {...state,siteMode:"selected",grantedOrigins:["https://chosen.example"]};
  assert.equal(H.originGranted(selected, "https://new.example"), false);
  assert.equal(H.originGranted(selected, "https://chosen.example"), true);
  // A chosen site covers its subdomains on the same scheme and port, and
  // nothing that merely ends with its name.
  assert.equal(H.originGranted(selected, "https://login.chosen.example"), true);
  assert.equal(H.originGranted(selected, "https://notchosen.example"), false);
  assert.equal(H.originGranted(selected, "http://login.chosen.example"), false);
  assert.equal(H.originGranted(selected, "https://login.chosen.example:8443"), false);
  // An older exact-host grant covers its host alone until it's widened.
  const older = {...selected, exactOnlyOrigins:["https://chosen.example"]};
  assert.equal(H.originGranted(older, "https://chosen.example"), true);
  assert.equal(H.originGranted(older, "https://login.chosen.example"), false);
  // A local name has nothing under it.
  const local = {...selected, grantedOrigins:["http://localhost:3000"]};
  assert.equal(H.originGranted(local, "http://localhost:3000"), true);
  assert.equal(H.originGranted(local, "http://app.localhost:3000"), false);
});

test("splitHost separates a trailing numeric port", () => {
  assert.deepEqual(H.splitHost("localhost:5015"), { hostname: "localhost", port: "5015" });
  assert.deepEqual(H.splitHost("127.0.0.1:8080"), { hostname: "127.0.0.1", port: "8080" });
  assert.deepEqual(H.splitHost("mail.google.com"), { hostname: "mail.google.com", port: "" });
  assert.deepEqual(H.splitHost("EXAMPLE.com:3000"), { hostname: "example.com", port: "3000" });
});

test("matchHostFor strips the port", () => {
  assert.equal(H.matchHostFor("localhost:5015"), "localhost");
  assert.equal(H.matchHostFor("mail.google.com"), "mail.google.com");
  assert.equal(H.matchHostFor("app.slack.com"), "app.slack.com");
  assert.equal(H.matchHostFor("EXAMPLE.COM:443"), "example.com");
});

test("hostObservable combines port-safe membership with browser-paused host state", () => {
  assert.equal(H.hostObservable("localhost:5015", ["localhost:5015"], {}), true);
  assert.equal(H.hostObservable("localhost:3000", ["localhost:5015"], {}), false);
  assert.equal(H.hostObservable("example.com:8080", ["example.com"], {}), true);
  assert.equal(H.hostObservable("example.com:8080", ["example.com"], { "example.com": true }), false);
  assert.equal(H.hostObservable("localhost:5015", ["localhost:5015", "localhost:3000"], { localhost: true }), false);
  assert.equal(H.hostObservable("localhost:3000", ["localhost:5015", "localhost:3000"], { localhost: true }), false);
  assert.equal(H.hostObservable("example.com", ["example.com"], { "other.example": true }), true);
  assert.equal(H.hostObservable("example.com", [], {}), false);
  assert.equal(H.hostObservable("", undefined, undefined), false);
});

test("matchPatternFor builds a VALID (port-less) match pattern", () => {
  // the bug: '*://localhost:5015/*' is an invalid Chrome match pattern
  assert.equal(H.matchPatternFor("localhost:5015"), "*://localhost/*");
  assert.equal(H.matchPatternFor("mail.google.com"), "*://*.mail.google.com/*");
  assert.equal(H.matchPatternFor("example.com:8443"), "*://*.example.com/*");
  assert.equal(H.exactPatternFor("mail.google.com"), "*://mail.google.com/*");
  assert.deepEqual(H.sitePatternsFor("localhost:5015"), ["*://localhost/*"]);
  assert.deepEqual(H.sitePatternsFor("bank.com"), ["*://*.bank.com/*", "*://bank.com/*"]);
  assert.equal(H.grantLevel("bank.com", ["*://*.bank.com/*"]), "site");
  assert.equal(H.grantLevel("bank.com", ["*://*/*"]), "site");
  assert.equal(H.grantLevel("bank.com", ["*://bank.com/*"]), "exact");
  assert.equal(H.grantLevel("bank.com", ["*://*.other.com/*"]), null);
  // a valid pattern never contains a ':' in the host segment
  for (const h of ["localhost:5015", "mail.google.com", "example.com:8443"]) {
    const host = H.matchPatternFor(h).slice("*://".length).replace(/\/\*$/, "");
    assert.ok(!host.includes(":"), `pattern host for ${h} must not contain a port: got ${host}`);
  }
});

test("permissionOriginForUrl preserves the permission origin Chrome reports", () => {
  assert.equal(H.permissionOriginForUrl("http://localhost:5015"), "http://localhost:5015/*");
  assert.equal(H.permissionOriginForUrl("http://localhost:6123/app/observer"), "http://localhost:6123/*");
  assert.equal(H.permissionOriginForUrl("https://relay.example.test/path?q=1"), "https://relay.example.test/*");
  assert.equal(H.permissionOriginForUrl(""), "");
  assert.equal(H.permissionOriginForUrl("not a url"), "");
  assert.equal(H.permissionOriginForUrl("data:text/plain,nope"), "");
});

test("removalSubsumesProtectedOrigin guards port-bearing destinations by hostname", () => {
  const protectedOrigins = ["http://localhost:5015/*", "https://relay.example.test:8443/*"];
  assert.equal(H.removalSubsumesProtectedOrigin("*://localhost/*", protectedOrigins), true);
  assert.equal(H.removalSubsumesProtectedOrigin("*://RELAY.EXAMPLE.TEST/*", protectedOrigins), true);
  assert.equal(H.removalSubsumesProtectedOrigin("*://other.example/*", protectedOrigins), false);
  assert.equal(H.removalSubsumesProtectedOrigin("not a pattern", protectedOrigins), false);
  assert.equal(H.removalSubsumesProtectedOrigin("*://localhost/*", ["not a url"]), false);
});

test("hostAllowed: exact host:port is precise", () => {
  assert.equal(H.hostAllowed("localhost:5015", ["localhost:5015"]), true);
  assert.equal(H.hostAllowed("localhost:3000", ["localhost:5015"]), false); // other port not observed
});

test("hostAllowed: a port-less entry matches the hostname on any port", () => {
  assert.equal(H.hostAllowed("example.com", ["example.com"]), true);
  assert.equal(H.hostAllowed("example.com:8080", ["example.com"]), true);
});

test("hostAllowed: any-site works (generic hosts), non-members rejected", () => {
  assert.equal(H.hostAllowed("news.ycombinator.com", ["news.ycombinator.com"]), true);
  assert.equal(H.hostAllowed("mail.google.com", ["app.slack.com", "mail.google.com"]), true);
  assert.equal(H.hostAllowed("evil.example", ["mail.google.com"]), false);
  assert.equal(H.hostAllowed("mail.google.com", []), false);
});

test("isValidHostInput accepts host-shaped owner input", () => {
  for (const h of ["localhost", "localhost:5015", "192.168.1.10", "myhost:8080", "mail.google.com", "EXAMPLE.com"]) {
    assert.equal(H.isValidHostInput(h), true, h);
  }
});

test("isValidHostInput rejects empty, spaces, and non-host-shaped input", () => {
  for (const h of ["", "   ", "not a url!!", "has spaces here", "bad/host", "bad_host.example", "example.com/path"]) {
    assert.equal(H.isValidHostInput(h), false, h);
  }
});

test("chosenOrigin takes a typed host or a pasted address to one origin", () => {
  const cases = {
    "example.com": "https://example.com",
    "EXAMPLE.com": "https://example.com",
    "httpbin.org": "https://httpbin.org",
    "https://example.com": "https://example.com",
    "http://example.com": "http://example.com",
    "https://example.com/": "https://example.com",
    " HTTPS://Example.com/some/page?q=1#top ": "https://example.com",
    "http://localhost:5015/": "http://localhost:5015",
    "https://example.com:443": "https://example.com",
    // A typed address keeps working with a path, a trailing slash or dot.
    "example.com/": "https://example.com",
    "example.com/path": "https://example.com",
    "github.com/solpbc/solstone": "https://github.com",
    "mail.google.com/mail/u/0/#inbox": "https://mail.google.com",
    // www. and *. in front name the site itself, which covers its subdomains.
    "www.example.com": "https://example.com",
    "https://www.example.com/login": "https://example.com",
    "*.example.com": "https://example.com",
    "https://*.example.com/": "https://example.com",
    "%2a.example.com": "https://example.com",
    "www.mail.google.com": "https://www.mail.google.com",
    "example.com.": "https://example.com",
    "bücher.de": "https://xn--bcher-kva.de",
    // A typed local name means http, where home servers and dev servers are.
    "localhost:5015": "http://localhost:5015",
    "localhost:3000": "http://localhost:3000",
    "192.168.1.1": "http://192.168.1.1",
    "nas.local": "http://nas.local",
    "https://192.168.1.1": "https://192.168.1.1",
  };
  for (const [input, origin] of Object.entries(cases)) assert.equal(H.chosenOrigin(input), origin, input);
  for (const input of ["", "   ", "bad_host.example", "localhost:99999", "ftp://example.com",
    "https://", "https://exa mple.com", "https://example.com/a b", "https://person:secret@example.com",
    "https://bad_host.example", "http://[::1]:8080", "*.", "a.*.example.com",
    "example.com\nother.com"]) {
    assert.equal(H.chosenOrigin(input), null, input);
  }
});

test("a left-out site is a plain name; www. and *. in front name the site itself", () => {
  assert.equal(H.excludedHostname("BANK.com "), "bank.com");
  assert.equal(H.excludedHostname("www.bank.com."), "bank.com");
  assert.equal(H.excludedHostname(".bank.com"), "bank.com");
  assert.equal(H.excludedHostname("https://secure.bank.com/login"), "secure.bank.com");
  // Chromium's parser keeps a typed * as %2a; both mean the site itself.
  for (const input of ["*.bank.com", "%2a.bank.com", "https://%2A.bank.com", "https://*.bank.com/x"]) {
    assert.equal(H.excludedHostname(input), "bank.com", input);
  }
  for (const input of ["bank .com", "", "a.*.bank.com"]) assert.equal(H.excludedHostname(input), null, input);
});

test("a named site covers every address under it; a local name stays exact", () => {
  for (const [site, host, covered] of [
    ["bank.com", "bank.com", true], ["bank.com", "www.bank.com", true], ["bank.com", "a.b.bank.com", true],
    ["bank.com", "notbank.com", false], ["bank.com", "bank.com.evil.net", false],
    ["mail.google.com", "docs.google.com", false], ["localhost", "app.localhost", false], ["10.0.0.1", "10.0.0.1", true],
  ]) assert.equal(H.hostCovers(site, host), covered, `${site} ${host}`);
  assert.equal(H.siteForOrigin(["https://bank.com", "https://other.com"], "https://login.bank.com"), "https://bank.com");
  assert.equal(H.siteForOrigin(["https://bank.com"], "https://other.com"), null);
});

test("an origin is shown with its port, and with http:// when it isn't https", () => {
  assert.equal(H.displayOrigin("https://example.com"), "example.com");
  assert.equal(H.displayOrigin("https://localhost:5015"), "localhost:5015");
  assert.equal(H.displayOrigin("http://localhost:3000"), "http://localhost:3000");
});

test("classifySiteGrant and coverage rules", () => {
  // Broad and malformed
  assert.equal(H.classifySiteGrant("*://*/*"), null);
  assert.equal(H.classifySiteGrant("<all_urls>"), null);
  assert.equal(H.classifySiteGrant("*://localhost:5015/*"), null);
  assert.equal(H.classifySiteGrant("https://*.example.com/*"), null);
  assert.equal(H.classifySiteGrant("http://*.example.com/*"), null);

  // Wildcard site: preserves www, local gets http
  assert.deepEqual(H.classifySiteGrant("*://*.www.example.com/*"), {
    host: "www.example.com", origin: "https://www.example.com", siteWide: true, exactOnly: false,
  });
  assert.deepEqual(H.classifySiteGrant("*://*.measure.test/*"), {
    host: "measure.test", origin: "https://measure.test", siteWide: true, exactOnly: false,
  });
  assert.deepEqual(H.classifySiteGrant("*://*.localhost/*"), {
    host: "localhost", origin: "http://localhost", siteWide: true, exactOnly: false,
  });

  // Exact wildcard site
  assert.deepEqual(H.classifySiteGrant("*://localhost/*"), {
    host: "localhost", origin: "http://localhost", siteWide: true, exactOnly: true,
  });
  assert.deepEqual(H.classifySiteGrant("*://example.com/*"), {
    host: "example.com", origin: "https://example.com", siteWide: true, exactOnly: true,
  });

  // Scheme-specific host grant
  assert.deepEqual(H.classifySiteGrant("https://example.com/*"), {
    host: "example.com", origin: "https://example.com", siteWide: false, exactOnly: true,
  });
  assert.deepEqual(H.classifySiteGrant("http://example.com/*"), {
    host: "example.com", origin: "http://example.com", siteWide: false, exactOnly: true,
  });

  // originCoveredBy: marked vs unmarked
  assert.equal(H.originCoveredBy("https://measure.test", "http://measure.test:8766/", false, true), true);
  assert.equal(H.originCoveredBy("https://measure.test", "https://sub.measure.test/", false, true), true);
  assert.equal(H.originCoveredBy("https://example.com", "http://example.com", true, false), false);
  assert.equal(H.originCoveredBy("https://example.com", "https://sub.example.com", true, false), false);

  // grantLevel: marked ignores broad, unmarked exact not widened by broad
  assert.equal(H.grantLevel("measure.test", ["*://*.measure.test/*"], true), "site");
  assert.equal(H.grantLevel("measure.test", ["*://*/*"], true), null);
  assert.equal(H.grantLevel("localhost", ["*://*.localhost/*"], true), "site");
  assert.equal(H.grantLevel("example.com", ["https://example.com/*", "*://*/*"], false), "exact");
});

test("siteRuleHostPattern accepts valid grammar and rejects malformed hosts", () => {
  const pat = new RegExp(H.siteRuleHostPattern());
  for (const valid of ["[::1]", "a_b.example", "192.168.1.1", "localhost", "xn--bcher-kva.de"]) {
    assert.equal(pat.test(valid), true, valid);
    assert.equal(H.excludedHostname(valid), valid, valid);
  }
  for (const invalid of ["", " ", "a b.com", "*", "example.com/path", "http://foo"]) {
    assert.equal(pat.test(invalid), false, invalid);
  }
});

test("originGranted respects effective left-out in selected and all-sites mode", () => {
  const state = {
    siteMode: "selected",
    grantedOrigins: ["https://mail.google.com"],
    siteWideOrigins: ["https://mail.google.com"],
    excludedHosts: [],
    appLeftOut: ["google.com"],
  };
  assert.equal(H.originGranted(state, "https://mail.google.com"), false);
  state.appLeftOut = [];
  state.excludedHosts = ["google.com"];
  assert.equal(H.originGranted(state, "https://mail.google.com"), false);
  state.siteMode = "all";
  state.broadGranted = true;
  state.allSitesConsent = 1;
  assert.equal(H.originGranted(state, "https://mail.google.com"), false);
});
