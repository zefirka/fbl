import type { LabIcon } from '../data/dataset'

/** Where the item icons live and how big the sheet is, once it has loaded. */
export interface IconSheet {
  url: string
  width: number
  height: number
}

/** Item icons are 64px on a 66px grid; a chip shows one by shrinking the whole sheet to fit. */
const ICON_CELL = 64

export function iconStyle(icon: LabIcon | undefined, sheet: IconSheet | null, px = 18): string {
  if (!icon || !sheet) return ''
  const scale = px / ICON_CELL
  return [
    `background-image:url(${sheet.url})`,
    `background-size:${sheet.width * scale}px ${sheet.height * scale}px`,
    `background-position:${-icon.x * scale}px ${-icon.y * scale}px`,
  ].join(';')
}
