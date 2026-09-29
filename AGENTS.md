# Contributor instructions

This repository implements the native-messaging browser extension for desktop Chrome, Edge and Firefox. Read [README.md](README.md), [INSTALL.md](INSTALL.md), and [RELEASE.md](RELEASE.md) before changing its lifecycle or packaging.

## Architecture and boundaries

The extension has one background-owned native connection. The native helper connects it to the solstone app on the same computer. Pairing credentials, destination identity and delivery to the journal belong to the app. Do not add an extension pairing flow, relay client, credential store or data-bearing network path.

The content scripts produce semantic page blocks. They do not segment files or upload content. `background.js` and `lib/router.js` validate browser-supplied message provenance and own site authorization. `lib/gate.js` requires current disclosure consent, the exact site grant, a positive unexpired app lease, and no applicable pause or pressure before a DOM walk. Revocation and asynchronous work must use the same authoritative state; a late callback cannot reopen an expired gate.

`lib/native_port.js` owns port identity, freshness, reconnect and receipt handling. `lib/native_outbox.js` persists complete skims and their durable batch identities in IndexedDB. Sending is at least once: retry the saved batch under the same identity. Recovery snapshots come from its original skim, never a new DOM read. The app assigns periods and handles finalization; a boundary can require a new snapshot. App acceptance means kept locally, not delivered to the journal.

Keep page-reading authorization separate from delivery. Pause closes new page reading but does not erase or hold back material already taken in. Generation changes must prevent an old batch from reaching a newly paired journal. Never evict accepted material to make room or turn local queue expiry into a delivery claim.

`contracts/native-browser/` is the versioned wire authority. It imports the journal's browser-record schema; do not maintain a second record definition. Generated constants, registration data, JavaScript validation and Rust framing must stay in agreement. Update the manifest and conformance vectors deliberately when the contract changes. Native implementations consume this bundle.

## Page semantics

The page reader takes text and rough structure, not pixels or raw HTML. Its semantics are broader than the visible viewport: text below the fold and in background tabs, accessibility labels, tooltips and other page-held text can enter a skim. Do not describe it as visible-text-only or promise that unsent or sensitive text is excluded. The disclosure in the extension is the owner-facing explanation.

Blocks use stable IDs where available and carry bounded text, type, depth and attributes. Page addresses omit query, fragment and credentials; link targets are reduced to host. Preserve the canonical field bounds and explicit truncation signal. The app and journal validate records independently.

## Development checks

```sh
make install        # locked npm development dependencies
npm test            # JavaScript unit and contract tests
npm run test:idb    # production IndexedDB adapter using fake-indexeddb
make ci             # locked install, JS tests, IDB, Rust framing and contract drift
make dist           # full gate, unpacked build and verified ZIPs
make package-check  # verify already-built artifacts
```

The shipped runtime is plain scripts with no npm runtime dependency. `make ci` does not launch a browser, install a native host or demonstrate app/journal delivery. Keep deterministic transition and contract tests in routine CI. Exercise real permissions, lifecycle races, native processes and network behavior with caller-owned integration runs on isolated profiles and test journals.

`make smoke` is a DOM-skim diagnostic requiring a real Chrome; `make popup-check` is a browser layout diagnostic requiring Playwright Chromium. `make e2e-deps` installs Playwright Chromium for the layout diagnostic. These diagnostics are separate from `make ci`. There is no relay end-to-end target.

For permission tests, use the real owner gesture and browser prompt. A fixture manifest with pregranted host access cannot prove the production grant flow. Instrument before the first page-script statement when claiming zero reads; inspecting only later mutations misses bootstrap work. Runtime egress checks must detect attempted calls even when CSP blocks the request, and must fail under a deliberate leak mutation.

## Packaging and changes

One manifest contains both browser background forms. Keep the Firefox script order aligned with the service worker imports, preserve private-window exclusion and the required data declarations, and reopen every archive to check referenced runtime files. Production and development identities select different native host names; never merge their allowlists.

Keep the existing manually dispatched Chrome Web Store workflow as the only GitHub workflow. Do not publish, submit to a store or change a release channel as a side effect of tests. Package construction and release approval are separate steps.

New JavaScript source begins with:

```js
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc
```

License: AGPL-3.0-only.
