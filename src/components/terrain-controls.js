import state from '../utils/state.js'

/** Loads elevation contours and exposes their settings in the Styles panel. */
export class TerrainControls extends HTMLElement {
  #terrainWorker = null
  #terrainTimer = 0
  #terrainRequest = 0
  #terrainKey = null
  #terrainToggleEl
  #terrainIntervalEl
  #terrainStatusEl
  #terrainRetryEl
  #unsubscribe

  connectedCallback() {
    this.innerHTML = `
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
      <small>Included in PNG/PDF exports</small>
      <a href="https://github.com/tilezen/joerd/blob/master/docs/attribution.md" target="_blank" rel="noopener noreferrer">Elevation: Mapzen terrain / sources</a>
    `
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
    this.#unsubscribe = state.subscribe('bbox', () => this.#queueContours())
    this.#queueContours()
  }

  disconnectedCallback() {
    this.#unsubscribe?.()
    this.#unsubscribe = null
    clearTimeout(this.#terrainTimer)
    this.#terrainWorker?.terminate()
    this.#terrainWorker = null
    this.#terrainKey = null
    this.#terrainRequest++
    state.set('contours', null)
  }

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
    state.set('contours', null) // Never show terrain from a previous geographic area.
    this.#terrainRetryEl.hidden = true
    this.#terrainStatusEl.textContent = enabled ? 'Loading terrain…' : 'Contours off'
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
            state.set('contours', data)
            const count = data.minor.length + data.major.length
            this.#terrainStatusEl.textContent = count
              ? `${data.interval} m contours · bold every ${data.interval * 5} m`
              : `No contours at ${data.interval} m in this area`
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
}
