# Releasing solstone-browser

The extension has **no compile step**; it is plain MV3. A release produces two
reproducible packages from one runtime tree: a development package with a pinned
identity, and a distinct Chrome Web Store package without development-only
manifest fields. The two archives have names that cannot be confused.

## Pinned identity (why reload just works)

The source and development manifest carry a `key`, which fixes the extension id
to **`fgfnkcefedeheoeamppkiiloncfekakf`** regardless of where it is loaded from.
That means granted per-site permissions and the allowlist persist across
reloads, load-path changes, and version bumps. The Chrome Web Store package
omits `key` and `update_url`; the Store assigns and manages that channel's id.

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

Then click **reload** (↻) on the extension's card. Reload re-reads
`dist/current` and, thanks to the pinned id, keeps storage and permissions.

## What `make dist` does

Runs `make ci`, verifies the version agrees across the four files where it
lives, then writes into `dist/` (git-ignored, rebuilt any time):

- `dist/solstone-browser-<version>/` — the clean versioned folder
- `dist/solstone-browser-<version>-dev.zip` — the same development tree zipped,
  retaining the pinned identity
- `dist/solstone-browser-<version>-cws.zip` — the Chrome Web Store upload
  candidate, with a root MV3 manifest that omits `key` and `update_url`
- `dist/current` → the versioned folder (the stable Load-unpacked target above)

Both ZIPs are written in a stable file order with normalized archive metadata.
Before success is printed, the build reopens both archives and checks the root
manifest, required fields and documented name/description limits, every
manifest-referenced runtime file, the approved permission/injection surface,
the development id, and the Store-only field removal. `make package-check`
repeats that check against existing artifacts. The Chrome Web Store dashboard
remains the authoritative upload validator.

`make cws` is the supported Store-upload spelling of the same complete build:

```bash
make cws
```

Upload only the resulting `-cws.zip` to the Store dashboard. For releases after
the first item, the supported path is the keyless API flow below.

## Bump the version

The version lives in four files (`extension/manifest.json`, `package.json`,
`package-lock.json`, `extension/background.js`). Keep them in lockstep with:

```bash
make set-version V=0.1.1
```

It stamps all four files and verifies them; `make dist` refuses to build on
drift. Commit the bump, update `CHANGELOG.md`, then build from that exact commit.

## Cut a tagged release (like our other surfaces)

Release compatibility gate: before any Chrome Web Store release, verify that
browser delivery targets a home running **solstone 0.8.7+**. Older homes are
unsupported delivery targets for this release. This is a release-checklist
precondition, not a runtime or wire-protocol negotiation.

```bash
make set-version V=0.1.1        # choose the next immutable version
# edit CHANGELOG.md: add the 0.1.1 section with today's date
git add CHANGELOG.md extension/manifest.json extension/background.js package.json package-lock.json
git commit -m "release: v0.1.1"
make dist                       # build both artifacts for this exact tree
git push origin main
git tag v0.1.1
git push origin v0.1.1
gh release create v0.1.1 \
  dist/solstone-browser-0.1.1-dev.zip \
  dist/solstone-browser-0.1.1-cws.zip \
  --title "solstone-browser v0.1.1" \
  --notes-file <(sed -n '/^## 0.1.1/,/^## /p' CHANGELOG.md | sed '$d')
```

Both channel-specific ZIPs are release assets; `CHANGELOG.md` is the notes
source. Never replace an existing tag or asset. If packaging changes after a
release, cut the next patch version.

## Chrome Web Store release

The first item established Store id `eibbeeoifjoabddfmgeggnageolkcnim`. Normal
updates use Chrome Web Store API V2 through the publisher-linked
`chrome-web-store-publisher@extro-mail.iam.gserviceaccount.com` identity. Local
commands impersonate it from the operator's explicit `jer@solpbc.org` `gcloud`
login; GitHub Actions uses OIDC and Workload Identity Federation. Status uses
the read-only `https://www.googleapis.com/auth/chromewebstore.readonly` scope;
mutations use `https://www.googleapis.com/auth/chromewebstore`. There is no
OAuth client, refresh token, service-account key, or GitHub secret.

The local path is deliberately human-backed. When Google's reauthentication
policy expires the user credential, a human operator may run
`gcloud auth login jer@solpbc.org` interactively and retry. Autonomous sessions
must not ask for that as a repair or fall back to a long-lived key: use the
[public listing](https://chromewebstore.google.com/detail/solstone-browser/eibbeeoifjoabddfmgeggnageolkcnim)
for published-version checks, or dispatch the protected **Chrome Web Store**
workflow when private Store state is actually required. The workflow remains
founder-approved because the linked service account is publisher-wide even
though an individual status token is read-only.

Read current Store state:

```bash
make cws-status
```

Build, upload, and submit an immutable version for review:

```bash
make cws-stage CWS_CONFIRM=0.1.2
```

Submission uses `STAGED_PUBLISH`. Approval therefore leaves the release staged;
it does not go live. After founder approval, publish that exact staged version:

```bash
make cws-publish-staged CWS_CONFIRM=0.1.2
```

Cancel a pending review only with explicit founder direction:

```bash
make cws-cancel CWS_CONFIRM=0.1.2
```

The **Chrome Web Store** workflow exposes the same operations through a protected
`chrome-web-store` GitHub environment. For `stage-release`, dispatch it from
`main` with the immutable release tag and exact version. Every mutation requires
the exact version as a second confirmation. The tool revalidates the Store ZIP,
refuses versions already published or submitted, blocks a second active
submission, waits honestly for asynchronous uploads, blocks on Store warnings,
and reports `PENDING_REVIEW`, `STAGED`, and `PUBLISHED` as distinct outcomes.

API V2 does not edit listing copy, screenshots, privacy declarations,
distribution, or visibility. Those remain dashboard-only whenever they change.
If visibility changes in the dashboard, publish once manually with that
visibility before returning to the API path. A local package check is not a
claim that Google will accept the upload.

Keep `minimum_chrome_version` at 120 while `scripts/vendor-hpke.mjs` targets
`chrome120`; the API floor alone is 105 because `Element.checkVisibility` has no
semantically equivalent skim fallback. Do not lower either the vendor target or
manifest floor without lowering and revalidating the other.

## Future layers

- **Firefox AMO + a self-hosted signed update channel** — the only sub-store-
  latency hotfix route across browsers.
- **Cross-browser manifest build-abstraction** — one base manifest → per-browser
  variants; `make dist` grows a `BROWSER=` dimension.
