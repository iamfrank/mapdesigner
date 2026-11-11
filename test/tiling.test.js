import test from 'node:test'
import assert from 'node:assert/strict'
import { jsPDF } from 'jspdf'
import { computeTileLayout, rowLabel, tileLabel } from '../src/utils/tiling.js'
import { drawTileSheet, drawAssemblyGuide } from '../src/utils/tiling-pdf.js'

// 1×1 red PNG.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='

test('row labels go A..Z, AA..', () => {
  assert.equal(rowLabel(0), 'A')
  assert.equal(rowLabel(25), 'Z')
  assert.equal(rowLabel(26), 'AA')
  assert.equal(tileLabel(1, 2), 'B3')
})

test('A0 poster on A4 sheets covers the poster with the configured overlap', () => {
  const layout = computeTileLayout({ posterW: 841, posterH: 1189, sheetW: 210, sheetH: 297, margin: 10, overlap: 10 })
  assert.equal(layout.tiles.length, layout.rows * layout.cols)
  const contentW = layout.sheetW - 20
  const contentH = layout.sheetH - 20
  for (const t of layout.tiles) {
    assert.ok(t.w <= contentW + 1e-9 && t.h <= contentH + 1e-9)
    assert.ok(t.x + t.w <= 841 + 1e-9 && t.y + t.h <= 1189 + 1e-9)
  }
  const last = layout.tiles.at(-1)
  assert.equal(last.x + last.w, 841)
  assert.equal(last.y + last.h, 1189)
  // Neighbours overlap by exactly `overlap` mm.
  const [a, b] = layout.tiles
  assert.equal(a.x + a.w - b.x, 10)
  assert.equal(layout.tiles[0].label, 'A1')
})

test('auto orientation picks the layout with fewest sheets', () => {
  const base = { posterW: 420, posterH: 297, sheetW: 210, sheetH: 297, margin: 5, overlap: 5 }
  const p = computeTileLayout({ ...base, orientation: 'portrait' })
  const l = computeTileLayout({ ...base, orientation: 'landscape' })
  const auto = computeTileLayout(base)
  assert.equal(auto.tiles.length, Math.min(p.tiles.length, l.tiles.length))
  assert.ok(l.sheetW > l.sheetH)
})

test('poster smaller than a sheet yields a single tile', () => {
  const layout = computeTileLayout({ posterW: 100, posterH: 150, sheetW: 210, sheetH: 297 })
  assert.equal(layout.tiles.length, 1)
  assert.deepEqual([layout.tiles[0].w, layout.tiles[0].h], [100, 150])
})

test('rejects impossible margin/overlap', () => {
  assert.throws(() => computeTileLayout({ posterW: 841, posterH: 1189, sheetW: 210, sheetH: 297, margin: 120 }))
  assert.throws(() => computeTileLayout({ posterW: 841, posterH: 1189, sheetW: 210, sheetH: 297, margin: 10, overlap: 200 }))
})

test('draws a multi-page tiled PDF with guide page', () => {
  const layout = computeTileLayout({ posterW: 420, posterH: 594, sheetW: 210, sheetH: 297 })
  const pdf = new jsPDF({ unit: 'mm', format: [layout.sheetW, layout.sheetH] })
  drawAssemblyGuide(pdf, layout, PNG, { posterW: 420, posterH: 594, title: 'Test' })
  for (const tile of layout.tiles) {
    pdf.addPage([layout.sheetW, layout.sheetH])
    drawTileSheet(pdf, layout, tile, PNG, { title: 'Test' })
  }
  assert.equal(pdf.getNumberOfPages(), layout.tiles.length + 1)
  const out = pdf.output()
  assert.match(out, /A1/)
  assert.match(out, /sheet 1 of/)
})
