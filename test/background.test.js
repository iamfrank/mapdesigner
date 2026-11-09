import test from 'node:test'
import assert from 'node:assert/strict'
import state from '../src/utils/state.js'
import { computeTransform } from '../src/utils/projection.js'
import { computeSeaPolygons, drawPoster } from '../src/utils/render.js'

// Minimal custom-element host for exercising input and event handling in Node.
globalThis.HTMLElement = class extends EventTarget {}
globalThis.customElements = { define() {} }
const { BackgroundStyleControl } = await import('../src/components/background-style-control.js')
const { LayerControlList } = await import('../src/components/layer-control-list.js')

test('background defaults to #001100 in shared state and the color picker', () => {
  assert.equal(state.get('backgroundStyle').color, '#001100')
  const list = new LayerControlList()
  list.connectedCallback()
  assert.match(list.innerHTML, /background-style-control color="#001100"/)
})

test('color input emits a hex string and background:change updates shared state', () => {
  const previous = state.get('backgroundStyle')
  const input = new EventTarget()
  input.value = '#123456'
  const control = new BackgroundStyleControl()
  control.querySelector = () => input
  const list = new LayerControlList()
  list.connectedCallback()
  control.addEventListener('background:change', (event) => {
    assert.equal(event.detail, '#123456')
    assert.equal(event.bubbles, true)
    assert.equal(event.composed, true)
    // Forward the event as a DOM parent would.
    list.dispatchEvent(new CustomEvent(event.type, { detail: event.detail }))
  })

  try {
    control.render(previous.color)
    input.dispatchEvent(new Event('input'))
    assert.equal(state.get('backgroundStyle').color, '#123456')
    list.render(state.get('styles'))
    assert.match(list.innerHTML, /background-style-control color="#123456"/)
  } finally {
    state.set('backgroundStyle', previous)
  }
})

function recordingContext() {
  return {
    fills: [],
    save() {}, restore() {}, beginPath() {}, rect() {}, clip() {},
    moveTo() {}, lineTo() {}, closePath() {},
    fillRect(...rect) { this.fills.push({ color: this.fillStyle, rect }) },
    fill() { this.fills.push({ color: this.fillStyle }) },
  }
}

test('poster paints the selected background even before map data loads', () => {
  const ctx = recordingContext()
  drawPoster(ctx, {
    osmData: null, styles: [], width: 100, height: 200,
    backgroundColor: state.get('backgroundStyle').color,
  })
  assert.deepEqual(ctx.fills, [{ color: '#001100', rect: [0, 0, 100, 200] }])
})

for (const cached of [true, false]) {
  test(`poster uses the selected background for island cutouts (${cached ? 'cached preview' : 'export'} sea)`, () => {
    const ctx = recordingContext()
    const transform = computeTransform([0, 0, 1, 1], 100, 100)
    const osmData = { coastlines: [
      [[0.5, 0], [0.5, 0.5], [0.5, 1]],
      [[0.1, 0.1], [0.2, 0.1], [0.2, 0.2], [0.1, 0.1]],
    ] }
    drawPoster(ctx, {
      osmData, transform, width: 100, height: 100,
      styles: [{ id: 'water', visible: true, color: '#a5c9e8', mode: 'fill' }],
      backgroundColor: '#123456',
      sea: cached ? computeSeaPolygons(osmData.coastlines, transform, 100, 100) : undefined,
    })
    assert.deepEqual(ctx.fills.map(({ color }) => color), ['#123456', '#a5c9e8', '#123456'])
  })
}
