import { directionBetween, type Vec } from './geometry'

/**
 * Turning a belt path into a build plan when something is already in the way.
 *
 * `auto` does not go around obstacles — it goes under them. Each run of blocked tiles becomes
 * an underground pair: the last free tile before the run is the entry, the first free tile
 * after it is the exit, and everything between is left alone.
 *
 * Obstacles standing a single tile apart are covered by one longer tunnel rather than two.
 * That lone tile has nowhere to go: it would have to be the exit of one pair and the entry of
 * the next at the same time, so the belt stays under it and surfaces past the far obstacle.
 *
 * Not everything standing on the path is an obstacle. A splitter, belt or tunnel already
 * running the way this belt is heading is part of the same line: the belt joins it and comes
 * out the other side, which is why a splitter can be dropped into a run without the belt
 * diving around it.
 */
export type RouteStep = 'belt' | 'in' | 'out' | 'skip'

/**
 * What the belt finds on a tile: nothing, something it flows through, or something it has to
 * go under.
 */
export type TileState = 'free' | 'through' | 'blocked'

export type RouteFailure =
  | { reason: 'starts-blocked'; at: Vec }
  | { reason: 'ends-blocked'; at: Vec }
  | { reason: 'too-far'; at: Vec; needed: number }
  /** The path bends between the entry and the exit, which no underground pair can do. */
  | { reason: 'turns'; at: Vec }

export type RouteResult = { ok: true; steps: RouteStep[] } | ({ ok: false } & RouteFailure)

export function planRoute(path: Vec[], tiles: TileState[], reach: number): RouteResult {
  const steps: RouteStep[] = path.map(() => 'belt')

  /** The end of the run of occupied tiles starting at `from`, and whether it needs a tunnel. */
  const runFrom = (from: number) => {
    let end = from
    let tunnel = false
    while (end < path.length && tiles[end] !== 'free') {
      tunnel ||= tiles[end] === 'blocked'
      end++
    }
    return { end, tunnel }
  }

  let i = 0

  while (i < path.length) {
    if (tiles[i] === 'free') {
      i++
      continue
    }

    const run = runFrom(i)

    // Nothing here but line already going our way — the belt joins it and carries on.
    if (!run.tunnel) {
      for (let k = i; k < run.end; k++) steps[k] = 'skip'
      i = run.end
      continue
    }

    // Everything this one tunnel has to clear. A free tile is no use as an exit when the next
    // obstacle needs a tunnel of its own: it would have to be an entry at the same time. So
    // the tunnel swallows it and carries on to the far side.
    let end = run.end
    for (;;) {
      const next = end + 1 < path.length ? runFrom(end + 1) : null
      if (next?.tunnel) {
        end = next.end
        continue
      }
      break
    }

    const entry = i - 1
    const exit = end

    if (entry < 0) return { ok: false, reason: 'starts-blocked', at: path[i] }
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
