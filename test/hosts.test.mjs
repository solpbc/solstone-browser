// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc
//
// Pure-logic tests for the port-safe host helpers — the fix for "observing a
// host:port site silently failed" (Chrome match patterns reject ports).

import { test } from "node:test";
import assert from "node:assert/strict";

await import(new URL("../extension/lib/hosts.js", import.meta.url));
const H = globalThis.SolstoneHosts;

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
