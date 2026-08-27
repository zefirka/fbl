import type { PlacedEntity } from './scene'

/**
 * Which tiles a blueprint's poles actually power, and what is left in the dark.
 *
 * A pole's reach is its `supply_area_distance` measured from its centre, which is a different
 * number from the wire distance people usually quote: a big electric pole throws a wire 32
 * tiles but powers only 4×4, while a substation powers 18×18.
 */

export interface PowerReport {
  /** Every powered tile, keyed `x,y`. */
  covered: Set<string>
  /** Consumers with no tile inside any supply area. */
  unpowered: PlacedEntity[]
  poles: number
  consumers: number
}

const key = (x: number, y: number) => `${x},${y}`

/** The half-open tile range a pole covers on one axis. */
function span(start: number, size: number, reach: number): [number, number] {
  const centre = start + size / 2
  return [Math.floor(centre - reach), Math.ceil(centre + reach)]
}

export function powerCoverage(entities: PlacedEntity[]): PowerReport {
  const covered = new Set<string>()
  let poles = 0

  for (const entity of entities) {
    const reach = entity.proto.supplyArea
    if (reach === undefined) continue
    poles++

    const [left, right] = span(entity.x, entity.w, reach)
    const [top, bottom] = span(entity.y, entity.h, reach)
    for (let x = left; x < right; x++) {
      for (let y = top; y < bottom; y++) covered.add(key(x, y))
    }
  }

  const unpowered: PlacedEntity[] = []
  let consumers = 0

  for (const entity of entities) {
    if (!entity.proto.needsPower) continue
    consumers++

    let reached = false
    for (let dx = 0; dx < entity.w && !reached; dx++) {
      for (let dy = 0; dy < entity.h && !reached; dy++) {
        if (covered.has(key(entity.x + dx, entity.y + dy))) reached = true
      }
    }
    if (!reached) unpowered.push(entity)
  }

  return { covered, unpowered, poles, consumers }
}
