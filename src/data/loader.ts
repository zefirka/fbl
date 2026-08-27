import type { LabDataset } from './dataset'
import { type VersionProfile, versionById } from './versions'

export interface LoadedDataset {
  profile: VersionProfile
  data: LabDataset
  /** URL of the 66×66 icon spritesheet for this version. */
  iconsUrl: string
}

/**
 * Where the datasets come from when none are bundled.
 *
 * A deployed copy ships no game data: the icon sheets are Wube's art, and FactorioLab already
 * serves the whole set with `access-control-allow-origin: *`. So the browser fetches from
 * there rather than from a second copy of it. `npm run fetch-data` puts a local copy under
 * public/data/ for development, and that wins whenever it is present.
 */
const UPSTREAM = 'https://factoriolab.github.io/data'

const cache = new Map<string, Promise<LoadedDataset>>()

/**
 * A dev server answers unknown paths with index.html rather than a 404, so a 200 is not
 * enough to conclude the file is there — the content type is what tells them apart.
 */
async function fetchDataset(base: string): Promise<LabDataset | null> {
  try {
    const response = await fetch(`${base}/data.json`)
    if (!response.ok) return null
    if (!(response.headers.get('content-type') ?? '').includes('json')) return null
    return (await response.json()) as LabDataset
  } catch {
    return null
  }
}

export function loadDataset(id: string): Promise<LoadedDataset> {
  const cached = cache.get(id)
  if (cached) return cached

  const promise = (async (): Promise<LoadedDataset> => {
    for (const base of [`${import.meta.env.BASE_URL}data/${id}`, `${UPSTREAM}/${id}`]) {
      const data = await fetchDataset(base)
      if (data) return { profile: versionById(id), data, iconsUrl: `${base}/icons.webp` }
    }

    throw new Error(
      `could not load dataset "${id}" — no local copy (run \`npm run fetch-data\`) and ${UPSTREAM} did not answer`,
    )
  })()

  cache.set(id, promise)
  return promise
}
