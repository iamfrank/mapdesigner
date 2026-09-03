import state from '../utils/state.js';
import { geocodeSearch } from '../utils/geocode.js';

/**
 * Lets the user set the poster centre either by free-text place search
 * (Nominatim) or by typing exact latitude/longitude coordinates.
 */
export class LocationPicker extends HTMLElement {
  #resultsEl
  #searchInput
  #latInput
  #lonInput

  connectedCallback() {
    this.render();
  }

  render() {
    const [lon, lat] = state.get('center');
    this.innerHTML = `
      <form class="location-search-form">
        <label for="location-query">Search place / address</label>
        <input type="text" id="location-query" placeholder="e.g. Roskilde, Denmark" autocomplete="off">
        <button type="submit">Search</button>
        <ul class="location-search-results"></ul>
      </form>
      <form class="location-coord-form">
        <label for="location-lat">Latitude</label>
        <input type="number" id="location-lat" step="any" min="-90" max="90" value="${lat}">
        <label for="location-lon">Longitude</label>
        <input type="number" id="location-lon" step="any" min="-180" max="180" value="${lon}">
        <button type="submit">Go to coordinates</button>
      </form>
    `;

    this.#searchInput = this.querySelector('#location-query');
    this.#resultsEl = this.querySelector('.location-search-results');
    this.#latInput = this.querySelector('#location-lat');
    this.#lonInput = this.querySelector('#location-lon');

    this.querySelector('.location-search-form').addEventListener('submit', (ev) => {
      ev.preventDefault();
      this.#doSearch();
    });

    this.querySelector('.location-coord-form').addEventListener('submit', (ev) => {
      ev.preventDefault();
      this.#goToCoords();
    });

    state.subscribe('center', ([newLon, newLat]) => {
      this.#latInput.value = newLat;
      this.#lonInput.value = newLon;
    });
  }

  async #doSearch() {
    const query = this.#searchInput.value.trim();
    if (!query) return;

    this.#resultsEl.innerHTML = '<li class="location-search-status">Searching…</li>';
    state.set('statusText', `Searching for "${query}"…`);

    try {
      const results = await geocodeSearch(query);
      if (results.length === 0) {
        this.#resultsEl.innerHTML = '<li class="location-search-status">No results found.</li>';
        return;
      }
      this.#resultsEl.innerHTML = results
        .map((r, i) => `<li><button type="button" data-index="${i}">${r.label}</button></li>`)
        .join('');

      this.#resultsEl.querySelectorAll('button').forEach((btn) => {
        btn.addEventListener('click', () => {
          const r = results[Number(btn.dataset.index)];
          state.update({
            center: [r.lon, r.lat],
            statusText: `Centre set to "${r.label}"`,
          });
          this.#resultsEl.innerHTML = '';
        });
      });
    } catch (err) {
      this.#resultsEl.innerHTML = `<li class="location-search-status">Error: ${err.message}</li>`;
      state.set('statusText', `Geocoding error: ${err.message}`);
    }
  }

  #goToCoords() {
    const lat = Number(this.#latInput.value);
    const lon = Number(this.#lonInput.value);
    if (Number.isNaN(lat) || Number.isNaN(lon)) return;
    state.update({
      center: [lon, lat],
      statusText: `Centre set to lon\u00a0${lon.toFixed(4)},\u00a0lat\u00a0${lat.toFixed(4)}`,
    });
  }
}
