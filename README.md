# solstone-browser

A Chromium (Manifest V3) **semantic browser observer** for
[solstone](https://solpbc.org). It experiences the web apps you choose
along with you, taking in their rendered text and rough layout. **Never pixels.
Never raw HTML.** It delivers what it reads to your journal at your paired home
as its own `browser` stream.

A browser extension isn't a new product; it's a new **observer surface**, and
the most *semantic* one in the fleet. The OS screen observer already owns the
pixels of the foreground tab. What only an extension can do is read the **text
and structure of the apps you keep open**: a new email's sender/subject/body, a
Slack message, a PR review request, as clean text, in background tabs, the
moment the page changes.

This is a Chromium desktop Web Store candidate. It is opt-in per site and
delivers only to a paired home. See [`INSTALL.md`](INSTALL.md) to install it.

## How it works

```
  content script (per granted tab)          service worker (background)
  ───────────────────────────────           ──────────────────────────
  visibility-aware DOM "skim"   ── skim ──▶  diff vs last skim
  (checkVisibility gate, ARIA roles,        snapshot at segment start +
   per-app adapters, MutationObserver        accumulate deltas in storage
   change-gating, debounced)                        │  every segment (5 min)
  optional on-page marker                          ▼
                                            HPKE-sealed relay tunnel
                                                   │
                                                   ▼
                                       chronicle/{day}/{host}.browser/{segment}/
                                                browser_<site>.jsonl
```

- **Opt-in per site.** Nothing is taken in until you add a site. Adding one
  asks for a per-site Chrome permission grant (`optional_host_permissions` +
  `permissions.request()`). If Chrome removes access, sol pauses the site but
  keeps your choice so you can allow it again; unused grants are released unless
  their hostname is also used by a paired or pending relay.
- **Semantic-only.** It gates elements with
  `Element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })`
  and a rendered-box fallback. There is no viewport or clip test, so rendered
  text includes what you can see now and what you'd see by scrolling, including
  in background tabs. It reads each element's immediate text-node children and
  types them with ARIA roles and semantic tags, while `attrs.label` can promote
  an `aria-label` or `title` to a boundary block's entire text, including the
  labels pages hand to screen readers and tooltips, which sometimes aren't drawn
  on screen. It never calls
  `captureVisibleTab`. Never pixels. Never raw HTML.
- **Self-contained observer.** The durable outbox keeps waiting entries on this
  device, and the worker seals each entry with HPKE immediately before sending
  it through the paired relay. The pair link carries the home's fingerprint, which sol
  verifies before trusting the home. The relay carries sealed content bytes and
  cannot read them, but it sees routing and authentication data, offer metadata,
  and Ready/ACK framing. See the [release compatibility gate](RELEASE.md#cut-a-tagged-release-like-our-other-surfaces).
  MV3 service-worker ephemerality is handled with `chrome.storage`, IndexedDB,
  and `chrome.alarms`.
- **Trust controls.** The toolbar icon is a live status light for connected,
  paired · waiting for first sync, pairing not finished, not paired, can't
  reach, paused, paused by browser, and attention states. Pin sol to
  keep it visible; the on-page marker is an opt-in Options setting.

## The journal output (`browser.jsonl`)

One file per site sol reads per segment. Each file opens with a snapshot that
includes the page title, then accumulates deltas. Each page URL is reduced to
its origin + path before it enters your journal; its query string, fragment,
and credentials are left out:

```jsonl
{"t":"segment_start","ts":…,"rel":0,"site":"mail.google.com","url":"https://mail.google.com/mail/u/0/","adapter":"gmail","n":3,"blocks":[ … ]}
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
  background.js       service worker: segment buffer, rotation, sealed delivery, per-site lifecycle
  content.js          per-tab orchestrator: skim on load + on settled change, optional marker, relay
  skim.js             the visibility-aware semantic DOM walker
  adapters.js         Gmail + Slack adapters + generic fallback (data, not code)
  indicator.js        optional on-page "on" / "paused" sol marker (closed shadow root)
  popup.html/.js      toolbar popup: verdict, add-this-site disclosure, pause-all
  options.html/.js    settings: first-run disclosure, journal card, sites, on-page marker
  lib/blocks.js       pure block helpers (role→type, id, normalize) — shared, tested
  lib/segment.js      pure snapshot/delta differ + JSONL serializer — shared, tested
  lib/reconcile.js    pure desired-site / Chrome-grant reconciliation
  lib/disclosure.js   pure live-destination disclosure copy, shared and tested
  lib/popup_view.js   pure ordered popup arrangement and site-action flow
  lib/db.js           shared IndexedDB helper for identity + durable outbox
  lib/identity.js     non-extractable ECDH extension identity
  lib/outbox.js       pure FIFO/cap/loss accounting
  lib/outbox_store.js IndexedDB-backed durable outbox adapter
  lib/pairlink.js     pure 0x06 pair-link parse/build + RK derivation
  lib/uuid.js         pure UUIDv7 helpers
  lib/remote_blob.js  tar/gzip/blob shaping + HPKE seal/open helpers
  lib/remote_tunnel.js relay WebSocket dial and device-enrollment helpers
  vendor/hpke/        vendored @hpke/core IIFE + license + regen notes
  icons/
test/
  segment.test.mjs    pure-logic unit tests (node --test)
  blocks.test.mjs
  pairlink.test.mjs   Section 9 pair-link vector equality
  hpke.test.mjs       Section 10 HPKE interop vector equality
  remote_blob.test.mjs tar/blob/offer/ack pure tests
  network_surface.test.mjs exact shipped network-operation inventory
  uuid.test.mjs       UUIDv7 pure tests
  vocabulary.mjs      shared owner-vocabulary regex + pure surface scanners
  vocabulary.test.mjs scanner regressions + real-tree owner-copy guard
  skim.cdp.mjs        real-Chrome skim smoke over CDP (zero-dep)
```

## Tests

```bash
npm test          # pure-logic unit tests, pair-link/HPKE vectors, remote blob builders — no browser
npm run test:idb  # production outbox transactions against fake IndexedDB (needs dev deps)
make ci           # locked dev install + pure units + real-IDB + vendor reproducibility
npm run smoke     # real headless Chrome: skim the Gmail/Slack/article fixtures
npm run e2e       # agentic integration: content script -> service worker -> relay, under
                  #   Playwright new-headless (one-time: `npx playwright install chromium`)
```

Two ways to exercise the live path (content script → worker → relay):

- **Agentic:** `npm run e2e` (a.k.a. `make e2e`) drives it under headless
  automation against a stub relay, including the dynamic
  `registerContentScripts` injection and the paired HPKE relay path. See
  [AGENTS.md](AGENTS.md) § agentic e2e.
- **Guided:** [test/GUIDED.md](test/GUIDED.md) is the human-in-the-loop
  walkthrough you run in real Chrome (the one that proves the real per-site opt-in).

## Build & install a release

```bash
make dist          # clean, versioned artifact in dist/ (gated on `make ci`)
```

Produces `dist/solstone-browser-<version>/` plus clearly named `-dev.zip` and
`-cws.zip` archives, and maintains a stable `dist/current` symlink. The
development directory and ZIP retain the pinned extension id so granted sites
persist across rebuilds; the separately validated `-cws.zip` omits development
identity fields for Chrome Web Store upload. **Load unpacked `dist/current`
once**, then after each `make dist` click **reload** on the extension card.
`make cws` is the Store-upload spelling of the same full build gate. Bump with
`make set-version V=x.y.z`. The reload loop, version bumps, tagged releases, and
channel-specific assets are in [RELEASE.md](RELEASE.md); history is in
[CHANGELOG.md](CHANGELOG.md).

## License

AGPL-3.0-only. Copyright (c) 2026 sol pbc.
