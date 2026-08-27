import './style.css'

import {
  ProtoRegistry,
  compile,
  computeCost,
  exportBlueprint,
  powerCoverage,
  type BlockSignature,
  type Diagnostic,
  type PlacedEntity,
} from '../core'
import { loadDataset } from '../data/loader'
import { fetchBytes, type OnProgress } from '../data/progress'
import { loadAtlas } from '../data/sprites'
import { DEFAULT_VERSION, VERSIONS } from '../data/versions'
import { BlueprintCanvas, type ViewMode } from './canvas'
import { renderCost, type CostMode, type IconSheet } from './cost-panel'
import { renderDocs } from './docs'
import { createEditor, type Editor } from './editor'
import { EXAMPLES } from './examples'
import { Preloader } from './preloader'

const STORAGE_SOURCE = 'fbl.source'
const STORAGE_VERSION = 'fbl.version'
const STORAGE_MODE = 'fbl.mode'

const el = <T extends HTMLElement>(id: string): T => {
  const found = document.getElementById(id)
  if (!found) throw new Error(`#${id} is missing from index.html`)
  return found as T
}

const dom = {
  editor: el('editor'),
  canvas: el<HTMLCanvasElement>('canvas'),
  tooltip: el('tooltip'),
  loading: el('loading'),
  preload: el('preload'),
  console: el('console'),
  docs: el('docs'),
  cost: el('cost'),
  tabs: el('tabs'),
  version: el<HTMLSelectElement>('version'),
  example: el<HTMLSelectElement>('example'),
  copy: el<HTMLButtonElement>('copy'),
  fit: el<HTMLButtonElement>('fit'),
  power: el<HTMLButtonElement>('power'),
  stats: el('stats'),
  view: el('view'),
  splitter: el('splitter'),
  panes: document.querySelector<HTMLElement>('.panes')!,
}

const preview = new BlueprintCanvas(dom.canvas, dom.tooltip)
const preloader = new Preloader(dom.loading, dom.preload)

/** Shared with the language providers, which read it on every keystroke. */
const host: { registry: ProtoRegistry | null; blocks: BlockSignature[] } = { registry: null, blocks: [] }

let source = readStorage(STORAGE_SOURCE) ?? EXAMPLES[0].source
let blueprintText = ''
let costMode: CostMode = (readStorage('fbl.cost') as CostMode) ?? 'raw'
let showPower = readStorage('fbl.power') === 'on'
let iconSheet: IconSheet | null = null
/** Kept so the cost panel can redraw when its tab changes, without recompiling. */
let lastCost: ReturnType<typeof computeCost> | null = null
/** Bumped on every dataset load so a slow one cannot clobber a newer one. */
let generation = 0

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Private windows and blocked site data are fine; the editor just will not persist.
  }
}

// ── Console ───────────────────────────────────────────────────────────────────

function log(
  kind: 'error' | 'warning' | 'out',
  text: string,
  loc?: { line: number; col: number },
  hint?: string,
): void {
  const row = document.createElement('div')
  row.className = `msg msg-${kind}`

  const where = document.createElement('span')
  where.className = 'where'
  if (loc) {
    where.textContent = `${loc.line}:${loc.col}`
    where.classList.add('clickable')
    where.title = 'jump to this line'
    where.addEventListener('click', () => editor.reveal(loc.line, loc.col))
  } else {
    where.textContent = kind === 'out' ? '›' : ''
  }

  const body = document.createElement('span')
  body.textContent = text
  if (hint) {
    const note = document.createElement('span')
    note.className = 'hint'
    note.textContent = ` — ${hint}`
    body.append(note)
  }

  row.append(where, body)
  dom.console.append(row)
}

// ── Compile ───────────────────────────────────────────────────────────────────

function build(): void {
  if (!host.registry) return
  dom.console.replaceChildren()

  const clashing = new Set<PlacedEntity>()
  blueprintText = ''

  const { scene, output, diagnostics, ran, blocks } = compile(source, host.registry)
  host.blocks = blocks
  const all: Diagnostic[] = [...diagnostics]

  if (ran) {
    for (const clash of scene.findCollisions()) {
      clashing.add(clash.a)
      clashing.add(clash.b)
      all.push({
        severity: 'warning',
        message: `${clash.a.proto.label} and ${clash.b.proto.label} overlap at (${clash.x}, ${clash.y})`,
        loc: clash.b.loc,
      })
    }
    blueprintText = exportBlueprint(scene, host.registry, { label: 'fbl blueprint' }).text
    for (const line of output) log('out', line)
  }

  const power = ran && scene.entities.length ? powerCoverage(scene.entities) : null
  preview.setPower(power)
  // Only worth saying when there are poles at all — plenty of blueprints leave power out.
  if (power && power.poles > 0 && power.unpowered.length > 0) {
    all.push({
      severity: 'warning',
      message: `${power.unpowered.length} of ${power.consumers} powered entities are outside every supply area`,
      loc: power.unpowered[0].loc,
    })
  }

  lastCost = ran && scene.entities.length ? computeCost(scene, host.registry) : null
  drawCost()

  for (const diagnostic of all) log(diagnostic.severity, diagnostic.message, diagnostic.loc, diagnostic.hint)
  editor.setDiagnostics(all)

  preview.setScene(scene.entities, clashing)
  dom.copy.disabled = blueprintText === ''

  const errors = all.filter((d) => d.severity === 'error').length
  const warnings = all.length - errors
  dom.stats.textContent = errors
    ? `${errors} error${errors === 1 ? '' : 's'}`
    : scene.entities.length
      ? `${scene.entities.length} entities · ${warnings} warning${warnings === 1 ? '' : 's'}`
      : ''
}

function drawCost(): void {
  if (!lastCost || !host.registry) {
    dom.cost.hidden = true
    return
  }
  const registry = host.registry
  dom.cost.innerHTML = renderCost(lastCost, costMode, {
    icon: (name) => registry.icons.get(name),
    label: (name) => registry.itemLabels.get(name) ?? name,
    sheet: iconSheet,
  })
  dom.cost.hidden = dom.cost.innerHTML.trim() === ''
}

dom.cost.addEventListener('click', (event) => {
  const mode = (event.target as HTMLElement).closest('button')?.dataset.costMode
  if (!mode) return
  costMode = mode as CostMode
  writeStorage('fbl.cost', costMode)
  drawCost()
})

// ── Dataset ───────────────────────────────────────────────────────────────────

async function selectVersion(id: string): Promise<void> {
  const mine = ++generation
  preloader.begin(`loading ${id}…`)
  writeStorage(STORAGE_VERSION, id)

  let loaded
  try {
    loaded = await loadDataset(id)
  } catch (error) {
    if (mine !== generation) return
    preloader.fail(error instanceof Error ? error.message : String(error))
    return
  }
  if (mine !== generation) return

  // The dataset is all that compiling needs, so the studio opens now and the art catches up.
  host.registry = new ProtoRegistry(loaded.data, loaded.profile)
  dom.docs.innerHTML = renderDocs(host.registry)
  preloader.done()
  build()
  preview.fit()

  const iconsUrl = loaded.iconsUrl
  void loadImage(iconsUrl, preloader.track(`icons:${id}`, 'item icons')).then((icons) => {
    preloader.finish(`icons:${id}`)
    if (mine !== generation) return
    iconSheet = icons ? { url: iconsUrl, width: icons.naturalWidth, height: icons.naturalHeight } : null
    preview.setIcons(icons, (name: string) => host.registry?.icons.get(name))
    drawCost()
  })
}

async function loadImage(url: string, onProgress?: OnProgress): Promise<HTMLImageElement | null> {
  const blob = await fetchBytes(url, onProgress)
  // Missing art is not fatal — entities still render as tinted footprints.
  if (!blob) return null

  const objectUrl = URL.createObjectURL(blob)
  const image = await new Promise<HTMLImageElement | null>((resolve) => {
    const element = new Image()
    element.onload = () => resolve(element)
    element.onerror = () => resolve(null)
    element.src = objectUrl
  })
  URL.revokeObjectURL(objectUrl)
  return image
}

// ── Wiring ────────────────────────────────────────────────────────────────────

for (const version of VERSIONS) dom.version.append(new Option(version.label, version.id))
dom.version.value = readStorage(STORAGE_VERSION) ?? DEFAULT_VERSION.id

dom.example.append(new Option('—', ''))
for (const example of EXAMPLES) dom.example.append(new Option(example.label, example.id))

let debounce = 0
const editor: Editor = createEditor(dom.editor, source, host)
editor.onChange((next) => {
  source = next
  writeStorage(STORAGE_SOURCE, next)
  window.clearTimeout(debounce)
  debounce = window.setTimeout(build, 200)
})

dom.version.addEventListener('change', () => void selectVersion(dom.version.value))

dom.example.addEventListener('change', () => {
  const example = EXAMPLES.find((e) => e.id === dom.example.value)
  if (!example) return
  editor.setValue(example.source)
  source = example.source
  dom.example.value = ''
  build()
  window.setTimeout(() => preview.fit(), 60)
})

dom.fit.addEventListener('click', () => preview.fit())

function setPower(on: boolean): void {
  showPower = on
  preview.setPowerVisible(on)
  dom.power.classList.toggle('active', on)
  writeStorage('fbl.power', on ? 'on' : 'off')
}

dom.power.addEventListener('click', () => setPower(!showPower))
setPower(showPower)

dom.copy.addEventListener('click', async () => {
  if (!blueprintText) return
  try {
    await navigator.clipboard.writeText(blueprintText)
    dom.copy.textContent = 'copied ✓'
    dom.copy.classList.add('copied')
  } catch {
    dom.copy.textContent = 'copy failed'
  }
  window.setTimeout(() => {
    dom.copy.textContent = 'copy blueprint'
    dom.copy.classList.remove('copied')
  }, 1400)
})

// ── Tabs ──────────────────────────────────────────────────────────────────────

dom.tabs.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest('button')
  const tab = button?.dataset.tab
  if (!tab) return
  for (const other of dom.tabs.querySelectorAll('button')) {
    other.classList.toggle('active', other.dataset.tab === tab)
  }
  el('tab-blueprint').hidden = tab !== 'blueprint'
  el('tab-docs').hidden = tab !== 'docs'
  if (tab === 'blueprint') preview.requestRender()
})

// ── View mode ─────────────────────────────────────────────────────────────────

/**
 * `remember` is false when the studio falls back on its own — a visitor who arrives before
 * the atlas exists should not be left preferring the schematic view forever.
 */
function setMode(mode: ViewMode, remember = true): void {
  preview.setMode(mode)
  if (remember) writeStorage(STORAGE_MODE, mode)
  for (const button of dom.view.querySelectorAll('button')) {
    button.classList.toggle('active', button.dataset.mode === mode)
  }
}

dom.view.addEventListener('click', (event) => {
  const button = (event.target as HTMLElement).closest('button')
  if (button?.dataset.mode) setMode(button.dataset.mode as ViewMode)
})

void loadAtlas(preloader.track('sprites', 'entity sprites')).then((atlas) => {
  preloader.finish('sprites')
  preview.setAtlas(atlas)
  if (!atlas) {
    // Without a local Factorio install there is no art to show; schematic is the only view.
    for (const button of dom.view.querySelectorAll('button')) {
      if (button.dataset.mode === 'sprites') {
        button.disabled = true
        button.title = 'run `npm run extract-sprites` with Factorio installed'
      }
    }
    setMode('schematic', false)
    return
  }
  dom.view.title = `game art from Factorio ${atlas.manifest.gameVersion}`
  setMode((readStorage(STORAGE_MODE) as ViewMode) ?? 'sprites')
})

window.addEventListener('keydown', (event) => {
  const inEditor = dom.editor.contains(document.activeElement)
  if (event.metaKey || event.ctrlKey || inEditor) return
  if (event.key === 'f') preview.fit()
  if (event.key === 'p') setPower(!showPower)
})

// Draggable split between code and preview.
dom.splitter.addEventListener('pointerdown', (event) => {
  dom.splitter.setPointerCapture(event.pointerId)
  dom.splitter.classList.add('dragging')

  const move = (moved: PointerEvent) => {
    const rect = dom.panes.getBoundingClientRect()
    const ratio = ((moved.clientX - rect.left) / rect.width) * 100
    dom.panes.style.setProperty('--split', `${Math.max(20, Math.min(80, ratio))}%`)
  }
  const up = () => {
    dom.splitter.classList.remove('dragging')
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }

  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
})

void selectVersion(dom.version.value)
