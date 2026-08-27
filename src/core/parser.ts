import type { Arg, Expr, Module, Param, Stmt, TypeExpr } from './ast'
import { BLOCK_FORMS } from './ast'
import { fail, type Loc } from './errors'
import { tokenize, type Token } from './lexer'

/** Binary operator precedence, loosest first. */
const PRECEDENCE: Record<string, number> = {
  or: 1,
  and: 2,
  '==': 3,
  '!=': 3,
  '<': 4,
  '<=': 4,
  '>': 4,
  '>=': 4,
  '+': 5,
  '-': 5,
  '*': 6,
  '/': 6,
  '%': 6,
}

const RESERVED = new Set(['defblock', 'def', 'defaults', 'for', 'in', 'if', 'else', 'and', 'or', 'not', 'measure'])

class Parser {
  private pos = 0

  constructor(private readonly tokens: Token[]) {}

  // ── Token helpers ───────────────────────────────────────────────────────────

  private peek(offset = 0): Token {
    return this.tokens[Math.min(this.pos + offset, this.tokens.length - 1)]
  }

  private at(text: string, offset = 0): boolean {
    const token = this.peek(offset)
    return (token.kind === 'punct' || token.kind === 'ident') && token.text === text
  }

  private next(): Token {
    return this.tokens[this.pos++] ?? this.tokens[this.tokens.length - 1]
  }

  private expect(text: string, context: string): Token {
    if (!this.at(text)) {
      const found = this.peek()
      fail(
        `expected '${text}' ${context}, found ${found.kind === 'newline' ? 'end of line' : `'${found.text}'`}`,
        found.loc,
      )
    }
    return this.next()
  }

  private skipNewlines(): void {
    while (this.peek().kind === 'newline') this.pos++
  }

  /** After an operator or a comma, a line break is a continuation, not a terminator. */
  private skipSoftNewlines(): void {
    this.skipNewlines()
  }

  private startsExpression(offset = 0): boolean {
    const token = this.peek(offset)
    if (token.kind === 'number' || token.kind === 'string') return true
    if (token.kind === 'ident') return !RESERVED.has(token.text) || token.text === 'not' || token.text === 'measure'
    return token.kind === 'punct' && (token.text === '(' || token.text === '-')
  }

  // ── Module ──────────────────────────────────────────────────────────────────

  parseModule(): Module {
    const statements: Stmt[] = []
    this.skipNewlines()
    while (this.peek().kind !== 'eof') {
      statements.push(this.parseStatement())
      this.skipNewlines()
    }
    return { statements }
  }

  private parseBody(): Stmt[] {
    this.expect('{', 'to open a block')
    const statements: Stmt[] = []
    this.skipNewlines()
    while (!this.at('}') && this.peek().kind !== 'eof') {
      statements.push(this.parseStatement())
      this.skipNewlines()
    }
    this.expect('}', 'to close a block')
    return statements
  }

  private parseArrow(): Stmt[] {
    this.skipNewlines()
    this.expect('=>', 'before a block body')
    this.skipNewlines()
    return this.parseBody()
  }

  // ── Statements ──────────────────────────────────────────────────────────────

  private parseStatement(): Stmt {
    const token = this.peek()
    const loc = token.loc

    if (token.kind === 'ident') {
      switch (token.text) {
        case 'defblock':
          return this.parseDefblock()
        case 'def':
          return this.parseDef()
        case 'defaults':
          return this.parseDefaults()
        case 'for':
          return this.parseFor()
        case 'if':
          return this.parseIf()
      }

      if (BLOCK_FORMS.has(token.text) && this.isBlockForm()) {
        this.next()
        // `at (10, 4)` carries a coordinate, not an argument list, so read it as an expression.
        const args: Arg[] =
          token.text === 'at'
            ? [{ label: 'at', labelLoc: loc, value: this.parsePrimary(), loc }]
            : this.at('(')
              ? this.parseArgList()
              : []

        // `row for i in 0..n => { … }` folds the loop into the layout.
        let each: { name: string; iterable: Expr } | undefined
        if (token.text !== 'at' && this.at('for')) {
          this.next()
          const name = this.expectIdent('a loop variable')
          this.expect('in', 'in a for header')
          this.skipSoftNewlines()
          each = { name, iterable: this.parseExpr() }
        }

        const body = this.parseArrow()
        return { kind: 'block', form: token.text as 'at' | 'row' | 'column', args, each, body, loc }
      }

      const typed = this.tryParseTypedLocal()
      if (typed) return typed

      if (this.peek(1).kind === 'punct' && this.peek(1).text === '=') {
        const name = this.next().text
        this.next() // '='
        this.skipSoftNewlines()
        return { kind: 'assign', name, value: this.parseExpr(), loc }
      }
    }

    return { kind: 'expr', expr: this.parseExpr(), loc }
  }

  /** `at`, `row` and `column` are block forms only when a `=> {` follows their arguments. */
  private isBlockForm(): boolean {
    if (this.at('=>', 1)) return true
    if (this.at('for', 1)) return true
    if (!this.at('(', 1)) return false
    let depth = 0
    for (let i = 1; ; i++) {
      const token = this.peek(i)
      if (token.kind === 'eof') return false
      if (token.kind !== 'punct') continue
      if (token.text === '(') depth++
      else if (token.text === ')') {
        depth--
        if (depth === 0) return this.at('=>', i + 1) || this.at('for', i + 1)
      }
    }
  }

  /** `coord f = (…)` and `module[] m = ()` — a declared type in front of a local name. */
  private tryParseTypedLocal(): Stmt | null {
    const start = this.pos
    const loc = this.peek().loc
    if (this.peek().kind !== 'ident' || RESERVED.has(this.peek().text)) return null

    const typeName = this.peek().text
    const array = this.at('[]', 1)
    const nameIndex = array ? 2 : 1
    const eqIndex = nameIndex + 1

    if (this.peek(nameIndex).kind !== 'ident') return null
    if (!this.at('=', eqIndex)) return null

    this.pos = start + eqIndex + 1
    const type: TypeExpr = { name: typeName, array, loc }
    const name = this.tokens[start + nameIndex].text
    this.skipSoftNewlines()
    return { kind: 'assign', name, type, value: this.parseExpr(), loc }
  }

  private parseDefblock(): Stmt {
    const loc = this.next().loc
    const name = this.expectIdent('a block name')
    const params = this.parseParams()
    const body = this.parseArrow()
    return { kind: 'defblock', name, params, body, loc }
  }

  private parseDef(): Stmt {
    const loc = this.next().loc
    let type: TypeExpr | undefined
    // `def coord origin = (0, 0)` — the type is optional.
    if (this.peek().kind === 'ident' && (this.at('=', 1) === false) && this.peek(1).kind === 'ident') {
      const typeName = this.next().text
      type = { name: typeName, array: false, loc }
    } else if (this.peek().kind === 'ident' && this.at('[]', 1)) {
      const typeName = this.next().text
      this.next()
      type = { name: typeName, array: true, loc }
    }
    const name = this.expectIdent('a name after def')
    this.expect('=', 'in a def')
    this.skipSoftNewlines()
    return { kind: 'def', name, type, value: this.parseExpr(), loc }
  }

  private parseDefaults(): Stmt {
    const loc = this.next().loc
    let target: string | undefined
    let targetLoc: Loc | undefined
    if (this.peek().kind === 'ident' && !RESERVED.has(this.peek().text)) {
      targetLoc = this.peek().loc
      target = this.next().text
    }
    const args = this.parseArgList()
    const body = this.at('=>') || this.peek().kind === 'newline' ? undefined : undefined
    if (this.at('=>')) {
      return { kind: 'defaults', target, targetLoc, args, body: this.parseArrow(), loc }
    }
    return { kind: 'defaults', target, targetLoc, args, body, loc }
  }

  private parseFor(): Stmt {
    const loc = this.next().loc
    const name = this.expectIdent('a loop variable')
    this.expect('in', 'in a for statement')
    this.skipSoftNewlines()
    const iterable = this.parseExpr()
    const body = this.parseArrow()
    return { kind: 'for', name, iterable, body, loc }
  }

  private parseIf(): Stmt {
    const loc = this.next().loc
    const condition = this.parseExpr()
    const then = this.parseArrow()
    this.skipNewlines()
    if (this.at('else')) {
      this.next()
      return { kind: 'if', condition, then, else: this.parseArrow(), loc }
    }
    return { kind: 'if', condition, then, loc }
  }

  private expectIdent(what: string): string {
    const token = this.peek()
    if (token.kind !== 'ident') fail(`expected ${what}, found '${token.text || 'end of input'}'`, token.loc)
    return this.next().text
  }

  // ── Parameters ──────────────────────────────────────────────────────────────

  private parseParams(): Param[] {
    this.expect('(', 'to open a parameter list')
    const params: Param[] = []
    this.skipNewlines()

    while (!this.at(')') && this.peek().kind !== 'eof') {
      const loc = this.peek().loc
      const typeName = this.expectIdent('a parameter type')
      const array = this.at('[]')
      if (array) this.next()
      const name = this.expectIdent('a parameter name')

      let fallback: Expr | undefined
      if (this.at('=')) {
        this.next()
        this.skipSoftNewlines()
        fallback = this.parseExpr()
      }

      params.push({ type: { name: typeName, array, loc }, name, default: fallback, loc })
      if (this.at(',')) this.next()
      this.skipNewlines()
    }

    this.expect(')', 'to close a parameter list')
    return params
  }

  // ── Arguments ───────────────────────────────────────────────────────────────

  private parseArgList(): Arg[] {
    this.expect('(', 'to open an argument list')
    const args: Arg[] = []
    this.skipNewlines()

    while (!this.at(')') && this.peek().kind !== 'eof') {
      args.push(this.parseArg())
      this.skipNewlines()
      if (this.at(',')) {
        this.next()
        this.skipNewlines()
      }
    }

    this.expect(')', 'to close an argument list')
    return args
  }

  /**
   * `tier blue` is a label and its value; `blue` alone finds its slot from its type.
   * `repeat (4, x)` is ambiguous between the two, so both readings are recorded and the
   * checker picks whichever the callee actually has — a slot or a function in scope.
   */
  private parseArg(): Arg {
    const token = this.peek()

    if (token.kind === 'ident' && !RESERVED.has(token.text) && this.startsExpression(1)) {
      const labelLoc = token.loc
      const label = this.next().text
      const value = this.parseExpr()
      const arg: Arg = { label, labelLoc, value, loc: labelLoc }
      if (value.kind === 'tuple') {
        arg.asCall = { kind: 'call', callee: label, args: value.items.map((v) => ({ value: v, loc: v.loc })), loc: labelLoc }
      }
      return arg
    }

    const value = this.parseExpr()
    return { value, loc: value.loc }
  }

  // ── Expressions ─────────────────────────────────────────────────────────────

  parseExpr(minPrecedence = 0): Expr {
    let left = this.parseUnary()

    for (;;) {
      const token = this.peek()

      if (token.kind === 'punct' && token.text === '..' && minPrecedence === 0) {
        this.next()
        this.skipSoftNewlines()
        left = { kind: 'range', from: left, to: this.parseExpr(1), loc: left.loc }
        continue
      }

      const op = token.kind === 'punct' || token.kind === 'ident' ? token.text : ''
      const precedence = PRECEDENCE[op]
      if (precedence === undefined || precedence < minPrecedence) break

      this.next()
      this.skipSoftNewlines()
      const right = this.parseExpr(precedence + 1)
      left = { kind: 'binary', op, left, right, loc: token.loc }
    }

    return left
  }

  private parseUnary(): Expr {
    const token = this.peek()
    if ((token.kind === 'punct' && token.text === '-') || (token.kind === 'ident' && token.text === 'not')) {
      this.next()
      return { kind: 'unary', op: token.text, operand: this.parseUnary(), loc: token.loc }
    }
    return this.parsePostfix()
  }

  private parsePostfix(): Expr {
    let expr = this.parsePrimary()
    while (this.at('.')) {
      const loc = this.next().loc
      expr = { kind: 'field', target: expr, field: this.expectIdent('a field name'), loc }
    }
    return expr
  }

  private parsePrimary(): Expr {
    const token = this.peek()

    if (token.kind === 'number') {
      this.next()
      return { kind: 'number', value: Number(token.text), loc: token.loc }
    }

    if (token.kind === 'string') {
      this.next()
      return { kind: 'text', value: token.text, loc: token.loc }
    }

    if (token.kind === 'ident') {
      if (token.text === 'measure') {
        this.next()
        this.expect('(', 'after measure')
        this.skipNewlines()
        const body = this.parseExpr()
        this.skipNewlines()
        this.expect(')', 'to close measure')
        return { kind: 'measure', body, loc: token.loc }
      }
      if (RESERVED.has(token.text)) fail(`'${token.text}' cannot be used here`, token.loc)

      this.next()
      if (this.at('(')) {
        return { kind: 'call', callee: token.text, args: this.parseArgList(), loc: token.loc }
      }
      return { kind: 'name', name: token.text, loc: token.loc }
    }

    if (token.kind === 'punct' && token.text === '(') {
      this.next()
      this.skipNewlines()
      const items: Expr[] = []
      let sawComma = false
      while (!this.at(')') && this.peek().kind !== 'eof') {
        items.push(this.parseExpr())
        this.skipNewlines()
        if (this.at(',')) {
          sawComma = true
          this.next()
          this.skipNewlines()
        }
      }
      this.expect(')', 'to close a group')
      // A single value in parentheses is grouping; anything else builds a tuple.
      if (items.length === 1 && !sawComma) return items[0]
      return { kind: 'tuple', items, loc: token.loc }
    }

    fail(
      token.kind === 'newline' ? 'unexpected end of line' : `unexpected '${token.text || 'end of input'}'`,
      token.loc,
    )
  }
}

export function parse(source: string): Module {
  return new Parser(tokenize(source)).parseModule()
}
