// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const extensionRoot = path.join(root, "extension");

function walk(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else files.push(full);
  }
  return files;
}

function maskCommentsAndStrings(source) {
  const chars = [...source];
  let state = "code";
  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i];
    const next = chars[i + 1];
    if (state === "code") {
      if (ch === "/" && next === "/") {
        chars[i] = chars[i + 1] = " ";
        state = "line";
        i += 1;
      } else if (ch === "/" && next === "*") {
        chars[i] = chars[i + 1] = " ";
        state = "block";
        i += 1;
      } else if (ch === "'" || ch === "\"" || ch === "`") {
        chars[i] = " ";
        state = ch;
      }
    } else if (state === "line") {
      if (ch === "\n") state = "code";
      else chars[i] = " ";
    } else if (state === "block") {
      if (ch === "*" && next === "/") {
        chars[i] = chars[i + 1] = " ";
        state = "code";
        i += 1;
      } else if (ch !== "\n") {
        chars[i] = " ";
      }
    } else if (ch === "\\") {
      chars[i] = " ";
      if (i + 1 < chars.length) chars[++i] = " ";
    } else if (ch === state) {
      chars[i] = " ";
      state = "code";
    } else if (ch !== "\n") {
      chars[i] = " ";
    }
  }
  return chars.join("");
}

function lineAt(source, offset) {
  return source.slice(0, offset).split("\n").length;
}

function namedFunctionRanges(source) {
  const code = maskCommentsAndStrings(source);
  const ranges = [];
  const declarations = /\b(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/g;
  for (const match of code.matchAll(declarations)) {
    const bodyStart = match.index + match[0].lastIndexOf("{");
    let depth = 1;
    let bodyEnd = bodyStart + 1;
    while (bodyEnd < code.length && depth > 0) {
      if (code[bodyEnd] === "{") depth += 1;
      else if (code[bodyEnd] === "}") depth -= 1;
      bodyEnd += 1;
    }
    assert.equal(depth, 0, `unclosed function ${match[1]}`);
    ranges.push({ name: match[1], bodyStart, bodyEnd });
  }
  return { code, ranges };
}

function callOwners(source, callee) {
  const { code, ranges } = namedFunctionRanges(source);
  const calls = new RegExp(`\\b${callee}\\s*\\(`, "g");
  const owners = [];
  for (const match of code.matchAll(calls)) {
    if (/function\s*$/.test(code.slice(0, match.index))) continue;
    const containing = ranges
      .filter((range) => range.bodyStart < match.index && match.index < range.bodyEnd)
      .sort((a, b) => (a.bodyEnd - a.bodyStart) - (b.bodyEnd - b.bodyStart));
    owners.push(containing[0]?.name || "<top-level>");
  }
  return owners.sort();
}

function constructionSites() {
  const patterns = [
    ["fetch", /\bfetch\s*\(/g],
    ["websocket", /\bnew\s+WebSocket\s*\(/g],
    ["xmlhttprequest", /\bXMLHttpRequest\b/g],
    ["navigator.sendBeacon", /\bnavigator\s*\.\s*sendBeacon\s*\(/g],
    ["sendBeacon", /(?<![.\w])sendBeacon\s*\(/g],
  ];
  const found = [];
  for (const file of walk(extensionRoot).filter((name) => name.endsWith(".js"))) {
    const source = fs.readFileSync(file, "utf8");
    const code = maskCommentsAndStrings(source);
    for (const [kind, pattern] of patterns) {
      for (const match of code.matchAll(pattern)) {
        found.push({
          kind,
          file: path.relative(root, file),
          line: lineAt(source, match.index),
        });
      }
    }
  }
  return found.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.kind.localeCompare(b.kind));
}

function extensionTextFiles() {
  return walk(extensionRoot).filter((name) => /\.(?:js|html|json|md|txt)$/i.test(name));
}

test("extension network operations are exactly pair dial, data dial, and device enrollment", () => {
  assert.deepEqual(constructionSites(), [
    { kind: "websocket", file: "extension/lib/remote_tunnel.js", line: 42 },
    { kind: "fetch", file: "extension/lib/remote_tunnel.js", line: 145 },
  ]);

  const tunnel = fs.readFileSync(path.join(extensionRoot, "lib/remote_tunnel.js"), "utf8");
  assert.deepEqual(callOwners(tunnel, "connect"), ["dialData", "dialPair"]);
  assert.deepEqual(callOwners(tunnel, "fetch"), ["enrollDevice"]);
  assert.match(tunnel, /function dialPair\(relayOrigin, rkHex\)[\s\S]*?connect\(wsUrl\(relayOrigin, PAIR_DIAL_PATH\)/);
  assert.match(tunnel, /function dialData\(relayOrigin, instanceId, deviceToken\)[\s\S]*?wsUrl\(relayOrigin, DATA_DIAL_PATH\)[\s\S]*?return connect\(u, \[\]\)/);
  assert.match(tunnel, /function enrollDevice\(relayOrigin, body\)[\s\S]*?relayOrigin\.replace\([\s\S]*?\+ ENROLL_DEVICE_PATH[\s\S]*?fetch\(url, \{[\s\S]*?method: "POST"/);

  const background = fs.readFileSync(path.join(extensionRoot, "background.js"), "utf8");
  const options = fs.readFileSync(path.join(extensionRoot, "options.js"), "utf8");
  // Pair dial and enrollment use the origin parsed from the pasted pair link.
  // Data dial uses the relay origin saved in cfg.remote after pairing. The
  // pending origin is saved before permission is requested, but pairRemote()
  // does not compare it with the freshly parsed link origin.
  assert.match(options, /cmd\(\{ cmd: "relayIntent", relayOrigin: parsed\.relayOrigin \}\)/);
  assert.match(background, /cfg\.remotePending = relayOrigin \? \{ relayOrigin \} : null/);
  assert.match(background, /RemoteTunnel\.dialPair\(parsed\.relayOrigin, hex\(rk\)\)/);
  assert.match(background, /RemoteTunnel\.enrollDevice\(parsed\.relayOrigin,/);
  assert.match(background, /RemoteTunnel\.dialData\(cfg\.remote\.relayOrigin, cfg\.remote\.instanceId, cfg\.remote\.deviceToken\)/);
  assert.doesNotMatch(background, /entry\.mode/);
});

test("a fourth network construction site fails the exact enumeration", () => {
  const sites = constructionSites();
  assert.equal(sites.length, 2);
  assert.equal(sites.filter((site) => site.kind === "websocket").length, 1);
  assert.equal(sites.filter((site) => site.kind === "fetch").length, 1);
});

test("vendored dynamic imports are not mistaken for network operations", () => {
  const vendorFiles = walk(path.join(extensionRoot, "vendor")).filter((name) => name.endsWith(".js"));
  assert.ok(vendorFiles.length > 0);
  assert.equal(vendorFiles.some((file) => fs.readFileSync(file, "utf8").includes("import(")), true);
  assert.equal(constructionSites().some((site) => site.file.startsWith("extension/vendor/")), false);
});

test("shipped extension has no direct journal protocol surface", () => {
  assert.equal(fs.existsSync(path.join(extensionRoot, "journal.js")), false);
  const combined = extensionTextFiles().map((file) => fs.readFileSync(file, "utf8")).join("\n");
  for (const retired of [
    "/app/observer",
    "Authorization",
    "X-Solstone-Observer",
    "X-Solstone-Protocol-Version",
  ]) {
    assert.equal(combined.includes(retired), false, retired);
  }
});

test("remote-only flush and drain keep the queued idle-signature contract", () => {
  const background = fs.readFileSync(path.join(extensionRoot, "background.js"), "utf8");
  assert.match(background, /return \{ outcome: "queued", entry: \{ mode: "remote", day: seg\.day, segment, files, meta \}, nextSigs \}/);
  assert.match(background, /if \(r && r\.outcome === "queued"\) Object\.assign\(sigs, r\.nextSigs \|\| \{\}\)/);
  assert.match(background, /async function deliverOutboxEntry\(entry, cfg\)/);
  assert.match(background, /const delivered = await deliverOutboxEntry\(entry, cfg\)/);
  assert.doesNotMatch(background, /deliverLocalOutboxEntry|deliverRemoteOutboxEntry|outcome: "uploaded"|entry\.mode/);
});

test("port 5015 remains only in the production host-pattern explanation", () => {
  const matches = extensionTextFiles()
    .filter((file) => fs.readFileSync(file, "utf8").includes("5015"))
    .map((file) => path.relative(root, file));
  assert.deepEqual(matches, ["extension/lib/hosts.js"]);
  // CHANGELOG.md is deliberately absent. Shipped sections are the release notes
  // a published GitHub release was generated from, so they are a historical
  // record and are never edited — a blanket check here would demand rewriting
  // one, which is exactly what it did before this exemption. Live setup guidance
  // is what this guard is for, and every document that carries it is listed.
  for (const relativeName of ["README.md", "INSTALL.md", "test/GUIDED.md", "AGENTS.md", "RELEASE.md"]) {
    assert.equal(fs.readFileSync(path.join(root, relativeName), "utf8").includes("5015"), false, relativeName);
  }
});
