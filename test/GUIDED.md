# Guided test: sol (you drive, real Chrome)

sol's live path is a per-site content script talking to the MV3 service worker,
which sends sealed segments through a relay to your paired home. The per-site
permission grant needs your click, so this walkthrough uses a real interactive
Chrome. The technical automation is `npm run e2e`; this guide proves the live
opt-in and pair experience.

## Prerequisites

- A home running solstone 0.8.7 or newer, with a fresh browser pair link.
- Stable Chrome desktop.
- A clean build from `make dist`.

## Step 0: use a dedicated profile

Test in a fresh Chrome profile, not your daily one:

- Chrome → your avatar → **Add** → a new person, such as "sol-test".
- Leave every other extension out of this profile.
- Leave sync off.
- Copy the Chrome version from `chrome://version` into your notes.

## Step 1: load the extension

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked** and choose `dist/current`.
4. Confirm the sol mark appears in the toolbar and the extension card has a
   **service worker** link.

Nothing is read until you add a site.

## Step 2: pair your journal

Settings opens on first install. To return later, right-click the sol icon and
choose **Options**, or use **settings ›** in the popup.

1. Set **this computer's short name**.
2. Set **send to your journal every (seconds)** to **60** for this walkthrough.
3. Click **save**.
4. Paste the fresh link into **pair link** and click **pair**.
5. Allow Chrome to reach the relay origin.
6. Open **journal details** and confirm the paired home and relay are shown.

Before the first acknowledged delivery, the status reads **paired · waiting for
first sync**.

## Step 3: opt in a site and check all three legs

Open Gmail at `mail.google.com`, or another site. Click the sol icon and **add
this site**. Read the disclosure, click **add this site**, allow Chrome's prompt,
and reload the tab.

### Leg 1: page

The toolbar status icon shows the on state, and options lists the site as **on
now**. If options says to open or reload the tab, reload once.

The on-page marker is optional. Enabling it in options adds a small **☼ on**
marker to added pages.

### Leg 2: service worker

Open `chrome://extensions`, find the extension card, and click **service
worker**. Keep the console open while you use **send now**. There should be no
uncaught exception or network call outside pair dial, data dial, and device
enrollment.

### Leg 3: paired home

Click **send now**. Confirm the status becomes **connected** after the home
acknowledges the sealed segment, and confirm the waiting count drains. At the
home, verify the `<host>.browser` stream contains a `segment_start` line followed
by `delta` lines as the page changes.

## Step 4: pause

Click **pause all**. The toolbar status switches to paused, and nothing new is
read until you resume.

## Step 5: remove access, allow again, then remove

Use Chrome's per-site control to remove access. The site stays in sol as
**paused by browser**, and no new segments arrive. Click **allow again**, accept
Chrome's prompt, and reload if needed. The row returns to **on now**.

Then click **remove** in options. The row disappears and sol releases access
that no other added site or paired or pending relay needs.

## What good looks like

- The toolbar status is on, and options shows **on now**.
- A sealed segment arrives in the `<host>.browser` stream with clean text, no
  hidden preheader text, and no full page URLs.
- Pause stops new reads.
- Chrome-side access removal pauses the site until you allow it again.
- Remove forgets the site, and a site you did not add is never touched.

## Troubleshooting

- **Options does not show on now:** reload the tab and confirm the site is listed.
- **Options shows paused by browser:** click **allow again**, accept Chrome's
  prompt, and reload the tab.
- **Pairing is not finished:** paste a fresh pair link and complete Chrome's
  relay-origin prompt.
- **Nothing arrives:** confirm the paired home and relay are available, wait for
  the batch interval, or click **send now**. Waiting entries remain in the
  durable outbox and retry; if it stays full too long, the oldest entries are
  counted and surfaced.
