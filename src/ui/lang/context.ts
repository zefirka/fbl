/**
 * Where the cursor is, in terms the completion provider can act on.
 *
 * The analysis is a forward scan that keeps a stack of open parentheses, each remembering
 * the identifier in front of it. That is enough to tell `assembling-machine-3 (recipe |`
 * from `assembling-machine-3 (at (0, |`, which a backward scan gets wrong.
 */
export type Context =
  | { kind: 'statement'; prefix: string }
  | { kind: 'slot'; callee: string; prefix: string }
  | { kind: 'value'; callee: string; slot: string; prefix: string }
  | { kind: 'param-type'; prefix: string }
  | { kind: 'defaults-slot'; prefix: string }
  | { kind: 'defaults-target'; prefix: string }
  | { kind: 'none' }

interface Token {
  kind: 'ident' | 'number' | 'punct' | 'string'
  text: string
}

const IDENT = /[A-Za-z_][A-Za-z0-9_?!-]*/y
const NUMBER = /\d+(\.\d+)?/y
const PUNCT = /=>|==|!=|<=|>=|\.\.|\[\]|[()[\]{},=.+\-*/%<>]/y

/** Tolerant of anything, including half-typed strings — it runs on every keystroke. */
function tokenize(text: string): Token[] {
  const tokens: Token[] = []
  let i = 0

  while (i < text.length) {
    const ch = text[i]

    if (ch === ';') {
      while (i < text.length && text[i] !== '\n') i++
      continue
    }
    if (ch === '"') {
      i++
      while (i < text.length && text[i] !== '"') i += text[i] === '\\' ? 2 : 1
      i++
      tokens.push({ kind: 'string', text: '""' })
      continue
    }
    if (/\s/.test(ch)) {
      i++
      continue
    }

    IDENT.lastIndex = i
    const ident = IDENT.exec(text)
    if (ident) {
      tokens.push({ kind: 'ident', text: ident[0] })
      i = IDENT.lastIndex
      continue
    }

    NUMBER.lastIndex = i
    const number = NUMBER.exec(text)
    if (number) {
      tokens.push({ kind: 'number', text: number[0] })
      i = NUMBER.lastIndex
      continue
    }

    PUNCT.lastIndex = i
    const punct = PUNCT.exec(text)
    if (punct) {
      tokens.push({ kind: 'punct', text: punct[0] })
      i = PUNCT.lastIndex
      continue
    }

    i++
  }

  return tokens
}

interface Frame {
  /** The identifier immediately in front of this `(`. */
  callee: string | null
  /** The one before that, which tells `defblock cell (` from `cell (`. */
  before: string | null
}

export interface Vocabulary {
  /** Names that can head a call: entities, blocks, helpers, layout forms. */
  isCallable: (name: string) => boolean
  /** Slot names the given callee accepts, or null when the callee is unknown. */
  slotsOf: (callee: string) => string[] | null
}

export function analyze(text: string, offset: number, vocabulary: Vocabulary): Context {
  const upto = text.slice(0, offset)
  const prefix = /[A-Za-z0-9_?!-]*$/.exec(upto)?.[0] ?? ''
  const tokens = tokenize(upto.slice(0, upto.length - prefix.length))

  const stack: Frame[] = []
  let previous: Token | null = null
  let beforePrevious: Token | null = null

  for (const token of tokens) {
    if (token.kind === 'punct' && token.text === '(') {
      stack.push({
        callee: previous?.kind === 'ident' ? previous.text : null,
        before: beforePrevious?.kind === 'ident' ? beforePrevious.text : null,
      })
    } else if (token.kind === 'punct' && token.text === ')') {
      stack.pop()
    }
    beforePrevious = previous
    previous = token
  }

  const last = tokens[tokens.length - 1] ?? null
  const frame = stack[stack.length - 1]

  if (!frame) {
    // `defaults ` at statement level wants an entity or a family to narrow to.
    if (last?.kind === 'ident' && last.text === 'defaults') return { kind: 'defaults-target', prefix }
    return { kind: 'statement', prefix }
  }

  if (frame.before === 'defblock') {
    // Parameter lists alternate `type name`; only the type position is completable.
    const atTypePosition = last?.kind === 'punct' && (last.text === '(' || last.text === ',')
    return atTypePosition ? { kind: 'param-type', prefix } : { kind: 'none' }
  }

  if (frame.callee === 'defaults' || frame.before === 'defaults') {
    const slots = ['tier', 'quality', 'dir', 'recipe', 'modules', 'gap', 'align', 'route']
    if (last?.kind === 'ident' && slots.includes(last.text)) {
      return { kind: 'value', callee: frame.callee ?? 'defaults', slot: last.text, prefix }
    }
    return { kind: 'defaults-slot', prefix }
  }

  if (!frame.callee || !vocabulary.isCallable(frame.callee)) {
    // `content (…)`, `filter (…)`, `modules (…)`: these brackets belong to a slot, so what
    // goes inside them is that slot's values.
    const outer = stack[stack.length - 2]
    if (frame.callee && outer?.callee && vocabulary.isCallable(outer.callee)) {
      const outerSlots = vocabulary.slotsOf(outer.callee)
      if (outerSlots?.includes(frame.callee)) {
        return { kind: 'value', callee: outer.callee, slot: frame.callee, prefix }
      }
    }
    return { kind: 'none' }
  }

  const slots = vocabulary.slotsOf(frame.callee)
  if (last?.kind === 'ident' && slots?.includes(last.text)) {
    return { kind: 'value', callee: frame.callee, slot: last.text, prefix }
  }

  return { kind: 'slot', callee: frame.callee, prefix }
}
