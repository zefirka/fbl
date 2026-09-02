import type { ProtoRegistry, QualityPlan, QualitySetup } from '../core'
import { iconStyle, type IconSheet } from '../ui/icons'
import { capacityFor, carryText, labelOf, rateText, type CardModel, type Carrier, type DiagramModel } from './view'

/** Farming is counted a minute: the interesting numbers are far too small to read per second. */
export const perMinute = (rate: number) => rateText(rate, 'minute')

/**
 * The quality ladder, drawn.
 *
 * A column per tier, an assembler and a recycler on each, and the flows that matter: fresh
 * ingredients into the bottom rung, items falling out of every assembler into the recycler of
 * whatever tier they came out at, and a quarter of each shredded item climbing back as
 * ingredients. What is at or above the tier you asked for leaves at the right.
 *
 * Reading it, the thing to look for is how little comes out of the first roll and how much
 * comes back up the ladder — the ribbons into the top-right terminal are mostly from the upper
 * rungs, not from the big assembler at the bottom.
 */

export const qualityKey = {
  craft: (tier: string) => `craft:${tier}`,
  recycle: (tier: string) => `recycle:${tier}`,
  input: (item: string) => `input:${item}`,
  output: 'output',
}

export interface QualityContext {
  registry: ProtoRegistry
  sheet: IconSheet | null
  carrier: Carrier
  setup: QualitySetup
  plan: QualityPlan
  /** The item the recipe makes, which is what the whole ladder is about. */
  item: string
}

const ALIVE = 1e-9

export function qualityDiagram(ctx: QualityContext): DiagramModel {
  const { plan, registry, carrier } = ctx
  const tiers = registry.qualities
  const recipe = registry.recipes.get(ctx.setup.recipe)
  const ingredients = Object.entries(recipe?.in ?? {})

  const flows: DiagramModel['flows'] = new Map()
  const marks: NonNullable<DiagramModel['marks']> = new Map()
  const links: DiagramModel['links'] = []
  const load = new Map<string, { in: number; out: number }>()

  // Every ribbon here carries the same item, so the tier it is at is the only thing telling
  // them apart — and it is known at the moment the flow is made rather than guessable after.
  const join = (from: string, to: string, item: string, rate: number, tier: string) => {
    if (rate <= ALIVE) return
    const tag = `q${links.length}`
    flows.set(tag, { from, to, item, rate })
    marks.set(tag, tier)
    const belts = rate / capacityFor(carrier, item)
    links.push({ from, to, weight: belts, tag })
    for (const [key, side] of [
      [from, 'out'],
      [to, 'in'],
    ] as const) {
      const held = load.get(key) ?? { in: 0, out: 0 }
      held[side] += belts
      load.set(key, held)
    }
  }

  const base = Math.max(0, tiers.indexOf(ctx.setup.base))
  const target = Math.max(base, tiers.indexOf(ctx.setup.target))

  // Fresh ingredients. What goes round the loop is bought once, at the bottom rung — the
  // recyclers hand the rest back. What no recycler ever hands back is bought again by every
  // rung, for every craft it runs, and in the game's data that is always a fluid.
  for (const [name, amount] of ingredients) {
    if (!plan.fresh.includes(name)) {
      join(qualityKey.input(name), qualityKey.craft(tiers[base]), name, amount * plan.input, tiers[base])
      continue
    }
    // A fluid has no quality: what feeds the legendary rung is the same acid as everywhere else.
    const tier = registry.fluids.has(name) ? 'normal' : undefined
    for (const [at, quality] of tiers.entries()) {
      join(qualityKey.input(name), qualityKey.craft(quality), name, amount * (plan.tiers[at]?.crafts ?? 0), tier ?? quality)
    }
  }

  for (const [from, row] of plan.crafted.entries()) {
    for (const [to, rate] of row.entries()) {
      // What came out at or above what you wanted leaves; the rest goes to be shredded.
      const sink = to >= target ? qualityKey.output : qualityKey.recycle(tiers[to])
      join(qualityKey.craft(tiers[from]), sink, ctx.item, rate, tiers[to])
    }
  }

  for (const [from, row] of plan.returned.entries()) {
    for (const [to, rate] of row.entries()) {
      // What comes back as the item itself goes wherever an item of that tier goes: out, if it
      // is what you were farming for, and to the recycler of that tier if it is not. The
      // quarter that stays where it was is the same recycler shredding it again — that is in
      // the rate on its card rather than a ribbon looping back into its own box.
      if (plan.loop === 'item') {
        if (from === to) continue
        const sink = to >= target ? qualityKey.output : qualityKey.recycle(tiers[to])
        join(qualityKey.recycle(tiers[from]), sink, ctx.item, rate, tiers[to])
        continue
      }
      // Only what the recycler actually hands back climbs the ladder: the acid a processing
      // unit was made with is gone, so no ribbon of it leaves a recycler.
      for (const name of plan.recovers) {
        const amount = recipe?.in?.[name] ?? 0
        join(qualityKey.recycle(tiers[from]), qualityKey.craft(tiers[to]), name, amount * rate, tiers[to])
      }
    }
  }

  // A rung is a column, and its recycler stands in the next one along. Left to itself the
  // layout reads the columns off the longest path, and a ladder that feeds itself strings out
  // into a line one box wide.
  const cards: CardModel[] = []
  const shape = new Map<string, { minHeight: number; column: number }>()
  const see = (key: string, kind: CardModel['kind'], id: string, minHeight: number, column: number) => {
    const through = load.get(key)
    if (!through) return
    cards.push({ key, kind, id, load: Math.max(through.in, through.out) })
    shape.set(key, { minHeight, column })
  }

  for (const [name] of ingredients) see(qualityKey.input(name), 'input', name, 46, 0)
  for (const [at, tier] of tiers.entries()) {
    see(qualityKey.craft(tier), 'recipe', tier, 132, 1 + at * 2)
    if (at < target) see(qualityKey.recycle(tier), 'surplus', tier, 132, 2 + at * 2)
  }
  see(qualityKey.output, 'output', ctx.item, 60, 2 + target * 2)

  return {
    cards,
    nodes: cards.map((card) => ({
      key: card.key,
      weight: card.load,
      minHeight: shape.get(card.key)?.minHeight ?? 60,
      column: shape.get(card.key)?.column,
    })),
    links,
    flows,
    marks,
  }
}

// ── The boxes ─────────────────────────────────────────────────────────────────

const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const chip = (ctx: QualityContext, item: string, px = 20) =>
  `<i class="chip" style="${iconStyle(ctx.registry.icons.get(item), ctx.sheet, px)}"></i>`

/** An icon with the tier stamped on it, the way the game stamps it. */
function stamped(ctx: QualityContext, item: string, tier: string, px = 20): string {
  if (tier === 'normal') return chip(ctx, item, px)
  const mark = iconStyle(ctx.registry.icons.get(tier), ctx.sheet, 11)
  return `<span class="stamped">${chip(ctx, item, px)}<i class="chip mark" style="${mark}"></i></span>`
}

const named = (tier: string) => tier.replace(/^./, (c) => c.toUpperCase())

export function qualityCard(card: CardModel, ctx: QualityContext): string {
  const tiers = ctx.registry.qualities
  const at = tiers.indexOf(card.id)
  const tier = ctx.plan.tiers[at]

  switch (card.kind) {
    case 'recipe':
      return tier ? crafterCard(ctx, card.id, tier) : ''
    case 'surplus':
      return tier ? recyclerCard(ctx, card.id, tier) : ''
    case 'input':
      return terminal(
        ctx,
        card.id,
        // Fluids come at one quality, whatever rung they are feeding.
        ctx.registry.fluids.has(card.id) ? 'normal' : ctx.setup.base,
        perMinute(rateOf(ctx, card.id)),
        'from the bus',
      )
    default:
      return terminal(ctx, ctx.item, ctx.setup.target, perMinute(ctx.plan.output), 'what you are farming for')
  }
}

const rateOf = (ctx: QualityContext, item: string) => ctx.plan.ingredients.get(item) ?? 0

function crafterCard(ctx: QualityContext, tier: string, row: QualityPlan['tiers'][number]): string {
  const rung = ctx.setup.crafters[tier] ?? {}
  const machine = row.machine ?? ''
  const built = rung.quality ?? 'normal'
  const count = Math.ceil(row.crafters - 1e-6)
  const made = ctx.plan.crafted[ctx.registry.qualities.indexOf(tier)]?.reduce((sum, rate) => sum + rate, 0) ?? 0

  return `
    <article class="card qcard">
      <header class="card-head">
        ${stamped(ctx, ctx.item, tier, 22)}
        <span class="card-name">${escape(named(tier))}</span>
        <span class="rate">${row.chance > 0 ? `${(row.chance * 100).toFixed(1)}%` : ''}</span>
      </header>
      <div class="card-run">
        <span class="count" title="${row.crafters.toFixed(2)} exactly">${count}</span>
        <span class="times">×</span>
        <button type="button" class="pick" data-pick-open="rung-machine" data-for="${escape(tier)}">
          ${stamped(ctx, machine, built, 18)}<span>${escape(labelOf(ctx.registry, machine))}</span>
        </button>
      </div>
      ${slots(ctx, 'crafter', tier, machine, rung.modules)}
      <footer class="card-foot">
        <span>${escape(perMinute(made))}</span>
        <span class="dim">made · ${escape(carryText(ctx.carrier, ctx.item, made))}</span>
      </footer>`
}

/** The module slots of one rung, drawn as slots, exactly as a production node draws them. */
function slots(
  ctx: QualityContext,
  side: 'crafter' | 'recycler',
  tier: string,
  machine: string,
  held: Array<{ name: string; quality?: string }> | undefined,
): string {
  const many = ctx.registry.machines.get(machine)?.modules ?? 0
  if (many === 0) return '<div class="card-mods dim">no module slots</div>'

  const filled = Array.from({ length: many }, (_, at) => {
    const module = held?.[at]
    return `<button type="button" class="slot-cell${module ? ' on' : ''}" data-pick-open="rung-module"
      data-for="${escape(tier)}" data-side="${side}" data-slot="${at}" title="module slot ${at + 1}">
      ${module ? stamped(ctx, module.name, module.quality ?? 'normal', 18) : '<i class="chip empty"></i>'}
    </button>`
  }).join('')

  return `<div class="card-mods"><div class="slots">${filled}</div></div>`
}

function recyclerCard(ctx: QualityContext, tier: string, row: QualityPlan['tiers'][number]): string {
  const rung = ctx.setup.recyclers[tier] ?? {}
  const count = Math.ceil(row.recyclers - 1e-6)
  const built = rung.quality ?? 'normal'

  // The badge on a rung says which tier it handles, so it belongs on what is passing through
  // rather than on the machine. Stamping the recycler with it read as a ladder of ever better
  // recyclers, which is not what the setup says at all — they are all the same machine.
  return `
    <article class="card qcard recycler">
      <header class="card-head">
        ${stamped(ctx, ctx.item, tier, 22)}
        <span class="card-name">${escape(named(tier))}</span>
        <span class="rate">${row.recycleChance > 0 ? `${(row.recycleChance * 100).toFixed(1)}%` : ''}</span>
      </header>
      <div class="card-run">
        <span class="count" title="${row.recyclers.toFixed(2)} exactly">${count}</span>
        <span class="times">×</span>
        <button type="button" class="pick" data-pick-open="rung-recycler" data-for="${escape(tier)}">
          ${stamped(ctx, 'recycler', built, 18)}<span>${escape(labelOf(ctx.registry, 'recycler'))}</span>
        </button>
      </div>
      ${slots(ctx, 'recycler', tier, 'recycler', rung.modules)}
      <footer class="card-foot">
        <span>${escape(perMinute(row.recycled))}</span>
        <span class="dim">shredded</span>
      </footer>`
}

function terminal(ctx: QualityContext, item: string, tier: string, rate: string, note: string): string {
  return `
    <article class="card term ${note.startsWith('what') ? 'output' : 'input'}">
      <header class="card-head">
        ${stamped(ctx, item, tier, 20)}
        <span class="card-name">${escape(labelOf(ctx.registry, item))}</span>
        <span class="rate">${escape(rate)}</span>
      </header>
      <div class="term-note">${escape(note)}</div>
    </article>`
}
