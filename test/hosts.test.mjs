// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc
//
// Pure-logic tests for the port-safe host helpers — the fix for "observing a
// host:port site silently failed" (Chrome match patterns reject ports).

import { test } from "node:test";
import assert from "node:assert/strict";

await import(new URL("../extension/lib/hosts.js", import.meta.url));
const H = globalThis.SolstoneHosts;

test("all-sites requires explicit scope agreement and live broad access, with exact-host exclusions", () => {
  const state = {siteMode:"all", allSitesConsent:H.ALL_SITES_CONSENT_VERSION, broadGranted:true,
    excludedHosts:["example.com"], chosenOrigins:[], grantedOrigins:[]};
  assert.equal(H.originGranted(state, "https://new.example"), true);
  assert.equal(H.originGranted(state, "https://example.com:8443/path"), false);
  assert.equal(H.originGranted(state, "http://example.com"), false);
  assert.equal(H.originGranted(state, "https://mail.example.com"), true);
  for (const patch of [{allSitesConsent:0},{broadGranted:false},{sitePolicyPending:true}]) {
    assert.equal(H.originGranted({...state,...patch}, "https://new.example"), false);
  }
  for (const origin of ["file:///tmp/a", "chrome://settings", "about:blank", "not a URL"]) {
    assert.equal(H.originGranted(state, origin), false);
  }
  assert.equal(H.excludedHostname("https://EXAMPLE.com:8443/path"), "example.com");
  assert.equal(H.excludedHostname("*.example.com"), null);
  assert.equal(H.excludedHostname("https://person:secret@example.com"), null);
  const selected = {...state,siteMode:"selected",grantedOrigins:["https://chosen.example"]};
  assert.equal(H.originGranted(selected, "https://new.example"), false);
  assert.equal(H.originGranted(selected, "https://chosen.example"), true);
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
  assert.equal(H.matchPatternFor("mail.google.com"), "*://mail.google.com/*");
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
    "https://*.example.com", "*.example.com", "%2a.example.com", "https://bad_host.example", "http://[::1]:8080",
    "example.com\nother.com"]) {
    assert.equal(H.chosenOrigin(input), null, input);
  }
});

test("a left-out host is a plain name: odd input never saves an entry that matches nothing", () => {
  assert.equal(H.excludedHostname("BANK.com "), "bank.com");
  assert.equal(H.excludedHostname("www.bank.com."), "www.bank.com");
  assert.equal(H.excludedHostname(".bank.com"), "bank.com");
  assert.equal(H.excludedHostname("https://secure.bank.com/login"), "secure.bank.com");
  // Chromium's parser keeps a typed * as %2a; neither form may become an entry.
  for (const input of ["*.bank.com", "%2a.bank.com", "https://%2A.bank.com", "bank .com", ""]) {
    assert.equal(H.excludedHostname(input), null, input);
  }
  assert.equal(H.isWildcardInput("*.bank.com"), true);
  assert.equal(H.isWildcardInput("bank.com"), false);
});

test("bank.com and www.bank.com are twins; other subdomains and local names are not", () => {
  assert.equal(H.wwwTwin("bank.com"), "www.bank.com");
  assert.equal(H.wwwTwin("www.bank.com"), "bank.com");
  assert.equal(H.wwwTwin("bank.co.uk"), "www.bank.co.uk");
  assert.equal(H.wwwTwin("www.bank.co.uk"), "bank.co.uk");
  for (const host of ["mail.google.com", "www.mail.google.com", "login.mybank.com", "localhost", "nas.local", "10.0.0.1", "www.com", ""]) {
    assert.equal(H.wwwTwin(host), null, host);
  }
});

test("an origin is shown with its port, and with http:// when it isn't https", () => {
  assert.equal(H.displayOrigin("https://example.com"), "example.com");
  assert.equal(H.displayOrigin("https://localhost:5015"), "localhost:5015");
  assert.equal(H.displayOrigin("http://localhost:3000"), "http://localhost:3000");
});
