import { DETAIL_W, DETAIL_H, PRINT_W, PRINT_H } from '../utils/state.js'
import state from '../utils/state.js'
import { computeTransform, computeDetailTransform } from "../utils/projection.js";
import { clearCanvas, renderWays } from "../utils/render.js";

export class ArtworkDetailMap extends HTMLElement {
  canvasEl
  ctx
  #unsubscribers = []

  constructor() {
    super()
  }

  connectedCallback() {
    this.render()
    const rerender = () => this.renderCanvas(state.get('styles'), state.get('osmData'), state.get('bbox'))
    this.#unsubscribers.push(
      state.subscribe('osmData', rerender),
      state.subscribe('styles', rerender),
      state.subscribe('bbox', rerender),
    )
  }

  disconnectedCallback() {
    this.#unsubscribers.forEach((unsubscribe) => unsubscribe())
    this.#unsubscribers = []
  }

  render() {
    this.innerHTML = `
      <p class="detail-title">Detail sample</p>
      <canvas id="canvas-detail"></canvas>
      <p class="detail-label">Detail at A0 / 300 DPI scale</p>
    `
    this.canvasEl = document.getElementById("canvas-detail");
    // Size canvases before showing anything
    this.canvasEl.width = DETAIL_W;
    this.canvasEl.height = DETAIL_H;

    this.ctx = this.canvasEl.getContext("2d");
  }

  renderCanvas(styles, osmData, bbox) {
    if (!osmData) return;
    // Detail canvas uses the same scale as the full print canvas so that stroke
    // weights look exactly as they will on the printed sheet.
    const printTransform = computeTransform(bbox, PRINT_W, PRINT_H);
    const detailTransform = computeDetailTransform(
      state.get('center')[0],
      state.get('center')[1],
      printTransform.scale,
      DETAIL_W,
      DETAIL_H,
    );
    clearCanvas(this.ctx);
    styles.forEach((style) => {
      if (style.visible) {
        renderWays(
          this.ctx,
          osmData[style.id],
          detailTransform,
          style.color,
          style.stroke,
        );
      }
    });
  }

}
