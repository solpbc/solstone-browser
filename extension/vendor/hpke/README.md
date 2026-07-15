# Vendored HPKE

This directory vendors `@hpke/core@1.9.0` as a committed browser IIFE for the
classic MV3 service worker.

Install the locked development dependencies, then regenerate from the repository
root:

```bash
npm ci
node scripts/vendor-hpke.mjs extension/vendor/hpke/hpke-core-1.9.0.iife.js
node scripts/verify-vendor-hpke.mjs
```

The generator uses the exact versions in `package.json` and `package-lock.json`.
The authoritative committed digest is in `SHA256SUMS`. `esbuild` is a
build-time-only tool; the shipped extension has no runtime dependency on npm
packages and never loads HPKE code from a CDN or third-party network location.

The committed bundle publishes `globalThis.SolstoneHpke` with exactly this import
surface:

- `CipherSuite`
- `DhkemP256HkdfSha256`
- `HkdfSha256`
- `Aes256Gcm`

The upstream package is MIT licensed; see `LICENSE`.
