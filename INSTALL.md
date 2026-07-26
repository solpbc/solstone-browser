# Install solstone browser

sol is a Chromium desktop extension that experiences the sites you choose,
reading their visible text and rough layout, never screenshots. It delivers a
distinct `<hostname>.browser` stream to your journal on this computer or to your
journal at a paired home. A paired remote home must run solstone 0.8.7 or newer.

## Install

If there is a Chrome Web Store listing for **solstone browser**, install from
there. It updates itself and needs no developer mode. Otherwise, or if you are
working on sol itself, use the developer path below.

From a repository checkout, run:

```bash
make dist
```

Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**,
and choose `dist/current`. Pin sol so its status light stays visible. After a
later `make dist`, click **reload** on the extension card. The self-distributed
manifest identity keeps your added sites and permissions across rebuilds.

Nothing is read until you add a site.

## Connect your journal

Open options by right-clicking the toolbar icon and choosing **Options**, or use
the **settings ›** link in the popup.

The short name you save labels the stream in both modes, so save it before
pairing a remote home.

For **your journal on this computer**, leave the journal URL at
`http://localhost:5015`, set **this computer's short name** to the name that
should label the stream, then save or click **connect**. Chrome asks whether sol
may reach that journal origin. The journal accepts registration from localhost.

For **your home, reached over a sealed link**, get a pair link from your home.
Paste it into the **pair link** field and click **pair**. Chrome asks whether sol
may reach the relay origin. After you allow it, sol verifies the home fingerprint
carried in the pair link before trusting the home, then reports the paired home
and relay in settings.

Set **segment length** to `60` seconds for a quicker walkthrough. The default is
300 seconds.

## Try it

1. **Add any site.** Open Gmail at `mail.google.com`, Slack at `app.slack.com`,
   or another site, then click the sol toolbar icon and **add this site**. Read
   the in-popup disclosure, click **add this site** there, then allow Chrome's
   prompt for that site. You can also add a hostname, IP, or `host:port` in
   options. Reload the tab after adding it.
2. **Read the status light.** The toolbar and popup distinguish connected,
   connecting, needs permission, waiting for first sync, pairing not finished,
   can't reach, paused, paused by browser, and attention states. The on-page
   marker is optional and off by default.
3. **Pause and resume.** Click **pause all** to stop reading every added site.
   Nothing new is read until you resume.
4. **Send what is waiting.** Leave an added tab open for one segment, or click
   **send now** in options. If the destination does not answer, the entry stays
   in the local durable outbox and retries. If the bounded outbox fills, sol
   drops the oldest entries and shows the loss.

For a journal on this computer, verify the stream on disk using the short name
you configured:

```bash
ls ~/journal/chronicle/$(date +%Y%m%d)/<hostname>.browser/
cat ~/journal/chronicle/$(date +%Y%m%d)/<hostname>.browser/*/browser_*.jsonl | head
```

Each file opens with a `segment_start` snapshot and then accumulates `delta`
lines as the page changes. For a paired home, the popup becomes
**connected · your home** after the first acknowledged delivery, and the waiting
count drains.

## Remove access and understand delivery

Remove a site in options to forget it. If Chrome removes access in its own
per-site controls, sol pauses the retained site so you can allow it again. Use
**unpair** to stop remote delivery to a paired home.

Everything is opt-in. No site is read until you add it. In local mode, what sol
takes in goes to your journal on this computer. In remote mode, it goes to your
journal at your home, sealed on the way. Waiting entries are kept locally and
sealed inside the browser immediately before each remote send. The relay carries
the sealed bytes and cannot read them, but it can see the routing, offer, and
delivery framing needed to carry them.

Each page URL is reduced to its origin + path before delivery. Its query string,
fragment, and credentials are left out. Sol reads visible semantic text and
structure, never pixels or raw HTML.

## Current limits

- Chromium desktop is the supported surface. Firefox, Safari, and iOS packaging
  remain outside this repository's current scope.
- Gmail and Slack have tuned adapters. Other sites use the generic semantic
  reader.
- This extension produces and delivers queryable `browser` JSONL segments.
  Whether a journal timeline renders that stream is journal-side behavior and is
  not verified by this repository.
