// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync, readdirSync} from "node:fs";
import {createHash} from "node:crypto";
import "fake-indexeddb/auto";

for (const path of ["native-browser/constants.js", "native-browser/schemas.js", "native-browser/schema-validator.js", "native-browser/codec.js", "lib/uuid.js", "lib/db.js", "lib/blocks.js", "lib/segment.js", "lib/gate.js", "lib/native_outbox.js", "lib/about.js", "lib/native_port.js"]) {
  await import(new URL("../extension/" + path, import.meta.url));
}
const About = globalThis.SolstoneAbout, DB = globalThis.SolstoneDB, Outbox = globalThis.SolstoneNativeOutbox;
const fixtures = JSON.parse(readFileSync(new URL("../contracts/about-contract/native-about.json", import.meta.url)));
const facts = fixtures.valid[0];

class Port {
  messages = []; disconnects = [];
  onMessage = {addListener: fn => this.messages.push(fn)};
  onDisconnect = {addListener: fn => this.disconnects.push(fn)};
  postMessage() {}
  disconnect() { for (const fn of this.disconnects) fn(); }
  async receive(message) { for (const fn of this.messages) await fn(message); }
}
async function fixture() {
  for (const name of ["outbox", "producer", "meta"]) await DB.clear(name);
  const ports = [], updates = [], timers = []; let now = 100;
  const controller = new globalThis.SolstoneNativePort({inst: "00000000-0000-0000-0000-000000000001", runtimeId: "fgfnkcefedeheoeamppkiiloncfekakf", now: () => now,
    connectNative: () => { const port = new Port(); ports.push(port); return port; }, schedule: fn => {timers.push(fn); return timers.length;}, onStatusChange: state => updates.push(state)});
  controller.connect();
  return {controller, ports, updates, timers, set now(value) {now = value;}};
}
function state(type = "state", about = facts, destination = "fixture-a", freshness = 15000) {
  const value = {...fixtures.envelopes[0], type, destination_generation: destination, freshness_ms: freshness};
  if (about === undefined) delete value.about; else value.about = about;
  return value;
}

test("immutable authority import, exact seven-key decoder and literal envelopes", async () => {
  const base = new URL("../contracts/about-contract/", import.meta.url);
  const record = JSON.parse(readFileSync(new URL("../contracts/about-contract-import.json", import.meta.url)));
  const manifestBytes = readFileSync(new URL("manifest.json", base));
  const hash = bytes => createHash("sha256").update(bytes).digest("hex");
  assert.equal(record.authority_commit, "ec1983799b66d3616708851d01803e4f3d6f0a20");
  assert.equal(hash(manifestBytes), record.manifest_sha256);
  const manifest = JSON.parse(manifestBytes);
  assert.equal(manifest.bundle_version, record.bundle_version);
  assert.deepEqual(readdirSync(base).sort(), [...Object.keys(manifest.artifacts), "manifest.json"].sort());
  for (const [name, digest] of Object.entries(manifest.artifacts)) assert.equal(hash(readFileSync(new URL(name, base))), digest);
  for (const value of fixtures.valid) assert.deepEqual(About.decode(value), value);
  for (const value of fixtures.invalid) assert.equal(About.decode(value), null);
  for (const value of fixtures.envelopes) {
    const f = await fixture(); await f.ports[0].receive(state("hello_ack"));
    await f.ports[0].receive({...value, type: "state"});
    assert.equal(f.controller.handshake, "ready", "optional failure must preserve core state");
    assert.equal(f.controller.getStatus().about?.journal_line, About.decode(value.about)?.journal_line || facts.journal_line);
  }
  for (const value of fixtures.invalid_core_envelopes) {
    const f = await fixture(); await f.ports[0].receive(state("hello_ack"));
    await f.ports[0].receive(value); assert.equal(f.controller.handshake, "closed");
    assert.equal(f.controller.getStatus().about?.journal_current, false);
  }
});

test("same destination failure keeps last-known facts and age; new destination clears before awaits", async () => {
  const f = await fixture(); await f.ports[0].receive(state("hello_ack"));
  const seen = facts.journal_seen_at_epoch_secs;
  assert.equal(f.controller.getStatus().about.journal_current, true);
  for (const optional of [undefined, {...facts, hostname: "PRIVATE_HOST"}]) {
    const value = state(); if (optional === undefined) delete value.about; else value.about = optional;
    await f.ports[0].receive(value);
    assert.equal(f.controller.getStatus().about.journal_current, false);
    assert.equal(f.controller.getStatus().about.journal_seen_at_epoch_secs, seen);
  }
  await f.ports[0].receive(state());
  const original = Outbox.promoteHeldForGeneration; let release;
  Outbox.promoteHeldForGeneration = (_generation, _authorize) => new Promise(resolve => {release = resolve;});
  try {
    const switched = state("state", {...facts, hostname: "PRIVATE_NEW_HOST"}, "destination-b");
    const pending = f.ports[0].receive(switched);
    assert.equal(f.updates.at(-1).about, null, "withdraw old journal before durable transition completes");
    release({count: 0}); await pending;
    assert.equal(f.controller.getStatus().about, null);
  } finally {Outbox.promoteHeldForGeneration = original;}
});

test("disconnect, new-port absence, native deadline and zero freshness preserve existing authority rules", async () => {
  const f = await fixture(); await f.ports[0].receive(state("hello_ack"));
  f.now = 15100;
  assert.equal(f.controller.livePort, f.ports[0]);
  assert.equal(f.controller.getStatus().about.journal_current, false);
  assert.match(About.block("v0.2.0", f.controller.getStatus().about, 1700172800), /last seen 2 days ago$/);
  await f.ports[0].receive(state()); assert.equal(f.controller.getStatus().about.journal_current, true);
  const absent = state(); delete absent.about;
  await f.ports[0].receive(absent); assert.equal(f.controller.getStatus().about.journal_current, false);
  await f.ports[0].receive(state("state", facts, "fixture-a", 0));
  assert.equal(f.controller.getStatus().about.journal_current, false);
  f.ports[0].disconnect(); assert.equal(f.controller.getStatus().about.journal_current, false);
  f.controller.connect();
  const old = state("hello_ack"); delete old.about;
  await f.ports[1].receive(old); assert.equal(f.controller.getStatus().about, null);
  await f.ports[0].receive(state()); assert.equal(f.controller.getStatus().about, null);
});

test("receipt deadline and revision fences exclude obsolete asynchronous completions", async () => {
  const f = await fixture(); await f.ports[0].receive(state("hello_ack"));
  const original = Outbox.promoteHeldForGeneration; const releases = [];
  Outbox.promoteHeldForGeneration = (_generation, _authorize) => new Promise(resolve => releases.push(resolve));
  try {
    const older = f.ports[0].receive(state("state", facts, "fixture-a", 10));
    f.now = 111;
    releases.shift()({count: 0}); await older;
    assert.equal(f.controller.getStatus().about.journal_current, false);
    const pending = f.ports[0].receive(state("state", facts, "fixture-a"));
    const newer = f.ports[0].receive(state("state", fixtures.valid[1], "fixture-a"));
    releases[1]({count: 0}); await newer;
    releases[0]({count: 0}); await pending;
    assert.equal(f.controller.getStatus().about.journal_line, "journal unknown");
    assert.equal(f.controller.getStatus().about.journal_seen_at_epoch_secs, null);
  } finally {Outbox.promoteHeldForGeneration = original;}
});

test("display rendering projects only public facts, normalizes aliases and never invents age", async () => {
  const f = await fixture();
  const message = state("hello_ack");
  for (const key of ["hostname", "account", "path", "instance_id", "model", "provider"]) message[key] = "PRIVATE_" + key;
  assert.match(JSON.stringify(message), /PRIVATE_hostname/);
  await f.ports[0].receive(message);
  const displayed = About.block("0.2.0", f.controller.getStatus().about, 1700000000);
  assert.equal(displayed, "solstone extension 0.2.0 · windows 11 26100 · arm64\njournal 2.0.29 · ubuntu 24.04 · x86_64");
  assert.doesNotMatch(displayed, /PRIVATE_|hostname|account|instance_id|provider|model/);
  assert.equal(About.block("0.2.0", null), "solstone extension 0.2.0\njournal unknown");
  assert.doesNotMatch(About.block("0.2.0", {...facts, journal_current: false, journal_seen_at_epoch_secs: null}), /last seen/);
  const contract = JSON.parse(readFileSync(new URL("../contracts/about-contract/contract.json", import.meta.url)));
  for (const [canonical, aliases] of Object.entries(contract.arch_aliases)) for (const alias of aliases) assert.equal(About.arch(alias), canonical);
  const producer = readFileSync(new URL("../extension/lib/about.js", import.meta.url), "utf8");
  assert.doesNotMatch(producer, /fetch\(|XMLHttpRequest|navigator\.|\.hostname|\.instance_id|\.provider|\.model|setInterval|setTimeout/);
});
