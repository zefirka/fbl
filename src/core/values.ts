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

export type Value = number | string | boolean | null | EnumValue | Value[] | Handle

export function isHandle(value: Value): value is Handle {
  return typeof value === 'object' && value !== null && (value as Handle).handle === true
}

export function makeHandle(fields: Record<string, Value>): Handle {
  return { handle: true, ...fields } as Handle
}

export function show(value: Value): string {
  if (value === null) return 'nothing'
  if (Array.isArray(value)) return `(${value.map(show).join(', ')})`
  if (value instanceof EnumValue) return value.member
  if (isHandle(value)) return `<${String(value.name ?? 'block')} ${String(value.width)}×${String(value.height)}>`
  return String(value)
}

export interface Located {
  loc?: Loc
}
