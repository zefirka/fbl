/**
 * A small linear-programme solver: minimise cᵀx subject to Ax = b and x ≥ 0.
 *
 * This is here because a factory is not a tree. A refinery makes three things at once and
 * cracking turns two of them back into the third, so "how much refining" and "how much
 * cracking" are one question with one answer, and no amount of walking the recipes down
 * finds it. Written as a linear programme it is the textbook case, and the textbook has a
 * method.
 *
 * Two-phase simplex on a dense tableau. The problems here are tiny — tens of rows for a
 * chain someone would actually plan — so the dense form costs nothing and stays readable.
 * Entering and leaving columns are picked by Bland's rule, which is slower than steepest
 * descent and cannot cycle; on this size the trade is free.
 */

export type LPStatus = 'optimal' | 'infeasible' | 'unbounded'

export interface LPSolution {
  status: LPStatus
  /** The values of the original variables; zeroes when there is no solution. */
  x: number[]
}

const EPS = 1e-9

export function minimise(A: readonly number[][], b: readonly number[], c: readonly number[]): LPSolution {
  const m = A.length
  const n = c.length
  if (m === 0) return { status: 'optimal', x: new Array(n).fill(0) }

  // Every row starts with its artificial variable in the basis, which only works while the
  // right-hand side is non-negative; a row that is not gets negated on the way in.
  const width = n + m
  const tableau = A.map((row, i) => {
    const flip = b[i] < 0 ? -1 : 1
    const artificials = Array.from({ length: m }, (_, k) => (k === i ? 1 : 0))
    return [...row.map((v) => v * flip), ...artificials, b[i] * flip]
  })
  const basis = Array.from({ length: m }, (_, i) => n + i)

  const pivot = (row: number, col: number): void => {
    const scale = tableau[row][col]
    for (let j = 0; j <= width; j++) tableau[row][j] /= scale
    for (let i = 0; i < m; i++) {
      if (i === row) continue
      const factor = tableau[i][col]
      if (factor === 0) continue
      for (let j = 0; j <= width; j++) tableau[i][j] -= factor * tableau[row][j]
    }
    basis[row] = col
  }

  /** cost of a column once the basis has paid for it — negative means it is worth entering. */
  const reduced = (cost: readonly number[], j: number): number => {
    let value = cost[j]
    for (let i = 0; i < m; i++) value -= cost[basis[i]] * tableau[i][j]
    return value
  }

  const optimise = (cost: readonly number[], columns: number[]): LPStatus => {
    for (let guard = 0; guard < 20000; guard++) {
      // Bland's rule: the lowest-numbered column that improves anything, every time.
      const entering = columns.find((j) => reduced(cost, j) < -EPS)
      if (entering === undefined) return 'optimal'

      let leaving = -1
      let best = Infinity
      for (let i = 0; i < m; i++) {
        if (tableau[i][entering] <= EPS) continue
        const ratio = tableau[i][width] / tableau[i][entering]
        if (ratio < best - EPS || (ratio < best + EPS && leaving >= 0 && basis[i] < basis[leaving])) {
          best = ratio
          leaving = i
        }
      }
      if (leaving < 0) return 'unbounded'

      pivot(leaving, entering)
    }
    return 'optimal'
  }

  const real = Array.from({ length: n }, (_, j) => j)
  const artificial = Array.from({ length: m }, (_, i) => n + i)

  // Phase one: get rid of the artificial variables, or find out that the problem cannot be met.
  const phaseOne = new Array(width).fill(0)
  for (const j of artificial) phaseOne[j] = 1
  if (optimise(phaseOne, [...real, ...artificial]) !== 'optimal') return fail(n, 'infeasible')

  let residue = 0
  for (let i = 0; i < m; i++) if (basis[i] >= n) residue += tableau[i][width]
  if (residue > 1e-7) return fail(n, 'infeasible')

  // An artificial left in the basis at zero is a row that says nothing new. Pivot it out on
  // anything real; if the whole row is empty, it really was redundant and is dropped.
  for (let i = 0; i < m; i++) {
    if (basis[i] < n) continue
    const swap = real.find((j) => Math.abs(tableau[i][j]) > EPS)
    if (swap !== undefined) pivot(i, swap)
  }

  const phaseTwo = new Array(width).fill(0)
  for (let j = 0; j < n; j++) phaseTwo[j] = c[j]
  const status = optimise(phaseTwo, real)
  if (status !== 'optimal') return fail(n, status)

  const x = new Array(n).fill(0)
  for (let i = 0; i < m; i++) if (basis[i] < n) x[basis[i]] = Math.max(0, tableau[i][width])
  return { status: 'optimal', x }
}

const fail = (n: number, status: LPStatus): LPSolution => ({ status, x: new Array(n).fill(0) })
