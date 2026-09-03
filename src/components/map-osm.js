import Map from 'ol/Map.js';
import View from 'ol/View.js';
import TileLayer from 'ol/layer/Tile.js';
import OSM  from 'ol/source/OSM.js';
import {useGeographic} from 'ol/proj';
import state from '../utils/state.js'

/**
 * Nav map used to frame the poster area. Its current view extent *is* the
 * bbox that gets fetched/rendered — there's no separate "distance" or
 * aspect-ratio math involved. Three ways to commit a location:
 *  - click anywhere on the map
 *  - pan/zoom, then click "Use this view"
 *  - `flyTo(lon, lat)`, called externally (e.g. by <location-search>)
 */
export class OsmMap extends HTMLElement {

  /** @type {import('ol').Map | null} */
  map = null;

  /** @type {import('ol/View').default | null} */
  view = null;

  /** @type {HTMLDivElement | null} */
  container = null;
  button = null;

  connectedCallback() {
    this.container = document.createElement('div');
    this.container.className = 'map-container';
    this.appendChild(this.container);

    this.button = document.createElement('button');
    this.button.className = 'map-set-view-button';
    this.button.innerText = 'Use this view';
    this.appendChild(this.button);

    // Force use of WGS84 (lon/lat) coordinates everywhere in OL.
    useGeographic();

    this.view = new View({
      center: state.get('center'),
      zoom: state.get('zoom'),
    });

    this.map = new Map({
      target: this.container,
      view: this.view,
      layers: [new TileLayer({ source: new OSM() })],
    });

    this.button.addEventListener('click', () => this.#commit());

    this.map.on('singleclick', (ev) => this.#commit(ev.coordinate));

    // The map container can start out with zero size (e.g. while nested in a
    // collapsed popover panel) or be resized later when it's revealed. Keep
    // OL's internal render size in sync whenever the container's actual size
    // changes, so the map is always fully (re)rendered once it becomes visible.
    this.resizeObserver = new ResizeObserver(() => this.map.updateSize());
    this.resizeObserver.observe(this.container);
  }

  disconnectedCallback() {
    this.resizeObserver?.disconnect();
  }

  /** Pan/zoom the nav map to a location and commit it immediately. */
  flyTo(lon, lat, zoom = 13) {
    this.view.setCenter([lon, lat]);
    this.view.setZoom(zoom);
    this.#commit([lon, lat]);
  }

  /**
   * Commit a location as the poster centre: recentre the view (if a target
   * was given), then use the view's current extent as the fetch/render bbox.
   * @param {[number, number]} [center]  Optional [lon, lat] to recentre on first
   */
  #commit(center) {
    if (center) this.view.setCenter(center);

    const [lon, lat] = this.view.getCenter();
    const extent = this.view.calculateExtent(this.map.getSize());
    const bbox = [extent[1], extent[0], extent[3], extent[2]]; // [minLat, minLon, maxLat, maxLon]

    state.update({
      center: [lon, lat],
      zoom: this.view.getZoom(),
      bbox,
      statusText: `Map centre \u2192 lon\u00a0${lon.toFixed(4)},\u00a0lat\u00a0${lat.toFixed(4)}`,
    });
  }
}
