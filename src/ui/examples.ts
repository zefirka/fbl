import assemblerLine from '../../examples/assembler-line.fbl?raw'
import belts from '../../examples/belts.fbl?raw'
import blocks from '../../examples/blocks.fbl?raw'
import smeltersArray from '../../examples/smelters-array.fbl?raw'
import sorting from '../../examples/sorting.fbl?raw'

export interface Example {
  id: string
  label: string
  source: string
}

export const EXAMPLES: Example[] = [
  { id: 'assembler-line', label: 'assembler line', source: assemblerLine },
  { id: 'belts', label: 'belt routing', source: belts },
  { id: 'blocks', label: 'blocks & layout', source: blocks },
  { id: 'smelters-array', label: 'smelters array', source: smeltersArray },
  { id: 'sorting', label: 'sorting & contents', source: sorting },
]
