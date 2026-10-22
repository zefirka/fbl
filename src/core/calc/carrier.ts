/**
 * What a belt or a pipe actually carries, which is not only a matter of which tier it is.
 *
 * Space Age put stacks on belts. A stack inserter piles two items on a tile, and the two
 * transport-belt capacity researches take that to three and four, so the same express belt
 * moves 45 or 180 items a second depending on what has been researched — a plan that ignores
 * it asks for four times the belts it needs.
 *
 * The cap is the item's own stack size, because an item that does not stack in an inventory
 * does not stack on a belt either: a stack inserter picks up one asteroid chunk and puts down
 * one. That is the whole of the rule, and it is the reason this is arithmetic in the core
 * rather than a number in a panel.
 */

/** A pipe carries about this much a second over the short runs a factory is made of. */
export const PIPE_THROUGHPUT = 1000

export interface Carrier {
  /** Items a second one belt of the chosen tier holds, one item to a tile. */
  belt: number
  /** How high items are piled on it: 1 with no stack inserter, up to 4 fully researched. */
  stack: number
  isFluid: (item: string) => boolean
  /** What one of these stacks to in an inventory, which is the ceiling on the pile. */
  stackOf: (item: string) => number
}

/** What one belt of the chosen kind carries of this item, a second. */
export function capacityFor(carrier: Carrier, item: string): number {
  if (carrier.isFluid(item)) return PIPE_THROUGHPUT
  return carrier.belt * Math.max(1, Math.min(carrier.stack, carrier.stackOf(item)))
}
