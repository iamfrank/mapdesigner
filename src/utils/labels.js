import { toMercator, toCanvas } from './projection.js';

/**
 * Place-name label layout + drawing.
 *
 * Font sizes are a fraction of the page's shorter side, so labels look the
 * same at any paper size/DPI. Layout happens in print space and doesn't depend
 * on the camera, so the preview and the export place labels identically.
 */

/** Per `place=*` value: font size (fraction of the page's short side), priority (low first), typography. */
export const PLACE_LABEL_STYLES = {
  city: { size: 0.024, rank: 0, bold: true },
  town: { size: 0.017, rank: 1, bold: true },
  island: { size: 0.013, rank: 2, italic: true },
  suburb: { size: 0.011, rank: 3, upper: true },
  village: { size: 0.011, rank: 4 },
  quarter: { size: 0.009, rank: 5, upper: true },
  islet: { size: 0.009, rank: 6, italic: true },
  hamlet: { size: 0.008, rank: 7 },
  neighbourhood: { size: 0.008, rank: 8, upper: true },
  locality: { size: 0.007, rank: 9, italic: true },
};

/** Single-entry memo per places array (layout only changes with the inputs). */
const layoutCache = new WeakMap();

/**
 * Compute non-overlapping label positions, most important places first.
 * Labels that would overlap an already placed one, or stick out of the page,
 * are dropped.
 *
 * @param {CanvasRenderingContext2D} ctx  Used for text measurement only
 * @param {{ coord: [number,number], name: string, place: string, population?: number }[]} places
 * @param {{ originX: number, originY: number, scale: number }} transform  mercator → print px
 * @param {{ width: number, height: number, size?: number, font?: string }} opts
 * @returns {{ text: string, x: number, y: number, font: string, spacing: number, fontSize: number, box: number[] }[]}
 */
export function layoutPlaceLabels(ctx, places, transform, { width, height, size = 1, font = 'serif' }) {
  if (!places || places.length === 0) return [];
  const key = `${transform.originX},${transform.originY},${transform.scale},${width},${height},${size},${font}`;
  const cached = layoutCache.get(places);
  if (cached?.key === key) return cached.labels;

  const unit = Math.min(width, height) * size;
  const sorted = places
    .filter((p) => PLACE_LABEL_STYLES[p.place])
    .sort((a, b) => PLACE_LABEL_STYLES[a.place].rank - PLACE_LABEL_STYLES[b.place].rank
      || (b.population ?? 0) - (a.population ?? 0));

  // Placed boxes bucketed in a uniform grid, so overlap tests stay local.
  const cell = Math.max(1, unit * 0.05);
  const grid = new Map();
  const cellKeys = ([x0, y0, x1, y1]) => {
    const keys = [];
    for (let cx = Math.floor(x0 / cell); cx <= Math.floor(x1 / cell); cx++) {
      for (let cy = Math.floor(y0 / cell); cy <= Math.floor(y1 / cell); cy++) keys.push(`${cx},${cy}`);
    }
    return keys;
  };
  const hits = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];

  const labels = [];
  let current = '';
  ctx.save();
  for (const p of sorted) {
    const st = PLACE_LABEL_STYLES[p.place];
    const [x, y] = toCanvas(...toMercator(p.coord[0], p.coord[1]), transform);
    if (x < 0 || y < 0 || x > width || y > height) continue;

    const fontSize = Math.max(1, unit * st.size);
    const fontStr = `${st.italic ? 'italic ' : ''}${st.bold ? 'bold ' : ''}${fontSize}px ${font}`;
    const text = st.upper ? p.name.toUpperCase() : p.name;
    const spacing = st.upper ? fontSize * 0.15 : 0;
    if (fontStr !== current) ctx.font = current = fontStr;
    const w = ctx.measureText(text).width + spacing * text.length;
    const pad = fontSize * 0.3;
    const box = [x - w / 2 - pad, y - fontSize / 2 - pad, x + w / 2 + pad, y + fontSize / 2 + pad];
    if (box[0] < 0 || box[1] < 0 || box[2] > width || box[3] > height) continue;
    const keys = cellKeys(box);
    if (keys.some((k) => grid.get(k)?.some((o) => hits(box, o)))) continue;
    for (const k of keys) grid.has(k) ? grid.get(k).push(box) : grid.set(k, [box]);
    labels.push({ text, x, y, font: fontStr, spacing, fontSize, box });
  }
  ctx.restore();

  layoutCache.set(places, { key, labels });
  return labels;
}

/**
 * Draw place-name labels, with an optional halo in `haloColor` for legibility.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object[]} places
 * @param {{ originX: number, originY: number, scale: number }} transform
 * @param {{ color: string, size?: number, font?: string, halo?: boolean }} style
 * @param {{ width: number, height: number, haloColor: string, view?: {x0:number,y0:number,x1:number,y1:number}|null }} opts
 */
export function renderPlaceLabels(ctx, places, transform, style, { width, height, haloColor, view = null }) {
  const labels = layoutPlaceLabels(ctx, places, transform, { width, height, size: style.size, font: style.font });
  if (labels.length === 0) return;

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.fillStyle = style.color;
  ctx.strokeStyle = haloColor;
  ctx.letterSpacing = '0px';
  let font = '', spacing = 0;
  for (const l of labels) {
    const b = l.box;
    if (view && (b[2] < view.x0 || b[0] > view.x1 || b[3] < view.y0 || b[1] > view.y1)) continue;
    // Labels come sorted by place type, so font changes are rare: only set
    // context state when it differs (font assignment re-parses the string).
    if (l.font !== font) ctx.font = font = l.font;
    if (l.spacing !== spacing) ctx.letterSpacing = `${spacing = l.spacing}px`;
    if (style.halo !== false) {
      ctx.lineWidth = l.fontSize * 0.2;
      ctx.strokeText(l.text, l.x, l.y);
    }
    ctx.fillText(l.text, l.x, l.y);
  }
  ctx.restore();
}
