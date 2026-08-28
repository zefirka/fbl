import type { Cost, CostEntry } from '../core'
import type { LabIcon } from '../data/dataset'

/** The three depths the panel shows, deepest first. */
export const COST_SECTIONS = ['raw', 'basic', 'items'] as const
export type CostSection = (typeof COST_SECTIONS)[number]

/** Which section is showing, and whether the panel is showing anything at all. */
export interface CostView {
  collapsed: boolean
  section: CostSection
}

export const DEFAULT_VIEW: CostView = { collapsed: false, section: 'raw' }

/** Tolerant of whatever is in storage, including shapes older versions wrote. */
export function parseView(stored: string | null): CostView {
  try {
    const value = stored ? (JSON.parse(stored) as Partial<CostView>) : null
    if (!value || typeof value !== 'object') return DEFAULT_VIEW

    const section = COST_SECTIONS.find((name) => name === value.section) ?? DEFAULT_VIEW.section
    return { collapsed: value.collapsed === true, section }
  } catch {
    return DEFAULT_VIEW
  }
}

export interface IconSheet {
  url: string
  width: number
  height: number
}

export interface CostPanelDeps {
  icon: (name: string) => LabIcon | undefined
  label: (name: string) => string
  sheet: IconSheet | null
}

/** Item icons are 64px on a 66px grid; this shrinks the whole sheet to fit a small chip. */
const ICON_PX = 18
const ICON_CELL = 64

/** Rows before the list gives up and counts the rest. */
const ROWS = 12

const SECTION_NOTE: Record<CostSection, string> = {
  raw: 'what the game extracts: ore, lava, oil, water, fruit',
  basic: 'the materials those are processed into: plates, steel, plastic',
  items: 'what the schema places',
}

function iconStyle(icon: LabIcon | undefined, sheet: IconSheet | null): string {
  if (!icon || !sheet) return ''
  const scale = ICON_PX / ICON_CELL
  return [
    `background-image:url(${sheet.url})`,
    `background-size:${sheet.width * scale}px ${sheet.height * scale}px`,
    `background-position:${-icon.x * scale}px ${-icon.y * scale}px`,
  ].join(';')
}

/** 940 → "940", 12 400 → "12.4k", 3 200 000 → "3.2M". */
export function compact(amount: number): string {
  const value = Math.ceil(amount)
  if (value < 10_000) return String(value)
  if (value < 1_000_000) return `${(value / 1000).toFixed(value < 100_000 ? 1 : 0)}k`
  return `${(value / 1_000_000).toFixed(1)}M`
}

function rows(entries: CostEntry[], deps: CostPanelDeps): string {
  return entries
    .map((entry) => {
      const style = iconStyle(deps.icon(entry.item), deps.sheet)
      const name = deps.label(entry.item)
      return `
        <li title="${escape(name)}">
          <i class="cost-icon" style="${style}"></i>
          <span class="cost-name">${escape(name)}</span>
          <span class="cost-amount">${compact(entry.amount)}</span>
        </li>`
    })
    .join('')
}

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function renderCost(cost: Cost, view: CostView, deps: CostPanelDeps): string {
  if (cost.items.length === 0) return ''

  // Collapsed, the whole bar is the way back — a 17px × is a small thing to have to hit.
  if (view.collapsed) {
    return `
      <button type="button" class="cost-bar cost-bar-alone" data-cost-toggle title="show the cost">
        <span class="cost-title">cost</span>
        <span class="cost-collapse">+</span>
      </button>`
  }

  const lists: Record<CostSection, CostEntry[]> = { raw: cost.raw, basic: cost.basic, items: cost.items }
  const entries = lists[view.section]
  const shown = entries.slice(0, ROWS)
  const hidden = entries.length - shown.length
  const placed = cost.items.reduce((total, entry) => total + entry.amount, 0)

  const tabs = COST_SECTIONS.map(
    (name) => `
      <button type="button" data-cost-section="${name}" title="${SECTION_NOTE[name]}"
              class="${name === view.section ? 'active' : ''}">${name}</button>`,
  ).join('')

  return `
    <div class="cost-bar">
      ${tabs}
      <span class="cost-total">${placed} placed</span>
      <button type="button" class="cost-collapse" data-cost-toggle title="hide the cost">×</button>
    </div>
    <ul class="cost-list">${rows(shown, deps)}</ul>
    ${hidden > 0 ? `<div class="cost-more">+${hidden} more</div>` : ''}`
}
