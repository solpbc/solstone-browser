# solstone-browser Makefile
# Chrome (MV3) semantic browser observer for solstone.
#
# The shipped extension has zero runtime dependencies: it is plain MV3 and
# loads no npm or network code. `make test` remains dependency-free; `make ci`
# installs locked dev dependencies for real-IDB and vendor-reproducibility checks.
# The CDP skim smoke and the journal relay
# round-trip need a real Chrome and a live local journal respectively. The
# `e2e` target is the agentic integration harness — it drives the live
# content-script -> service-worker -> relay path under Playwright new-headless
# (dev-only dependency; the shipped extension stays dependency-free). See
# INSTALL.md / test/GUIDED.md / AGENTS.md.

.PHONY: install test test-idb verify-vendor-hpke ci format clean smoke relay-check popup-check e2e e2e-deps dist cws cws-status cws-stage cws-publish-staged cws-cancel package-check set-version

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

# Real-Chrome CDP skim smoke (needs a Chrome on this machine).
smoke:
	npm run smoke

# End-to-end register + ingest against a real local journal (run ON the journal machine).
relay-check:
	npm run relay-check

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

# Chrome Web Store API V2 operator commands. Local calls mint a short-lived
# service-account token through gcloud; CI uses GitHub OIDC/WIF. Mutations
# require CWS_CONFIRM to match the exact manifest version.
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
