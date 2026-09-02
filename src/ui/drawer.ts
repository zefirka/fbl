import { EXAMPLES } from './examples'
import { listSchemas, removeSchema, saveSchema, type Schema } from './schemas'

/**
 * The menu behind the burger: what there is to read, and what you have kept.
 *
 * It owns nothing but the list — loading a source and knowing what is currently open are the
 * studio's business, so both arrive as callbacks.
 */
export interface DrawerDeps {
  /** Puts a source in the editor. */
  open: (source: string, name: string | null) => void
  /** What is in the editor right now, for the save button. */
  current: () => { source: string; name: string | null }
  /** Called whenever the buffer takes on a name, so it survives a reload. */
  remember: (name: string | null) => void
}

const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export class Drawer {
  private open = false
  /** The name this buffer was last saved or loaded under, shown in the save box. */
  private name: string | null = null

  constructor(
    private readonly panel: HTMLElement,
    private readonly scrim: HTMLElement,
    private readonly button: HTMLElement,
    private readonly deps: DrawerDeps,
  ) {
    button.addEventListener('click', () => this.toggle())
    scrim.addEventListener('click', () => this.close())
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.open) this.close()
    })

    panel.addEventListener('click', (event) => this.onClick(event))
    panel.addEventListener('submit', (event) => this.onSave(event))
  }

  /** Called when a source is loaded from anywhere, so the save box knows what it is looking at. */
  setName(name: string | null): void {
    this.name = name
    if (this.open) this.render()
  }

  toggle(): void {
    this.open ? this.close() : this.show()
  }

  show(): void {
    this.open = true
    this.render()
    this.panel.hidden = false
    this.scrim.hidden = false
    this.button.setAttribute('aria-expanded', 'true')
    this.panel.querySelector<HTMLInputElement>('#schema-name')?.focus()
  }

  close(): void {
    this.open = false
    this.panel.hidden = true
    this.scrim.hidden = true
    this.button.setAttribute('aria-expanded', 'false')
  }

  private onClick(event: Event): void {
    const target = event.target as HTMLElement

    if (target.closest('[data-drawer-close]')) return this.close()

    const remove = target.closest<HTMLElement>('[data-remove]')
    if (remove?.dataset.remove) {
      removeSchema(remove.dataset.remove)
      if (remove.dataset.name === this.name) this.name = null
      return this.render()
    }

    const example = target.closest<HTMLElement>('[data-example]')?.dataset.example
    if (example) {
      const found = EXAMPLES.find((e) => e.id === example)
      if (found) this.load(found.source, null)
      return
    }

    const schema = target.closest<HTMLElement>('[data-schema]')?.dataset.schema
    if (schema) {
      const found = listSchemas().find((s) => s.id === schema)
      if (found) this.load(found.source, found.name)
    }
  }

  private load(source: string, name: string | null): void {
    this.name = name
    this.deps.remember(name)
    this.deps.open(source, name)
    this.close()
  }

  private onSave(event: Event): void {
    event.preventDefault()
    const input = this.panel.querySelector<HTMLInputElement>('#schema-name')
    const name = input?.value.trim()
    if (!name) return

    const saved = saveSchema(name, this.deps.current().source)
    if (!saved) {
      // The only way this fails is a browser that will not keep anything for us.
      const note = this.panel.querySelector('#schema-note')
      if (note) note.textContent = 'this browser will not let the studio keep anything'
      return
    }

    this.name = saved.name
    this.deps.remember(saved.name)
    this.render()
  }

  private render(): void {
    const saved = listSchemas()
    const name = this.name ?? this.deps.current().name ?? ''

    this.panel.innerHTML = `
      <header class="drawer-head">
        <span class="drawer-title">fbl</span>
        <button type="button" class="drawer-x" data-drawer-close aria-label="close">×</button>
      </header>

      <section class="drawer-section">
        <h3>Tutorial</h3>
        <p class="drawer-empty">nothing here yet</p>
      </section>

      <section class="drawer-section">
        <h3>Examples</h3>
        <ul class="drawer-list">
          ${EXAMPLES.map(
            (example) =>
              `<li><button type="button" data-example="${escape(example.id)}">${escape(example.label)}</button></li>`,
          ).join('')}
        </ul>
      </section>

      <section class="drawer-section">
        <h3>My schemas</h3>
        <form class="drawer-save">
          <input id="schema-name" type="text" placeholder="name this schema" value="${escape(name)}"
                 autocomplete="off" spellcheck="false" />
          <button type="submit" class="primary">save</button>
        </form>
        <p class="drawer-empty" id="schema-note">${saved.length ? '' : 'nothing saved yet'}</p>
        <ul class="drawer-list">${saved.map((schema) => this.row(schema)).join('')}</ul>
      </section>`
  }

  private row(schema: Schema): string {
    const open = schema.name === this.name ? ' class="open"' : ''
    return `
      <li${open}>
        <button type="button" data-schema="${escape(schema.id)}">${escape(schema.name)}</button>
        <button type="button" class="drawer-x" data-remove="${escape(schema.id)}"
                data-name="${escape(schema.name)}" title="forget this one" aria-label="delete">×</button>
      </li>`
  }
}
