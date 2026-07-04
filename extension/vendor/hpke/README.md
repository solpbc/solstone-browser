# Vendored HPKE

This directory vendors `@hpke/core@1.9.0` as a committed browser IIFE for the
classic MV3 service worker.

Regenerate from the repository root:

```bash
npm install --no-save @hpke/core@1.9.0
printf 'export { CipherSuite, DhkemP256HkdfSha256, HkdfSha256, Aes256Gcm } from "@hpke/core";\n' > hpke-vendor-entry.tmp.js
npx esbuild hpke-vendor-entry.tmp.js --bundle --format=iife --global-name=SolstoneHpke --target=chrome120 --outfile=extension/vendor/hpke/hpke-core-1.9.0.iife.js
rm hpke-vendor-entry.tmp.js
```

`esbuild` is a build-time-only tool for regenerating this artifact. The shipped
extension has no runtime dependency on npm packages and never loads HPKE code
from a CDN or third-party network location.

The committed bundle publishes `globalThis.SolstoneHpke` with exactly this import
surface:

- `CipherSuite`
- `DhkemP256HkdfSha256`
- `HkdfSha256`
- `Aes256Gcm`

The upstream package is MIT licensed; see `LICENSE`.
