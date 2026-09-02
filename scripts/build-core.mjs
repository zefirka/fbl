#!/usr/bin/env node
// Bundles the parts that do not touch the DOM so Node can run them — the language core, and
// the diagram layout, which is arithmetic and worth testing on its own.
import { build } from 'esbuild'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

for (const [entry, out] of [
  ['src/core/index.ts', 'dist-node/core.mjs'],
  ['src/ui/sankey.ts', 'dist-node/sankey.mjs'],
]) {
  await build({
    entryPoints: [join(ROOT, entry)],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    outfile: join(ROOT, out),
    logLevel: 'warning',
  })
}
