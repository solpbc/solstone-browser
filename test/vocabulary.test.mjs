// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  BANNED_VOCABULARY,
  currentChangelogRegion,
  formatFinding,
  javascriptLiterals,
  scanHtml,
  scanJavaScript,
  scanMarkdown,
} from "./vocabulary.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const EXTENSION = join(ROOT, "extension");
const EXEMPTIONS = new Map();

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function withoutExemptions(findings, exemptions = EXEMPTIONS) {
  return findings.filter((finding) => !exemptions.get(finding.file)?.has(finding.word.toLowerCase()));
}

function extensionJavaScript(dir = EXTENSION) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name !== "vendor") files.push(...extensionJavaScript(join(dir, entry.name)));
    } else if (entry.name.endsWith(".js")) {
      files.push(join(dir, entry.name));
    }
  }
  return files.sort();
}

test("shared vocabulary permits observer nouns and rejects retired owner words", () => {
  assert.doesNotMatch("observer observers", BANNED_VOCABULARY);
  assert.doesNotMatch("solstone browser solstone-browser", BANNED_VOCABULARY);
  assert.deepEqual(scanMarkdown("solstone browser", "listing.md"), []);
  assert.deepEqual(scanMarkdown("solstone-browser", "listing.md"), []);
  for (const word of ["prototype", "user", "observed", "observing", "observation", "observations"]) {
    assert.match(word, BANNED_VOCABULARY);
  }
});

test("shared vocabulary rejects every phrase and punctuation addition", () => {
  const fixtures = [
    "text — text",
    "your local\njournal",
    "local-relay",
    "the journal service answers",
    "the journal host answers",
    "sol browser settings",
    "a server stores it",
  ];
  for (const fixture of fixtures) assert.match(fixture, BANNED_VOCABULARY, fixture);

  assert.deepEqual(scanMarkdown("safe text — unsafe text", "copy.md"), [
    { file: "copy.md", line: 1, word: "—", surface: "markdown-prose" },
  ]);
  assert.deepEqual(scanMarkdown("your local\njournal", "copy.md"), [
    { file: "copy.md", line: 1, word: "local\njournal", surface: "markdown-prose" },
  ]);
});

test("markdown scanner finds prose and ignores fenced and inline code", () => {
  const source = [
    "# guide",
    "sol monitors this page with you",
    "```text",
    "users are inside a fence",
    "```",
    "`observed` stays inside code",
  ].join("\n");
  assert.deepEqual(scanMarkdown(source, "guide.md"), [
    { file: "guide.md", line: 2, word: "monitors", surface: "markdown-prose" },
  ]);
});

test("markdown inline-code stripping stays aligned after astral characters", () => {
  const source = [
    "sol reads 🙂🙂 alongside you",
    "`observed` monitoring continues",
  ].join("\n");
  assert.deepEqual(scanMarkdown(source, "guide.md"), [
    { file: "guide.md", line: 2, word: "monitoring", surface: "markdown-prose" },
  ]);
});

test("html scanner covers visible text and owner-facing attributes only", () => {
  const source = [
    "<!-- sol monitors this page -->",
    "<style>.user { color: red }</style>",
    "<script>const copy = 'sol records pages';</script>",
    "<div id=\"user monitor\" data-copy=\"observed page\" style=\"user-select:none\">sol records this page</div>",
  ].join("\n");
  assert.deepEqual(scanHtml(source, "page.html"), [
    { file: "page.html", line: 4, word: "records", surface: "html-text" },
  ]);

  for (const attribute of ["alt", "title", "placeholder", "aria-label", "aria-description", "aria-placeholder", "value"]) {
    const findings = scanHtml(`<input ${attribute}=\"sol monitors this page\">`, "page.html");
    assert.deepEqual(findings, [
      { file: "page.html", line: 1, word: "monitors", surface: `html-attribute:${attribute}` },
    ]);
  }

  assert.deepEqual(scanHtml('<div title="sol monitors > this page">safe</div>', "page.html"), [
    { file: "page.html", line: 1, word: "monitors", surface: "html-attribute:title" },
  ]);
});

test("javascript scanner finds prose literals and scans strings inside template expressions", () => {
  const source = [
    "// sol monitors this page",
    "const copy = \"sol monitors this page\";",
    "const state = `site ${observed ? \"sol records this page\" : \"still ready now\"} stays ready`;",
  ].join("\n");
  assert.deepEqual(scanJavaScript(source, "copy.js"), [
    { file: "copy.js", line: 2, word: "monitors", surface: "javascript-prose-string" },
    { file: "copy.js", line: 3, word: "records", surface: "javascript-prose-string" },
  ]);
});

test("javascript scanner explicitly ignores internal code and protocol vocabulary", () => {
  const source = [
    "let observer = new MutationObserver(scheduleSkim);",
    "observer.observe(rootEl, { capture: true });",
    "startObserving(); stopObserving(); const observing = false;",
    "const route = \"/app/observer/register\";",
    "const header = \"X-Solstone-Observer\";",
    "Object.prototype.hasOwnProperty.call(value, key);",
    "const meta = { observer: cfg.stream };",
    "J.relayEvent(url, key, \"observe\", \"status\", meta);",
    "const css = \"box-shadow:0 2px 10px rgba(0,0,0,0.35);user-select:none;cursor:default\";",
  ].join("\n");
  assert.deepEqual(scanJavaScript(source, "internal.js"), []);
});

test("javascript regex literals containing quotes do not desynchronize strings", () => {
  const source = [
    "const a = value.replace(/\"/g, \"&quot;\");",
    "const b = value.replace(/'/g, \"&#39;\");",
    "const copy = \"sol monitors this page\";",
  ].join("\n");
  assert.deepEqual(scanJavaScript(source, "escape.js"), [
    { file: "escape.js", line: 3, word: "monitors", surface: "javascript-prose-string" },
  ]);
});

test("javascript free-standing rule protects the real indicator CSS hyphen", () => {
  const literal = "box-shadow:0 2px 10px rgba(0,0,0,0.35);user-select:none;cursor:default";
  const source = `const css = ${JSON.stringify(literal)};`;
  assert.match(javascriptLiterals(source)[0].text, /\w\s+\w/);
  assert.deepEqual(scanJavaScript(source, "indicator.js"), []);
  assert.deepEqual(scanJavaScript(source.replace("user-select", "user select"), "indicator.js"), [
    { file: "indicator.js", line: 1, word: "user", surface: "javascript-prose-string" },
  ]);
});

test("javascript free-standing rule does not hide sentence punctuation", () => {
  const source = [
    'const first = "ask the user. then continue";',
    'const second = "one more note for the user.";',
  ].join("\n");
  assert.deepEqual(scanJavaScript(source, "copy.js"), [
    { file: "copy.js", line: 1, word: "user", surface: "javascript-prose-string" },
    { file: "copy.js", line: 2, word: "user", surface: "javascript-prose-string" },
  ]);
});

test("a synthetic exemption suppresses only its own token in its own file", () => {
  const file = "synthetic/page.html";
  const exemptions = new Map([[file, new Set(["prototype"])]]);
  const findings = scanHtml("<p>prototype monitoring</p>", file);
  assert.deepEqual(withoutExemptions(findings, exemptions), [
    { file, line: 1, word: "monitoring", surface: "html-text" },
  ]);
  assert.equal(withoutExemptions(findings, new Map()).length, 2);
});

test("changelog boundary keeps current entries and freezes shipped history", () => {
  const source = [
    "# changes",
    "sol monitors this page",
    "## 0.0.11",
    "sol records this page",
  ].join("\n");
  assert.deepEqual(scanMarkdown(currentChangelogRegion(source), "CHANGELOG.md"), [
    { file: "CHANGELOG.md", line: 2, word: "monitors", surface: "markdown-prose" },
  ]);
  assert.throws(() => currentChangelogRegion("# no boundary"), /CHANGELOG boundary ## 0\.0\.11 is missing/);
});

test("finding formatter includes file, line, word, and surface", () => {
  assert.equal(formatFinding({ file: "README.md", line: 16, word: "prototype", surface: "markdown-prose" }),
    "README.md:16: [markdown-prose] banned owner-facing word \"prototype\"");
});

test("real owner-facing surfaces contain no retired vocabulary", () => {
  let findings = [];
  for (const file of ["README.md", "INSTALL.md"]) findings.push(...scanMarkdown(read(file), file));
  findings.push(...scanMarkdown(currentChangelogRegion(read("CHANGELOG.md")), "CHANGELOG.md"));
  for (const entry of readdirSync(EXTENSION, { withFileTypes: true }).filter((item) => item.isFile() && item.name.endsWith(".html"))) {
    const file = `extension/${entry.name}`;
    findings.push(...scanHtml(read(file), file));
  }
  for (const absolute of extensionJavaScript()) {
    const file = relative(ROOT, absolute);
    findings.push(...scanJavaScript(read(file), file));
  }

  // AGENTS.md is intentionally absent. It is the contributor contract and the
  // source of the owner vocabulary policy, not an owner-facing surface.
  findings = withoutExemptions(findings).sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  assert.deepEqual(findings, [], `owner vocabulary guard found ${findings.length} violation(s):\n${findings.map(formatFinding).join("\n")}`);
});
