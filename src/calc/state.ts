import { decodePlan, encodePlan, type NodeConfig, type SharedPlan, type Target } from '../core'

/**
 * What the calculator remembers: what you asked for, and every choice you have made about how
 * to make it. Kept in this browser and nowhere else, the same shelf the studio uses.
 *
 * The dataset id is part of it because a plan is written in the vocabulary of one version;
 * carrying a Space Age recipe into 1.1 would name things that are not there.
 */

const KEY = 'fbl.calc'

export interface CalcState extends SharedPlan {
  /** Where you were looking. Yours alone — it does not travel in a shared link. */
  view: { x: number; y: number; scale: number }
}

export function emptyState(version: string): CalcState {
  return {
    version,
    targets: [],
    choice: {},
    extra: {},
    frontier: {},
    nodes: {},
    belt: 'transport-belt',
    view: { x: 0, y: 0, scale: 1 },
  }
}

/**
 * The plan in the address bar, when there is one.
 *
 * A link beats what is in this browser: someone who follows one is asking to see that plan,
 * not the one they were last looking at. Their own is not lost — it is still in storage, and
 * clearing the link brings it back.
 */
export function readLink(fallbackVersion: string): CalcState | undefined {
  const shared = decodePlan(window.location.hash.replace(/^#/, ''))
  if (!shared) return undefined
  return { ...emptyState(fallbackVersion), ...shared }
}

/**
 * Writes the plan into the fragment, replacing rather than pushing: a plan is edited a
 * hundred times in a sitting and none of those are places to go back to. The fragment never
 * leaves the browser, so a plan is not something an access log somewhere collects.
 */
export function writeLink(state: CalcState): string {
  const link = state.targets.length ? `#${encodePlan(state)}` : ''
  try {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${link}`)
  } catch {
    // Some browsers refuse this on a file:// page; the plan is still in storage.
  }
  return link
}

export function readState(fallbackVersion: string): CalcState {
  try {
    const raw = window.localStorage.getItem(KEY)
    const held = raw ? (JSON.parse(raw) as Partial<CalcState>) : null
    if (!held || typeof held !== 'object') return emptyState(fallbackVersion)

    const base = emptyState(held.version ?? fallbackVersion)
    return {
      ...base,
      ...held,
      targets: (held.targets ?? []).filter(isTarget),
      choice: held.choice ?? {},
      extra: held.extra ?? {},
      frontier: held.frontier ?? {},
      nodes: held.nodes ?? {},
      view: { ...base.view, ...(held.view ?? {}) },
    }
  } catch {
    // A browser with storage switched off, or something that is not ours in the slot.
    return emptyState(fallbackVersion)
  }
}

export function writeState(state: CalcState): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    // Nothing to be done, and nothing worth interrupting anyone over.
  }
}

const isTarget = (value: unknown): value is Target =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as Target).item === 'string' &&
  Number.isFinite((value as Target).rate)

/** Reads a node's settings, whether or not it has any yet. */
export const settingsOf = (state: CalcState, recipe: string): NodeConfig => state.nodes[recipe] ?? {}

/** Writes one node's settings, dropping the entry when it goes back to saying nothing. */
export function setNode(state: CalcState, recipe: string, patch: Partial<NodeConfig>): void {
  const next: NodeConfig = { ...settingsOf(state, recipe), ...patch }
  for (const key of Object.keys(next) as Array<keyof NodeConfig>) {
    if (next[key] === undefined) delete next[key]
  }
  if (Object.keys(next).length === 0) delete state.nodes[recipe]
  else state.nodes[recipe] = next
}
