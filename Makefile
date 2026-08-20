# solstone-browser Makefile
# Chrome (MV3) semantic browser observer for solstone.
#
# The shipped extension has zero runtime dependencies: it is plain MV3 and
# loads no npm or network code. `make test` remains dependency-free; `make ci`
# installs locked dev dependencies for real-IDB and vendor-reproducibility checks.
# The CDP skim smoke needs a real Chrome. The
# `e2e` target is the agentic integration harness — it drives the live
# content-script -> service-worker -> relay path under Playwright new-headless
# (dev-only dependency; the shipped extension stays dependency-free). See
# INSTALL.md / test/GUIDED.md / AGENTS.md.

.PHONY: install test test-idb verify-vendor-hpke ci format brand-sync clean smoke popup-check e2e e2e-deps dist cws cws-status cws-stage cws-publish-staged cws-cancel package-check set-version

# Install locked development tools. Nothing from node_modules ships in extension/.
install:
	npm ci

# Pure-logic unit tests: diff/delta/JSONL, ARIA role->type, host slugging, adapters.
test:
	npm test

test-idb:
	npm run test:idb

verify-vendor-hpke:
	node scripts/verify-vendor-hpke.mjs

# Ordered pre-commit / lode gate: locked install, pure units, real IDB, then
# deterministic vendored-HPKE verification. No formatter or linter is wired yet.
ci:
	npm ci
	npm test
	npm run test:idb
	node scripts/verify-vendor-hpke.mjs

# No formatter configured yet.
format:
	@echo "no formatter configured yet — see the 'ci' note in the Makefile."

# Re-vendor brand assets from the canonical brand source. CI verifies the
# committed output (it does not run brand-sync) — run this locally when the
# brand spec updates, then commit the diff.
#
# Requires rsvg-convert (librsvg) for the toolbar icon ladder, which has no
# committed raster in the brand source and is rendered from the vendored state
# SVGs at each declared size.
#   apt: librsvg2-bin   brew: librsvg
BRAND_SVGS = sol-ring sol-ring-paused sol-ring-icon sol-ring-icon-error sol-ring-icon-half sol-ring-icon-paused
BRAND_ICON_SIZES = 16 48 128

brand-sync:
	@test -n "$(BRAND_DIR)" || { echo "brand: BRAND_DIR is required — point it at your brand asset directory (BRAND_DIR=/path/to/brand make brand-sync)"; exit 1; }
	@test -d "$(BRAND_DIR)" || { echo "brand: BRAND_DIR=$(BRAND_DIR) not found"; exit 1; }
	@command -v rsvg-convert >/dev/null 2>&1 || { echo "brand: rsvg-convert (librsvg) not found — apt install librsvg2-bin, or brew install librsvg"; exit 1; }
	@set -e; for f in $(BRAND_SVGS); do cp "$(BRAND_DIR)/$$f.svg" "extension/brand/$$f.svg"; done
	@# Toolbar icon ladder — rendered from the vendored state SVGs at every size
	@# the manifest and chrome.action.setIcon declare, each straight from the
	@# vector (never downsampled from one raster). Prefixes match lib/status.js.
	@set -e; for size in $(BRAND_ICON_SIZES); do \
	  rsvg-convert -w $$size -h $$size extension/brand/sol-ring-icon.svg        -o extension/icons/icon$$size.png; \
	  rsvg-convert -w $$size -h $$size extension/brand/sol-ring-icon-half.svg   -o extension/icons/icon-half-$$size.png; \
	  rsvg-convert -w $$size -h $$size extension/brand/sol-ring-icon-paused.svg -o extension/icons/icon-paused-$$size.png; \
	  rsvg-convert -w $$size -h $$size extension/brand/sol-ring-icon-error.svg  -o extension/icons/icon-error-$$size.png; \
	done
	@echo "brand: synced from $(BRAND_DIR)"

# Real-Chrome CDP skim smoke (needs a Chrome on this machine).
smoke:
	npm run smoke

# Popup content-height gate. The Playwright Chromium binary is not installed by
# make ci; run make e2e-deps once before using this target.
popup-check:
	npm run popup-check

# One-time browser download for the agentic e2e harness (the extension-capable
# Chromium build Playwright's `channel:'chromium'` selects).
e2e-deps:
	npm install
	npx playwright install chromium

# Agentic integration harness: content script -> service worker -> relay, under
# Playwright new-headless (no display). Run `make e2e-deps` once first.
e2e:
	npm run e2e

# Build a clean, versioned, installable artifact into dist/ (gated on make ci).
# Produces the Load-unpacked directory plus unmistakable -dev.zip and -cws.zip
# release assets, then reopens and validates both archives. See RELEASE.md.
dist: ci
	node scripts/build.mjs

# Store-specific spelling for operators preparing a dashboard upload. This runs
# the same full gate as make dist; only the resulting -cws.zip is Store-ready.
cws: dist

# Chrome Web Store API V2 operator commands. Local calls use jer's interactive
# gcloud identity to impersonate the publisher service account; there is no
# unattended key fallback. CI uses GitHub OIDC/WIF. Status tokens are read-only;
# mutations require CWS_CONFIRM to match the exact manifest version.
cws-status:
	node scripts/cws.mjs status

cws-stage: dist
	node scripts/cws.mjs stage --confirm-version $(CWS_CONFIRM)

cws-publish-staged:
	node scripts/cws.mjs publish-staged --confirm-version $(CWS_CONFIRM)

cws-cancel:
	node scripts/cws.mjs cancel --confirm-version $(CWS_CONFIRM)

# Reopen already-built release ZIPs and verify their package-level contracts.
package-check:
	node scripts/verify-package.mjs

# Stamp a new version across manifest.json, package.json, package-lock.json, and
# background.js so they never drift. Usage: make set-version V=0.0.8
set-version:
	node scripts/set-version.mjs $(V)

clean:
	rm -rf node_modules dist
	rm -f *.log
