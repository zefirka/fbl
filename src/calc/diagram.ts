import type { Flow } from '../core'
import { layoutSankey, type Ribbon, type SankeyLayout } from '../ui/sankey'
import { cardHtml, type CardContext } from './cards'
import { iconStyle } from '../ui/icons'
import { carryText, labelOf, rateText, type DiagramModel } from './view'

/**
 * Drawing the plan, and getting around it.
 *
 * Ribbons are SVG under the cards; the cards are HTML on top. One transform on the frame
 * moves both, so panning and zooming never touch either — and a select stays a select at any
 * zoom, which is the whole reason for the split.
 */

/**
 * The most pixels a box is allowed to grow to, and with it the widest a ribbon can be. Without
 * a ceiling the scale is fixed and the diagram is at the mercy of its biggest number: 337 iron
 * plates a second is twenty-two yellow belts, and at any honest pixels-per-belt that is a
 * ribbon wider than the card it comes out of.
 */
const MAX_NODE = 150
/** …but a small plan should not blow up to fill it, so this is the cap on the scale itself. */
const BELT_PIXELS = 9
const PADDING = 60
/** A belt line inside a ribbon is only worth drawing while there is room to see it. */
const BELT_LINE_AT = 3.5
/**
 * The tab on the edge of a card where a flow arrives or leaves. A ribbon that merely ends near
 * a box leaves a hole you have to squint across; ending *on* something, in the colour of what
 * is flowing, is what makes an input an input.
 */
const PORT = 7
/** Muted enough for the dark ground, far enough apart to tell two flows crossing apart. */
const HUES = [
  '#7aa2d1', '#d19a6a', '#8fbf7f', '#c98b9e', '#9d8fd1',
  '#c9b46a', '#6fbdb0', '#c47f7f', '#8aa87a', '#b58fc9',
  '#6f9bbd', '#c9a17a',
]

export interface DiagramView {
  x: number
  y: number
  scale: number
}

export interface DiagramRefs {
  stage: HTMLElement
  frame: HTMLElement
  svg: SVGSVGElement
  cards: HTMLElement
}

export function drawDiagram(refs: DiagramRefs, model: DiagramModel, ctx: CardContext): SankeyLayout {
  const heaviest = Math.max(0.001, ...model.nodes.map((node) => node.weight))
  const scale = Math.min(BELT_PIXELS, MAX_NODE / heaviest)
  const layout = layoutSankey(model.nodes, model.links, { scale })

  const width = layout.width + PADDING * 2
  const height = layout.height + PADDING * 2
  refs.frame.style.width = `${width}px`
  refs.frame.style.height = `${height}px`
  refs.svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
  refs.svg.setAttribute('width', String(width))
  refs.svg.setAttribute('height', String(height))

  // The whole drawing is shifted by the same padding the cards are laid out with. It has to
  // be said once, here, or a ribbon lands sixty pixels from the card it belongs to.
  refs.svg.innerHTML = `<g transform="translate(${PADDING} ${PADDING})">${layout.links
    .map((ribbon) => ribbonSvg(ribbon, model, ctx, scale))
    .join('')}</g>`

  const at = new Map(layout.nodes.map((node) => [node.key, node]))
  const cards = model.cards.map((card) => {
    const box = at.get(card.key)
    if (!box) return ''
    const style = `left:${box.x + PADDING}px;top:${box.y + PADDING}px;width:${box.width}px;min-height:${box.height}px`
    return `<div class="slot" style="${style}">${cardHtml(card, ctx)}</div>`
  })

  // What is flowing, written on the flow — on every flow, however thin. A ribbon you have to
  // trace back to its box to find out what it carries is a ribbon you have to trace back.
  const tags = layout.links.map((ribbon) => flowTag(ribbon, model, ctx, shareOf(layout, model)))

  refs.cards.innerHTML = [...tags, ...cards].join('')
  return layout
}

/**
 * A ribbon is a cubic curve with the control points pulled sideways, which is what makes a
 * flow diagram read as flowing. One that runs backwards — a loop — is bowed out of the way
 * instead, so it cannot be mistaken for something feeding forwards.
 */
/**
 * A ribbon, as a shape rather than as a very thick line.
 *
 * Stroking a curve puts the width *perpendicular* to it, so where the curve is steep the band
 * splays out sideways and a heavy flow stops looking like a flow at all. A Sankey ribbon is
 * vertically thick: its two edges are the same curve, one raised by half the width and one
 * dropped by it, and the shape between them is filled. That stays honest at any steepness and
 * never bulges.
 */
function ribbonShape(ribbon: Ribbon): string {
  const stops = [{ x: ribbon.x1, y: ribbon.y1 }, ...ribbon.points, { x: ribbon.x2, y: ribbon.y2 }]
  const half = ribbon.thickness / 2

  const top = edge(stops, -half, false)
  const bottom = edge(stops, half, true)
  return `${top} L ${stops[stops.length - 1].x} ${stops[stops.length - 1].y + half} ${bottom} Z`
}

/** One side of the ribbon: the centre line, shifted, and eased from each stop to the next. */
function edge(stops: Array<{ x: number; y: number }>, shift: number, reverse: boolean): string {
  const points = reverse ? [...stops].reverse() : stops
  const lead = reverse ? '' : `M ${points[0].x} ${points[0].y + shift}`

  let path = lead
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i]
    const b = points[i + 1]
    const ease = Math.max(30, Math.abs(b.x - a.x) * 0.5) * (reverse ? -1 : 1)
    path += ` C ${a.x + ease} ${a.y + shift}, ${b.x - ease} ${b.y + shift}, ${b.x} ${b.y + shift}`
  }
  return path
}

/** The centre line on its own, for the belt rules drawn inside the ribbon. */
function centreLine(ribbon: Ribbon): string {
  const stops = [{ x: ribbon.x1, y: ribbon.y1 }, ...ribbon.points, { x: ribbon.x2, y: ribbon.y2 }]
  return edge(stops, 0, false)
}

function ribbonSvg(ribbon: Ribbon, model: DiagramModel, ctx: CardContext, scale: number): string {
  const flow = ribbon.tag ? model.flows.get(ribbon.tag) : undefined
  const item = flow?.item ?? ''

  const title = flow
    ? `${labelOf(ctx.registry, item)} · ${rateText(flow.rate)} · ${carryText(ctx.carrier, item, flow.rate)}`
    : ''

  // The ribbon proper runs between the two tabs, not between the two cards.
  const held = { ...ribbon, x1: ribbon.x1 + PORT, x2: ribbon.x2 - PORT }
  const tall = Math.max(3, ribbon.thickness)
  const ports = `
    <rect class="port" x="${ribbon.x1}" y="${(ribbon.y1 - tall / 2).toFixed(2)}" width="${PORT}" height="${tall.toFixed(2)}" />
    <rect class="port" x="${(ribbon.x2 - PORT).toFixed(2)}" y="${(ribbon.y2 - tall / 2).toFixed(2)}" width="${PORT}" height="${tall.toFixed(2)}" />`

  // A loop is drawn as a line rather than a shape: it runs the wrong way and bows over the
  // top, and a filled band on that path would read as another flow going forwards.
  if (ribbon.backward) {
    const span = Math.abs(ribbon.x2 - ribbon.x1)
    const pull = Math.max(120, span)
    const path = `M ${held.x1} ${held.y1} C ${held.x1 + pull} ${held.y1 - 90}, ${held.x2 - pull} ${held.y2 - 90}, ${held.x2} ${held.y2}`
    return `<g class="ribbon back" data-item="${item}" style="--flow:${hueOf(item)}">
      ${ports}
      <path class="flow-line" d="${path}" stroke-width="${Math.min(6, ribbon.thickness).toFixed(2)}" />
      <title>${title.replace(/[<>&]/g, '')}</title>
    </g>`
  }

  // The width is belts, so say so: a rule on every belt boundary, while there is room for one.
  // It turns a thickness you have to take on trust into something you can count.
  const belts = Math.round(ribbon.weight)
  const centre = centreLine(held)
  const rules =
    scale >= BELT_LINE_AT && belts > 1
      ? Array.from({ length: belts - 1 }, (_, i) => {
          const offset = (i + 1) * (ribbon.thickness / belts) - ribbon.thickness / 2
          return `<path class="belt-line" d="${centre}" transform="translate(0 ${offset.toFixed(2)})" />`
        }).join('')
      : ''

  return `<g class="ribbon" data-item="${item}" style="--flow:${hueOf(item)}">
    ${ports}
    <path class="flow" d="${ribbonShape(held)}" />
    ${rules}
    <title>${title.replace(/[<>&]/g, '')}</title>
  </g>`
}

/** A stable colour per item: two flows crossing are only telling apart if they differ. */
function hueOf(item: string): string {
  let hash = 0
  for (let i = 0; i < item.length; i++) hash = (hash * 31 + item.charCodeAt(i)) | 0
  return HUES[Math.abs(hash) % HUES.length]
}

/**
 * How much of each source's output goes down each of its ribbons.
 *
 * This is the question the diagram exists to answer and the one it was not answering: five
 * assemblers making copper cable, and what you want to know is that four of them are for the
 * green circuits and one is for the red. The share of the flow is the share of the machines,
 * so the number is right there — it just had to be written down.
 */
function shareOf(layout: SankeyLayout, model: DiagramModel): Map<string, { rate: number; ways: number }> {
  const split = new Map<string, { rate: number; ways: number }>()

  for (const ribbon of layout.links) {
    const flow = ribbon.tag ? model.flows.get(ribbon.tag) : undefined
    if (!flow) continue
    const key = `${flow.from}|${flow.item}`
    const held = split.get(key) ?? { rate: 0, ways: 0 }
    held.rate += flow.rate
    held.ways += 1
    split.set(key, held)
  }
  return split
}

function flowTag(
  ribbon: Ribbon,
  model: DiagramModel,
  ctx: CardContext,
  split: Map<string, { rate: number; ways: number }>,
): string {
  const flow = ribbon.tag ? model.flows.get(ribbon.tag) : undefined
  if (!flow) return ''

  // On the middle lane when the ribbon has any, so the label sits on the ribbon rather than
  // wherever the straight line between its ends happens to pass.
  const mid = ribbon.points[Math.floor(ribbon.points.length / 2)]
  const x = (mid?.x ?? (ribbon.x1 + ribbon.x2) / 2) + PADDING
  const y = (mid?.y ?? (ribbon.y1 + ribbon.y2) / 2) + PADDING - (ribbon.backward ? 68 : 0)
  const style = iconStyle(ctx.registry.icons.get(flow.item), ctx.sheet, 16)

  const name = labelOf(ctx.registry, flow.item)
  const machines = machineShare(flow, ctx, split)
  const title = `${name} · ${rateText(flow.rate)}${machines ? ` · ${machines.title}` : ''}`

  return `<div class="flow-tag" style="left:${x}px;top:${y}px" title="${title}">
    <i class="chip" style="${style}"></i><span>${rateText(flow.rate)}</span>
    ${machines ? `<b class="share">${machines.text}</b>` : ''}
  </div>`
}

/**
 * The machines behind one ribbon — written only where the source feeds more than one place.
 * Where it feeds one, the share is the whole node and the card already says so.
 */
function machineShare(
  flow: Flow,
  ctx: CardContext,
  split: Map<string, { rate: number; ways: number }>,
): { text: string; title: string } | undefined {
  if (!flow.from.startsWith('recipe:')) return undefined

  const held = split.get(`${flow.from}|${flow.item}`)
  if (!held || held.ways < 2 || held.rate <= 0) return undefined

  const node = ctx.solution.nodes.find((entry) => entry.recipe === flow.from.slice('recipe:'.length))
  if (!node || node.machines <= 0) return undefined

  // Apportioned out of the machines you would *build*, not out of the fraction the plan
  // strictly needs, so the numbers along the ribbons add up to the number on the card.
  const built = Math.ceil(node.machines - 1e-6)
  const part = flow.rate / held.rate
  const share = built * part
  const shown = share >= 10 ? Math.round(share) : Number(share.toFixed(1))
  const machine = node.machine ? labelOf(ctx.registry, node.machine).toLowerCase() : 'machines'

  return {
    text: `${shown}×`,
    title: `${shown} of ${built} ${machine} — ${Math.round(part * 100)}% of what they make`,
  }
}

/**
 * Zoom and pan, and nothing else: no scroll bars, no modes. The wheel zooms about the cursor
 * so the thing under it stays under it, and dragging the background moves the plan. Dragging
 * a card does not, because a card is full of controls someone is trying to hit.
 */
export function bindZoomPan(
  refs: DiagramRefs,
  view: DiagramView,
  onChange: (view: DiagramView) => void,
): void {
  const apply = () => {
    refs.frame.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`
    onChange(view)
  }

  refs.stage.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault()
      const box = refs.stage.getBoundingClientRect()
      const px = event.clientX - box.left
      const py = event.clientY - box.top

      const factor = Math.exp(-event.deltaY * 0.0015)
      const next = clamp(view.scale * factor)
      // Hold the point under the cursor still: it is the only anchor anyone thinks in.
      view.x = px - ((px - view.x) * next) / view.scale
      view.y = py - ((py - view.y) * next) / view.scale
      view.scale = next
      apply()
    },
    { passive: false },
  )

  let from: { x: number; y: number; vx: number; vy: number } | null = null

  refs.stage.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return
    if ((event.target as HTMLElement).closest('.card, .zoom')) return
    from = { x: event.clientX, y: event.clientY, vx: view.x, vy: view.y }
    refs.stage.setPointerCapture(event.pointerId)
    refs.stage.classList.add('dragging')
  })

  refs.stage.addEventListener('pointermove', (event) => {
    if (!from) return
    view.x = from.vx + (event.clientX - from.x)
    view.y = from.vy + (event.clientY - from.y)
    apply()
  })

  const release = () => {
    from = null
    refs.stage.classList.remove('dragging')
  }
  refs.stage.addEventListener('pointerup', release)
  refs.stage.addEventListener('pointercancel', release)

  apply()
}

export function fitView(refs: DiagramRefs, layout: SankeyLayout, view: DiagramView): DiagramView {
  const box = refs.stage.getBoundingClientRect()
  const width = layout.width + PADDING * 2
  const height = layout.height + PADDING * 2
  if (width <= 0 || height <= 0) return view

  const scale = clamp(Math.min(box.width / width, box.height / height, 1))
  return {
    scale,
    x: (box.width - width * scale) / 2,
    y: (box.height - height * scale) / 2,
  }
}

export const clamp = (scale: number) => Math.min(2.5, Math.max(0.08, scale))
