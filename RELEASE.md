# Releasing solstone-browser

The extension has **no compile step** — it's plain MV3, loaded unpacked. So a
"release" is a clean, versioned copy of `extension/` (nothing else), produced
reproducibly and installable as-is. This is the start of the release flow; the
store/signed-channel layers are noted at the bottom as future work.

## Build a versioned artifact

```bash
make dist
```

That runs the unit gate (`make ci`), verifies the version agrees across the three
places it lives, and writes:

- `dist/solstone-browser-<version>/` — the clean folder you **Load unpacked**
- `dist/solstone-browser-<version>.zip` — the same, zipped (Web-Store / release
  artifact; `manifest.json` at the archive root)

`dist/` is git-ignored — it's a build output, rebuilt from source any time.

## Install it (Load unpacked)

1. Chrome → `chrome://extensions` → **Developer mode** on.
2. **Load unpacked** → choose `dist/solstone-browser-<version>/`.
3. The ☼ sol mark appears. Then follow [test/GUIDED.md](test/GUIDED.md) to opt in
   a site and watch it reach your journal.

Loading the built `dist/` folder (rather than the working-tree `extension/`)
means you're running exactly the versioned artifact, with no dev/test files
alongside.

## Bump the version

The version lives in three files (`extension/manifest.json`, `package.json`,
`extension/background.js`). Keep them in lockstep with:

```bash
make set-version V=0.0.8
```

It stamps all three and verifies. `make dist` refuses to build if they ever drift
(it prints the mismatch and tells you to run `set-version`). Commit the bump, then
`make dist`.

## Cut a tagged release (optional, when distributing)

Once the org wants a downloadable, citeable build:

```bash
make dist
git tag v$(node -p "require('./package.json').version")
git push origin --tags
gh release create v<version> dist/solstone-browser-<version>.zip \
  --title "solstone-browser v<version>" --notes "…"
```

No tags exist yet — the first tagged release is a deliberate step, not automatic.

## Future layers (not built — tracked in the browser-observer roadmap)

- **Chrome Web Store** — the `dist/*.zip` is the upload artifact; store listing +
  review is a separate, gated step.
- **Firefox AMO + a self-hosted signed update channel** — the only sub-store-
  latency hotfix route across browsers.
- **Cross-browser manifest build-abstraction** — one base manifest → per-browser
  variants. When that lands, `make dist` grows a `BROWSER=` dimension.

These are deliberately out of scope for the prototype dogfood; today's flow is
"build a clean versioned unpacked artifact you install yourself."
