import { updateOsmData } from '../utils/overpass.js';

/**
 * The only trigger for talking to Overpass. Fetching never happens
 * automatically (not on load, not on pan/click/search) — only when the user
 * explicitly asks for it here, to stay well clear of Overpass's rate limits.
 */
export class FetchDataControl extends HTMLElement {
  #button

  connectedCallback() {
    this.innerHTML = `<button id="btn-fetch-data">Fetch map data</button>`;
    this.#button = this.querySelector('#btn-fetch-data');
    this.#button.addEventListener('click', () => this.#fetch());
  }

  async #fetch() {
    this.#button.disabled = true;
    try {
      await updateOsmData();
    } finally {
      this.#button.disabled = false;
    }
  }
}
