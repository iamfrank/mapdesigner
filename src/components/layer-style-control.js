const FONTS = [
  ["serif", "Serif"],
  ["sans-serif", "Sans-serif"],
  ["Georgia, serif", "Georgia"],
  ["'Helvetica Neue', Helvetica, Arial, sans-serif", "Helvetica"],
  ["'Courier New', monospace", "Monospace"],
];

/**
 * Style controls for one layer. Shows a visibility toggle and colour for every
 * layer, plus stroke width (`mode="stroke"`) or font, size and halo
 * (`mode="text"`). Emits `layer:change` with the full style object.
 */
export class LayerStyleControl extends HTMLElement {
  static observedAttributes = ["id", "label", "color", "stroke", "visible", "mode", "size", "font", "halo", "group"];

  state = {
    id: "",
    label: "",
    color: "",
    stroke: 0,
    visible: false,
    mode: "stroke",
  };

  #renderQueued = false;

  connectedCallback() {
    this.#queueRender();
  }

  /** Coalesce the burst of attribute changes on creation into one render. */
  #queueRender() {
    if (this.#renderQueued) return;
    this.#renderQueued = true;
    queueMicrotask(() => {
      this.#renderQueued = false;
      this.render(this.state);
    });
  }

  attributeChangedCallback(name, oldValue, newValue) {
    switch (name) {
      case "stroke":
      case "size":
        this.state[name] = Number(newValue);
        break;
      case "visible":
      case "halo":
        this.state[name] = newValue === "true" || newValue === "";
        break;
      default:
        this.state[name] = String(newValue);
    }
    this.#queueRender();
  }

  render(state) {
    const { id, mode } = state;
    const colorLabel = "Color";
    let extra = "";
    if (mode === "stroke") {
      extra = `
      <fieldset>
        <label for="${id}-stroke">Stroke</label>
        <input class="layer-color-select" type="number" min="0" step="0.5" id="${id}-stroke" value="${state.stroke}">
      </fieldset>`;
    } else if (mode === "text") {
      extra = `
      <fieldset>
        <label for="${id}-size">Text size</label>
        <input class="layer-color-select" type="number" min="0.1" step="0.1" id="${id}-size" value="${state.size ?? 1}">
      </fieldset>
      <fieldset>
        <label for="${id}-font">Font</label>
        <select id="${id}-font">
          ${FONTS.map(([value, name]) => `<option value="${value}" ${value === state.font ? "selected" : ""}>${name}</option>`).join("")}
        </select>
      </fieldset>
      <fieldset>
        <label for="${id}-halo">Halo</label>
        <input type="checkbox" id="${id}-halo" ${state.halo !== false ? "checked" : ""}>
      </fieldset>`;
    }
    this.innerHTML = `
      <fieldset>
        <input type="checkbox" id="${id}-visible" ${state.visible ? "checked" : ""}>
        <label for="${id}-visible">${state.label}</label>
      </fieldset>
      ${extra}
      <fieldset>
        <label for="${id}-color" class="sr-only">${colorLabel}</label>
        <input class="layer-color-select" type="color" id="${id}-color" value="${state.color}">
      </fieldset>
    `;

    const bind = (suffix, event, read) => {
      this.querySelector(`#${id}-${suffix}`)?.addEventListener(event, (ev) => {
        this.state = { ...this.state, ...read(ev.target) };
        this.emitState(this.state);
      });
    };
    bind("stroke", "change", (t) => ({ stroke: Number(t.value) }));
    bind("size", "change", (t) => ({ size: Number(t.value) || 1 }));
    bind("font", "change", (t) => ({ font: t.value }));
    bind("halo", "change", (t) => ({ halo: t.checked }));
    bind("color", "input", (t) => ({ color: t.value }));
    bind("visible", "change", (t) => ({ visible: t.checked }));
  }

  emitState(state) {
    this.dispatchEvent(
      new CustomEvent("layer:change", {
        composed: true,
        bubbles: true,
        detail: state,
      }),
    );
  }
}
