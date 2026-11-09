import test from 'node:test'
import assert from 'node:assert/strict'
import { createOsmCache } from '../src/utils/osm-cache.js'

const A = [0, 0, 10, 10]
const w = (k, c = [[0, 0], [1, 1]]) => [k, c]

test('cache reports only uncovered layers', () => {
  const c = createOsmCache()
  assert.deepEqual(c.missing(['water', 'streets'], A), ['water', 'streets'])
  c.add(['water'], A, { water: new Map([w('w1')]) })
  assert.deepEqual(c.missing(['water', 'streets'], A), ['streets'])
  assert.deepEqual(c.missing(['water'], [1, 1, 5, 5]), [])
  assert.deepEqual(c.missing(['water'], [1, 1, 11, 5]), ['water'])
})

test('merging dedupes by id and reports changed layers', () => {
  const c = createOsmCache()
  c.add(['water'], A, { water: new Map([w('w1'), w('w2')]) })
  const changed = c.add(['water', 'parks'], [5, 5, 15, 15], { water: new Map([w('w2'), w('w3')]), parks: new Map() })
  assert.deepEqual(changed, ['water'])
  assert.equal(c.waysOf('water').length, 3)
})
