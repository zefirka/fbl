import type { ProtoRegistry, RecipeGraph, Solution, SolvedNode } from '../core'
import { consumersOf, machinesRunning } from '../core'
import { iconStyle, type IconSheet } from '../ui/icons'
import type { CalcState } from './state'
import { settingsOf } from './state'
import { carryText, labelOf, rateText, type CardModel, type Carrier } from './view'

/**
 * The boxes on the diagram.
 *
 * Every setting that changes the answer sits on the node it changes, because that is where
 * you are looking when you want to change it: which machine runs this recipe, what is in it,
 * how many you already have. A calculator that keeps those in a table somewhere else makes
 * you hold the graph in your head to use the table.
 *
 * They are plain HTML over the ribbons rather than drawn into them, so a dropdown is a real
 * dropdown — it opens where it should, it takes the keyboard, and it costs nothing to style.
 */

export interface CardContext {
  registry: ProtoRegistry
  graph: RecipeGraph
  sheet: IconSheet | null
  state: CalcState
  carrier: Carrier
  solution: Solution
}

const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const icon = (ctx: CardContext, item: string, px = 20) =>
  `<i class="chip" style="${iconStyle(ctx.registry.icons.get(item), ctx.sheet, px)}"></i>`

/**
 * An icon with the tier it was built to marked in the corner, the way the game marks it.
 * Without it a legendary assembler and a plain one are the same picture, and the count beside
 * them would be the only clue that anything is different.
 */
function stamped(ctx: CardContext, item: string, px: number, quality: string | undefined): string {
  if (!quality || quality === 'normal') return icon(ctx, item, px)
  const mark = iconStyle(ctx.registry.icons.get(quality), ctx.sheet, 11)
  return `<span class="stamped">${icon(ctx, item, px)}<i class="chip mark" style="${mark}"></i></span>`
}

/**
 * A control that opens a picker. It shows what is chosen as a picture, because that is what
 * anyone recognises first, with the name beside it where there is room for one.
 */
function trigger(
  kind: string,
  id: string,
  ctx: CardContext,
  chosen: string | undefined,
  label: string,
  quality?: string,
): string {
  const art = chosen ? stamped(ctx, chosen, 18, quality) : '<i class="chip empty"></i>'
  return `<button type="button" class="pick" data-pick-open="${kind}" data-for="${escape(id)}">
    ${art}<span>${escape(label)}</span>
  </button>`
}

export function cardHtml(card: CardModel, ctx: CardContext): string {
  switch (card.kind) {
    case 'recipe':
      return recipeCard(card, ctx)
    case 'input':
      return terminal(card, ctx, 'from the bus', inputExtras(card.id, ctx))
    case 'output':
      return terminal(card, ctx, 'what you asked for', '')
    case 'surplus':
      return terminal(card, ctx, 'left over', surplusExtras(card.id, ctx))
  }
}

function recipeCard(card: CardModel, ctx: CardContext): string {
  const node = ctx.solution.nodes.find((n) => n.recipe === card.id)
  if (!node) return ''

  const recipe = ctx.graph.usable.get(card.id)
  const name = recipe?.name ?? card.id
  const main = mainOutput(ctx, card.id)

  const built = settingsOf(ctx.state, card.id).quality
  const machines = machinesRunning(ctx.registry, recipe!)
  // Even with one machine to choose from there is a tier to choose, so the control stays.
  const machinePick =
    machines.length > 1 || ctx.registry.profile.supportsQuality
      ? trigger('machine', card.id, ctx, node.machine, labelOf(ctx.registry, node.machine ?? '—'), built)
      : `<span class="mini flat">${icon(ctx, node.machine ?? '', 18)}${escape(labelOf(ctx.registry, node.machine ?? '—'))}</span>`

  const many = Math.ceil(node.machines - 1e-6)
  const count = node.pinned
    ? `<span class="pinned" title="you said you have this many">${many}</span>`
    : `<span class="count" title="${node.machines.toFixed(2)} exactly">${many}</span>`

  return `
    <article class="card" data-node="${escape(card.key)}">
      <header class="card-head">
        ${icon(ctx, main ?? card.id, 22)}
        ${alternatives(ctx, card.id, main) || `<span class="card-name" title="${escape(name)}">${escape(name)}</span>`}
        ${fromBus(ctx, main)}
      </header>

      <div class="card-run">
        ${count}
        <span class="times">×</span>
        ${machinePick}
        <button type="button" class="pin ${node.pinned ? 'on' : ''}" data-pin="${escape(card.id)}"
                title="${node.pinned ? 'let the plan decide again' : 'I have exactly this many'}">📌</button>
      </div>

      ${moduleRow(ctx, node)}

      <footer class="card-foot">
        <span>${escape(rateText(outputRate(ctx, node, main)))}</span>
        <span class="dim">${escape(carryText(ctx.carrier, main ?? '', outputRate(ctx, node, main)))}</span>
        ${node.productivity > 1 ? `<span class="prod">+${Math.round((node.productivity - 1) * 100)}%</span>` : ''}
      </footer>
    </article>`
}

/**
 * Cutting the chain here.
 *
 * Sometimes what is behind a thing is somebody else's problem: the plates come off the bus,
 * and all you want to know is how many. Saying so drops this node and everything that was only
 * there to feed it, and what it made turns into an amount you need rather than a factory you
 * build. It is on every node because the place you decide it is the place you are looking.
 */
function fromBus(ctx: CardContext, item: string | undefined): string {
  if (!item) return ''
  // Not on what you asked for: a target taken off the bus would be a plan for nothing.
  if (ctx.state.targets.some((target) => target.item === item)) return ''

  // A glyph in the corner rather than a line of its own. It is a thing you do to a handful of
  // nodes out of thirty, and a sentence on every card would cost more room than it is worth.
  return `<button type="button" class="bus" data-collapse="${escape(item)}"
    title="take ${escape(labelOf(ctx.registry, item).toLowerCase())} from the bus — drop everything behind it">≡</button>`
}

/**
 * The slots, drawn as slots. A machine holds so many modules and you can see how many are
 * filled — which is the thing a number in a dropdown never quite says.
 */
function moduleRow(ctx: CardContext, node: SolvedNode): string {
  const slots = ctx.registry.machines.get(node.machine ?? '')?.modules ?? 0
  const settings = settingsOf(ctx.state, node.recipe)
  const beacons = settings.beacon?.count ?? 0
  const inBeacon = settings.beacon?.modules[0]?.name

  const filled = Array.from({ length: slots }, (_, at) => {
    const held = settings.modules?.[at]
    return `<button type="button" class="slot-cell${held ? ' on' : ''}" data-pick-open="module"
      data-for="${escape(node.recipe)}" data-slot="${at}" title="module slot ${at + 1}">
      ${held ? stamped(ctx, held.name, 18, held.quality) : '<i class="chip empty"></i>'}
    </button>`
  }).join('')

  return `
    <div class="card-mods">
      ${slots > 0 ? `<div class="slots">${filled}</div>` : '<span class="dim">no modules</span>'}
      <div class="beacons" title="beacons reaching this machine">
        <button type="button" class="step" data-beacon-step="${escape(node.recipe)}" data-by="-1"
                ${beacons === 0 ? 'disabled' : ''} aria-label="fewer beacons">−</button>
        <button type="button" class="slot-cell${beacons ? ' on' : ''}" data-pick-open="beacon-module"
                data-for="${escape(node.recipe)}" title="what is in the beacons">
          ${beacons && inBeacon ? stamped(ctx, inBeacon, 18, settings.beacon?.quality) : icon(ctx, 'beacon', 18)}
        </button>
        <span class="beacon-count${beacons ? '' : ' dim'}">${beacons}</span>
        <button type="button" class="step" data-beacon-step="${escape(node.recipe)}" data-by="1"
                aria-label="more beacons">+</button>
      </div>
    </div>`
}

/**
 * When more than one recipe makes the same thing, the choice belongs on the node — and it
 * takes the place of the name rather than sitting beside it, since it says the same thing.
 */
function alternatives(ctx: CardContext, recipe: string, item: string | undefined): string {
  if (!item) return ''
  const options = ctx.graph.producers.get(item) ?? []
  if (options.length < 2) return ''

  const name = ctx.graph.usable.get(recipe)?.name ?? recipe
  return `<button type="button" class="pick title" data-pick-open="recipe" data-for="${escape(item)}"
    title="${escape(name)} — one of ${options.length} ways to make this">
    <span>${escape(name)}</span><span class="caret">▾</span>
  </button>`
}

function terminal(card: CardModel, ctx: CardContext, note: string, extras: string): string {
  const rate = terminalRate(ctx, card)
  return `
    <article class="card term ${card.kind}" data-node="${escape(card.key)}">
      <header class="card-head">
        ${icon(ctx, card.id, 20)}
        <span class="card-name" title="${escape(labelOf(ctx.registry, card.id))}">${escape(labelOf(ctx.registry, card.id))}</span>
        <span class="rate">${escape(rateText(rate))}</span>
      </header>
      <div class="term-note">${escape(note)} · ${escape(carryText(ctx.carrier, card.id, rate))}</div>
      ${extras}
    </article>`
}

/** An input can stop being one: the chain carries on past it instead of taking it. */
function inputExtras(item: string, ctx: CardContext): string {
  if (!ctx.graph.producers.has(item)) return ''
  return `<button type="button" class="term-do" data-expand="${escape(item)}">make it here</button>`
}

/** A surplus is a question — what would you like done with this — so it asks it. */
function surplusExtras(item: string, ctx: CardContext): string {
  if (consumersOf(ctx.graph, item).length === 0) return ''
  const chosen = ctx.state.extra[item]
  const name = chosen ? (ctx.graph.usable.get(chosen)?.name ?? chosen) : 'use it for…'

  return `<button type="button" class="pick wide" data-pick-open="use" data-for="${escape(item)}">
    ${chosen ? icon(ctx, chosen, 18) : '<i class="chip empty"></i>'}<span>${escape(name)}</span>
  </button>`
}

/** The item a recipe is really for: the one it makes most of, by weight of what it is worth. */
export function mainOutput(ctx: CardContext, recipe: string): string | undefined {
  const out = ctx.graph.usable.get(recipe)?.out ?? {}
  const items = Object.keys(out)
  if (items.length === 0) return undefined
  // The one the recipe is named after, when there is one; otherwise the biggest share.
  return items.find((item) => item === recipe) ?? items.sort((a, b) => (out[b] ?? 0) - (out[a] ?? 0))[0]
}

function outputRate(ctx: CardContext, node: SolvedNode, item: string | undefined): number {
  if (!item) return 0
  return (ctx.graph.usable.get(node.recipe)?.out?.[item] ?? 0) * node.crafts * node.productivity
}

function terminalRate(ctx: CardContext, card: CardModel): number {
  if (card.kind === 'input') return ctx.solution.inputs.get(card.id) ?? 0
  if (card.kind === 'surplus') return ctx.solution.surplus.get(card.id) ?? 0
  return ctx.state.targets.filter((t) => t.item === card.id).reduce((sum, t) => sum + t.rate, 0)
}
