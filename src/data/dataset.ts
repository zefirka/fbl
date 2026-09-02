/** Subset of the FactorioLab `data.json` schema that we actually consume. */

export interface LabIcon {
  id: string
  x: number
  y: number
  color?: string
}

/** An effect a machine or a module has on the recipe it runs, as a fraction. */
export interface LabEffect {
  speed?: number
  productivity?: number
  quality?: number
  consumption?: number
  pollution?: number
}

export interface LabMachine {
  speed?: number
  modules?: number
  type?: string
  usage?: number
  size?: [number, number]
  /** What the machine gives before any module: a foundry crafts at +50% productivity. */
  baseEffect?: LabEffect
  /** Speed at each quality above normal, as an absolute value rather than a bonus. */
  qualityRecord?: Record<string, LabMachine>
}

export interface LabItem {
  id: string
  name: string
  category?: string
  row?: number
  machine?: LabMachine
  beacon?: LabBeacon
  /** How many fit in an inventory slot; fluids have none. */
  stack?: number
  belt?: { speed: number }
  module?: LabEffect & { qualityRecord?: Record<string, LabEffect> }
}

/** What a beacon hands to every machine standing in its area. */
export interface LabBeacon {
  /** How much of its modules' effect reaches a machine, before the crowding profile. */
  effectivity: number
  modules?: number
  /** Tiles the area reaches beyond the beacon's own footprint on every side. */
  range: number
  size?: [number, number]
  /** Effects a beacon cannot transmit at all — productivity, and quality. */
  disallowedEffects?: string[]
  /** Share each beacon keeps when n of them reach the same machine, indexed by n − 1. */
  profile?: number[]
  qualityRecord?: Record<string, Partial<LabBeacon>>
}

export interface LabRecipe {
  id: string
  name: string
  time: number
  producers?: string[]
  in?: Record<string, number>
  out?: Record<string, number>
  flags?: string[]
  /** Effects this recipe refuses; most of the game's recipes take no productivity. */
  disallowedEffects?: string[]
  /**
   * What the dataset thinks this much of the output is worth, on extraction recipes only.
   * A hundred for anything a drill brings up, ten for ten units of crude oil, and nothing at
   * all for what an offshore pump takes out of an unlimited lake.
   */
  cost?: number
  /** Where in the solar system the recipe can be run. */
  locations?: string[]
}

export interface LabQuality {
  id: string
  name: string
  level: number
}

/** The tabs of the game's own crafting menu, which is how anyone already knows to look. */
export interface LabCategory {
  id: string
  name: string
}

export interface LabDataset {
  version: Record<string, string>
  icons: LabIcon[]
  items: LabItem[]
  recipes: LabRecipe[]
  qualities?: LabQuality[]
  categories?: LabCategory[]
}
