import { deflateRaw, inflateRaw } from 'pako'
import type { CalcConfig, NodeConfig, Target } from './solve'

/**
 * A plan, in a link.
 *
 * The calculator has no server, so a plan someone wants to show you has to travel in the URL
 * itself. It goes in the fragment rather than the query, which keeps it out of every access log
 * between here and there, and it is deflated first: a plan is mostly the same few recipe ids
 * written over and over, which is exactly what deflate is for. A full science plan with modules
 * on every node comes to a few hundred characters.
 *
 * Field names are shortened before packing. That is not premature — every byte here is a byte
 * of URL somebody has to paste into a chat window — and the mapping is one function wide, with
 * a round trip to hold it honest.
 */

export interface SharedPlan extends CalcConfig {
  /** Which dataset the ids belong to; a plan means nothing without it. */
  version: string
  /** The belt the widths and counts are reckoned in. */
  belt: string
  /** Which tab was open, so a link opens on what was being shown. */
  mode?: string
  /** The recycling tab's setup, when there is one worth carrying. */
  quality?: SharedQuality
}

export interface SharedQuality {
  item: string
  recipe?: string
  base: string
  target: string
  /** What stands on each rung, by quality, and only where somebody has said. */
  crafters: Record<string, SharedSide>
  recyclers: Record<string, SharedSide>
  by: string
  machines: number
  output: number
}

export interface SharedSide {
  machine?: string
  quality?: string
  modules?: Array<{ name: string; quality?: string }>
}

interface Packed {
  v: string
  b: string
  /** `[item, rate]`. */
  t: Array<[string, number]>
  c?: Record<string, string>
  e?: Record<string, string>
  f?: Record<string, string>
  /** `[recipe, machine, quality, pin, modules, beacon]`, each falsy when unset. */
  n?: Array<[string, string?, string?, number?, PackedModule[]?, PackedBeacon?]>
  /** `1` when the recycling tab was the one open. */
  m?: number
  /** `[item, recipe, base, target, by, machines, output, crafters, recyclers]`. */
  q?: [string, string | undefined, string, string, string, number, number, PackedRungs, PackedRungs]
}

/** `[tier, machine, quality, modules]` for each rung anybody has said anything about. */
type PackedRungs = Array<[string, string?, string?, PackedModule[]?]>

/** `[name, quality]`. */
type PackedModule = [string, string?]
/** `[name, count, quality, modules]`. */
type PackedBeacon = [string, number, string?, PackedModule[]?]

export function encodePlan(plan: SharedPlan): string {
  const packed: Packed = { v: plan.version, b: plan.belt, t: plan.targets.map((t) => [t.item, t.rate]) }

  if (Object.keys(plan.choice).length) packed.c = plan.choice
  if (Object.keys(plan.extra).length) packed.e = plan.extra
  if (Object.keys(plan.frontier).length) {
    packed.f = Object.fromEntries(Object.entries(plan.frontier).map(([item, how]) => [item, how[0]]))
  }

  const nodes = Object.entries(plan.nodes).filter(([, node]) => Object.keys(node).length > 0)
  if (nodes.length) {
    packed.n = nodes.map(([recipe, node]) => [
      recipe,
      node.machine,
      node.quality,
      node.pin,
      node.modules?.map((module): PackedModule => [module.name, module.quality]),
      node.beacon
        ? ([
            node.beacon.name,
            node.beacon.count,
            node.beacon.quality,
            node.beacon.modules.map((module): PackedModule => [module.name, module.quality]),
          ] as PackedBeacon)
        : undefined,
    ])
  }

  if (plan.mode === 'recycling') packed.m = 1
  if (plan.quality?.item) {
    const rungs = (held: Record<string, SharedSide>): PackedRungs =>
      Object.entries(held).map(([tier, side]) => [
        tier,
        side.machine,
        side.quality,
        side.modules?.map((module): PackedModule => [module.name, module.quality]),
      ])
    const q = plan.quality
    packed.q = [q.item, q.recipe, q.base, q.target, q.by, q.machines, q.output, rungs(q.crafters), rungs(q.recyclers)]
  }

  return toBase64Url(deflateRaw(JSON.stringify(packed), { level: 9 }))
}

export function decodePlan(text: string): SharedPlan | undefined {
  try {
    const packed = JSON.parse(inflateRaw(fromBase64Url(text), { to: 'string' })) as Packed
    if (typeof packed?.v !== 'string' || !Array.isArray(packed.t)) return undefined

    const targets: Target[] = packed.t
      .filter((entry) => Array.isArray(entry) && typeof entry[0] === 'string' && Number.isFinite(entry[1]))
      .map(([item, rate]) => ({ item, rate }))

    const nodes: Record<string, NodeConfig> = {}
    for (const [recipe, machine, quality, pin, modules, beacon] of packed.n ?? []) {
      if (typeof recipe !== 'string') continue
      const node: NodeConfig = {}
      if (machine) node.machine = machine
      if (quality) node.quality = quality
      if (pin !== undefined && pin !== null) node.pin = pin
      if (modules?.length) node.modules = modules.map(([name, held]) => (held ? { name, quality: held } : { name }))
      if (beacon) {
        node.beacon = {
          name: beacon[0],
          count: beacon[1],
          quality: beacon[2],
          modules: (beacon[3] ?? []).map(([name, held]) => (held ? { name, quality: held } : { name })),
        }
      }
      if (Object.keys(node).length) nodes[recipe] = node
    }

    const rungs = (from: PackedRungs | undefined): Record<string, SharedSide> => {
      const held: Record<string, SharedSide> = {}
      for (const [tier, machine, quality, modules] of from ?? []) {
        const side: SharedSide = {}
        if (machine) side.machine = machine
        if (quality) side.quality = quality
        if (modules?.length) side.modules = modules.map(([name, held]) => (held ? { name, quality: held } : { name }))
        held[tier] = side
      }
      return held
    }

    // What was not packed does not come back: a plan with no recycling in it decodes to
    // exactly the plan that went in, which is what makes the round trip worth testing.
    const extra: Partial<SharedPlan> = {}
    if (packed.m) extra.mode = 'recycling'
    if (packed.q) {
      extra.quality = {
        item: packed.q[0],
        recipe: packed.q[1] || undefined,
        base: packed.q[2],
        target: packed.q[3],
        by: packed.q[4],
        machines: packed.q[5],
        output: packed.q[6],
        crafters: rungs(packed.q[7]),
        recyclers: rungs(packed.q[8]),
      }
    }

    return {
      ...extra,
      version: packed.v,
      belt: typeof packed.b === 'string' ? packed.b : 'transport-belt',
      targets,
      choice: packed.c ?? {},
      extra: packed.e ?? {},
      frontier: Object.fromEntries(
        Object.entries(packed.f ?? {}).map(([item, how]) => [item, how === 'r' ? 'raw' : 'expand'] as const),
      ),
      nodes,
    }
  } catch {
    // Someone truncated the link, or it is from a version that packed things differently.
    return undefined
  }
}

/** Base64 without the three characters that have to be escaped in a URL, and without padding. */
function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): Uint8Array {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}
