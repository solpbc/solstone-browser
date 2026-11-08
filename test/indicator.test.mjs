// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import assert from "node:assert/strict";
import test from "node:test";

function fakeNode() {
  return {
    id: "",
    innerHTML: "",
    textContent: "",
    title: "",
    children: [],
    parentNode: null,
    style: { cssText: "", background: "", opacity: "" },
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    removeChild(child) {
      this.children = this.children.filter((node) => node !== child);
      child.parentNode = null;
      return child;
    },
  };
}

const documentElement = fakeNode();
const body = fakeNode();
const mounted = new Set();
documentElement.contains = (node) => mounted.has(node);
const appendToBody = body.appendChild.bind(body);
body.appendChild = function (child) {
  mounted.add(child);
  return appendToBody(child);
};
const removeFromBody = body.removeChild.bind(body);
body.removeChild = function (child) {
  mounted.delete(child);
  return removeFromBody(child);
};

globalThis.document = {
  documentElement,
  body,
  createElement() {
    return fakeNode();
  },
};

await import(new URL("../extension/indicator.js", import.meta.url));

const Indicator = globalThis.SolstoneIndicator;

function pill() {
  return body.children[0].children[0];
}

test("indicator tooltip tracks paused state without rebuilding the pill", () => {
  Indicator.show(false);
  const first = pill();
  const onTitle = first.title;

  Indicator.show(true);
  const second = pill();
  const pausedTitle = second.title;

  Indicator.show(false);
  const third = pill();

  assert.equal(second, first);
  assert.equal(third, first);
  assert.notEqual(onTitle, "");
  assert.notEqual(pausedTitle, "");
  assert.notEqual(onTitle, pausedTitle);
  assert.equal(third.title, onTitle);
});
