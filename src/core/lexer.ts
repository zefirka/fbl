import { fail, type Loc } from './errors'

export type TokenKind = 'ident' | 'number' | 'string' | 'punct' | 'newline' | 'eof'

export interface Token {
  kind: TokenKind
  text: string
  loc: Loc
}

/** Longest first, so `=>` wins over `=` and `..` over `.`. */
// prettier-ignore
const PUNCTUATION = [
  '=>', '==', '!=', '<=', '>=', '..', '[]',
  '(', ')', '{', '}', '[', ']', ',', '=', '.', '+', '-', '*', '/', '%', '<', '>', '?', ':',
]

/**
 * A comma is optional between arguments, but it is not whitespace: it is what separates
 * `(north, blue)` — two bare values — from `(tier blue)` — a label and its value.
 */

const IDENT_START = /[A-Za-z_]/
const IDENT_REST = /[A-Za-z0-9_?!-]/

export function tokenize(source: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  let line = 1
  let col = 1
  /**
   * Newlines end a statement, but only outside `(...)`, so an argument list may wrap.
   * Braces do not suppress them: their contents are statements.
   */
  let parenDepth = 0

  const here = (): Loc => ({ line, col })
  const advance = (n = 1) => {
    for (let k = 0; k < n; k++) {
      if (source[i] === '\n') {
        line++
        col = 1
      } else {
        col++
      }
      i++
    }
  }
  const push = (kind: TokenKind, text: string, loc: Loc) => tokens.push({ kind, text, loc })

  while (i < source.length) {
    const ch = source[i]

    if (ch === '\n') {
      const loc = here()
      advance()
      // Collapse runs of blank lines, and drop leading newlines entirely.
      if (parenDepth === 0 && tokens.length > 0 && tokens[tokens.length - 1].kind !== 'newline') {
        push('newline', '\n', loc)
      }
      continue
    }

    if (ch === ' ' || ch === '\t' || ch === '\r') {
      advance()
      continue
    }

    if (ch === ';') {
      while (i < source.length && source[i] !== '\n') advance()
      continue
    }

    if (ch === '"') {
      const loc = here()
      advance()
      let text = ''
      while (i < source.length && source[i] !== '"') {
        if (source[i] === '\\') {
          const escape = source[i + 1]
          text += escape === 'n' ? '\n' : escape === 't' ? '\t' : (escape ?? '')
          advance(2)
        } else {
          text += source[i]
          advance()
        }
      }
      if (i >= source.length) fail('unterminated string', loc)
      advance()
      push('string', text, loc)
      continue
    }

    if (/[0-9]/.test(ch)) {
      const loc = here()
      let text = ''
      while (i < source.length && /[0-9]/.test(source[i])) {
        text += source[i]
        advance()
      }
      // A dot is only a decimal point when a digit follows; `0..4` stays a range.
      if (source[i] === '.' && /[0-9]/.test(source[i + 1] ?? '')) {
        text += '.'
        advance()
        while (i < source.length && /[0-9]/.test(source[i])) {
          text += source[i]
          advance()
        }
      }
      push('number', text, loc)
      continue
    }

    if (IDENT_START.test(ch)) {
      const loc = here()
      let text = ''
      while (i < source.length && IDENT_REST.test(source[i])) {
        text += source[i]
        advance()
      }
      push('ident', text, loc)
      continue
    }

    const punct = PUNCTUATION.find((p) => source.startsWith(p, i))
    if (punct) {
      const loc = here()
      if (punct === '(') parenDepth++
      if (punct === ')') parenDepth = Math.max(0, parenDepth - 1)
      advance(punct.length)
      push('punct', punct, loc)
      continue
    }

    fail(`unexpected character '${ch}'`, here())
  }

  if (tokens.length && tokens[tokens.length - 1].kind === 'newline') tokens.pop()
  push('eof', '', here())
  return tokens
}
