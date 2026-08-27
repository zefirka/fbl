import library from '../data/balancers.json'

/**
 * Ready-made belt balancers, lifted from a community blueprint book by
 * `scripts/extract-balancers.mjs`. See src/data/balancers.json for the source and terms.
 *
 * The library holds one geometry per N→M, because every balancer in it is built from belts,
 * undergrounds and splitters alone — nothing that differs between tiers. The tier is chosen
 * at placement, which also means tiers the original book predates work for free.
 */

export const BELT = 0
export const UNDERGROUND = 1
export const SPLITTER = 2

export type BalancerKind = typeof BELT | typeof UNDERGROUND | typeof SPLITTER

/** Footprint facing north. Rotating east or west swaps the axes. */
const SIZE: Record<number, [number, number]> = { [BELT]: [1, 1], [UNDERGROUND]: [1, 1], [SPLITTER]: [2, 1] }

export interface BalancerPart {
  kind: BalancerKind
  x: number
  y: number
  dir: number
  /** Undergrounds only: 0 is the entry, 1 the exit. */
  underground?: number
}

export interface BalancerLayout {
  w: number
  h: number
  parts: BalancerPart[]
}

const table = library.balancers as Record<string, { w: number; h: number; e: number[][] }>

/** The library flows north; every other direction is this many quarter turns clockwise. */
function rotate(layout: BalancerLayout): BalancerLayout {
  return {
    w: layout.h,
    h: layout.w,
    parts: layout.parts.map((part) => {
      const [w, h] = SIZE[part.kind]
      const [, height] = part.dir === 4 || part.dir === 12 ? [h, w] : [w, h]
      // Turning clockwise, a footprint at (x, y) in a W×H layout lands at (H − y − h, x).
      return { ...part, x: layout.h - part.y - height, y: part.x, dir: (part.dir + 4) % 16 }
    }),
  }
}

export function balancerSizes(): string[] {
  return Object.keys(table)
}

export function hasBalancer(from: number, to: number): boolean {
  return `${from}-${to}` in table
}

/** The largest input or output count the library covers. */
export const BALANCER_LIMIT = Object.keys(table).reduce((max, key) => {
  const [from, to] = key.split('-').map(Number)
  return Number.isFinite(from) && Number.isFinite(to) ? Math.max(max, from, to) : max
}, 0)

export function balancerLayout(from: number, to: number, dir: number): BalancerLayout | undefined {
  const raw = table[`${from}-${to}`]
  if (!raw) return undefined

  let layout: BalancerLayout = {
    w: raw.w,
    h: raw.h,
    parts: raw.e.map(([kind, x, y, direction, underground]) => ({
      kind: kind as BalancerKind,
      x,
      y,
      dir: direction,
      underground,
    })),
  }

  const turns = (((dir / 4) % 4) + 4) % 4
  for (let i = 0; i < turns; i++) layout = rotate(layout)
  return layout
}
