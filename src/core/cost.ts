import type { LabRecipe } from '../data/dataset'
import { ASSEMBLY_MACHINES } from '../data/entity-geometry'
import type { ProtoRegistry } from './proto'
import type { Scene } from './scene'

/**
 * What a blueprint costs, at three depths: the things you place, the materials they are made
 * of, and the resources behind those.
 *
 * Recipes are followed down until they reach a frontier. For `raw` that frontier is what the
 * game extracts: an item is raw when something mines it or makes it from nothing — which is
 * not the same as "has no recipe", since in Space Age `iron-ore` has a recipe of its own that
 * grows it from bacteria, and following that would price a belt in biochambers.
 *
 * `basic` stops one tier earlier, at the materials. A material is an item that is *processed*
 * rather than assembled — its recipe runs in a furnace, foundry, chemical plant, refinery or
 * the like — and that is made only out of raw resources and other materials. That second half
 * is what keeps a transport belt out: a foundry casts one, but from gears and plates, which
 * are neither raw nor material. So a bill of ore and lava becomes one of plates and steel.
 */

export interface CostEntry {
  item: string
  amount: number
}

export interface Cost {
  /** What you actually place: entities and the modules in them. */
  items: CostEntry[]
  /** Those, followed down to plates, steel, plastic and the other processed materials. */
  basic: CostEntry[]
  /** Those, followed all the way down to ore, coal, stone, water and oil. */
  raw: CostEntry[]
  /** Items nothing in the dataset produces, so their cost is unknown. */
  unresolved: string[]
}

/** Recipes that make an item out of something it already was, or out of research. */
const IGNORED_FLAGS = new Set(['recycling', 'technology', 'burn'])

interface RecipeIndex {
  producers: Map<string, LabRecipe[]>
  raw: Set<string>
  basic: Set<string>
}

const indexes = new WeakMap<ProtoRegistry, RecipeIndex>()

function indexOf(registry: ProtoRegistry): RecipeIndex {
  const cached = indexes.get(registry)
  if (cached) return cached

  const producers = new Map<string, LabRecipe[]>()
  const raw = new Set<string>()

  for (const recipe of registry.recipes.values()) {
    const flags = new Set(recipe.flags ?? [])
    // Growing is extraction too: an agricultural tower harvests yumako from the ground the
    // way a drill takes ore out of it, and the seed comes back out of the fruit.
    const mined = flags.has('mining') || flags.has('plant')
    if ([...flags].some((f) => IGNORED_FLAGS.has(f))) continue

    const madeFromNothing = Object.keys(recipe.in ?? {}).length === 0
    for (const item of Object.keys(recipe.out ?? {})) {
      if (mined || madeFromNothing) raw.add(item)
      const list = producers.get(item)
      if (list) list.push(recipe)
      else producers.set(item, [recipe])
    }
  }

  const index: RecipeIndex = { producers, raw, basic: new Set() }
  for (const item of producers.keys()) if (isBasic(item, index, new Set())) index.basic.add(item)

  indexes.set(registry, index)
  return index
}

/**
 * Whether an item is a material: processed by a machine that changes what it is, out of
 * nothing but raw resources and other materials.
 */
function isBasic(item: string, index: RecipeIndex, visiting: Set<string>): boolean {
  if (index.raw.has(item) || visiting.has(item)) return false
  if (index.basic.has(item)) return true

  const recipe = recipeFor(index, item)
  const producers = recipe?.producers ?? []
  if (!recipe || !producers.some((machine) => !ASSEMBLY_MACHINES.has(machine))) return false

  visiting.add(item)
  const material = Object.keys(recipe.in ?? {}).every(
    (ingredient) => index.raw.has(ingredient) || isBasic(ingredient, index, visiting),
  )
  visiting.delete(item)

  if (material) index.basic.add(item)
  return material
}

/** Of the recipes that make an item, the one named after it — otherwise the first. */
function recipeFor(index: RecipeIndex, item: string): LabRecipe | undefined {
  const options = index.producers.get(item)
  if (!options?.length) return undefined
  return options.find((recipe) => recipe.id === item) ?? options[0]
}

/**
 * What one unit of `item` comes down to once recipes are followed to `frontier`. Memoised,
 * because a blueprint asks for the same handful of items thousands of times.
 */
function breakdown(
  item: string,
  index: RecipeIndex,
  frontier: (item: string) => boolean,
  memo: Map<string, Map<string, number>>,
  visiting: Set<string>,
  unresolved: Set<string>,
): Map<string, number> {
  const done = memo.get(item)
  if (done) return done

  const single = new Map<string, number>()

  // At the frontier, unknown, or part of a loop: the trail stops here.
  if (frontier(item) || visiting.has(item)) {
    single.set(item, 1)
    memo.set(item, single)
    return single
  }

  const recipe = recipeFor(index, item)
  if (!recipe) {
    unresolved.add(item)
    single.set(item, 1)
    memo.set(item, single)
    return single
  }

  const produced = recipe.out?.[item] ?? 1
  visiting.add(item)

  for (const [ingredient, count] of Object.entries(recipe.in ?? {})) {
    const per = count / produced
    for (const [resource, amount] of breakdown(ingredient, index, frontier, memo, visiting, unresolved)) {
      single.set(resource, (single.get(resource) ?? 0) + amount * per)
    }
  }

  visiting.delete(item)
  memo.set(item, single)
  return single
}

const byAmount = (a: CostEntry, b: CostEntry) => b.amount - a.amount || a.item.localeCompare(b.item)

export function computeCost(scene: Scene, registry: ProtoRegistry): Cost {
  const bill = new Map<string, number>()
  const add = (item: string, count = 1) => bill.set(item, (bill.get(item) ?? 0) + count)

  for (const entity of scene.entities) {
    add(entity.proto.name)
    for (const module of entity.modules ?? []) add(module.name)
  }

  const index = indexOf(registry)
  const unresolved = new Set<string>()

  const total = (frontier: (item: string) => boolean): CostEntry[] => {
    const memo = new Map<string, Map<string, number>>()
    const sum = new Map<string, number>()
    for (const [item, count] of bill) {
      for (const [resource, amount] of breakdown(item, index, frontier, memo, new Set(), unresolved)) {
        sum.set(resource, (sum.get(resource) ?? 0) + amount * count)
      }
    }
    return [...sum].map(([item, amount]) => ({ item, amount })).sort(byAmount)
  }

  return {
    items: [...bill].map(([item, amount]) => ({ item, amount })).sort(byAmount),
    basic: total((item) => index.raw.has(item) || index.basic.has(item)),
    raw: total((item) => index.raw.has(item)),
    unresolved: [...unresolved].sort(),
  }
}
