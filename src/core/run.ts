import { argForm } from './args'
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
import { planRoute, type RouteStep } from './routing'
import { Scene, type ModuleSpec } from './scene'
import { bareSlot, blockSlots, entitySlots, findSlot, HELPER_SLOTS, LAYOUT_SLOTS, type SlotDef } from './slots'
import { tileIndex } from './topology'
import { ALIGNMENTS, ROUTINGS, T, TIERS, UNDERGROUND_TYPES, type Type } from './types'
import { EnumValue, isHandle, makeHandle, show, type Handle, type Value } from './values'

interface BlockDef {
  name: string
  params: Param[]
  body: Stmt[]
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
  /** Innermost last. Each `defaults` statement pushes a frame for its scope. */
  private readonly defaults: DefaultEntry[][] = [[]]
  /**
   * While a layout combinator evaluates a child, `for` hands it the scene range of each pass,
   * so `row => { for i in 0..8 => { cell () } }` lays out eight items, not one clump. The
   * layout settles each pass as it arrives, which is what keeps `auto` seeing real neighbours.
   */
  private iterationSink: ((from: number, to: number) => void) | null = null

  constructor(readonly registry: ProtoRegistry) {}

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
    this.runStatements(module.statements, scope)
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
          const form = argForm(arg, [])
          if (!form.slotName) continue
          entries.push({ target: statement.target, slot: form.slotName, value: this.evaluate(form.expr, scope) })
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

      case 'expr':
        this.evaluate(statement.expr, scope)
    }
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

    const axis = statement.form === 'row' ? 'x' : 'y'
    const cross = axis === 'x' ? 'y' : 'x'
    const mainSize = axis === 'x' ? 'w' : 'h'
    const crossSize = axis === 'x' ? 'h' : 'w'
    const gap = typeof filled.get('gap') === 'number' ? (filled.get('gap') as number) : 0
    const alignValue = filled.get('align')
    const align = alignValue instanceof EnumValue ? alignValue.member : 'start'

    const origin = this.offset
    const start = this.scene.length
    const ranges: Array<{ from: number; to: number; crossExtent: number }> = []
    let cursor = 0

    /**
     * Settle one item into place and move the frame to where the next one begins. Positioning
     * as we go, rather than collecting everything and shifting at the end, is what lets a
     * belt's `auto` see its neighbours where they will actually stand.
     */
    const settle = (from: number, to: number) => {
      if (to === from) return
      const box = this.scene.bbox(from, to)!

      const dMain = origin[axis] + cursor - box[axis]
      this.scene.translate(from, to, axis === 'x' ? dMain : 0, axis === 'y' ? dMain : 0)
      const dCross = origin[cross] - box[cross]
      this.scene.translate(from, to, cross === 'x' ? dCross : 0, cross === 'y' ? dCross : 0)

      ranges.push({ from, to, crossExtent: box[crossSize] })
      cursor += box[mainSize] + gap
      this.offset = axis === 'x' ? vec(origin.x + cursor, origin.y) : vec(origin.x, origin.y + cursor)
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

    if (align === 'center' || align === 'end') {
      const widest = Math.max(0, ...ranges.map((r) => r.crossExtent))
      for (const range of ranges) {
        const slack = widest - range.crossExtent
        const shift = align === 'center' ? Math.floor(slack / 2) : slack
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
      case 'tuple':
        return expr.items.map((item) => this.evaluate(item, scope))

      case 'name': {
        const bound = scope.get(expr.name)
        if (bound) return bound.value
        return new EnumValue(this.enumOf(expr.name), expr.name)
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
      return builtin(
        expr.args.map((arg) => this.evaluate(arg.value, scope)),
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
    if (expr.callee === 'balancer') return this.placeBalancer(expr.args, scope, expr.loc)

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
      const form = argForm(arg, slots)
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

      filled.set(slot.name, this.evaluate(form.expr, scope))
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
    return this.inFrame(addVec(this.offset, at), () => this.runStatements(block.body, inner), block.name)
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

    const entity = this.scene.place(proto, position.x, position.y, dir, {
      recipe,
      modules,
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

    const corners = points.filter((p, i) => i === 0 || p.x !== points[i - 1].x || p.y !== points[i - 1].y)
    const path = expandPath(corners, loc)
    const from = this.scene.length

    const routing = memberOf(filled.get('route')) ?? 'direct'
    const steps =
      routing === 'auto' ? this.routeUnder(path, filled, loc) : (path.map(() => 'belt') as RouteStep[])

    const undergroundProto = routing === 'auto' ? this.beltProto('underground', filled, loc) : undefined

    for (let i = 0; i < path.length; i++) {
      if (steps[i] === 'skip') continue

      const next = path[i + 1]
      const previous = path[i - 1]
      const dir = next
        ? directionBetween(path[i], next)!
        : previous
          ? directionBetween(previous, path[i])!
          : fallbackDir

      if (steps[i] === 'belt') {
        this.scene.place(proto, path[i].x, path[i].y, dir, { loc })
      } else {
        this.scene.place(undergroundProto!, path[i].x, path[i].y, dir, {
          undergroundType: steps[i] === 'in' ? 'input' : 'output',
          loc,
        })
      }
    }

    return rectHandle(this.scene.bbox(from, this.scene.length), {
      name: proto.name,
      tiles: path.length,
      from: [path[0].x, path[0].y],
      to: [path[path.length - 1].x, path[path.length - 1].y],
    })
  }

  /** `auto`: tunnel under whatever is already standing on the path. */
  private routeUnder(path: Vec[], filled: Map<string, Value>, loc: Loc): RouteStep[] {
    const underground = this.beltProto('underground', filled, loc)
    const reach = underground.undergroundReach ?? 0

    // Only what was placed before this belt counts; `auto` routes around existing work.
    const occupied = tileIndex(this.scene.entities, () => true)
    const blocked = path.map((p) => occupied.has(`${p.x},${p.y}`))

    const plan = planRoute(path, blocked, reach)
    if (plan.ok) return plan.steps

    const where = `(${plan.at.x}, ${plan.at.y})`
    switch (plan.reason) {
      case 'starts-blocked':
        fail(`the belt starts on something at ${where}`, loc, 'a tunnel needs a free tile to dive from')
      case 'ends-blocked':
        fail(`the belt ends on something at ${where}`, loc, 'a tunnel needs a free tile to surface on')
      case 'no-room':
        fail(
          `two obstacles too close together at ${where}`,
          loc,
          'one tile cannot be both the exit of a tunnel and the entry of the next',
        )
      case 'turns':
        fail(`the belt turns at ${where}, where it has to tunnel`, loc, 'move the corner clear of the obstacle')
      case 'too-far':
        fail(
          `${plan.needed} tiles to tunnel at ${where}, but ${underground.label} reaches ${reach}`,
          loc,
          this.longerTier(reach),
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

    const from = this.scene.length
    this.scene.place(proto, start.x, start.y, dir, { undergroundType: 'input', loc })
    this.scene.place(proto, end.x, end.y, dir, { undergroundType: 'output', loc })
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
}
