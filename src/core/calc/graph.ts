import type { LabRecipe } from '../../data/dataset'
import type { ProtoRegistry } from '../proto'

/**
 * Which recipes the calculator is willing to use, and which of them makes what.
 *
 * The raw data is not a plan: 43 recipes produce an iron plate, and 41 of them are recycling
 * something back into one. Left in, every chain would rather melt a chest than smelt an ore.
 * So the index starts from what a factory actually builds, and everything else has to be
 * asked for by name.
 *
 * Nor is everything in the file something a factory can run. Space Age carries recipes for what
 * happens on its own — food spoiling, bacteria multiplying into ore in a crate — and those have
 * no machine at all. Left in, a plan asked for iron will find that growing it out of jellynut
 * costs nothing to build, and answer with six thousand biochambers.
 *
 * What is left still offers real choices — an iron plate is smelted or cast, petroleum comes
 * out of three different processes — and those are the ones worth putting in front of someone.
 */

/** Recipes that give an item back rather than making it, and research, which makes nothing. */
const IGNORED_FLAGS = new Set(['recycling', 'technology', 'burn'])

/** Filling and emptying barrels moves a fluid around; it does not produce one. */
const isBarrelling = (recipe: LabRecipe) =>
  [...Object.keys(recipe.in ?? {}), ...Object.keys(recipe.out ?? {})].some(
    (item) => item === 'barrel' || item.endsWith('-barrel'),
  )

export interface RecipeGraph {
  /** Every recipe the calculator will consider, by id. */
  usable: Map<string, LabRecipe>
  /**
   * Every way to get an item, best default first — digging it up included. A drill running a
   * mining recipe is a machine running a recipe like any other, and someone who wants to know
   * how many drills that is should be able to ask.
   */
  producers: Map<string, string[]>
  /** Recipes that take nothing and give something: a drill, a pump, a well. */
  extraction: Set<string>
  /** What those give. */
  extracted: Set<string>
  /** Items something makes out of something else — as against merely brings up. */
  crafted: Set<string>
  /**
   * What a unit of a raw item is worth, from the dataset's own reckoning: a hundred for
   * anything a drill brings up, one for crude oil, and next to nothing for what a pump takes
   * out of a lake. Lava is free and iron ore is not, which is the whole reason a foundry on
   * Vulcanus melts rock rather than ore.
   */
  price: Map<string, number>
  /**
   * What a plan may simply help itself to.
   *
   * Not everything the game can extract belongs here. Space Age has a well that produces heavy
   * oil, so on the data alone heavy oil is free — and a plan asked for petroleum would buy it
   * by the barrel instead of running a refinery, which is nonsense anywhere but Vulcanus. What
   * you can always help yourself to is what a drill or a tower brings up, and the water you
   * pump; anything else the game grants in one place is made here unless someone says
   * otherwise.
   */
  mapped: Set<string>
}

const graphs = new WeakMap<ProtoRegistry, RecipeGraph>()

export function recipeGraph(registry: ProtoRegistry): RecipeGraph {
  const cached = graphs.get(registry)
  if (cached) return cached

  const usable = new Map<string, LabRecipe>()
  const producers = new Map<string, string[]>()
  const extraction = new Set<string>()
  const extracted = new Set<string>()
  const mapped = new Set(ALWAYS_AVAILABLE)
  const dug = new Set<string>()
  /** Items something makes out of something else — as against merely brings up. */
  const crafted = new Set<string>()

  for (const recipe of registry.recipes.values()) {
    const flags = new Set(recipe.flags ?? [])
    if ([...flags].some((flag) => IGNORED_FLAGS.has(flag))) continue
    if (isBarrelling(recipe)) continue

    // Growing is extraction too: an agricultural tower harvests yumako the way a drill takes
    // ore out of the ground, and the seed comes back out of the fruit.
    const mined = flags.has('mining') || flags.has('plant')
    const fromNothing = Object.keys(recipe.in ?? {}).length === 0

    // Something has to run it. A recipe nothing can be built to run is a thing that happens,
    // not a thing you make.
    const runnable = (recipe.producers ?? []).some((name) => registry.machines.has(name))
    if (!runnable && !mined && !fromNothing) continue

    usable.set(recipe.id, recipe)
    if (mined || fromNothing) extraction.add(recipe.id)

    for (const item of Object.keys(recipe.out ?? {})) {
      if (mined) dug.add(item)
      if (mined || fromNothing) extracted.add(item)
      else crafted.add(item)

      const list = producers.get(item)
      if (list) list.push(recipe.id)
      else producers.set(item, [recipe.id])
    }
  }

  // A solid you dig is raw and that is the end of it. A fluid you dig is raw only where
  // nothing makes it: sulfuric acid comes out of a geyser on Vulcanus and out of a chemical
  // plant everywhere else, and everywhere else is where most plans live.
  for (const item of dug) {
    if (!registry.fluids.has(item) || !crafted.has(item)) mapped.add(item)
  }

  // What the dataset says a raw item is worth. Anything gathered that it says nothing about is
  // priced like an ore; anything a pump lifts out of a lake is as good as free.
  const price = new Map<string, number>()
  for (const id of extraction) {
    const recipe = usable.get(id)!
    const pumped = !(recipe.flags ?? []).includes('mining')
    for (const [item, amount] of Object.entries(recipe.out ?? {})) {
      const worth = recipe.cost !== undefined ? recipe.cost / amount : pumped ? PUMPED_PRICE : GATHERED_PRICE
      price.set(item, Math.min(price.get(item) ?? Infinity, worth))
    }
  }

  const frontier = (item: string) => mapped.has(item) || !crafted.has(item)
  for (const [item, list] of producers) {
    list.sort(byFitness(item, usable, extraction, mapped.has(item), frontier, price))
  }

  const graph: RecipeGraph = { usable, producers, extraction, extracted, crafted, mapped, price }
  graphs.set(registry, graph)
  return graph
}

/**
 * Which recipe to offer first for an item.
 *
 * For something the game gives you out of the ground, that is the drill: nobody asked to make
 * iron ore wants to hear about crushing asteroids first. For everything else it is the recipe
 * named after the item, and after that whichever yields the most of it per craft — which is
 * what tells a process apart from a way of tidying up after one: advanced oil processing makes
 * petroleum, and cracking light oil is what you do with what is left over.
 *
 * The two rules have to stay in that order and no other. Heavy oil comes out of a well on
 * Vulcanus and the recipe is even named after it, so both of the later rules would put the
 * well first — and every refinery in the plan would be replaced by one.
 */
function byFitness(
  item: string,
  usable: Map<string, LabRecipe>,
  extraction: Set<string>,
  dug: boolean,
  frontier: (item: string) => boolean,
  price: Map<string, number>,
) {
  /** What the raw materials of one unit of the item cost, where they are all raw. */
  const worth = (id: string): number => {
    const recipe = usable.get(id)
    const made = recipe?.out?.[item] ?? 0
    if (!recipe || made <= 0) return Infinity

    let total = 0
    for (const [input, amount] of Object.entries(recipe.in ?? {})) {
      total += (price.get(input) ?? GATHERED_PRICE) * amount
    }
    return total / made
  }

  /** Whether everything it takes can simply be had; if not, its cost cannot be reckoned. */
  const direct = (id: string) => Object.keys(usable.get(id)?.in ?? {}).every(frontier)

  return (a: string, b: string): number => {
    // Bringing it up comes first for what you dig, and last for everything else.
    const digs = (id: string) => (extraction.has(id) === dug ? 0 : 1)
    if (digs(a) !== digs(b)) return digs(a) - digs(b)

    if (a === item) return -1
    if (b === item) return 1

    // A recipe made straight out of raw materials can be priced, and one that is not cannot;
    // the priced ones go first, cheapest of them leading. This is what puts a foundry on lava
    // rather than on ore — a lake is free and an ore patch is a hundred a unit — and it keeps
    // cracking behind the refinery it is meant to be tidying up after.
    const raw = (id: string) => (direct(id) ? 0 : 1)
    if (raw(a) !== raw(b)) return raw(a) - raw(b)
    if (raw(a) === 0 && worth(a) !== worth(b)) return worth(a) - worth(b)

    const yieldOf = (id: string) => usable.get(id)?.out?.[item] ?? 0
    return yieldOf(b) - yieldOf(a) || a.localeCompare(b)
  }
}

/** Water is pumped and steam is boiled from it; no plan should have to justify either. */
const ALWAYS_AVAILABLE = ['water', 'steam']

/** A lake does not run out, so what comes out of it is as good as free — but not quite. */
const PUMPED_PRICE = 0.05
/** Anything gathered the dataset says nothing about is worth what an ore is worth. */
const GATHERED_PRICE = 100

/** What one unit of a raw item costs a plan. */
export function priceOf(graph: RecipeGraph, item: string): number {
  return graph.price.get(item) ?? GATHERED_PRICE
}

/** Recipes that consume an item — what a surplus of it could be turned into. */
export function consumersOf(graph: RecipeGraph, item: string): string[] {
  return [...graph.usable.values()]
    .filter((recipe) => (recipe.in ?? {})[item] !== undefined)
    .map((recipe) => recipe.id)
    .sort()
}

/**
 * Where a chain stops by default: what you can help yourself to, and what nothing turns out of
 * anything else. Bringing a thing up out of the ground does not count as making it — a plan
 * that needs lava is a plan that needs lava, not one that needs pumps — but the pumps are
 * there to be asked for, and asking is a click on the node.
 */
export function isFrontier(graph: RecipeGraph, item: string): boolean {
  return graph.mapped.has(item) || !graph.crafted.has(item)
}

/** The machines that can run a recipe, best last — the producer list is in tier order. */
export function machinesFor(registry: ProtoRegistry, recipe: LabRecipe): string[] {
  return (recipe.producers ?? []).filter((name) => registry.machines.has(name))
}

/**
 * The one to use when nobody has said otherwise: the fastest that can run it, and among
 * equals the later one, since the producer list runs in tier order.
 */
export function bestMachine(registry: ProtoRegistry, recipe: LabRecipe): string | undefined {
  const options = machinesFor(registry, recipe)
  let best: string | undefined
  let fastest = -Infinity
  for (const name of options) {
    const speed = registry.machines.get(name)?.speed ?? 0
    if (speed >= fastest) {
      fastest = speed
      best = name
    }
  }
  return best
}
