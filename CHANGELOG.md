# Changelog — solstone-browser

Notable changes to the extension. The version is `manifest.json`'s `version`;
`make set-version` keeps `manifest.json` / `package.json` / `background.js` in
lockstep, and `make dist` refuses to build if they drift.

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
  incl. the dynamic-registration + clean-load assertions) and
  [test/GUIDED.md](test/GUIDED.md) (real-Chrome walkthrough).

## 0.0.7 — 2026-06-30 (prototype, dogfooded)

First live Gmail → `<host>.browser` observation. Per-tab/context keying;
persisted-storage schema-migration guard; idle-skip (no segment when nothing
changed); official sol branding + icon-as-status; port-safe content-script
registration with self-gating; content-hash key fallback (fixes Gmail
volatile-id delta churn); invisible-text normalization.

Earlier 0.0.1–0.0.6 prototype iteration is in the git history.
