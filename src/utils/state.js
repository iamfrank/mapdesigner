import { createStore } from "./store.js";

/** Detail canvas — fixed size (1 : √2 portrait ratio) */
export const DETAIL_W = 300;
export const DETAIL_H = 424;
/** Full A0 print dimensions at 300 DPI */
export const PRINT_W = 9933;
export const PRINT_H = 14043;

export const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

const DEFAULT_CENTER = [12, 55.5] // XY-type coordinate
const DEFAULT_ZOOM = 12

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
  styles: [
    {
      id: "streets",
      label: "Streets",
      color: "#aa0000",
      stroke: 1,
      visible: true,
    },
    {
      id: "coastlines",
      label: "Coastlines",
      color: "#0000aa",
      stroke: 1,
      visible: true,
    },
  ],
  statusText: ''
});

export default state;
