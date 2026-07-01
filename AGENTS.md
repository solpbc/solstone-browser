# AGENTS.md

Development guidelines for solstone-browser, a prototype Chrome (Manifest V3)
semantic browser observer for solstone.

## Project overview

solstone-browser is one of the owner's observers. It experiences the web apps the
owner explicitly chooses — reading their **visible text and rough layout**, never
screenshots — and relays what it reads into a solstone journal as a distinct
`<host>.browser` stream. It follows the same observer pattern as solstone-tmux
and the screen/audio observers: register against the journal, accumulate into
segments, sync. The difference is the source: semantic DOM content instead of
pixels or terminal text.

This is a **discovery prototype** — Chrome desktop only, opt-in per site,
relaying directly to the local journal. Cross-browser (Firefox/Safari) packaging
and the iOS Safari path are the eventual architecture, deliberately out of scope.

## Architecture

Two halves, one substrate (the WebExtensions API):

- **Content script** (`content.js` + `skim.js` + `adapters.js` + `indicator.js`)
  runs in each granted-origin tab. It picks an adapter, optionally shows the
  on-page marker when the owner enables it, runs a **visibility-aware semantic
  skim** of the app root, and relays the current block list to the worker on load
  and whenever the page settles after a mutation (debounced, change-gated). It is
  a thin producer — no segmenting, no diffing, no network.
- **Service worker** (`background.js` + `journal.js` + `lib/*`) is the
  event-driven persistent half. It holds the journal registration, buffers each
  tab's skims into a segment in `chrome.storage`, diffs successive skims into a
  snapshot+delta stream, rotates + uploads every segment via `chrome.alarms`, and
  owns the opt-in per-site lifecycle (grant → register a content script;
  revoke → tear down). MV3 service-worker ephemerality is handled by persisting
  all state to `chrome.storage` and waking on alarms.

Why no separate native host for this prototype: the journal runs on the same
machine and exposes a localhost ingest API that segments on receipt, so the
worker registers as its own observer and uploads directly. A native host may
return for the cross-platform / iOS shape later.

## The block model

A block is `{id, type, depth, text, attrs}`:

- `type` is derived ARIA role first, then semantic tag, then a heuristic
  (`lib/blocks.js` `typeFromRoleTag`).
- `text` is the **visible** text — `innerText` is the visibility oracle (respects
  `display:none`/`visibility:hidden`), never `textContent`. Capped.
- `id` prefers an app-stable id (`data-message-id`, `data-item-key`, …) read by
  the adapter, so deltas key to the right message across virtualized-list node
  recycling; otherwise a content hash.
- `attrs` keeps a few semantic attributes only (aria-label, heading level, link
  **host** — never full URLs / query strings).

## Source layout

```
extension/   the unpacked MV3 extension (see README for the per-file map)
  lib/blocks.js, lib/segment.js   pure, shared by worker + tests
test/        node --test pure logic, a real-Chrome CDP skim smoke, a journal round-trip
```

## Build and test

`make ci` is the gate (it runs the unit suite; there are no deps to install and
no formatter/linter wired yet). The underlying commands:

```bash
make install        # no-op — MV3 loads unpacked, tests need no deps
make ci             # the gate: pure-logic unit tests (== npm test)
npm test            # pure-logic unit tests (diff/delta/jsonl, role typing) — no browser, no deps
make smoke          # (npm run smoke) headless Chrome over CDP: skim the Gmail/Slack/article fixtures
make relay-check    # (npm run relay-check) ON the journal machine: register + multipart ingest + verify a segment landed
make e2e-deps       # one-time: npm install + npx playwright install chromium (dev-only deps)
make e2e            # (npm run e2e) agentic integration: content script -> SW -> relay, headless
```

`make ci` (the unit suite) is the CI-able gate and needs no deps. The smoke needs
a real Chrome; relay-check needs a live local journal; the e2e harness needs the
Playwright chromium build (dev-only — the shipped extension stays dependency-free).

## Agentic e2e (the live path, headless)

`make e2e` (`test/e2e.mjs`) drives the one path the unit tests can't reach —
**dynamically-registered content script → service worker → relay POST** —
end-to-end under browser automation with no display, against an in-process stub
journal. It is the automated half of `test/GUIDED.md`.

The prototype believed this leg was un-verifiable headlessly. It isn't; the fix
is two binary choices:

1. **Playwright `channel:'chromium'`** — selects the real new-headless build, not
   the extension-blind `chromium-headless-shell`. That build injects MV3 content
   scripts (static **and** dynamic) with no display and no Xvfb. (Verified: our
   `chrome.scripting.registerContentScripts` opt-in path fires under it.)
2. **`--load-extension`** — honored by Chrome-for-Testing / the Playwright
   chromium build; *branded* Chrome dropped it in Chrome 137, which is why the
   earlier headless/Xvfb attempts against branded Chrome loaded nothing.

**Permission faithfulness:** the shipped extension gets host access to a site via
the per-site `optional_host_permissions` grant, which needs a real user gesture
and **cannot** be obtained under headless automation (the harness confirms this
with a non-gating probe). So the harness pre-grants the fixture origin by adding
it to a *throwaway copy* of the manifest's `host_permissions`. This isolates the
question it answers (does our **dynamic** registration inject + relay under
new-headless?) from the orthogonal permission-UI question — the live per-site
opt-in is what the guided walkthrough verifies. The stub binds an **ephemeral
port**, so the harness never clashes with a real journal on `:5015`.

There is no build step. The shared `lib/*.js` files are classic scripts that
publish a `globalThis` namespace, so the same source loads as a content script,
is `importScripts`-ed by the worker, and is side-effect-imported by node tests.

## Principles

- **Semantic-only.** Never call `captureVisibleTab` or read pixels. The OS screen
  observer owns pixels; this owns text.
- **Opt-in, least authorization.** Install with zero site access
  (`optional_host_permissions`); request each site on an explicit user gesture;
  honor a browser-side revoke (`permissions.onRemoved`).
- **Visible + pausable.** The toolbar icon is the always-visible four-state
  observation signal; the on-page marker is opt-in and off by default. Pause-all
  is one tap. No silent observation.
- **Privacy in the data.** Keep visible text + structure; never raw HTML, never
  full hrefs, never hidden content.
- **Pure logic stays testable.** Diffing, serialization, and id/type derivation
  live in `lib/*` with no DOM or chrome APIs, so node tests cover them. DOM-bound
  behavior is validated in real Chrome.

## File headers

All `.js` source files begin with:

```js
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc
```

## Brand canon

solstone-browser is an **observer**. In owner-facing copy (README, INSTALL,
popup/options text, the indicator) describe it as something that **experiences /
reads / observes** the pages the owner chooses, along with them — never
*captures, records, monitors, watches, or tracks* the owner. Owner-facing model:
`solstone = observers + your journal`; sol is the keeper who tends the journal.
Internal code vocabulary (`skim`, `capture`-free here, module/class names) stays
as-is in code-only contexts.

## License

AGPL-3.0-only. Copyright (c) 2026 sol pbc.
