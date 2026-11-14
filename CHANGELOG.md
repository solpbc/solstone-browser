# Changelog: solstone-browser

Notable changes to the extension. The version is `manifest.json`'s `version`;
`make set-version` keeps `manifest.json` / `package.json` / `package-lock.json` /
`background.js` in lockstep, and `make dist` refuses to build if they drift.

## [Unreleased]

### Added

- when your browser allows every website, settings has a field to leave a site out by typing its address, so it stays out before you ever open it. settings also says that your browser's own settings don't show the sites you leave out.

### Changed

- on iphone and ipad, the popup no longer describes the prompt Safari shows after you tap `add this site`.
- on a mac, while the solstone app doesn't have Accessibility, the extension no longer offers to leave a site out, and the popup and settings say so where the button was.

### Fixed

- in the popup's list of sites that need attention, a site the extension couldn't start on shows its whole address across the row, instead of one letter per line.
- in settings, a site the solstone app also leaves out can only be included again while the extension is connected to the solstone app, so settings no longer says it's back in while the app still leaves it out.
- the popup's count of sites left out includes the ones you left out in the solstone app.
- with pages open, the solstone extension uses less battery and processor time, because it no longer repeats the same work every few seconds while nothing on them changes.

## [0.5.10] (2026-11-07)

### Changed

- the sites your browser allows are the sites the solstone extension takes in, and all of it goes into your journal. if your browser allows every website, every site goes in, except the sites you leave out.
- if you added sites one at a time before this update, only those sites go into your journal until you choose otherwise. if your browser already allows more than that, the extension asks you before taking those sites in.
- if you haven't agreed yet, Chrome and Edge ask you to agree in the extension before it takes anything in. Firefox and Safari don't ask for a separate agreement.
- on a new install on a computer, settings first asks which sites you want in your journal: every site, or sites one at a time.
- `add this site` goes straight to your browser's own prompt.
- the solstone extension no longer offers an icon on the pages that go into your journal. your browser shows when the extension is on, and on which sites.

### Fixed

- on ipad, the solstone extension's window in Safari is now wide enough to read, and its settings page points to the extensions button in Safari's address bar, where ipad keeps the extension.
- if you say no when your browser asks to allow a site, the solstone extension no longer shows your answer in red, as if something went wrong.

## [0.5.9] (2026-11-05)

### Changed

- a simpler popup and settings page, only for the solstone extension in Safari on iphone and ipad, which isn't out yet. nothing changes in Chrome, Firefox or Safari on a mac.

## [0.5.8] (2026-11-05)

### Changed

- more changes only for the solstone extension in Safari on iphone and ipad, which isn't out yet. nothing changes in Chrome, Firefox or Safari on a mac.

## [0.5.7] (2026-11-05)

### Changed

- changes for Safari on iphone and ipad only, which isn't out yet. nothing changes in Chrome, Firefox or Safari on a Mac.

## [0.5.6] (2026-11-05)

### Fixed

- on iphone and ipad, the settings page now fits the screen, so its text and buttons are full size.

## [0.5.5] (2026-11-05)

### Fixed

- the toolbar icon, the popup and settings no longer say "on" before the solstone app has answered, and no longer flash "can't reach the solstone app" while the extension restarts in the background. when you open the solstone app and come back to your browser, they show that right away. before, that could take up to a minute.

## [0.5.4] (2026-11-04)

### Changed

- the button that takes a site off your left-out list now says stop leaving out. before, it said include, which read like adding the site to your shared sites.
- on Safari, a site left out while the solstone app can't check addresses now says the app is keeping out more than that site.
- a link inside a sentence now stays in that sentence, and the site that link points to no longer goes into your journal. before, the sentence went into your journal with a gap and the link went in alone on its own line, and long pages ran out of room sooner.

### Fixed

- some pages, like ones on news and documentation sites, could reach your journal with almost none of their text. their text now goes into your journal.
- the status check no longer says you're paired while the app is still waiting for your answer.

## [0.5.3] (2026-11-01)

### Fixed

- in the popup, the message about what you just did, like adding a site Safari won't allow yet or removing one, now scrolls into view. before, it could sit below the part of the popup you can see, so you might not have seen it.

## [0.5.2] (2026-11-01)

### Fixed

- in Safari, a site you added that sits under another site you added, like mail.example.com under example.com, no longer shows as "paused by Safari" while its pages are going into your journal. if you remove the wider site, the one under it keeps going into your journal.
- in Safari on a mac, adding a site while Safari already allows a site under it now says why Safari didn't ask and how to allow it in Safari's settings. before, it didn't say why.
- in Chrome, Edge and Firefox, "allow all … sites" in settings, for a site that covers only its exact address, now asks your browser for all its sites and pages. before, it asked again for that one address, so it kept covering only that address. in Safari, the button is gone, and settings says to remove the site and add it again.

## [0.5.1] (2026-11-01)

### Changed

- in Firefox, which version of Firefox you use no longer goes into your journal. that the browser is Firefox still does.

### Fixed

- in Firefox, adding a site from settings or from the popup now asks Firefox for access. before, Firefox never asked, and the extension said "permission declined. nothing added."

## [0.5.0] (2026-11-01)

### Added

- on the sites you share, the solstone extension now also takes in whether the tab was in front, whether its window had focus, whether audio or video was playing, the page's language, which browser it is, and how long the tab has been open with the extension running, and all of it goes into your journal.
- choose whether the extension pauses when you pause the solstone app. the setting is on by default; turn it off in settings and the extension keeps taking in your shared sites while you've paused the app, and all of it goes into your journal.

### Changed

- adding bank.com now shares all bank.com sites and pages, like www.bank.com and login.bank.com, and the confirmation says so before anything is shared. to share only part of a site, add that address, like mail.google.com. a site you added before this update keeps covering only its exact address until you allow the rest in settings.
- the extension no longer takes back a site you allowed it on in your browser. once you've agreed to share, a site you allow in your browser is added to "sites you add", and the extension tells you. one you allowed before that is offered first, so you can choose "don't add". removing a site or leaving it out stays that way, including when the browser keeps a wider permission. "leave this site out" now works in both "sites you add" and "all sites".
- in "all sites", leaving out bank.com now leaves out all bank.com sites and pages, like www.bank.com and login.bank.com, including sites you left out before this update. typing `www.bank.com` or `*.bank.com` means bank.com. before, Chrome and Edge saved a typed `*.bank.com` as left out, though it left nothing out; that entry now covers bank.com, as you meant.

### Fixed

- in Safari, after the solstone app updates, a tab you already had open on a site you share could stop being taken in, while the extension still showed the site as "on now". the extension now shows "reload this tab to begin" for that site until you reload the tab.
- Safari's settings for the solstone extension no longer list `InvalidStateError` errors when the extension is interrupted while taking in a page. thanks @dvanduzer.
- in settings, you can now add a site by pasting its whole address, like `https://example.com/some/page`. before, pasting an address showed "enter a website address" instead. the extension adds the site, not the page, and a site you paste with `http://` stays `http://`. reported and fixed by ha-ye.
- the optional on-page mark shows "on" only while the page is taken in. before, it could keep saying "on" after you left the site out, after the solstone app closed, or after you paused and resumed.
- settings, the popup and the toolbar icon no longer flash "can't reach the solstone app" for a moment while the solstone app is running and connected. reported by ha-ye.
- a typed address with a path, like `github.com/solpbc`, now adds its site too. a typed local address, like `localhost:3000` or `192.168.1.1`, is added as `http://`, and your list shows a site's port when it has one, so two addresses on one computer never look alike.
- adding a site in settings now always says what happened: when you decline the browser's prompt, when a site can't be added right now, or when it's already on your list. removing a site says so too.
- a site's warning says what went wrong in plain words, and goes away when you remove the site. "reload this tab to begin" clears once the page is taken in.
- if the solstone app is on this computer but closed, the extension asks you to open it, instead of sending you to download it again. it also looks for the app as soon as you open the extension or its settings, so you don't wait up to a minute after opening the app. on linux, it also says what to do next.
- settings has a resume button while the extension is paused. "allow again" asks the browser straight away, even while the solstone app is closed, and the popup can allow several sites again with one prompt.
- on browser add-on store pages, the popup says the browser doesn't let extensions work there, instead of offering to add the site.

## [0.4.0] (2026-10-25)

### Added

- choose all sites in the extension's settings, after a separate agreement, and leave out the sites you don't want. sites you add one at a time remain the default, and your list is kept for when you switch back. the popup names how you're sharing and why the page you're on is or isn't shared. in Safari, settings shows you how to allow all websites in Safari's own settings, and checks again when you come back.

## [0.3.0] (2026-10-13)

### Added

- the solstone extension now works in Safari on a mac, with Safari 18.4 or later. it comes with the solstone app, and you turn it on in Safari's settings, under extensions. it takes in nothing from private windows, even where your browser lets it run there.

### Fixed

- when you add a site, the confirmation names the site, like `example.com`, not its full web address.
- in Safari, clearing the extension's storage now also clears the sites and agreement it held in memory.

## [0.2.0] (2026-10-11, Chrome Web Store)

this is the 0.2.0 that reached the Chrome Web Store, built from `731a80d`. the July entry below describes an earlier build that used the same version number.

- the extension connects to the solstone app on this computer. what you share goes into your journal over the link you've already paired.
- before you add a site, the welcome page explains what the extension takes in and asks you to agree. the disclosure appears as a list, with instructions for opening solstone from the toolbar or extensions menu.
- pages waiting to go into your journal stay on this computer through a lost connection or a change of pairing. once you confirm the new journal's mark, waiting pages go there.
- the popup and settings show whether new pages can be taken in and whether pages are waiting to go into your journal. pausing stops new page reading while pages already taken in can still go into your journal.
- the popup's about section shows a copyable version line for the extension and your journal.

## 0.2.0 (2026-07-30)

sol now sends browser segments only to your journal at a paired home.

- **one sealed route.** the same-computer address and connect controls are gone. pair your journal once, and every segment goes through the sealed relay path.
- **clearer setup and status.** settings leads with pairing, and the popup opens settings when your journal is not paired.
- **safe upgrade.** waiting entries from earlier versions keep their identity and contents, then leave through the sealed path with only the host and platform in their metadata.

## 0.1.1 (2026-07-27)

- development and Chrome Web Store packages are now built and checked separately. sol in the browser itself is unchanged.

## 0.1.0 (2026-07-26)

sol now takes no access at install, says what it takes in and where it lands in your journal before you add a site, and gives every screen the same answer about where your pages go.

- **access only when you ask for it.** sol used to hold access to your journal's address on this computer from the moment it was installed. it doesn't anymore: it asks Chrome for that address when you connect your journal, and for a site when you add that site. nothing is taken in until you add your first site.
- **what sol takes in, before it takes anything in.** a fresh install now opens settings with a plain account of what sol takes in and where it goes, and adding a site shows the same before Chrome asks. on a site you add, sol takes in the page's rendered text and rough layout and keeps it in your journal: what you can see now, what you'd see by scrolling, background tabs, and the labels pages hand to screen readers and tooltips. never pixels, never raw HTML, never a site you didn't add. sol pbc can never read any of it. on this computer it never leaves the computer at all; at your home it reaches us only sealed, and we hold no key.
- **shorter page addresses.** the address of a page is now reduced to the site and the path before it leaves the page. the query string, the fragment, and any sign-in credentials in the address are left behind, so they are never kept and never sent.
- **one status, everywhere.** the popup, settings, the toolbar icon, and every site row now show the same reading instead of separate signals that could disagree with each other. it says where your pages are going, not only whether something is connected.
- **a journal at your home reads as connected.** if your journal runs somewhere other than this computer, sol reported it as not connected in the popup, in settings, on the toolbar icon, and on every site row, and never stopped, even while everything was arriving. this resolves it, and **open your journal** no longer points at this computer when your journal isn't there.
- **one journal card, and honest outcomes.** settings now has a single **your journal** card, this computer or somewhere else, in place of the two that competed. a declined Chrome prompt says the address wasn't allowed rather than that your journal can't be reached, a site you had already set up no longer reports an error, and saving tells you what it kept.

## 0.0.13 (2026-07-15)

sol now keeps the sites you chose when Chrome changes their access, and makes getting them going again one tap.

- **Your choices stay yours.** If Chrome removes access to an added site, sol pauses it instead of forgetting it. Nothing more is read there, and the site remains in settings so you can allow it again.
- **One-tap recovery.** The popup, settings rows, and toolbar status show the calm “paused by browser” state without treating it as an error. Sites sharing one Chrome host grant pause and return together.
- **Only the access sol still needs.** sol regularly reconciles Chrome's grants and releases access that no added site, built-in journal connection, or paired remote home uses.

## 0.0.12 (2026-07-04)

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
  incl. the dynamic-registration + clean-load assertions) and a real-Chrome
  walkthrough.

## 0.0.7 — 2026-06-30 (prototype, dogfooded)

First live Gmail → `<host>.browser` observation. Per-tab/context keying;
persisted-storage schema-migration guard; idle-skip (no segment when nothing
changed); official sol branding + icon-as-status; port-safe content-script
registration with self-gating; content-hash key fallback (fixes Gmail
volatile-id delta churn); invisible-text normalization.

Earlier 0.0.1–0.0.6 prototype iteration is in the git history.
