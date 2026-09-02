import type { LabRecipe } from '../../data/dataset'
import type { ProtoRegistry } from '../proto'
import type { ModuleSpec } from '../scene'
import { moduleEffects, throughputOf, type Effects } from './machine'

/**
 * Farming quality: how many legendaries an hour a loop of assemblers and recyclers gives you.
 *
 * The mechanic is a ladder. A machine with quality modules has a chance `Q` of turning out
 * something better than what it was fed; anything that comes out below what you wanted goes to
 * a recycler, which hands back a quarter of what it took *at that item's quality*, and that
 * feeds the rung it came from, which rolls again. Every rung leaks three quarters of what
 * enters it and passes a trickle upwards, and the trickle is where legendaries come from.
 *
 * That is worth saying plainly, because the odds look nothing like what people expect. The roll
 * goes up one tier nine times in ten, two tiers one time in ten of those, and so on — so with
 * five legendary quality modules in an electromagnetic plant, `Q` is 31%, and the chance of a
 * legendary *straight out of the machine* is three in ten thousand. Practically every legendary
 * comes back up the ladder rather than falling out of the first roll.
 *
 * What a recycler hands back is read from the game's own recycling recipe and never worked out
 * from the crafting one, because the two are not mirrors of each other:
 *
 * - **No recycler ever gives back a fluid.** Shred a processing unit and the twenty circuits
 *   come back as five; the five sulfuric acid are simply gone. So the acid is not part of what
 *   goes round — every rung buys its own, fresh, for every craft it runs.
 * - **Some things do not come apart at all.** A plate, a science pack, anything smelted or made
 *   out of a fluid gives back a quarter of *itself*. That is still a ladder — it just climbs
 *   through the recyclers rather than through the assemblers, and only the bottom rung crafts.
 * - **Some recipes are not what the recycler reverses.** Cast a pipe out of molten iron and
 *   shredding it hands you iron plates, which no foundry will take. There is no loop there, and
 *   saying so is better than quietly pretending the plates are molten iron.
 *
 * Every rung is described on its own. Nobody has to fill all five in — a rung nobody has said
 * anything about runs the best machine that can do the job with nothing in it — but the ones
 * that matter can differ, and they do: the bottom rung is a factory and the top one is a single
 * machine ticking over, and putting legendary modules in both is not what anybody builds.
 *
 * Everything here is counted in two units and it is worth keeping them apart: a **set** is one
 * craft's worth of ingredients, and an **item** is one of the things that come out. A recipe
 * that makes two of something per craft turns one set into two items, and recycling one of them
 * gives back an eighth of a set rather than a quarter — which the data says outright, so it is
 * read from there rather than assumed.
 */

/** After a successful roll the tier goes up again one time in ten, and again, and again. */
const AGAIN = 0.1

export interface QualitySide {
  /** The machine, for the assembler; the recycler has only one. */
  machine?: string
  /** What the machine itself was built to. */
  quality?: string
  modules?: ModuleSpec[]
}

export interface QualitySetup {
  recipe: string
  /** Which of the recipe's products is being farmed, when it makes more than one. */
  item?: string
  /** The quality the ingredients arrive at. */
  base: string
  /** The quality you are farming for; anything at or above it is kept. */
  target: string
  /** The assembler on each rung, by quality. A rung left out runs the best machine, empty. */
  crafters: Record<string, QualitySide>
  /** The recycler on each rung, likewise. */
  recyclers: Record<string, QualitySide>
}

/** What drives the answer: a factory you have, or an output you want. */
export type QualityDrive = { machines: number } | { output: number }

/** Where what a recycler hands back goes: to the assembler, back to the recycler, or nowhere. */
export type QualityLoop = 'ingredients' | 'item' | 'none'

export interface Recycling {
  recipe: LabRecipe
  /** What one shredded item gives back, item by item. Never a fluid — the game returns none. */
  gives: Map<string, number>
  loop: QualityLoop
  /** Per item shredded: ingredient sets for an ingredient loop, items for an item loop. */
  recovery: number
  /** The recipe's ingredients that come back round. */
  recovers: string[]
  /** The ones that never do, and so are bought fresh for every craft on every rung. */
  fresh: string[]
}

export interface QualityTier {
  quality: string
  /** The machine this rung runs, and how good it is at turning out something better. */
  machine?: string
  chance: number
  recyclerQuality?: string
  recycleChance: number
  /** Ingredient sets the assembler at this tier gets through, a second. */
  crafts: number
  /** Items arriving at this tier, a second. */
  items: number
  /** Of those, what is kept — this tier is at or above the target. */
  kept: number
  /** Of those, what goes back to the recycler. */
  recycled: number
  crafters: number
  recyclers: number
}

export interface QualityPlan {
  tiers: QualityTier[]
  /** From the assembler at tier k, items a second landing at tier j: `crafted[k][j]`. */
  crafted: number[][]
  /** From the recycler at tier i, landing at tier k: `returned[i][k]`. In whatever `loop` says. */
  returned: number[][]
  /** What goes round: ingredient sets back to the assemblers, or the item back to a recycler. */
  loop: QualityLoop
  /** The ingredients that come back round, and the ones bought fresh for every craft. */
  recovers: string[]
  fresh: string[]
  /** What a recycler hands back for one of these, for saying so when it closes no loop. */
  gives: string[]
  /** Items a second at the target quality or better. */
  output: number
  /** Ingredient sets a second fed in fresh at the base tier. */
  input: number
  /** What the whole ladder buys, item by item, a second — the loop's leaks included. */
  ingredients: Map<string, number>
  /** Items out per set in — the whole ladder in one number. */
  yield: number
  /** The chance the bottom rung has of turning out something better, for the headline. */
  craftChance: number
  recycleChance: number
  /** Whether anything anywhere can turn out something better. */
  climbs: boolean
  /** Why it cannot be worked out, when it cannot. */
  problem?: 'no-recipe' | 'no-recycling' | 'no-loop' | 'no-machine'
}

/** Where a roll from `from` lands, as a probability per tier. */
export function spread(chance: number, from: number, tiers: number): number[] {
  const landing = new Array(tiers).fill(0)

  // From the top there is nothing to roll for: the chance has nowhere to send anything, so it
  // is not a chance at all. Subtracting it anyway loses most of what came in.
  if (from >= tiers - 1) {
    landing[tiers - 1] = 1
    return landing
  }

  landing[from] = 1 - chance

  let left = chance
  for (let tier = from + 1; tier < tiers; tier++) {
    // The top tier has nowhere further to send anything, so it takes the whole tail.
    if (tier === tiers - 1) {
      landing[tier] = left
      return landing
    }
    const here = left * (1 - AGAIN)
    landing[tier] = here
    left -= here
  }
  return landing
}

/** The best machine that can run the recipe, for a rung nobody has said anything about. */
function bestFor(registry: ProtoRegistry, recipe: LabRecipe): string | undefined {
  let best: string | undefined
  let fastest = -Infinity
  for (const name of recipe.producers ?? []) {
    const speed = registry.machines.get(name)?.speed
    if (speed !== undefined && speed >= fastest) {
      fastest = speed
      best = name
    }
  }
  return best
}

const chanceOf = (modules: readonly ModuleSpec[], registry: ProtoRegistry): number => {
  let chance = 0
  for (const module of modules) {
    const spec = registry.moduleEffects.get(module.name)
    if (!spec) continue
    const quality = module.quality && module.quality !== 'normal' ? spec.qualityRecord?.[module.quality] : undefined
    chance += (quality ?? spec).quality ?? 0
  }
  return Math.max(0, chance)
}

/** What a recycler gives back for one item made by this recipe, and what that closes. */
export function recyclingOf(
  registry: ProtoRegistry,
  recipe: LabRecipe,
  item: string,
): Recycling | undefined {
  const back = registry.recipes.get(`${item}-recycling`)
  if (!back) return undefined

  const gives = new Map(Object.entries(back.out ?? {}))
  const takes = recipe.in ?? {}
  const ingredients = Object.keys(takes)

  // A quarter of it comes back as itself. That is what the game does with everything a recycler
  // cannot take apart, and it is still a ladder — one that climbs through the recyclers.
  const itself = gives.get(item)
  if (itself !== undefined && gives.size === 1) {
    return { recipe: back, gives, loop: 'item', recovery: itself, recovers: [], fresh: ingredients }
  }

  // Everything that comes back has to be something this recipe eats. Cast a pipe from molten
  // iron and shredding it hands back iron plates: half of what returns is not an ingredient,
  // and a ladder built on that would be feeding the foundry something it cannot take.
  const closes = [...gives.keys()].every((name) => takes[name] !== undefined)
  if (!closes || gives.size === 0) {
    return { recipe: back, gives, loop: 'none', recovery: 0, recovers: [], fresh: ingredients }
  }

  // A quarter of the ingredients per item, which for a recipe that makes two at a time is an
  // eighth of a set. The data says so outright; the ratio is read rather than assumed.
  const recovers = [...gives.keys()]
  const recovery = Math.min(...recovers.map((name) => gives.get(name)! / takes[name]))

  return {
    recipe: back,
    gives,
    loop: 'ingredients',
    recovery,
    recovers,
    // What no recycler gives back is bought again for every craft. In the game's data that is
    // always the fluids — the acid in a processing unit, the lubricant in an express belt.
    fresh: ingredients.filter((name) => !gives.has(name)),
  }
}

/**
 * Of the recipes that make an item, the one a recycler reverses — or nothing, when the choice
 * does not matter and whoever asked has better reasons of their own.
 *
 * It matters which one the ladder is built on. Nutrients have five recipes and shredding them
 * hands back spoilage, so only the one made *from* spoilage feeds itself; a gear cast from
 * molten iron comes back as plates. Where the item comes back as itself, though, every recipe
 * closes the loop equally and there is nothing here to go on: iron ore is dug, grown out of
 * bacteria and crushed out of asteroids, and which of those to build is not a question about
 * recycling.
 */
export function loopRecipeFor(registry: ProtoRegistry, item: string): string | undefined {
  const back = registry.recipes.get(`${item}-recycling`)
  if (!back) return undefined

  const gives = Object.keys(back.out ?? {})
  const makes = [...registry.recipes.values()].filter(
    (recipe) => (recipe.out ?? {})[item] !== undefined && !(recipe.flags ?? []).includes('recycling'),
  )

  // Something has to be able to run it: iron ore has a recipe of its own that grows it out of
  // bacteria and no machine listed against it, and `iron-ore-mining` is the one with drills.
  // After that, named after what it makes wins, the way it does everywhere else here.
  const runnable = (recipe: LabRecipe) =>
    Number((recipe.producers ?? []).some((machine) => registry.machines.has(machine)))
  const ordered = makes.sort(
    (a, b) => runnable(b) - runnable(a) || Number(b.id === item) - Number(a.id === item),
  )

  if (gives.length === 1 && gives[0] === item) return undefined
  return ordered.find((recipe) => gives.every((name) => (recipe.in ?? {})[name] !== undefined))?.id
}

export function planQuality(
  registry: ProtoRegistry,
  setup: QualitySetup,
  drive: QualityDrive,
): QualityPlan {
  const tiers = registry.qualities.length ? registry.qualities : ['normal']
  const empty = (problem: QualityPlan['problem'], gives: string[] = []): QualityPlan => ({
    tiers: [],
    crafted: [],
    returned: [],
    loop: 'none',
    recovers: [],
    fresh: [],
    gives,
    output: 0,
    input: 0,
    ingredients: new Map(),
    yield: 0,
    craftChance: 0,
    recycleChance: 0,
    climbs: false,
    problem,
  })

  const recipe = registry.recipes.get(setup.recipe)
  if (!recipe) return empty('no-recipe')

  const products = Object.keys(recipe.out ?? {})
  // A recipe with a byproduct makes two things and only one of them is being farmed; which one
  // is the setup's business, not the order the data happens to list them in.
  const item = setup.item && products.includes(setup.item) ? setup.item : products[0]
  const perSet = (recipe.out ?? {})[item] ?? 1

  const recycling = recyclingOf(registry, recipe, item)
  if (!recycling) return empty('no-recycling')
  if (recycling.loop === 'none') return empty('no-loop', [...recycling.gives.keys()])

  const itemLoop = recycling.loop === 'item'
  const perShred = Object.values(recycling.recipe.in ?? {})[0] || 1

  const base = Math.max(0, tiers.indexOf(setup.base))
  const target = Math.max(base, tiers.indexOf(setup.target))

  const fallback = bestFor(registry, recipe)
  const crafters = tiers.map((tier) => setup.crafters[tier] ?? {})
  const recyclers = tiers.map((tier) => setup.recyclers[tier] ?? {})

  const craftEach = crafters.map((side) =>
    throughputOf(registry, side.machine ?? fallback ?? '', recipe, moduleEffects(side.modules ?? [], registry) as Effects, side.quality),
  )
  const recycleEach = recyclers.map((side) =>
    throughputOf(registry, 'recycler', recycling.recipe, moduleEffects(side.modules ?? [], registry) as Effects, side.quality),
  )
  if (!craftEach[base] || !recycleEach[base]) return empty('no-machine')

  const craftChances = crafters.map((side) => chanceOf(side.modules ?? [], registry))
  const recycleChances = recyclers.map((side) => chanceOf(side.modules ?? [], registry))
  const craftChance = craftChances[base]
  const recycleChance = recycleChances[base]

  // Nothing upgrades anything yet. That is not a failure to report and refuse to draw: the
  // machines are settled on the cards, so refusing to draw them leaves nowhere to put a module.
  // The ladder is worked out either way and simply has nothing climbing it.
  const climbs = craftChances.some((chance) => chance > 0) || recycleChances.some((chance) => chance > 0)

  const craftLanding = tiers.map((_, from) => spread(craftChances[from], from, tiers.length))
  const recycleLanding = tiers.map((_, from) => spread(recycleChances[from], from, tiers.length))

  // ── The ladder ──────────────────────────────────────────────────────────────
  // One set in at the base, then round and round until the numbers stop moving. Each lap loses
  // three quarters of what it recycles, so it settles quickly — but it is solved rather than
  // guessed at, and the whole thing is linear, so one unit in scales to any answer.
  const grid = () => tiers.map(() => new Array(tiers.length).fill(0))
  const sets = new Array(tiers.length).fill(0)
  const items = new Array(tiers.length).fill(0)
  let crafted = grid()
  let returned = grid()
  sets[base] = 1

  for (let pass = 0; pass < 400; pass++) {
    const madeItems = new Array(tiers.length).fill(0)
    const madeCrafted = grid()
    for (const [from, rate] of sets.entries()) {
      if (rate <= 0) continue
      for (const [to, share] of craftLanding[from].entries()) {
        if (share <= 0) continue
        const made = rate * perSet * (craftEach[from]?.productivity ?? 1) * share
        madeCrafted[from][to] = made
        madeItems[to] += made
      }
    }

    // What the recyclers hand back, read from the lap before rather than from what was just
    // made: when the item comes back as itself those two are the same number, and taking it
    // from this lap would be circular. Either way three quarters of it is gone every time
    // round, so the two ways of counting meet in the same place.
    const madeSets = new Array(tiers.length).fill(0)
    const madeReturned = grid()
    madeSets[base] += 1
    for (const [from, rate] of items.entries()) {
      if (from >= target || rate <= 0) continue
      const back = rate * recycling.recovery
      for (const [to, share] of recycleLanding[from].entries()) {
        if (share <= 0) continue
        madeReturned[from][to] = back * share
        if (itemLoop) madeItems[to] += back * share
        else madeSets[to] += back * share
      }
    }

    const settled =
      madeSets.every((value, at) => Math.abs(value - sets[at]) < 1e-12) &&
      madeItems.every((value, at) => Math.abs(value - items[at]) < 1e-12)
    for (const at of sets.keys()) sets[at] = madeSets[at]
    for (const at of items.keys()) items[at] = madeItems[at]
    crafted = madeCrafted
    returned = madeReturned
    if (settled) break
  }

  const perSetOut = items.reduce((sum, rate, at) => (at >= target ? sum + rate : sum), 0)

  // One set in gave `perSetOut` out. Everything is linear, so whichever end is fixed, the
  // other is that ratio away.
  //
  // Unless the ladder makes none of what was asked for — a fresh one has no modules anywhere
  // and yields nothing, and no number of machines is the answer to "how many for sixty a
  // minute" when the answer is that there is no path at all. Scaling that to zero empties the
  // diagram, and an empty diagram has nowhere to put the module that would fix it. So it falls
  // back to one machine at the bottom: the ladder is drawn, and the rail says what is missing.
  const machinesEnd = (many: number) => (many * (craftEach[base]?.crafts ?? 0)) / (sets[base] || 1)
  const asked = 'machines' in drive ? 0 : drive.output
  const scale =
    'machines' in drive
      ? machinesEnd(drive.machines)
      : asked > 0 && perSetOut > 0
        ? asked / perSetOut
        : machinesEnd(1)

  const built: QualityTier[] = tiers.map((quality, at) => {
    const crafts = sets[at] * scale
    const arrived = items[at] * scale
    const kept = at >= target ? arrived : 0
    const recycled = arrived - kept
    const each = craftEach[at]
    const shred = recycleEach[at]
    return {
      quality,
      machine: crafters[at].machine ?? fallback,
      chance: craftChances[at],
      recyclerQuality: recyclers[at].quality,
      recycleChance: recycleChances[at],
      crafts,
      items: arrived,
      kept,
      recycled,
      crafters: each && each.crafts > 0 ? crafts / each.crafts : 0,
      recyclers: shred && shred.crafts > 0 ? recycled / perShred / shred.crafts : 0,
    }
  })

  const input = scale
  const running = built.reduce((sum, tier) => sum + tier.crafts, 0)

  // What goes round is bought once, at the bottom: the loop hands the rest back. What never
  // comes back out of a recycler is bought again for every craft on every rung.
  const ingredients = new Map<string, number>()
  for (const [name, amount] of Object.entries(recipe.in ?? {})) {
    ingredients.set(name, amount * (recycling.recovers.includes(name) ? input : running))
  }

  return {
    tiers: built,
    climbs,
    crafted: crafted.map((row) => row.map((rate) => rate * scale)),
    returned: returned.map((row) => row.map((rate) => rate * scale)),
    loop: recycling.loop,
    recovers: recycling.recovers,
    fresh: recycling.fresh,
    gives: [...recycling.gives.keys()],
    output: perSetOut * scale,
    input,
    ingredients,
    yield: perSetOut,
    craftChance,
    recycleChance,
  }
}
