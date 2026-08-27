import { argForm } from './args'
import type { Arg, Expr, Module, Param, Stmt, TypeExpr } from './ast'
import type { Diagnostic, Loc } from './errors'
import type { ProtoRegistry } from './proto'
import { BALANCER_LIMIT, hasBalancer } from './balancer'
import { readContent, readFilters } from './metadata'
import {
  ANY_ENTITY_SLOTS,
  bareSlot,
  blockSlots,
  entitySlots,
  findFunction,
  findSlot,
  HELPER_SLOTS,
  LAYOUT_SLOTS,
  type SlotDef,
} from './slots'
import { closestNames } from './suggest'
import { assignable, namedType, showType, SIDES, T, Universe, type Type } from './types'

export interface BlockSignature {
  name: string
  params: Param[]
  slots: SlotDef[]
  loc: Loc
}

/** Slots that may be preset for a whole module or block. Position is deliberately not one. */
const DEFAULTABLE: Record<string, Type> = {
  tier: T.enum('tier'),
  quality: T.enum('quality'),
  dir: T.enum('direction'),
  recipe: T.enum('recipe'),
  modules: T.array(T.module),
  gap: T.int,
  align: T.enum('align'),
}

const HANDLE_FIELDS: Record<string, Type> = {
  x: T.int,
  y: T.int,
  left: T.int,
  top: T.int,
  right: T.int,
  bottom: T.int,
  width: T.int,
  height: T.int,
  tiles: T.int,
  pos: T.coord,
  size: T.coord,
  center: T.coord,
  from: T.coord,
  to: T.coord,
  name: T.text,
  dir: T.enum('direction'),
}

class Scope {
  private readonly names = new Map<string, Type>()
  constructor(readonly parent?: Scope) {}

  get(name: string): Type | undefined {
    return this.names.get(name) ?? this.parent?.get(name)
  }
  set(name: string, type: Type): void {
    this.names.set(name, type)
  }
  child(): Scope {
    return new Scope(this)
  }
  all(): string[] {
    return [...this.names.keys(), ...(this.parent?.all() ?? [])]
  }
}

type Callee =
  | { kind: 'entity'; slots: SlotDef[]; name: string; craftable?: string[]; moduleSlots: number; label: string }
  | { kind: 'helper'; slots: SlotDef[]; name: string }
  | { kind: 'block'; slots: SlotDef[]; name: string; params: Param[] }

export class Checker {
  readonly diagnostics: Diagnostic[] = []
  readonly blocks = new Map<string, BlockSignature>()
  private readonly universe: Universe

  constructor(private readonly registry: ProtoRegistry) {
    this.universe = new Universe(registry)
  }

  private error(message: string, loc?: Loc, hint?: string): void {
    this.diagnostics.push({ severity: 'error', message, loc, hint })
  }

  private warn(message: string, loc?: Loc, hint?: string): void {
    this.diagnostics.push({ severity: 'warning', message, loc, hint })
  }

  check(module: Module): Diagnostic[] {
    const scope = new Scope()
    this.hoist(module.statements)
    this.checkStatements(module.statements, scope)
    return this.diagnostics
  }

  /** Blocks are visible to each other regardless of order. */
  private hoist(statements: Stmt[]): void {
    for (const statement of statements) {
      if (statement.kind !== 'defblock') continue
      if (this.blocks.has(statement.name)) {
        this.error(`block '${statement.name}' is defined twice`, statement.loc)
        continue
      }
      this.blocks.set(statement.name, {
        name: statement.name,
        params: statement.params,
        slots: this.blockSlots(statement.params),
        loc: statement.loc,
      })
    }
  }

  private blockSlots(params: Param[]): SlotDef[] {
    return blockSlots(
      params.map((p) => ({
        name: p.name,
        typeName: p.type.name,
        array: p.type.array,
        required: p.default === undefined,
      })),
      (name, array) => {
        const base = namedType(name) ?? T.any
        return array ? T.array(base) : base
      },
    )
  }

  private resolveType(expr: TypeExpr): Type {
    const base = namedType(expr.name)
    if (!base) {
      this.error(`unknown type '${expr.name}'`, expr.loc, this.suggestType(expr.name))
      return T.any
    }
    return expr.array ? T.array(base) : base
  }

  private suggestType(name: string): string | undefined {
    const near = closestNames(name, ['int', 'float', 'bool', 'text', 'coord', 'direction', 'tier', 'quality', 'recipe', 'item', 'module', 'handle'], 1)
    return near.length ? `did you mean '${near[0]}'?` : undefined
  }

  // ── Statements ──────────────────────────────────────────────────────────────

  private checkStatements(statements: Stmt[], scope: Scope): void {
    for (const statement of statements) this.checkStatement(statement, scope)
  }

  private checkStatement(statement: Stmt, scope: Scope): void {
    switch (statement.kind) {
      case 'defblock': {
        const inner = scope.child()
        for (const param of statement.params) {
          const type = this.resolveType(param.type)
          if (param.default) {
            const actual = this.typeOf(param.default, scope)
            if (!assignable(actual, type)) {
              this.error(
                `default for '${param.name}' is ${showType(actual)}, not ${showType(type)}`,
                param.default.loc,
              )
            }
          }
          inner.set(param.name, type)
        }
        this.checkStatements(statement.body, inner)
        return
      }

      case 'def':
      case 'assign': {
        const actual = this.typeOf(statement.value, scope)
        if (statement.type) {
          const declared = this.resolveType(statement.type)
          if (!assignable(actual, declared)) {
            this.error(
              `'${statement.name}' is declared ${showType(declared)} but the value is ${showType(actual)}`,
              statement.value.loc,
            )
          }
          scope.set(statement.name, declared)
        } else {
          scope.set(statement.name, actual)
        }
        return
      }

      case 'defaults': {
        this.checkDefaults(statement, scope)
        return
      }

      case 'for': {
        const iterable = this.typeOf(statement.iterable, scope)
        let element: Type = T.any
        if (iterable.k === 'array') element = iterable.of
        else if (iterable.k === 'tuple') element = iterable.items[0] ?? T.any
        else if (iterable.k === 'coord') element = T.int
        else if (iterable.k !== 'any') {
          this.error(`for needs something to iterate, got ${showType(iterable)}`, statement.iterable.loc, 'try `0..n`')
        }
        const inner = scope.child()
        inner.set(statement.name, element)
        this.checkStatements(statement.body, inner)
        return
      }

      case 'if': {
        const condition = this.typeOf(statement.condition, scope)
        if (condition.k !== 'bool' && condition.k !== 'any') {
          this.error(`if needs a condition, got ${showType(condition)}`, statement.condition.loc)
        }
        this.checkStatements(statement.then, scope.child())
        if (statement.else) this.checkStatements(statement.else, scope.child())
        return
      }

      case 'block': {
        this.checkSlotArgs(statement.args, LAYOUT_SLOTS[statement.form], statement.form, scope, statement.loc)
        const inner = scope.child()
        if (statement.each) {
          const iterable = this.typeOf(statement.each.iterable, scope)
          const element =
            iterable.k === 'array' ? iterable.of : iterable.k === 'tuple' ? (iterable.items[0] ?? T.any) : T.any
          if (iterable.k !== 'array' && iterable.k !== 'tuple' && iterable.k !== 'any') {
            this.error(
              `${statement.form} for needs something to iterate, got ${showType(iterable)}`,
              statement.each.iterable.loc,
              'try `0..n`',
            )
          }
          inner.set(statement.each.name, element)
        }
        this.checkStatements(statement.body, inner)
        return
      }

      case 'expr':
        this.typeOf(statement.expr, scope)
    }
  }

  private checkDefaults(statement: Extract<Stmt, { kind: 'defaults' }>, scope: Scope): void {
    if (statement.target) {
      const known =
        this.registry.entities.has(statement.target) ||
        statement.target in HELPER_SLOTS ||
        [...this.registry.entities.values()].some((p) => p.kind === statement.target)
      if (!known) {
        this.error(
          `'${statement.target}' is not an entity or a family`,
          statement.targetLoc,
          this.suggestEntity(statement.target),
        )
      }
    }

    for (const arg of statement.args) {
      const form = argForm(
        arg,
        Object.keys(DEFAULTABLE).map((name) => ({ name, type: DEFAULTABLE[name] })),
        (name) => this.isCallable(name),
      )
      if (!form.slotName) {
        this.error('defaults needs `slot value` pairs', form.loc, `settable: ${Object.keys(DEFAULTABLE).join(', ')}`)
        continue
      }
      if (statement.target) {
        const proto = this.registry.entities.get(statement.target)
        if (proto && !findSlot(entitySlots(proto, this.registry.profile.supportsQuality), form.slotName)) {
          this.warn(`${proto.label} has no '${form.slotName}' slot, so this default does nothing`, form.labelLoc)
        }
      }

      const expected = DEFAULTABLE[form.slotName]
      if (!expected) {
        this.error(
          `'${form.slotName}' cannot be defaulted`,
          form.labelLoc,
          `settable: ${Object.keys(DEFAULTABLE).join(', ')}`,
        )
        continue
      }
      const actual = this.typeOf(form.expr, scope, expected)
      if (!assignable(actual, expected)) {
        this.error(`${form.slotName} expects ${showType(expected)}, got ${showType(actual)}`, form.expr.loc)
      }
    }

    if (statement.body) this.checkStatements(statement.body, scope.child())
  }

  // ── Calls ───────────────────────────────────────────────────────────────────

  private lookupCallee(name: string): Callee | undefined {
    const block = this.blocks.get(name)
    if (block) return { kind: 'block', slots: block.slots, name, params: block.params }

    const proto = this.registry.entities.get(name)
    if (proto) {
      return {
        kind: 'entity',
        slots: entitySlots(proto, this.registry.profile.supportsQuality),
        name,
        label: proto.label,
        moduleSlots: proto.moduleSlots,
      }
    }

    const helper = HELPER_SLOTS[name]
    if (helper) return { kind: 'helper', slots: helper, name }

    return undefined
  }

  /** Whether a bare name could head a call, which is what settles `label (…)` ambiguity. */
  private isCallable(name: string): boolean {
    return Boolean(findFunction(name)) || this.lookupCallee(name) !== undefined
  }

  private suggestEntity(name: string): string | undefined {
    const near = closestNames(name, [...this.registry.entities.keys(), ...this.blocks.keys()], 2)
    return near.length ? `did you mean ${near.map((n) => `'${n}'`).join(' or ')}?` : undefined
  }

  private checkSlotArgs(
    args: Arg[],
    slots: SlotDef[],
    calleeName: string,
    scope: Scope,
    loc?: Loc,
  ): Map<string, Expr> {
    const filled = new Map<string, Expr>()
    /** Slots that an unlabelled value chose for itself, which is what surprises people. */
    const fromBare = new Set<string>()

    for (const arg of args) {
      const form = argForm(arg, slots, (name) => this.isCallable(name))

      let slot: SlotDef | undefined
      if (form.slotName) {
        slot = findSlot(slots, form.slotName)
        if (!slot) {
          this.error(
            `'${calleeName}' has no slot '${form.slotName}'`,
            form.labelLoc,
            slots.length ? `it takes ${slots.map((s) => s.name).join(', ')}` : 'it takes no arguments',
          )
          continue
        }
      } else {
        // A slot name with nothing after it, which is what half-typed source looks like.
        // A name that *is* bound is a value, not a label: `stack-inserter (dir)` passes the
        // variable `dir`, and only an unbound name can be a label missing its argument.
        if (form.expr.kind === 'name' && !scope.get(form.expr.name)) {
          const named = findSlot(slots, form.expr.name)
          if (named) {
            this.error(
              `'${named.name}' has no value`,
              form.expr.loc,
              `${named.name} takes ${showType(named.type)}`,
            )
            continue
          }
        }

        // A bare value picks its slot from its own type.
        const type = this.typeOf(form.expr, scope)
        slot = bareSlot(slots, type)
        if (slot) fromBare.add(slot.name)
        if (!slot) {
          this.error(
            `${showType(type)} needs a label here`,
            form.loc,
            slots.length ? `try one of ${slots.map((s) => s.name).join(', ')}` : undefined,
          )
          continue
        }
      }

      if (filled.has(slot.name)) {
        this.warn(`'${slot.name}' is given twice; the last one wins`, form.loc)
      }

      // Metadata and filters carry their own shape, which a plain type check cannot see.
      if (slot.type.k === 'content' || slot.type.k === 'filters') {
        if (slot.type.k === 'content') this.checkContent(arg, calleeName)
        else this.checkFilters(arg)
        filled.set(slot.name, form.expr)
        continue
      }

      // The splitter reaches here instead: it holds one filter, so a list is worth saying
      // plainly rather than letting the type error talk about tuples.
      if (slot.name === 'filter' && arg.entries) {
        const first = arg.entries[0]?.value
        this.error(
          'a splitter filters a single item',
          arg.loc,
          first?.kind === 'name' ? `write it as 'filter ${first.name}'` : undefined,
        )
        filled.set(slot.name, form.expr)
        continue
      }

      const actual = this.typeOf(form.expr, scope, slot.type)
      if (!assignable(actual, slot.type)) {
        this.error(`${slot.name} expects ${showType(slot.type)}, got ${showType(actual)}`, form.expr.loc)
      }
      filled.set(slot.name, form.expr)
    }

    for (const slot of slots) {
      if (slot.required && !filled.has(slot.name)) {
        this.error(`'${calleeName}' needs ${slot.name}`, loc, this.missingHint(slot, fromBare))
      }
    }

    return filled
  }

  /**
   * Why a required slot went unfilled. The common surprise is a coordinate: an unlabelled one
   * always means position, so it lands in `at` and any other coordinate parameter stays empty.
   */
  private missingHint(slot: SlotDef, fromBare: Set<string>): string {
    if (slot.type.k === 'coord' && fromBare.has('at')) {
      return `an unlabelled coordinate fills 'at'; write '${slot.name} (x, y)' to reach this one`
    }
    return `${slot.name} takes ${showType(slot.type)}`
  }

  private checkItem(name: string, loc?: Loc): void {
    if (this.universe.isMember('item', name)) return
    const near = closestNames(name, this.universe.members('item'), 2)
    this.error(
      `'${name}' is not an item`,
      loc,
      near.length ? `did you mean ${near.map((n) => `'${n}'`).join(' or ')}?` : undefined,
    )
  }

  /** `content` is metadata, but a wrong item name in it is still a wrong item name. */
  private checkContent(arg: Arg, calleeName: string): void {
    const read = readContent(arg)
    if (!read.ok) {
      this.error(read.error.message, read.error.loc, read.error.hint)
      return
    }

    const proto = this.registry.entities.get(calleeName)
    const chest = proto?.kind === 'container'
    const capacity = chest ? (proto?.slots ?? 1) : 2

    if (read.value.length > capacity) {
      this.error(
        chest
          ? `${proto?.label} holds ${capacity} stacks, and ${read.value.length} items were listed`
          : `a belt has two lanes, and ${read.value.length} items were listed`,
        arg.loc,
      )
    }

    const taken = new Set<string>()
    for (const entry of read.value) {
      this.checkItem(entry.item, entry.loc)
      if (entry.side === undefined) continue

      if (chest) {
        this.error(`a chest has no sides`, entry.loc, 'drop the side, or move this onto a belt')
        continue
      }
      if (!SIDES.includes(entry.side)) {
        this.error(`'${entry.side}' is not a side`, entry.loc, `a belt lane is ${SIDES.join(' or ')}`)
        continue
      }
      if (taken.has(entry.side)) this.error(`two items on the ${entry.side} lane`, entry.loc)
      taken.add(entry.side)
    }
  }

  private checkFilters(arg: Arg): void {
    const read = readFilters(arg)
    if (!read.ok) {
      this.error(read.error.message, read.error.loc, read.error.hint)
      return
    }
    for (const item of read.value.items) this.checkItem(item.name, item.loc)
  }

  /** Everything the game data lets us decide before a single entity is placed. */
  private checkGameRules(callee: Callee, filled: Map<string, Expr>, loc: Loc): void {
    if (callee.kind !== 'entity') return

    const recipeExpr = filled.get('recipe')
    if (recipeExpr && recipeExpr.kind === 'name') {
      const recipe = this.registry.recipes.get(recipeExpr.name)
      if (recipe?.producers && !recipe.producers.includes(callee.name)) {
        this.error(
          `${callee.label} cannot craft ${recipeExpr.name}`,
          recipeExpr.loc,
          `it is made in ${recipe.producers.slice(0, 3).join(', ')}`,
        )
      }
    }

    const modulesExpr = filled.get('modules')
    if (modulesExpr?.kind === 'tuple' && modulesExpr.items.length > callee.moduleSlots) {
      this.error(
        `${callee.label} has ${callee.moduleSlots} module slot(s), ${modulesExpr.items.length} given`,
        modulesExpr.loc,
      )
    }
    void loc
  }

  // ── Expressions ─────────────────────────────────────────────────────────────

  private typeOf(expr: Expr, scope: Scope, expected?: Type): Type {
    switch (expr.kind) {
      case 'number':
        return Number.isInteger(expr.value) ? T.int : T.float

      case 'text':
        return T.text

      case 'name':
        return this.typeOfName(expr.name, expr.loc, scope, expected)

      case 'tuple':
        return T.tuple(expr.items.map((item) => this.typeOf(item, scope, elementOf(expected))))

      case 'range': {
        for (const side of [expr.from, expr.to]) {
          const type = this.typeOf(side, scope)
          if (type.k !== 'int' && type.k !== 'any') {
            this.error(`a range needs whole numbers, got ${showType(type)}`, side.loc)
          }
        }
        return T.array(T.int)
      }

      case 'unary': {
        const operand = this.typeOf(expr.operand, scope)
        if (expr.op === 'not') return T.bool
        if (operand.k !== 'int' && operand.k !== 'float' && operand.k !== 'any') {
          this.error(`cannot negate ${showType(operand)}`, expr.loc)
        }
        return operand
      }

      case 'binary':
        return this.typeOfBinary(expr, scope)

      case 'field':
        return this.typeOfField(expr, scope)

      case 'measure':
        this.typeOf(expr.body, scope)
        return T.handle

      case 'call':
        return this.typeOfCall(expr, scope)
    }
  }

  private typeOfName(name: string, loc: Loc, scope: Scope, expected?: Type): Type {
    const bound = scope.get(name)
    if (bound) return bound

    // Not a variable — try to read it as a member of the expected type, then of any
    // small closed vocabulary. Recipes and items are too large to guess from.
    if (expected) {
      const target = expected.k === 'array' ? expected.of : expected
      // A block is placeable too, so it counts as an entity.
      if (target.k === 'enum' && target.name === 'entity' && this.blocks.has(name)) return target
      if (target.k === 'enum' && this.universe.isMember(target.name, name)) return target
      if (target.k === 'module' && (this.universe.isMember('item', name) || this.universe.isMember('module-item', name))) {
        return T.module
      }
      if (target.k === 'enum') {
        const candidates =
          target.name === 'entity'
            ? [...this.universe.members('entity'), ...this.blocks.keys()]
            : this.universe.members(target.name)
        const near = closestNames(name, candidates, 2)
        this.error(
          `'${name}' is not a ${target.name}`,
          loc,
          near.length ? `did you mean ${near.map((n) => `'${n}'`).join(' or ')}?` : undefined,
        )
        return T.any
      }
    }

    const bare = this.universe.bareEnum(name)
    if (bare) return T.enum(bare)

    const near = closestNames(name, [...scope.all(), ...this.blocks.keys(), ...this.registry.entities.keys()], 2)
    this.error(
      `unknown name '${name}'`,
      loc,
      near.length ? `did you mean ${near.map((n) => `'${n}'`).join(' or ')}?` : undefined,
    )
    return T.any
  }

  private typeOfBinary(expr: Extract<Expr, { kind: 'binary' }>, scope: Scope): Type {
    const left = this.typeOf(expr.left, scope)
    const right = this.typeOf(expr.right, scope)

    if (expr.op === 'and' || expr.op === 'or') return T.bool
    if (['==', '!=', '<', '<=', '>', '>='].includes(expr.op)) return T.bool

    for (const [type, side] of [
      [left, expr.left],
      [right, expr.right],
    ] as const) {
      if (type.k !== 'int' && type.k !== 'float' && type.k !== 'any') {
        this.error(`'${expr.op}' needs numbers, got ${showType(type)}`, side.loc)
      }
    }
    if (expr.op === '/') return T.float
    return left.k === 'float' || right.k === 'float' ? T.float : T.int
  }

  private typeOfField(expr: Extract<Expr, { kind: 'field' }>, scope: Scope): Type {
    const target = this.typeOf(expr.target, scope)

    if (target.k === 'coord' || (target.k === 'tuple' && target.items.length === 2)) {
      if (expr.field === 'x' || expr.field === 'y') return T.int
      this.error(`a coordinate has only .x and .y, not .${expr.field}`, expr.loc)
      return T.any
    }

    if (target.k === 'handle' || target.k === 'any') {
      const field = HANDLE_FIELDS[expr.field]
      if (field) return field
      const near = closestNames(expr.field, Object.keys(HANDLE_FIELDS), 2)
      this.error(
        `no field '.${expr.field}'`,
        expr.loc,
        near.length ? `did you mean ${near.map((n) => `.${n}`).join(' or ')}?` : undefined,
      )
      return T.any
    }

    this.error(`${showType(target)} has no fields`, expr.loc)
    return T.any
  }

  private typeOfCall(expr: Extract<Expr, { kind: 'call' }>, scope: Scope): Type {
    const fn = findFunction(expr.callee)
    if (fn) {
      const labelled = expr.args.find((arg) => arg.label !== undefined && !arg.asCall)
      if (labelled) this.error(`'${fn.name}' takes plain values, not labels`, labelled.labelLoc)

      const min = fn.minArgs ?? fn.params.length
      const max = fn.variadic ? Infinity : fn.params.length
      if (expr.args.length < min || expr.args.length > max) {
        this.error(
          `'${fn.name}' takes ${fn.variadic ? `at least ${min}` : min} argument(s), got ${expr.args.length}`,
          expr.loc,
        )
      }
      expr.args.forEach((arg, index) => {
        const want = fn.params[Math.min(index, fn.params.length - 1)] ?? T.any
        const got = this.typeOf(arg.value, scope, want)
        if (!assignable(got, want)) {
          this.error(`'${fn.name}' argument ${index + 1} expects ${showType(want)}, got ${showType(got)}`, arg.value.loc)
        }
      })
      // `repeat` returns a list of whatever it was handed.
      if (fn.name === 'repeat' && expr.args[1]) return T.array(this.typeOf(expr.args[1].value, scope))
      return fn.result
    }

    // `machine (at (0, 0))` where `machine` is an `entity` parameter: the prototype is only
    // known at run time, so the slots are checked against the union of every entity's.
    const bound = scope.get(expr.callee)
    if (bound?.k === 'enum' && bound.name === 'entity') {
      this.checkSlotArgs(expr.args, ANY_ENTITY_SLOTS, expr.callee, scope, expr.loc)
      return T.handle
    }

    const callee = this.lookupCallee(expr.callee)
    if (!callee) {
      this.error(`unknown name '${expr.callee}'`, expr.loc, this.suggestEntity(expr.callee))
      expr.args.forEach((arg) => this.typeOf(arg.value, scope))
      return T.any
    }

    const filled = this.checkSlotArgs(expr.args, callee.slots, expr.callee, scope, expr.loc)
    this.checkGameRules(callee, filled, expr.loc)

    // The balancer library is finite, so a literal pair can be checked before anything runs.
    if (expr.callee === 'balancer') {
      const from = filled.get('in')
      const to = filled.get('to')
      if (from?.kind === 'number' && to?.kind === 'number' && !hasBalancer(from.value, to.value)) {
        this.error(
          `there is no ${from.value} to ${to.value} balancer in the library`,
          expr.loc,
          `inputs and outputs both run from 1 to ${BALANCER_LIMIT}`,
        )
      }
    }

    return T.handle
  }
}

function elementOf(type: Type | undefined): Type | undefined {
  if (!type) return undefined
  if (type.k === 'array') return type.of
  if (type.k === 'coord') return T.int
  return undefined
}

export function check(module: Module, registry: ProtoRegistry): Diagnostic[] {
  return new Checker(registry).check(module)
}
