// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import assert from "node:assert/strict";
import test from "node:test";

await import(new URL("../extension/lib/page_facts.js", import.meta.url));

const PF = globalThis.SolstonePageFacts;

function mockDoc({ lang, mediaElements = [], visibilityState, hasFocus } = {}) {
  return {
    documentElement: {
      getAttribute: (name) => (name === "lang" ? lang : null),
      lang: lang || "",
    },
    querySelectorAll: (selector) => {
      if (selector === "audio, video") return mediaElements;
      return [];
    },
    visibilityState,
    hasFocus: typeof hasFocus === "boolean" ? () => hasFocus : undefined,
  };
}

test("readDomFacts: lang handling (absent, distinct tags, truncation to 35 code points)", () => {
  // Empty or whitespace only -> omitted
  assert.equal(PF.readDomFacts(mockDoc({ lang: "" })).lang, undefined);
  assert.equal(PF.readDomFacts(mockDoc({ lang: "   " })).lang, undefined);
  assert.equal(PF.readDomFacts(mockDoc({})).lang, undefined);

  // Two distinct lang tags
  assert.equal(PF.readDomFacts(mockDoc({ lang: "en-US" })).lang, "en-US");
  assert.equal(PF.readDomFacts(mockDoc({ lang: "ja-JP" })).lang, "ja-JP");

  // Longer than 35 code points truncated to 35 code points
  const longLang = "en-US-x-custom-subtag-that-is-excessively-long-and-should-be-truncated";
  const readLong = PF.readDomFacts(mockDoc({ lang: longLang })).lang;
  assert.equal(Array.from(readLong).length, 35);
  assert.equal(readLong, Array.from(longLang).slice(0, 35).join(""));
});

test("readDomFacts: media detection (absent, never played, playing unmuted, playing silent)", () => {
  // No element -> media omitted
  assert.equal(PF.readDomFacts(mockDoc({ mediaElements: [] })).media, undefined);

  // Never-played audio element -> media present, playing: false
  const unplayedAudio = { paused: true, ended: false, readyState: 0, muted: false, volume: 1 };
  assert.deepEqual(PF.readDomFacts(mockDoc({ mediaElements: [unplayedAudio] })).media, {
    hasElement: true,
    playing: false,
    everyPlayingSilent: false,
  });

  // Playing unmuted element
  const playingLoud = { paused: false, ended: false, readyState: 3, muted: false, volume: 0.8 };
  assert.deepEqual(PF.readDomFacts(mockDoc({ mediaElements: [playingLoud] })).media, {
    hasElement: true,
    playing: true,
    everyPlayingSilent: false,
  });

  // Playing muted element
  const playingMuted = { paused: false, ended: false, readyState: 4, muted: true, volume: 1 };
  assert.deepEqual(PF.readDomFacts(mockDoc({ mediaElements: [playingMuted] })).media, {
    hasElement: true,
    playing: true,
    everyPlayingSilent: true,
  });

  // Playing volume 0 element
  const playingVolZero = { paused: false, ended: false, readyState: 2, muted: false, volume: 0 };
  assert.deepEqual(PF.readDomFacts(mockDoc({ mediaElements: [playingVolZero] })).media, {
    hasElement: true,
    playing: true,
    everyPlayingSilent: true,
  });

  // Mixed: one playing silent, one playing loud -> not every playing is silent
  assert.deepEqual(PF.readDomFacts(mockDoc({ mediaElements: [playingMuted, playingLoud] })).media, {
    hasElement: true,
    playing: true,
    everyPlayingSilent: false,
  });
});

test("readDomFacts: visibilityState and hasFocus", () => {
  const visibleFocused = PF.readDomFacts(mockDoc({ visibilityState: "visible", hasFocus: true }));
  assert.equal(visibleFocused.visibilityState, "visible");
  assert.equal(visibleFocused.hasFocus, true);

  const hiddenUnfocused = PF.readDomFacts(mockDoc({ visibilityState: "hidden", hasFocus: false }));
  assert.equal(hiddenUnfocused.visibilityState, "hidden");
  assert.equal(hiddenUnfocused.hasFocus, false);
});

test("mapBrowser: Firefox with and without version", () => {
  assert.deepEqual(PF.mapBrowser({ browserInfo: { name: "Firefox", version: "135.0" } }), {
    vendor: "firefox",
    version: "135.0",
  });
  assert.deepEqual(PF.mapBrowser({ browserInfo: { name: "firefox", version: "" } }), {
    vendor: "firefox",
  });
});

test("mapBrowser: Edge with and without version", () => {
  assert.deepEqual(
    PF.mapBrowser({
      userAgentData: {
        brands: [
          { brand: "Chromium", version: "131" },
          { brand: "Microsoft Edge", version: "131.0.2903.86" },
        ],
      },
    }),
    { vendor: "edge", version: "131.0.2903.86" }
  );
  assert.deepEqual(
    PF.mapBrowser({
      userAgentData: {
        brands: [{ brand: "Microsoft Edge", version: "" }],
      },
    }),
    { vendor: "edge" }
  );
});

test("mapBrowser: Chrome with and without version", () => {
  assert.deepEqual(
    PF.mapBrowser({
      userAgentData: {
        fullVersionList: [
          { brand: "Chromium", version: "133.0.6943.53" },
          { brand: "Google Chrome", version: "133.0.6943.53" },
        ],
      },
    }),
    { vendor: "chrome", version: "133.0.6943.53" }
  );
  assert.deepEqual(
    PF.mapBrowser({
      userAgentData: {
        brands: [{ brand: "Google Chrome", version: "" }],
      },
    }),
    { vendor: "chrome" }
  );
});

test("mapBrowser: Chromium with and without version", () => {
  assert.deepEqual(
    PF.mapBrowser({
      userAgentData: {
        brands: [
          { brand: "Chromium", version: "130.0.0.0" },
          { brand: "Not A Brand", version: "99" },
        ],
      },
    }),
    { vendor: "chromium", version: "130.0.0.0" }
  );
  assert.deepEqual(
    PF.mapBrowser({
      userAgentData: {
        brands: [{ brand: "OtherBrand", version: "1.0" }],
      },
    }),
    { vendor: "chromium" }
  );
});

test("mapBrowser: Safari with and without version", () => {
  const uaWithVersion = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Safari/605.1.15";
  assert.deepEqual(PF.mapBrowser({ userAgent: uaWithVersion }), {
    vendor: "safari",
    version: "18.3",
  });
  // Without Version/ token or non-Safari UA
  assert.equal(PF.mapBrowser({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/130.0.0.0 Safari/537.36" }), null);
  assert.equal(PF.mapBrowser({}), null);
});

test("assemble: API path vs fallback path, media and solstone_paused", () => {
  // API path: tab and window present
  const apiActiveFocused = PF.assemble({
    tabId: 10,
    frameId: 0,
    tab: { id: 10, active: true, windowId: 1 },
    window: { id: 1, state: "normal", focused: true },
    ageMs: 4500,
    browser: { vendor: "chrome", version: "133.0" },
    ext: "0.4.0",
    solstonePaused: true,
  });
  assert.deepEqual(apiActiveFocused.tab, { id: 10, age_ms: 4500, front: true, focused: true });
  assert.equal(apiActiveFocused.solstone_paused, true);
  assert.deepEqual(apiActiveFocused.browser, { vendor: "chrome", version: "133.0" });
  assert.equal(apiActiveFocused.ext, "0.4.0");

  const apiMinimizedUnfocused = PF.assemble({
    tabId: 11,
    tab: { id: 11, active: true, windowId: 2 },
    window: { id: 2, state: "minimized", focused: false },
    ageMs: 0,
    solstonePaused: false,
  });
  assert.deepEqual(apiMinimizedUnfocused.tab, { id: 11, age_ms: 0, front: false, focused: false });
  assert.equal(apiMinimizedUnfocused.solstone_paused, undefined);

  // Fallback path: tab/win missing
  const fallbackTop = PF.assemble({
    tabId: 12,
    frameId: 0,
    page: { visibilityState: "visible", hasFocus: true, lang: "fr" },
    ageMs: 1200,
  });
  assert.deepEqual(fallbackTop.tab, { id: 12, age_ms: 1200, front: true, focused: true });
  assert.equal(fallbackTop.lang, "fr");

  // Fallback path subframe: omits focused
  const fallbackSubframe = PF.assemble({
    tabId: 12,
    frameId: 1,
    page: { visibilityState: "visible", hasFocus: true },
  });
  assert.deepEqual(fallbackSubframe.tab, { id: 12, front: true });
  assert.equal(fallbackSubframe.tab.focused, undefined);

  // Fallback path missing facts: omits front and focused, does not default to false
  const fallbackEmpty = PF.assemble({
    tabId: 15,
    page: {},
  });
  assert.deepEqual(fallbackEmpty.tab, { id: 15 });
  assert.equal(fallbackEmpty.tab.front, undefined);
  assert.equal(fallbackEmpty.tab.focused, undefined);

  // Media: audible tab with no element
  const audibleMedia = PF.assemble({
    tab: { audible: true, mutedInfo: { muted: false } },
  });
  assert.deepEqual(audibleMedia.media, { playing: true, muted: false });

  // Media: audible tab muted
  const audibleMutedMedia = PF.assemble({
    tab: { audible: true, mutedInfo: { muted: true } },
  });
  assert.deepEqual(audibleMutedMedia.media, { playing: true, muted: true });

  // Media: element playing silent, tab not audible
  const silentElementMedia = PF.assemble({
    page: { media: { hasElement: true, playing: true, everyPlayingSilent: true } },
    tab: { audible: false },
  });
  assert.deepEqual(silentElementMedia.media, { playing: true, muted: true });

  // No element and the tab is not audible: media is omitted
  assert.equal(PF.assemble({ page: {}, tab: { audible: false } }).media, undefined);
  assert.equal(PF.assemble({ page: {} }).media, undefined);

  // Playing unmuted element, tab not audible
  const loudElementMedia = PF.assemble({
    page: { media: { hasElement: true, playing: true, everyPlayingSilent: false } },
    tab: { audible: false, mutedInfo: { muted: false } },
  });
  assert.deepEqual(loudElementMedia.media, { playing: true, muted: false });
});
