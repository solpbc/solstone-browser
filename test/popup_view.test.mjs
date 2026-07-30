// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import assert from "node:assert/strict";
import test from "node:test";

await import(new URL("../extension/lib/hosts.js", import.meta.url));
await import(new URL("../extension/lib/status.js", import.meta.url));
await import(new URL("../extension/lib/failures.js", import.meta.url));
await import(new URL("../extension/lib/popup_view.js", import.meta.url));

const Status = globalThis.SolstoneStatus;
const View = globalThis.SolstonePopupView;

function state(overrides = {}) {
  const base = {
    paused: false,
    allowlist: [],
    pausedHosts: {},
    siteErrors: {},
    health: { lastError: null, lastUploadAt: 1, segmentsUploaded: 1, lastStatus: 200, consecutiveFailures: 0 },
    remote: {
      paired: true,
      pending: false,
      instanceId: "00112233445566778899aabbccddeeff",
      relayOrigin: "https://relay.example",
      pairedAt: 1,
    },
    activeSites: [],
    waiting: 0,
    dropped: { segments: 0, lines: 0 },
  };
  return Object.assign(base, overrides);
}

function verdict(overrides = {}) {
  return Object.assign({
    kind: "on",
    tone: "ok",
    headline: "on",
    sub: "going to your journal at your home, sealed on the way",
    reason: "",
    actions: [],
  }, overrides);
}

test("arrange returns sections in the fixed render order and omits absent sections", () => {
  const empty = View.arrange(verdict(), state(), { host: "mail.google.com", ok: true });
  assert.deepEqual(empty.map((section) => section.id), ["verdict", "page", "footer"]);

  const configured = state({
    allowlist: ["mail.google.com", "app.slack.com"],
    activeSites: ["mail.google.com"],
    pausedHosts: { "app.slack.com": true },
  });
  const sections = View.arrange(verdict(), configured, { host: "mail.google.com", ok: true });
  assert.deepEqual(sections.map((section) => section.id), ["verdict", "siteIssues", "page", "siteCount", "footer"]);
});

test("a 40-site allowlist renders only its two attention rows", () => {
  const allowlist = Array.from({ length: 40 }, (_value, index) => `site-${index}.example`);
  const configured = state({
    allowlist,
    activeSites: allowlist,
    pausedHosts: { "site-11.example": true },
    siteErrors: { "site-29.example": "Cannot access chrome:// URL" },
  });
  const sections = View.arrange(verdict(), configured, { host: allowlist[0], ok: true });
  const issues = sections.find((section) => section.id === "siteIssues");
  assert.equal(issues.rows.length, 2);
  assert.deepEqual(issues.rows.map((row) => row.host), ["site-11.example", "site-29.example"]);
  assert.deepEqual(issues.rows.map((row) => row.action.label), ["allow again", "remove this site"]);
  assert.equal(issues.rows[1].label, "chrome doesn't allow extensions on this page");
  assert.equal(JSON.stringify(issues).includes("Cannot access"), false);
  assert.equal(sections.find((section) => section.id === "siteCount").text, "40 sites, 38 on");
});

test("siteCountLine follows the all-on, all-paused, mixed, zero-on, and singular rules", () => {
  assert.equal(View.siteCountLine([]), "");
  assert.equal(View.siteCountLine([{ kind: "on" }]), "1 site, all on");
  assert.equal(View.siteCountLine([{ kind: "paused" }]), "1 site, all paused");
  assert.equal(View.siteCountLine([{ kind: "on" }, { kind: "on" }]), "2 sites, all on");
  assert.equal(View.siteCountLine([{ kind: "paused" }, { kind: "paused" }]), "2 sites, all paused");
  assert.equal(View.siteCountLine([{ kind: "on" }, { kind: "idle" }, { kind: "error" }]), "3 sites, 1 on");
  assert.equal(View.siteCountLine([{ kind: "idle" }, { kind: "error" }]), "2 sites");
  assert.doesNotMatch(View.siteCountLine([{ kind: "idle" }]), /0 on/);
});

test("arrange uses siteRowState for page state, port-safe pauses, and active-site health", () => {
  const configured = state({
    allowlist: ["localhost:5015", "idle.example"],
    activeSites: ["idle.example"],
    pausedHosts: { localhost: true },
  });
  const sections = View.arrange(verdict(), configured, { host: "localhost:5015", ok: true });
  const issue = sections.find((section) => section.id === "siteIssues").rows[0];
  assert.deepEqual(issue, {
    host: "localhost:5015",
    kind: "paused-browser",
    label: "paused by browser",
    action: { id: "allow-site", label: "allow again", host: "localhost:5015" },
  });
  assert.equal(sections.find((section) => section.id === "page").state, "paused by browser");
  assert.equal(sections.find((section) => section.id === "siteCount").text, "2 sites, 1 on");
});

test("page descriptors cover add, remove, unsupported, and pause actions", () => {
  const add = View.arrange(verdict(), state(), { host: "example.com", ok: true }).find((s) => s.id === "page");
  assert.deepEqual(add.siteAction, { id: "add-site", label: "add this site", disabled: false, primary: true });
  assert.equal(add.state, "not added");

  const configured = state({ allowlist: ["example.com"], activeSites: [] });
  const remove = View.arrange(verdict(), configured, { host: "example.com", ok: true }).find((s) => s.id === "page");
  assert.equal(remove.siteAction.id, "remove-site");
  assert.equal(remove.state, "reload this tab to begin");

  const unsupported = View.arrange(verdict(), state(), { host: "", ok: false }).find((s) => s.id === "page");
  assert.equal(unsupported.state, "sol can't take in this page");
  assert.equal(unsupported.siteAction.disabled, true);

  const paused = View.arrange(verdict(), state({ paused: true }), { host: "example.com", ok: true }).find((s) => s.id === "page");
  assert.deepEqual(paused.pauseAction, { id: "set-paused", label: "resume", primary: true });
});

test("addSite confirms before intent and permission in exact order", async () => {
  const calls = [];
  const result = await View.addSite("mail.google.com", {
    disclose: async (host) => { calls.push(["disclose", host]); return true; },
    cmd: async (message) => {
      calls.push([message.cmd, message.host]);
      return message.cmd === "siteIntent" ? { ok: true, added: true } : { ok: true };
    },
    requestPermission: async (request) => { calls.push(["permission", request.origins[0]]); return true; },
  });
  assert.deepEqual(calls, [
    ["disclose", "mail.google.com"],
    ["siteIntent", "mail.google.com"],
    ["permission", "*://mail.google.com/*"],
    ["siteGranted", "mail.google.com"],
  ]);
  assert.deepEqual(result, { ok: true });
});

test("an unconfirmed add reaches no mutation or permission effect", async () => {
  const calls = [];
  const result = await View.addSite("new.example", {
    disclose: async () => { calls.push("disclose"); return false; },
    cmd: async () => { calls.push("mutation"); },
    requestPermission: async () => { calls.push("permission"); },
  });
  assert.deepEqual(result, { ok: false, cancelled: true });
  assert.deepEqual(calls, ["disclose"]);
});

test("a declined grant rolls back a newly added intent", async () => {
  const calls = [];
  const result = await View.addSite("example.com", {
    disclose: async () => true,
    cmd: async (message) => {
      calls.push(message.cmd);
      return message.cmd === "siteIntent" ? { ok: true, added: true } : { ok: true };
    },
    requestPermission: async () => false,
  });
  assert.deepEqual(calls, ["siteIntent", "removeSite"]);
  assert.deepEqual(result, { ok: false, denied: true, added: true });
});

test("grantSite is the direct allow-again path with no disclosure call", async () => {
  const calls = [];
  const result = await View.grantSite("example.com", {
    cmd: async (message) => {
      calls.push(message.cmd);
      return message.cmd === "siteIntent" ? { ok: true, added: false } : { ok: true };
    },
    requestPermission: async () => { calls.push("permission"); return true; },
  });
  assert.deepEqual(calls, ["siteIntent", "permission", "siteGranted"]);
  assert.deepEqual(result, { ok: true });
});
