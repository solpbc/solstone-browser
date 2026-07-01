# solstone-browser (prototype)

A Chrome (Manifest V3) **semantic browser observer** for
[solstone](https://solpbc.org). It experiences the web apps you choose along
with you — reading their visible text and rough layout, **never screenshots** —
and relays what it reads into your local solstone journal as its own `browser`
stream.

A browser extension isn't a new product; it's a new **observer surface** — and
the most *semantic* one in the fleet. The OS screen observer already owns the
pixels of the foreground tab. What only an extension can do is read the **text
and structure of the apps you keep open** — a new email's sender/subject/body, a
Slack message, a PR review request — as clean text, in background tabs, the
moment the page changes.

This is a **discovery prototype**: Chrome desktop only, opt-in per site, relaying
directly to the local journal. See [`INSTALL.md`](INSTALL.md) to run it.

## How it works

```
  content script (per granted tab)          service worker (background)
  ───────────────────────────────           ──────────────────────────
  visibility-aware DOM "skim"   ── skim ──▶  diff vs last skim
  (innerText oracle, ARIA roles,            snapshot at segment start +
   per-app adapters, MutationObserver        accumulate deltas in storage
   change-gating, debounced)                        │  every segment (5 min)
  on-page "☼ observing" pill                        ▼
                                            multipart upload → local journal
                                            POST /app/observer/ingest
                                                   │
                                                   ▼
                                       chronicle/{day}/{host}.browser/{segment}/
                                                browser_<site>.jsonl
```

- **Opt-in per site.** Nothing is observed until you add a site. Adding one fires
  a per-site Chrome permission grant (`optional_host_permissions` +
  `permissions.request()`); the extension honors a browser-side revoke.
- **Semantic-only.** It reads visible text via the `innerText` visibility
  oracle + ARIA roles/semantic tags; it never calls `captureVisibleTab`.
- **Self-contained observer.** The worker registers as its own observer and
  uploads finished segments straight to the journal's localhost ingest API — no
  separate native host needed for the Chrome-desktop case. MV3 service-worker
  ephemerality is handled with `chrome.storage` + `chrome.alarms`.
- **Trust controls.** A visible “observing” indicator on every observed tab, a
  one-tap pause-all, and Chrome's own per-site enforcement on top.

## The journal output (`browser.jsonl`)

One file per observed site per segment. Each file opens with a snapshot, then
accumulates deltas:

```jsonl
{"t":"segment_start","ts":…,"rel":0,"site":"mail.google.com","adapter":"gmail","n":3,"blocks":[ … ]}
{"t":"delta","ts":…,"rel":12,"site":"mail.google.com","op":"add","block":{"id":"k:msg-ccc333","type":"row","depth":3,"text":"From Priya Nadkarni, subject lunch?","attrs":{…}}}
{"t":"delta","ts":…,"rel":20,"site":"mail.google.com","op":"update","block":{"id":"h:inbox","type":"heading","text":"Inbox (3)", …}}
```

A **block** is `{id, type, depth, text, attrs}`. `type` comes from ARIA role →
semantic tag → heuristic. `id` prefers an app-stable id (`data-message-id`, …)
so deltas key to the right message across virtualized-list node recycling.

## Layout

```
extension/            the unpacked-loadable MV3 extension
  manifest.json
  background.js       service worker: registration, segment buffer, rotation, upload, per-site lifecycle
  journal.js          HTTP client for /app/observer/{register,ingest}
  content.js          per-tab orchestrator: skim on load + on settled change, indicator, relay
  skim.js             the visibility-aware semantic DOM walker
  adapters.js         Gmail + Slack adapters + generic fallback (data, not code)
  indicator.js        on-page "☼ observing" pill (closed shadow root)
  popup.html/.js      toolbar popup: status, observe-this-site, pause-all
  options.html/.js    settings + allowlist manager
  lib/blocks.js       pure block helpers (role→type, id, normalize) — shared, tested
  lib/segment.js      pure snapshot/delta differ + JSONL serializer — shared, tested
  icons/
test/
  segment.test.mjs    pure-logic unit tests (node --test)
  blocks.test.mjs
  skim.cdp.mjs        real-Chrome skim smoke over CDP (zero-dep)
  relay_roundtrip.mjs end-to-end register+ingest against a real local journal
```

## Tests

```bash
npm test          # pure-logic unit tests (diff/delta/jsonl, role typing) — no browser
npm run smoke     # real headless Chrome: skim the Gmail/Slack/article fixtures
npm run relay-check   # run ON the journal machine: register + upload + verify a segment landed
npm run e2e       # agentic integration: content script -> service worker -> relay, under
                  #   Playwright new-headless (one-time: `npx playwright install chromium`)
```

Two ways to exercise the live path (content script → worker → relay):

- **Agentic** — `npm run e2e` (a.k.a. `make e2e`) drives it under headless
  automation against a stub journal, including the dynamic-`registerContentScripts`
  injection. See [AGENTS.md](AGENTS.md) § agentic e2e.
- **Guided** — [test/GUIDED.md](test/GUIDED.md) is the human-in-the-loop
  walkthrough you run in real Chrome (the one that proves the real per-site opt-in).

## Build & install a release

```bash
make dist          # clean, versioned artifact in dist/ (gated on `make ci`)
```

Produces `dist/solstone-browser-<version>/` (Load unpacked this in Chrome) and a
matching `.zip`. Bump with `make set-version V=0.0.8`. Full flow — install, version
bump, tagged releases, and the future store/signed-channel layers — in
[RELEASE.md](RELEASE.md).

## License

AGPL-3.0-only. Copyright (c) 2026 sol pbc.
