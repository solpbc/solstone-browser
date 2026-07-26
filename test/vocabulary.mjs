// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

export const BANNED_VOCABULARY = /(?:\b(?:prototype|users?|captur(?:e|es|ed|ing)|record(?:s|ed|ing)?|monitor(?:s|ed|ing)?|watch(?:es|ed|ing)?|track(?:s|ed|ing)?|collect(?:s|ed|ing)?|observ(?:e|es|ed|ing|ation|ations)|local\s+journal|local-relay|journal\s+service|journal\s+host|sol\s+browser|a\s+server)\b|—)/i;

const FREE_STANDING_EDGE = /[-_/.]/;
const TOKEN_CHAR = /[\w$]/;
const OWNER_PROSE = /\w\s+\w/;

function blank(text) {
  return text.replace(/[^\r\n]/g, " ");
}

function findingsIn(text, file, startLine, surface, freeStanding = false) {
  const regex = new RegExp(BANNED_VOCABULARY.source, "gi");
  const findings = [];
  for (const match of text.matchAll(regex)) {
    const before = text[match.index - 1] || "";
    const beforeFar = text[match.index - 2] || "";
    const after = text[match.index + match[0].length] || "";
    const afterFar = text[match.index + match[0].length + 1] || "";
    const glued = (FREE_STANDING_EDGE.test(before) && TOKEN_CHAR.test(beforeFar))
      || (FREE_STANDING_EDGE.test(after) && TOKEN_CHAR.test(afterFar));
    if (freeStanding && glued) continue;
    const line = startLine + (text.slice(0, match.index).match(/\n/g) || []).length;
    findings.push({ file, line, word: match[0], surface });
  }
  return findings;
}

function stripMarkdown(source) {
  const chunks = source.match(/.*(?:\r?\n|$)/g) || [];
  let fence = null;
  let text = chunks.map((line) => {
    // KISS boundary: fences nested under list markers fail closed as prose.
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line);
    if (!fence && marker) {
      fence = { char: marker[1][0], length: marker[1].length };
      return blank(line);
    }
    if (fence) {
      const close = new RegExp(`^ {0,3}${fence.char === "`" ? "`" : "~"}{${fence.length},}\\s*$`).test(line.trimEnd());
      if (close) fence = null;
      return blank(line);
    }
    return line;
  }).join("");

  const chars = text.split("");
  for (let i = 0; i < text.length;) {
    if (text[i] !== "`") { i++; continue; }
    let width = 1;
    while (text[i + width] === "`") width++;
    let close = i + width;
    while (close < text.length) {
      if (text[close] !== "`") { close++; continue; }
      let closeWidth = 1;
      while (text[close + closeWidth] === "`") closeWidth++;
      if (closeWidth === width) break;
      close += closeWidth;
    }
    if (close >= text.length) { i += width; continue; }
    for (let j = i; j < close + width; j++) if (chars[j] !== "\n" && chars[j] !== "\r") chars[j] = " ";
    i = close + width;
  }
  return chars.join("");
}

export function scanMarkdown(source, file) {
  return findingsIn(stripMarkdown(source), file, 1, "markdown-prose");
}

export const FROZEN_CHANGELOG_HEADING = /^## 0\.0\.11\b/m; // 0.0.11 and older are frozen shipped history.

export function currentChangelogRegion(source) {
  const marker = FROZEN_CHANGELOG_HEADING.exec(source);
  if (!marker) throw new Error("CHANGELOG boundary ## 0.0.11 is missing");
  return source.slice(0, marker.index);
}

const OWNER_ATTRIBUTES = "alt|title|placeholder|aria-label|aria-description|aria-placeholder|value";

function stripHtmlTags(source, visit) {
  const chars = source.split("");
  for (let start = 0; start < source.length;) {
    if (source[start] !== "<") { start++; continue; }
    let quote = "";
    let end = -1;
    for (let i = start + 1; i < source.length; i++) {
      const char = source[i];
      if (quote) {
        if (char === quote) quote = "";
      } else if (char === '"' || char === "'") {
        quote = char;
      } else if (char === ">") {
        end = i + 1;
        break;
      }
    }
    if (end < 0) { start++; continue; }
    visit(source.slice(start, end), start);
    for (let i = start; i < end; i++) if (chars[i] !== "\n" && chars[i] !== "\r") chars[i] = " ";
    start = end;
  }
  return chars.join("");
}

export function scanHtml(source, file) {
  let visible = source.replace(/<!--[\s\S]*?-->/g, blank).replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, blank);
  const findings = [];
  visible = stripHtmlTags(visible, (tag, offset) => {
    const attributes = new RegExp(`(?:^|\\s)(${OWNER_ATTRIBUTES})\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "gi");
    for (const match of tag.matchAll(attributes)) {
      const value = match[2] ?? match[3] ?? match[4] ?? "";
      const valueOffset = offset + match.index + match[0].lastIndexOf(value);
      const line = 1 + (source.slice(0, valueOffset).match(/\n/g) || []).length;
      findings.push(...findingsIn(value, file, line, `html-attribute:${match[1].toLowerCase()}`));
    }
  });
  return findings.concat(findingsIn(visible, file, 1, "html-text"));
}

export function javascriptLiterals(source) {
  const literals = []; let i = 0; let line = 1;
  function quoted(quote) {
    const startLine = line; let text = ""; i++;
    while (i < source.length) {
      const char = source[i];
      if (char === "\n" || char === "\r") { if (char === "\n") line++; i++; return; }
      if (char === "\\") { text += source.slice(i, i + 2); i += 2; continue; }
      if (char === quote) { i++; literals.push({ text, line: startLine }); return; }
      text += char; i++;
    }
  }
  function template() {
    const startLine = line; let text = ""; i++;
    while (i < source.length) {
      if (source[i] === "\\") { text += source.slice(i, i + 2); if (source[i + 1] === "\n") line++; i += 2; continue; }
      if (source[i] === "`") { i++; literals.push({ text, line: startLine }); return; }
      if (source[i] === "$" && source[i + 1] === "{") { const start = i; i += 2; walk(true); text += blank(source.slice(start, i)); continue; }
      if (source[i] === "\n") line++;
      text += source[i++];
    }
  }
  function regex() {
    let inClass = false; i++;
    while (i < source.length && source[i] !== "\n" && source[i] !== "\r") {
      if (source[i] === "\\") { i += 2; continue; }
      if (source[i] === "[") inClass = true;
      else if (source[i] === "]") inClass = false;
      else if (source[i] === "/" && !inClass) { i++; while (/[a-z]/i.test(source[i] || "")) i++; return; }
      i++;
    }
  }
  function walk(stopAtBrace = false) {
    let depth = 0; let previous = ""; let previousWord = "";
    while (i < source.length) {
      const char = source[i];
      if (char === "\n") { line++; i++; continue; }
      if (/\s/.test(char)) { i++; continue; }
      if (stopAtBrace && char === "}" && depth === 0) { i++; return; }
      if (char === "/" && source[i + 1] === "/") { i += 2; while (i < source.length && source[i] !== "\n") i++; continue; }
      if (char === "/" && source[i + 1] === "*") { i += 2; while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) { if (source[i++] === "\n") line++; } i += 2; continue; }
      if (char === "'" || char === '"') { quoted(char); previous = char; previousWord = ""; continue; }
      if (char === "`") { template(); previous = "`"; previousWord = ""; continue; }
      const regexStart = !previous || "(,=:[!&|?{};+-*%~^<>".includes(previous) || ["return", "case", "typeof"].includes(previousWord);
      if (char === "/" && regexStart) { regex(); previous = "/"; previousWord = ""; continue; }
      if (/[A-Za-z_$]/.test(char)) { const start = i++; while (/[\w$]/.test(source[i] || "")) i++; previousWord = source.slice(start, i); previous = previousWord.at(-1); continue; }
      if (char === "{") depth++;
      else if (char === "}" && depth > 0) depth--;
      previous = char;
      previousWord = "";
      i++;
    }
  }
  walk(); return literals;
}

// Deliberate KISS boundary: single-token and split-concatenation UI copy is not
// distinguishable from protocol constants without an AST or a growing allowlist.
export function scanJavaScript(source, file) {
  return javascriptLiterals(source).flatMap((literal) => OWNER_PROSE.test(literal.text)
    ? findingsIn(literal.text, file, literal.line, "javascript-prose-string", true)
    : []);
}

export function formatFinding(finding) {
  return `${finding.file}:${finding.line}: [${finding.surface}] banned owner-facing word "${finding.word}"`;
}
