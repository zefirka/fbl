import type { Cost, CostEntry } from '../core'
import type { LabIcon } from '../data/dataset'

export type CostMode = 'raw' | 'items'

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

export function renderCost(cost: Cost, mode: CostMode, deps: CostPanelDeps): string {
  const entries = mode === 'raw' ? cost.raw : cost.items
  if (entries.length === 0) return ''

  const placed = cost.items.reduce((total, entry) => total + entry.amount, 0)

  return `
    <div class="cost-tabs">
      <button type="button" data-cost-mode="raw" class="${mode === 'raw' ? 'active' : ''}">raw</button>
      <button type="button" data-cost-mode="items" class="${mode === 'items' ? 'active' : ''}">items</button>
      <span class="cost-total">${placed} placed</span>
    </div>
    <ul class="cost-list">${rows(entries.slice(0, 12), deps)}</ul>
    ${entries.length > 12 ? `<div class="cost-more">+${entries.length - 12} more</div>` : ''}
    ${
      mode === 'raw'
        ? `<div class="cost-note">follows recipes down to whatever the game extracts directly</div>`
        : ''
    }
    ${cost.unresolved.length ? `<div class="cost-note cost-warn">no recipe: ${cost.unresolved.slice(0, 3).map(escape).join(', ')}</div>` : ''}`
}
