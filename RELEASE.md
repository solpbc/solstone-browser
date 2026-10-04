# Package and release reference

The native return is under development. Package creation does not authorize store submission or publication. Complete installed-app compatibility, security, owner-copy and store-declaration review before a public release.

## Package identities

| Channel | Browser identity | Native host |
|---|---|---|
| Development Chrome and Edge | `fgfnkcefedeheoeamppkiiloncfekakf` | `app.solstone.browser.dev` |
| Development Firefox | `browser.dev@solstone.app` | `app.solstone.browser.dev` |
| Production Chrome and Edge | `eibbeeoifjoabddfmgeggnageolkcnim` | `app.solstone.browser` |
| Production Firefox | `browser@solstone.app` | `app.solstone.browser` |

The development Chromium manifest has a fixed `key`. The Chrome Web Store candidate removes `key` and `update_url` and uses the production Firefox ID in its shared manifest. Runtime identity selects the host; an unpacked development extension must never depend on a production manifest being overwritten with its ID. Registration authority lives in `contracts/native-browser/authority.json`; generated manifests live under `contracts/native-browser/registration/`.

## Build from an exact revision

```sh
make dist
make package-check
```

`make dist` runs `make ci`, checks the version across `extension/manifest.json`, `extension/background.js`, `package.json` and `package-lock.json`, then rebuilds `dist/`. It writes:

- `solstone-browser-<version>/`: unpacked development tree.
- `solstone-browser-<version>-dev.zip`: development archive.
- `solstone-browser-<version>-cws.zip`: Chrome Web Store candidate.
- `current`: relative symlink to the unpacked tree.

Both ZIPs use stable file ordering and normalized metadata. The build reopens them and validates manifests, permissions, background references, runtime files and channel identities. Store acceptance remains a separate result. The current build does not provide an AMO submission or signed Firefox update channel.

Use `make set-version V=<next-version>` to update the four version locations together. Choose an unused version, update the changelog, commit, and build from that exact revision. Preserve the source revision, artifact hashes and command results with a release. Never replace an existing release tag or asset.

## Installed compatibility gate

For each supported browser and desktop, verify the extension with the actual signed app/helper and a test journal. A matching wire version is necessary but does not prove the installed path. Check delivery and search, app quit/pause, crash and lost-ACK replay, held-page delivery after re-pair and mark confirmation, unpairing for more than ten minutes followed by confirmation of a different journal, version mismatch recovery, private-window exclusion, manifest repair and app update while helpers are connected. Confirm production registrations contain only production IDs and that no development registration is overwritten during app launch or update.

Run the shared raw-message vectors in JavaScript, Rust and each native implementation. Record the adopted bundle and journal-schema digests. Exercise runtime network observation with a deliberate leak mutation; static CSP inspection alone is insufficient. App custody acknowledgments cannot stand in for journal delivery evidence.

## Chrome Web Store operations

The existing **Chrome Web Store** workflow is manually dispatched and uses its protected GitHub environment. Do not add an automatic release workflow. The local operator interface is:

```sh
make cws-status
make cws-stage CWS_CONFIRM=<exact-version>
make cws-publish-staged CWS_CONFIRM=<exact-version>
make cws-cancel CWS_CONFIRM=<exact-version>
```

The first command reads status. The remaining commands mutate store state and require explicit release authorization. `cws-stage` builds, uploads and submits for staged review; approval does not publish it. Publish only the approved staged version. Cancellation requires its own authorization.

The tooling uses short-lived publisher credentials. Do not add a long-lived key fallback. Read-only status, pending review, staged approval and publication are distinct outcomes.

Listing text, screenshots, privacy declarations and visibility are maintained in the store dashboard. Review them separately from the ZIP. Firefox signing and publication must be established before offering an installable Firefox release; a temporary development add-on is not a signed distribution.
