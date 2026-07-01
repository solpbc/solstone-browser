# solstone-browser Makefile
# Chrome (MV3) semantic browser observer for solstone.
#
# Zero runtime/build dependencies: the extension is plain MV3 (loaded unpacked)
# and the tests run on node's built-in test runner. `make install` therefore has
# nothing to fetch. The unit suite (`make test`) is the CI-able gate; the CDP
# skim smoke and the journal relay round-trip need a real Chrome and a live local
# journal respectively (see INSTALL.md / AGENTS.md), so they are not runnable
# headlessly and sit behind their own targets.

.PHONY: install test ci format clean smoke relay-check

# Nothing to install — MV3 loads unpacked; tests use node --test with no deps.
install:
	@echo "solstone-browser has no build or deps — load extension/ unpacked in Chrome; 'make test' runs the units."

# Pure-logic unit tests: diff/delta/JSONL, ARIA role->type, host slugging, adapters.
test:
	npm test

# Pre-commit / lode gate. No formatter or linter is wired yet (deliberate for a
# dependency-free prototype), so the unit suite is the gate. Add lint/format here
# when a toolchain is chosen.
ci: test

# No formatter configured yet.
format:
	@echo "no formatter configured yet — see the 'ci' note in the Makefile."

# Real-Chrome CDP skim smoke (needs a Chrome on this machine).
smoke:
	npm run smoke

# End-to-end register + ingest against a real local journal (run ON the journal machine).
relay-check:
	npm run relay-check

clean:
	rm -rf node_modules
	rm -f *.log
