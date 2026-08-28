import { argForm } from './args'
import { readContent, readFilters } from './metadata'
import { MODULES, moduleOffering } from './modules'
import { BALANCER_LIMIT, balancerLayout, BELT, SPLITTER, UNDERGROUND } from './balancer'
import type { Arg, Expr, Module, Param, Stmt } from './ast'
import { fail, type Loc } from './errors'
import {
  Direction,
  addVec,
  directionBetween,
  directionFromName,
  directionName,
  directionStep,
  oppositeDirection,
  vec,
  type Rect,
  type Vec,
} from './geometry'
import type { Prototype, ProtoRegistry } from './proto'
import { planRoute, type RouteResult, type RouteStep, type TileState } from './routing'
import { Scene, type ContentEntry, type FilterSpec, type ModuleSpec, type SceneTransform } from './scene'
import { bareSlot, blockSlots, entitySlots, findSlot, HELPER_SLOTS, LAYOUT_SLOTS, type SlotDef, DEFAULT_SLOTS } from './slots'
import { flowsWith, LINE_KINDS, tileIndex, type TileIndex } from './topology'
import { ALIGNMENTS, ROUTINGS, T, TIERS, TRANSFORMS, UNDERGROUND_TYPES, type Type } from './types'
import { EnumValue, isHandle, makeHandle, show, type Handle, type Value } from './values'

interface BlockDef {
  name: string
  params: Param[]
  body: Stmt[]
}

/** A belt written with `auto`, waiting for the finished blueprint before it decides. */
interface AutoRun {
  /** Where its tiles start in the scene; the path maps onto them one for one. */
  from: number
  path: Vec[]
  underground: Prototype
  reach: number
  loc: Loc
}

interface DefaultEntry {
  target?: string
  slot: string
  value: Value
}

class Scope {
  private readonly names = new Map<string, Value>()
  constructor(readonly parent?: Scope) {}

  get(name: string): { value: Value } | undefined {
    if (this.names.has(name)) return { value: this.names.get(name)! }
    return this.parent?.get(name)
  }
  set(name: string, value: Value): void {
    this.names.set(name, value)
  }
  child(): Scope {
    return new Scope(this)
  }
}

export interface RunResult {
  scene: Scene
  output: string[]
}

export class Runtime {
  scene = new Scene()
  offset: Vec = vec(0, 0)
  readonly output: string[] = []

  private readonly blocks = new Map<string, BlockDef>()
  /** Block calls being evaluated, innermost last, so `throw` can point at the caller. */
  private readonly callStack: Array<{ name: string; loc: Loc }> = []
  /**
   * `auto` belts, laid plainly as they are met and routed once the program has finished.
   *
   * Routing needs to know what the belt runs past, and a program is read top to bottom — so
   * deciding as we go would mean a belt only ever saw the half of the blueprint written above
   * it, and moving a splitter three lines up would change what got built. The tiles go down
   * straight away, which keeps handles and layout measurement honest, and only the choice
   * between belt, tunnel and nothing waits for the end.
   */
  private readonly autoRuns: AutoRun[] = []
  /** Innermost last. Each `defaults` statement pushes a frame for its scope. */
  private readonly defaults: DefaultEntry[][] = [[]]
  /**
   * While a layout combinator evaluates a child, `for` hands it the scene range of each pass,
   * so `row => { for i in 0..8 => { cell () } }` lays out eight items, not one clump. The
   * layout settles each pass as it arrives, which is what keeps `auto` seeing real neighbours.
   */
  private iterationSink: ((from: number, to: number) => void) | null = null

  /** Native helpers the imported libraries unlock. */
  private readonly unlocked: Set<string>

  constructor(
    readonly registry: ProtoRegistry,
    /** Libraries this program imported. */
    private readonly imported: ReadonlySet<string> = new Set(),
  ) {
    this.unlocked = new Set([...imported].flatMap((name) => MODULES[name]?.helpers ?? []))
  }

  run(module: Module): RunResult {
    this.scene = new Scene()
    this.offset = vec(0, 0)
    this.output.length = 0
    this.blocks.clear()

    for (const statement of module.statements) {
      if (statement.kind === 'defblock') {
        this.blocks.set(statement.name, { name: statement.name, params: statement.params, body: statement.body })
      }
    }

    const scope = new Scope()
    this.autoRuns.length = 0
    this.runStatements(module.statements, scope)
    this.settleAutoRuns()
    return { scene: this.scene, output: [...this.output] }
  }

  // ── Statements ──────────────────────────────────────────────────────────────

  private runStatements(statements: Stmt[], scope: Scope): void {
    for (const statement of statements) this.runStatement(statement, scope)
  }

  private runStatement(statement: Stmt, scope: Scope): void {
    switch (statement.kind) {
      case 'defblock':
        this.blocks.set(statement.name, { name: statement.name, params: statement.params, body: statement.body })
        return

      case 'def':
      case 'assign':
        scope.set(statement.name, this.evaluate(statement.value, scope))
        return

      case 'defaults': {
        const entries: DefaultEntry[] = []
        for (const arg of statement.args) {
          const form = argForm(arg, DEFAULT_SLOTS, (name) => this.isCallable(name))
          const value = this.evaluate(form.expr, scope)

          // Unlabelled values find their slot by type, exactly as the checker read them.
          const type = form.slotName ? undefined : typeOfValue(value)
          const slot = form.slotName ?? (type ? bareSlot(DEFAULT_SLOTS, type)?.name : undefined)
          if (!slot) continue

          entries.push({ target: statement.target, slot, value })
        }

        if (statement.body) {
          this.defaults.push(entries)
          try {
            this.runStatements(statement.body, scope.child())
          } finally {
            this.defaults.pop()
          }
        } else {
          this.defaults[this.defaults.length - 1].push(...entries)
        }
        return
      }

      case 'for': {
        const sink = this.iterationSink
        this.iterationSink = null
        const items = this.iterable(this.evaluate(statement.iterable, scope), statement.iterable.loc)
        try {
          for (const item of items) {
            const inner = scope.child()
            inner.set(statement.name, item)
            const from = this.scene.length
            this.runStatements(statement.body, inner)
            sink?.(from, this.scene.length)
          }
        } finally {
          this.iterationSink = sink
        }
        return
      }

      case 'if': {
        const condition = this.evaluate(statement.condition, scope)
        if (condition !== false && condition !== null) this.runStatements(statement.then, scope.child())
        else if (statement.else) this.runStatements(statement.else, scope.child())
        return
      }

      case 'block':
        this.runLayout(statement, scope)
        return

      case 'throw': {
        const value = this.evaluate(statement.value, scope)
        // A tuple reads as one message with spaces between the parts, like `print`.
        const message = Array.isArray(value) ? value.map(show).join(' ') : show(value)

        // The mistake is at the call, not at the guard that caught it, so that is where the
        // error goes — with the guard named, so it is clear which rule was broken.
        const call = this.callStack[this.callStack.length - 1]
        if (call) {
          // A library's line numbers mean nothing to someone reading their own file, so name
          // the library instead.
          const library = moduleOffering(call.name)
          const where =
            library && this.imported.has(library) ? `from ${library}` : `on line ${statement.loc.line}`
          fail(message, call.loc, `thrown by '${call.name}' ${where}`)
        }
        fail(message, statement.loc)
      }

      case 'import':
        // Resolved before running, by putting the library's statements in front.
        return

      case 'expr':
        this.evaluate(statement.expr, scope)
    }
  }

  /** The argument that filled a given slot, for the two slots read as syntax. */
  private structuredArg(args: Arg[], slots: SlotDef[], name: string): Arg | undefined {
    return args.find((arg) => argForm(arg, slots, (n) => this.isCallable(n)).slotName === name)
  }

  private readContentOf(args: Arg[], slots: SlotDef[]): ContentEntry[] | undefined {
    const arg = this.structuredArg(args, slots, 'content')
    if (!arg) return undefined
    const read = readContent(arg)
    if (!read.ok) return undefined
    return read.value.map((entry) => {
      const side = entry.side === 'left' || entry.side === 'right' ? entry.side : undefined
      return side ? { item: entry.item, side } : { item: entry.item }
    })
  }

  private readFiltersOf(args: Arg[], slots: SlotDef[]): FilterSpec | undefined {
    const arg = this.structuredArg(args, slots, 'filter')
    if (!arg) return undefined
    const read = readFilters(arg)
    if (!read.ok) return undefined
    return { items: read.value.items.map((item) => item.name), negated: read.value.negated }
  }

  /** Whether a bare name could head a call, which is what settles `label (…)` ambiguity. */
  private isCallable(name: string): boolean {
    return (
      name in BUILTINS ||
      this.blocks.has(name) ||
      this.registry.entities.has(name) ||
      name === 'belt' ||
      name === 'underground' ||
      (name === 'balancer' && this.unlocked.has('balancer'))
    )
  }

  private iterable(value: Value, loc?: Loc): Value[] {
    if (Array.isArray(value)) return value
    fail(`cannot iterate ${show(value)}`, loc)
  }

  // ── Layout ──────────────────────────────────────────────────────────────────

  private runLayout(statement: Extract<Stmt, { kind: 'block' }>, scope: Scope): Handle {
    const slots = LAYOUT_SLOTS[statement.form]
    const filled = this.fillSlots(statement.args, slots, statement.form, scope, false)

    if (statement.form === 'at') {
      const delta = this.toVec(filled.get('at') ?? [0, 0], 'at', statement.loc)
      return this.inFrame(addVec(this.offset, delta), () => this.runStatements(statement.body, scope.child()))
    }

    if (statement.form === 'transform') {
      const apply = memberOf(filled.get('apply'))
      if (!apply || !TRANSFORMS.includes(apply)) {
        fail(`transform needs one of ${TRANSFORMS.join(', ')}`, statement.loc)
      }
      // Build it the plain way round first, then turn what came out: everything inside sees an
      // ordinary frame, so `auto` and the layout forms need to know nothing about this.
      const from = this.scene.length
      this.inFrame(this.offset, () => this.runStatements(statement.body, scope.child()))
      this.scene.transform(from, this.scene.length, apply as SceneTransform)
      return rectHandle(this.scene.bbox(from, this.scene.length))
    }

    const axis = statement.form === 'row' ? 'x' : 'y'
    const cross = axis === 'x' ? 'y' : 'x'
    const mainSize = axis === 'x' ? 'w' : 'h'
    const crossSize = axis === 'x' ? 'h' : 'w'
    const gap = typeof filled.get('gap') === 'number' ? (filled.get('gap') as number) : 0
    const alignValue = filled.get('align')
    // No `align` means the author's own cross-axis placement stands.
    const align = alignValue instanceof EnumValue ? alignValue.member : null

    const origin = this.offset
    const start = this.scene.length
    const ranges: Array<{ from: number; to: number; crossStart: number; crossExtent: number }> = []
    /** Where the first item's box began; everything after it is packed against that. */
    let natural: number | null = null
    let cursor = 0

    /**
     * Settle one item into place and move the frame to where the next one begins. Positioning
     * as we go, rather than collecting everything and shifting at the end, is what lets a
     * belt's `auto` see its neighbours where they will actually stand.
     *
     * A layout only packs along its own axis. The first item stays exactly where it was
     * written and each one after it starts a gap past the one before; nothing is moved across
     * the axis unless `align` asks for it. A machine the author put above the line is meant to
     * be above the line, and a belt written next to the layout can count on finding it there.
     */
    const settle = (from: number, to: number) => {
      if (to === from) return
      const box = this.scene.bbox(from, to)!

      if (natural === null) {
        natural = box[axis]
        cursor = box[axis]
      }

      const dMain = cursor - box[axis]
      if (dMain) this.scene.translate(from, to, axis === 'x' ? dMain : 0, axis === 'y' ? dMain : 0)

      ranges.push({ from, to, crossStart: box[cross], crossExtent: box[crossSize] })
      cursor += box[mainSize] + gap

      // Put the frame where the next item's own coordinates will land it in place, so that
      // `auto` inside it already sees the truth.
      const ahead = cursor - natural
      this.offset = axis === 'x' ? vec(origin.x + ahead, origin.y) : vec(origin.x, origin.y + ahead)
    }

    try {
      if (statement.each) {
        const each = statement.each
        for (const value of this.iterable(this.evaluate(each.iterable, scope), each.iterable.loc)) {
          const inner = scope.child()
          inner.set(each.name, value)
          const from = this.scene.length
          this.runStatements(statement.body, inner)
          settle(from, this.scene.length)
        }
      } else {
        for (const child of statement.body) {
          let reported = false
          this.iterationSink = (from, to) => {
            reported = true
            settle(from, to)
          }
          const from = this.scene.length
          try {
            this.runStatement(child, scope)
          } finally {
            this.iterationSink = null
          }
          // A statement that reported no iterations of its own is a single item.
          if (!reported) settle(from, this.scene.length)
        }
      }
    } finally {
      this.offset = origin
    }

    if (align && ranges.length) {
      // Alignment is measured against the items themselves, not against the frame, so it
      // means the same thing wherever the layout sits.
      const front = Math.min(...ranges.map((r) => r.crossStart))
      const widest = Math.max(...ranges.map((r) => r.crossExtent))
      for (const range of ranges) {
        const slack = widest - range.crossExtent
        const offset = align === 'start' ? 0 : align === 'center' ? Math.floor(slack / 2) : slack
        const shift = front + offset - range.crossStart
        if (shift) this.scene.translate(range.from, range.to, cross === 'x' ? shift : 0, cross === 'y' ? shift : 0)
      }
    }

    return rectHandle(this.scene.bbox(start, this.scene.length))
  }

  private inFrame(origin: Vec, body: () => void, name?: string): Handle {
    const previous = this.offset
    const start = this.scene.length
    this.offset = origin
    try {
      body()
    } finally {
      this.offset = previous
    }
    return rectHandle(this.scene.bbox(start, this.scene.length), name ? { name } : {})
  }

  // ── Expressions ─────────────────────────────────────────────────────────────

  private evaluate(expr: Expr, scope: Scope): Value {
    switch (expr.kind) {
      case 'number':
        return expr.value
      case 'text':
        return expr.value
      case 'tuple': {
        // An item may itself be `name (…)`: a nested call, not a label.
        const items = expr.entries
          ? expr.entries.map((entry) =>
              entry.asCall && entry.label && this.isCallable(entry.label) ? entry.asCall : entry.value,
            )
          : expr.items
        return items.map((item) => this.evaluate(item, scope))
      }

      case 'name': {
        const bound = scope.get(expr.name)
        if (bound) return bound.value
        return new EnumValue(this.enumOf(expr.name), expr.name)
      }

      case 'ternary': {
        const condition = this.evaluate(expr.condition, scope)
        // Truthiness as `if` reads it: only false and nothing are false.
        const taken = condition !== false && condition !== null ? expr.then : expr.otherwise
        return this.evaluate(taken, scope)
      }

      case 'range': {
        const from = Number(this.evaluate(expr.from, scope))
        const to = Number(this.evaluate(expr.to, scope))
        const out: Value[] = []
        for (let i = from; i < to; i++) out.push(i)
        return out
      }

      case 'unary': {
        const operand = this.evaluate(expr.operand, scope)
        if (expr.op === 'not') return operand === false || operand === null
        return -Number(operand)
      }

      case 'binary':
        return this.evaluateBinary(expr, scope)

      case 'field':
        return this.evaluateField(expr, scope)

      case 'measure': {
        const start = this.scene.length
        this.evaluate(expr.body, scope)
        const end = this.scene.length
        const box = this.scene.bbox(start, end)
        this.scene.cut(start, end)
        return rectHandle(box)
      }

      case 'call':
        return this.evaluateCall(expr, scope)
    }
  }

  /**
   * A bare name that is not a variable is a member of one of the vocabularies. The order
   * mirrors Universe.bareEnum in the checker, so both agree on what `blue` means.
   */
  private enumOf(name: string): string {
    if (directionFromName(name) !== undefined) return 'direction'
    if (TIERS.includes(name)) return 'tier'
    if (this.registry.qualities.includes(name)) return 'quality'
    if (UNDERGROUND_TYPES.includes(name)) return 'underground-type'
    if (ALIGNMENTS.includes(name)) return 'align'
    if (TRANSFORMS.includes(name)) return 'transform'
    if (ROUTINGS.includes(name)) return 'routing'
    if (this.registry.modules.has(name)) return 'item'
    if (this.registry.recipes.has(name)) return 'recipe'
    return 'item'
  }

  private evaluateBinary(expr: Extract<Expr, { kind: 'binary' }>, scope: Scope): Value {
    if (expr.op === 'and') {
      const left = this.evaluate(expr.left, scope)
      return left === false || left === null ? left : this.evaluate(expr.right, scope)
    }
    if (expr.op === 'or') {
      const left = this.evaluate(expr.left, scope)
      return left === false || left === null ? this.evaluate(expr.right, scope) : left
    }

    const left = this.evaluate(expr.left, scope)
    const right = this.evaluate(expr.right, scope)

    switch (expr.op) {
      case '==':
        return sameValue(left, right)
      case '!=':
        return !sameValue(left, right)
      case '<':
        return Number(left) < Number(right)
      case '<=':
        return Number(left) <= Number(right)
      case '>':
        return Number(left) > Number(right)
      case '>=':
        return Number(left) >= Number(right)
      case '+':
        return Number(left) + Number(right)
      case '-':
        return Number(left) - Number(right)
      case '*':
        return Number(left) * Number(right)
      case '%':
        return Number(left) % Number(right)
      case '/': {
        if (Number(right) === 0) fail('division by zero', expr.loc)
        return Number(left) / Number(right)
      }
      default:
        return fail(`unknown operator '${expr.op}'`, expr.loc)
    }
  }

  private evaluateField(expr: Extract<Expr, { kind: 'field' }>, scope: Scope): Value {
    const target = this.evaluate(expr.target, scope)

    if (Array.isArray(target)) {
      if (expr.field === 'x') return target[0] ?? 0
      if (expr.field === 'y') return target[1] ?? 0
      fail(`a coordinate has only .x and .y`, expr.loc)
    }

    if (isHandle(target)) {
      const value = (target as Record<string, unknown>)[expr.field]
      if (value === undefined) fail(`no field '.${expr.field}'`, expr.loc)
      return value as Value
    }

    return fail(`${show(target)} has no fields`, expr.loc)
  }

  // ── Calls ───────────────────────────────────────────────────────────────────

  private evaluateCall(expr: Extract<Expr, { kind: 'call' }>, scope: Scope): Value {
    // A building held in a variable: `machine (at (0, 0))`.
    const bound = scope.get(expr.callee)
    if (bound) {
      const name = memberOf(bound.value)
      if (!name) fail(`'${expr.callee}' is not something you can place`, expr.loc)
      const block = this.blocks.get(name)
      if (block) return this.placeBlock(block, expr.args, scope, expr.loc)
      const proto = this.registry.entities.get(name)
      if (proto) return this.placeEntity(proto, expr.args, scope, expr.loc)
      fail(`'${name}' is not an entity or a block`, expr.loc)
    }

    const builtin = BUILTINS[expr.callee]
    if (builtin) {
      // A function takes plain values, so `count (xs)` inside one is a nested call, not a
      // label with a parenthesised value.
      return builtin(
        expr.args.map((arg) =>
          this.evaluate(arg.asCall && arg.label && this.isCallable(arg.label) ? arg.asCall : arg.value, scope),
        ),
        this,
        expr.loc,
      )
    }

    const block = this.blocks.get(expr.callee)
    if (block) return this.placeBlock(block, expr.args, scope, expr.loc)

    const proto = this.registry.entities.get(expr.callee)
    if (proto) return this.placeEntity(proto, expr.args, scope, expr.loc)

    if (expr.callee === 'belt') return this.placeBelt(expr.args, scope, expr.loc)
    if (expr.callee === 'underground') return this.placeUnderground(expr.args, scope, expr.loc)
    if (expr.callee === 'balancer' && this.unlocked.has('balancer')) {
      return this.placeBalancer(expr.args, scope, expr.loc)
    }

    return fail(`unknown name '${expr.callee}'`, expr.loc)
  }

  /** Turns argument nodes into slot values, then fills the gaps from the `defaults` chain. */
  private fillSlots(
    args: Arg[],
    slots: SlotDef[],
    calleeName: string,
    scope: Scope,
    applyDefaults = true,
    target?: { name: string; kind: string },
    /**
     * Direct calls are already gated by the checker, so an unknown slot here can only come
     * from an `entity` parameter, where the real prototype was not knowable. Dropping the
     * value with a warning is kinder than refusing to build the blueprint.
     */
    unknownSlot: 'fail' | 'skip' = 'fail',
  ): Map<string, Value> {
    const filled = new Map<string, Value>()

    for (const arg of args) {
      const form = argForm(arg, slots, (name) => this.isCallable(name))
      let slot: SlotDef | undefined

      if (form.slotName) {
        slot = findSlot(slots, form.slotName)
        if (!slot) {
          if (unknownSlot === 'fail') fail(`'${calleeName}' has no slot '${form.slotName}'`, form.labelLoc)
          const value = this.evaluate(form.expr, scope)
          // An empty list asked for nothing, so there is nothing to warn about.
          if (!(Array.isArray(value) && value.length === 0)) {
            this.scene.warn(`${calleeName} has no '${form.slotName}' slot — ignored`, form.labelLoc ?? form.loc)
          }
          continue
        }
      } else {
        const value = this.evaluate(form.expr, scope)
        const type = typeOfValue(value)
        slot = type ? bareSlot(slots, type) : undefined
        if (!slot) fail(`this value needs a label`, form.loc)
        filled.set(slot.name, value)
        continue
      }

      // Content and filters are read from the arguments as written, not evaluated: the
      // pairing and the `not` live in the syntax and a value would flatten them away.
      filled.set(slot.name, slot.type.k === 'content' || slot.type.k === 'filters' ? null : this.evaluate(form.expr, scope))
    }

    if (applyDefaults && target) {
      for (const slot of slots) {
        if (filled.has(slot.name)) continue
        const fallback = this.lookupDefault(slot.name, target)
        if (fallback !== undefined) filled.set(slot.name, fallback)
      }
    }

    return filled
  }

  /** Innermost scope wins; inside a scope, an entity name beats a family beats a bare slot. */
  private lookupDefault(slot: string, target: { name: string; kind: string }): Value | undefined {
    for (let i = this.defaults.length - 1; i >= 0; i--) {
      const frame = this.defaults[i]
      for (const preference of [target.name, target.kind, undefined]) {
        const entry = frame.findLast((e) => e.slot === slot && e.target === preference)
        if (entry) return entry.value
      }
    }
    return undefined
  }

  // ── Placement ───────────────────────────────────────────────────────────────

  private placeBlock(block: BlockDef, args: Arg[], scope: Scope, loc: Loc): Handle {
    const slots = blockSlots(
      block.params.map((p) => ({
        name: p.name,
        typeName: p.type.name,
        array: p.type.array,
        required: p.default === undefined,
      })),
      () => T.any,
    )
    const filled = this.fillSlots(args, slots, block.name, scope, false)

    const inner = new Scope()
    for (const param of block.params) {
      if (filled.has(param.name)) inner.set(param.name, filled.get(param.name)!)
      else if (param.default) inner.set(param.name, this.evaluate(param.default, inner))
      else fail(`'${block.name}' needs ${param.name}`, loc)
    }

    const at = filled.has('at') ? this.toVec(filled.get('at')!, 'at', loc) : vec(0, 0)
    this.callStack.push({ name: block.name, loc })
    try {
      return this.inFrame(addVec(this.offset, at), () => this.runStatements(block.body, inner), block.name)
    } finally {
      this.callStack.pop()
    }
  }

  private placeEntity(proto: Prototype, args: Arg[], scope: Scope, loc: Loc): Handle {
    const slots = entitySlots(proto, this.registry.profile.supportsQuality)
    const filled = this.fillSlots(
      args,
      slots,
      proto.label,
      scope,
      true,
      { name: proto.name, kind: proto.kind },
      'skip',
    )

    const at = filled.has('at') ? this.toVec(filled.get('at')!, 'at', loc) : vec(0, 0)
    const position = addVec(this.offset, at)

    let dir = this.toDirection(filled.get('dir'), loc)
    if (filled.has('from') && proto.kind === 'inserter') {
      dir = oppositeDirection(this.toDirection(filled.get('from'), loc))
    }

    const modules = this.toModules(filled.get('modules'), loc)
    // The checker catches these when the value is written out; a computed one lands here.
    if (modules && modules.length > proto.moduleSlots) {
      this.scene.warn(`${proto.label} has ${proto.moduleSlots} module slot(s) but ${modules.length} were given`, loc)
    }
    const recipe = memberOf(filled.get('recipe'))
    if (recipe) {
      const known = this.registry.recipes.get(recipe)
      if (!known) this.scene.warn(`unknown recipe '${recipe}'`, loc)
      else if (known.producers && !known.producers.includes(proto.name)) {
        this.scene.warn(`${proto.label} cannot craft ${recipe}`, loc)
      }
    }

    const side = (value: Value | undefined): 'left' | 'right' | undefined => {
      const member = memberOf(value)
      return member === 'left' || member === 'right' ? member : undefined
    }

    const entity = this.scene.place(proto, position.x, position.y, dir, {
      recipe,
      modules,
      content: this.readContentOf(args, slots),
      filters: proto.kind === 'inserter' ? this.readFiltersOf(args, slots) : undefined,
      splitterFilter: proto.kind === 'splitter' ? memberOf(filled.get('filter')) : undefined,
      inPriority: side(filled.get('in-priority')),
      outPriority: side(filled.get('out-priority')),
      quality: memberOf(filled.get('quality')),
      undergroundType: proto.kind === 'underground-belt' ? ((memberOf(filled.get('type')) ?? 'input') as 'input' | 'output') : undefined,
      loc,
    })

    return rectHandle({ x: entity.x, y: entity.y, w: entity.w, h: entity.h }, {
      name: proto.name,
      dir: new EnumValue('direction', directionName(entity.dir)),
    })
  }

  private beltProto(family: 'belt' | 'underground', filled: Map<string, Value>, loc: Loc): Prototype {
    const tier = memberOf(filled.get('tier')) ?? 'normal'
    const name = this.registry.resolveTier(family, tier)
    if (!name) fail(`no ${family} tier '${tier}'`, loc, 'try yellow, red, blue or green')
    return this.registry.entities.get(name)!
  }

  private placeBelt(args: Arg[], scope: Scope, loc: Loc): Handle {
    const filled = this.fillSlots(args, HELPER_SLOTS.belt, 'belt', scope, true, { name: 'belt', kind: 'belt' })
    const proto = this.beltProto('belt', filled, loc)

    const start = filled.has('from') ? addVec(this.offset, this.toVec(filled.get('from')!, 'from', loc)) : this.offset
    const points: Vec[] = [start]

    for (const point of toCoordList(filled.get('via'))) {
      points.push(addVec(this.offset, this.toVec(point, 'via', loc)))
    }

    const fallbackDir = this.toDirection(filled.get('dir'), loc)
    if (filled.has('to')) {
      points.push(addVec(this.offset, this.toVec(filled.get('to')!, 'to', loc)))
    } else if (filled.has('length')) {
      const length = Number(filled.get('length'))
      const step = directionStep(fallbackDir)
      const last = points[points.length - 1]
      points.push(vec(last.x + step.x * (length - 1), last.y + step.y * (length - 1)))
    }

    const content = this.readContentOf(args, HELPER_SLOTS.belt)
    const corners = points.filter((p, i) => i === 0 || p.x !== points[i - 1].x || p.y !== points[i - 1].y)
    const path = expandPath(corners, loc)
    const from = this.scene.length

    const routing = memberOf(filled.get('route')) ?? 'direct'

    for (let i = 0; i < path.length; i++) {
      const next = path[i + 1]
      const previous = path[i - 1]
      const dir = next
        ? directionBetween(path[i], next)!
        : previous
          ? directionBetween(previous, path[i])!
          : fallbackDir

      this.scene.place(proto, path[i].x, path[i].y, dir, { content, loc })
    }

    if (routing === 'auto') {
      const underground = this.beltProto('underground', filled, loc)
      this.autoRuns.push({
        from,
        path,
        underground,
        reach: underground.undergroundReach ?? 0,
        loc,
      })
    }

    return rectHandle(this.scene.bbox(from, this.scene.length), {
      name: proto.name,
      tiles: path.length,
      from: [path[0].x, path[0].y],
      to: [path[path.length - 1].x, path[path.length - 1].y],
    })
  }

  /** Which way the belt leaves this tile; the last tile keeps the heading of the one before. */
  private headingAt(path: Vec[], i: number): number | undefined {
    const ahead = path[i + 1] ? directionBetween(path[i], path[i + 1]) : undefined
    return ahead ?? (path[i - 1] ? directionBetween(path[i - 1], path[i]) : undefined)
  }

  /**
   * Routes every `auto` belt now that the whole blueprint stands, in the order they were
   * written. Each one sees the finished scene apart from the runs still waiting their turn,
   * so a belt yields to one written above it and never to one written below.
   */
  private settleAutoRuns(): void {
    if (this.autoRuns.length === 0) return

    const waiting = new Set<number>()
    for (const run of this.autoRuns) {
      for (let i = 0; i < run.path.length; i++) waiting.add(run.from + i)
    }
    const dropped = new Set<number>()

    for (const run of this.autoRuns) {
      for (let i = 0; i < run.path.length; i++) waiting.delete(run.from + i)

      const standing = this.scene.entities.filter(
        (_, index) => !waiting.has(index) && !dropped.has(index) && !this.isRunTile(run, index),
      )
      const occupied = tileIndex(standing, () => true)

      const tiles: TileState[] = run.path.map((point, i) => {
        const there = occupied.get(`${point.x},${point.y}`)
        if (!there) return 'free'
        return flowsWith(there, this.headingAt(run.path, i)) ? 'through' : 'blocked'
      })

      const plan = planRoute(run.path, tiles, run.reach)
      if (!plan.ok) this.reportRoute(plan, occupied, run)

      for (let i = 0; i < run.path.length; i++) {
        const entity = this.scene.entities[run.from + i]
        const step = (plan as { steps: RouteStep[] }).steps[i]

        if (step === 'skip') dropped.add(run.from + i)
        else if (step === 'in' || step === 'out') {
          entity.proto = run.underground
          entity.undergroundType = step === 'in' ? 'input' : 'output'
        }
      }
    }

    if (dropped.size) this.scene.remove(dropped)
  }

  private isRunTile(run: AutoRun, index: number): boolean {
    return index >= run.from && index < run.from + run.path.length
  }

  /** Turns a routing failure into something the author can act on. */
  private reportRoute(plan: Extract<RouteResult, { ok: false }>, occupied: TileIndex, run: AutoRun): never {
    const where = `(${plan.at.x}, ${plan.at.y})`
    const standing = occupied.get(`${plan.at.x},${plan.at.y}`)
    const what = standing ? standing.proto.label : 'something'
    // A line pointing the other way is the one that catches people out: a belt joins one
    // going its own way, so the mismatch is worth saying out loud.
    const crosswise =
      standing && LINE_KINDS.has(standing.proto.kind)
        ? `it runs ${directionName(standing.dir)}; a belt merges into a line going its own way and tunnels under any other`
        : undefined

    switch (plan.reason) {
      case 'starts-blocked':
        fail(`the belt starts on ${what} at ${where}`, run.loc, crosswise ?? 'a tunnel needs a free tile to dive from')
      case 'ends-blocked':
        fail(`the belt ends on ${what} at ${where}`, run.loc, crosswise ?? 'a tunnel needs a free tile to surface on')
      case 'turns':
        fail(`the belt turns at ${where}, where it has to tunnel`, run.loc, 'move the corner clear of the obstacle')
      case 'too-far':
        fail(
          `${plan.needed} tiles to tunnel at ${where}, but ${run.underground.label} reaches ${run.reach}`,
          run.loc,
          this.longerTier(run.reach),
        )
    }
  }

  /** Names a tier that would actually clear the gap, if there is one. */
  private longerTier(reach: number): string | undefined {
    const better = ['yellow', 'red', 'blue', 'green']
      .map((tier) => ({ tier, proto: this.registry.entities.get(this.registry.resolveTier('underground', tier) ?? '') }))
      .filter((c) => c.proto && (c.proto.undergroundReach ?? 0) > reach)
    return better.length ? `${better[0].tier} reaches ${better[0].proto!.undergroundReach}` : undefined
  }

  private placeUnderground(args: Arg[], scope: Scope, loc: Loc): Handle {
    const filled = this.fillSlots(args, HELPER_SLOTS.underground, 'underground', scope, true, {
      name: 'underground',
      kind: 'underground-belt',
    })
    const proto = this.beltProto('underground', filled, loc)

    const start = filled.has('from') ? addVec(this.offset, this.toVec(filled.get('from')!, 'from', loc)) : this.offset
    if (!filled.has('to')) fail('underground needs to', loc, 'underground (from (0, 0) to (5, 0))')
    const end = addVec(this.offset, this.toVec(filled.get('to')!, 'to', loc))

    const dir = directionBetween(start, end)
    if (dir === undefined) fail('an underground entry and exit must share a row or column', loc)

    const span = Math.abs(end.x - start.x) + Math.abs(end.y - start.y)
    if (proto.undergroundReach !== undefined && span - 1 > proto.undergroundReach) {
      this.scene.warn(`${proto.label} spans ${span - 1} tiles but reaches ${proto.undergroundReach}`, loc)
    }

    const content = this.readContentOf(args, HELPER_SLOTS.underground)
    const from = this.scene.length
    this.scene.place(proto, start.x, start.y, dir, { undergroundType: 'input', content, loc })
    this.scene.place(proto, end.x, end.y, dir, { undergroundType: 'output', content, loc })
    return rectHandle(this.scene.bbox(from, this.scene.length), { name: proto.name })
  }

  /** Expands a library balancer into belts, undergrounds and splitters of the chosen tier. */
  private placeBalancer(args: Arg[], scope: Scope, loc: Loc): Handle {
    const filled = this.fillSlots(args, HELPER_SLOTS.balancer, 'balancer', scope, true, {
      name: 'balancer',
      kind: 'belt',
    })

    const from = Number(filled.get('in'))
    const to = Number(filled.get('to'))
    const dir = this.toDirection(filled.get('dir'), loc)
    if (dir % 4 !== 0) fail('a balancer runs along an axis', loc, 'use north, east, south or west')

    const layout = balancerLayout(from, to, dir)
    if (!layout) {
      fail(
        `there is no ${from} to ${to} balancer in the library`,
        loc,
        `inputs and outputs both run from 1 to ${BALANCER_LIMIT}`,
      )
    }

    const tier = memberOf(filled.get('tier')) ?? 'normal'
    const protoFor = (family: 'belt' | 'underground' | 'splitter') => {
      const name = this.registry.resolveTier(family, tier)
      if (!name) fail(`no ${family} tier '${tier}'`, loc, 'try yellow, red, blue or green')
      return this.registry.entities.get(name)!
    }
    const protos = {
      [BELT]: protoFor('belt'),
      [UNDERGROUND]: protoFor('underground'),
      [SPLITTER]: protoFor('splitter'),
    }

    const at = filled.has('at') ? this.toVec(filled.get('at')!, 'at', loc) : vec(0, 0)
    const origin = addVec(this.offset, at)
    const start = this.scene.length

    for (const part of layout.parts) {
      this.scene.place(protos[part.kind], origin.x + part.x, origin.y + part.y, part.dir, {
        undergroundType: part.kind === UNDERGROUND ? (part.underground === 1 ? 'output' : 'input') : undefined,
        loc,
      })
    }

    return rectHandle(this.scene.bbox(start, this.scene.length), {
      name: `balancer ${from}-${to}`,
      lanes: from,
      outputs: to,
    })
  }

  // ── Coercions ───────────────────────────────────────────────────────────────

  toVec(value: Value, what: string, loc?: Loc): Vec {
    if (Array.isArray(value) && value.length === 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
      return vec(value[0], value[1])
    }
    return fail(`${what} needs a coordinate like (2, 3), got ${show(value)}`, loc)
  }

  private toDirection(value: Value | undefined, loc?: Loc): number {
    if (value === undefined || value === null) return Direction.north
    if (typeof value === 'number') return ((value % 16) + 16) % 16
    const member = memberOf(value)
    const dir = member === undefined ? undefined : directionFromName(member)
    if (dir === undefined) fail(`'${show(value)}' is not a direction`, loc)
    return dir
  }

  private toModules(value: Value | undefined, loc?: Loc): ModuleSpec[] | undefined {
    if (value === undefined || value === null) return undefined
    const items = Array.isArray(value) ? value : [value]
    const modules = items.map((item): ModuleSpec => {
      if (Array.isArray(item)) {
        const [name, quality] = item
        return { name: memberOf(name) ?? String(name), quality: quality === undefined ? undefined : memberOf(quality) }
      }
      return { name: memberOf(item) ?? String(item) }
    })
    void loc
    return modules.length ? modules : undefined
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** `via (10, 0)` is one corner; `via ((10, 0), (10, 6))` is two. */
function toCoordList(value: Value | undefined): Value[] {
  if (!Array.isArray(value) || value.length === 0) return []
  return typeof value[0] === 'number' ? [value] : value
}

/** The static type a runtime value would have, for deciding which slot a bare value fills. */
function typeOfValue(value: Value): Type | undefined {
  if (typeof value === 'number') return Number.isInteger(value) ? T.int : T.float
  if (value instanceof EnumValue) return T.enum(value.enumName as never)
  if (Array.isArray(value) && value.length === 2 && value.every((v) => typeof v === 'number')) return T.coord
  return undefined
}

function memberOf(value: Value | undefined): string | undefined {
  if (value instanceof EnumValue) return value.member
  if (typeof value === 'string') return value
  return undefined
}

function sameValue(a: Value, b: Value): boolean {
  if (a instanceof EnumValue && b instanceof EnumValue) return a.member === b.member
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => sameValue(x, b[i]))
  return a === b
}

function expandPath(points: Vec[], loc?: Loc): Vec[] {
  if (points.length <= 1) return points
  const path: Vec[] = [points[0]]
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i]
    const b = points[i + 1]
    const dir = directionBetween(a, b)
    if (dir === undefined) {
      fail(
        `a belt leg from (${a.x}, ${a.y}) to (${b.x}, ${b.y}) is diagonal`,
        loc,
        'belts run horizontally or vertically; add a via corner',
      )
    }
    const step = directionStep(dir)
    let cursor = a
    while (cursor.x !== b.x || cursor.y !== b.y) {
      cursor = vec(cursor.x + step.x, cursor.y + step.y)
      path.push(cursor)
    }
  }
  return path
}

/**
 * What a placement evaluates to. `right` and `bottom` are exclusive edges, so `a.right` is
 * the first free column next to it.
 */
function rectHandle(rect: Rect | null, extra: Record<string, Value> = {}): Handle {
  const box = rect ?? { x: 0, y: 0, w: 0, h: 0 }
  return makeHandle({
    x: box.x,
    y: box.y,
    left: box.x,
    top: box.y,
    right: box.x + box.w,
    bottom: box.y + box.h,
    width: box.w,
    height: box.h,
    size: [box.w, box.h],
    pos: [box.x, box.y],
    center: [box.x + box.w / 2, box.y + box.h / 2],
    ...extra,
  })
}

type Builtin = (args: Value[], runtime: Runtime, loc: Loc) => Value

const BUILTINS: Record<string, Builtin> = {
  repeat: (args) => Array.from({ length: Number(args[0]) }, () => args[1]),
  count: (args) => (Array.isArray(args[0]) ? args[0].length : 0),
  min: (args) => Math.min(...args.map(Number)),
  max: (args) => Math.max(...args.map(Number)),
  abs: (args) => Math.abs(Number(args[0])),
  floor: (args) => Math.floor(Number(args[0])),
  ceil: (args) => Math.ceil(Number(args[0])),
  round: (args) => Math.round(Number(args[0])),
  print: (args, runtime) => {
    runtime.output.push(args.map(show).join(' '))
    return null
  },
  ingredients: (args, runtime, loc) => {
    const id = memberOf(args[0])
    const recipe = id ? runtime.registry.recipes.get(id) : undefined
    if (!recipe) fail(`unknown recipe '${show(args[0])}'`, loc)
    return Object.keys(recipe.in ?? {}).map((name) => new EnumValue('item', name))
  },
  'craft-time': (args, runtime) => {
    const id = memberOf(args[0])
    return (id ? runtime.registry.recipes.get(id)?.time : undefined) ?? 0
  },
  'module-slots': (args, runtime) => {
    const id = memberOf(args[0])
    return (id ? runtime.registry.entities.get(id)?.moduleSlots : undefined) ?? 0
  },

  // `recipe` and `entity` are separate vocabularies that happen to share names: `steel-chest`
  // is something you craft and something you place. These carry a name from one to the other,
  // and say so plainly when it has no twin — a block holding `recipe r` cannot place `r`
  // without asking for it.
  'to-entity': (args, runtime, loc) => {
    const id = memberOf(args[0])
    if (!id || !runtime.registry.entities.has(id)) {
      fail(`there is nothing called '${show(args[0])}' to place`, loc, 'to-entity needs a recipe named after a building')
    }
    return new EnumValue('entity', id)
  },
  'to-recipe': (args, runtime, loc) => {
    const id = memberOf(args[0])
    if (!id || !runtime.registry.recipes.has(id)) {
      fail(`nothing crafts '${show(args[0])}'`, loc, 'to-recipe needs a building named after a recipe')
    }
    return new EnumValue('recipe', id)
  },

  width: (args, runtime, loc) => footprint(args[0], runtime, loc).x,
  height: (args, runtime, loc) => footprint(args[0], runtime, loc).y,
}

/** The tiles an entity covers unturned. A block has no fixed size, so `measure` owns that. */
function footprint(value: Value, runtime: Runtime, loc: Loc): Vec {
  const id = memberOf(value)
  const proto = id ? runtime.registry.entities.get(id) : undefined
  if (!proto) {
    fail(
      `'${show(value)}' has no size of its own`,
      loc,
      'a block is whatever it builds — use `measure (block ())` for that',
    )
  }
  return proto.size
}
