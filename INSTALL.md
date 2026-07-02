# Install — solstone browser (prototype)

**This is a discovery prototype, not a finished product.** It's a Chrome
extension that experiences a few web apps you choose — reading their visible
text, never screenshots — and relays what it reads into your solstone journal as
its own `browser` stream.

## Prerequisites

- Chrome (desktop).
- Your solstone journal running locally on `http://localhost:5015`.
  The extension registers itself as a `<hostname>.browser` observer over that
  local link — same way the tmux and screen observers register. It only works on
  the machine the journal runs on (the journal accepts registrations from
  localhost only).

## Install (one paragraph)

Open `chrome://extensions`, turn on **Developer mode** (top-right), click **Load
unpacked**, and choose the `extension/` folder inside this repo. That's it — the ☼ sol mark appears in
your toolbar. Pin solstone so the status light stays visible. Nothing is observed
yet: the extension does nothing until you add a site. Open the options page
(right-click the icon → **Options**, or the
“settings ›” link in the popup) and confirm **this computer's short name** is set
to your machine's name (it labels the stream — e.g. `laptop`) and the journal URL
reads `http://localhost:5015`. For a snappy demo, set
**segment length** to `60` seconds (default is 300, matching the other
observers).

> **Reloading after an update?** If you already had `0.0.1` loaded, click the
> **↻ reload** icon on the extension's card in `chrome://extensions` to pick up
> `0.0.2`, then **reload any tabs** you want observed.

## What to look for

1. **Add a site — any site.** Open the site you want (Gmail `mail.google.com`,
   Slack `app.slack.com`, or *any* other site — there's a generic reader for
   everything beyond the two tuned adapters), click the ☼ toolbar icon, and click
   **observe this site**. Chrome asks permission to read just that site — allow
   it. You can also add a host by name in **Options** (works for `localhost`, an
   IP, or `host:port` too). **Then reload that tab** so the content script
   attaches on the next load.
2. **The status light.** The toolbar icon is the visible observation signal: it
   shows observing, connecting, can't reach your journal, paused, or attention at
   a glance. Pin solstone to keep that signal visible. If you want an in-page cue
   too, enable the optional on-page marker in **Options**. The Options page shows each site as
   **● observing now**, **added — open or reload a tab**, or **⚠ <error>** if
   something went wrong (errors are now surfaced, not swallowed).
3. **Pause.** Click the icon → **pause all**. The toolbar icon switches to
   paused, and nothing is read until you resume. This is the one-tap kill switch.
4. **Watch it reach your journal.** Leave an observed tab open for one segment
   length (60s if you set that), or click **send now** in the options
   page to send immediately. The journal's observer dashboard should also now
   show `<hostname>.browser` as **connected** (a heartbeat fires every minute).
   Then check the stream landed (substitute the short name you set above):

   ```bash
   ls ~/journal/chronicle/$(date +%Y%m%d)/<hostname>.browser/
   # -> a HHMMSS_LEN segment folder containing browser_mail-google-com.jsonl etc.
   cat ~/journal/chronicle/$(date +%Y%m%d)/<hostname>.browser/*/browser_*.jsonl | head
   ```

   Each file opens with a `segment_start` snapshot of what was on the page, then
   accumulates `delta` lines (new message added, unread count updated, …) as the
   page changes. It's a **distinct `<hostname>.browser` stream**, a sibling of
   your other observer streams (e.g. `iphone.mobile`) — never merged into another
   stream.

## Removing / revoking

- Remove a site in the options page (or click the icon → it reflects state). You
  can also use Chrome's own per-site control at `chrome://extensions` (the
  extension honors a browser-side revoke immediately).
- The whole thing is opt-in and local: no site is touched until you add it, and
  the content never leaves this machine — it goes only to your local journal.

## New in 0.0.3

- **Official sol branding** — the real sol ring mark, Comfortaa/Inter type, the
  cream/orange palette, and on-voice copy throughout (popup, options, the on-page
  marker).
- **Icon-as-status** — the toolbar icon is now a live status light using the
  official sol ring-state marks: **observing** (sun), **paused** (sun behind a
  cloud), **error/disconnected** (sun + ✕).
- **Lifecycle resilience** — flushes a final read before a tab is hidden/frozen
  and re-reads on resume / back-forward-cache restore, so nothing is lost when
  Chrome freezes a background tab.

## Fixed in 0.0.2

- **Port-bearing sites no longer silently fail.** Adding `localhost:5015` (or any
  `host:port`) used to build an invalid Chrome match pattern and quietly do
  nothing. Now the content script registers on the port-less hostname and
  self-gates to the exact `host:port` you added, so any site works.
- **Errors surface in the UI** (popup + Options) instead of being swallowed.
- **Heartbeat** so the journal observer dashboard reads "connected" honestly,
  not only right after an upload.
- **Any site** is observable — any normal website (the generic reader covers
  everything beyond Gmail/Slack) **and** `localhost` / IPs / `host:port` dev
  servers. (Chrome's match-pattern docs confirm a port-less pattern matches *all*
  ports, so the journal dashboard `localhost:5015` works too — observing it just
  isn't very useful; point it at a real site.)

## Known prototype edges (see the learnings writeup)

- Chrome desktop only (the cross-browser/iOS packaging is the eventual shape, out
  of scope here).
- Gmail + Slack have thin adapters; any other site uses a solid generic reader.
- Browser segments land on disk and are queryable, but the journal doesn't yet
  *render* a `browser` stream in the timeline the way it renders screen/audio —
  that's a journal-side follow-up the spike surfaced, not a bug in the extension.
- No offline retry queue yet: if the journal is down at the moment a segment
  rotates, that segment is dropped (fine for localhost; noted for the real build).
- The live content-script → worker → relay path is now covered two ways: an
  automated headless harness (`npm run e2e`, using Playwright's real new-headless
  build, which *does* inject our dynamically-registered content scripts), and the
  guided walkthrough you run in real Chrome (`test/GUIDED.md`) — the toolbar
  status light and popup state are your proof it's working, and only real Chrome
  exercises the per-site opt-in permission grant.
