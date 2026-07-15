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
directly to the local journal by default, with an optional paired remote home.
See [`INSTALL.md`](INSTALL.md) to run it.

## How it works

```
  content script (per granted tab)          service worker (background)
  ───────────────────────────────           ──────────────────────────
  visibility-aware DOM "skim"   ── skim ──▶  diff vs last skim
  (innerText oracle, ARIA roles,            snapshot at segment start +
   per-app adapters, MutationObserver        accumulate deltas in storage
   change-gating, debounced)                        │  every segment (5 min)
  optional on-page marker                          ▼
                                            local: multipart upload → journal
                                            remote: HPKE-sealed relay tunnel
                                                   │
                                                   ▼
                                       chronicle/{day}/{host}.browser/{segment}/
                                                browser_<site>.jsonl
```

- **Opt-in per site.** Nothing is read until you add a site. Adding one asks for
  a per-site Chrome permission grant (`optional_host_permissions` +
  `permissions.request()`). If Chrome removes access, sol pauses the site but
  keeps your choice so you can allow it again; unused grants are released.
- **Semantic-only.** It reads visible text via the `innerText` visibility
  oracle + ARIA roles/semantic tags; it never calls `captureVisibleTab`.
- **Self-contained observer.** In local mode, the worker registers as its own
  observer and uploads finished segments straight to the journal's localhost
  ingest API. In remote mode, a pasted pair link enrolls the extension with a
  remote journal and sends finished segments as HPKE-sealed blobs over the relay
  tunnel; see the [release compatibility gate](RELEASE.md#cut-a-tagged-release-like-our-other-surfaces).
  MV3 service-worker ephemerality is handled with `chrome.storage`,
  IndexedDB, and `chrome.alarms`.
- **Trust controls.** The toolbar icon is a live status light for on, connecting,
  can't-reach, paused, paused by browser, and attention states. Pin solstone to
  keep it visible; the on-page marker is an opt-in Options setting.

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
  background.js       service worker: registration, segment buffer, rotation, local/remote delivery, per-site lifecycle
  journal.js          HTTP client for /app/observer/{register,ingest} and remote enroll
  content.js          per-tab orchestrator: skim on load + on settled change, optional marker, relay
  skim.js             the visibility-aware semantic DOM walker
  adapters.js         Gmail + Slack adapters + generic fallback (data, not code)
  indicator.js        optional on-page "☼ observing" marker (closed shadow root)
  popup.html/.js      toolbar popup: status, observe-this-site, pause-all
  options.html/.js    settings + allowlist manager + remote pairing
  lib/blocks.js       pure block helpers (role→type, id, normalize) — shared, tested
  lib/segment.js      pure snapshot/delta differ + JSONL serializer — shared, tested
  lib/reconcile.js    pure desired-site / Chrome-grant reconciliation
  lib/db.js           shared IndexedDB helper for identity + durable outbox
  lib/identity.js     non-extractable ECDH extension identity
  lib/outbox.js       pure FIFO/cap/loss accounting
  lib/outbox_store.js IndexedDB-backed durable outbox adapter
  lib/pairlink.js     pure 0x06 pair-link parse/build + RK derivation
  lib/uuid.js         pure UUIDv7 helpers
  lib/remote_blob.js  tar/gzip/blob shaping + HPKE seal/open helpers
  lib/remote_tunnel.js relay WebSocket dial helpers
  vendor/hpke/        vendored @hpke/core IIFE + license + regen notes
  icons/
test/
  segment.test.mjs    pure-logic unit tests (node --test)
  blocks.test.mjs
  pairlink.test.mjs   Section 9 pair-link vector equality
  hpke.test.mjs       Section 10 HPKE interop vector equality
  remote_blob.test.mjs tar/blob/offer/ack pure tests
  uuid.test.mjs       UUIDv7 pure tests
  skim.cdp.mjs        real-Chrome skim smoke over CDP (zero-dep)
  relay_roundtrip.mjs end-to-end register+ingest against a real local journal
```

## Tests

```bash
npm test          # pure-logic unit tests, pair-link/HPKE vectors, remote blob builders — no browser
npm run test:idb  # production outbox transactions against fake IndexedDB (needs dev deps)
make ci           # locked dev install + pure units + real-IDB + vendor reproducibility
npm run smoke     # real headless Chrome: skim the Gmail/Slack/article fixtures
npm run relay-check   # run ON the journal machine: register + upload + verify a segment landed
npm run e2e       # agentic integration: content script -> service worker -> journal/relay, under
                  #   Playwright new-headless (one-time: `npx playwright install chromium`)
```

Two ways to exercise the live path (content script → worker → journal/relay):

- **Agentic** — `npm run e2e` (a.k.a. `make e2e`) drives it under headless
  automation against a stub journal/relay, including the dynamic
  `registerContentScripts` injection and the paired HPKE relay path. See
  [AGENTS.md](AGENTS.md) § agentic e2e.
- **Guided** — [test/GUIDED.md](test/GUIDED.md) is the human-in-the-loop
  walkthrough you run in real Chrome (the one that proves the real per-site opt-in).

## Build & install a release

```bash
make dist          # clean, versioned artifact in dist/ (gated on `make ci`)
```

Produces `dist/solstone-browser-<version>/` + a `.zip`, and maintains a stable
`dist/current` symlink. **Load unpacked `dist/current` once**, then after each
`make dist` just hit **reload** on the extension card — the manifest `key` pins
the extension id, so your granted sites persist across rebuilds. Bump with
`make set-version V=x.y.z`. Full flow — the reload loop, version bumps, tagged
releases, and the future store/signed-channel layers — in [RELEASE.md](RELEASE.md);
history in [CHANGELOG.md](CHANGELOG.md).

## License

AGPL-3.0-only. Copyright (c) 2026 sol pbc.
