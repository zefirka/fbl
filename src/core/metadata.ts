import type { Arg } from './ast'
import type { Loc } from './errors'

/**
 * Reading the shapes that are written as `label (…)` — belt and chest contents, and inserter
 * filters. The parser keeps the pairing inside those brackets; this turns it into something
 * the checker can validate and the interpreter can store, and both go through here so they
 * cannot disagree about what was written.
 *
 * Names are not checked here. The checker owns that, because it is the one holding the
 * vocabulary, and by the time the interpreter runs it has already had its say.
 */

export interface RawContent {
  item: string
  /** Absent on a chest entry, where there is no side to name. */
  side?: string
  loc?: Loc
}

export interface RawFilters {
  items: Array<{ name: string; loc?: Loc }>
  /** Factorio's blacklist mode, written as `not`. */
  negated: boolean
}

export interface ReadError {
  message: string
  loc?: Loc
  hint?: string
}

export type Read<T> = { ok: true; value: T } | { ok: false; error: ReadError }

const fail = (message: string, loc?: Loc, hint?: string): Read<never> => ({ ok: false, error: { message, loc, hint } })

function bracketed(arg: Arg, what: string): Read<Arg[]> {
  if (!arg.entries) {
    return fail(`${what} needs its own brackets`, arg.loc, `write it as ${what} (…)`)
  }
  return { ok: true, value: arg.entries }
}

/** `content (iron-ore left, coal right)`, or on a chest `content (iron-plate, copper-plate)`. */
export function readContent(arg: Arg): Read<RawContent[]> {
  const bracket = bracketed(arg, 'content')
  if (!bracket.ok) return bracket

  const entries: RawContent[] = []
  for (const entry of bracket.value) {
    if (entry.label !== undefined) {
      if (entry.value.kind !== 'name') {
        return fail(`'${entry.label}' should be followed by a side`, entry.loc, 'left or right')
      }
      entries.push({ item: entry.label, side: entry.value.name, loc: entry.labelLoc ?? entry.loc })
      continue
    }
    if (entry.value.kind !== 'name') {
      return fail('content lists items', entry.loc, 'content (iron-ore left, coal right)')
    }
    entries.push({ item: entry.value.name, loc: entry.loc })
  }

  return { ok: true, value: entries }
}

/** `filter (copper-plate, copper-ore)` or `filter (not copper-plate, copper-ore)`. */
export function readFilters(arg: Arg): Read<RawFilters> {
  const bracket = bracketed(arg, 'filter')
  if (!bracket.ok) return bracket

  const items: Array<{ name: string; loc?: Loc }> = []
  let negated = false

  for (const [index, entry] of bracket.value.entries()) {
    if (entry.label !== undefined) {
      return fail(`filter lists items, not '${entry.label} …'`, entry.labelLoc ?? entry.loc)
    }

    // `not` leads the list and turns the whole thing into a blacklist, the way the game
    // holds it: one mode for the inserter, not one per item.
    let value = entry.value
    if (value.kind === 'unary' && value.op === 'not') {
      if (index > 0) {
        return fail(
          `'not' goes in front of the whole list`,
          entry.loc,
          'a filter is a whitelist or a blacklist, so write it once: filter (not copper-plate, copper-ore)',
        )
      }
      negated = true
      value = value.operand
    }
    if (value.kind !== 'name') return fail('filter lists items', entry.loc, 'filter (copper-plate, copper-ore)')
    items.push({ name: value.name, loc: entry.loc })
  }

  if (!items.length) return fail('filter needs at least one item', arg.loc, 'filter (copper-plate)')

  return { ok: true, value: { items, negated } }
}
