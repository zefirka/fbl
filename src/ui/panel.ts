import type { LabIcon } from '../data/dataset'
import { iconStyle, type IconSheet } from './icons'

/**
 * The bits every overlay panel is made of: a bar of tabs, a list of items with icons, and a
 * way to fold the whole thing down to a pill when it is in the way.
 *
 * Cost and rates are the same object showing different numbers, so they share the markup and
 * the stylesheet rather than each growing their own. What differs is the sections they offer
 * and how a value is written, and both of those arrive from the caller.
 */

export type { IconSheet }

export interface PanelDeps {
  icon: (name: string) => LabIcon | undefined
  label: (name: string) => string
  sheet: IconSheet | null
}

/** Which section is showing, and whether the panel is showing anything at all. */
export interface PanelView<Section extends string> {
  collapsed: boolean
  section: Section
}

/** Tolerant of whatever is in storage, including shapes older versions wrote. */
export function parseView<Section extends string>(
  stored: string | null,
  sections: readonly Section[],
  fallback: PanelView<Section>,
): PanelView<Section> {
  try {
    const value = stored ? (JSON.parse(stored) as Partial<PanelView<Section>>) : null
    if (!value || typeof value !== 'object') return fallback

    const section = sections.find((name) => name === value.section) ?? fallback.section
    return { collapsed: value.collapsed === true, section }
  } catch {
    return fallback
  }
}

/** Rows before a list gives up and counts the rest. */
export const ROWS = 12

export const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** 940 → "940", 12 400 → "12.4k", 3 200 000 → "3.2M". */
export function compact(amount: number): string {
  const value = Math.ceil(amount)
  if (value < 10_000) return String(value)
  if (value < 1_000_000) return `${(value / 1000).toFixed(value < 100_000 ? 1 : 0)}k`
  return `${(value / 1_000_000).toFixed(1)}M`
}

/**
 * A per-second rate at a useful number of digits: 45/s needs none, 0.033/s is the whole of
 * what a rocket line does and rounding it away would leave a zero.
 */
export function perSecond(rate: number): string {
  if (rate > 0 && rate < 0.001) return '<0.001/s'

  const digits = rate >= 100 ? 0 : rate >= 10 ? 1 : rate >= 1 ? 2 : 3
  const fixed = rate.toFixed(digits)
  const text = fixed.includes('.') ? fixed.replace(/0+$/, '').replace(/\.$/, '') : fixed
  return `${text}/s`
}

export interface PanelRow {
  item: string
  value: string
}

export function rows(entries: PanelRow[], deps: PanelDeps): string {
  return entries
    .map((entry) => {
      const style = iconStyle(deps.icon(entry.item), deps.sheet)
      const name = deps.label(entry.item)
      return `
        <li title="${escape(name)}">
          <i class="panel-icon" style="${style}"></i>
          <span class="panel-name">${escape(name)}</span>
          <span class="panel-value">${escape(entry.value)}</span>
        </li>`
    })
    .join('')
}

/** Collapsed, the whole bar is the way back — a 17px × is a small thing to have to hit. */
export function collapsedBar(title: string, hint: string): string {
  return `
    <button type="button" class="panel-bar panel-bar-alone" data-panel-toggle title="${escape(hint)}">
      <span class="panel-title">${escape(title)}</span>
      <span class="panel-collapse">+</span>
    </button>`
}

export function tabBar<Section extends string>(
  sections: readonly Section[],
  active: Section,
  notes: Record<Section, string>,
  trailing: string,
  hint: string,
): string {
  const tabs = sections
    .map(
      (name) => `
      <button type="button" data-panel-section="${name}" title="${escape(notes[name])}"
              class="${name === active ? 'active' : ''}">${name}</button>`,
    )
    .join('')

  return `
    <div class="panel-bar">
      ${tabs}
      <span class="panel-total">${escape(trailing)}</span>
      <button type="button" class="panel-collapse" data-panel-toggle title="${escape(hint)}">×</button>
    </div>`
}
