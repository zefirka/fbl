import type { Arg, Expr } from './ast'
import type { Loc } from './errors'
import { findSlot, type SlotDef } from './slots'

/**
 * `repeat (4, x)` parses as both "the label `repeat` with a tuple" and "a call to repeat".
 * Which one it is depends on the callee: if it has a slot by that name, it is a label.
 * Both the checker and the interpreter go through here so they never disagree.
 */
export interface ArgForm {
  slotName?: string
  labelLoc?: Loc
  expr: Expr
  loc: Loc
}

export function argForm(arg: Arg, slots: SlotDef[]): ArgForm {
  if (arg.label === undefined) return { expr: arg.value, loc: arg.loc }

  if (findSlot(slots, arg.label)) {
    return { slotName: arg.label, labelLoc: arg.labelLoc, expr: arg.value, loc: arg.loc }
  }

  // Not a slot on this callee — read it back as the call it also looks like.
  if (arg.asCall) return { expr: arg.asCall, loc: arg.loc }

  return { slotName: arg.label, labelLoc: arg.labelLoc, expr: arg.value, loc: arg.loc }
}
