# Extension string catalog

The extension owns its English source in `catalog/`. It ships only `en-US`.
The generated classic script contains the pinned Fluent runtime and every UI
message. Static manifest messages use the generated `_locales/en_US/messages.json`.
No script fetches a catalog or imports a module at runtime.

Regenerate with the catalog compiler from solstone-journal, at the revision
recorded in `compiler.json`:

```sh
I18N_COMPILER=/path/to/i18n-catalog node scripts/i18n.mjs
npm test
```

For source edits, follow the compiler's `tools/i18n/README.md` instructions for
source locks, sidecar revisions and permanent identities before regenerating.
`npm test` checks the source IDs, adapter table, generated cases, runtime IDs,
manifest references and committed file hashes. Build and test use committed
output and do not need the compiler or network access to render text.

Chrome and Edge load `i18n/catalog.js`, `i18n/contracts.js` and `i18n/index.js`
through the service worker's synchronous `importScripts`. Firefox lists the same
files first in `background.scripts`. Safari keeps that ordered script list in
its staged manifest. Popup and settings pages load the three files before their
existing UI scripts. The adapter inserts text with `textContent` or attributes
with `setAttribute`.

English rendering explicitly disables Fluent's interpolation isolation to keep
existing text and attributes byte-identical. The generated API defaults to
isolation enabled, including for future right-to-left languages. Adding a
language requires registry membership, a reviewed catalog and an explicit
adapter change; the browser's locale does not select an unshipped language.

Action IDs remain literals. Four portable-profile exceptions also retain their
existing English: `browser.copy.step3body`, `browser.copy.linuxupdate`,
`browser.copy.linuxintakeoff` and `browser.copy.linuxstep1intake`. The first has
independent device-menu and browser choices; the others interpolate commands
that cannot be marked as protected runtime arguments by the current profile.
