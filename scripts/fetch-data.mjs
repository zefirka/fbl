#!/usr/bin/env node
// Downloads game datasets (prototype data + icon spritesheets) into public/data/<id>/.
//
// Source: FactorioLab (https://factoriolab.github.io), which publishes a JSON dump per
// game version generated from the real Lua prototypes by the `factoriolab-export` mod.
// It gives us machine sizes, module slots, crafting speeds, belt throughput, recipes,
// qualities and a 66px icon spritesheet -- everything except the geometry of non-crafting
// entities (belts, inserters, poles), which lives in src/data/geometry.ts by hand.
//
// The game art is Wube Software's copyright. It is downloaded here for local use only and
// is deliberately kept out of git (see .gitignore).

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BASE = 'https://factoriolab.github.io/data'

/** Datasets we expose in the version switcher. `id` is FactorioLab's dataset id. */
const DATASETS = ['2x1', 'spa', '2.0', '1.1']

async function download(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`)
  return Buffer.from(await res.arrayBuffer())
}

for (const id of DATASETS) {
  const outDir = join(ROOT, 'public', 'data', id)
  await mkdir(outDir, { recursive: true })

  const data = await download(`${BASE}/${id}/data.json`)
  await writeFile(join(outDir, 'data.json'), data)

  const icons = await download(`${BASE}/${id}/icons.webp`)
  await writeFile(join(outDir, 'icons.webp'), icons)

  const parsed = JSON.parse(data.toString())
  const game = Object.values(parsed.version ?? {})[0] ?? '?'
  console.log(
    `${id.padEnd(5)} game ${String(game).padEnd(8)} ` +
      `${parsed.items.length} items, ${parsed.recipes.length} recipes, ` +
      `${(icons.length / 1024 / 1024).toFixed(1)}MB icons`,
  )
}
