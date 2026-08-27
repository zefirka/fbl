import type { LabDataset } from './dataset'

/**
 * How a given game version wants its blueprint JSON written.
 *
 * The two things that actually changed between 1.1 and 2.0 and that we care about:
 *  - direction became a 16-point scale (north 0, east 4, south 8, west 12) instead of 8-point;
 *  - module requests moved from a `{"speed-module-3": 2}` map to an `items` array of
 *    `{id: {name, quality}, items: {in_inventory: [{inventory, stack, count}]}}` plans.
 */
export interface VersionProfile {
  /** FactorioLab dataset id, also the folder under public/data/. */
  id: string
  label: string
  /** Internal directions are 16-point; 1.1 halves them on export. */
  directionScale: 1 | 2
  moduleFormat: 'items-array' | 'items-map'
  supportsQuality: boolean
}

export const VERSIONS: VersionProfile[] = [
  { id: '2x1', label: 'Space Age 2.1', directionScale: 2, moduleFormat: 'items-array', supportsQuality: true },
  { id: 'spa', label: 'Space Age 2.0', directionScale: 2, moduleFormat: 'items-array', supportsQuality: true },
  { id: '2.0', label: 'Factorio 2.0', directionScale: 2, moduleFormat: 'items-array', supportsQuality: false },
  { id: '1.1', label: 'Factorio 1.1', directionScale: 1, moduleFormat: 'items-map', supportsQuality: false },
]

export const DEFAULT_VERSION = VERSIONS[0]

export function versionById(id: string): VersionProfile {
  return VERSIONS.find((v) => v.id === id) ?? DEFAULT_VERSION
}

/**
 * The `version` field of a blueprint is a packed uint64:
 * major << 48 | minor << 32 | patch << 16 | dev.
 */
export function packGameVersion(dataset: LabDataset): number {
  const raw = dataset.version?.base ?? Object.values(dataset.version ?? {})[0] ?? '2.0.0'
  const [major = 2, minor = 0, patch = 0] = raw.split('.').map((n) => Number(n) || 0)
  const packed = (BigInt(major) << 48n) | (BigInt(minor) << 32n) | (BigInt(patch) << 16n)
  return Number(packed)
}
