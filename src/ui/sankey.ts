/**
 * Laying out a flow diagram: left to right, thickness for rate.
 *
 * Pure arithmetic on nodes and links — no DOM, no items, no recipes. What it knows is that
 * some boxes feed others at some rate, which keeps it usable for the next thing that needs a
 * diagram rather than only for the one that needed it first.
 *
 * Three steps, in the order everyone does them. Columns come from the longest path, so a box
 * always stands to the right of everything feeding it. Order within a column comes from
 * sweeping medians back and forth, which is the cheap way to stop links crossing. Heights
 * come from the rate, floored so that a trickle is still something you can point at, and the
 * ports on each side are stacked in the order of whatever is at the other end.
 *
 * A link that skips a column does not fly over it. It is broken at every column it crosses and
 * those crossing points are laid out with everything else, so the ribbon gets a lane of its
 * own and the boxes move aside to make room. Without that a long flow passes behind whatever
 * happens to be in the way and reads as a smear rather than a route.
 *
 * Cycles are not an error here. A factory that feeds itself is a real factory, so the longest
 * path is taken over the graph with its back edges dropped, and those links are drawn going
 * backwards.
 */

export interface SankeyNode {
  key: string
  /** What decides the height: everything through it, in whatever units the caller counts in. */
  weight: number
  /** Kept clear of the packing, so a box with controls in it still fits. */
  minHeight?: number
}

export interface SankeyLink {
  from: string
  to: string
  weight: number
  /** Anything the caller wants back on the laid-out link. */
  tag?: string
}

export interface Placed {
  key: string
  column: number
  x: number
  y: number
  width: number
  height: number
}

export interface Ribbon {
  from: string
  to: string
  weight: number
  tag?: string
  /** Where it leaves and arrives, already stacked against the other ports on that edge. */
  x1: number
  y1: number
  x2: number
  y2: number
  /** Where it passes between, column by column, between the two ends. */
  points: Array<{ x: number; y: number }>
  /** How thick to draw it. */
  thickness: number
  /** True when it runs right to left: a loop, drawn the long way round. */
  backward: boolean
}

export interface SankeyLayout {
  nodes: Placed[]
  links: Ribbon[]
  width: number
  height: number
}

export interface SankeyOptions {
  nodeWidth?: number
  /** Space between columns. */
  columnGap?: number
  /** Space between boxes in a column. */
  rowGap?: number
  /** Tiles of height per unit of weight; the caller scales what it means. */
  scale?: number
  minNodeHeight?: number
  minThickness?: number
  /** Sweeps of the crossing-reduction pass. Three is plenty; it converges fast. */
  sweeps?: number
}

const DEFAULTS = {
  nodeWidth: 210,
  columnGap: 200,
  rowGap: 26,
  scale: 1,
  minNodeHeight: 56,
  minThickness: 1.5,
  sweeps: 6,
}

export function layoutSankey(
  nodes: readonly SankeyNode[],
  links: readonly SankeyLink[],
  options: SankeyOptions = {},
): SankeyLayout {
  const o = { ...DEFAULTS, ...options }
  const index = new Map(nodes.map((node, i) => [node.key, i]))
  const live = links.filter((link) => index.has(link.from) && index.has(link.to) && link.from !== link.to)

  const columns = columnsOf(nodes, live)
  const thickness = (weight: number) => Math.max(o.minThickness, weight * o.scale)

  // ── Crossings get a box of their own ────────────────────────────────────────
  // A link over more than one column is cut at each one it crosses. The pieces take part in
  // the ordering like anything else, so the lane they end up in is a lane nothing else wants.
  const waypoints = new Map<SankeyLink, string[]>()
  const spans: SankeyNode[] = []
  const pieces: SankeyLink[] = []

  for (const [i, link] of live.entries()) {
    const from = columns.get(link.from) ?? 0
    const to = columns.get(link.to) ?? 0
    if (to <= from + 1) {
      pieces.push(link)
      continue
    }

    const through: string[] = []
    for (let column = from + 1; column < to; column++) {
      const key = `\u0000span:${i}:${column}`
      through.push(key)
      columns.set(key, column)
      spans.push({ key, weight: link.weight, minHeight: 0 })
    }
    waypoints.set(link, through)

    const chain = [link.from, ...through, link.to]
    for (let step = 0; step + 1 < chain.length; step++) {
      pieces.push({ from: chain[step], to: chain[step + 1], weight: link.weight })
    }
  }

  const all = [...nodes, ...spans]
  const order = orderColumns(all, pieces, columns, o.sweeps)

  // ── Boxes ───────────────────────────────────────────────────────────────────
  const placed = new Map<string, Placed>()
  const spanning = new Set(spans.map((span) => span.key))
  let height = 0

  for (const [column, keys] of order.entries()) {
    let y = 0
    for (const key of keys) {
      const node = all.find((entry) => entry.key === key)!
      const crossing = spanning.has(key)
      const box: Placed = {
        key,
        column,
        x: column * (o.nodeWidth + o.columnGap) + (crossing ? o.nodeWidth / 2 : 0),
        y,
        width: crossing ? 0 : o.nodeWidth,
        height: crossing ? thickness(node.weight) : Math.max(o.minNodeHeight, node.minHeight ?? 0, node.weight * o.scale),
      }
      placed.set(key, box)
      y += box.height + (crossing ? o.rowGap / 2 : o.rowGap)
    }
    height = Math.max(height, y - o.rowGap)
  }

  // Columns are centred against the tallest, so the diagram reads along its middle.
  for (const keys of order) {
    const tall = keys.reduce((sum, key) => sum + placed.get(key)!.height + o.rowGap, -o.rowGap)
    const shift = (height - tall) / 2
    for (const key of keys) placed.get(key)!.y += shift
  }

  // ── Ports ───────────────────────────────────────────────────────────────────
  // Each side of a box stacks its links in the order of whatever is at the other end, which
  // is what keeps a bundle of ribbons from plaiting itself.
  const leaving = new Map<string, SankeyLink[]>()
  const arriving = new Map<string, SankeyLink[]>()
  for (const piece of pieces) {
    ;(leaving.get(piece.from) ?? leaving.set(piece.from, []).get(piece.from)!).push(piece)
    ;(arriving.get(piece.to) ?? arriving.set(piece.to, []).get(piece.to)!).push(piece)
  }

  const middle = (key: string) => {
    const box = placed.get(key)!
    return box.y + box.height / 2
  }

  const port = new Map<string, number>()
  /** Which end of a link is the far one, from a given side of a box. */
  const far = (link: SankeyLink, side: 'out' | 'in') => (side === 'out' ? link.to : link.from)

  /**
   * Stacks one edge of one box. The order is by where the other end of each link sits: put the
   * one that comes from higher up higher, and the two do not cross. Both sides have to be
   * sorted the same way round — sorting the inputs the other way is a guarantee that every
   * pair of them crosses.
   */
  const stack = (
    list: SankeyLink[],
    key: string,
    side: 'out' | 'in',
    locate: (link: SankeyLink, side: 'out' | 'in') => number,
  ): void => {
    const box = placed.get(key)!
    if (spanning.has(key)) {
      for (const piece of list) port.set(portKey(piece, side), middle(key))
      return
    }

    list.sort((a, b) => locate(a, side) - locate(b, side))
    let offset = box.y + inset(box, list, thickness)
    for (const piece of list) {
      const size = thickness(piece.weight)
      port.set(portKey(piece, side), offset + size / 2)
      offset += size
    }
  }

  const stackAll = (locate: (link: SankeyLink, side: 'out' | 'in') => number) => {
    for (const [key, list] of leaving) stack(list, key, 'out', locate)
    for (const [key, list] of arriving) stack(list, key, 'in', locate)
  }

  // First by the middle of the box at the other end, which is all there is to go on. Then
  // again by where that end's port actually landed, which is what the ribbon will aim at.
  stackAll((link, side) => middle(far(link, side)))
  stackAll((link, side) => port.get(portKey(link, side === 'out' ? 'in' : 'out')) ?? middle(far(link, side)))

  const pieceOf = (from: string, to: string) => pieces.find((p) => p.from === from && p.to === to)!

  const ribbons: Ribbon[] = live.map((link) => {
    const from = placed.get(link.from)!
    const to = placed.get(link.to)!
    const through = waypoints.get(link) ?? []
    const first = pieceOf(link.from, through[0] ?? link.to)
    const last = pieceOf(through[through.length - 1] ?? link.from, link.to)

    return {
      from: link.from,
      to: link.to,
      weight: link.weight,
      tag: link.tag,
      x1: from.x + from.width,
      y1: port.get(portKey(first, 'out')) ?? middle(link.from),
      x2: to.x,
      y2: port.get(portKey(last, 'in')) ?? middle(link.to),
      points: through.map((key) => ({ x: placed.get(key)!.x, y: middle(key) })),
      thickness: thickness(link.weight),
      backward: to.column <= from.column,
    }
  })

  return {
    nodes: [...placed.values()].filter((box) => !spanning.has(box.key)),
    links: ribbons,
    width: order.length * (o.nodeWidth + o.columnGap) - o.columnGap,
    height,
  }
}

const portKey = (link: SankeyLink, side: 'out' | 'in') => `${side}|${link.from}|${link.to}`

/** Where the first port sits, so a stack of them ends up centred on the box's edge. */
function inset(box: Placed, list: readonly SankeyLink[], thickness: (weight: number) => number): number {
  const stack = list.reduce((sum, link) => sum + thickness(link.weight), 0)
  return Math.max(0, (box.height - stack) / 2)
}

/**
 * Longest path from the sources, so nothing sits left of what feeds it. Back edges are found
 * with a depth-first walk and left out of the count; a loop then lands beside what it feeds
 * rather than pushing the whole diagram sideways for ever.
 */
function columnsOf(nodes: readonly SankeyNode[], links: readonly SankeyLink[]): Map<string, number> {
  const forward = new Map<string, string[]>()
  const back = new Set<SankeyLink>()

  for (const link of links) {
    const list = forward.get(link.from)
    if (list) list.push(link.to)
    else forward.set(link.from, [link.to])
  }

  const state = new Map<string, 'open' | 'done'>()
  const walk = (key: string): void => {
    state.set(key, 'open')
    for (const next of forward.get(key) ?? []) {
      const seen = state.get(next)
      if (seen === 'open') {
        for (const link of links) if (link.from === key && link.to === next) back.add(link)
        continue
      }
      if (!seen) walk(next)
    }
    state.set(key, 'done')
  }
  for (const node of nodes) if (!state.has(node.key)) walk(node.key)

  const ahead = links.filter((link) => !back.has(link))
  const incoming = new Map<string, SankeyLink[]>()
  for (const link of ahead) {
    const list = incoming.get(link.to)
    if (list) list.push(link)
    else incoming.set(link.to, [link])
  }

  const column = new Map<string, number>()
  const depth = (key: string, guard: Set<string>): number => {
    const known = column.get(key)
    if (known !== undefined) return known
    if (guard.has(key)) return 0
    guard.add(key)

    let deepest = 0
    for (const link of incoming.get(key) ?? []) deepest = Math.max(deepest, depth(link.from, guard) + 1)
    guard.delete(key)

    column.set(key, deepest)
    return deepest
  }
  for (const node of nodes) depth(node.key, new Set())

  return column
}

/** Orders each column so links cross as little as they can: medians, swept both ways. */
function orderColumns(
  nodes: readonly SankeyNode[],
  links: readonly SankeyLink[],
  columns: Map<string, number>,
  sweeps: number,
): string[][] {
  const depth = Math.max(0, ...columns.values())
  const order: string[][] = Array.from({ length: depth + 1 }, () => [])
  for (const node of nodes) order[columns.get(node.key) ?? 0].push(node.key)

  const rank = new Map<string, number>()
  const reindex = () => {
    for (const keys of order) for (const [i, key] of keys.entries()) rank.set(key, i)
  }
  reindex()

  const median = (key: string, side: 'in' | 'out'): number => {
    const neighbours = links
      .filter((link) => (side === 'in' ? link.to === key : link.from === key))
      .map((link) => rank.get(side === 'in' ? link.from : link.to))
      .filter((value): value is number => value !== undefined)
      .sort((a, b) => a - b)

    if (neighbours.length === 0) return rank.get(key) ?? 0
    const half = neighbours.length / 2
    return neighbours.length % 2
      ? neighbours[Math.floor(half)]
      : (neighbours[half - 1] + neighbours[half]) / 2
  }

  for (let sweep = 0; sweep < sweeps; sweep++) {
    const side = sweep % 2 === 0 ? 'in' : 'out'
    const range = side === 'in' ? order.keys() : [...order.keys()].reverse()
    for (const column of range) {
      const keys = order[column]
      const scored = keys.map((key) => ({ key, at: median(key, side) }))
      scored.sort((a, b) => a.at - b.at)
      order[column] = scored.map((entry) => entry.key)
      reindex()
    }
  }

  return order
}
