# Releasing solstone-browser

The extension has **no compile step** — it's plain MV3, loaded unpacked. So a
"release" is a clean, versioned copy of `extension/`, produced reproducibly, with
a **pinned identity** so it installs/updates like a real surface. This is the flow
today; the store / signed-channel layers are noted at the end as future work.

## Pinned identity (why reload just works)

The manifest carries a `key`, which fixes the extension id to
**`fgfnkcefedeheoeamppkiiloncfekakf`** regardless of where it's loaded from. That
means your granted per-site permissions and allowlist **persist across reloads,
load-path changes, and version bumps** — you never re-grant sites just because you
rebuilt. (When we eventually publish to the Chrome Web Store, the store assigns
its own id; the `key` only governs self-distribution / dev.)

## The dev loop: Load unpacked once, then reload

```bash
make dist
```

Then, one time: Chrome → `chrome://extensions` → **Developer mode** on → **Load
unpacked** → choose **`dist/current`**.

`dist/current` is a symlink that `make dist` re-points at the version it just
built. After that, every change is just:

```bash
make dist          # rebuild + re-point dist/current
```

…then click **reload** (↻) on the extension's card. Reload re-reads `dist/current`
and, thanks to the pinned id, keeps your storage/permissions. That's the whole
loop.

## What `make dist` does

Runs the unit gate (`make ci`), verifies the version agrees across the three
places it lives, then writes into `dist/` (git-ignored, rebuilt any time):

- `dist/solstone-browser-<version>/` — the clean versioned folder
- `dist/solstone-browser-<version>.zip` — the same, zipped (`manifest.json` at the
  archive root; the Web-Store / GitHub-release artifact). Zips via `python3` so it
  works on the journal host where `zip` may be absent.
- `dist/current` → the versioned folder (the stable Load-unpacked target above)

## Bump the version

The version lives in three files (`extension/manifest.json`, `package.json`,
`extension/background.js`). Keep them in lockstep with:

```bash
make set-version V=0.0.9
```

It stamps all three and verifies; `make dist` refuses to build on drift. Commit
the bump, update `CHANGELOG.md`, then `make dist`.

## Cut a tagged release (like our other surfaces)

```bash
make set-version V=0.0.9        # if bumping
# edit CHANGELOG.md: add the 0.0.9 section
git add -A && git commit -m "release: v0.0.9 …"
git push origin main
make dist                       # build the artifact for this exact tree
git tag v0.0.9
git push origin v0.0.9
gh release create v0.0.9 dist/solstone-browser-0.0.9.zip \
  --title "solstone-browser v0.0.9" \
  --notes-file <(sed -n '/^## 0.0.9/,/^## /p' CHANGELOG.md | sed '$d')
```

The `.zip` is the downloadable artifact; `CHANGELOG.md` is the notes source.

## Future layers (not built — tracked in the browser-observer roadmap)

- **Chrome Web Store** — the `dist/*.zip` is the upload artifact; store listing +
  review is a separate, gated step (and re-keys the id to the store's).
- **Firefox AMO + a self-hosted signed update channel** — the only sub-store-
  latency hotfix route across browsers.
- **Cross-browser manifest build-abstraction** — one base manifest → per-browser
  variants; `make dist` grows a `BROWSER=` dimension.
