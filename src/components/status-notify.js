import state from '../utils/state.js'

/**
 * Shows `state.statusText`, with a loading spinner while any task tracked via
 * `trackBusy()` (e.g. fetching map data) is in progress.
 */
export class StatusNotify extends HTMLElement {
  #unsubscribers = []
  #textEl
  #spinnerEl

  connectedCallback() {
    this.innerHTML = `
      <loading-spinner class="status-spinner" label="Loading" hidden></loading-spinner>
      <span id="status" class="status" role="status" aria-live="polite"></span>
    `
    this.#textEl = this.querySelector('.status')
    this.#spinnerEl = this.querySelector('.status-spinner')
    this.#textEl.textContent = state.get('statusText') || 'Initializing ...'
    this.#renderBusy(state.get('busy'))

    this.#unsubscribers = [
      state.subscribe('statusText', (text) => { this.#textEl.textContent = text }),
      state.subscribe('busy', (busy) => this.#renderBusy(busy)),
    ]
  }

  disconnectedCallback() {
    this.#unsubscribers.forEach((off) => off())
    this.#unsubscribers = []
  }

  #renderBusy(busy) {
    const isBusy = busy > 0
    this.#spinnerEl.hidden = !isBusy
    this.toggleAttribute('busy', isBusy)
    this.setAttribute('aria-busy', String(isBusy))
  }
}
