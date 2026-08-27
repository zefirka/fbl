import type { Arg, Expr } from './ast'
import type { Loc } from './errors'
import { findSlot, type SlotDef } from './slots'

/**
 * `repeat (4, x)` reads as both "the label `repeat` with a tuple" and "a call to repeat".
 * Which one it is depends on the callee: a slot by that name wins, and otherwise it is a call
 * only if something by that name can actually be called. Anything else stays a label, so an
 * unknown slot is reported as an unknown slot rather than as an unknown function.
 *
 * Both the checker and the interpreter go through here so they never disagree.
 */
export interface ArgForm {
  slotName?: string
  labelLoc?: Loc
  expr: Expr
  loc: Loc
}

export function argForm(arg: Arg, slots: SlotDef[], isCallable: (name: string) => boolean = () => false): ArgForm {
  if (arg.label === undefined) return { expr: arg.value, loc: arg.loc }

  if (findSlot(slots, arg.label)) {
    return { slotName: arg.label, labelLoc: arg.labelLoc, expr: arg.value, loc: arg.loc }
  }

  if (arg.asCall && isCallable(arg.label)) return { expr: arg.asCall, loc: arg.loc }

  return { slotName: arg.label, labelLoc: arg.labelLoc, expr: arg.value, loc: arg.loc }
}
