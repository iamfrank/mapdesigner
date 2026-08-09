import state from "../utils/state.js";
import { exportPNG } from "../utils/export.js";

export class ExportPDF extends HTMLElement {

  buttonEl

  constructor() {
    super();
  }

  connectedCallback() {
    this.render()
  }

  render() {
    this.innerHTML = `<button id="btn-export" disabled>Export PNG</button>`
    this.buttonEl = this.querySelector('button')
    this.buttonEl.addEventListener('click', this.clickHandler.bind(this))
    state.subscribe('osmData', (osmData) => {
      if (osmData) {
        this.buttonEl.disabled = false
      } else {
        this.buttonEl.disabled = true
      }
    })
  }

  clickHandler(ev) {
    if (!state.get("osmData")) {
      alert("OSM data not loaded yet.");
      return;
    }
    exportPNG(state.get("osmData"), state.get("bbox"));
  }
}
