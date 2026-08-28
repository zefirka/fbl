import { parse } from './parser'
import type { Stmt } from './ast'

/**
 * The libraries `import` can bring in.
 *
 * A module is fbl source that defines blocks, plus the native helpers it unlocks — things the
 * interpreter implements itself because they expand into a hundred entities from a data file,
 * which no amount of fbl would express better. Both arrive together: `import "stdlib"` puts
 * `balancer` and `side-buffer` in scope and neither before it.
 *
 * The source lives here as text rather than beside the examples because core has no bundler
 * of its own: the same file has to work in Vite, in esbuild's Node build and in the tests.
 */
export interface ModuleDef {
  source: string
  /** Helpers the interpreter provides, gated on this module being imported. */
  helpers?: string[]
}

const STDLIB = `
; ─────────────────────────────────────────────────────────────────────────────
; fbl standard library.  import "stdlib"
;
; Also unlocks \`balancer\`, which the interpreter expands from a library of
; ready-made blueprints rather than from source.
; ─────────────────────────────────────────────────────────────────────────────

; A row of boxes with an inserter between each neighbouring pair, one feeding the
; first box and one drawing out of the last. The boxes decide their own spacing,
; so it holds for a chest, a tank or anything else you hand it.
defblock side-buffer (entity inserter = bulk-inserter, entity box = steel-chest, int size = 2) => {
  if size < 2 => { throw "size must be at least 2" }

  def w = measure (box ()).width

  inserter (at (0, 0), south)

  row (gap 0) for i in 0..size => {
    box (at (0, 1))
    if i < size - 1 => { inserter (at (w, 1), east) }
  }

  ; Each pass is w wide plus the inserter that follows it; the last box has none.
  inserter (at ((size - 1) * (w + 1), 0), north)
}

; A chain along one line: an inserter, a box, an inserter, a box, and an inserter
; on the end to draw out of the last one. Items are handed along it rather than
; buffered off to the side.
defblock line-buffer (entity box = steel-chest, entity inserter = bulk-inserter, int size = 1) => {
  if size < 1 => { throw "size must be at least 1" }

  def w = measure (box ()).width

  row for i in 0..size => {
    row => {
      inserter (east)
      box ()
    }
  }

  ; Each pass is an inserter and a box; the last one still needs somewhere to go.
  inserter (at (size * (w + 1), 0), east)
}
`

export const MODULES: Record<string, ModuleDef> = {
  stdlib: { source: STDLIB, helpers: ['balancer'] },
}

export const MODULE_NAMES = Object.keys(MODULES)

/** Helpers that exist only once something has imported them. */
export const GATED_HELPERS = new Set(Object.values(MODULES).flatMap((module) => module.helpers ?? []))

const parsed = new Map<string, Stmt[]>()

/** A module's statements, parsed once. Its source is ours, so a failure here is a bug. */
export function moduleStatements(name: string): Stmt[] {
  const cached = parsed.get(name)
  if (cached) return cached

  const statements = parse(MODULES[name].source).statements
  parsed.set(name, statements)
  return statements
}

const origins = new Map<string, string>()

/**
 * Which module a name comes from, for the sake of saying so. Without this, using `balancer`
 * or `side-buffer` before importing them reads as an ordinary typo.
 */
export function moduleOffering(name: string): string | undefined {
  if (origins.size === 0) {
    for (const [module, def] of Object.entries(MODULES)) {
      for (const helper of def.helpers ?? []) origins.set(helper, module)
      for (const statement of moduleStatements(module)) {
        if (statement.kind === 'defblock') origins.set(statement.name, module)
      }
    }
  }
  return origins.get(name)
}
