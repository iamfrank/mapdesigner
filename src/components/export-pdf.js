import state from "../utils/state.js";
import { exportPNG, exportPDF } from "../utils/export.js";

export class ExportPDF extends HTMLElement {

  pngButtonEl
  pdfButtonEl

  constructor() {
    super();
  }

  connectedCallback() {
    this.render()
  }

  render() {
    this.innerHTML = `
      <button id="btn-export-png" disabled>Export PNG</button>
      <button id="btn-export-pdf" disabled>Export PDF</button>
    `
    this.pngButtonEl = this.querySelector('#btn-export-png')
    this.pdfButtonEl = this.querySelector('#btn-export-pdf')
    this.pngButtonEl.addEventListener('click', () => this.#export(exportPNG))
    this.pdfButtonEl.addEventListener('click', () => this.#export(exportPDF))
    state.subscribe('osmData', (osmData) => {
      this.pngButtonEl.disabled = !osmData
      this.pdfButtonEl.disabled = !osmData
    })
  }

  #export(fn) {
    if (!state.get("osmData")) {
      alert("OSM data not loaded yet.");
      return;
    }
    fn(state.get("osmData"), state.get("bbox"));
  }
}
