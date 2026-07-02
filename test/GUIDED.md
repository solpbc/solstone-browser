# Guided test — solstone browser (you drive, real Chrome)

The observer's live path — a per-site content script talking to the MV3 service
worker, which relays finished segments to your journal — can only be exercised in
a **real, interactive Chrome** (the per-site permission grant needs your click).
This is the walkthrough you run yourself to see all three legs work. The
automated version of the *technical* path (content script → worker → relay) is
`npm run e2e` (see [AGENTS.md](../AGENTS.md) § agentic e2e); this doc is the
human-in-the-loop counterpart, and the one that proves the real opt-in UX.

`INSTALL.md` is the general install; this adds the **test discipline** (a clean
throwaway profile) and the **three legs to watch**.

## Prerequisites

- **Your solstone journal running locally** on `http://localhost:5015`, on the
  machine you're testing from (the extension registers over localhost only —
  same as the tmux/screen observers). On the dev box that's suze.local.
- **Stable Chrome desktop** (your everyday Chrome is fine — the `chrome://extensions`
  "Load unpacked" button is unaffected by the branded-Chrome flag removals).

## Step 0 — a dedicated throwaway profile (do this first)

Test in a **fresh Chrome profile**, not your daily one:

- Chrome → your avatar (top-right) → **Add** → a new person, e.g. "solstone-test".
- **No other extensions** in it — a second extension can intercept the messaging
  path and muddy what you're seeing.
- No synced state.
- Record the exact version you tested: `chrome://version` → copy the "Google
  Chrome" line into your notes.

## Step 1 — load the extension

1. In the test profile, open `chrome://extensions`.
2. Turn on **Developer mode** (top-right).
3. **Load unpacked** → choose this repo's **`extension/`** folder.
4. The **☼ sol mark** appears in the toolbar, and the card shows a **service
   worker** link (that's leg 2's console — keep it handy). Nothing is observed
   yet: the extension does nothing until you add a site.

## Step 2 — point it at your journal (Options)

Right-click the ☼ icon → **Options** (or "settings ›" in the popup):

- **This computer's short name** — set it to the machine name (it labels the
  stream, e.g. `suze` → the stream is `suze.browser`).
- **Journal URL** — confirm `http://localhost:5015`.
- **Segment length** — set to **60** seconds for a snappy demo (default 300).
- Click **connect** to test the journal connection.

## Step 3 — opt in a site, then watch the three legs

Open a site (Gmail `mail.google.com`, or any site — there's a generic reader),
click the ☼ icon → **observe this site** → **allow** the per-site permission
Chrome asks for → **reload that tab**. Now watch:

### Leg 1 — the content script (on the page)
The toolbar status icon shows the observing state, and Options lists the site as
**● observing now**. If Options still says to open or reload the tab, reload it
once so the content script attaches on the next load.

The on-page marker is optional. If you enable it in Options, a small
**“☼ observing”** marker appears bottom-right of observed tabs.

### Leg 2 — the service worker (the console)
`chrome://extensions` → the extension card → click **service worker** → a DevTools
window opens on the worker. In its Console you should see:

- `[solstone] registered as <host>.browser (…)` — registration succeeded.
- on each rotation/flush: `[solstone] segment <YYYYMMDD>/<HHMMSS_LEN> -> stored`
  — the diff was batched and uploaded.

This is where the diff/batch/upload half is visible. (The worker sleeps when
idle; interacting with the observed tab or clicking **send now** in
Options wakes it.)

### Leg 3 — the journal ingest (it landed)
The journal's observer dashboard shows **`<host>.browser` connected** (a heartbeat
fires every minute). On disk, after one segment length (or click **send buffered
now** to send immediately):

```bash
ls ~/journal/chronicle/$(date +%Y%m%d)/<host>.browser/
# -> a HHMMSS_LEN segment folder
cat ~/journal/chronicle/$(date +%Y%m%d)/<host>.browser/*/browser_*.jsonl | head
```

Each file opens with a `segment_start` snapshot of what was on the page, then
`delta` lines as it changed. It's a **distinct `<host>.browser` stream**, a
sibling of your other observer streams — never merged.

## Step 4 — the kill switch (verify it stops)
Click the ☼ icon → **pause all**. The toolbar status icon switches to paused,
and nothing is read until you resume. Confirm no new segments land while paused.

## Step 5 — revoke (verify opt-out)
Remove the site in Options, **or** use Chrome's own per-site control at
`chrome://extensions` → the extension's **site access** — the observer honors a
browser-side revoke immediately.

## What "good" looks like
- The toolbar status icon shows observing, and Options shows **● observing now**.
- The SW console shows **registered** then **stored** segments.
- The **`<host>.browser`** stream lands with clean, legible text (your content —
  no hidden/preheader junk, no full URLs).
- Pause stops it; revoke stops it; a non-added site is never touched.

## Troubleshooting
- **Options does not show observing now** → reload the tab (content script
  attaches on next load); confirm the site is listed in Options.
- **Options shows `⚠ <error>`** → the surfaced registration/observe error (errors
  are surfaced, not swallowed) tells you what failed.
- **Nothing lands** → confirm the journal is up on `localhost:5015`, that a segment
  length elapsed, or click **send now**. A transient journal outage at
  rotation drops that one segment (no offline queue yet — a known prototype edge).
