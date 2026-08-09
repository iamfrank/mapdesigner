export class LayerStyleControl extends HTMLElement {
  static observedAttributes = ["id", "label", "color", "stroke", "visible"];

  state = {
    id: "",
    label: "",
    color: "",
    stroke: 0,
    visible: false,
  };

  constructor() {
    super();
  }

  connectedCallback() {
    this.render(this.state);
  }

  attributeChangedCallback(name, oldValue, newValue) {
    switch (name) {
      case "id":
        this.state.id = String(newValue);
        break;
      case "label":
        this.state.label = String(newValue);
        break;
      case "color":
        this.state.color = String(newValue);
        break;
      case "stroke":
        this.state.stroke = Number(newValue);
        break;
      case "visible":
        this.state.visible = Boolean(newValue);
        break;
      default:
      // Nothing
    }
    this.render(this.state);
  }

  render(state) {
    this.innerHTML = `
      <input type="checkbox" id="${state.id}-visible" ${state.visible ? "checked" : ""}>
      <label for="${state.id}-visible">${state.label}</label>
      <label for="${state.id}-color">Stroke color</label>
      <input class="layer-color-select" type="color" id="${state.id}-color" value="${state.color}">
      <label for="${state.id}-stroke">Stroke width</label>
      <input class="layer-color-select" type="number" id="${state.id}-stroke" value="${state.stroke}">
    `;
    this.querySelector(`#${state.id}-stroke`).addEventListener(
      "change",
      (ev) => {
        this.state.stroke = Number(ev.target.value);
        this.emitState(this.state);
      },
    );
    this.querySelector(`#${state.id}-color`).addEventListener(
      "change",
      (ev) => {
        this.state.color = ev.target.value;
        this.emitState(this.state);
      },
    );
    this.querySelector(`#${state.id}-visible`).addEventListener(
      "change",
      (ev) => {
        this.state.visible = ev.target.checked;
        this.emitState(this.state);
      },
    );
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
