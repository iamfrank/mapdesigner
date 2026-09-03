import state from '../utils/state.js';
import { geocodeSearch } from '../utils/geocode.js';

const COORD_PATTERN = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/;

/**
 * Single search box for setting the poster location: type a place name to
 * geocode it (via Nominatim), or "lat, lon" to jump straight there. Either
 * way, the top match is used and the nav map (<map-osm>) is flown to it.
 */
export class LocationSearch extends HTMLElement {
  #input

  connectedCallback() {
    this.innerHTML = `
      <form class="location-search-form">
        <label for="location-query">Location</label>
        <input type="text" id="location-query" placeholder="Place name, or &quot;lat, lon&quot;" autocomplete="off">
        <button type="submit">Go</button>
      </form>
    `;

    this.#input = this.querySelector('#location-query');
    this.querySelector('form').addEventListener('submit', (ev) => {
      ev.preventDefault();
      this.#go();
    });
  }

  async #go() {
    const query = this.#input.value.trim();
    if (!query) return;

    const asCoords = query.match(COORD_PATTERN);
    if (asCoords) {
      const [, lat, lon] = asCoords;
      this.#flyTo(Number(lon), Number(lat), `${lat}, ${lon}`);
      return;
    }

    state.set('statusText', `Searching for "${query}"…`);
    try {
      const [result] = await geocodeSearch(query);
      if (!result) {
        state.set('statusText', `No results found for "${query}".`);
        return;
      }
      this.#flyTo(result.lon, result.lat, result.label);
    } catch (err) {
      state.set('statusText', `Geocoding error: ${err.message}`);
    }
  }

  #flyTo(lon, lat, label) {
    document.querySelector('map-osm')?.flyTo(lon, lat);
    state.set('statusText', `Centre set to ${label}`);
  }
}
