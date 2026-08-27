import type { LabDataset } from './dataset'
import { type VersionProfile, versionById } from './versions'

export interface LoadedDataset {
  profile: VersionProfile
  data: LabDataset
  /** URL of the 66×66 icon spritesheet for this version. */
  iconsUrl: string
}

const cache = new Map<string, Promise<LoadedDataset>>()

/**
 * Datasets live in public/data/<id>/ and are populated by `npm run fetch-data`.
 * They are not committed — the art is Wube's.
 */
export function loadDataset(id: string): Promise<LoadedDataset> {
  const cached = cache.get(id)
  if (cached) return cached

  const promise = (async (): Promise<LoadedDataset> => {
    const base = `${import.meta.env.BASE_URL}data/${id}`
    const res = await fetch(`${base}/data.json`)
    if (!res.ok) {
      throw new Error(
        `dataset "${id}" is missing (${res.status}). Run \`npm run fetch-data\` to download it.`,
      )
    }
    return { profile: versionById(id), data: (await res.json()) as LabDataset, iconsUrl: `${base}/icons.webp` }
  })()

  cache.set(id, promise)
  return promise
}
