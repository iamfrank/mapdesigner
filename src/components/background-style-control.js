export class BackgroundStyleControl extends HTMLElement {
  static observedAttributes = ["color"];

  constructor() {
    super();
  }

  render(color) {
    this.innerHTML = `
      <label for="background-color">Baggrundsfarve</label>
      <input id="background-color" type="color" value="${color}">
    `
    this.querySelector("input").addEventListener(
      "input",
      (ev) => {
        this.emitState(ev.target.value);
      },
    );
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'color') {
      this.render(newValue)
    }
  }

  emitState(color) {
    this.dispatchEvent(
      new CustomEvent("background:change", {
        composed: true,
        bubbles: true,
        detail: color,
      }),
    );
  }
}
