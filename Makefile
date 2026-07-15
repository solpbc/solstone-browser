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

.PHONY: install test test-idb verify-vendor-hpke ci format clean smoke relay-check e2e e2e-deps dist set-version

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

# One-time browser download for the agentic e2e harness (the extension-capable
# Chromium build Playwright's `channel:'chromium'` selects).
e2e-deps:
	npm install
	npx playwright install chromium

# Agentic integration harness: content script -> service worker -> relay, under
# Playwright new-headless (no display). Run `make e2e-deps` once first.
e2e:
	npm run e2e

# Build a clean, versioned, installable artifact into dist/ (gated on the unit
# suite). Produces dist/solstone-browser-<version>/ (Load unpacked this) and a
# matching .zip. See RELEASE.md.
dist: ci
	node scripts/build.mjs

# Stamp a new version across manifest.json, package.json, and background.js so
# they never drift. Usage: make set-version V=0.0.8
set-version:
	node scripts/set-version.mjs $(V)

clean:
	rm -rf node_modules dist
	rm -f *.log
