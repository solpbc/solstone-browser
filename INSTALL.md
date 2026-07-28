# Install solstone browser

sol is a Chromium desktop extension that experiences the sites you choose,
taking in their rendered text and rough layout. Never pixels. Never raw HTML.
It delivers a distinct `<hostname>.browser` stream to your journal on this
computer or to your journal at a paired home. A paired remote home must run
solstone 0.8.7 or newer.

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
`dist/current` is the development install; the separately named `-cws.zip` is
only for a Chrome Web Store dashboard upload.

Nothing is taken in until you add a site.

## Connect your journal

Settings opens when sol is first installed. To return later, right-click the
toolbar icon and choose **Options**, or use the **settings ›** link in the popup.

Under **where your journal lives**, choose **this computer** or **somewhere
else**. The **this computer's short name** labels the stream in both destinations,
and **send to your journal every (seconds)** controls its batch interval, so both
fields stay available whichever destination you choose. Click **save** to keep
the short name and interval for both destinations.

For **this computer**, leave **journal address** at `http://localhost:5015`,
click **save**, and allow Chrome to reach that journal origin. Then click
**connect**. The journal accepts registration from localhost.

For **somewhere else**, set the short name and interval, then click **save**
before pairing. Get a pair link from your home, paste it into the **pair link**
field, and click **pair**. Chrome asks whether sol may reach the relay origin.
After you allow it, sol verifies the home fingerprint carried in the pair link
before trusting the home, then shows the paired home and relay under **journal
details**.

Set **send to your journal every (seconds)** to `60` for a quicker walkthrough.
The default is 300 seconds.

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

Each file opens with a `segment_start` snapshot that includes the page title
and then accumulates `delta` lines as the page changes. For a paired home, the
popup becomes **connected · your home** after the first acknowledged delivery,
and the waiting count drains.

## Remove access and understand delivery

Remove a site in options to forget it. If Chrome removes access in its own
per-site controls, sol pauses the retained site so you can allow it again. Use
**unpair** to stop remote delivery to a paired home.

Everything is opt-in. Nothing is taken in until you add a site. In local
mode, what sol takes in goes to your journal on this computer. In remote mode,
it goes to your journal at your home, sealed on the way. Waiting entries are
kept locally and sealed inside the browser immediately before each remote
send. The relay carries the sealed bytes and cannot read them, but it can see
the routing, offer, and delivery framing needed to carry them.

Each page URL is reduced to its origin + path before delivery. Its query string,
fragment, and credentials are left out. On a site you add, sol takes in the
page's rendered text and rough layout in foreground and background tabs: what
you can see now and what you'd see by scrolling, plus the labels pages hand to
screen readers and tooltips, which sometimes aren't drawn on screen. Never
pixels. Never raw HTML.

## Current limits

- Chromium desktop is the supported surface. Firefox, Safari, and iOS packaging
  remain outside this repository's current scope.
- Gmail and Slack have tuned adapters. Other sites use the generic semantic
  reader.
- This extension produces and delivers queryable `browser` JSONL segments.
  Whether a journal timeline renders that stream is journal-side behavior and is
  not verified by this repository.
