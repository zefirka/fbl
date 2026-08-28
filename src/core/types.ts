import { DIRECTION_WORDS } from './geometry'
import type { ProtoRegistry } from './proto'

export type EnumName =
  | 'direction'
  | 'tier'
  | 'quality'
  | 'underground-type'
  | 'align'
  | 'transform'
  | 'recipe'
  | 'item'
  | 'module-item'
  | 'entity'
  | 'routing'
  | 'side'

export type Type =
  | { k: 'int' }
  | { k: 'float' }
  | { k: 'bool' }
  | { k: 'text' }
  | { k: 'coord' }
  | { k: 'enum'; name: EnumName }
  | { k: 'module' }
  /** `(iron-ore left, coal right)` — what a belt or a chest is carrying. Metadata only. */
  | { k: 'content' }
  /** `(copper-plate, copper-ore)` or `(not copper-plate, …)` — an inserter's item filters. */
  | { k: 'filters' }
  | { k: 'handle' }
  | { k: 'array'; of: Type }
  | { k: 'tuple'; items: Type[] }
  | { k: 'any' }
  | { k: 'void' }

export const T = {
  int: { k: 'int' } as Type,
  float: { k: 'float' } as Type,
  bool: { k: 'bool' } as Type,
  text: { k: 'text' } as Type,
  coord: { k: 'coord' } as Type,
  module: { k: 'module' } as Type,
  content: { k: 'content' } as Type,
  filters: { k: 'filters' } as Type,
  handle: { k: 'handle' } as Type,
  any: { k: 'any' } as Type,
  void: { k: 'void' } as Type,
  enum: (name: EnumName): Type => ({ k: 'enum', name }),
  array: (of: Type): Type => ({ k: 'array', of }),
  tuple: (items: Type[]): Type => ({ k: 'tuple', items }),
} as const

/** Type names writable in source. */
const NAMED_TYPES: Record<string, Type> = {
  int: T.int,
  float: T.float,
  number: T.float,
  bool: T.bool,
  text: T.text,
  coord: T.coord,
  direction: T.enum('direction'),
  tier: T.enum('tier'),
  quality: T.enum('quality'),
  recipe: T.enum('recipe'),
  item: T.enum('item'),
  module: T.module,
  content: { k: 'content' } as Type,
  filters: { k: 'filters' } as Type,
  side: T.enum('side'),
  entity: T.enum('entity'),
  handle: T.handle,
  any: T.any,
}

export function namedType(name: string): Type | undefined {
  return NAMED_TYPES[name]
}

export function typeNames(): string[] {
  return Object.keys(NAMED_TYPES)
}

export function showType(type: Type): string {
  switch (type.k) {
    case 'enum':
      // `module-item` is an internal narrowing of `item`; users never write it.
      return type.name === 'module-item' ? 'item' : type.name
    case 'array':
      return `${showType(type.of)}[]`
    case 'tuple':
      return `(${type.items.map(showType).join(', ')})`
    default:
      return type.k
  }
}

/**
 * Can a value of `from` be used where `to` is expected?
 *
 * The interesting cases all come from `()` being the only constructor: a tuple of two ints
 * is a coordinate, a tuple of like-typed values is an array, and an empty tuple is any
 * empty array.
 */
export function assignable(from: Type, to: Type): boolean {
  if (to.k === 'any' || from.k === 'any') return true
  if (from.k === to.k && from.k !== 'enum' && from.k !== 'array' && from.k !== 'tuple') return true

  if (from.k === 'int' && to.k === 'float') return true
  if (from.k === 'enum' && to.k === 'enum') {
    // Every module is an item; the narrower name exists so `modules` can reject scrap.
    if (from.name === 'module-item' && to.name === 'item') return true
    return from.name === to.name
  }

  // A module is an item, optionally paired with a quality.
  if (to.k === 'module') {
    if (from.k === 'enum' && (from.name === 'item' || from.name === 'module-item')) return true
    if (from.k === 'module') return true
    if (from.k === 'tuple' && from.items.length === 2) {
      return assignable(from.items[0], T.enum('item')) && assignable(from.items[1], T.enum('quality'))
    }
    return false
  }

  if (to.k === 'coord') {
    if (from.k === 'coord') return true
    return from.k === 'tuple' && from.items.length === 2 && from.items.every((t) => assignable(t, T.int))
  }

  if (to.k === 'array') {
    if (from.k === 'array') return assignable(from.of, to.of)
    if (from.k === 'tuple' && from.items.every((t) => assignable(t, to.of))) return true
    if (from.k === 'coord' && assignable(T.int, to.of)) return true
    // A lone value stands in for a one-element list: `via (10, 0)` is a single corner,
    // which matters because `((10, 0))` is just grouping and collapses back to a coord.
    return assignable(from, to.of)
  }

  if (to.k === 'tuple' && from.k === 'tuple') {
    return to.items.length === from.items.length && from.items.every((t, i) => assignable(t, to.items[i]))
  }

  return false
}

// ── Enum universes ────────────────────────────────────────────────────────────

export const DIRECTIONS = DIRECTION_WORDS

export const TIERS = ['yellow', 'red', 'blue', 'green', 'normal', 'basic', 'fast', 'express', 'turbo']
export const UNDERGROUND_TYPES = ['input', 'output']
export const ALIGNMENTS = ['start', 'center', 'end']

/**
 * What `transform` does to what its body built. `h` and `v` are the axes the game's own flip
 * buttons use — `flip-h` swaps left and right, `flip-v` swaps top and bottom — and `flip-hv`
 * is both at once, which is a half turn. The rotations are quarter turns.
 */
export const TRANSFORMS = ['flip-h', 'flip-v', 'flip-hv', 'rotate-cw', 'rotate-ccw']
export const ROUTINGS = ['auto', 'direct']
/** Belt lanes and splitter priorities both name a side. */
export const SIDES = ['left', 'right']

/**
 * Which names are legal members of each type.
 *
 * Bare values — `north`, `blue` — are only resolved against the small closed enums.
 * Recipes and items are far too large a namespace to guess from, and `iron-gear-wheel` is
 * both, so those always need their label.
 */
export class Universe {
  readonly qualities: string[]

  constructor(private readonly registry: ProtoRegistry) {
    this.qualities = registry.qualities.length ? registry.qualities : ['normal']
  }

  members(name: EnumName): string[] {
    switch (name) {
      case 'direction':
        return DIRECTIONS
      case 'tier':
        return TIERS
      case 'quality':
        return this.qualities
      case 'underground-type':
        return UNDERGROUND_TYPES
      case 'align':
        return ALIGNMENTS
      case 'transform':
        return TRANSFORMS
      case 'routing':
        return ROUTINGS
      case 'side':
        return SIDES
      case 'recipe':
        return [...this.registry.recipes.keys()]
      case 'item':
        return [...this.registry.itemLabels.keys()]
      case 'module-item':
        return [...this.registry.modules]
      case 'entity':
        return [...this.registry.entities.keys()]
    }
  }

  isMember(name: EnumName, value: string): boolean {
    switch (name) {
      case 'recipe':
        return this.registry.recipes.has(value)
      case 'item':
        return this.registry.itemLabels.has(value)
      case 'module-item':
        return this.registry.modules.has(value)
      case 'entity':
        return this.registry.entities.has(value)
      default:
        return this.members(name).includes(value)
    }
  }

  /** The closed enums a bare name could belong to, in priority order. */
  private static readonly BARE: EnumName[] = [
    'direction',
    'tier',
    'quality',
    'underground-type',
    'align',
    'routing',
    'transform',
  ]

  /**
   * What a bare name means. The small vocabularies come first; after them a name is taken
   * as an item or a recipe only when it is not both — `iron-gear-wheel` is both, so it has
   * to be labelled and the label's type decides.
   */
  bareEnum(value: string): EnumName | undefined {
    const closed = Universe.BARE.find((name) => this.isMember(name, value))
    if (closed) return closed
    if (this.isMember('module-item', value)) return 'module-item'

    const item = this.isMember('item', value)
    const recipe = this.isMember('recipe', value)
    if (item && !recipe) return 'item'
    if (recipe && !item) return 'recipe'
    return undefined
  }

  /** True when a name exists in both namespaces and so cannot be used bare. */
  isAmbiguous(value: string): boolean {
    return this.isMember('item', value) && this.isMember('recipe', value)
  }
}
