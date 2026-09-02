import { directionBetween, type Vec } from './geometry'

/**
 * Turning a belt path into a build plan when something is already in the way.
 *
 * `auto` does not go around obstacles — it goes under them. Each run of blocked tiles becomes
 * an underground pair: the tile before the run is the entry, the tile after it is the exit,
 * and everything between is left alone.
 *
 * Obstacles standing a single tile apart are covered by one longer tunnel rather than two.
 * That lone tile has nowhere to go: it would have to be the exit of one pair and the entry of
 * the next at the same time, so the belt stays under it and surfaces past the far obstacle.
 *
 * Not everything standing on the path is an obstacle. A splitter, belt or tunnel already
 * running the way this belt is heading is part of the same line: the belt joins it and comes
 * out the other side. And because it is the same line, a plain belt already on the path can
 * *become* a tunnel end — a line has to have somewhere to dive from, and on a lane that
 * already carries one there would otherwise be nowhere at all. A splitter cannot: it is a
 * thing in its own right rather than a stretch of belt.
 */
export type RouteStep = 'belt' | 'in' | 'out' | 'skip'

/** What the belt finds on a tile. */
export type TileState =
  /** Nothing. */
  | 'free'
  /** A plain belt going our way: merged into, and ours to take for a tunnel end. */
  | 'line'
  /** A splitter or tunnel end going our way: merged into, but not ours to take. */
  | 'joint'
  /** Anything else — the belt has to go under it. */
  | 'blocked'

export type RouteFailure =
  | { reason: 'starts-blocked'; at: Vec }
  | { reason: 'ends-blocked'; at: Vec }
  | { reason: 'too-far'; at: Vec; needed: number }
  /** The path bends between the entry and the exit, which no underground pair can do. */
  | { reason: 'turns'; at: Vec }

export type RouteResult = { ok: true; steps: RouteStep[] } | ({ ok: false } & RouteFailure)

/** Whether a tunnel may start or end here: empty ground, or belt this line can take over. */
const usableEnd = (state: TileState) => state === 'free' || state === 'line'

export function planRoute(path: Vec[], tiles: TileState[], reach: number): RouteResult {
  const steps: RouteStep[] = path.map(() => 'belt')
  let i = 0

  while (i < path.length) {
    if (tiles[i] !== 'blocked') {
      // Already carrying this line: leave what is there and carry on.
      if (tiles[i] !== 'free') steps[i] = 'skip'
      i++
      continue
    }

    // Everything this one tunnel has to clear. A usable tile is no good as an exit when the
    // next obstacle needs a tunnel of its own — it would have to be an entry at the same time
    // — so the tunnel swallows it and carries on to the far side.
    let end = i
    for (;;) {
      while (end < path.length && !usableEnd(tiles[end])) end++
      if (end + 1 < path.length && tiles[end + 1] === 'blocked') {
        end += 1
        continue
      }
      break
    }

    const entry = i - 1
    const exit = end

    if (entry < 0 || !usableEnd(tiles[entry])) return { ok: false, reason: 'starts-blocked', at: path[i] }
    if (exit >= path.length) return { ok: false, reason: 'ends-blocked', at: path[i] }

    const covered = exit - entry - 1
    if (covered > reach) return { ok: false, reason: 'too-far', at: path[i], needed: covered }

    // An underground pair is a straight line; the path must not bend while it is under.
    const straight = directionBetween(path[entry], path[exit])
    const heading = directionBetween(path[entry], path[entry + 1])
    if (straight === undefined || straight !== heading) {
      return { ok: false, reason: 'turns', at: path[i] }
    }

    steps[entry] = 'in'
    steps[exit] = 'out'
    for (let k = i; k < end; k++) steps[k] = 'skip'

    i = exit + 1
  }

  return { ok: true, steps }
}
