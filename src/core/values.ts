import type { Loc } from './errors'

/** A member of one of the closed vocabularies: `north`, `blue`, `legendary`, a recipe id. */
export class EnumValue {
  constructor(
    readonly enumName: string,
    readonly member: string,
  ) {}

  toString(): string {
    return this.member
  }
}

/** What a placement evaluates to. Fields are read with `.`, as in `a.width`. */
export interface Handle {
  readonly handle: true
  readonly [field: string]: unknown
}

/**
 * Which record a handle is, kept on a symbol so that it cannot be read as a field: `l.name`
 * has to mean the field the author declared, whatever the record itself is called.
 */
const RECORD = Symbol('record')

export type Value = number | string | boolean | null | EnumValue | Value[] | Handle

export function isHandle(value: Value): value is Handle {
  return typeof value === 'object' && value !== null && (value as Handle).handle === true
}

export function makeHandle(fields: Record<string, Value>): Handle {
  return { handle: true, ...fields } as Handle
}

/** A `defrecord` value. It is a handle too, so `.field` and `print` need nothing new. */
export function makeRecord(name: string, fields: Record<string, Value>): Handle {
  return { handle: true, [RECORD]: name, ...fields } as Handle
}

export function recordOf(value: Value): string | undefined {
  if (!isHandle(value)) return undefined
  return (value as unknown as Record<symbol, string | undefined>)[RECORD]
}

export function show(value: Value): string {
  if (value === null) return 'nothing'
  if (Array.isArray(value)) return `(${value.map(show).join(', ')})`
  if (value instanceof EnumValue) return value.member
  if (isHandle(value)) {
    const record = recordOf(value)
    if (record !== undefined) {
      const fields = Object.entries(value)
        .filter(([field]) => field !== 'handle')
        .map(([field, held]) => `${field} ${show(held as Value)}`)
      return `${record} (${fields.join(', ')})`
    }
    return `<${String(value.name ?? 'block')} ${String(value.width)}×${String(value.height)}>`
  }
  return String(value)
}

export interface Located {
  loc?: Loc
}
