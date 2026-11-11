import test from 'node:test'
import assert from 'node:assert/strict'
import state from '../src/utils/state.js'

// Light-DOM hosts and worker responses without browser/network dependencies.
globalThis.HTMLElement = class extends EventTarget {}
const { TerrainControls } = await import('../src/components/terrain-controls.js')
const { ArtworkMap } = await import('../src/components/map-artwork.js')

function mountControls(t) {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const previous = { bbox: state.get('bbox'), contours: state.get('contours') }
  const workers = []
  globalThis.Worker = class {
    messages = []
    terminated = false
    constructor() { workers.push(this) }
    postMessage(data) { this.messages.push(data) }
    terminate() { this.terminated = true }
    reply(data) { this.onmessage({ data }) }
  }
  const toggle = Object.assign(new EventTarget(), { checked: true })
  const interval = Object.assign(new EventTarget(), { value: '0' })
  const status = { textContent: '' }
  const retry = Object.assign(new EventTarget(), { hidden: true })
  const nodes = {
    '[name="contours"]': toggle,
    '[aria-label="Contour interval"]': interval,
    '.terrain-status': status,
    '[data-act="retry-terrain"]': retry,
  }
  const controls = new TerrainControls()
  controls.querySelector = (selector) => nodes[selector]
  controls.connectedCallback()
  t.after(() => {
    controls.disconnectedCallback()
    state.update(previous)
  })
  return { controls, toggle, interval, status, retry, workers }
}

// trackBusy() settles asynchronously; let pending promise callbacks run.
const settle = () => new Promise((resolve) => setImmediate(resolve))

const resultFor = (id) => ({ id, minor: [[[12, 55], [12.1, 55.1]]], major: [], interval: 10 })

test('terrain controls render light DOM and publish debounced worker results', async (t) => {
  const { controls, status, workers } = mountControls(t)
  assert.match(controls.innerHTML, /Contour lines/)
  assert.match(controls.innerHTML, /Included in PNG\/PDF exports/)
  assert.equal(controls.shadowRoot, undefined)
  assert.equal(status.textContent, 'Loading terrain…')
  assert.equal(state.get('busy'), 1)
  t.mock.timers.tick(299)
  assert.equal(workers.length, 0)
  t.mock.timers.tick(1)
  assert.equal(workers.length, 1)
  const request = workers[0].messages.at(-1)
  assert.deepEqual(request.bbox, state.get('bbox'))
  assert.equal(request.interval, 0)
  const result = resultFor(request.id)
  workers[0].reply(result)
  assert.equal(state.get('contours'), result)
  assert.equal(status.textContent, '10 m contours · bold every 50 m')
  await settle()
  assert.equal(state.get('busy'), 0)
})

test('bbox and interval changes cancel stale contours and only load the settled selection', (t) => {
  const { interval, workers } = mountControls(t)
  t.mock.timers.tick(300)
  const worker = workers[0]
  const first = worker.messages.at(-1)
  worker.reply(resultFor(first.id))
  const bbox = [55, 12, 55.1, 12.1]
  state.set('bbox', bbox)
  assert.equal(state.get('contours'), null)
  assert.equal(worker.messages.at(-1).cancel, true)
  interval.value = '20'
  interval.dispatchEvent(new Event('change'))
  worker.reply(resultFor(first.id))
  assert.equal(state.get('contours'), null)
  t.mock.timers.tick(300)
  assert.deepEqual(worker.messages.at(-1).bbox, bbox)
  assert.equal(worker.messages.at(-1).interval, 20)
  assert.equal(worker.messages.filter(({ cancel }) => !cancel).length, 2)
})

test('turning contours off disables the interval and ignores pending results', async (t) => {
  const { toggle, interval, status, workers } = mountControls(t)
  t.mock.timers.tick(300)
  const worker = workers[0]
  const request = worker.messages.at(-1)
  worker.reply(resultFor(request.id))
  toggle.checked = false
  toggle.dispatchEvent(new Event('change'))
  assert.equal(interval.disabled, true)
  assert.equal(status.textContent, 'Contours off')
  await settle()
  assert.equal(state.get('busy'), 0)
  assert.equal(state.get('contours'), null)
  worker.reply(resultFor(request.id))
  assert.equal(state.get('contours'), null)
  t.mock.timers.tick(300)
  assert.equal(worker.messages.filter(({ cancel }) => !cancel).length, 1)
  toggle.checked = true
  toggle.dispatchEvent(new Event('change'))
  assert.equal(interval.disabled, false)
  t.mock.timers.tick(300)
  assert.equal(worker.messages.at(-1).cancel, undefined)
})

test('terrain errors can be retried and disconnect cleans up requests and subscriptions', async (t) => {
  const { controls, status, retry, workers } = mountControls(t)
  t.mock.timers.tick(300)
  const worker = workers[0]
  worker.reply({ id: worker.messages.at(-1).id, error: 'Tile unavailable' })
  assert.equal(retry.hidden, false)
  assert.match(status.textContent, /Tile unavailable/)
  await settle()
  assert.equal(state.get('busy'), 0)
  retry.dispatchEvent(new Event('click'))
  assert.equal(retry.hidden, true)
  assert.equal(state.get('busy'), 1)
  t.mock.timers.tick(300)
  const pending = worker.messages.at(-1)
  controls.disconnectedCallback()
  assert.equal(worker.terminated, true)
  await settle()
  assert.equal(state.get('busy'), 0)
  state.set('bbox', [54, 11, 55, 12])
  t.mock.timers.tick(300)
  worker.reply(resultFor(pending.id))
  assert.equal(state.get('contours'), null)
  assert.equal(worker.messages.at(-1), pending)
  assert.equal(workers.length, 1)
})

test('artwork map redraws on shared contour changes without owning terrain controls', (t) => {
  const previous = state.get('contours')
  let frames = 0
  globalThis.requestAnimationFrame = () => ++frames
  globalThis.cancelAnimationFrame = () => {}
  globalThis.ResizeObserver = class { observe() {} disconnect() {} }
  const map = new ArtworkMap()
  const node = new EventTarget()
  map.querySelector = (selector) => selector === 'canvas' ? { getContext: () => ({}) } : node
  map.connectedCallback()
  t.after(() => {
    map.disconnectedCallback()
    state.set('contours', previous)
  })
  assert.doesNotMatch(map.innerHTML, /terrain-controls|Contour lines/)
  const result = resultFor(1)
  state.set('contours', result)
  assert.equal(frames, 1)
  map.disconnectedCallback()
  assert.equal(state.get('contours'), result)
  state.set('contours', null)
  assert.equal(frames, 1)
})
