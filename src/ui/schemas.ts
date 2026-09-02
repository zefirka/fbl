/**
 * Schemas the reader has saved, kept in this browser and nowhere else.
 *
 * localStorage rather than IndexedDB: a schema is a few kilobytes of text, the whole library
 * is read at once every time the menu opens, and a synchronous read keeps the drawer honest —
 * there is no state where the list is on screen but not yet loaded. The studio already keeps
 * its working buffer and its settings there, so this is the same shelf.
 */

const KEY = 'fbl.schemas'

export interface Schema {
  id: string
  name: string
  source: string
  /** Epoch millis, so the list can lead with what was touched last. */
  saved: number
}

type Stored = Record<string, Omit<Schema, 'id'>>

function read(): Stored {
  try {
    const raw = window.localStorage.getItem(KEY)
    const value: unknown = raw ? JSON.parse(raw) : null
    return value && typeof value === 'object' ? (value as Stored) : {}
  } catch {
    // A browser with storage switched off, or something that is not ours in the slot.
    return {}
  }
}

function write(value: Stored): boolean {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

/** Newest first, which is the order someone looking for what they just saved expects. */
export function listSchemas(): Schema[] {
  return Object.entries(read())
    .map(([id, value]) => ({ id, ...value }))
    .sort((a, b) => b.saved - a.saved)
}

export function findSchema(id: string): Schema | undefined {
  const value = read()[id]
  return value ? { id, ...value } : undefined
}

/**
 * Saves under a name. The name is the identity, so saving again under the same one replaces
 * it rather than growing a second copy — which is what someone editing and re-saving means.
 */
export function saveSchema(name: string, source: string): Schema | undefined {
  const trimmed = name.trim()
  if (!trimmed) return undefined

  const all = read()
  const id = idFor(trimmed)
  all[id] = { name: trimmed, source, saved: Date.now() }
  return write(all) ? { id, ...all[id] } : undefined
}

export function removeSchema(id: string): void {
  const all = read()
  if (!(id in all)) return
  delete all[id]
  write(all)
}

/** A name folded to something stable, so re-saving finds the same slot. */
function idFor(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-')
}
