import { decodePlan, encodePlan, type NodeConfig, type SharedPlan, type Target } from '../core'

/**
 * What the calculator remembers: what you asked for, and every choice you have made about how
 * to make it. Kept in this browser and nowhere else, the same shelf the studio uses.
 *
 * The dataset id is part of it because a plan is written in the vocabulary of one version;
 * carrying a Space Age recipe into 1.1 would name things that are not there.
 */

const KEY = 'fbl.calc'

/**
 * The recycling tab's setup: what you are farming and the one assembler-and-recycler pair that
 * stands for every rung of the ladder.
 */
/** One machine on one rung. Modules are per slot, exactly as they are on a production node. */
export interface QualitySide {
  machine?: string
  quality?: string
  modules?: Array<{ name: string; quality?: string }>
}

/** Reads a rung's settings, whether or not it has any. */
export const rungOf = (held: Record<string, QualitySide>, tier: string): QualitySide => held[tier] ?? {}

/** Writes one rung, dropping the entry when it goes back to saying nothing. */
export function setRung(
  held: Record<string, QualitySide>,
  tier: string,
  patch: Partial<QualitySide>,
): void {
  const next: QualitySide = { ...rungOf(held, tier), ...patch }
  for (const key of Object.keys(next) as Array<keyof QualitySide>) {
    if (next[key] === undefined) delete next[key]
  }
  if (Object.keys(next).length === 0) delete held[tier]
  else held[tier] = next
}

export interface QualitySettings {
  item: string
  /** Which recipe makes it, where there is a choice. */
  recipe?: string
  base: string
  target: string
  /**
   * What stands on each rung, by quality, and only where it differs from the obvious. A rung
   * nobody has touched runs the best machine that can do the job with nothing in it, which is
   * why these are sparse rather than five entries filled in up front.
   */
  crafters: Record<string, QualitySide>
  recyclers: Record<string, QualitySide>
  /** Which end is fixed; the other is worked out from it. */
  by: 'machines' | 'output'
  /** Assemblers on the bottom rung, when that is the end being held. */
  machines: number
  /** Items of the target quality a minute, which is how anyone says it out loud. */
  output: number
}

export type CalcMode = 'production' | 'recycling'

export interface CalcState extends SharedPlan {
  mode: CalcMode
  quality: QualitySettings
  /** Where you were looking. Yours alone — it does not travel in a shared link. */
  view: { x: number; y: number; scale: number }
}

export function emptyQuality(): QualitySettings {
  return {
    item: '',
    base: 'normal',
    target: 'legendary',
    crafters: {},
    recyclers: {},
    by: 'machines',
    machines: 10,
    output: 60,
  }
}

export function emptyState(version: string): CalcState {
  return {
    mode: 'production',
    quality: emptyQuality(),
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

  const base = emptyState(fallbackVersion)
  return {
    ...base,
    ...shared,
    // The link carries these loosely typed, so they are narrowed on the way back in rather
    // than trusted: a link is text somebody could have edited.
    mode: shared.mode === 'recycling' ? 'recycling' : 'production',
    quality: shared.quality
      ? {
          ...base.quality,
          ...shared.quality,
          by: shared.quality.by === 'output' ? 'output' : 'machines',
          crafters: shared.quality.crafters ?? {},
          recyclers: shared.quality.recyclers ?? {},
        }
      : base.quality,
  }
}

/**
 * Writes the plan into the fragment, replacing rather than pushing: a plan is edited a
 * hundred times in a sitting and none of those are places to go back to. The fragment never
 * leaves the browser, so a plan is not something an access log somewhere collects.
 */
export function writeLink(state: CalcState): string {
  // Either tab is worth a link once it has something in it; the recycling one has no targets
  // and asking about those alone left it unshareable.
  const worth = state.targets.length > 0 || state.quality.item !== ''
  const link = worth ? `#${encodePlan(state)}` : ''
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
      mode: held.mode === 'recycling' ? 'recycling' : 'production',
      quality: { ...base.quality, ...(held.quality ?? {}) },
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
