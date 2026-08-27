/** The atlas produced by `scripts/extract-sprites.mjs` from a local Factorio installation. */

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
 * Returns null when the atlas has not been extracted — the renderer falls back to its
 * schematic view, so the studio still works on a machine without Factorio installed.
 */
export function loadAtlas(): Promise<LoadedAtlas | null> {
  cached ??= (async () => {
    const base = `${import.meta.env.BASE_URL}sprites`
    try {
      const response = await fetch(`${base}/atlas.json`)
      if (!response.ok) return null
      const manifest = (await response.json()) as SpriteAtlas

      const image = await new Promise<HTMLImageElement | null>((resolve) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = () => resolve(null)
        img.src = `${base}/atlas.png`
      })

      return image ? { manifest, image } : null
    } catch {
      return null
    }
  })()
  return cached
}
