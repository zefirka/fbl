import type { ProtoRegistry } from '../proto'
import type { ModuleSpec } from '../scene'
import { bestMachine, isFrontier, priceOf, recipeGraph, type RecipeGraph } from './graph'
import { minimise, type LPStatus } from './simplex'
import { addEffects, beaconEffects, moduleEffects, throughputOf, NO_EFFECTS, type Effects } from './machine'

/**
 * Working out what a factory has to run at.
 *
 * The question looks like division — you want so many a second, so how many machines — and
 * for a chain of single-output recipes it is. Factories are not that. A refinery makes three
 * things at once and cracking turns two of them back into the third, so "how much refining"
 * and "how much cracking" are one question with one answer, and walking the recipes down
 * never finds it.
 *
 * So it is put to a linear programme: one variable per recipe, one row per item saying that
 * what is made covers what is used, and the whole thing minimised against what it draws out
 * of the ground. Everything else falls out of the same frame rather than needing a rule of
 * its own — machines you already have are a row fixing that recipe's rate, a target you
 * cannot reach leaves a shortfall the solver would rather pay than fail, and a byproduct
 * nobody wants becomes surplus because the rows only ask that supply not fall short.
 *
 * Which recipes are on the table is yours to say: the one chosen for each item, plus whatever
 * else you have turned on. That split is deliberate — the solver decides how fast, never what
 * with, so nothing appears in a plan because an optimiser found it cheap.
 *
 * What comes out is not just the rates: it is the flows between them, which is what a diagram
 * needs. Supply and demand for each item are matched proportionally, so a byproduct is drawn
 * going where it actually goes, and whatever nobody wanted is left over in plain sight.
 */

export interface Target {
  item: string
  /** Items a second. */
  rate: number
}

export interface NodeConfig {
  machine?: string
  modules?: ModuleSpec[]
  beacon?: { name: string; count: number; modules: ModuleSpec[]; quality?: string }
  /** The quality the machine itself is built to. */
  quality?: string
  /** Machines you already have: the solver works around this rather than deciding it. */
  pin?: number
}

export interface CalcConfig {
  targets: Target[]
  /** Which recipe makes an item, where there is a choice. */
  choice: Record<string, string>
  /** Recipes turned on beyond the default one per item: cracking, a second smelting route. */
  extra: Record<string, string>
  /** Items to stop at, or to carry on past, against the default frontier. */
  frontier: Record<string, 'raw' | 'expand'>
  nodes: Record<string, NodeConfig>
}

export const EMPTY_CONFIG: CalcConfig = { targets: [], choice: {}, extra: {}, frontier: {}, nodes: {} }

/** A recipe running at a rate, and what it takes to run it there. */
export interface SolvedNode {
  recipe: string
  /** Crafts a second. */
  crafts: number
  machine?: string
  /** Fractional on purpose: the rounding up is a decision, not an answer. */
  machines: number
  /** Crafts a second one of these machines gets through, as configured. */
  perMachine: number
  effects: Effects
  productivity: number
  pinned: boolean
}

/** Where a rate goes. Both ends are node keys; see `nodeKey`. */
export interface Flow {
  from: string
  to: string
  item: string
  /** Items a second. */
  rate: number
}

export interface Shortfall {
  item: string
  /** Items a second the plan cannot make, whatever it does. */
  rate: number
}

export interface Solution {
  status: LPStatus
  nodes: SolvedNode[]
  flows: Flow[]
  /** Items drawn from outside the plan, and what they cost a second. */
  inputs: Map<string, number>
  /** What the plan makes and nothing in it wants. */
  surplus: Map<string, number>
  shortfalls: Shortfall[]
}

export const nodeKey = {
  recipe: (id: string) => `recipe:${id}`,
  input: (item: string) => `input:${item}`,
  output: (item: string) => `output:${item}`,
  surplus: (item: string) => `surplus:${item}`,
}

const EPSILON = 1e-9

/**
 * Nudges, small enough not to move a real decision: prefer less work, and less waste. They are
 * scaled against what a raw item costs, which the dataset reckons in hundreds.
 */
const WORK_PRICE = 1e-2
const WASTE_PRICE = 1e-1

/**
 * How much worse it is to fall short of what was asked for than of something in the middle.
 *
 * Falling short of an intermediate is bad; falling short of the target is giving up. Only the
 * ratio matters, because going short is settled on its own before anything is costed — see
 * below.
 */
const TARGET_WEIGHT = 1000

export function solve(registry: ProtoRegistry, config: CalcConfig): Solution {
  const graph = recipeGraph(registry)
  const plan = new Map<string, SolvedNode>()

  /** Everything about a recipe that does not depend on how fast it is running. */
  const nodeFor = (id: string): SolvedNode | undefined => {
    const held = plan.get(id)
    if (held) return held

    const recipe = graph.usable.get(id)
    if (!recipe) return undefined

    const settings = config.nodes[id] ?? {}
    const machine = settings.machine ?? bestMachine(registry, recipe)
    const effects = addEffects(
      moduleEffects(settings.modules, registry),
      settings.beacon
        ? beaconEffects(
            registry,
            settings.beacon.name,
            settings.beacon.count,
            settings.beacon.modules,
            settings.beacon.quality,
          )
        : NO_EFFECTS,
    )
    const each = machine ? throughputOf(registry, machine, recipe, effects, settings.quality) : undefined

    const node: SolvedNode = {
      recipe: id,
      crafts: 0,
      machine,
      machines: 0,
      perMachine: each?.crafts ?? 0,
      effects,
      productivity: each?.productivity ?? 1,
      pinned: settings.pin !== undefined,
    }
    plan.set(id, node)
    return node
  }

  const targeted = new Set(config.targets.map((target) => target.item))

  /** Whether the plan may simply help itself to an item rather than making it. */
  const stops = (item: string): boolean => {
    if (targeted.has(item)) return false
    const said = config.frontier[item]
    return said ? said === 'raw' : isFrontier(graph, item)
  }

  /** The recipe answerable for an item: what the plan turns to when it runs short. */
  const chosen = (item: string): string | undefined => {
    const asked = config.choice[item]
    if (asked && graph.usable.has(asked)) return asked
    return graph.producers.get(item)?.[0]
  }

  // ── Which recipes are on the table ──────────────────────────────────────────
  // The chosen one for every item the targets reach, then whatever has been turned on by
  // hand. That order is the whole trick: an extra is something to do with what the plan
  // already makes, so by the time cracking is considered the refinery behind it is standing,
  // and heavy oil is not looked up as though nobody were making any.
  const enabled: string[] = []
  const chain = new Set<string>()
  const makes = new Set<string>()

  const enable = (id: string | undefined): boolean => {
    if (!id || chain.has(id) || !graph.usable.has(id) || !nodeFor(id)) return false
    chain.add(id)
    enabled.push(id)
    for (const item of Object.keys(graph.usable.get(id)?.out ?? {})) makes.add(item)
    return true
  }

  /**
   * Walks what the enabled recipes need until nothing new turns up.
   *
   * Every wanted item gets its chosen producer, even one something already makes as a
   * byproduct. Turning a recipe on is not the same as running it — the solver sets it to zero
   * if the byproduct covers the demand, and the nudge against pointless work keeps it there.
   * Deciding here instead would mean deciding on no evidence: a quantum processor hands back
   * five of the ten fluoroketone it took, so *something* makes it and it still needs a source
   * for the other half. Skipping one on that reasoning left eight items unmakeable.
   */
  const spread = (): void => {
    for (let sweep = 0; sweep < 64; sweep++) {
      const wanted = new Set<string>()
      for (const id of enabled) {
        for (const item of Object.keys(graph.usable.get(id)?.in ?? {})) wanted.add(item)
      }

      let grew = false
      for (const item of wanted) {
        if (stops(item)) continue
        if (enable(chosen(item))) grew = true
      }
      if (!grew) return
    }
  }

  for (const item of targeted) enable(chosen(item))
  for (const id of Object.keys(config.nodes)) if (config.nodes[id].pin !== undefined) enable(id)
  spread()

  // An extra is what to do with a surplus of something, so it only comes on while something in
  // the plan is making that something. Otherwise cutting a chain off at the top would leave
  // cracking behind, and cracking would go looking for oil to crack — putting back the very
  // refinery that was just taken off the bus, or worse, a coal mine to replace it.
  for (let round = 0; round < 16; round++) {
    let grew = false
    for (const [item, id] of Object.entries(config.extra)) {
      if (makes.has(item) && enable(id)) grew = true
    }
    if (!grew) break
    spread()
  }

  // ── Rows: one per item the plan touches ─────────────────────────────────────
  const items: string[] = []
  const rowOf = new Map<string, number>()
  const seeItem = (item: string) => {
    if (rowOf.has(item)) return
    rowOf.set(item, items.length)
    items.push(item)
  }
  for (const item of targeted) seeItem(item)
  for (const id of enabled) {
    const recipe = graph.usable.get(id)!
    for (const item of Object.keys(recipe.in ?? {})) seeItem(item)
    for (const item of Object.keys(recipe.out ?? {})) seeItem(item)
  }

  const pins = enabled.filter((id) => config.nodes[id]?.pin !== undefined)

  // Columns: a rate for each recipe, then what each item may be bought in, left over, or go
  // short by. Buying is only offered where the plan is allowed to stop.
  const buyAt = (row: number) => enabled.length + row
  const surplusAt = (row: number) => enabled.length + items.length + row
  const shortAt = (row: number) => enabled.length + items.length * 2 + row
  const columns = enabled.length + items.length * 3
  const rows = items.length + pins.length

  const A = Array.from({ length: rows }, () => new Array(columns).fill(0))
  const b = new Array(rows).fill(0)
  const c = new Array(columns).fill(0)

  for (const [column, id] of enabled.entries()) {
    const recipe = graph.usable.get(id)!
    const node = plan.get(id)!

    for (const [item, count] of Object.entries(recipe.in ?? {})) A[rowOf.get(item)!][column] -= count
    for (const [item, count] of Object.entries(recipe.out ?? {})) {
      A[rowOf.get(item)!][column] += count * node.productivity
    }
    c[column] += WORK_PRICE
  }

  for (const [row, item] of items.entries()) {
    if (stops(item)) {
      A[row][buyAt(row)] = 1
      c[buyAt(row)] = priceOf(graph, item)
    }
    A[row][surplusAt(row)] = -1
    c[surplusAt(row)] = WASTE_PRICE
    A[row][shortAt(row)] = 1
  }
  for (const target of config.targets) b[rowOf.get(target.item)!] += target.rate

  // Machines you already have are a fact about the world: that recipe runs at their rate.
  for (const [offset, id] of pins.entries()) {
    const row = items.length + offset
    A[row][enabled.indexOf(id)] = 1
    b[row] = (config.nodes[id]?.pin ?? 0) * (plan.get(id)?.perMachine ?? 0)
  }

  /**
   * Two passes, and the order is the point.
   *
   * Going short is settled first, on its own: minimise what the plan cannot make, weighing a
   * target far above an intermediate. Only then is the cost of what is left minimised, with
   * that shortfall held at what the first pass found.
   *
   * It was one pass and a big number for the shortfall, and that quietly broke on anything
   * expensive. The dataset prices ore at a hundred a unit, so a processing unit runs to about
   * ten thousand and a battery MK2 takes fifteen of them — past any constant, at which point
   * the solver would rather declare the thing unmakeable than pay for it. Seventeen items were
   * unmakeable that way, all of them perfectly ordinary. A price cannot be picked large enough
   * to be safe, so nothing is priced against anything of a different kind.
   */
  const shortfallCost = new Array(columns).fill(0)
  for (const [row, item] of items.entries()) {
    shortfallCost[shortAt(row)] = targeted.has(item) ? TARGET_WEIGHT : 1
  }

  const first = minimise(A, b, shortfallCost)
  let answer = first

  if (first.status === 'optimal') {
    const unmet = first.x.reduce((sum, value, column) => sum + value * shortfallCost[column], 0)

    // Held with a hair of slack rather than pinned exactly: the bound comes out of a floating
    // point sum, and demanding it to the last bit can make the second pass infeasible. The
    // hair is relative and tiny — a slack of any size is a shortfall the second pass is
    // allowed to help itself to, and it comes straight out of the answer.
    const held = A.map((row) => [...row, 0])
    held.push([...shortfallCost, 1])
    const slack = Math.max(1e-9, unmet * 1e-9)
    const second = minimise(held, [...b, unmet + slack], [...c, 0])
    if (second.status === 'optimal') answer = second
  }

  for (const [column, id] of enabled.entries()) {
    const node = plan.get(id)!
    node.crafts = answer.x[column] ?? 0
    node.machines = node.perMachine > 0 ? node.crafts / node.perMachine : 0
  }

  const bought = new Map<string, number>()
  const shortfalls: Shortfall[] = []
  for (const [row, item] of items.entries()) {
    const buy = answer.x[buyAt(row)] ?? 0
    if (buy > EPSILON) bought.set(item, buy)
    const missing = answer.x[shortAt(row)] ?? 0
    if (missing > 1e-6) shortfalls.push({ item, rate: missing })
  }

  return {
    ...flowsOf(graph, plan, config, bought),
    status: answer.status,
    nodes: [...plan.values()].filter((node) => node.crafts > EPSILON || node.pinned),
    shortfalls,
  }
}

/**
 * Who feeds whom. Each item's producers and consumers are matched in proportion, so a
 * consumer drawing from two sources is drawn drawing from both, in the ratio they supply.
 */
function flowsOf(
  graph: RecipeGraph,
  nodes: Map<string, SolvedNode>,
  config: CalcConfig,
  bought: Map<string, number>,
): { flows: Flow[]; inputs: Map<string, number>; surplus: Map<string, number> } {
  const supply = new Map<string, Array<{ key: string; rate: number }>>()
  const demand = new Map<string, Array<{ key: string; rate: number }>>()
  const push = (
    into: Map<string, Array<{ key: string; rate: number }>>,
    item: string,
    key: string,
    rate: number,
  ) => {
    if (rate <= EPSILON) return
    const list = into.get(item)
    if (list) list.push({ key, rate })
    else into.set(item, [{ key, rate }])
  }

  for (const node of nodes.values()) {
    const recipe = graph.usable.get(node.recipe)
    if (!recipe || node.crafts <= EPSILON) continue
    const key = nodeKey.recipe(node.recipe)
    for (const [item, count] of Object.entries(recipe.in ?? {})) push(demand, item, key, count * node.crafts)
    for (const [item, count] of Object.entries(recipe.out ?? {})) {
      push(supply, item, key, count * node.crafts * node.productivity)
    }
  }

  for (const target of config.targets) push(demand, target.item, nodeKey.output(target.item), target.rate)

  // What the plan buys in comes from outside; what it cannot use it puts down.
  const surplus = new Map<string, number>()
  for (const [item, rate] of bought) push(supply, item, nodeKey.input(item), rate)

  for (const [item, made] of supply) {
    const spare = total(made) - total(demand.get(item))
    if (spare > EPSILON) {
      push(demand, item, nodeKey.surplus(item), spare)
      surplus.set(item, spare)
    }
  }

  const flows: Flow[] = []
  for (const [item, sources] of supply) {
    const sinks = demand.get(item) ?? []
    const made = total(sources)
    if (made <= EPSILON) continue

    for (const sink of sinks) {
      for (const source of sources) {
        const rate = (sink.rate * source.rate) / made
        if (rate > EPSILON) flows.push({ from: source.key, to: sink.key, item, rate })
      }
    }
  }

  return { flows, inputs: bought, surplus }
}

const total = (list: Array<{ rate: number }> | undefined) =>
  (list ?? []).reduce((sum, entry) => sum + entry.rate, 0)
