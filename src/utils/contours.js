const TILE_SIZE = 256
const MAX_LAT = 85.0511287798066
const MAX_TILES = 16
const MAX_LEVELS = 256
const MAX_SEGMENTS = 200_000

/** Decode Mapzen's Terrarium RGB encoding, retaining transparent pixels as NoData. */
export function decodeTerrarium(rgba) {
  const heights = new Float32Array(rgba.length / 4)
  for (let i = 0; i < heights.length; i++) {
    const p = i * 4
    heights[i] = rgba[p + 3] === 0 ? NaN : rgba[p] * 256 + rgba[p + 1] + rgba[p + 2] / 256 - 32768
  }
  return heights
}

/**
 * A cropped, one-pixel-buffered grid in XYZ world-pixel coordinates. Lower
 * the DEM zoom until both network traffic and the assembled grid are bounded.
 * X is unwrapped here (so dateline views remain continuous); wrap only URLs.
 */
export function terrainGrid(bbox) {
  if (!Array.isArray(bbox) || bbox.length !== 4 || !bbox.every(Number.isFinite)) {
    throw new Error('Invalid terrain bounding box.')
  }
  const [south, west, north, rawEast] = bbox
  const east = rawEast < west ? rawEast + 360 : rawEast
  if (south >= north || east <= west || east - west > 360 || south >= MAX_LAT || north <= -MAX_LAT) {
    throw new Error('Terrain requires a valid area within Web Mercator coverage.')
  }
  const pixelY = (lat, worldSize) => {
    const sin = Math.sin(Math.max(-MAX_LAT, Math.min(MAX_LAT, lat)) * Math.PI / 180)
    return (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * worldSize
  }
  for (let zoom = 14; zoom >= 0; zoom--) {
    const worldSize = TILE_SIZE * 2 ** zoom
    const x0 = Math.floor((west + 180) / 360 * worldSize - 0.5) - 1
    const x1 = Math.ceil((east + 180) / 360 * worldSize - 0.5) + 1
    const y0 = Math.max(0, Math.floor(pixelY(north, worldSize) - 0.5) - 1)
    const y1 = Math.min(worldSize - 1, Math.ceil(pixelY(south, worldSize) - 0.5) + 1)
    const minX = Math.floor(x0 / TILE_SIZE), maxX = Math.floor(x1 / TILE_SIZE)
    const minY = Math.floor(y0 / TILE_SIZE), maxY = Math.floor(y1 / TILE_SIZE)
    if ((maxX - minX + 1) * (maxY - minY + 1) > MAX_TILES) continue
    const tiles = []
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) tiles.push({ x, y })
    }
    return { zoom, worldSize, x0, y0, width: x1 - x0 + 1, height: y1 - y0 + 1, tiles }
  }
  throw new Error('Terrain area is too large.')
}

/** Copy decoded tiles into one continuous grid before contouring (no tile seams). */
export function mosaicTerrain(grid, tiles) {
  const heights = new Float32Array(grid.width * grid.height).fill(NaN)
  for (const { x, y, heights: tile } of tiles) {
    const dx = x * TILE_SIZE - grid.x0
    const dy = y * TILE_SIZE - grid.y0
    const startX = Math.max(0, dx)
    const endX = Math.min(grid.width, dx + TILE_SIZE)
    for (let row = Math.max(0, dy); row < Math.min(grid.height, dy + TILE_SIZE); row++) {
      const src = (row - dy) * TILE_SIZE + startX - dx
      heights.set(tile.subarray(src, src + endX - startX), row * grid.width + startX)
    }
  }
  return heights
}

function niceStep(value) {
  const magnitude = 10 ** Math.floor(Math.log10(value))
  return [1, 2, 5, 10].find((n) => n * magnitude >= value) * magnitude
}

/** Marching squares with shared edge IDs, saddle resolution, and line stitching.
 * Coordinates are grid sample indices; no artificial outlines at the grid edge
 * or around NoData. A level cap and segment budget bound pathological workloads.
 */
export function generateContours(heights, width, height, requestedInterval = 0) {
  if (width < 2 || height < 2 || heights.length !== width * height ||
    !Number.isFinite(requestedInterval) || requestedInterval < 0) {
    throw new Error('Invalid contour grid or interval.')
  }
  let min = Infinity, max = -Infinity
  for (const value of heights) {
    if (Number.isFinite(value)) { min = Math.min(min, value); max = Math.max(max, value) }
  }
  const interval = Math.max(requestedInterval || niceStep(Math.max(10, (max - min) / 60)),
    Number.isFinite(max - min) ? niceStep(Math.max(1, (max - min) / MAX_LEVELS)) : 1)
  if (!Number.isFinite(min) || min === max) return { interval, lines: [] }

  const levels = new Map()
  let segments = 0
  for (let y = 0; y < height - 1; y++) {
    for (let x = 0; x < width - 1; x++) {
      const p = y * width + x
      const values = [heights[p], heights[p + 1], heights[p + width + 1], heights[p + width]]
      if (!values.every(Number.isFinite)) continue
      const low = Math.ceil(Math.min(...values) / interval)
      const high = Math.floor(Math.max(...values) / interval)
      for (let level = low; level <= high; level++) {
        const elevation = level * interval
        const edges = []
        for (let edge = 0; edge < 4; edge++) {
          const next = (edge + 1) % 4
          if ((values[edge] >= elevation) !== (values[next] >= elevation)) edges.push(edge)
        }
        if (!edges.length) continue
        let graph = levels.get(level)
        if (!graph) levels.set(level, graph = new Map())
        const node = (edge) => {
          const ids = [p * 2, (p + 1) * 2 + 1, (p + width) * 2, p * 2 + 1]
          const id = ids[edge]
          if (!graph.has(id)) {
            // Always interpolate shared edges in the same direction.
            const endpoints = [[0, 1], [1, 2], [3, 2], [0, 3]][edge]
            const corners = [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]]
            const [a, b] = endpoints
            const t = (elevation - values[a]) / (values[b] - values[a])
            graph.set(id, { point: [corners[a][0] + t * (corners[b][0] - corners[a][0]),
              corners[a][1] + t * (corners[b][1] - corners[a][1])], adjacent: [] })
          }
          return id
        }
        const connect = (a, b) => {
          if (++segments > MAX_SEGMENTS) throw new Error('Too many contours. Choose a wider interval or smaller area.')
          const u = node(a), v = node(b)
          graph.get(u).adjacent.push(v)
          graph.get(v).adjacent.push(u)
        }
        if (edges.length === 2) connect(edges[0], edges[1])
        else {
          // Asymptotic decider: preserve the bilinear surface's saddle topology.
          const determinant = (values[0] - elevation) * (values[2] - elevation) -
            (values[1] - elevation) * (values[3] - elevation)
          if (determinant >= 0) { connect(0, 1); connect(2, 3) }
          else { connect(0, 3); connect(1, 2) }
        }
      }
    }
  }

  const lines = []
  for (const [level, graph] of levels) {
    const visited = new Set()
    const trace = (start) => {
      const coordinates = []
      const append = (point) => {
        const last = coordinates.at(-1)
        if (!last || last[0] !== point[0] || last[1] !== point[1]) coordinates.push(point)
      }
      let current = start
      while (!visited.has(current)) {
        visited.add(current)
        const vertex = graph.get(current)
        append(vertex.point)
        const next = vertex.adjacent.find((id) => !visited.has(id))
        if (next === undefined) {
          if (vertex.adjacent.includes(start) && coordinates.length > 2) append(graph.get(start).point)
          break
        }
        current = next
      }
      if (coordinates.length > 1) lines.push({ elevation: level * interval, coordinates })
    }
    // Open ends first, then closed rings; never split a line at an arbitrary cell.
    for (const [id, vertex] of graph) if (vertex.adjacent.length === 1 && !visited.has(id)) trace(id)
    for (const id of graph.keys()) if (!visited.has(id)) trace(id)
  }
  return { interval, lines }
}

/** Grid samples are at pixel centres, not the north-west pixel corners. */
export function terrainPointToLonLat([x, y], grid) {
  const worldX = (grid.x0 + x + 0.5) / grid.worldSize
  const worldY = (grid.y0 + y + 0.5) / grid.worldSize
  return [worldX * 360 - 180, Math.atan(Math.sinh(Math.PI * (1 - 2 * worldY))) * 180 / Math.PI]
}
