import { formatBytes, type OnProgress } from '../data/progress'

/**
 * Two states, because the assets are not equally urgent.
 *
 * The dataset blocks: without recipes and entity sizes nothing compiles, so it gets the
 * overlay. The icon sheet and the 12MB sprite atlas do not — the studio runs and renders
 * without them — so they get a corner chip and upgrade the view when they land.
 */
interface Tracked {
  label: string
  loaded: number
  total: number
  done: boolean
}

export class Preloader {
  private readonly assets = new Map<string, Tracked>()

  constructor(
    private readonly overlay: HTMLElement,
    private readonly chip: HTMLElement,
  ) {}

  /** Shows the blocking overlay. */
  begin(message: string): void {
    this.overlay.textContent = message
    this.overlay.hidden = false
  }

  done(): void {
    this.overlay.hidden = true
  }

  fail(message: string): void {
    this.overlay.textContent = message
    this.overlay.hidden = false
  }

  /** Starts tracking one background asset and returns the callback that feeds it. */
  track(key: string, label: string): OnProgress {
    this.assets.set(key, { label, loaded: 0, total: 0, done: false })
    this.draw()
    return ({ loaded, total }) => {
      const asset = this.assets.get(key)
      if (!asset) return
      asset.loaded = loaded
      asset.total = total
      this.draw()
    }
  }

  finish(key: string): void {
    const asset = this.assets.get(key)
    if (asset) asset.done = true
    this.draw()
  }

  private draw(): void {
    const pending = [...this.assets.values()].filter((asset) => !asset.done)
    if (pending.length === 0) {
      this.chip.hidden = true
      this.chip.replaceChildren()
      return
    }

    this.chip.hidden = false
    this.chip.replaceChildren(
      ...pending.map((asset) => {
        const row = document.createElement('div')
        row.className = 'preload-row'

        const label = document.createElement('span')
        label.className = 'preload-label'
        label.textContent = asset.label

        const size = document.createElement('span')
        size.className = 'preload-size'
        size.textContent = asset.total
          ? `${formatBytes(asset.loaded)} / ${formatBytes(asset.total)}`
          : formatBytes(asset.loaded)

        const track = document.createElement('div')
        track.className = 'preload-track'
        const bar = document.createElement('i')
        // Without a total the server did not say how big it is; show it moving, not lying.
        bar.className = asset.total ? 'preload-bar' : 'preload-bar preload-bar-unknown'
        if (asset.total) bar.style.width = `${Math.min(100, (100 * asset.loaded) / asset.total)}%`
        track.append(bar)

        row.append(label, size, track)
        return row
      }),
    )
  }
}
