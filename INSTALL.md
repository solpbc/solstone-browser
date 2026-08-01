# Install solstone browser

> **status: parked.** this extension is not abandoned. it will return bundled
> with native sol and deliver through a native app link. this version does not
> currently deliver to any journal.

sol is a Chromium desktop extension that experiences the sites you choose,
taking in their rendered text and rough layout. Never pixels. Never raw HTML.
It delivers a distinct `<hostname>.browser` stream to your journal at a paired
home. The home must run solstone 0.8.7 or newer.

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

## Pair your journal

Settings opens when sol is first installed. To return later, right-click the
toolbar icon and choose **Options**, or use the **settings ›** link in the popup.

Set **this computer's short name** and the batch interval, then click **save**.
Get a pair link from your home, paste it into **pair link**, and click **pair**.
Chrome asks whether sol may reach the relay origin. After you allow it, sol
verifies the home fingerprint carried in the pair link before trusting the
home. The paired home and relay appear under **journal details**.

Set **send to your journal every (seconds)** to `60` for a quicker walkthrough.
The default is 300 seconds.

## Try it

1. **Add any site.** Open Gmail at `mail.google.com`, Slack at `app.slack.com`,
   or another site, then click the sol toolbar icon and **add this site**. Read
   the in-popup disclosure, click **add this site** there, then allow Chrome's
   prompt for that site. You can also add a hostname, IP, or `host:port` in
   options. Reload the tab after adding it.
2. **Read the status light.** The toolbar and popup distinguish connected,
   waiting for first sync, pairing not finished, not paired, can't reach,
   paused, paused by browser, and attention states. The on-page marker is
   optional and off by default.
3. **Pause and resume.** Click **pause all** to stop reading every added site.
   Nothing new is read until you resume.
4. **Send what is waiting.** Leave an added tab open for one segment, or click
   **send now** in options. If the paired home does not answer, the entry stays
   in the durable outbox and retries. If the bounded outbox fills, sol drops the
   oldest entries and shows the loss.

After the first acknowledged delivery, the popup becomes **connected · your
home** and the waiting count drains. At your home, each file opens with a
`segment_start` snapshot that includes the page title and then accumulates
`delta` lines as the page changes.

## Remove access and understand delivery

Remove a site in options to forget it. If Chrome removes access in its own
per-site controls, sol pauses the retained site so you can allow it again. Use
**unpair** to stop delivery to a paired home.

Everything is opt-in. Nothing is taken in until you add a site. What sol takes
in goes to your journal at your home, sealed on the way. Waiting entries are
kept on this device and sealed inside the browser immediately before each send.
The relay carries the sealed bytes and cannot read them, but it can see the
routing, offer, and delivery framing needed to carry them.

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
