# Changelog — solstone-browser

Notable changes to the extension. The version is `manifest.json`'s `version`;
`make set-version` keeps `manifest.json` / `package.json` / `background.js` in
lockstep, and `make dist` refuses to build if they drift.

## 0.0.13 — 2026-07-15

sol now keeps the sites you chose when Chrome changes their access, and makes getting them going again one tap.

- **Your choices stay yours.** If Chrome removes access to an added site, sol pauses it instead of forgetting it. Nothing more is read there, and the site remains in settings so you can allow it again.
- **One-tap recovery.** The popup, settings rows, and toolbar status show the calm “paused by browser” state without treating it as an error. Sites sharing one Chrome host grant pause and return together.
- **Only the access sol still needs.** sol regularly reconciles Chrome's grants and releases access that no added site, built-in journal connection, or paired remote home uses.

## 0.0.12 — 2026-07-04

sol can now reach your journal from anywhere, sealing everything inside your browser before it leaves.

- **Reach your journal from anywhere.** Until now, your journal had to be on the same machine as your browser; now sol delivers to it wherever that journal runs. Everything sol takes in is sealed end-to-end (HPKE) inside the browser before it leaves, then travels over a paired relay that carries only the sealed bytes and can't read them. The same-machine path is unchanged.
- **Paired to your journal, verified before it's trusted.** You connect sol to your journal by pasting a pairing link and confirming your journal's fingerprint, so nothing is trusted until you've checked it yourself. Sealed segments are held in a durable outbox and only cleared once your journal confirms it has them.
- **sol, in the owner's words.** The popup, options page, on-page marker, and toolbar tooltip now call the app **sol** and its memory **your journal**. The toolbar status light reads **on / paused / needs attention** at a glance.
- **solstone stays the family name.** The store listing is still **solstone browser**, and each device still relays a `<host>.browser` stream. solstone is the platform sol belongs to, not what it calls itself in the app.

## 0.0.11 — 2026-07-01

Durable offline outbox — buffered observations are never silently dropped.

- **Offline retry queue.** When your journal can't be reached, a segment that
  can't be delivered is now held in a durable outbox in `chrome.storage` instead
  of being discarded. Every give-up path (registration failure, upload error,
  non-ok response, ok-with-failed body) enqueues rather than drops, and the
  buffer drains oldest-first once the journal comes back — on the next alarm tick
  and after a successful reconnect.
- **One honest waiting total.** The popup, options, per-site rows, and toolbar
  icon all read from a single waiting count (pending + queued lines). The calm
  half-sun carries an "{N} update(s) waiting to sync" suffix; the red loss state
  is now reserved for observations that were actually dropped (outbox at
  capacity), with a dismiss affordance that appears only after the backlog fully
  drains.
- **Bounded, never unbounded.** The outbox is capped at 2000 segments (about a
  week of continuous offline observing at the default cadence); overflow evicts
  oldest and is surfaced as real loss, not hidden.

## 0.0.10 — 2026-07-01

The owner-experience pass from the VPX full-surface review: honest failure
states, plain language, and one-tap symmetry.

- **Honest can't-reach states.** When your journal can't be reached, the popup
  and options now say what it means — "what's observed while it can't be reached
  may not be kept" — with a **try now** recovery probe; per-site rows switch from
  green to "observing — waiting to sync", and a persistently unreachable journal
  escalates the toolbar icon to the attention tier. (No offline queue yet; this
  makes the gap visible instead of silent.)
- **Errors in plain language.** Raw error strings ("Failed to fetch") map to
  owner-readable copy — what happened and what to do next — with the technical
  detail kept in the tooltip.
- **Stop observing from the popup.** Leaving a site is now one tap, same as
  joining: on an observed site the popup button flips to **stop observing**
  (removes the site and revokes its permission).
- **Calm paused states.** Paused reads as a neutral chip (not red), site rows say
  "— paused", and the on-page marker's paused pill is solid and legible.
- **Readable buttons.** Primary buttons use dark ink on sol orange (white on
  orange failed WCAG contrast).
- **"solstone browser".** The extension names itself solstone browser — observing
  is what it does, not its name.
- **Connect, save, send now.** Options speaks owner language: **connect** replaces
  "register / test connection", saving a changed journal address connects
  immediately, Enter submits, invalid values get inline messages instead of
  silent ignores, and **send now** reports sent / nothing waiting / can't reach
  honestly.
- **See what's waiting.** A read-only "waiting to send" view in options shows the
  updates buffered for your journal, plus **open your journal** links from both
  popup and options.
- **Craft.** 12px minimum type, HTML-escaped host/error rendering everywhere,
  a "reload this tab to begin" action for just-added sites, and the guided-test /
  install docs brought up to current behavior.

## 0.0.9 — 2026-07-01

- **On-page marker is opt-in.** The floating sol-mark marker is now off by
  default and can be enabled from Options for owners who want an in-page cue.
- **Four-state toolbar status light.** The toolbar icon now carries the always-on
  observation signal through a pure `lib/status.js` helper: observing, connecting,
  can't reach your journal, paused, and attention.
- **Pin suggestion.** The popup suggests pinning solstone when Chrome has tucked
  the icon away, so the status light stays visible.
- **Port-safe live broadcasts.** Pause-all and the marker toggle now reach
  observed tabs on port-bearing hosts (e.g. `localhost:5015`), not only portless
  domains — the broadcasts use the same port-stripped match pattern as
  registration.

## 0.0.8 — 2026-07-01

First tagged release. Observer behavior is unchanged from 0.0.7.

- **Pinned extension identity.** A `key` in the manifest fixes the extension id
  (`fgfnkcefedeheoeamppkiiloncfekakf`), so it survives reloads, load-path changes,
  and version bumps — your granted sites and allowlist persist across updates.
- **Release build flow.** `make dist` produces a clean versioned artifact
  (`dist/solstone-browser-<version>/` + a `.zip`) and maintains a stable
  `dist/current` symlink for the "Load unpacked once, then just hit reload" dev
  loop. `make set-version V=x.y.z` bumps all three version sites; a guard blocks a
  drifted build. See [RELEASE.md](RELEASE.md).
- **Testing.** `npm run e2e` (headless content-script → SW → relay integration,
  incl. the dynamic-registration + clean-load assertions) and
  [test/GUIDED.md](test/GUIDED.md) (real-Chrome walkthrough).

## 0.0.7 — 2026-06-30 (prototype, dogfooded)

First live Gmail → `<host>.browser` observation. Per-tab/context keying;
persisted-storage schema-migration guard; idle-skip (no segment when nothing
changed); official sol branding + icon-as-status; port-safe content-script
registration with self-gating; content-hash key fallback (fixes Gmail
volatile-id delta churn); invisible-text normalization.

Earlier 0.0.1–0.0.6 prototype iteration is in the git history.
