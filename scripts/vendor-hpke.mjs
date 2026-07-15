// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (c) 2026 sol pbc

import { build } from "esbuild";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const ENTRY = 'export { CipherSuite, DhkemP256HkdfSha256, HkdfSha256, Aes256Gcm } from "@hpke/core";\n';
const HEADER = "// SPDX-License-Identifier: MIT\n// Copyright (c) 2023 Ajitomi Daisuke\n";

const outputArg = process.argv[2];
if (!outputArg) {
  console.error("usage: node scripts/vendor-hpke.mjs <output-path>");
  process.exit(2);
}

const output = resolve(process.cwd(), outputArg);
const temp = await mkdtemp(resolve(tmpdir(), "solstone-hpke-"));
try {
  const entry = resolve(temp, "hpke-vendor-entry.mjs");
  const bundle = resolve(temp, "hpke-core.iife.js");
  await writeFile(entry, ENTRY);
  await build({
    stdin: {
      contents: await readFile(entry, "utf8"),
      resolveDir: ROOT,
      sourcefile: "hpke-vendor-entry.tmp.js",
      loader: "js",
    },
    bundle: true,
    format: "iife",
    globalName: "SolstoneHpke",
    target: "chrome120",
    outfile: bundle,
    absWorkingDir: ROOT,
    logLevel: "silent",
  });
  await writeFile(output, HEADER + await readFile(bundle, "utf8"));
} finally {
  await rm(temp, { recursive: true, force: true });
}
