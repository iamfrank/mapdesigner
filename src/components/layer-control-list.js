import state from "../utils/state.js";
import { LayerStyleControl } from "./layer-style-control.js";
import { BackgroundStyleControl } from "./background-style-control.js";

customElements.define("layer-style-control", LayerStyleControl);
customElements.define("background-style-control", BackgroundStyleControl);

export class LayerControlList extends HTMLElement {
  constructor() {
    super();
  }

  connectedCallback() {
    this.render(state.get("styles"));
    this.addEventListener('layer:change', this.updateStyles.bind(this))
    this.addEventListener('background:change', (ev) => {
      state.set('backgroundStyle', { ...state.get('backgroundStyle'), color: ev.detail });
    });
  }

  render(styles) {
    // Group consecutive styles under a heading, keeping draw order.
    const groups = [];
    for (const style of styles) {
      const name = style.group ?? "";
      if (groups.at(-1)?.name !== name) groups.push({ name, styles: [] });
      groups.at(-1).styles.push(style);
    }
    const item = (style) => `<li>
          <layer-style-control
            id="${style.id}"
            group="${style.group ?? ""}"
            label="${style.label}"
            visible="${style.visible}"
            color="${style.color}"
            mode="${style.mode}"
            ${style.mode === "text"
              ? `size="${style.size ?? 1}" font="${style.font ?? "serif"}" halo="${style.halo !== false}"`
              : `stroke="${style.stroke}"`}>
          </layer-style-control>
        </li>`;
    this.innerHTML = `
      ${groups.map((g) => `
        ${g.name ? `<h3 class="layer-group-title">${g.name}</h3>` : ""}
        <ul class="layer-control-list">${g.styles.map(item).join("")}</ul>
      `).join("")}
      <ul class="layer-control-list">
        <li><background-style-control color="${state.get('backgroundStyle').color}"></background-style-control></li>
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
