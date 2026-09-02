#!/usr/bin/env node
/**
 * Walks every craftable item in a dataset and asks the calculator to make one a second.
 *
 * Two questions, and they fail differently:
 *
 *   1. Did we drop a way of making it? The raw data says what a factory can build — every
 *      recipe that is not research, not recycling, not barrelling, and has a machine that can
 *      run it. Anything the graph cannot reach that the data says it should is a filter of
 *      ours that is too wide, which is exactly how cliff explosives went missing.
 *   2. Can a plan actually be solved for it? A recipe being present is not the same as a chain
 *      that terminates: a shortfall means the plan ran into something nothing can supply.
 *
 * The second kind is not automatically a bug. Space and Gleba have real dead ends — you cannot
 * make an asteroid chunk on the ground — so the run separates what it can explain from what it
 * cannot, and only the unexplained kind is worth being alarmed about.
 *
 *   node scripts/audit-recipes.mjs            # the default dataset
 *   node scripts/audit-recipes.mjs 1.1 spa    # named ones
 */
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { EMPTY_CONFIG, ProtoRegistry, recipeGraph, solve } from '../dist-node/core.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const PROFILES = {
  '2x1': { id: '2x1', label: 'Space Age 2.1', directionScale: 2, moduleFormat: 'items-array', supportsQuality: true },
  spa: { id: 'spa', label: 'Space Age 2.0', directionScale: 2, moduleFormat: 'items-array', supportsQuality: true },
  '2.0': { id: '2.0', label: 'Factorio 2.0', directionScale: 2, moduleFormat: 'items-array', supportsQuality: false },
  '1.1': { id: '1.1', label: 'Factorio 1.1', directionScale: 1, moduleFormat: 'items-map', supportsQuality: false },
}

/** What the raw data says a factory can build, before any opinion of ours. */
function craftable(data) {
  const machines = new Set(data.items.filter((item) => item.machine).map((item) => item.id))
  const items = new Map()

  for (const recipe of data.recipes) {
    const flags = new Set(recipe.flags ?? [])
    if (flags.has('technology') || flags.has('recycling') || flags.has('burn')) continue

    // Barrelling is a filled barrel on one side: filling makes one, emptying takes one apart.
    const touched = [...Object.keys(recipe.in ?? {}), ...Object.keys(recipe.out ?? {})]
    if (touched.some((item) => item.endsWith('-barrel'))) continue

    // Something has to be able to run it. Extraction recipes have drills and pumps.
    const mined = flags.has('mining') || flags.has('plant')
    const fromNothing = Object.keys(recipe.in ?? {}).length === 0
    if (!mined && !fromNothing && !(recipe.producers ?? []).some((name) => machines.has(name))) continue

    for (const item of Object.keys(recipe.out ?? {})) {
      if (!items.has(item)) items.set(item, [])
      items.get(item).push(recipe.id)
    }
  }
  return items
}

export async function audit(id) {
  const data = JSON.parse(await readFile(join(ROOT, 'public/data', id, 'data.json'), 'utf8'))
  const registry = new ProtoRegistry(data, PROFILES[id] ?? PROFILES['2x1'])
  const graph = recipeGraph(registry)
  const expected = craftable(data)

  const dropped = []
  const short = []
  const failed = []
  let solved = 0

  for (const [item, ways] of expected) {
    if (!graph.producers.has(item) && !graph.mapped.has(item)) {
      dropped.push({ item, ways })
      continue
    }

    const answer = solve(registry, { ...EMPTY_CONFIG, targets: [{ item, rate: 1 }] })
    if (answer.status !== 'optimal') {
      failed.push({ item, why: answer.status })
      continue
    }
    if (answer.shortfalls.length > 0) {
      short.push({ item, missing: answer.shortfalls.map((f) => f.item) })
      continue
    }
    solved++
  }

  return { id, label: PROFILES[id]?.label ?? id, count: expected.size, solved, dropped, short, failed }
}

/** A shortfall the world explains: nothing on the ground makes these, and that is the truth. */
export const UNREACHABLE = /asteroid|promethium|space-platform|^ice$/

/** What is left once the shortfalls the world explains are set aside. */
export const unexplained = (report) =>
  report.short.filter((entry) => !entry.missing.every((item) => UNREACHABLE.test(item)))

// Everything below is the command line; the test imports the two functions above instead.
if (process.argv[1]?.endsWith('audit-recipes.mjs')) await main()

async function main() {
for (const id of process.argv.slice(2).length ? process.argv.slice(2) : ['2x1']) {
  const report = await audit(id)
  const bad = report.dropped.length + report.failed.length
  const loose = unexplained(report)

  console.log(`\n── ${report.label} — ${report.count} craftable items`)
  console.log(`   ${report.solved} plan cleanly`)

  if (report.dropped.length) {
    console.log(`   ${report.dropped.length} DROPPED — the data says these are makeable and the graph disagrees:`)
    for (const entry of report.dropped) console.log(`      ${entry.item.padEnd(34)} ${entry.ways.join(', ')}`)
  }
  if (report.failed.length) {
    console.log(`   ${report.failed.length} FAILED to solve:`)
    for (const entry of report.failed) console.log(`      ${entry.item.padEnd(34)} ${entry.why}`)
  }
  if (loose.length) {
    console.log(`   ${loose.length} short of something the ground should supply:`)
    for (const entry of loose) console.log(`      ${entry.item.padEnd(34)} missing ${entry.missing.join(', ')}`)
  }

  const offGround = report.short.filter((entry) => entry.missing.every((item) => UNREACHABLE.test(item)))
  if (offGround.length) {
    console.log(`   ${offGround.length} need space, which is not a bug:`)
    for (const entry of offGround) console.log(`      ${entry.item.padEnd(34)} missing ${entry.missing.join(', ')}`)
  }
  if (!bad && !loose.length) console.log('   nothing missing')
}
}
