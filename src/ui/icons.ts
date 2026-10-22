import type { LabIcon } from '../data/dataset'

/** Where the item icons live and how big the sheet is, once it has loaded. */
export interface IconSheet {
  url: string
  width: number
  height: number
}

/** Item icons are 64px on a 66px grid; a chip shows one by shrinking the whole sheet to fit. */
const ICON_CELL = 64

/**
 * One icon out of the sheet, as inline style — **including the box it is cropped to**.
 *
 * The size has to be written here rather than left to a class. The whole sheet is scaled so
 * that one cell lands exactly on the element, so a box of a different size than `px` is a
 * window onto the sheet in the wrong place, and what shows through is the icons next door. It
 * happened: a quality mark sized 11px by CSS and cropped for 10px by its call sprouted the
 * pips of three neighbouring tiers.
 *
 * Classes still size the chips that have no icon to show — an empty slot is a dashed box of
 * the right size — which is why those rules stay.
 */
export function iconStyle(icon: LabIcon | undefined, sheet: IconSheet | null, px = 18): string {
  if (!icon || !sheet) return ''
  const scale = px / ICON_CELL
  return [
    `width:${px}px`,
    `height:${px}px`,
    `background-image:url(${sheet.url})`,
    `background-size:${sheet.width * scale}px ${sheet.height * scale}px`,
    `background-position:${-icon.x * scale}px ${-icon.y * scale}px`,
  ].join(';')
}
