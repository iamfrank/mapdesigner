import state from "../utils/state.js";
import { exportPNG, exportPDF, exportTiledPDF, getTileLayout } from "../utils/export.js";
import { TILE_SHEET_SIZES } from "../utils/paper.js";

export class ExportPDF extends HTMLElement {

  pngButtonEl
  pdfButtonEl
  tiledButtonEl

  constructor() {
    super();
  }

  connectedCallback() {
    this.render()
  }

  render() {
    const sheetId = state.get('tileSheetId')
    const orientation = state.get('tileOrientation')
    this.innerHTML = `
      <button id="btn-export-png" disabled>Export PNG</button>
      <button id="btn-export-pdf" disabled>Export PDF</button>

      <fieldset class="export-tiled">
        <legend>Print on several smaller sheets</legend>
        <label>Sheet size
          <select id="tile-sheet">
            ${TILE_SHEET_SIZES.map((s) => `<option value="${s.id}" ${s.id === sheetId ? 'selected' : ''}>${s.label}</option>`).join('')}
          </select>
        </label>
        <label>Orientation
          <select id="tile-orientation">
            ${[['auto', 'Auto (fewest sheets)'], ['portrait', 'Portrait'], ['landscape', 'Landscape']]
              .map(([v, l]) => `<option value="${v}" ${v === orientation ? 'selected' : ''}>${l}</option>`).join('')}
          </select>
        </label>
        <label>Margin (mm)
          <input type="number" id="tile-margin" min="0" max="50" step="1" value="${state.get('tileMarginMM')}">
        </label>
        <label>Overlap (mm)
          <input type="number" id="tile-overlap" min="0" max="50" step="1" value="${state.get('tileOverlapMM')}">
        </label>
        <label class="checkbox">
          <input type="checkbox" id="tile-guide" ${state.get('tileAssemblyGuide') ? 'checked' : ''}>
          Include assembly guide page
        </label>
        <p class="tile-info"></p>
        <button id="btn-export-tiled" disabled>Export tiled PDF</button>
      </fieldset>
    `
    this.pngButtonEl = this.querySelector('#btn-export-png')
    this.pdfButtonEl = this.querySelector('#btn-export-pdf')
    this.tiledButtonEl = this.querySelector('#btn-export-tiled')
    this.pngButtonEl.addEventListener('click', () => this.#export(exportPNG))
    this.pdfButtonEl.addEventListener('click', () => this.#export(exportPDF))
    this.tiledButtonEl.addEventListener('click', () => this.#export(exportTiledPDF))

    const bind = (selector, key, parse = (v) => v) => {
      this.querySelector(selector).addEventListener('change', (ev) => {
        state.set(key, parse(ev.target.type === 'checkbox' ? ev.target.checked : ev.target.value))
      })
    }
    const nonNegative = (v) => Math.max(0, Number(v) || 0)
    bind('#tile-sheet', 'tileSheetId')
    bind('#tile-orientation', 'tileOrientation')
    bind('#tile-margin', 'tileMarginMM', nonNegative)
    bind('#tile-overlap', 'tileOverlapMM', nonNegative)
    bind('#tile-guide', 'tileAssemblyGuide')

    state.subscribe('osmData', () => this.#updateButtons())
    for (const key of ['paperSizeId', 'customWidthMM', 'customHeightMM', 'tileSheetId', 'tileOrientation', 'tileMarginMM', 'tileOverlapMM']) {
      state.subscribe(key, () => this.#updateTileInfo())
    }
    this.#updateTileInfo()
  }

  #layoutValid = true

  #updateButtons() {
    const noData = !state.get('osmData')
    this.pngButtonEl.disabled = noData
    this.pdfButtonEl.disabled = noData
    this.tiledButtonEl.disabled = noData || !this.#layoutValid
  }

  #updateTileInfo() {
    const info = this.querySelector('.tile-info')
    try {
      const { layout, sheet } = getTileLayout()
      const orient = layout.sheetW > layout.sheetH ? 'landscape' : 'portrait'
      info.textContent = `${layout.tiles.length} × ${sheet.label} ${orient} (${layout.rows} rows × ${layout.cols} columns)`
      this.#layoutValid = true
    } catch (err) {
      info.textContent = err.message
      this.#layoutValid = false
    }
    this.#updateButtons()
  }

  #export(fn) {
    if (!state.get("osmData")) {
      alert("OSM data not loaded yet.");
      return;
    }
    fn(state.get("osmData"), state.get("bbox"));
  }
}
