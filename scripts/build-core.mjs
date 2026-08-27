#!/usr/bin/env node
// Bundles the language core (no DOM) so Node can run it — used by the tests and the CLI.
import { build } from 'esbuild'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

await build({
  entryPoints: [join(ROOT, 'src/core/index.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  outfile: join(ROOT, 'dist-node/core.mjs'),
  logLevel: 'warning',
})
