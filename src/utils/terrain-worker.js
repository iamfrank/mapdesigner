import { decodeTerrarium, terrainGrid, mosaicTerrain, generateContours, terrainPointToLonLat } from './contours.js'

const TILE_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium'
const CACHE_SIZE = 64 // Decoded float tiles: at most 16 MiB.
const cache = new Map()
let active = null

async function loadTile(zoom, x, y, signal) {
  const count = 2 ** zoom
  const key = `${zoom}/${((x % count) + count) % count}/${y}`
  if (cache.has(key)) {
    const tile = cache.get(key)
    cache.delete(key)
    cache.set(key, tile)
    return tile
  }
  const response = await fetch(`${TILE_URL}/${key}.png`, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
  })
  if (!response.ok) throw new Error(`Terrain tile request failed (${response.status}).`)
  const bitmap = await createImageBitmap(await response.blob(), {
    colorSpaceConversion: 'none', premultiplyAlpha: 'none',
  })
  let heights
  try {
    if (bitmap.width !== 256 || bitmap.height !== 256) throw new Error('Invalid terrain tile size.')
    const canvas = new OffscreenCanvas(256, 256)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(bitmap, 0, 0)
    heights = decodeTerrarium(ctx.getImageData(0, 0, 256, 256).data)
  } finally {
    bitmap.close()
  }
  signal.throwIfAborted()
  cache.set(key, heights)
  if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value)
  return heights
}

self.onmessage = async ({ data: { id, bbox, interval, cancel } }) => {
  active?.abort()
  const controller = new AbortController()
  active = controller
  const { signal } = controller
  if (cancel) return
  try {
    if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') {
      throw new Error('This browser does not support terrain image decoding in a worker.')
    }
    const grid = terrainGrid(bbox)
    const tiles = []
    let next = 0
    // Four parallel downloads, regardless of the size of the selected area.
    await Promise.all(Array.from({ length: Math.min(4, grid.tiles.length) }, async () => {
      while (next < grid.tiles.length) {
        signal.throwIfAborted()
        const { x, y } = grid.tiles[next++]
        tiles.push({ x, y, heights: await loadTile(grid.zoom, x, y, signal) })
      }
    }))
    signal.throwIfAborted()
    const result = generateContours(mosaicTerrain(grid, tiles), grid.width, grid.height, interval)
    const minor = [], major = []
    for (const line of result.lines) {
      const target = Math.round(line.elevation / result.interval) % 5 === 0 ? major : minor
      target.push(line.coordinates.map((point) => terrainPointToLonLat(point, grid)))
    }
    if (!signal.aborted) self.postMessage({ id, minor, major, interval: result.interval })
  } catch (error) {
    if (!signal.aborted) {
      controller.abort()
      self.postMessage({ id, error: error.message || 'Could not load terrain.' })
    }
  }
}
