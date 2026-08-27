import { directionBetween, type Vec } from './geometry'

/**
 * Turning a belt path into a build plan when something is already in the way.
 *
 * `auto` does not go around obstacles — it goes under them. Each run of blocked tiles becomes
 * an underground pair: the last free tile before the run is the entry, the first free tile
 * after it is the exit, and everything between is left alone.
 */
export type RouteStep = 'belt' | 'in' | 'out' | 'skip'

export type RouteFailure =
  | { reason: 'starts-blocked'; at: Vec }
  | { reason: 'ends-blocked'; at: Vec }
  /** Two obstacles so close together that one tile would have to be both exit and entry. */
  | { reason: 'no-room'; at: Vec }
  | { reason: 'too-far'; at: Vec; needed: number }
  /** The path bends between the entry and the exit, which no underground pair can do. */
  | { reason: 'turns'; at: Vec }

export type RouteResult = { ok: true; steps: RouteStep[] } | ({ ok: false } & RouteFailure)

export function planRoute(path: Vec[], blocked: boolean[], reach: number): RouteResult {
  const steps: RouteStep[] = path.map(() => 'belt')
  let i = 0

  while (i < path.length) {
    if (!blocked[i]) {
      i++
      continue
    }

    let end = i
    while (end < path.length && blocked[end]) end++

    const entry = i - 1
    const exit = end

    if (entry < 0) return { ok: false, reason: 'starts-blocked', at: path[i] }
    if (exit >= path.length) return { ok: false, reason: 'ends-blocked', at: path[i] }
    // The tile before this run may already be the exit of the previous one.
    if (steps[entry] !== 'belt') return { ok: false, reason: 'no-room', at: path[entry] }

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
