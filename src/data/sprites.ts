/** The atlas produced by `scripts/extract-sprites.mjs` from a local Factorio installation. */

import { fetchBytes, type OnProgress } from './progress'

export interface SpriteRect {
  /** Position and size inside atlas.png, in pixels. */
  x: number
  y: number
  w: number
  h: number
  /** Offset in tiles from the entity's centre to the sprite's top-left corner. */
  ox: number
  oy: number
}

export interface SpriteAtlas {
  gameVersion: string
  pixelsPerTile: number
  width: number
  height: number
  beltIndex: Record<string, number>
  entities: Record<string, Record<string, SpriteRect>>
}

export interface LoadedAtlas {
  manifest: SpriteAtlas
  image: HTMLImageElement
}

let cached: Promise<LoadedAtlas | null> | undefined

/**
 * Returns null when the atlas is not there — the renderer falls back to its schematic view,
 * so the studio still works on a machine without Factorio installed.
 *
 * The atlas is 12MB, which is worth a progress bar rather than a spinner, so the PNG is
 * streamed rather than handed to `new Image()` — an Image reports nothing until it is done.
 */
export function loadAtlas(onProgress?: OnProgress): Promise<LoadedAtlas | null> {
  cached ??= (async () => {
    const base = `${import.meta.env.BASE_URL}sprites`

    const manifestResponse = await fetch(`${base}/atlas.json`).catch(() => undefined)
    if (!manifestResponse?.ok) return null
    if (!(manifestResponse.headers.get('content-type') ?? '').includes('json')) return null
    const manifest = (await manifestResponse.json()) as SpriteAtlas

    const blob = await fetchBytes(`${base}/atlas.png`, onProgress)
    if (!blob) return null

    const url = URL.createObjectURL(blob)
    const image = await new Promise<HTMLImageElement | null>((resolve) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => resolve(null)
      img.src = url
    })
    URL.revokeObjectURL(url)

    return image ? { manifest, image } : null
  })()
  return cached
}
