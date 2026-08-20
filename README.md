# solstone-browser

> **Status: parked.** This extension is not abandoned. This source tree is not a usable release and does not currently deliver material to any journal.

This repository contains a Chromium Manifest V3 semantic browser extension for solstone. It is retained for future development of text intake from web apps an owner chooses.

## Source tree

```text
extension/            unpacked-loadable MV3 extension
  manifest.json        browser permissions and extension metadata
  background.js        service worker
  content.js           per-tab coordinator
  skim.js              semantic DOM walker
  adapters.js          site adapters and generic fallback
  popup.html/.js       toolbar popup
  options.html/.js     settings interface
  lib/                 shared implementation modules
test/                  unit, source, and browser checks
scripts/               packaging and verification helpers
```

## Development setup

This section is for contributors working on the parked source tree, not for product installation.

```bash
make dist
```

Open `chrome://extensions`, enable **Developer mode**, select **Load unpacked**, and choose `dist/current`. After a later `make dist`, select **reload** on the extension card.

## Tests

```bash
npm test
make ci
```

See [AGENTS.md](AGENTS.md) for contributor guidance and [INSTALL.md](INSTALL.md) for the source-tree setup details.

## License

AGPL-3.0-only. See [LICENSE](LICENSE).
