import type { ProtoRegistry, Solution } from '../core'
import { iconStyle, type IconSheet } from '../ui/icons'
import type { CalcState } from './state'
import { labelOf, rateText, type Carrier } from './view'

/**
 * The rail down the side: what you asked for, and what the answer costs in total.
 *
 * Everything here is about the plan as a whole. Anything about one recipe lives on that
 * recipe's card, where you are already looking when you want to change it.
 */

export interface RailContext {
  registry: ProtoRegistry
  sheet: IconSheet | null
  state: CalcState
  solution: Solution
  carrier: Carrier
}

const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const chip = (ctx: RailContext, item: string, px = 18) =>
  `<i class="chip" style="${iconStyle(ctx.registry.icons.get(item), ctx.sheet, px)}"></i>`

export function railHtml(ctx: RailContext): string {
  return `
    <section class="rail-block">
      <h2>What do you want</h2>
      <ul class="targets">${ctx.state.targets.map((target, i) => targetRow(ctx, target.item, target.rate, i)).join('')}</ul>
      <button type="button" class="pick wide" data-pick-open="target" data-for="new">
        <i class="chip empty"></i><span>add an item…</span>
      </button>
    </section>

    ${summary(ctx)}
    ${expanded(ctx)}

    <section class="rail-block">
      <h2>Counted in</h2>
      <button type="button" class="pick wide" data-pick-open="belt" data-for="belt">
        ${chip(ctx, ctx.state.belt)}<span>${escape(labelOf(ctx.registry, ctx.state.belt))}</span>
      </button>
      <p class="hint">ribbon width is how many belts a flow takes; fluids count in pipes</p>
      <button type="button" class="ghost wide" id="reset">start over</button>
    </section>`
}

function targetRow(ctx: RailContext, item: string, rate: number, index: number): string {
  return `
    <li>
      ${chip(ctx, item)}
      <span class="name" title="${escape(labelOf(ctx.registry, item))}">${escape(labelOf(ctx.registry, item))}</span>
      <input type="number" min="0" step="any" value="${rate}" data-target-rate="${index}" aria-label="a second" />
      <span class="per">p/s</span>
      <button type="button" class="x" data-target-drop="${index}" aria-label="remove">×</button>
    </li>`
}

/**
 * Everything that has been told where to come from, either way round. It lives here as well as
 * on the cards because a card is not always there: take a thing off the bus and the node that
 * made it is gone, and with it the only place the decision was written down.
 */
function expanded(ctx: RailContext): string {
  const said = Object.entries(ctx.state.frontier)
  if (said.length === 0) return ''

  return `
    <section class="rail-block">
      <h2>Told where to come from</h2>
      <ul class="targets">
        ${said
          .map(
            ([item, how]) => `<li>${chip(ctx, item)}
              <span class="name">${escape(labelOf(ctx.registry, item))}</span>
              <span class="how">${how === 'raw' ? 'from the bus' : 'made here'}</span>
              <button type="button" class="x" data-forget="${escape(item)}" title="back to the default">×</button>
            </li>`,
          )
          .join('')}
      </ul>
    </section>`
}

function summary(ctx: RailContext): string {
  const { solution } = ctx
  if (solution.nodes.length === 0 && solution.inputs.size === 0) return ''

  const machines = solution.nodes.reduce((sum, node) => sum + Math.ceil(node.machines - 1e-6), 0)
  const power = solution.nodes.reduce((sum, node) => {
    const spec = ctx.registry.machines.get(node.machine ?? '')
    return sum + node.machines * (spec?.usage ?? 0)
  }, 0)

  const rows = (title: string, entries: Iterable<[string, number]>, tone = '') => {
    const list = [...entries].sort((a, b) => b[1] - a[1])
    if (list.length === 0) return ''
    return `
      <h2 class="${tone}">${title}</h2>
      <ul class="tally">
        ${list
          .map(
            ([item, rate]) =>
              `<li>${chip(ctx, item)}<span class="name">${escape(labelOf(ctx.registry, item))}</span><span class="rate">${escape(rateText(rate))}</span></li>`,
          )
          .join('')}
      </ul>`
  }

  return `
    <section class="rail-block">
      <h2>The plan</h2>
      <div class="totals">
        <span><b>${machines}</b> machines</span>
        <span><b>${power >= 1000 ? `${(power / 1000).toFixed(1)} MW` : `${Math.round(power)} kW`}</b></span>
      </div>
      ${rows('Raw in', ctx.solution.inputs)}
      ${rows('Left over', ctx.solution.surplus, 'warn')}
      ${rows('Cannot make', ctx.solution.shortfalls.map((f) => [f.item, f.rate] as [string, number]), 'bad')}
    </section>`
}

