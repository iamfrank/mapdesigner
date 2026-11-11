import test from 'node:test'
import assert from 'node:assert/strict'
import state, { trackBusy } from '../src/utils/state.js'

test('trackBusy counts overlapping tasks and resets on failure', async () => {
  let release
  const slow = trackBusy(() => new Promise((r) => { release = r }))
  assert.equal(state.get('busy'), 1)
  await assert.rejects(trackBusy(async () => {
    assert.equal(state.get('busy'), 2)
    throw new Error('boom')
  }))
  assert.equal(state.get('busy'), 1)
  release('done')
  assert.equal(await slow, 'done')
  assert.equal(state.get('busy'), 0)
})
