import type { ProtoRegistry } from '../core'
import type { Flow, Solution } from '../core'
import { nodeKey } from '../core'
import type { SankeyLink, SankeyNode } from '../ui/sankey'

/**
 * Turning a solved plan into something a diagram can lay out.
 *
 * The one decision worth arguing about is what a ribbon's width means. Items a second is the
 * obvious answer and the wrong one: water moves at four hundred a second and copper wire at
 * forty, so every chain would be drawn as a river with some threads beside it. What is
 * actually comparable — and what anyone reading the diagram is about to go and build — is how
 * much *carrying* a flow takes. So a width is belts: a rate over what one belt of the chosen
 * tier holds, and for a fluid, over what a pipe holds.
 *
 * Rates are still what the labels say. The width is for the eye; the number is for the plan.
 */

/** A pipe carries about this much a second over the short runs a factory is made of. */
export const PIPE_THROUGHPUT = 1000

export interface Carrier {
  /** Items a second one belt of the chosen tier holds. */
  belt: number
  isFluid: (item: string) => boolean
}

export const capacityFor = (carrier: Carrier, item: string) =>
  carrier.isFluid(item) ? PIPE_THROUGHPUT : carrier.belt

export type TerminalKind = 'input' | 'output' | 'surplus'

export interface CardModel {
  key: string
  kind: 'recipe' | TerminalKind
  /** The recipe id, for a recipe card; the item, for a terminal. */
  id: string
  /** Belts through it, which is what the layout turns into a height. */
  load: number
}

export interface DiagramModel {
  cards: CardModel[]
  nodes: SankeyNode[]
  links: SankeyLink[]
  /** Every flow, by the key its ribbon is tagged with, for labels and hover. */
  flows: Map<string, Flow>
}

export function diagramOf(solution: Solution, carrier: Carrier): DiagramModel {
  const load = new Map<string, { in: number; out: number }>()
  const bump = (key: string, side: 'in' | 'out', belts: number) => {
    const held = load.get(key) ?? { in: 0, out: 0 }
    held[side] += belts
    load.set(key, held)
  }

  const links: SankeyLink[] = []
  const flows = new Map<string, Flow>()

  for (const [i, flow] of solution.flows.entries()) {
    const belts = flow.rate / capacityFor(carrier, flow.item)
    const tag = `f${i}`
    flows.set(tag, flow)
    links.push({ from: flow.from, to: flow.to, weight: belts, tag })
    bump(flow.from, 'out', belts)
    bump(flow.to, 'in', belts)
  }

  const cards: CardModel[] = []
  const see = (key: string, kind: CardModel['kind'], id: string) => {
    const through = load.get(key) ?? { in: 0, out: 0 }
    cards.push({ key, kind, id, load: Math.max(through.in, through.out) })
  }

  for (const node of solution.nodes) see(nodeKey.recipe(node.recipe), 'recipe', node.recipe)
  for (const item of solution.inputs.keys()) see(nodeKey.input(item), 'input', item)
  for (const target of new Set(solution.flows.filter((f) => f.to.startsWith('output:')).map((f) => f.to))) {
    see(target, 'output', target.slice('output:'.length))
  }
  for (const item of solution.surplus.keys()) see(nodeKey.surplus(item), 'surplus', item)

  const nodes: SankeyNode[] = cards.map((card) => ({
    key: card.key,
    weight: card.load,
    minHeight: card.kind === 'recipe' ? 132 : 46,
  }))

  return { cards, nodes, links, flows }
}

/** 45.2/s, 0.83/s — enough digits to be worth reading, never more. */
export function rateText(rate: number): string {
  if (rate === 0) return '0/s'
  if (rate >= 100) return `${Math.round(rate)}/s`
  if (rate >= 10) return `${rate.toFixed(1).replace(/\.0$/, '')}/s`
  if (rate >= 1) return `${rate.toFixed(2).replace(/0$/, '').replace(/\.$/, '')}/s`
  return `${rate.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')}/s`
}

/** "1.4 belts", "0.3 pipes" — what carrying this flow actually costs. */
export function carryText(carrier: Carrier, item: string, rate: number): string {
  const share = rate / capacityFor(carrier, item)
  const unit = carrier.isFluid(item) ? 'pipe' : 'belt'
  const rounded = share >= 10 ? Math.round(share) : Number(share.toFixed(share >= 1 ? 1 : 2))
  return `${rounded} ${unit}${rounded === 1 ? '' : 's'}`
}

export function labelOf(registry: ProtoRegistry, item: string): string {
  return registry.itemLabels.get(item) ?? item
}
