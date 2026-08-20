# solstone-browser source setup

> **Status: parked.** There is no installable solstone-browser release. This source tree does not currently deliver material to any journal.

These instructions are for contributors working on the parked extension source.

## Build an unpacked extension

From a repository checkout, run:

```bash
make dist
```

Open `chrome://extensions`, enable **Developer mode**, select **Load unpacked**, and choose `dist/current`. Pin the extension if you need its development status indicator. After a later `make dist`, select **reload** on the extension card.

`dist/current` is a development build.

## Tests

```bash
npm test
make ci
```

## Related documentation

- [README.md](README.md): repository status and source-tree map
- [AGENTS.md](AGENTS.md): contributor guidance
- [RELEASE.md](RELEASE.md): release engineering reference
