/** Subset of the FactorioLab `data.json` schema that we actually consume. */

export interface LabIcon {
  id: string
  x: number
  y: number
  color?: string
}

export interface LabMachine {
  speed?: number
  modules?: number
  type?: string
  usage?: number
  size?: [number, number]
}

export interface LabItem {
  id: string
  name: string
  category?: string
  row?: number
  machine?: LabMachine
  belt?: { speed: number }
  module?: { speed?: number; productivity?: number; quality?: number; consumption?: number }
}

export interface LabRecipe {
  id: string
  name: string
  time: number
  producers?: string[]
  in?: Record<string, number>
  out?: Record<string, number>
  flags?: string[]
}

export interface LabQuality {
  id: string
  name: string
  level: number
}

export interface LabDataset {
  version: Record<string, string>
  icons: LabIcon[]
  items: LabItem[]
  recipes: LabRecipe[]
  qualities?: LabQuality[]
}
