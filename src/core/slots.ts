import type { Prototype } from './proto'
import { assignable, T, type Type } from './types'

export interface SlotDef {
  name: string
  type: Type
  /** Other names that fill the same slot, e.g. `at` for a belt's `from`. */
  aliases?: string[]
  required?: boolean
  /**
   * A bare value of this type fills this slot, overriding the vocabulary-wide default.
   * `balancer (4 to 8)` reads its input count this way; nothing else claims a bare int.
   */
  bare?: boolean
  doc?: string
}

/**
 * Which slot a bare value fills, decided by its type. Coordinates default to `at`;
 * `from` and `to` share that type and so always need their label.
 */
const DEFAULT_SLOT: Record<string, string> = {
  direction: 'dir',
  tier: 'tier',
  quality: 'quality',
  'underground-type': 'type',
  align: 'align',
  routing: 'route',
}

export function defaultSlotFor(type: Type): string | undefined {
  if (type.k === 'enum') return DEFAULT_SLOT[type.name]
  if (type.k === 'coord') return 'at'
  // `(0, 0)` is written as a tuple and only becomes a coord on assignment.
  if (type.k === 'tuple' && type.items.length === 2 && type.items.every((t) => t.k === 'int')) return 'at'
  return undefined
}

export function findSlot(slots: SlotDef[], name: string): SlotDef | undefined {
  return slots.find((slot) => slot.name === name || slot.aliases?.includes(name))
}

/** Which slot an unlabelled value of this type fills on this callee, if any. */
export function bareSlot(slots: SlotDef[], type: Type): SlotDef | undefined {
  const claimed = slots.find((slot) => slot.bare && assignable(type, slot.type))
  if (claimed) return claimed
  const name = defaultSlotFor(type)
  return name ? findSlot(slots, name) : undefined
}

const AT: SlotDef = { name: 'at', type: T.coord, doc: 'top-left tile of the footprint' }
const QUALITY: SlotDef = { name: 'quality', type: T.enum('quality') }
const CONTENT: SlotDef = {
  name: 'content',
  type: T.content,
  doc: 'what it carries — metadata, never written to the blueprint',
}

/** The slots a game entity accepts, derived from what its prototype actually supports. */
export function entitySlots(proto: Prototype, supportsQuality: boolean): SlotDef[] {
  const slots: SlotDef[] = [AT]

  if (proto.rotatable) {
    slots.push({ name: 'dir', type: T.enum('direction'), doc: 'the way it faces' })
  }
  if (proto.kind === 'inserter') {
    slots.push({ name: 'from', type: T.enum('direction'), doc: 'the side it picks up from' })
  }
  if (proto.craftingSpeed !== undefined) {
    slots.push({ name: 'recipe', type: T.enum('recipe') })
  }
  if (proto.moduleSlots > 0) {
    slots.push({ name: 'modules', type: T.array(T.module) })
  }
  if (proto.kind === 'underground-belt') {
    slots.push({ name: 'type', type: T.enum('underground-type'), doc: 'input or output end' })
  }
  if (supportsQuality) slots.push(QUALITY)

  // Metadata, for the preview and for whatever reads the blueprint afterwards.
  if (proto.kind === 'belt' || proto.kind === 'underground-belt' || proto.kind === 'container') {
    slots.push(CONTENT)
  }
  if (proto.kind === 'inserter') {
    slots.push({ name: 'filter', type: T.filters, doc: 'items to pass; `not` for a blacklist' })
  }
  if (proto.kind === 'splitter') {
    slots.push(
      { name: 'filter', type: T.enum('item'), doc: 'the one item a splitter can filter' },
      { name: 'in-priority', type: T.enum('side'), doc: 'the side it prefers to take from' },
      { name: 'out-priority', type: T.enum('side'), doc: 'the side it prefers to give to' },
    )
  }

  return slots
}

const BALANCER_SLOTS: SlotDef[] = [
  AT,
  { name: 'in', type: T.int, aliases: ['from'], required: true, bare: true, doc: 'input lanes, 1–8' },
  { name: 'to', type: T.int, aliases: ['out'], required: true, doc: 'output lanes, 1–8' },
  { name: 'tier', type: T.enum('tier') },
  { name: 'dir', type: T.enum('direction'), doc: 'which way items flow' },
]

/** `belt`, `underground` and `balancer` are not entities; they expand into many of them. */
export const HELPER_SLOTS: Record<string, SlotDef[]> = {
  belt: [
    { name: 'from', type: T.coord, aliases: ['at'], doc: 'where the run starts' },
    { name: 'to', type: T.coord, doc: 'where it ends' },
    { name: 'via', type: T.array(T.coord), doc: 'corners between from and to' },
    { name: 'dir', type: T.enum('direction') },
    { name: 'length', type: T.int },
    { name: 'tier', type: T.enum('tier') },
    { name: 'route', type: T.enum('routing'), doc: 'auto tunnels under whatever is in the way' },
    CONTENT,
  ],
  underground: [
    { name: 'from', type: T.coord, aliases: ['at'] },
    { name: 'to', type: T.coord, required: true },
    { name: 'tier', type: T.enum('tier') },
    CONTENT,
  ],
  balancer: BALANCER_SLOTS,
}

/**
 * What `defaults` can preset. Every one is `bare`, so a value can find its own slot the way it
 * does everywhere else: `defaults (blue)` is `defaults (tier blue)`, and `defaults (auto)` puts
 * every belt below it on `route auto`.
 */
export const DEFAULT_SLOTS: SlotDef[] = [
  { name: 'tier', type: T.enum('tier'), bare: true },
  { name: 'quality', type: T.enum('quality'), bare: true },
  { name: 'dir', type: T.enum('direction'), bare: true },
  { name: 'recipe', type: T.enum('recipe'), bare: true },
  { name: 'modules', type: T.array(T.module) },
  { name: 'gap', type: T.int, bare: true },
  { name: 'align', type: T.enum('align'), bare: true },
  { name: 'route', type: T.enum('routing'), bare: true, doc: 'auto tunnels under whatever is in the way' },
]

export const DEFAULT_SLOT_NAMES = DEFAULT_SLOTS.map((slot) => slot.name)

export const LAYOUT_SLOTS: Record<string, SlotDef[]> = {
  at: [{ name: 'at', type: T.coord, required: true }],
  row: [
    { name: 'gap', type: T.int },
    { name: 'align', type: T.enum('align') },
  ],
  column: [
    { name: 'gap', type: T.int },
    { name: 'align', type: T.enum('align') },
  ],
  transform: [
    {
      name: 'apply',
      type: T.enum('transform'),
      required: true,
      bare: true,
      doc: 'flip-h, flip-v, flip-hv, rotate-cw or rotate-ccw',
    },
  ],
}

/**
 * A block's parameters become its slots. Each also answers to its type name — pluralised for
 * arrays — so `defblock cell (recipe r, module[] m)` is called as
 * `cell (recipe iron-gear-wheel, modules prod-3)` rather than with the one-letter names.
 * The alias is dropped when another parameter already claims it.
 */
export function blockSlots(
  params: Array<{ name: string; typeName: string; array: boolean; required: boolean }>,
  typeOf: (typeName: string, array: boolean) => Type,
): SlotDef[] {
  const taken = new Set(params.map((p) => p.name))
  const aliases = new Map<string, string[]>()

  for (const param of params) {
    const alias = param.array ? `${param.typeName}s` : param.typeName
    if (taken.has(alias)) continue
    if (params.filter((other) => (other.array ? `${other.typeName}s` : other.typeName) === alias).length > 1) continue
    aliases.set(param.name, [alias])
    taken.add(alias)
  }

  return [
    { name: 'at', type: T.coord },
    ...params.map((param) => ({
      name: param.name,
      type: typeOf(param.typeName, param.array),
      aliases: aliases.get(param.name),
      required: param.required,
    })),
  ]
}

/**
 * A record's fields, as slots. They are filled exactly the way a call's arguments are —
 * by label, or bare when the type says which field it can only be — so a record literal
 * needs no rules of its own, and misspelling a field reads like misspelling a slot.
 */
export function recordSlots(
  fields: Array<{ name: string; typeName: string; array: boolean; required: boolean }>,
  typeOf: (typeName: string, array: boolean) => Type,
): SlotDef[] {
  return fields.map((field) => ({
    name: field.name,
    type: typeOf(field.typeName, field.array),
    required: field.required,
  }))
}

/**
 * When a building arrives as a parameter its prototype is unknown until run time, so the
 * checker falls back to the union of every entity slot. Typos are still caught; whether the
 * particular machine has a `recipe` is left to the runtime.
 */
export const ANY_ENTITY_SLOTS: SlotDef[] = [
  AT,
  { name: 'dir', type: T.enum('direction') },
  { name: 'from', type: T.enum('direction') },
  { name: 'recipe', type: T.enum('recipe') },
  { name: 'modules', type: T.array(T.module) },
  { name: 'type', type: T.enum('underground-type') },
  QUALITY,
]

// ── Functions ─────────────────────────────────────────────────────────────────

export interface FnSignature {
  name: string
  params: Type[]
  result: Type
  /** The last parameter type repeats. */
  variadic?: boolean
  minArgs?: number
}

export const FUNCTIONS: FnSignature[] = [
  { name: 'repeat', params: [T.int, T.any], result: T.array(T.any) },
  { name: 'count', params: [T.array(T.any)], result: T.int },
  { name: 'min', params: [T.float], result: T.float, variadic: true, minArgs: 1 },
  { name: 'max', params: [T.float], result: T.float, variadic: true, minArgs: 1 },
  { name: 'abs', params: [T.float], result: T.float },
  { name: 'floor', params: [T.float], result: T.int },
  { name: 'ceil', params: [T.float], result: T.int },
  { name: 'round', params: [T.float], result: T.int },
  { name: 'ingredients', params: [T.enum('recipe')], result: T.array(T.enum('item')) },
  { name: 'craft-time', params: [T.enum('recipe')], result: T.float },
  { name: 'module-slots', params: [T.enum('item')], result: T.int },
  { name: 'to-entity', params: [T.enum('recipe')], result: T.enum('entity') },
  { name: 'to-recipe', params: [T.enum('entity')], result: T.enum('recipe') },
  { name: 'width', params: [T.enum('entity')], result: T.int },
  { name: 'height', params: [T.enum('entity')], result: T.int },
  { name: 'print', params: [T.any], result: T.void, variadic: true, minArgs: 1 },
]

export function findFunction(name: string): FnSignature | undefined {
  return FUNCTIONS.find((fn) => fn.name === name)
}
