import test from 'node:test'
import assert from 'node:assert/strict'
import { decodeTerrarium, terrainGrid, mosaicTerrain, generateContours, terrainPointToLonLat } from '../src/utils/contours.js'

const gridOf = (rows, interval = 10) => generateContours(Float32Array.from(rows.flat()), rows[0].length, rows.length, interval)
const atLevel = (result, elevation) => result.lines.filter((line) => line.elevation === elevation)

test('Terrarium decoding preserves fractional and negative elevations and NoData', () => {
  const result = decodeTerrarium(Uint8ClampedArray.from([
    128, 0, 0, 255, 128, 123, 128, 255, 127, 255, 192, 255, 0, 0, 0, 0,
  ]))
  assert.deepEqual([...result.slice(0, 3)], [0, 123.5, -0.25])
  assert.ok(Number.isNaN(result[3]))
})

test('tile selection bounds requests and memory even for world-sized areas', () => {
  for (const bbox of [[55.4192, 11.899, 55.5808, 12.101], [-85, -180, 85, 180], [0, -180, 0.001, 180]]) {
    const grid = terrainGrid(bbox)
    assert.ok(grid.tiles.length <= 16)
    assert.ok(grid.width * grid.height <= 16 * 256 ** 2)
    assert.ok(grid.zoom >= 0 && grid.zoom <= 14)
    assert.ok(grid.tiles.every(({ y }) => y >= 0 && y < 2 ** grid.zoom))
  }
  assert.equal(terrainGrid([55, 12, 55.0001, 12.0001]).zoom, 14)
})

test('dateline grid is continuous, polar coverage is clamped, invalid bboxes fail', () => {
  const grid = terrainGrid([-1, 179, 1, -179])
  assert.ok(grid.width < grid.worldSize / 10)
  assert.ok(grid.tiles.some(({ x }) => x >= 2 ** grid.zoom))
  assert.ok(terrainGrid([-90, -10, 90, 10]).tiles.every(({ y }) => y >= 0))
  for (const bbox of [null, [0, 0, 0, 1], [1, 0, 0, 1], [86, 0, 89, 1], [0, 0, NaN, 1]]) {
    assert.throws(() => terrainGrid(bbox))
  }
})

test('adjacent tiles form a single stitched contour without a tile boundary', () => {
  const tile = Float32Array.from({ length: 256 ** 2 }, (_, p) => Math.floor(p / 256))
  const grid = { width: 512, height: 3, x0: 0, y0: 100 }
  const heights = mosaicTerrain(grid, [{ x: 0, y: 0, heights: tile }, { x: 1, y: 0, heights: tile }])
  const result = generateContours(heights, grid.width, grid.height, 101)
  assert.equal(result.lines.length, 1)
  const points = result.lines[0].coordinates
  assert.equal(points.length, 512)
  assert.equal(Math.min(...points.map(([x]) => x)), 0)
  assert.equal(Math.max(...points.map(([x]) => x)), 511)
  assert.ok(points.every(([, y]) => y === 1))
})

test('missing mosaic tiles remain NoData rather than false zero terrain', () => {
  const grid = { width: 512, height: 2, x0: 0, y0: 0 }
  const heights = mosaicTerrain(grid, [{ x: 0, y: 0, heights: new Float32Array(256 ** 2).fill(20) }])
  assert.equal(heights[0], 20)
  assert.ok(Number.isNaN(heights[256]))
  assert.deepEqual(generateContours(heights, 512, 2, 10).lines, [])
})

test('linear gradients interpolate exactly without closing against the bbox', () => {
  const result = gridOf([[0, 20, 40], [0, 20, 40], [0, 20, 40]])
  assert.equal(atLevel(result, 10).length, 1)
  assert.deepEqual(atLevel(result, 10)[0].coordinates, [[0.5, 0], [0.5, 1], [0.5, 2]])
  assert.equal(atLevel(result, 0).length, 0)
})

test('hill contours close into rings', () => {
  const result = gridOf([[0, 0, 0], [0, 20, 0], [0, 0, 0]])
  const lines = atLevel(result, 10)
  assert.equal(lines.length, 1)
  assert.equal(lines[0].coordinates.length, 5)
  assert.deepEqual(lines[0].coordinates[0], lines[0].coordinates.at(-1))
  // The maximum itself is a point, not a drawable contour ring.
  assert.equal(atLevel(result, 20).length, 0)
})

test('saddles produce separate segments with the correct bilinear topology', () => {
  // At level 0, top-left and bottom-right positive corners are connected.
  const positive = atLevel(gridOf([[20, -10], [-10, 20]]), 0)
  assert.equal(positive.length, 2)
  assert.ok(positive.some(({ coordinates: [a, b] }) => a[1] === 0 && b[0] === 1))
  // Reverse the determinant: the top and left edges are now paired.
  const negative = atLevel(gridOf([[10, -20], [-20, 10]]), 0)
  assert.equal(negative.length, 2)
  assert.ok(negative.some(({ coordinates: [a, b] }) => a[1] === 0 && b[0] === 0))
})

test('NoData cells and flat terrain never create artificial outlines', () => {
  assert.deepEqual(gridOf([[0, NaN], [20, 20]]).lines, [])
  assert.deepEqual(gridOf([[10, 10], [10, 10]]).lines, [])
  const empty = gridOf([[NaN, NaN], [NaN, NaN]], 0)
  assert.deepEqual(empty.lines, [])
  assert.ok(Number.isFinite(empty.interval))
})

test('auto intervals, safety caps, and negative contour elevations', () => {
  assert.equal(gridOf([[0, 50], [0, 50]], 0).interval, 10)
  assert.ok(gridOf([[-10000, 10000], [-10000, 10000]], 10).interval >= 100)
  assert.ok(atLevel(gridOf([[-20, 0], [-20, 0]], 10), -10).length > 0)
  assert.throws(() => gridOf([[0, 10], [0, 10]], -1))
})

test('pathological detail hits the geometry budget rather than growing without bound', () => {
  const size = 320
  const heights = Float32Array.from({ length: size * size }, (_, p) => (Math.floor(p / size) + p % size) % 2 * 20)
  assert.throws(() => generateContours(heights, size, size, 10), /Too many contours/)
})

test('world pixels map to geographic coordinates at pixel centres', () => {
  const grid = { x0: 0, y0: 0, worldSize: 256 }
  const [lon, lat] = terrainPointToLonLat([127.5, 127.5], grid)
  assert.equal(lon, 0)
  assert.equal(lat, 0)
  assert.equal(terrainPointToLonLat([0, 0], grid)[0], -179.296875)
})
