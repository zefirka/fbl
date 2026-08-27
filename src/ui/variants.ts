import { isBeltish, isPipeish, spriteVariants, tileIndex, type PlacedEntity } from '../core'
import type { SpriteAtlas, SpriteRect } from '../data/sprites'

/**
 * Picks the atlas variant for every entity once per scene, rather than per frame.
 * Which names to try comes from core; this only turns the first hit into a rectangle.
 */
export function buildVariantKeys(entities: PlacedEntity[], atlas: SpriteAtlas): Map<PlacedEntity, SpriteRect> {
  const belts = tileIndex(entities, isBeltish)
  const pipes = tileIndex(entities, isPipeish)
  const resolved = new Map<PlacedEntity, SpriteRect>()

  for (const entity of entities) {
    const variants = atlas.entities[entity.proto.name]
    if (!variants) continue

    const rect = spriteVariants(entity, belts, pipes)
      .map((name) => variants[name])
      .find(Boolean)

    // A miss would silently draw some other orientation, so leave it to the schematic
    // fallback instead of guessing.
    if (rect) resolved.set(entity, rect)
  }

  return resolved
}
