import { computeTransform } from "../utils/projection.js";
import { clearCanvas, renderLayer } from "../utils/render.js";
import state from '../utils/state.js'

export class ArtworkMap extends HTMLElement {
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
    this.innerHTML = '<canvas id="canvas-overview"></canvas>'
    this.canvasEl = this.querySelector('canvas')
    this.sizeOverviewCanvas(this.canvasEl)
    this.ctx = this.canvasEl.getContext("2d");
  }

  renderCanvas(styles, osmData, bbox) {
    if (!osmData) return;
    const transform = computeTransform(bbox, this.canvasEl.width, this.canvasEl.height);
    clearCanvas(this.ctx);
    styles.forEach((style) => {
      if (style.visible) {
        renderLayer(this.ctx, osmData[style.id], transform, style);
      }
    });
  }

  /**
   * Compute and apply the overview canvas dimensions based on the current
   * viewport, respecting the A0 portrait aspect ratio (1 : √2).
   */
  sizeOverviewCanvas(canvasElement) {
    const headerH = document.querySelector("header").offsetHeight;
    const footerH = document.querySelector("footer").offsetHeight;
    // Leave 55 % of viewport width for the overview column
    const maxW = window.innerWidth * 0.55;
    const maxH = (window.innerHeight - headerH - footerH) * 0.92;
    const h = Math.min(maxH, maxW * Math.SQRT2);
    const w = h / Math.SQRT2;
    canvasElement.width = Math.round(w);
    canvasElement.height = Math.round(h);
  }
}
