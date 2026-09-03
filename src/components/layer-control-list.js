import state from "../utils/state.js";
import { LayerStyleControl } from "./layer-style-control.js";

customElements.define("layer-style-control", LayerStyleControl);

export class LayerControlList extends HTMLElement {
  constructor() {
    super();
  }

  connectedCallback() {
    this.render(state.get("styles"));
    this.addEventListener('layer:change', this.updateStyles.bind(this))
  }

  render(styles) {
    this.innerHTML = `
      <ul class="layer-control-list">
        ${styles
          .map(
            (style) => `<li>
          <layer-style-control
            id="${style.id}"
            label="${style.label}"
            visible="${style.visible}"
            color="${style.color}"
            mode="${style.mode}"
            stroke="${style.stroke}">
          </layer-style-control>
        </li>`,
          )
          .join("")}
      </ul>
    `;
  }

  updateStyles(ev) {
    state.set(
      "styles",
      state.get("styles").map((ls) => (ls.id === ev.detail.id ? ev.detail : ls)),
    );
  }
}
