import pako from 'pako'

import { packGameVersion } from '../data/versions'
import type { VersionProfile } from '../data/versions'
import type { ProtoRegistry } from './proto'
import type { PlacedEntity, Scene } from './scene'

export interface BlueprintOptions {
  label?: string
  description?: string
}

interface BlueprintEntity {
  entity_number: number
  name: string
  position: { x: number; y: number }
  direction?: number
  recipe?: string
  quality?: string
  type?: string
  items?: unknown
}

/**
 * Module requests changed shape in 2.0: a map of counts became a list of insert plans that
 * name the target inventory and slot. `defines.inventory` indices come from the prototype
 * (crafting machines 4, mining drills 2, beacons 1, labs 3).
 */
function encodeModules(entity: PlacedEntity, profile: VersionProfile): unknown | undefined {
  const modules = entity.modules
  if (!modules?.length) return undefined

  if (profile.moduleFormat === 'items-map') {
    const counts: Record<string, number> = {}
    for (const module of modules) counts[module.name] = (counts[module.name] ?? 0) + 1
    return counts
  }

  const inventory = entity.proto.moduleInventory
  const plans = new Map<string, { name: string; quality?: string; slots: number[] }>()

  modules.forEach((module, slot) => {
    const quality = profile.supportsQuality && module.quality && module.quality !== 'normal' ? module.quality : undefined
    const key = `${module.name}|${quality ?? ''}`
    const plan = plans.get(key) ?? { name: module.name, quality, slots: [] }
    plan.slots.push(slot)
    plans.set(key, plan)
  })

  return [...plans.values()].map((plan) => ({
    id: plan.quality ? { name: plan.name, quality: plan.quality } : { name: plan.name },
    items: {
      in_inventory: plan.slots.map((stack) => ({ inventory, stack, count: 1 })),
    },
  }))
}

/** Up to four icons for the blueprint thumbnail, taken from the recipes it builds. */
function buildIcons(scene: Scene): unknown[] {
  const recipes = new Set<string>()
  for (const entity of scene.entities) if (entity.recipe) recipes.add(entity.recipe)
  const source = recipes.size > 0 ? [...recipes] : [...new Set(scene.entities.map((e) => e.proto.name))]
  return source.slice(0, 4).map((name, index) => ({ signal: { type: 'item', name }, index: index + 1 }))
}

export function toBlueprintJSON(scene: Scene, registry: ProtoRegistry, options: BlueprintOptions = {}): unknown {
  const profile = registry.profile

  const entities: BlueprintEntity[] = scene.entities.map((entity, index) => {
    const direction = entity.dir / (profile.directionScale === 2 ? 1 : 2)

    const out: BlueprintEntity = {
      entity_number: index + 1,
      name: entity.proto.name,
      // Blueprints store the centre of the footprint, so odd sizes land on .5 coordinates.
      position: { x: entity.x + entity.w / 2, y: entity.y + entity.h / 2 },
    }

    if (entity.dir !== 0) out.direction = direction
    if (entity.recipe) out.recipe = entity.recipe
    if (entity.undergroundType) out.type = entity.undergroundType
    if (entity.quality && entity.quality !== 'normal' && profile.supportsQuality) out.quality = entity.quality

    const items = encodeModules(entity, profile)
    if (items) out.items = items

    return out
  })

  return {
    blueprint: {
      item: 'blueprint',
      label: options.label ?? 'Untitled',
      ...(options.description ? { description: options.description } : {}),
      icons: buildIcons(scene),
      entities,
      version: packGameVersion(registry.dataset),
    },
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

function fromBase64(text: string): Uint8Array {
  const binary = atob(text)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** Version byte '0', then base64 of the zlib-deflated JSON. */
export function encodeBlueprint(json: unknown): string {
  return '0' + toBase64(pako.deflate(JSON.stringify(json), { level: 9 }))
}

export function decodeBlueprint(text: string): unknown {
  const trimmed = text.trim()
  if (!trimmed.startsWith('0')) throw new Error(`unsupported blueprint version byte '${trimmed[0] ?? ''}'`)
  return JSON.parse(pako.inflate(fromBase64(trimmed.slice(1)), { to: 'string' }))
}

export function exportBlueprint(
  scene: Scene,
  registry: ProtoRegistry,
  options: BlueprintOptions = {},
): { json: unknown; text: string } {
  const json = toBlueprintJSON(scene, registry, options)
  return { json, text: encodeBlueprint(json) }
}
