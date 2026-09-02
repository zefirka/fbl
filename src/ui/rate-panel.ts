import type { RateEntry, Rates } from '../core'
import {
  collapsedBar,
  parseView,
  perSecond,
  rows,
  ROWS,
  tabBar,
  type PanelDeps,
  type PanelView,
} from './panel'

/**
 * What the blueprint eats and what it makes, per second, with every machine running.
 *
 * Two sides of one number rather than two panels: a line that turns plates into gears wants
 * both — how fast the belts have to arrive, and how fast the belt out has to leave.
 */
export const RATE_SECTIONS = ['consumption', 'production'] as const
export type RateSection = (typeof RATE_SECTIONS)[number]
export type RateView = PanelView<RateSection>

export const DEFAULT_RATE_VIEW: RateView = { collapsed: true, section: 'consumption' }

export const parseRateView = (stored: string | null): RateView =>
  parseView(stored, RATE_SECTIONS, DEFAULT_RATE_VIEW)

const SECTION_NOTE: Record<RateSection, string> = {
  consumption: 'what the machines draw in, with every one of them crafting',
  production: 'what comes out, recipes and productivity counted',
}

export function renderRates(rates: Rates, view: RateView, deps: PanelDeps): string {
  // Belts and chests make nothing; there is no rate to show until something crafts.
  if (rates.crafting === 0 && rates.idle === 0) return ''
  if (view.collapsed) return collapsedBar('rates', 'show what this makes')

  const lists: Record<RateSection, RateEntry[]> = {
    consumption: rates.consumption,
    production: rates.production,
  }
  const entries = lists[view.section]
  const shown = entries.slice(0, ROWS)
  const hidden = entries.length - shown.length

  // Both words are long enough that the bar has no room left for a count, so what the
  // numbers are made of goes underneath them instead.
  const counted = `${rates.crafting} machine${rates.crafting === 1 ? '' : 's'}`
  const idle = rates.idle > 0 ? ` · ${rates.idle} with no recipe set` : ''

  return `
    ${tabBar(RATE_SECTIONS, view.section, SECTION_NOTE, '', 'hide the rates')}
    <ul class="panel-list">${rows(shown.map((e) => ({ item: e.item, value: perSecond(e.perSecond) })), deps)}</ul>
    ${hidden > 0 ? `<div class="panel-more">+${hidden} more</div>` : ''}
    <div class="panel-note">${counted}${idle}</div>`
}
