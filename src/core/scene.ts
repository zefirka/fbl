import type { Diagnostic, Loc } from './errors'
import { rotateSize, unionRect, type Rect } from './geometry'
import type { Prototype } from './proto'

export interface ModuleSpec {
  name: string
  quality?: string
}

export interface PlacedEntity {
  proto: Prototype
  /** Top-left tile of the footprint *after* rotation, in absolute tile coordinates. */
  x: number
  y: number
  /** Footprint after rotation. */
  w: number
  h: number
  /** 16-point scale; the exporter rescales for 1.1. */
  dir: number
  recipe?: string
  modules?: ModuleSpec[]
  quality?: string
  undergroundType?: 'input' | 'output'
  loc?: Loc
}

/**
 * The accumulator every placement writes into.
 *
 * Blocks and layout combinators work on *index ranges*: a child's entities are always a
 * contiguous slice, so `measure` can drop a range and `row` can shift one, with no need for
 * a separate scratch scene.
 */
export class Scene {
  readonly entities: PlacedEntity[] = []
  readonly diagnostics: Diagnostic[] = []

  get length(): number {
    return this.entities.length
  }

  place(
    proto: Prototype,
    x: number,
    y: number,
    dir: number,
    extra: Partial<PlacedEntity> = {},
  ): PlacedEntity {
    const size = rotateSize(proto.size, proto.rotatable ? dir : 0)
    const entity: PlacedEntity = {
      proto,
      x,
      y,
      w: size.x,
      h: size.y,
      dir: proto.rotatable ? dir : 0,
      ...extra,
    }
    this.entities.push(entity)
    return entity
  }

  warn(message: string, loc?: Loc): void {
    this.diagnostics.push({ severity: 'warning', message, loc })
  }

  /** Bounding box over a half-open index range, in tiles. */
  bbox(from = 0, to = this.entities.length): Rect | null {
    let box: Rect | null = null
    for (let i = from; i < to; i++) {
      const e = this.entities[i]
      box = unionRect(box, { x: e.x, y: e.y, w: e.w, h: e.h })
    }
    return box
  }

  translate(from: number, to: number, dx: number, dy: number): void {
    if (dx === 0 && dy === 0) return
    for (let i = from; i < to; i++) {
      this.entities[i].x += dx
      this.entities[i].y += dy
    }
  }

  /** Removes a range and returns it. Used by `measure`, which must not emit. */
  cut(from: number, to: number): PlacedEntity[] {
    return this.entities.splice(from, to - from)
  }

  /**
   * Overlap check, run once over the finished scene rather than incrementally — ranges get
   * moved and cut during evaluation, so an incremental occupancy index would need undo.
   */
  findCollisions(): Array<{ a: PlacedEntity; b: PlacedEntity; x: number; y: number }> {
    const occupied = new Map<string, number>()
    const clashes: Array<{ a: PlacedEntity; b: PlacedEntity; x: number; y: number }> = []
    // Pairs are keyed by index, not by name and position: three identical entities stacked
    // on one tile are two distinct overlaps, and both need reporting.
    const seen = new Set<string>()

    this.entities.forEach((entity, index) => {
      for (let dx = 0; dx < entity.w; dx++) {
        for (let dy = 0; dy < entity.h; dy++) {
          const key = `${entity.x + dx},${entity.y + dy}`
          const other = occupied.get(key)
          if (other === undefined) {
            occupied.set(key, index)
            continue
          }
          const pairKey = `${other}|${index}`
          if (seen.has(pairKey)) continue
          seen.add(pairKey)
          clashes.push({ a: this.entities[other], b: entity, x: entity.x + dx, y: entity.y + dy })
        }
      }
    })

    return clashes
  }
}
