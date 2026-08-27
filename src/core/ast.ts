import type { Loc } from './errors'

// ── Types as written in source ────────────────────────────────────────────────

export interface TypeExpr {
  name: string
  array: boolean
  loc: Loc
}

// ── Expressions ───────────────────────────────────────────────────────────────

export type Expr =
  | { kind: 'number'; value: number; loc: Loc }
  | { kind: 'text'; value: string; loc: Loc }
  | { kind: 'name'; name: string; loc: Loc }
  | { kind: 'tuple'; items: Expr[]; loc: Loc }
  | { kind: 'binary'; op: string; left: Expr; right: Expr; loc: Loc }
  | { kind: 'unary'; op: string; operand: Expr; loc: Loc }
  | { kind: 'range'; from: Expr; to: Expr; loc: Loc }
  | { kind: 'field'; target: Expr; field: string; loc: Loc }
  | { kind: 'call'; callee: string; args: Arg[]; loc: Loc }
  | { kind: 'measure'; body: Expr; loc: Loc }

/** `recipe r` is labelled; `north` is bare and finds its slot by type. */
export interface Arg {
  label?: string
  labelLoc?: Loc
  value: Expr
  /**
   * `repeat (4, x)` reads either as the label `repeat` with a tuple, or as a call.
   * The parser records both and the checker keeps whichever the callee supports.
   */
  asCall?: Expr
  /**
   * When the value was parenthesised, the arguments as written — which keeps the pairing in
   * `content (iron-ore left, coal right)` that a flat tuple would lose.
   */
  entries?: Arg[]
  loc: Loc
}

// ── Statements ────────────────────────────────────────────────────────────────

export interface Param {
  type: TypeExpr
  name: string
  default?: Expr
  loc: Loc
}

export type Stmt =
  | { kind: 'defblock'; name: string; params: Param[]; body: Stmt[]; loc: Loc }
  | { kind: 'def'; name: string; type?: TypeExpr; value: Expr; loc: Loc }
  | { kind: 'assign'; name: string; type?: TypeExpr; value: Expr; loc: Loc }
  | { kind: 'defaults'; target?: string; targetLoc?: Loc; args: Arg[]; body?: Stmt[]; loc: Loc }
  | { kind: 'for'; name: string; iterable: Expr; body: Stmt[]; loc: Loc }
  | { kind: 'if'; condition: Expr; then: Stmt[]; else?: Stmt[]; loc: Loc }
  | {
      kind: 'block'
      form: 'at' | 'row' | 'column'
      args: Arg[]
      /** `row for i in 0..n => { … }` — one layout item per pass. */
      each?: { name: string; iterable: Expr }
      body: Stmt[]
      loc: Loc
    }
  | { kind: 'expr'; expr: Expr; loc: Loc }

export interface Module {
  statements: Stmt[]
}

/** Statement-level forms that take a `=> { … }` body. */
export const BLOCK_FORMS = new Set(['at', 'row', 'column'])
