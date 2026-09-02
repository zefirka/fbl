import type { Arg, Expr, Module, Stmt } from './ast'
import type { Loc } from './errors'

/**
 * Where every name that stands for an argument is written.
 *
 * The editor paints these apart from everything else, because a slot name and a value sit side
 * by side with nothing but a space between them: `recipe iron-gear-wheel` is one label and one
 * value, and until they are told apart the eye has to parse the line to know which is which.
 * Both halves of the story count — the parameter in `defblock cell (int n)` and the label in
 * `cell (n 3)` — so the two read as the same thing wherever they appear.
 *
 * It works off the syntax tree rather than a list of known slot names, so a block's own
 * parameters light up exactly like the built-in ones. `isCallable` settles the one ambiguity
 * the parser cannot: `width (x)` reads exactly like a label with a bracketed value, and only
 * knowing what can be called tells a nested call from a slot.
 */
export interface LabelSpan {
  loc: Loc
  length: number
}

export function labelSpans(module: Module, isCallable: (name: string) => boolean): LabelSpan[] {
  const spans: LabelSpan[] = []

  const arg = (node: Arg): void => {
    const nested = node.asCall !== undefined && node.label !== undefined && isCallable(node.label)
    if (node.label !== undefined && node.labelLoc && !nested) {
      spans.push({ loc: node.labelLoc, length: node.label.length })
    }
    for (const entry of node.entries ?? []) arg(entry)
    expr(node.value)
  }

  const expr = (node: Expr): void => {
    switch (node.kind) {
      case 'call':
        for (const a of node.args) arg(a)
        return
      case 'tuple':
        for (const item of node.items) expr(item)
        return
      case 'binary':
        expr(node.left)
        expr(node.right)
        return
      case 'unary':
        expr(node.operand)
        return
      case 'ternary':
        expr(node.condition)
        expr(node.then)
        expr(node.otherwise)
        return
      case 'range':
        expr(node.from)
        expr(node.to)
        return
      case 'field':
        expr(node.target)
        return
      case 'index':
        expr(node.target)
        expr(node.index)
        return
      case 'measure':
        expr(node.body)
        return
      default:
    }
  }

  const statement = (node: Stmt): void => {
    switch (node.kind) {
      case 'defblock':
        for (const param of node.params) {
          spans.push({ loc: param.nameLoc, length: param.name.length })
          if (param.default) expr(param.default)
        }
        node.body.forEach(statement)
        return
      case 'defrecord':
        // A field is a parameter in every way that matters, including how it is written at
        // the other end, so it is painted the same.
        for (const field of node.fields) {
          spans.push({ loc: field.nameLoc, length: field.name.length })
          if (field.default) expr(field.default)
        }
        return
      case 'defaults':
        for (const a of node.args) arg(a)
        node.body?.forEach(statement)
        return
      case 'block':
        for (const a of node.args) arg(a)
        if (node.each) expr(node.each.iterable)
        node.body.forEach(statement)
        return
      case 'for':
        expr(node.iterable)
        node.body.forEach(statement)
        return
      case 'if':
        expr(node.condition)
        node.then.forEach(statement)
        node.else?.forEach(statement)
        return
      case 'def':
      case 'assign':
        expr(node.value)
        return
      case 'throw':
        expr(node.value)
        return
      case 'expr':
        expr(node.expr)
        return
      default:
    }
  }

  module.statements.forEach(statement)
  return spans
}
