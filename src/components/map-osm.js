import Map from 'ol/Map.js';
import View from 'ol/View.js';
import TileLayer from 'ol/layer/Tile.js';
import OSM  from 'ol/source/OSM.js';
import {useGeographic, toLonLat} from 'ol/proj';
import state from '../utils/state.js'

export class OsmMap extends HTMLElement {

  /** @type {import('ol').Map | null} */
  map = null;

  /** @type {import('ol/View').default | null} */
  view = null;

  /** @type {HTMLDivElement | null} */
  container = null;
  button = null;

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  connectedCallback() {

    // Build the inner container OL will target
    this.container = document.createElement('div');
    this.container.className = 'map-container';
    this.appendChild(this.container);

    // Build a button to dispatch new view
    this.button = document.createElement('button')
    this.button.className = 'map-set-view-button';
    this.button.innerText = 'Update'
    this.appendChild(this.button);

    const center = state.get('center');
    const zoom = state.get('zoom');

    // Force use of WGS84 projection
    useGeographic()

    this.view = new View({
      center: center,
      zoom: zoom,
    })

    this.map = new Map({
      target: this.container,
      view: this.view,
      layers: [
        new TileLayer({
          source: new OSM(),
        }),
      ],
    });

    // `moveend` fires once per interaction (pan, zoom, keyboard, double-click…)
    this.button.addEventListener('click', (e) => {
      this.#setNewView()
    })

    // The map container can start out with zero size (e.g. while nested in a
    // collapsed <toggle-panel>) or be resized later when it's revealed. Keep
    // OL's internal render size in sync whenever the container's actual size
    // changes, so the map is always fully (re)rendered once it becomes visible.
    this.resizeObserver = new ResizeObserver(() => this.map.updateSize());
    this.resizeObserver.observe(this.container);
  }

  disconnectedCallback() {
    this.resizeObserver?.disconnect();
  }

  #setNewView() {
    const [lon, lat] = toLonLat(this.view.getCenter());
    const zoom = this.view.getZoom();
    const bbox = this.map.getView().calculateExtent(this.map.getSize())
    const overpassReadyBBOX = [bbox[1],bbox[0],bbox[3],bbox[2]]
    state.update({
      center: [lon, lat],
      zoom,
      bbox: overpassReadyBBOX,
      statusText: `Map moved → lon\u00a0${lon.toFixed(4)},\u00a0lat\u00a0${lat.toFixed(4)},\u00a0zoom\u00a0${zoom.toFixed(1)}`
    })
  }
}
