import type { ProtoRegistry, QualityPlan } from '../core'
import { iconStyle, type IconSheet } from '../ui/icons'
import type { QualitySettings } from './state'
import { labelOf } from './view'
import { perMinute } from './quality-view'

/**
 * The rail for the recycling tab: what you are farming, what is farming it, and what comes out.
 *
 * One setup stands for every rung of the ladder — the same assembler and the same recycler at
 * each tier — so the panel stays short and how many machines each rung needs is part of the
 * answer rather than another question.
 */

export interface QualityRailContext {
  registry: ProtoRegistry
  sheet: IconSheet | null
  settings: QualitySettings
  plan: QualityPlan
  /** The item the chosen recipe makes. */
  item: string
}

const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const chip = (ctx: QualityRailContext, item: string, px = 18) =>
  `<i class="chip" style="${iconStyle(ctx.registry.icons.get(item), ctx.sheet, px)}"></i>`

const named = (tier: string) => tier.replace(/^./, (c) => c.toUpperCase())

/** An icon with its tier stamped on it, the way the cards stamp theirs. */
function stamped(ctx: QualityRailContext, item: string, tier: string, px = 18): string {
  if (tier === 'normal') return chip(ctx, item, px)
  const mark = iconStyle(ctx.registry.icons.get(tier), ctx.sheet, 10)
  return `<span class="stamped">${chip(ctx, item, px)}<i class="chip mark" style="${mark}"></i></span>`
}

const pick = (kind: string, id: string, art: string, label: string) =>
  `<button type="button" class="pick wide" data-pick-open="${kind}" data-for="${escape(id)}">${art}<span>${escape(label)}</span></button>`



export function qualityRailHtml(ctx: QualityRailContext): string {
  const { settings, registry } = ctx

  return `
    <section class="rail-block">
      <h2>What are you farming</h2>
      ${pick('quality-item', 'item', settings.item ? chip(ctx, settings.item) : '<i class="chip empty"></i>', settings.item ? labelOf(registry, settings.item) : 'pick an item…')}
      <div class="pair">
        <label>from</label>
        ${pick('quality-base', 'base', chip(ctx, settings.base, 16), named(settings.base))}
      </div>
      <div class="pair">
        <label>up to</label>
        ${pick('quality-target', 'target', chip(ctx, settings.target, 16), named(settings.target))}
      </div>
    </section>

    ${driving(ctx)}
    ${everyRung(ctx)}
    ${answer(ctx)}`
}

/**
 * Filling every rung at once.
 *
 * A ladder is nine machines and nearly always the same modules in all of them, so saying it
 * once beats saying it thirty-six times. The per-rung cards are still where a rung that
 * differs is set — this only writes what they would all say anyway, and reads back as *mixed*
 * the moment one of them says something else.
 */
function everyRung(ctx: QualityRailContext): string {
  const { settings, registry } = ctx
  if (!settings.item || !registry.profile.supportsQuality) return ''

  const row = (side: 'crafters' | 'recyclers', label: string) => {
    const held = shared(settings[side])
    const art = held ? stamped(ctx, held.name, held.quality ?? 'normal') : '<i class="chip empty"></i>'
    const name = held
      ? labelOf(registry, held.name)
      : Object.values(settings[side]).some((rung) => rung.modules?.length)
        ? 'mixed'
        : 'nothing in them'
    return `<div class="pair fill"><label>${label}</label>${pick('rung-fill', side, art, name)}</div>`
  }

  return `
    <section class="rail-block">
      <h2>Fill every rung</h2>
      ${row('crafters', 'assemblers')}
      ${row('recyclers', 'recyclers')}
    </section>`
}

/** The one module every rung on a side holds, or nothing at all when they do not agree. */
function shared(rungs: QualitySettings['crafters']): { name: string; quality?: string } | undefined {
  let same: { name: string; quality?: string } | undefined
  for (const rung of Object.values(rungs)) {
    for (const module of rung.modules ?? []) {
      if (!same) same = { name: module.name, quality: module.quality }
      else if (same.name !== module.name || same.quality !== module.quality) return undefined
    }
  }
  return same
}

/** Which end is fixed. The sum is the same read from either side, so it is one switch. */
function driving(ctx: QualityRailContext): string {
  const { settings } = ctx
  const byMachines = settings.by === 'machines'

  return `
    <section class="rail-block">
      <h2>Held fixed</h2>
      <div class="segmented wide" id="quality-by">
        <button type="button" data-quality-by="machines" class="${byMachines ? 'active' : ''}">the factory</button>
        <button type="button" data-quality-by="output" class="${byMachines ? '' : 'active'}">the output</button>
      </div>
      <div class="pair">
        <input type="number" min="0" step="any" id="quality-drive"
               value="${byMachines ? settings.machines : settings.output}" />
        <label>${byMachines ? 'assemblers at the bottom rung' : `${named(settings.target)} a minute`}</label>
      </div>
    </section>`
}

function answer(ctx: QualityRailContext): string {
  const { plan, settings, registry } = ctx

  // Quality arrived with Space Age and so did the recycler. On 1.1 there is no ladder to build
  // at all, and saying that is better than complaining item by item that nothing shreds them.
  if (!registry.profile.supportsQuality) {
    return `<section class="rail-block"><p class="hint">This version has no quality tiers and no
      recycler — both came with Space Age. Change the version at the top to farm anything.</p></section>`
  }

  if (plan.problem) return `<section class="rail-block"><p class="hint">${escape(complaint(ctx))}</p></section>`

  if (!plan.climbs) {
    return `<section class="rail-block"><p class="hint">Nothing climbs a rung yet. Put quality
      modules in a machine — every rung is set on its own card, so the bottom one is the place
      to start.</p></section>`
  }
  if (plan.output <= 0) return ''

  const crafters = plan.tiers.reduce((sum, tier) => sum + Math.ceil(tier.crafters - 1e-6), 0)
  const recyclers = plan.tiers.reduce((sum, tier) => sum + Math.ceil(tier.recyclers - 1e-6), 0)
  const perTarget = plan.yield > 0 ? 1 / plan.yield : 0

  return `
    <section class="rail-block">
      <h2>What you get</h2>
      <div class="totals big">
        <span><b>${(plan.output * 60).toFixed(2)}</b> ${escape(named(settings.target).toLowerCase())} a minute</span>
      </div>
      <p class="hint">${perTarget.toFixed(1)} fresh sets of ingredients for each one. Every rung
      is set on its own card — the machine it runs, what it was built to, and what is in it.</p>

      <h2>The ladder</h2>
      <ul class="tally">
        ${plan.tiers
          .filter((tier) => tier.items > 1e-6 || tier.crafts > 1e-6)
          .map(
            (tier) => `<li>${chip(ctx, tier.quality, 16)}
              <span class="name">${escape(named(tier.quality))}</span>
              <span class="rate">${escape(perMinute(tier.items))}</span></li>`,
          )
          .join('')}
      </ul>

      <h2>What it takes</h2>
      <div class="totals">
        <span><b>${crafters}</b> assemblers</span>
        <span><b>${recyclers}</b> recyclers</span>
      </div>
      <ul class="tally">
        ${[...plan.ingredients]
          .map(
            ([item, rate]) => `<li>${chip(ctx, item)}
              <span class="name">${escape(labelOf(registry, item))}</span>
              <span class="rate">${escape(perMinute(rate))}</span></li>`,
          )
          .join('')}
      </ul>
      ${leaks(ctx)}
    </section>`
}

/**
 * What a recycler does not hand back, which is the one line of this panel that surprises
 * people: the circuits in a processing unit go round and round, and every drop of the acid is
 * bought again for every craft on every rung.
 */
function leaks(ctx: QualityRailContext): string {
  const { plan, registry, item } = ctx
  const named = labelOf(registry, item).toLowerCase()

  // Nothing it was made of comes back at all — the ladder is climbed by the recyclers, and the
  // one rung that crafts is the bottom one. That is worth saying: it is why there is a single
  // assembler on the left and a row of recyclers after it.
  if (plan.loop === 'item') {
    return `<p class="hint">Shredding ${escape(named)} gives back a quarter of ${escape(named)}
      rather than what it was made of, so nothing goes round: only the bottom rung crafts, and
      the ladder is climbed by the recyclers.</p>`
  }

  if (!plan.fresh.length) return ''
  const leaked = plan.fresh.map((each) => labelOf(registry, each).toLowerCase()).join(' or ')
  return `<p class="hint">A recycler gives back no ${escape(leaked)}: it is gone the moment an
    item is shredded, so every rung buys its own for every craft — not just the bottom one.</p>`
}

/**
 * Why there is no ladder. Worth being exact about: a recycler shreds nearly everything, and
 * saying it cannot when what actually happened is that the loop does not close reads as a hole
 * in the data rather than as a fact about the recipe.
 */
function complaint(ctx: QualityRailContext): string {
  const { plan, registry } = ctx
  const list = (items: string[]) => {
    const named = items.map((item) => labelOf(registry, item).toLowerCase())
    return named.length > 1 ? `${named.slice(0, -1).join(', ')} and ${named[named.length - 1]}` : (named[0] ?? '')
  }

  switch (plan.problem) {
    case 'no-recipe':
      return 'nothing makes that'
    case 'no-recycling':
      return 'no recycler will take that — it has no recycling recipe at all, which is where fluids and the things you dig up end up'
    case 'no-loop':
      return `shredding that gives back ${list(plan.gives)}, which this recipe does not use — so the ladder never feeds itself and there is no loop to build`
    case 'no-machine':
      return 'no machine can run that recipe'
    default:
      return ''
  }
}
