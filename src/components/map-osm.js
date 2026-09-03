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
    this.button.innerText = 'Use map centre'
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

    // Explicit button: use the current view centre (after panning/zooming)
    this.button.addEventListener('click', (e) => {
      this.#setCenterFromView()
    })

    // Click anywhere on the map to pick that point as the poster centre.
    this.map.on('singleclick', (ev) => {
      const [lon, lat] = ev.coordinate;
      state.update({
        center: [lon, lat],
        statusText: `Centre set from map click → lon\u00a0${lon.toFixed(4)},\u00a0lat\u00a0${lat.toFixed(4)}`,
      })
    })

    // Keep the OL view in sync if the centre changes from elsewhere (search,
    // manual lat/lon entry) without feeding back into an infinite loop.
    this.#unsubscribeCenter = state.subscribe('center', ([lon, lat]) => {
      const current = this.view.getCenter();
      if (current && current[0] === lon && current[1] === lat) return;
      this.view.animate({ center: [lon, lat], duration: 250 });
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
    this.#unsubscribeCenter?.();
  }

  #unsubscribeCenter = null;

  #setCenterFromView() {
    const [lon, lat] = toLonLat(this.view.getCenter());
    const zoom = this.view.getZoom();
    state.update({
      center: [lon, lat],
      zoom,
      statusText: `Map centre → lon\u00a0${lon.toFixed(4)},\u00a0lat\u00a0${lat.toFixed(4)},\u00a0zoom\u00a0${zoom.toFixed(1)}`
    })
  }
}
