/**
 * Optimal string alignment distance: Levenshtein plus adjacent transpositions, so
 * `widht` is one edit from `width` rather than two. Bails out once every cell exceeds
 * `limit`, which keeps a scan over ~900 entity names cheap.
 */
function editDistance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) > limit) return limit + 1

  let twoBack = new Array<number>(b.length + 1).fill(0)
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i)
  let current = new Array<number>(b.length + 1)

  for (let i = 1; i <= a.length; i++) {
    current[0] = i
    let best = current[0]

    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let value = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, twoBack[j - 2] + 1)
      }
      current[j] = value
      best = Math.min(best, value)
    }

    if (best > limit) return limit + 1
    const spare = twoBack
    twoBack = previous
    previous = current
    current = spare
  }

  return previous[b.length]
}

/**
 * Names worth suggesting for a typo, nearest first.
 * The tolerance grows with length, so `assembling-machine-4` still finds `…-3`.
 */
export function closestNames(target: string, candidates: Iterable<string>, limit = 3): string[] {
  const tolerance = Math.max(1, Math.floor(target.length / 4))
  const scored: Array<{ name: string; distance: number }> = []

  for (const candidate of candidates) {
    if (candidate === target) continue
    const distance = editDistance(target, candidate, tolerance)
    if (distance <= tolerance) scored.push({ name: candidate, distance })
  }

  return scored
    .sort((a, b) => a.distance - b.distance || a.name.length - b.name.length || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map((s) => s.name)
}
