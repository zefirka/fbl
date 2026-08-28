import { directionName, tileIndex, type PlacedEntity, type PowerReport, type TileIndex } from '../core'
import type { LabIcon } from '../data/dataset'
import type { LoadedAtlas, SpriteRect } from '../data/sprites'
import { buildVariantKeys } from './variants'

/** Item icons sit on a 66px grid but are 64px wide, leaving a 2px gutter. */
const ICON_CELL = 64

/** Vanilla tops out at four module slots; the cap only guards against a computed list. */
const MAX_MODULE_ICONS = 8

/** Past this many items a chest shows a count instead of a huddle of unreadable icons. */
const MAX_CHEST_ICONS = 4

/** Belts run along one of the four cardinal directions; this is the tile they flow into. */
const STEP: Record<number, { x: number; y: number }> = {
  0: { x: 0, y: -1 },
  4: { x: 1, y: 0 },
  8: { x: 0, y: 1 },
  12: { x: -1, y: 0 },
}

/** A point given for a north-facing entity, as it lands once the entity is turned. */
function turnAround(point: [number, number], dir: number): { x: number; y: number } {
  const [x, y] = point
  switch (dir % 16) {
    case 4:
      return { x: -y, y: x }
    case 8:
      return { x: -x, y: -y }
    case 12:
      return { x: y, y: -x }
    default:
      return { x, y }
  }
}

/** The belt's own left, which is the forward vector turned a quarter anticlockwise. */
function laneVector(dir: number, side: 'left' | 'right'): { x: number; y: number } {
  const f = STEP[dir] ?? STEP[0]
  const left = { x: f.y, y: -f.x }
  return side === 'left' ? left : { x: -left.x, y: -left.y }
}

export type ViewMode = 'sprites' | 'schematic'

const TIER_TINT: Record<string, string> = {
  'transport-belt': '#c8a53a',
  'fast-transport-belt': '#c0392b',
  'express-transport-belt': '#2f6fb5',
  'turbo-transport-belt': '#3f9e5a',
  'underground-belt': '#c8a53a',
  'fast-underground-belt': '#c0392b',
  'express-underground-belt': '#2f6fb5',
  'turbo-underground-belt': '#3f9e5a',
}

/**
 * Draw order, mirroring the game's render layers: belts and pipes lie on the ground,
 * machines sit on them, and inserters and poles reach over everything.
 */
function layerOf(entity: PlacedEntity): number {
  switch (entity.proto.kind) {
    case 'belt':
    case 'underground-belt':
    case 'splitter':
    case 'pipe':
      return 0
    case 'inserter':
    case 'pole':
      return 2
    default:
      return 1
  }
}

interface Camera {
  /** World tile at the centre of the viewport. */
  x: number
  y: number
  /** Pixels per tile. */
  scale: number
}

export class BlueprintCanvas {
  private readonly ctx: CanvasRenderingContext2D
  private camera: Camera = { x: 0, y: 0, scale: 24 }
  private entities: PlacedEntity[] = []
  private drawOrder: PlacedEntity[] = []
  private clashing = new Set<PlacedEntity>()
  /** Every tile that holds something, for deciding whether a fluid connection is met. */
  private occupied: TileIndex = new Map()
  private variants = new Map<PlacedEntity, SpriteRect>()

  private atlas: LoadedAtlas | null = null
  private iconSheet: HTMLImageElement | null = null
  private icons: (name: string) => LabIcon | undefined = () => undefined
  private fluidsOf: (recipe: string) => { inputs: number; outputs: number } | undefined = () => undefined
  private mode: ViewMode = 'sprites'

  private power: PowerReport | null = null
  private showPower = false
  private hovered: PlacedEntity | null = null
  private pointer: { x: number; y: number } | null = null
  private frame = 0

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly tooltip: HTMLElement,
  ) {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas 2d context unavailable')
    this.ctx = ctx

    this.bindPointer()
    new ResizeObserver(() => this.requestRender()).observe(canvas)
  }

  /** How many of a recipe's ingredients and products travel by pipe. */
  setFluids(count: (recipe: string) => { inputs: number; outputs: number } | undefined): void {
    this.fluidsOf = count
    this.requestRender()
  }

  setIcons(sheet: HTMLImageElement | null, icons: (name: string) => LabIcon | undefined): void {
    this.iconSheet = sheet
    this.icons = icons
    this.requestRender()
  }

  setAtlas(atlas: LoadedAtlas | null): void {
    this.atlas = atlas
    this.recomputeVariants()
    this.requestRender()
  }

  setMode(mode: ViewMode): void {
    this.mode = mode
    this.requestRender()
  }

  setPower(report: PowerReport | null): void {
    this.power = report
    this.requestRender()
  }

  setPowerVisible(visible: boolean): void {
    this.showPower = visible
    this.requestRender()
  }

  get spritesAvailable(): boolean {
    return this.atlas !== null
  }

  get gameVersion(): string | null {
    return this.atlas?.manifest.gameVersion ?? null
  }

  setScene(entities: PlacedEntity[], clashing: Set<PlacedEntity>): void {
    this.entities = entities
    this.clashing = clashing
    this.occupied = tileIndex(entities, () => true)
    this.drawOrder = [...entities].sort(
      (a, b) => layerOf(a) - layerOf(b) || a.y + a.h - (b.y + b.h) || a.x - b.x,
    )
    this.recomputeVariants()
    // The old hover no longer refers to anything on screen.
    this.hovered = null
    this.tooltip.hidden = true
    this.requestRender()
  }

  private recomputeVariants(): void {
    this.variants = this.atlas ? buildVariantKeys(this.entities, this.atlas.manifest) : new Map()
  }

  /** Frames the whole blueprint with a one-tile margin. */
  fit(): void {
    if (this.entities.length === 0) {
      this.camera = { x: 0, y: 0, scale: 24 }
      this.requestRender()
      return
    }

    let left = Infinity
    let top = Infinity
    let right = -Infinity
    let bottom = -Infinity
    for (const e of this.entities) {
      left = Math.min(left, e.x)
      top = Math.min(top, e.y)
      right = Math.max(right, e.x + e.w)
      bottom = Math.max(bottom, e.y + e.h)
    }

    const { width, height } = this.viewport()
    const margin = 2
    const scale = Math.min(width / (right - left + margin), height / (bottom - top + margin))
    this.camera = {
      x: (left + right) / 2,
      y: (top + bottom) / 2,
      scale: Math.max(3, Math.min(96, scale)),
    }
    this.requestRender()
  }

  private viewport(): { width: number; height: number } {
    return { width: this.canvas.clientWidth || 1, height: this.canvas.clientHeight || 1 }
  }

  private toScreen(tileX: number, tileY: number): { x: number; y: number } {
    const { width, height } = this.viewport()
    return {
      x: (tileX - this.camera.x) * this.camera.scale + width / 2,
      y: (tileY - this.camera.y) * this.camera.scale + height / 2,
    }
  }

  private toWorld(px: number, py: number): { x: number; y: number } {
    const { width, height } = this.viewport()
    return {
      x: (px - width / 2) / this.camera.scale + this.camera.x,
      y: (py - height / 2) / this.camera.scale + this.camera.y,
    }
  }

  private bindPointer(): void {
    let dragging = false
    let last = { x: 0, y: 0 }

    this.canvas.addEventListener('pointerdown', (event) => {
      dragging = true
      last = { x: event.clientX, y: event.clientY }
      this.canvas.setPointerCapture(event.pointerId)
      this.canvas.style.cursor = 'grabbing'
    })

    this.canvas.addEventListener('pointerup', (event) => {
      dragging = false
      this.canvas.releasePointerCapture(event.pointerId)
      this.canvas.style.cursor = ''
    })

    this.canvas.addEventListener('pointerleave', () => {
      this.pointer = null
      this.hovered = null
      this.tooltip.hidden = true
      this.requestRender()
    })

    this.canvas.addEventListener('pointermove', (event) => {
      const rect = this.canvas.getBoundingClientRect()
      this.pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top }

      if (dragging) {
        this.camera.x -= (event.clientX - last.x) / this.camera.scale
        this.camera.y -= (event.clientY - last.y) / this.camera.scale
        last = { x: event.clientX, y: event.clientY }
      }

      this.updateHover()
      this.requestRender()
    })

    this.canvas.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault()
        const rect = this.canvas.getBoundingClientRect()
        const px = event.clientX - rect.left
        const py = event.clientY - rect.top
        const before = this.toWorld(px, py)

        const factor = Math.exp(-event.deltaY * 0.0015)
        this.camera.scale = Math.max(3, Math.min(96, this.camera.scale * factor))

        // Keep the tile under the cursor pinned while zooming.
        const after = this.toWorld(px, py)
        this.camera.x += before.x - after.x
        this.camera.y += before.y - after.y

        this.updateHover()
        this.requestRender()
      },
      { passive: false },
    )
  }

  private updateHover(): void {
    if (!this.pointer) return
    const world = this.toWorld(this.pointer.x, this.pointer.y)
    const tileX = Math.floor(world.x)
    const tileY = Math.floor(world.y)

    // Topmost in draw order wins, matching what the pointer visually sits on.
    let found: PlacedEntity | null = null
    for (let i = this.drawOrder.length - 1; i >= 0; i--) {
      const e = this.drawOrder[i]
      if (tileX >= e.x && tileX < e.x + e.w && tileY >= e.y && tileY < e.y + e.h) {
        found = e
        break
      }
    }

    this.hovered = found
    if (!found) {
      this.tooltip.hidden = true
      return
    }

    const lines = [`<b>${found.proto.label}</b>`, `[${found.x} ${found.y}] ${found.w}×${found.h}`]
    if (found.proto.rotatable) lines.push(`facing ${directionName(found.dir)}`)
    // Both ends of a pair face the way items flow; `type` is what tells them apart.
    if (found.undergroundType) {
      lines.push(found.undergroundType === 'input' ? 'tunnel entry — items go under' : 'tunnel exit — items come up')
    }
    if (found.recipe) lines.push(`recipe :${found.recipe}`)
    if (found.quality) lines.push(`quality :${found.quality}`)
    if (found.modules?.length) {
      const counts = new Map<string, number>()
      for (const m of found.modules) {
        const label = m.quality ? `${m.name} (${m.quality})` : m.name
        counts.set(label, (counts.get(label) ?? 0) + 1)
      }
      for (const [label, count] of counts) lines.push(`${count}× ${label}`)
    }
    if (found.content?.length) {
      const parts = found.content.map((entry) => (entry.side ? `${entry.item} (${entry.side})` : entry.item))
      lines.push(`carries ${parts.join(', ')}`)
    }
    if (found.filters?.items.length) {
      lines.push(`${found.filters.negated ? 'blocks' : 'passes'} ${found.filters.items.join(', ')}`)
    }
    if (found.splitterFilter) lines.push(`filter ${found.splitterFilter} → ${found.outPriority ?? 'left'}`)
    if (found.inPriority) lines.push(`takes from ${found.inPriority}`)
    if (found.outPriority) lines.push(`gives to ${found.outPriority}`)

    this.tooltip.innerHTML = lines.join('\n')
    this.tooltip.hidden = false
    const { width, height } = this.viewport()
    const flipX = this.pointer.x > width - 200
    const flipY = this.pointer.y > height - 120
    this.tooltip.style.left = `${this.pointer.x + (flipX ? -12 : 14)}px`
    this.tooltip.style.top = `${this.pointer.y + (flipY ? -12 : 14)}px`
    this.tooltip.style.transform = `translate(${flipX ? '-100%' : '0'}, ${flipY ? '-100%' : '0'})`
  }

  requestRender(): void {
    if (this.frame) return
    this.frame = requestAnimationFrame(() => {
      this.frame = 0
      this.render()
    })
  }

  private render(): void {
    const dpr = window.devicePixelRatio || 1
    const { width, height } = this.viewport()
    if (this.canvas.width !== width * dpr || this.canvas.height !== height * dpr) {
      this.canvas.width = width * dpr
      this.canvas.height = height * dpr
    }

    const ctx = this.ctx
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = this.useSprites() ? '#3a3226' : '#101317'
    ctx.fillRect(0, 0, width, height)

    this.drawGrid(width, height)

    const useSprites = this.useSprites()
    for (const entity of this.drawOrder) {
      if (useSprites && this.variants.has(entity)) this.drawSprite(entity)
      else this.drawSchematic(entity)
    }
    if (this.showPower && this.power) this.drawPower(this.power, width, height)
    for (const entity of this.drawOrder) this.drawOverlays(entity)

    this.drawOrigin()
  }

  private useSprites(): boolean {
    return this.mode === 'sprites' && this.atlas !== null
  }

  private drawGrid(width: number, height: number): void {
    const ctx = this.ctx
    const scale = this.camera.scale
    const topLeft = this.toWorld(0, 0)
    const bottomRight = this.toWorld(width, height)
    const sprites = this.useSprites()

    const drawLines = (step: number, color: string) => {
      ctx.strokeStyle = color
      ctx.lineWidth = 1
      ctx.beginPath()
      const startX = Math.floor(topLeft.x / step) * step
      for (let x = startX; x <= bottomRight.x; x += step) {
        const sx = Math.round(this.toScreen(x, 0).x) + 0.5
        ctx.moveTo(sx, 0)
        ctx.lineTo(sx, height)
      }
      const startY = Math.floor(topLeft.y / step) * step
      for (let y = startY; y <= bottomRight.y; y += step) {
        const sy = Math.round(this.toScreen(0, y).y) + 0.5
        ctx.moveTo(0, sy)
        ctx.lineTo(width, sy)
      }
      ctx.stroke()
    }

    if (scale >= 11) drawLines(1, sprites ? 'rgba(0,0,0,0.10)' : '#191d23')
    drawLines(5, sprites ? 'rgba(0,0,0,0.20)' : scale >= 11 ? '#232932' : '#1c2129')
  }

  /** Real game art, positioned by the sprite's own `shift` — so overhang lands where it should. */
  private drawSprite(entity: PlacedEntity): void {
    const atlas = this.atlas!
    const rect = this.variants.get(entity)!
    const scale = this.camera.scale
    const ppt = atlas.manifest.pixelsPerTile

    const centreX = entity.x + entity.w / 2
    const centreY = entity.y + entity.h / 2
    const origin = this.toScreen(centreX + rect.ox, centreY + rect.oy)
    const w = (rect.w / ppt) * scale
    const h = (rect.h / ppt) * scale

    const { width, height } = this.viewport()
    if (origin.x + w < 0 || origin.y + h < 0 || origin.x > width || origin.y > height) return

    this.ctx.drawImage(atlas.image, rect.x, rect.y, rect.w, rect.h, origin.x, origin.y, w, h)
    this.drawFluidConnections(entity, centreX, centreY)
  }

  /** One more piece of atlas art, placed from the entity's centre like the rest. */
  private drawPiece(rect: SpriteRect | undefined, centreX: number, centreY: number): void {
    if (!rect) return
    const atlas = this.atlas!
    const scale = this.camera.scale
    const ppt = atlas.manifest.pixelsPerTile
    const origin = this.toScreen(centreX + rect.ox, centreY + rect.oy)
    this.ctx.drawImage(
      atlas.image,
      rect.x,
      rect.y,
      rect.w,
      rect.h,
      origin.x,
      origin.y,
      (rect.w / ppt) * scale,
      (rect.h / ppt) * scale,
    )
  }

  /** Whether something that carries fluid stands on a tile, so a connection is met there. */
  private carriesFluidAt(x: number, y: number): boolean {
    const neighbour = this.occupied.get(`${Math.floor(x)},${Math.floor(y)}`)
    if (!neighbour) return false
    return neighbour.proto.kind === 'pipe' || Boolean(this.atlas?.manifest.fluidBoxes?.[neighbour.proto.name])
  }

  /**
   * A machine with a fluid recipe grows pipe stubs where its fluid boxes are. The game keeps
   * these out of the machine's own art — a dry assembler has no pipes at all — and hands over
   * one sprite per side, so the stub turns with the machine and meets whatever is next to it.
   *
   * Which boxes light up follows the recipe: its fluid ingredients fill the input boxes in
   * order, its fluid products the output ones.
   *
   * Two things about the art are worth writing down, because neither is guessable. It is
   * placed relative to the connection, not to the machine, so the box's own offset has to be
   * added. And it is keyed by the side the stub is *seen from* — the sprite for a connection
   * pointing north is `south` — so reading the key as the connection's own side puts every
   * pipe on the wrong edge.
   */
  private drawFluidConnections(entity: PlacedEntity, centreX: number, centreY: number): void {
    const atlas = this.atlas!
    const connections = atlas.manifest.fluidBoxes?.[entity.proto.name]
    // A pipe works its own shape out from its neighbours; this is for what it connects to.
    if (!connections || entity.proto.kind === 'pipe') return

    const fluids = entity.recipe ? this.fluidsOf(entity.recipe) : undefined
    const variants = atlas.manifest.entities[entity.proto.name]
    let inputs = 0
    let outputs = 0

    for (const box of connections) {
      const nth = box.type === 'input' ? inputs++ : outputs++
      const wanted = box.type === 'input' ? (fluids?.inputs ?? 0) : (fluids?.outputs ?? 0)
      // A box that switches off is only there when the recipe has a fluid to put in it.
      if (box.optional && nth >= wanted) continue

      const side = (box.dir + entity.dir) % 16
      const at = turnAround(box.pos, entity.dir)
      const x = centreX + at.x
      const y = centreY + at.y

      if (box.stub) this.drawPiece(variants[`pipe-${box.box}-${directionName((side + 8) % 16)}`], x, y)

      // The cap goes on whatever is still open; a pipe next door fills the hole itself. It
      // belongs on the tile the pipe would have taken, not on the machine's own.
      const step = STEP[side] ?? STEP[0]
      const beyond = { x: x + step.x, y: y + step.y }
      if (box.cover && !this.carriesFluidAt(beyond.x, beyond.y)) {
        this.drawPiece(variants[`cover-${box.box}-${directionName(side)}`], beyond.x, beyond.y)
      }
    }
  }

  /** The colour-coded fallback: used in schematic mode and for anything the atlas lacks. */
  private drawSchematic(entity: PlacedEntity): void {
    const ctx = this.ctx
    const scale = this.camera.scale
    const origin = this.toScreen(entity.x, entity.y)
    const w = entity.w * scale
    const h = entity.h * scale

    const { width, height } = this.viewport()
    if (origin.x + w < 0 || origin.y + h < 0 || origin.x > width || origin.y > height) return

    const isBelt = entity.proto.kind === 'belt' || entity.proto.kind === 'underground-belt'
    const tint = TIER_TINT[entity.proto.name] ?? entity.proto.icon?.color ?? '#5a6270'
    const inset = Math.min(1.5, scale * 0.06)

    ctx.fillStyle = withAlpha(tint, isBelt ? 0.4 : 0.28)
    roundRect(ctx, origin.x + inset, origin.y + inset, w - inset * 2, h - inset * 2, Math.min(4, scale * 0.16))
    ctx.fill()

    ctx.strokeStyle = withAlpha(tint, 0.85)
    ctx.lineWidth = 1
    ctx.stroke()

    if (isBelt) {
      this.drawChevron(entity, origin, w, h, tint)
    } else if (this.iconSheet && scale >= 14) {
      const icon = this.icons(entity.proto.name)
      if (icon) {
        const size = Math.min(w, h) * 0.78
        ctx.drawImage(
          this.iconSheet,
          icon.x,
          icon.y,
          ICON_CELL,
          ICON_CELL,
          origin.x + (w - size) / 2,
          origin.y + (h - size) / 2,
          size,
          size,
        )
      }
    }

    if (!isBelt && entity.proto.rotatable && entity.dir !== 0) {
      this.drawFacingMarker(entity, origin, w, h)
    }
  }

  /**
   * The supply area, drawn as one flat wash rather than a rectangle per pole — overlapping
   * poles would otherwise stack into a darker patch that means nothing. Tiles on the edge of
   * the region get an outline, and anything left in the dark gets a ring.
   */
  private drawPower(report: PowerReport, width: number, height: number): void {
    const ctx = this.ctx
    const scale = this.camera.scale

    const topLeft = this.toWorld(0, 0)
    const bottomRight = this.toWorld(width, height)
    const left = Math.floor(topLeft.x) - 1
    const right = Math.ceil(bottomRight.x) + 1
    const top = Math.floor(topLeft.y) - 1
    const bottom = Math.ceil(bottomRight.y) + 1

    const lit = (x: number, y: number) => report.covered.has(`${x},${y}`)

    ctx.fillStyle = 'rgba(86, 156, 255, 0.17)'
    for (let x = left; x <= right; x++) {
      for (let y = top; y <= bottom; y++) {
        if (!lit(x, y)) continue
        const at = this.toScreen(x, y)
        ctx.fillRect(at.x, at.y, scale + 0.5, scale + 0.5)
      }
    }

    ctx.strokeStyle = 'rgba(126, 186, 255, 0.85)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    for (let x = left; x <= right; x++) {
      for (let y = top; y <= bottom; y++) {
        if (!lit(x, y)) continue
        const at = this.toScreen(x, y)
        if (!lit(x, y - 1)) {
          ctx.moveTo(at.x, at.y)
          ctx.lineTo(at.x + scale, at.y)
        }
        if (!lit(x, y + 1)) {
          ctx.moveTo(at.x, at.y + scale)
          ctx.lineTo(at.x + scale, at.y + scale)
        }
        if (!lit(x - 1, y)) {
          ctx.moveTo(at.x, at.y)
          ctx.lineTo(at.x, at.y + scale)
        }
        if (!lit(x + 1, y)) {
          ctx.moveTo(at.x + scale, at.y)
          ctx.lineTo(at.x + scale, at.y + scale)
        }
      }
    }
    ctx.stroke()

    ctx.strokeStyle = '#ff9f4a'
    ctx.lineWidth = 2
    for (const entity of report.unpowered) {
      const at = this.toScreen(entity.x, entity.y)
      ctx.strokeRect(at.x + 1, at.y + 1, entity.w * scale - 2, entity.h * scale - 2)
    }
  }

  /** Recipe and module badges, collision and hover rings — drawn above every entity. */
  private drawOverlays(entity: PlacedEntity): void {
    const ctx = this.ctx
    const scale = this.camera.scale
    const origin = this.toScreen(entity.x, entity.y)
    const w = entity.w * scale
    const h = entity.h * scale

    const { width, height } = this.viewport()
    if (origin.x + w < 0 || origin.y + h < 0 || origin.x > width || origin.y > height) return

    // The game floats the recipe icon over a machine; it is the fastest way to read a build.
    if (entity.recipe && this.iconSheet && scale >= 18) {
      const icon = this.icons(entity.recipe)
      if (icon) {
        const size = Math.min(w, h) * 0.3
        const cx = origin.x + w / 2
        const cy = origin.y + h / 2 - (entity.modules?.length ? size * 0.35 : 0)
        ctx.fillStyle = 'rgba(12, 15, 19, 0.74)'
        roundRect(ctx, cx - size * 0.68, cy - size * 0.68, size * 1.36, size * 1.36, size * 0.26)
        ctx.fill()
        ctx.drawImage(this.iconSheet, icon.x, icon.y, ICON_CELL, ICON_CELL, cx - size / 2, cy - size / 2, size, size)
      }
    }

    this.drawModules(entity, origin, w, h)
    this.drawContent(entity, origin, w, h)
    this.drawFilters(entity, origin, w, h)
    this.drawPriorities(entity, origin, w, h)

    if (this.clashing.has(entity)) {
      ctx.fillStyle = 'rgba(255, 80, 80, 0.32)'
      ctx.fillRect(origin.x, origin.y, w, h)
      ctx.strokeStyle = '#ff5050'
      ctx.lineWidth = 2
      ctx.strokeRect(origin.x + 1, origin.y + 1, w - 2, h - 2)
    }

    if (this.hovered === entity) {
      ctx.strokeStyle = '#ffae3f'
      ctx.lineWidth = 2
      ctx.strokeRect(origin.x + 1, origin.y + 1, w - 2, h - 2)
    }
  }

  /**
   * Modules sit in the blueprint but the sprite cannot show them, so they get a badge along
   * the bottom edge: one icon per module in slot order, each carrying its quality mark.
   */
  private drawModules(entity: PlacedEntity, origin: { x: number; y: number }, w: number, h: number): void {
    const modules = entity.modules
    if (!modules?.length || !this.iconSheet) return

    const shown = modules.slice(0, MAX_MODULE_ICONS)
    const hidden = modules.length - shown.length

    // Start from a fixed share of the entity, then shrink so the whole badge — icons, gaps
    // and padding — fits inside the footprint. Machines in a row touch, so a badge that
    // overhangs merges with its neighbour's into one unreadable strip.
    //   n·s + (n-1)·0.1s + 2·0.22s ≤ w   ⇒   s ≤ w / (1.1n + 0.34)
    const count = shown.length
    const size = Math.min(Math.min(w, h) * 0.234, w / (1.1 * count + 0.34))
    const gap = size * 0.1
    if (size < 8) return

    const ctx = this.ctx
    ctx.font = `600 ${Math.max(7, Math.round(size * 0.6))}px ui-monospace, Menlo, monospace`
    ctx.textBaseline = 'middle'

    const overflow = hidden > 0 ? `+${hidden}` : ''
    const contentWidth = count * size + (count - 1) * gap + (overflow ? gap + ctx.measureText(overflow).width : 0)

    const padding = size * 0.22
    const pillHeight = size + padding
    const left = origin.x + w / 2 - contentWidth / 2
    const top = origin.y + h - pillHeight - Math.min(3, this.camera.scale * 0.06)

    ctx.fillStyle = 'rgba(12, 15, 19, 0.82)'
    roundRect(ctx, left - padding, top, contentWidth + padding * 2, pillHeight, pillHeight * 0.3)
    ctx.fill()

    let cursor = left
    for (const module of shown) {
      const icon = this.icons(module.name)
      if (icon) {
        ctx.drawImage(this.iconSheet, icon.x, icon.y, ICON_CELL, ICON_CELL, cursor, top + padding / 2, size, size)
      }

      // The quality mark rides the corner of the module it belongs to, as it does in game.
      const qualityIcon = module.quality && module.quality !== 'normal' ? this.icons(module.quality) : undefined
      if (qualityIcon) {
        const badge = size * 0.5
        ctx.drawImage(
          this.iconSheet,
          qualityIcon.x,
          qualityIcon.y,
          ICON_CELL,
          ICON_CELL,
          cursor - badge * 0.15,
          top + padding / 2 + size - badge * 0.85,
          badge,
          badge,
        )
      }

      cursor += size + gap
    }

    if (overflow) {
      ctx.fillStyle = '#8b95a3'
      ctx.fillText(overflow, cursor, top + pillHeight / 2)
    }
  }

  /** One item icon on a dark disc, the shared shape behind every metadata badge. */
  private drawItemBadge(item: string, cx: number, cy: number, size: number, tint?: string): void {
    const icon = this.icons(item)
    if (!icon || !this.iconSheet) return

    const ctx = this.ctx
    ctx.fillStyle = tint ?? 'rgba(12, 15, 19, 0.78)'
    roundRect(ctx, cx - size * 0.64, cy - size * 0.64, size * 1.28, size * 1.28, size * 0.3)
    ctx.fill()
    ctx.drawImage(this.iconSheet, icon.x, icon.y, ICON_CELL, ICON_CELL, cx - size / 2, cy - size / 2, size, size)
  }

  /**
   * What a belt or chest is meant to carry. It never reaches the blueprint, but seeing which
   * item travels on which lane is most of reading a bus at a glance.
   */
  private drawContent(entity: PlacedEntity, origin: { x: number; y: number }, w: number, h: number): void {
    const content = entity.content
    if (!content?.length || !this.iconSheet) return

    const scale = this.camera.scale
    if (scale < 20) return

    const ctx = this.ctx
    const cx = origin.x + w / 2
    const cy = origin.y + h / 2

    if (entity.proto.kind === 'container') {
      const items = [...new Set(content.map((entry) => entry.item))]
      if (items.length > MAX_CHEST_ICONS) {
        // Past a handful the icons stop being readable, so say how many kinds are in there.
        const label = `${items.length} items`
        // Measure once at a known size and scale from that, so the pill stays inside the
        // chest instead of reaching across its neighbours.
        ctx.font = `600 10px ui-monospace, Menlo, monospace`
        const font = Math.max(7, Math.min(Math.min(w, h) * 0.28, (w * 0.86 * 10) / ctx.measureText(label).width))
        ctx.font = `600 ${font}px ui-monospace, Menlo, monospace`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        const width = ctx.measureText(label).width
        ctx.fillStyle = 'rgba(12, 15, 19, 0.82)'
        roundRect(ctx, cx - width / 2 - font * 0.4, cy - font * 0.75, width + font * 0.8, font * 1.5, font * 0.75)
        ctx.fill()
        ctx.fillStyle = '#e8edf5'
        ctx.fillText(label, cx, cy)
        ctx.textAlign = 'left'
        return
      }

      // Up to four kinds tile the chest: one centred, otherwise a 2×2 grid.
      const size = items.length === 1 ? Math.min(w, h) * 0.44 : Math.min(w, h) * 0.3
      const spread = size * 0.72
      items.forEach((item, index) => {
        const dx = items.length === 1 ? 0 : (index % 2 === 0 ? -spread : spread)
        const dy = items.length === 1 ? 0 : (index < 2 ? -spread : spread)
        this.drawItemBadge(item, cx + dx, cy + (items.length === 2 ? 0 : dy), size)
      })
      return
    }

    // On a belt the icon rides its own lane, on every tile of the run, so the whole path
    // says what travels along it.
    const size = Math.min(w, h) * 0.34
    for (const entry of content) {
      const lane = entry.side ? laneVector(entity.dir, entry.side) : { x: 0, y: 0 }
      this.drawItemBadge(entry.item, cx + lane.x * w * 0.24, cy + lane.y * h * 0.24, size)
    }
  }

  /** An inserter's filters, struck through when they are a blacklist. */
  private drawFilters(entity: PlacedEntity, origin: { x: number; y: number }, w: number, h: number): void {
    const spec = entity.filters
    if (!spec?.items.length || !this.iconSheet || this.camera.scale < 22) return

    const ctx = this.ctx
    const size = Math.min(w, h) * 0.4
    const shown = spec.items.slice(0, 2)
    const gap = size * 0.2
    const total = shown.length * size + (shown.length - 1) * gap
    const cy = origin.y + h * 0.32
    let cx = origin.x + w / 2 - total / 2 + size / 2

    for (const item of shown) {
      this.drawItemBadge(item, cx, cy, size, spec.negated ? 'rgba(74, 16, 16, 0.86)' : 'rgba(12, 15, 19, 0.78)')
      if (spec.negated) {
        ctx.strokeStyle = '#ff6b6b'
        ctx.lineWidth = Math.max(1.4, size * 0.12)
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(cx - size * 0.44, cy + size * 0.44)
        ctx.lineTo(cx + size * 0.44, cy - size * 0.44)
        ctx.stroke()
      }
      cx += size + gap
    }

    const hidden = spec.items.length - shown.length
    if (hidden > 0) {
      ctx.font = `600 ${Math.max(8, Math.round(size * 0.6))}px ui-monospace, Menlo, monospace`
      ctx.textBaseline = 'middle'
      ctx.fillStyle = spec.negated ? '#ff9b9b' : '#8b95a3'
      ctx.fillText(`+${hidden}`, cx - size * 0.3, cy)
    }
  }

  /**
   * Splitter lane priorities and the filter, drawn where they act: a chevron on the input
   * edge for the lane it prefers to take from, another on the output edge for the lane it
   * gives to, and the filtered item on the lane it is sent out by. Which edge a chevron sits
   * on already says whether it is the input or the output, so both are the same colour.
   */
  private drawPriorities(entity: PlacedEntity, origin: { x: number; y: number }, w: number, h: number): void {
    if (entity.proto.kind !== 'splitter') return
    if (!entity.inPriority && !entity.outPriority && !entity.splitterFilter) return
    if (this.camera.scale < 20) return

    const ctx = this.ctx
    const forward = STEP[entity.dir] ?? STEP[0]
    const cx = origin.x + w / 2
    const cy = origin.y + h / 2
    // The splitter is one tile deep along the flow and two tiles wide across it.
    const depth = Math.abs(forward.x) * w + Math.abs(forward.y) * h
    const across = Math.abs(forward.x) * h + Math.abs(forward.y) * w

    const mark = (side: 'left' | 'right', edge: -1 | 1): void => {
      const lane = laneVector(entity.dir, side)
      const mx = cx + forward.x * depth * 0.33 * edge + lane.x * across * 0.25
      const my = cy + forward.y * depth * 0.33 * edge + lane.y * across * 0.25
      const r = Math.min(depth, across / 2) * 0.27
      // Screen y grows downward, and so does Factorio's; north is -y, which is angle -90°.
      const angle = (entity.dir / 16) * Math.PI * 2 - Math.PI / 2

      ctx.save()
      ctx.translate(mx, my)
      ctx.rotate(angle)
      ctx.strokeStyle = '#ffae3f'
      ctx.lineWidth = Math.max(1.6, r * 0.46)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      ctx.moveTo(-r * 0.5, -r * 0.75)
      ctx.lineTo(r * 0.45, 0)
      ctx.lineTo(-r * 0.5, r * 0.75)
      ctx.stroke()
      ctx.restore()
    }

    // A filter always leaves by one named side, and the game picks left when none was given.
    // Showing that side makes the preview say what the blueprint holds.
    const outSide = entity.outPriority ?? (entity.splitterFilter ? 'left' : undefined)

    // The item goes down first so the chevrons stay crisp where the two meet.
    if (entity.splitterFilter) {
      const lane = laneVector(entity.dir, outSide ?? 'left')
      this.drawItemBadge(
        entity.splitterFilter,
        cx + lane.x * across * 0.25,
        cy + lane.y * across * 0.25,
        Math.min(w, h) * 0.38,
      )
    }

    if (entity.inPriority) mark(entity.inPriority, -1)
    if (outSide) mark(outSide, 1)
  }

  private drawChevron(
    entity: PlacedEntity,
    origin: { x: number; y: number },
    w: number,
    h: number,
    tint: string,
  ): void {
    const ctx = this.ctx
    const cx = origin.x + w / 2
    const cy = origin.y + h / 2
    const r = Math.min(w, h) * 0.3
    // Screen y grows downward, and so does Factorio's; north is -y, which is angle -90°.
    const angle = (entity.dir / 16) * Math.PI * 2 - Math.PI / 2

    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(angle)
    ctx.strokeStyle = withAlpha(tint, 1)
    ctx.lineWidth = Math.max(1.2, r * 0.32)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(-r * 0.55, -r * 0.55)
    ctx.lineTo(r * 0.5, 0)
    ctx.lineTo(-r * 0.55, r * 0.55)
    ctx.stroke()

    // Entry and exit look alike otherwise, so mark which side the belt goes underground on.
    if (entity.undergroundType) {
      ctx.fillStyle = 'rgba(232, 237, 245, 0.8)'
      const bar = entity.undergroundType === 'input' ? -r * 1.0 : r * 0.7
      ctx.fillRect(bar, -r * 0.9, r * 0.3, r * 1.8)
    }
    ctx.restore()
  }

  /** A small wedge on the edge the entity faces. */
  private drawFacingMarker(
    entity: PlacedEntity,
    origin: { x: number; y: number },
    w: number,
    h: number,
  ): void {
    const ctx = this.ctx
    const cx = origin.x + w / 2
    const cy = origin.y + h / 2
    const angle = (entity.dir / 16) * Math.PI * 2 - Math.PI / 2
    const reach = Math.min(w, h) / 2
    const size = Math.max(3, Math.min(7, reach * 0.3))

    ctx.save()
    ctx.translate(cx + Math.cos(angle) * (reach - size * 0.7), cy + Math.sin(angle) * (reach - size * 0.7))
    ctx.rotate(angle)
    ctx.fillStyle = '#ffae3f'
    ctx.beginPath()
    ctx.moveTo(size * 0.8, 0)
    ctx.lineTo(-size * 0.5, -size * 0.6)
    ctx.lineTo(-size * 0.5, size * 0.6)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }

  private drawOrigin(): void {
    const ctx = this.ctx
    const p = this.toScreen(0, 0)
    ctx.strokeStyle = 'rgba(255, 174, 63, 0.35)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(p.x - 7, p.y)
    ctx.lineTo(p.x + 7, p.y)
    ctx.moveTo(p.x, p.y - 7)
    ctx.lineTo(p.x, p.y + 7)
    ctx.stroke()
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  ctx.roundRect(x, y, Math.max(0, w), Math.max(0, h), radius)
}

function withAlpha(color: string, alpha: number): string {
  const hex = color.replace('#', '')
  if (hex.length !== 6) return color
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
