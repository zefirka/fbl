import type { LabRecipe } from '../data/dataset'
import type { ProtoRegistry } from './proto'
import type { Scene } from './scene'

/**
 * What a blueprint costs, in items you place and in the raw resources behind them.
 *
 * Recipes are followed down until they bottom out. An item is raw when something mines it or
 * makes it from nothing — which is not the same as "has no recipe": in Space Age `iron-ore`
 * has a recipe of its own that grows it from bacteria, and following that would price a belt
 * in biochambers.
 */

export interface CostEntry {
  item: string
  amount: number
}

export interface Cost {
  /** What you actually place: entities and the modules in them. */
  items: CostEntry[]
  /** Those, followed down to ore, coal, stone, water and oil. */
  raw: CostEntry[]
  /** Items nothing in the dataset produces, so their cost is unknown. */
  unresolved: string[]
}

/** Recipes that make an item out of something it already was, or out of research. */
const IGNORED_FLAGS = new Set(['recycling', 'technology', 'burn'])

interface RecipeIndex {
  producers: Map<string, LabRecipe[]>
  raw: Set<string>
}

const indexes = new WeakMap<ProtoRegistry, RecipeIndex>()

function indexOf(registry: ProtoRegistry): RecipeIndex {
  const cached = indexes.get(registry)
  if (cached) return cached

  const producers = new Map<string, LabRecipe[]>()
  const raw = new Set<string>()

  for (const recipe of registry.recipes.values()) {
    const flags = new Set(recipe.flags ?? [])
    const mined = flags.has('mining')
    if ([...flags].some((f) => IGNORED_FLAGS.has(f))) continue

    const madeFromNothing = Object.keys(recipe.in ?? {}).length === 0
    for (const item of Object.keys(recipe.out ?? {})) {
      if (mined || madeFromNothing) raw.add(item)
      const list = producers.get(item)
      if (list) list.push(recipe)
      else producers.set(item, [recipe])
    }
  }

  const index = { producers, raw }
  indexes.set(registry, index)
  return index
}

/** Of the recipes that make an item, the one named after it — otherwise the first. */
function recipeFor(index: RecipeIndex, item: string): LabRecipe | undefined {
  const options = index.producers.get(item)
  if (!options?.length) return undefined
  return options.find((recipe) => recipe.id === item) ?? options[0]
}

/**
 * Raw resources behind one unit of `item`. Memoised, because a blueprint asks for the same
 * handful of items thousands of times.
 */
function rawOf(
  item: string,
  index: RecipeIndex,
  memo: Map<string, Map<string, number>>,
  visiting: Set<string>,
  unresolved: Set<string>,
): Map<string, number> {
  const done = memo.get(item)
  if (done) return done

  const single = new Map<string, number>()

  // Raw, unknown, or part of a loop: the trail stops here.
  if (index.raw.has(item) || visiting.has(item)) {
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
    for (const [resource, amount] of rawOf(ingredient, index, memo, visiting, unresolved)) {
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
  const memo = new Map<string, Map<string, number>>()
  const unresolved = new Set<string>()
  const raw = new Map<string, number>()

  for (const [item, count] of bill) {
    for (const [resource, amount] of rawOf(item, index, memo, new Set(), unresolved)) {
      raw.set(resource, (raw.get(resource) ?? 0) + amount * count)
    }
  }

  return {
    items: [...bill].map(([item, amount]) => ({ item, amount })).sort(byAmount),
    raw: [...raw].map(([item, amount]) => ({ item, amount })).sort(byAmount),
    unresolved: [...unresolved].sort(),
  }
}
