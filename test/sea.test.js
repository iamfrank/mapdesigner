import test from 'node:test'
import assert from 'node:assert/strict'
import { computeTransform } from '../src/utils/projection.js'
import { computeSeaPolygons } from '../src/utils/render.js'

const T = computeTransform([0, 0, 1, 1], 100, 100)
const area = (p) => Math.abs(p.reduce((a, [x, y], i) => { const [x1, y1] = p[(i + 1) % p.length]; return a + x * y1 - x1 * y }, 0) / 2)
const seaArea = (r) => r.sea.reduce((a, p) => a + area(p), 0)

test('coastline entering and leaving twice gives one sea polygon on the right', () => {
  // Heads north at lon .2, east along lat .5 ... wiggles out of the box and back in.
  const way = [[0.5, -0.5], [0.5, 0.3], [1.5, 0.3], [1.5, 0.6], [0.5, 0.6], [0.5, 1.5]]
  const r = computeSeaPolygons([way], T, 100, 100)
  assert.ok(r.sea.length >= 1)
  assert.ok(Math.abs(seaArea(r) - 3500) < 1) // east half minus the 50x30 land tongue
})

test('ways split across several pieces are chained', () => {
  const r = computeSeaPolygons([[[0.5, 0], [0.5, 0.5]], [[0.5, 0.5], [0.5, 1]]], T, 100, 100)
  assert.equal(r.sea.length, 1)
  assert.ok(Math.abs(seaArea(r) - 5000) < 1)
})

test('island in open sea (no coastline crossing the canvas) fills the sea', () => {
  const r = computeSeaPolygons([[[0.4, 0.4], [0.6, 0.4], [0.6, 0.6], [0.4, 0.4]]], T, 100, 100)
  assert.equal(r.islands.length, 1)
  assert.equal(r.sea.length, 1)
  assert.equal(seaArea(r), 10000)
})

test('canvas inside a landmass ring stays unfilled', () => {
  const r = computeSeaPolygons([[[-1, -1], [2, -1], [2, 2], [-1, 2], [-1, -1]]], T, 100, 100)
  assert.equal(r.sea.length, 0)
})
