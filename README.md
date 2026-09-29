# solstone-browser

Development source for the browser extension that connects to the solstone app on the same computer through native messaging. The native return is under development; this checkout is not a published extension release.

The solstone app takes in what you share with it, and all of it goes into your journal. In this extension, you choose sites and agree to the disclosure before any page reading begins. A compatible running app must also authorize it. The extension sends page material only through the native connection; the app owns delivery to your journal.

The browser targets are desktop Chrome, Edge and Firefox. Building the extension does not install the app or its native helper. Use an isolated development profile and a matching development host for integration work.

## Build and check

```sh
make dist
```

This runs the development checks and writes the unpacked development build to `dist/current`, plus separate development and Chrome Web Store candidate ZIPs. It does not upload or publish them. See [INSTALL.md](INSTALL.md) for setup and browser loading, and [RELEASE.md](RELEASE.md) for package identities and release gates.

## Source tree

- `extension/`: background controller, page scripts, toolbar and settings.
- `extension/lib/`: authorization, native connection, durable outbox and shared logic.
- `contracts/native-browser/`: versioned envelope schemas, generated constants, registration authority and conformance vectors.
- `native-browser/`: JavaScript contract validation.
- `crates/native-browser-frame/`: shared Rust native-message framing.
- `scripts/`: contract generation, package verification and release tooling.
- `test/`: unit tests, IndexedDB tests and browser diagnostics.

Contributor guidance is in [AGENTS.md](AGENTS.md). Licensed under [AGPL-3.0-only](LICENSE).
