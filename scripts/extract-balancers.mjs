#!/usr/bin/env node
/**
 * Turns a community balancer book into the library behind the `balancer` primitive.
 *
 *   node scripts/extract-balancers.mjs [<url or file>]
 *
 * The source book is Belt Balancers by an anonymous author, posted to FactorioBin:
 * https://factoriobin.com/post/KafN8H7L — its "Yellow Belt balancer" chapter holds every
 * N→M for 1..8, built from nothing but belts, undergrounds and splitters. Because those are
 * the only three entities involved, one geometry serves every tier, so the red and blue
 * chapters are redundant and the tier is chosen when the balancer is placed.
 *
 * The book is a 1.1 blueprint: directions are on the old 8-point scale and positions are
 * entity centres. Both are normalised here, so the output is in this project's terms —
 * 16-point directions and top-left tile coordinates with the balancer's corner at (0, 0).
 */

import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { decodeBlueprint } from '../dist-node/core.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_SOURCE = 'https://cdn.factoriobin.com/perma/bp/k/a/KafN8H7L-c2nzud/fbin-KafN8H7L-0.txt'
const CHAPTER = 'Yellow Belt balancer'

/** Entity kinds, as small integers. The tier is applied when the balancer is placed. */
const BELT = 0
const UNDERGROUND = 1
const SPLITTER = 2

const KIND = {
  'transport-belt': BELT,
  'underground-belt': UNDERGROUND,
  splitter: SPLITTER,
}

/** Footprint facing north. Rotating east or west swaps the axes. */
const SIZE = { [BELT]: [1, 1], [UNDERGROUND]: [1, 1], [SPLITTER]: [2, 1] }

async function load(source) {
  if (source.startsWith('http')) {
    const response = await fetch(source)
    if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${source}`)
    return (await response.text()).trim()
  }
  return (await readFile(source, 'utf8')).trim()
}

function chapter(book, label) {
  for (const entry of book.blueprints ?? []) {
    if (entry.blueprint_book?.label === label) return entry.blueprint_book
  }
  throw new Error(`no chapter named "${label}" in the book`)
}

/** `2 to 3 (Wide)` → `2-3-wide`; `4 to 8` → `4-8`. */
function keyOf(label) {
  const match = /^(\d+)\s*to\s*(\d+)(?:\s*\((\w+)\))?$/i.exec(label.trim())
  if (!match) return null
  const [, from, to, variant] = match
  return variant ? `${from}-${to}-${variant.toLowerCase()}` : `${from}-${to}`
}

function convert(blueprint) {
  const placed = []

  for (const entity of blueprint.entities) {
    const kind = KIND[entity.name]
    if (kind === undefined) throw new Error(`unexpected entity "${entity.name}"`)

    // 1.1 counted directions in eights; 2.0 counts them in sixteenths.
    const direction = ((entity.direction ?? 0) * 2) % 16
    const [w, h] = SIZE[kind]
    const rotated = direction === 4 || direction === 12 ? [h, w] : [w, h]

    // Blueprints store the centre of the footprint; this project stores its top-left tile.
    placed.push({
      kind,
      x: entity.position.x - rotated[0] / 2,
      y: entity.position.y - rotated[1] / 2,
      direction,
      underground: kind === UNDERGROUND ? (entity.type === 'output' ? 1 : 0) : undefined,
      w: rotated[0],
      h: rotated[1],
    })
  }

  const left = Math.min(...placed.map((e) => e.x))
  const top = Math.min(...placed.map((e) => e.y))
  const right = Math.max(...placed.map((e) => e.x + e.w))
  const bottom = Math.max(...placed.map((e) => e.y + e.h))

  const entities = placed
    .map((e) => {
      const x = Math.round(e.x - left)
      const y = Math.round(e.y - top)
      if (!Number.isInteger(x) || !Number.isInteger(y)) throw new Error('non-integer tile position')
      const row = [e.kind, x, y, e.direction]
      if (e.underground !== undefined) row.push(e.underground)
      return row
    })
    // Sorted for a stable, reviewable diff when the book is re-extracted.
    .sort((a, b) => a[2] - b[2] || a[1] - b[1] || a[0] - b[0])

  return { w: Math.round(right - left), h: Math.round(bottom - top), e: entities }
}

const source = process.argv[2] ?? DEFAULT_SOURCE
const book = decodeBlueprint(await load(source)).blueprint_book
const yellow = chapter(book, CHAPTER)

const balancers = {}
const skipped = []

for (const entry of yellow.blueprints) {
  const blueprint = entry.blueprint
  if (!blueprint?.entities?.length) continue
  const key = keyOf(blueprint.label ?? '')
  if (!key) {
    skipped.push(blueprint.label)
    continue
  }
  balancers[key] = convert(blueprint)
}

// `2 to 3` ships as two shapes; the wider one is the default because it is the shallower.
if (balancers['2-3-wide'] && !balancers['2-3']) balancers['2-3'] = balancers['2-3-wide']

const output = {
  source: 'https://factoriobin.com/post/KafN8H7L — "Belt Balancers", chapter "' + CHAPTER + '"',
  note: 'Tier-agnostic: only belts, undergrounds and splitters. Directions are 16-point, positions are top-left tiles from (0, 0).',
  flow: 'north',
  balancers,
}

await writeFile(join(ROOT, 'src/data/balancers.json'), JSON.stringify(output) + '\n')

const keys = Object.keys(balancers).sort()
const total = keys.reduce((n, k) => n + balancers[k].e.length, 0)
console.log(`${keys.length} balancers, ${total} entities`)
console.log(`sizes: ${keys.slice(0, 6).map((k) => `${k} ${balancers[k].w}×${balancers[k].h}`).join(', ')} …`)
if (skipped.length) console.log(`skipped labels: ${skipped.join(', ')}`)
