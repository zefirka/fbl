export { decodeBlueprint, encodeBlueprint, exportBlueprint, toBlueprintJSON } from './blueprint'
export {
  BALANCER_LIMIT,
  balancerLayout,
  balancerSizes,
  hasBalancer,
  type BalancerLayout,
} from './balancer'
export { check, Checker, type BlockSignature } from './check'
export { computeCost, type Cost, type CostEntry } from './cost'
export { LangError, type Diagnostic, type Loc } from './errors'
export { Direction, directionName, type Rect, type Vec } from './geometry'
export { parse } from './parser'
export { powerCoverage, type PowerReport } from './power'
export { ProtoRegistry, type Prototype } from './proto'
export { Runtime, type RunResult } from './run'
export { Scene, type PlacedEntity } from './scene'
export {
  beltOrientation,
  isBeltish,
  isPipeish,
  pipeShape,
  spriteVariants,
  tileIndex,
  type TileIndex,
} from './topology'
export { entitySlots, findSlot, FUNCTIONS, HELPER_SLOTS, LAYOUT_SLOTS, type SlotDef } from './slots'
export { showType, typeNames, Universe, type Type } from './types'
export { EnumValue, show, type Value } from './values'

import { Checker, type BlockSignature } from './check'
import { LangError, type Diagnostic } from './errors'
import { parse } from './parser'
import type { ProtoRegistry } from './proto'
import { Runtime } from './run'
import { Scene } from './scene'

export interface CompileResult {
  scene: Scene
  output: string[]
  diagnostics: Diagnostic[]
  /** True when the checker found nothing fatal and the program actually ran. */
  ran: boolean
  /** Signatures of the blocks this source defines, for editor completion. */
  blocks: BlockSignature[]
}

/**
 * Parse → check → run. The checker is a gate: if it reports an error nothing is placed,
 * so a program never half-builds a blueprint on the way to failing.
 */
export function compile(source: string, registry: ProtoRegistry): CompileResult {
  const diagnostics: Diagnostic[] = []
  const empty = new Scene()

  let module
  try {
    module = parse(source)
  } catch (error) {
    if (error instanceof LangError) {
      return {
        scene: empty,
        output: [],
        diagnostics: [{ severity: 'error', message: error.message, loc: error.loc, hint: error.hint }],
        ran: false,
        blocks: [],
      }
    }
    throw error
  }

  const checker = new Checker(registry)
  diagnostics.push(...checker.check(module))
  const blocks = [...checker.blocks.values()]

  if (diagnostics.some((d) => d.severity === 'error')) {
    return { scene: empty, output: [], diagnostics, ran: false, blocks }
  }

  try {
    const { scene, output } = new Runtime(registry).run(module)
    diagnostics.push(...scene.diagnostics)
    return { scene, output, diagnostics, ran: true, blocks }
  } catch (error) {
    if (error instanceof LangError) {
      diagnostics.push({ severity: 'error', message: error.message, loc: error.loc, hint: error.hint })
      return { scene: empty, output: [], diagnostics, ran: false, blocks }
    }
    throw error
  }
}
