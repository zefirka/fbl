import type { LabBeacon, LabRecipe } from '../data/dataset'
import { addEffects, moduleEffects, throughputOf, type Effects } from './calc/machine'
import type { Rect } from './geometry'
import type { ProtoRegistry } from './proto'
import type { PlacedEntity, Scene } from './scene'

/**
 * What the machines in a blueprint eat and make, per second, running flat out.
 *
 * This is the number you size a bus against: every machine crafting without pause, so the
 * belts feeding it have to keep up with the answer. Nothing here models throughput — whether
 * the belts *do* keep up is the question this is meant to help answer, not one it answers.
 *
 * A craft takes `recipe.time` seconds at speed 1, so a machine finishes
 * `speed × (1 + speed bonus) / time` of them each second. Ingredients are drawn once per
 * craft; products come out multiplied by productivity, which is the whole point of the module.
 * Quality is read off the machine and off each module separately — a legendary assembler with
 * normal modules is a real thing to build, and so is the reverse.
 *
 * Beacons count too, and where they stand decides what they do: a beacon reaches every machine
 * whose footprint touches its area, and hands over `effectivity` of its modules' effect —
 * shared down by the crowding profile once several of them reach the same machine. They cannot
 * transmit productivity, so what they change is how fast the ingredients go in.
 *
 * A machine with no recipe is not a machine making nothing — it is a machine whose output
 * nobody has stated. Furnaces have no recipe to set at all. Those are counted separately and
 * said out loud rather than folded into the total as zero.
 */

export interface RateEntry {
  item: string
  /** Units per second. Fluids are counted the way the game does, in whole units. */
  perSecond: number
}

export interface Rates {
  consumption: RateEntry[]
  production: RateEntry[]
  /** Machines whose recipe is known, and so counted. */
  crafting: number
  /** Machines that could craft but were told nothing to craft. */
  idle: number
}

/** Recipes nothing on a belt feeds: research, and burning a fuel for its energy. */
const IGNORED_FLAGS = new Set(['technology', 'burn'])

/** What a beacon covers: its own footprint grown by `range` on every side. */
function areaOf(beacon: PlacedEntity, spec: LabBeacon): Rect {
  const range = spec.range ?? 0
  return {
    x: beacon.x - range,
    y: beacon.y - range,
    w: beacon.w + range * 2,
    h: beacon.h + range * 2,
  }
}

const overlaps = (a: Rect, b: PlacedEntity) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

interface Broadcast {
  area: Rect
  /** Effectivity times what the modules in it do — everything but the crowding share. */
  effect: Effects
  /** This beacon's own share table; a mod could give two kinds of beacon different ones. */
  profile: number[]
}

/**
 * The beacons that are actually doing something. An empty one is left out entirely rather
 * than counted and then multiplied by nothing: it would otherwise dilute the share of the
 * beacons around it, which is not what an empty beacon does.
 */
function broadcasts(scene: Scene, registry: ProtoRegistry): Broadcast[] {
  const found: Broadcast[] = []

  for (const entity of scene.entities) {
    const spec = registry.beacons.get(entity.proto.name)
    if (!spec) continue

    const modules = moduleEffects(entity.modules, registry)
    const refused = new Set(spec.disallowedEffects ?? [])
    // A beacon never passes on productivity, whatever is sitting in it.
    if (refused.has('productivity')) modules.productivity = 0
    if (modules.speed === 0 && modules.productivity === 0) continue

    const quality = entity.quality
    const effectivity =
      (quality && quality !== 'normal' ? spec.qualityRecord?.[quality]?.effectivity : undefined) ??
      spec.effectivity ??
      1

    found.push({
      area: areaOf(entity, spec),
      effect: { speed: modules.speed * effectivity, productivity: modules.productivity * effectivity },
      profile: spec.profile ?? [1],
    })
  }

  return found
}

/** What the beacons around a machine add, once they have shared the machine between them. */
function beaconEffect(machine: PlacedEntity, all: Broadcast[]): Effects {
  const total: Effects = { speed: 0, productivity: 0 }
  const reaching = all.filter((beacon) => overlaps(beacon.area, machine))

  for (const beacon of reaching) {
    const share = beacon.profile[Math.min(reaching.length, beacon.profile.length) - 1] ?? 1
    total.speed += beacon.effect.speed * share
    total.productivity += beacon.effect.productivity * share
  }
  return total
}

/** How many crafts a machine gets through each second, and what productivity multiplies them by. */
function output(entity: PlacedEntity, recipe: LabRecipe, registry: ProtoRegistry, beacons: Effects) {
  const effects = addEffects(moduleEffects(entity.modules, registry), beacons)
  return throughputOf(registry, entity.proto.name, recipe, effects, entity.quality)
}

const byRate = (a: RateEntry, b: RateEntry) => b.perSecond - a.perSecond || a.item.localeCompare(b.item)

export function computeRates(scene: Scene, registry: ProtoRegistry): Rates {
  const beacons = broadcasts(scene, registry)

  const consumed = new Map<string, number>()
  const produced = new Map<string, number>()
  const add = (into: Map<string, number>, item: string, rate: number) =>
    into.set(item, (into.get(item) ?? 0) + rate)

  let crafting = 0
  let idle = 0

  for (const entity of scene.entities) {
    // Only machines that craft: a chest holding a recipe's worth of parts is not making them.
    if (entity.proto.craftingSpeed === undefined) continue

    const recipe = entity.recipe ? registry.recipes.get(entity.recipe) : undefined
    if (!recipe) {
      idle++
      continue
    }
    if ((recipe.flags ?? []).some((flag) => IGNORED_FLAGS.has(flag))) continue

    const rate = output(entity, recipe, registry, beaconEffect(entity, beacons))
    if (!rate) {
      idle++
      continue
    }

    crafting++
    for (const [item, count] of Object.entries(recipe.in ?? {})) add(consumed, item, count * rate.crafts)
    for (const [item, count] of Object.entries(recipe.out ?? {})) {
      add(produced, item, count * rate.crafts * rate.productivity)
    }
  }

  const list = (totals: Map<string, number>): RateEntry[] =>
    [...totals].map(([item, perSecond]) => ({ item, perSecond })).sort(byRate)

  return { consumption: list(consumed), production: list(produced), crafting, idle }
}
