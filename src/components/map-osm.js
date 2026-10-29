import Map from 'ol/Map.js';
import View from 'ol/View.js';
import TileLayer from 'ol/layer/Tile.js';
import OSM  from 'ol/source/OSM.js';
import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import Feature from 'ol/Feature.js';
import Polygon from 'ol/geom/Polygon.js';
import {Style, Stroke, Fill} from 'ol/style.js';
import {useGeographic} from 'ol/proj';
import state from '../utils/state.js'
import { resolvePaperMM } from '../utils/paper.js'
import { fitBboxToAspect } from '../utils/projection.js'

/**
 * Nav map used to frame the poster area. The poster's bbox is the largest
 * box with the paper's aspect ratio that fits inside the nav view, centred on
 * it (outlined on the map). That's what gets fetched *and* rendered, so the
 * poster is always fully covered by data whatever the nav map's shape. The
 * view's centre/zoom/bbox are kept in sync with state on every pan/zoom or
 * paper change, so "Fetch map data" always uses the outlined area. Ways to
 * move the view:
 *  - click anywhere on the map
 *  - pan/zoom freely
 *  - `flyTo(lon, lat)`, called externally (e.g. by <location-search>)
 */
export class OsmMap extends HTMLElement {

  /** @type {import('ol').Map | null} */
  map = null;

  /** @type {import('ol/View').default | null} */
  view = null;

  /** @type {HTMLDivElement | null} */
  container = null;

  #frame = new Feature();
  #frameLayer = new VectorLayer({
    source: new VectorSource({ features: [this.#frame] }),
    style: new Style({
      stroke: new Stroke({ color: 'orange', width: 2 }),
      fill: new Fill({ color: 'rgba(255, 165, 0, 0.08)' }),
    }),
  });
  #unsubscribers = [];

  connectedCallback() {
    this.container = document.createElement('div');
    this.container.className = 'map-container';
    this.appendChild(this.container);

    // Force use of WGS84 (lon/lat) coordinates everywhere in OL.
    useGeographic();

    this.view = new View({
      center: state.get('center'),
      zoom: state.get('zoom'),
    });

    this.map = new Map({
      target: this.container,
      view: this.view,
      layers: [new TileLayer({ source: new OSM() }), this.#frameLayer],
    });

    this.map.on('singleclick', (ev) => this.#commit(ev.coordinate));

    // Keep state's center/zoom/bbox in sync with the view on every pan/zoom,
    // so a fetch always reflects whatever the map is currently showing.
    this.map.on('moveend', () => this.#commit());

    // The map container can start out with zero size (e.g. while nested in a
    // collapsed popover panel) or be resized later when it's revealed. Keep
    // OL's internal render size in sync whenever the container's actual size
    // changes, so the map is always fully (re)rendered once it becomes visible.
    this.resizeObserver = new ResizeObserver(() => {
      this.map.updateSize();
      this.#commit(undefined, false);
    });
    this.resizeObserver.observe(this.container);

    // The poster's aspect ratio follows the paper, so its bbox must too.
    this.#unsubscribers.push(
      ...['paperSizeId', 'customWidthMM', 'customHeightMM'].map((prop) =>
        state.subscribe(prop, () => this.#commit(undefined, false))),
    );
  }

  disconnectedCallback() {
    this.resizeObserver?.disconnect();
    this.#unsubscribers.forEach((unsubscribe) => unsubscribe());
    this.#unsubscribers = [];
  }

  /** Pan/zoom the nav map to a location and commit it immediately. */
  flyTo(lon, lat, zoom = 13) {
    this.view.setCenter([lon, lat]);
    this.view.setZoom(zoom);
    this.#commit([lon, lat]);
  }

  /**
   * Commit a location as the poster centre: recentre the view (if a target
   * was given), then derive the poster bbox (paper aspect, inside the view).
   * @param {[number, number]} [center]  Optional [lon, lat] to recentre on first
   * @param {boolean} [announce=true]  Report the new centre in the status line
   */
  #commit(center, announce = true) {
    if (center) this.view.setCenter(center);
    const size = this.map.getSize();
    if (!size || !size[0] || !size[1]) return;

    const [lon, lat] = this.view.getCenter();
    const extent = this.view.calculateExtent(size);
    const viewBbox = [extent[1], extent[0], extent[3], extent[2]]; // [minLat, minLon, maxLat, maxLon]

    const { wMM, hMM } = resolvePaperMM({
      paperSizeId: state.get('paperSizeId'),
      customWidthMM: state.get('customWidthMM'),
      customHeightMM: state.get('customHeightMM'),
    });
    const bbox = wMM > 0 && hMM > 0 ? fitBboxToAspect(viewBbox, wMM / hMM) : viewBbox;

    const [minLat, minLon, maxLat, maxLon] = bbox;
    this.#frame.setGeometry(new Polygon([[
      [minLon, minLat], [maxLon, minLat], [maxLon, maxLat], [minLon, maxLat], [minLon, minLat],
    ]]));

    const next = { center: [lon, lat], zoom: this.view.getZoom(), bbox };
    if (announce) {
      next.statusText = `Map centre \u2192 lon\u00a0${lon.toFixed(4)},\u00a0lat\u00a0${lat.toFixed(4)}`;
    }
    state.update(next);
  }
}
