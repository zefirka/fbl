/**
 * Fetching that reports how far along it is.
 *
 * `content-length` is the number of bytes on the wire, so for anything the server compresses
 * it is smaller than what the reader yields. The atlas is a PNG and is served as-is, which is
 * the case that matters; everything else falls back to counting bytes without a total.
 */

export interface Progress {
  loaded: number
  /** 0 when the server did not say, or said something the stream then exceeded. */
  total: number
}

export type OnProgress = (progress: Progress) => void

export async function fetchBytes(url: string, onProgress?: OnProgress): Promise<Blob | null> {
  let response: Response
  try {
    response = await fetch(url)
  } catch {
    return null
  }
  if (!response.ok) return null

  const declared = Number(response.headers.get('content-length') ?? 0)
  if (!response.body || !onProgress) {
    onProgress?.({ loaded: declared, total: declared })
    return response.blob()
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let loaded = 0

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    loaded += value.length
    onProgress({ loaded, total: loaded > declared ? 0 : declared })
  }

  onProgress({ loaded, total: loaded })
  return new Blob(chunks as BlobPart[], { type: response.headers.get('content-type') ?? '' })
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
