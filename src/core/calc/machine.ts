import type { LabEffect, LabRecipe } from '../../data/dataset'
import type { ProtoRegistry } from '../proto'
import type { ModuleSpec } from '../scene'

/**
 * How fast a machine gets through a recipe.
 *
 * One formula, used from both ends: the blueprint asks "what do these machines make", the
 * calculator asks "how many of them do I need". They have to agree to the last decimal, or
 * a plan and the thing built from it would disagree about the same factory.
 *
 * A craft takes `recipe.time` seconds at speed 1, so a machine finishes
 * `speed × (1 + speed bonus) / time` of them each second. Productivity multiplies what comes
 * out without touching what goes in, which is why the two are kept apart all the way down.
 */

export interface Effects {
  speed: number
  productivity: number
}

export const NO_EFFECTS: Effects = { speed: 0, productivity: 0 }

export const addEffects = (a: Effects, b: Effects): Effects => ({
  speed: a.speed + b.speed,
  productivity: a.productivity + b.productivity,
})

/** Factorio's own limits: productivity tops out at +300%, and speed cannot drop below 20%. */
export const MAX_PRODUCTIVITY = 3
export const MIN_SPEED = 0.2

/** An effect at the quality it was built at; the record holds absolute values, not deltas. */
export function atQuality<T extends LabEffect>(effect: T, quality: string | undefined): LabEffect {
  const record = (effect as { qualityRecord?: Record<string, LabEffect> }).qualityRecord
  if (!quality || quality === 'normal') return effect
  return { ...effect, ...(record?.[quality] ?? {}) }
}

/** What the modules sitting in a machine add, each at its own quality. */
export function moduleEffects(modules: readonly ModuleSpec[] | undefined, registry: ProtoRegistry): Effects {
  const total: Effects = { speed: 0, productivity: 0 }
  for (const module of modules ?? []) {
    const spec = registry.moduleEffects.get(module.name)
    if (!spec) continue
    const effect = atQuality(spec, module.quality)
    total.speed += effect.speed ?? 0
    total.productivity += effect.productivity ?? 0
  }
  return total
}

/**
 * What a row of beacons adds, counted rather than placed: `count` of them, each holding the
 * same modules. The share each one keeps falls off as they crowd together, which is the whole
 * reason 8 beacons are not 8 times 1.
 */
export function beaconEffects(
  registry: ProtoRegistry,
  beacon: string,
  count: number,
  modules: readonly ModuleSpec[],
  quality?: string,
): Effects {
  const spec = registry.beacons.get(beacon)
  if (!spec || count <= 0) return NO_EFFECTS

  const held = moduleEffects(modules, registry)
  // A beacon never passes on productivity, whatever is sitting in it.
  if ((spec.disallowedEffects ?? []).includes('productivity')) held.productivity = 0

  const effectivity =
    (quality && quality !== 'normal' ? spec.qualityRecord?.[quality]?.effectivity : undefined) ??
    spec.effectivity ??
    1
  const profile = spec.profile ?? [1]
  const share = profile[Math.min(count, profile.length) - 1] ?? 1

  return {
    speed: held.speed * effectivity * share * count,
    productivity: held.productivity * effectivity * share * count,
  }
}

/** The speed the machine itself runs at, at the quality it was built to. */
export function machineSpeed(
  registry: ProtoRegistry,
  machine: string,
  quality?: string,
): number | undefined {
  const spec = registry.machines.get(machine)
  if (!spec) return undefined
  return (atQuality(spec, quality) as { speed?: number }).speed
}

export interface Throughput {
  /** Crafts finished each second. */
  crafts: number
  /** What each product is multiplied by on the way out. */
  productivity: number
}

/**
 * Crafts a second, and the productivity multiplier that goes with them. Both are wanted
 * together: a recipe that refuses productivity has to refuse the machine's own bonus too,
 * and that decision belongs next to the arithmetic rather than at either call site.
 */
export function throughputOf(
  registry: ProtoRegistry,
  machine: string,
  recipe: LabRecipe,
  effects: Effects,
  quality?: string,
): Throughput | undefined {
  const base = machineSpeed(registry, machine, quality)
  if (!base || !recipe.time) return undefined

  const refused = new Set(recipe.disallowedEffects ?? [])
  const own = registry.machines.get(machine)?.baseEffect?.productivity ?? 0

  const speed = refused.has('speed') ? 0 : effects.speed
  const productivity = refused.has('productivity') ? 0 : own + effects.productivity

  return {
    crafts: (base * Math.max(MIN_SPEED, 1 + speed)) / recipe.time,
    productivity: 1 + Math.min(MAX_PRODUCTIVITY, productivity),
  }
}

/** How many of this machine it takes to finish `crafts` a second. Fractional on purpose. */
export function machinesFor(crafts: number, each: Throughput | undefined): number {
  if (!each || each.crafts <= 0) return 0
  return crafts / each.crafts
}
