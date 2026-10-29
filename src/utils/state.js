import { createStore } from "./store.js";
import { computePrintPx } from "./paper.js";

export const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

const DEFAULT_CENTER = [12, 55.5]; // [lon, lat]
const DEFAULT_ZOOM = 12;
// Roughly matches the default centre/zoom above, so the app has something to
// show before the user has interacted with the nav map at all.
const DEFAULT_BBOX = [55.4192, 11.899, 55.5808, 12.101]; // [minLat, minLon, maxLat, maxLon]
const DEFAULT_PAPER_SIZE = "A0";
const DEFAULT_DPI = 300;

/**
 * App-wide state.
 *
 * Read:
 * `state.get('prop')`
 *
 * Write:
 * `state.set('prop', value)` or
 * `state.update({ ...partial })`
 *
 * React to changes:
 * `state.subscribe('prop', (value, prev) => ...)`
 */
const state = createStore({
  // Poster centre + geographic extent. Both are set together whenever the
  // nav map's view changes — by clicking, panning/zooming, or searching — so
  // they're always in sync with what's fetched and rendered.
  center: DEFAULT_CENTER,
  zoom: DEFAULT_ZOOM,
  bbox: DEFAULT_BBOX,
  osmData: null,

  // Print/paper configuration
  paperSizeId: DEFAULT_PAPER_SIZE,
  customWidthMM: 420,
  customHeightMM: 594,
  dpi: DEFAULT_DPI,

  // Poster text
  title: "",
  subtitle: "",
  autoSubtitle: true,
  showTitleBlock: true,

  styles: [
    { id: "water", label: "Water", color: "#a5c9e8", stroke: 1, mode: "fill", visible: true },
    { id: "parks", label: "Parks & green", color: "#bfe0b8", stroke: 1, mode: "fill", visible: true },
    { id: "buildings", label: "Buildings", color: "#d8d3c9", stroke: 1, mode: "fill", visible: true },
    { id: "coastlines", label: "Coastlines", color: "#0000aa", stroke: 1, mode: "stroke", visible: true },
    { id: "railways", label: "Railways", color: "#555555", stroke: 1, mode: "stroke", visible: true },
    { id: "streets", label: "Streets", color: "#888888", stroke: 1, mode: "stroke", visible: true },
    { id: "paths", label: "Foot & cycle paths", color: "#c9a876", stroke: 1, mode: "stroke", visible: true },
  ],
  statusText: "",
});

/** Current print canvas pixel dimensions, derived from paper size + DPI. */
export function getPrintPx() {
  return computePrintPx({
    paperSizeId: state.get("paperSizeId"),
    customWidthMM: state.get("customWidthMM"),
    customHeightMM: state.get("customHeightMM"),
    dpi: state.get("dpi"),
  });
}

/** Title/subtitle to draw on the poster, or null when the block is hidden. */
export function getTitleBlock() {
  if (!state.get("showTitleBlock")) return null;
  const subtitle = state.get("autoSubtitle")
    ? formatCoords(state.get("center"))
    : state.get("subtitle");
  return { title: state.get("title"), subtitle };
}

function formatCoords([lon, lat]) {
  const latLabel = `${Math.abs(lat).toFixed(4)}°${lat >= 0 ? "N" : "S"}`;
  const lonLabel = `${Math.abs(lon).toFixed(4)}°${lon >= 0 ? "E" : "W"}`;
  return `${latLabel} / ${lonLabel}`;
}

export default state;
