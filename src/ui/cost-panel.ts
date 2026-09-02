import type { Cost, CostEntry } from '../core'
import {
  collapsedBar,
  compact,
  parseView,
  rows,
  ROWS,
  tabBar,
  type PanelDeps,
  type PanelView,
} from './panel'

/** The three depths the panel shows, deepest first. */
export const COST_SECTIONS = ['raw', 'basic', 'items'] as const
export type CostSection = (typeof COST_SECTIONS)[number]
export type CostView = PanelView<CostSection>

export const DEFAULT_COST_VIEW: CostView = { collapsed: false, section: 'raw' }

export const parseCostView = (stored: string | null): CostView =>
  parseView(stored, COST_SECTIONS, DEFAULT_COST_VIEW)

const SECTION_NOTE: Record<CostSection, string> = {
  raw: 'what the game extracts: ore, lava, oil, water, fruit',
  basic: 'the materials those are processed into: plates, steel, plastic',
  items: 'what the schema places',
}

export function renderCost(cost: Cost, view: CostView, deps: PanelDeps): string {
  if (cost.items.length === 0) return ''
  if (view.collapsed) return collapsedBar('cost', 'show the cost')

  const lists: Record<CostSection, CostEntry[]> = { raw: cost.raw, basic: cost.basic, items: cost.items }
  const entries = lists[view.section]
  const shown = entries.slice(0, ROWS)
  const hidden = entries.length - shown.length
  const placed = cost.items.reduce((total, entry) => total + entry.amount, 0)

  return `
    ${tabBar(COST_SECTIONS, view.section, SECTION_NOTE, `${placed} placed`, 'hide the cost')}
    <ul class="panel-list">${rows(shown.map((e) => ({ item: e.item, value: compact(e.amount) })), deps)}</ul>
    ${hidden > 0 ? `<div class="panel-more">+${hidden} more</div>` : ''}`
}
