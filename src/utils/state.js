import { createStore } from "./store.js";
import { computePrintPx } from "./paper.js";

/** Detail canvas — fixed pixel size, always 1 : √2 portrait ratio */
export const DETAIL_W = 300;
export const DETAIL_H = 424;

export const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

const DEFAULT_CENTER = [12, 55.5]; // [lon, lat]
const DEFAULT_ZOOM = 12;
const DEFAULT_DISTANCE_M = 9000; // half-height radius, metres
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
  center: DEFAULT_CENTER,
  bbox: null,
  zoom: DEFAULT_ZOOM,
  osmData: null,

  // Print/paper configuration
  paperSizeId: DEFAULT_PAPER_SIZE,
  customWidthMM: 420,
  customHeightMM: 594,
  dpi: DEFAULT_DPI,

  // Map extent configuration
  distanceM: DEFAULT_DISTANCE_M,

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
    { id: "streets", label: "Streets", color: "#aa0000", stroke: 1, mode: "stroke", visible: true },
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

export default state;
