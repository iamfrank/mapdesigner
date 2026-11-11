/**
 * Small, CSS-only loading spinner.
 *
 *   <loading-spinner></loading-spinner>
 *   <loading-spinner size="2rem" label="Fetching map data"></loading-spinner>
 *
 * Attributes:
 * - `size`  Any CSS length (default `1em`, so it scales with surrounding text)
 * - `label` Accessible name (default "Loading")
 *
 * Styles live in style.css (`loading-spinner`); colour follows `currentColor`.
 */
export class LoadingSpinner extends HTMLElement {
  static observedAttributes = ['size', 'label'];

  connectedCallback() {
    this.#update();
  }

  attributeChangedCallback() {
    this.#update();
  }

  #update() {
    this.setAttribute('role', 'img');
    this.setAttribute('aria-label', this.getAttribute('label') || 'Loading');
    const size = this.getAttribute('size');
    if (size) this.style.setProperty('--spinner-size', size);
    else this.style.removeProperty('--spinner-size');
  }
}
