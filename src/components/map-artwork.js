import state, { getPrintPx, getTitleBlock } from '../utils/state.js'
import { computeTransform } from '../utils/projection.js'
import { computeSeaPolygons, drawPoster } from '../utils/render.js'
import {
  MAX_ZOOM,
  fitCamera,
  fitScale,
  clampCamera,
  zoomAt,
  cssTransformBetween,
} from '../utils/camera.js'

/** Re-raster every frame while interaction is cheaper than this (ms). */
const FAST_RENDER_MS = 24
/** Otherwise wait this long after the last gesture event (ms). */
const SETTLE_MS = 150
const MAX_DPR = 2
/** Lines never get thinner than this on screen (device px). */
const MIN_STROKE_DEVICE_PX = 0.5
/** Vertices closer than this (device px) to the previous one are dropped. */
const SIMPLIFY_DEVICE_PX = 1

/**
 * The single, zoomable poster view.
 *
 * The canvas is sized to the *viewport* (never to the print size), and the
 * poster is drawn into it in print space under a camera transform. The terrain
 * overlay is preview-only; the poster itself shares the export renderer.
 * Per-frame cost is independent of paper size/DPI.
 *
 * Interaction: wheel/pinch = zoom at cursor, drag = pan, double-click = toggle
 * fit / 100 %. During a gesture the last bitmap is moved with a CSS transform
 * (instant); the real re-raster happens every frame while it's cheap, or once
 * the gesture settles when it's not.
 */
export class ArtworkMap extends HTMLElement {
  canvasEl
  ctx
  #readoutEl
  #cam = { k: 1, cx: 0, cy: 0 }
  /** Camera the canvas bitmap was last rasterised with. */
  #rendered = null
  #view = { w: 0, h: 0, dpr: 1 }
  #fitMode = true
  #rafId = 0
  #timer = 0
  #lastRenderMs = 0
  /** Sea polygons depend only on data + page, not on the camera → cache. */
  #seaCache = null
  #pointers = new Map()
  #last = null
  #resizeObserver
  #unsubscribers = []
  #terrainWorker = null
  #terrainTimer = 0
  #terrainRequest = 0
  #terrainKey = null
  #contours = null
  #terrainToggleEl
  #terrainIntervalEl
  #terrainStatusEl
  #terrainRetryEl

  connectedCallback() {
    this.innerHTML = `
      <canvas id="canvas-overview"></canvas>
      <div class="terrain-controls map-controls">
        <label><input type="checkbox" name="contours" checked> Contour lines</label>
        <label>Interval
          <select aria-label="Contour interval">
            <option value="0">Auto</option>
            <option value="10">10 m</option>
            <option value="20">20 m</option>
            <option value="50">50 m</option>
            <option value="100">100 m</option>
          </select>
        </label>
        <span class="terrain-status" role="status" aria-live="polite"></span>
        <button type="button" data-act="retry-terrain" hidden>Retry contours</button>
        <small>Preview only · not included in exports</small>
        <a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md" target="_blank" rel="noopener noreferrer">Elevation: Mapzen terrain / sources</a>
      </div>
      <div class="zoom-controls map-controls">
        <button type="button" data-act="fit" title="Fit whole poster">Fit</button>
        <button type="button" data-act="actual" title="True print scale (1 print pixel = 1 screen pixel)">100%</button>
        <span class="zoom-readout"></span>
      </div>
    `
    this.canvasEl = this.querySelector('canvas')
    this.ctx = this.canvasEl.getContext('2d')
    this.#readoutEl = this.querySelector('.zoom-readout')
    this.#terrainToggleEl = this.querySelector('[name="contours"]')
    this.#terrainIntervalEl = this.querySelector('[aria-label="Contour interval"]')
    this.#terrainStatusEl = this.querySelector('.terrain-status')
    this.#terrainRetryEl = this.querySelector('[data-act="retry-terrain"]')
    this.#terrainToggleEl.addEventListener('change', () => this.#queueContours())
    this.#terrainIntervalEl.addEventListener('change', () => this.#queueContours())
    this.#terrainRetryEl.addEventListener('click', () => {
      this.#terrainKey = null
      this.#queueContours()
    })

    this.querySelector('[data-act="fit"]').addEventListener('click', () => this.#fit())
    this.querySelector('[data-act="actual"]').addEventListener('click', () => this.#actualSize())

    this.addEventListener('wheel', this.#onWheel, { passive: false })
    this.addEventListener('pointerdown', this.#onPointerDown)
    this.addEventListener('pointermove', this.#onPointerMove)
    this.addEventListener('pointerup', this.#onPointerUp)
    this.addEventListener('pointercancel', this.#onPointerUp)
    this.addEventListener('dblclick', this.#onDblClick)

    const redraw = () => this.#scheduleRaster()
    const repage = () => { this.#fit(); }
    this.#unsubscribers.push(
      ...['osmData', 'styles', 'bbox', 'center', 'title', 'subtitle', 'autoSubtitle', 'showTitleBlock']
        .map((prop) => state.subscribe(prop, redraw)),
      // Page shape changed: units/aspect differ, so the old camera is meaningless.
      ...['paperSizeId', 'customWidthMM', 'customHeightMM', 'dpi']
        .map((prop) => state.subscribe(prop, repage)),
      state.subscribe('bbox', () => this.#queueContours()),
    )

    this.#resizeObserver = new ResizeObserver(() => this.#onResize())
    this.#resizeObserver.observe(this)
    this.#queueContours()
  }

  disconnectedCallback() {
    this.#unsubscribers.forEach((unsubscribe) => unsubscribe())
    this.#unsubscribers = []
    this.#resizeObserver?.disconnect()
    cancelAnimationFrame(this.#rafId)
    clearTimeout(this.#timer)
    this.#rafId = 0
    this.#timer = 0
    clearTimeout(this.#terrainTimer)
    this.#terrainWorker?.terminate()
    this.#terrainWorker = null
    this.#terrainKey = null
    this.#contours = null
    this.#terrainRequest++
  }

  // ── Preview-only terrain ──────────────────────────────────────────────

  #terrainError(message) {
    this.#terrainStatusEl.textContent = `Contours unavailable: ${message}`
    this.#terrainRetryEl.hidden = false
    this.#terrainKey = null
  }

  #queueContours() {
    const enabled = this.#terrainToggleEl.checked
    const bbox = state.get('bbox')
    const interval = Number(this.#terrainIntervalEl.value)
    const key = enabled && bbox ? `${bbox.map((n) => n.toFixed(6)).join(',')}:${interval}` : null
    this.#terrainIntervalEl.disabled = !enabled
    if (key && key === this.#terrainKey) return
    this.#terrainKey = key
    const id = ++this.#terrainRequest
    clearTimeout(this.#terrainTimer)
    this.#terrainWorker?.postMessage({ id, cancel: true })
    this.#contours = null // Never show terrain from a previous geographic area.
    this.#terrainRetryEl.hidden = true
    this.#terrainStatusEl.textContent = enabled ? 'Loading terrain…' : 'Contours off'
    this.#scheduleRaster()
    if (!key) return

    // Navigation updates can arrive in quick succession. Only fetch the settled area.
    this.#terrainTimer = setTimeout(() => {
      try {
        if (!this.#terrainWorker) {
          const worker = new Worker(new URL('../utils/terrain-worker.js', import.meta.url), { type: 'module' })
          this.#terrainWorker = worker
          worker.onmessage = ({ data }) => {
            if (data.id !== this.#terrainRequest) return
            if (data.error) { this.#terrainError(data.error); return }
            this.#contours = data
            const count = data.minor.length + data.major.length
            this.#terrainStatusEl.textContent = count
              ? `${data.interval} m contours · bold every ${data.interval * 5} m`
              : `No contours at ${data.interval} m in this area`
            this.#scheduleRaster()
          }
          worker.onerror = () => {
            if (this.#terrainWorker !== worker) return
            worker.terminate()
            this.#terrainWorker = null
            if (this.#terrainToggleEl.checked) {
              this.#terrainError('Terrain processing failed. Try again or use a newer browser.')
            }
          }
        }
        this.#terrainWorker.postMessage({ id, bbox, interval })
      } catch (error) {
        this.#terrainError(error.message)
      }
    }, 300)
  }

  // ── Sizing ────────────────────────────────────────────────────────────

  #onResize() {
    const rect = this.getBoundingClientRect()
    const w = Math.floor(rect.width)
    const h = Math.floor(rect.height)
    if (w === 0 || h === 0) return
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
    if (w === this.#view.w && h === this.#view.h && dpr === this.#view.dpr) return

    this.#view = { w, h, dpr }
    // Assigning width/height clears the canvas, so re-raster synchronously.
    this.canvasEl.width = Math.round(w * dpr)
    this.canvasEl.height = Math.round(h * dpr)
    this.canvasEl.style.width = `${w}px`
    this.canvasEl.style.height = `${h}px`

    if (this.#fitMode) this.#cam = this.#fitCam()
    else this.#cam = this.#clamp(this.#cam)
    this.#raster()
  }

  #fitCam() {
    const { w: pw, h: ph } = getPrintPx()
    return fitCamera(pw, ph, this.#view.w, this.#view.h)
  }

  #clamp(cam) {
    const { w: pw, h: ph } = getPrintPx()
    return clampCamera(cam, pw, ph, this.#view.w, this.#view.h)
  }

  // ── Camera ────────────────────────────────────────────────────────────

  #fit() {
    this.#fitMode = true
    if (!this.#view.w) return
    this.#cam = this.#fitCam()
    // Page shape may have changed, so don't reuse the old bitmap.
    this.#scheduleRaster()
  }

  #actualSize() {
    const { w, h } = this.#view
    this.#setCamera(zoomAt(this.#cam, w / 2, h / 2, 1, w, h))
  }

  #onDblClick = (e) => {
    if (e.target.closest('.map-controls')) return
    const { w, h } = this.#view
    const { w: pw, h: ph } = getPrintPx()
    if (this.#cam.k > fitScale(pw, ph, w, h) * 1.001) return this.#fit()
    const r = this.getBoundingClientRect()
    this.#setCamera(zoomAt(this.#cam, e.clientX - r.left, e.clientY - r.top, 1, w, h))
  }

  /** Apply a new camera from user interaction: instant CSS feedback + deferred raster. */
  #setCamera(cam) {
    if (!this.#view.w) return
    const { w: pw, h: ph } = getPrintPx()
    this.#cam = this.#clamp(cam)
    this.#fitMode = this.#cam.k <= fitScale(pw, ph, this.#view.w, this.#view.h) * 1.0001

    if (this.#rendered) {
      this.canvasEl.style.transform = cssTransformBetween(this.#rendered, this.#cam, this.#view.w, this.#view.h)
    }
    this.#updateReadout()

    if (this.#lastRenderMs < FAST_RENDER_MS) {
      this.#scheduleRaster()
    } else {
      cancelAnimationFrame(this.#rafId)
      this.#rafId = 0
      clearTimeout(this.#timer)
      this.#timer = setTimeout(() => this.#raster(), SETTLE_MS)
    }
  }

  #updateReadout() {
    this.#readoutEl.textContent = `${Math.round(this.#cam.k * 100)}%`
  }

  // ── Input ─────────────────────────────────────────────────────────────

  #onWheel = (e) => {
    if (e.target.closest('.map-controls')) return
    e.preventDefault()
    if (!this.#view.w) return
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1
    // ctrl+wheel is how trackpads report pinch; it arrives in smaller steps.
    const speed = e.ctrlKey ? 0.01 : 0.0015
    const factor = Math.exp(-e.deltaY * unit * speed)
    const r = this.getBoundingClientRect()
    const { w, h } = this.#view
    this.#setCamera(zoomAt(this.#cam, e.clientX - r.left, e.clientY - r.top, this.#cam.k * factor, w, h))
  }

  #gestureState() {
    const pts = [...this.#pointers.values()].slice(0, 2)
    if (pts.length === 0) return null
    const r = this.getBoundingClientRect()
    const x = pts.reduce((a, p) => a + p.x, 0) / pts.length - r.left
    const y = pts.reduce((a, p) => a + p.y, 0) / pts.length - r.top
    const dist = pts.length === 2 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0
    return { x, y, dist }
  }

  #onPointerDown = (e) => {
    if (e.target.closest('.map-controls')) return
    this.setPointerCapture(e.pointerId)
    this.#pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    this.#last = this.#gestureState()
    this.classList.add('panning')
  }

  #onPointerMove = (e) => {
    if (!this.#pointers.has(e.pointerId)) return
    this.#pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const cur = this.#gestureState()
    const last = this.#last
    this.#last = cur
    if (!cur || !last) return

    const { w, h } = this.#view
    let cam = { ...this.#cam, cx: this.#cam.cx - (cur.x - last.x) / this.#cam.k, cy: this.#cam.cy - (cur.y - last.y) / this.#cam.k }
    if (cur.dist > 0 && last.dist > 0) {
      cam = zoomAt(cam, cur.x, cur.y, cam.k * (cur.dist / last.dist), w, h)
    }
    this.#setCamera(cam)
  }

  #onPointerUp = (e) => {
    this.#pointers.delete(e.pointerId)
    this.#last = this.#gestureState()
    if (this.#pointers.size === 0) this.classList.remove('panning')
  }

  // ── Rendering ─────────────────────────────────────────────────────────

  #scheduleRaster() {
    clearTimeout(this.#timer)
    this.#timer = 0
    if (this.#rafId) return
    this.#rafId = requestAnimationFrame(() => {
      this.#rafId = 0
      this.#raster()
    })
  }

  #getSea(osmData, transform, pw, ph) {
    const c = this.#seaCache
    if (c && c.coast === osmData.coastlines && c.transform.originX === transform.originX
      && c.transform.originY === transform.originY && c.transform.scale === transform.scale
      && c.pw === pw && c.ph === ph) {
      return c.polys
    }
    const polys = computeSeaPolygons(osmData.coastlines, transform, pw, ph)
    this.#seaCache = { coast: osmData.coastlines, transform, pw, ph, polys }
    return polys
  }

  #raster() {
    cancelAnimationFrame(this.#rafId)
    clearTimeout(this.#timer)
    this.#rafId = 0
    this.#timer = 0

    const { w: vw, h: vh, dpr } = this.#view
    if (!vw) return
    const t0 = performance.now()

    const { w: pw, h: ph } = getPrintPx()
    this.#cam = this.#fitMode ? this.#fitCam() : this.#clamp(this.#cam)
    const { k, cx, cy } = this.#cam
    const kd = k * dpr // device px per print px

    const ctx = this.ctx
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, this.canvasEl.width, this.canvasEl.height)
    ctx.setTransform(kd, 0, 0, kd, (vw / 2 - cx * k) * dpr, (vh / 2 - cy * k) * dpr)

    const osmData = state.get('osmData')
    let previewData = osmData
    let styles = state.get('styles')
    if (this.#contours) {
      // Only this view receives these layers. Shared state and exports stay untouched.
      previewData = { ...osmData, contoursMinor: this.#contours.minor, contoursMajor: this.#contours.major }
      const firstStroke = styles.findIndex((style) => style.mode !== 'fill')
      const index = firstStroke < 0 ? styles.length : firstStroke
      styles = [
        ...styles.slice(0, index),
        { id: 'contoursMinor', visible: true, mode: 'stroke', color: 'rgba(130,92,55,0.5)', stroke: 0.65 / kd },
        { id: 'contoursMajor', visible: true, mode: 'stroke', color: 'rgba(115,76,40,0.8)', stroke: 1.1 / kd },
        ...styles.slice(index),
      ]
    }
    const transform = computeTransform(state.get('bbox'), pw, ph)
    const waterVisible = styles.find((s) => s.id === 'water')?.visible

    drawPoster(ctx, {
      osmData: previewData,
      styles,
      transform,
      width: pw,
      height: ph,
      sea: osmData && waterVisible ? this.#getSea(osmData, transform, pw, ph) : undefined,
      view: {
        x0: cx - vw / (2 * k),
        y0: cy - vh / (2 * k),
        x1: cx + vw / (2 * k),
        y1: cy + vh / (2 * k),
      },
      tol: SIMPLIFY_DEVICE_PX / kd,
      minStroke: MIN_STROKE_DEVICE_PX / kd,
      titleBlock: getTitleBlock(),
    })

    // Bitmap now matches the camera exactly; drop the interim CSS transform.
    this.#rendered = { ...this.#cam }
    this.canvasEl.style.transform = ''
    this.#updateReadout()
    this.#lastRenderMs = performance.now() - t0
  }
}
