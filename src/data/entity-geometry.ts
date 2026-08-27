/**
 * Footprints for entities the FactorioLab dataset does not describe.
 *
 * FactorioLab is a ratio calculator, so it only carries geometry for crafting machines
 * (`item.machine.size`). Belts, inserters, poles, pipes and the rest are filled in here by
 * hand. Everything in this table is replaceable: point `scripts/fetch-data.mjs` at a real
 * `factorio --dump-data` export and this file becomes a fallback rather than a source.
 *
 * `size` is the footprint of the entity facing north. Rotating east/west swaps the axes.
 */

export type EntityKind =
  | 'belt'
  | 'underground-belt'
  | 'splitter'
  | 'inserter'
  | 'pole'
  | 'container'
  | 'pipe'
  | 'machine'
  | 'misc'

export interface EntityGeometry {
  size: [number, number]
  /**
   * Module slots, for entities the dataset carries no `machine` record for. A beacon is the
   * one that matters: FactorioLab is a ratio calculator, and a beacon crafts nothing.
   */
  moduleSlots?: number
  /** Whether a `:dir` is meaningful. Direction is omitted from the blueprint otherwise. */
  rotatable?: boolean
  kind?: EntityKind
  /**
   * Inventory index that modules are requested into, from Factorio's `defines.inventory`.
   * Crafting machines and furnaces use 4, mining drills 2, beacons 1, labs 3.
   */
  moduleInventory?: number
  /** Tiles an underground pair may span. Advisory only — used for a warning, not an error. */
  undergroundReach?: number
  /**
   * Half the width of the square this pole powers, from its centre, as Factorio's
   * `supply_area_distance`. Not to be confused with wire reach: a big electric pole throws a
   * wire 32 tiles but only powers 4×4, while a substation powers 18×18.
   */
  supplyArea?: number
  /**
   * Draws electricity. The dataset marks the 18 crafting machines that do; everything else —
   * inserters, lamps, radars — has to say so here.
   */
  powered?: boolean
}

const belt = (kind: EntityKind, size: [number, number] = [1, 1]): EntityGeometry => ({
  size,
  rotatable: true,
  kind,
})

export const ENTITY_GEOMETRY: Record<string, EntityGeometry> = {
  // ── Belts ────────────────────────────────────────────────────────────────────
  'transport-belt': belt('belt'),
  'fast-transport-belt': belt('belt'),
  'express-transport-belt': belt('belt'),
  'turbo-transport-belt': belt('belt'),

  'underground-belt': { ...belt('underground-belt'), undergroundReach: 4 },
  'fast-underground-belt': { ...belt('underground-belt'), undergroundReach: 6 },
  'express-underground-belt': { ...belt('underground-belt'), undergroundReach: 8 },
  'turbo-underground-belt': { ...belt('underground-belt'), undergroundReach: 10 },

  splitter: belt('splitter', [2, 1]),
  'fast-splitter': belt('splitter', [2, 1]),
  'express-splitter': belt('splitter', [2, 1]),
  'turbo-splitter': belt('splitter', [2, 1]),

  loader: belt('belt'),
  'fast-loader': belt('belt'),
  'express-loader': belt('belt'),
  'turbo-loader': belt('belt'),

  // ── Inserters ────────────────────────────────────────────────────────────────
  'burner-inserter': belt('inserter'),
  inserter: { ...belt('inserter'), powered: true },
  'long-handed-inserter': { ...belt('inserter'), powered: true },
  'fast-inserter': { ...belt('inserter'), powered: true },
  'bulk-inserter': { ...belt('inserter'), powered: true },
  'stack-inserter': { ...belt('inserter'), powered: true },

  // ── Power ────────────────────────────────────────────────────────────────────
  'small-electric-pole': { size: [1, 1], kind: 'pole', supplyArea: 2.5 },
  'medium-electric-pole': { size: [1, 1], kind: 'pole', supplyArea: 3.5 },
  'big-electric-pole': { size: [2, 2], kind: 'pole', supplyArea: 2 },
  substation: { size: [2, 2], kind: 'pole', supplyArea: 9 },
  'solar-panel': { size: [3, 3], kind: 'machine' },
  accumulator: { size: [2, 2], kind: 'machine' },
  boiler: { size: [3, 2], rotatable: true, kind: 'machine' },
  'steam-engine': { size: [5, 3], rotatable: true, kind: 'machine' },
  'steam-turbine': { size: [5, 3], rotatable: true, kind: 'machine' },
  'heat-pipe': { size: [1, 1], kind: 'pipe' },
  'heat-exchanger': { size: [3, 2], rotatable: true, kind: 'machine' },

  // ── Containers ───────────────────────────────────────────────────────────────
  'wooden-chest': { size: [1, 1], kind: 'container' },
  'iron-chest': { size: [1, 1], kind: 'container' },
  'steel-chest': { size: [1, 1], kind: 'container' },
  'passive-provider-chest': { size: [1, 1], kind: 'container' },
  'active-provider-chest': { size: [1, 1], kind: 'container' },
  'storage-chest': { size: [1, 1], kind: 'container' },
  'buffer-chest': { size: [1, 1], kind: 'container' },
  'requester-chest': { size: [1, 1], kind: 'container' },

  // ── Fluids ───────────────────────────────────────────────────────────────────
  pipe: { size: [1, 1], kind: 'pipe' },
  'pipe-to-ground': { size: [1, 1], rotatable: true, kind: 'pipe', undergroundReach: 10 },
  'storage-tank': { size: [3, 3], rotatable: true, kind: 'machine' },
  pump: { size: [1, 2], rotatable: true, kind: 'machine', powered: true },
  'offshore-pump': { size: [1, 2], rotatable: true, kind: 'machine' },

  // ── Production support ───────────────────────────────────────────────────────
  beacon: { size: [3, 3], kind: 'machine', moduleSlots: 2, moduleInventory: 1, powered: true },
  lab: { size: [3, 3], kind: 'machine', moduleInventory: 3 },
  'biolab': { size: [5, 5], kind: 'machine', moduleInventory: 3 },
  radar: { size: [3, 3], kind: 'machine', powered: true },
  roboport: { size: [4, 4], kind: 'machine', powered: true },
  'small-lamp': { size: [1, 1], kind: 'misc', powered: true },

  // ── Circuits ─────────────────────────────────────────────────────────────────
  'constant-combinator': { size: [1, 1], rotatable: true, kind: 'misc' },
  'arithmetic-combinator': { size: [1, 2], rotatable: true, kind: 'misc', powered: true },
  'decider-combinator': { size: [1, 2], rotatable: true, kind: 'misc', powered: true },
  'selector-combinator': { size: [1, 2], rotatable: true, kind: 'misc', powered: true },
  'power-switch': { size: [2, 2], kind: 'misc' },
  'programmable-speaker': { size: [1, 1], kind: 'misc', powered: true },
  'display-panel': { size: [1, 1], rotatable: true, kind: 'misc', powered: true },

  // ── Defence / walls ──────────────────────────────────────────────────────────
  'stone-wall': { size: [1, 1], kind: 'misc' },
  gate: { size: [1, 1], rotatable: true, kind: 'misc' },
  'gun-turret': { size: [2, 2], rotatable: true, kind: 'misc' },
  'laser-turret': { size: [2, 2], rotatable: true, kind: 'misc', powered: true },
  'flamethrower-turret': { size: [3, 2], rotatable: true, kind: 'misc' },

  // ── Trains ───────────────────────────────────────────────────────────────────
  'train-stop': { size: [2, 2], rotatable: true, kind: 'misc' },
  'rail-signal': { size: [1, 1], rotatable: true, kind: 'misc' },
  'rail-chain-signal': { size: [1, 1], rotatable: true, kind: 'misc' },
}

/** Crafting machines are rotatable when they have fluid boxes; these are the common ones. */
export const ROTATABLE_MACHINES = new Set([
  'chemical-plant',
  'oil-refinery',
  'electromagnetic-plant',
  'foundry',
  'biochamber',
  'cryogenic-plant',
  'assembling-machine-2',
  'assembling-machine-3',
  'burner-mining-drill',
  'electric-mining-drill',
  'big-mining-drill',
  'pumpjack',
  'agricultural-tower',
  'rocket-silo',
  'thruster',
])

/** `defines.inventory` index that modules go into, by machine family. */
export function moduleInventoryFor(name: string): number {
  if (name.includes('mining-drill') || name === 'pumpjack') return 2 // MINING_DRILL_MODULES
  if (name === 'beacon') return 1 // BEACON_MODULES
  if (name === 'lab' || name === 'biolab') return 3 // LAB_MODULES
  return 4 // ASSEMBLING_MACHINE_MODULES / FURNACE_MODULES / ROCKET_SILO_MODULES
}
