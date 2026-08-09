import state from '../utils/state.js'

export class StatusNotify extends HTMLElement {
  constructor() {
    super()
  }

  connectedCallback() {
    this.render('Initializing ...', '')
    state.subscribe('statusText', (newStatus, oldStatus) => {
      this.render(newStatus)
    })
  }

  render(newStatus) {
    this.innerHTML = `<span id="status" class="status">${newStatus}</span>`
  }
}
