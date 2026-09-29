# Build the development extension

These instructions are for contributors. The native return is under development and is not a published extension release. A development package alone cannot send pages to your journal: it also needs a compatible development build of the solstone app and that app's native-host registration.

## Build

Use a repository checkout with Node.js and npm, Rust and Cargo, Python 3, and Make available:

```sh
make dist
```

The command installs locked npm development dependencies, runs `make ci`, builds the packages, and verifies both ZIPs. Runtime files do not load npm dependencies or remote scripts. Build output replaces `dist/`; keep any artifacts you need outside that directory.

## Load in a separate browser profile

Use synthetic pages or test accounts you control. Start with a new browser profile so earlier grants and queued material cannot affect the result.

- **Chrome:** open `chrome://extensions`, enable Developer mode, choose Load unpacked, and select `dist/current`.
- **Edge:** open `edge://extensions`, enable Developer mode, choose Load unpacked, and select `dist/current`.
- **Firefox:** open `about:debugging#/runtime/this-firefox`, choose Load Temporary Add-on, and select `dist/current/manifest.json`. The temporary installation lasts for that browser session.

The manifest requires Chrome 121 or later and Firefox 140 or later. Chrome and Edge use the background service worker; Firefox uses the ordered background scripts in the same manifest.

Development Chrome/Edge builds have ID `fgfnkcefedeheoeamppkiiloncfekakf`; development Firefox uses `browser.dev@solstone.app`. Both select **`app.solstone.browser.dev`**. The app used for the test must register that separate development host for the relevant browser. Do not place a development allowlist under the production host name or replace an existing registration. The registration authority in `contracts/native-browser/authority.json` defines the paths and identities; generated manifests live under `contracts/native-browser/registration/`.

Without a reachable compatible app, the extension cannot begin reading pages. Do not bypass the disclosure, site permission, pause or live-app checks to make a test pass. Complete setup through the extension's own interface once the matching app is ready.

After rebuilding, reload the extension from the browser's extension-management page. Firefox temporary add-ons may need to be loaded again after browser restart.

## Checks

```sh
make ci
make package-check
```

`make package-check` verifies artifacts already created by `make dist`. Neither command proves that an installed app accepted or delivered a page. That requires an actual browser, the matching helper and app, and a test journal.

See [AGENTS.md](AGENTS.md) for test boundaries and [RELEASE.md](RELEASE.md) before preparing a release.
