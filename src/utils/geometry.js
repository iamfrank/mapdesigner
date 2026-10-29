import { toMercator } from './projection.js';

/**
 * Cached, pre-projected layer geometry + the fast renderer that draws it.
 *
 * Projecting lon/lat → Web Mercator (log/tan per vertex) is independent of
 * camera and paper, so it's done once per `ways` array and stored in flat
 * typed arrays along with a bounding box per way. Each draw then only does a
 * cheap affine mapping per vertex, and can:
 *   - cull ways whose bbox is outside the visible rect,
 *   - drop vertices closer than `tol` to the previously kept one (LOD),
 *   - collapse sub-pixel polygons into one batched path of rects.
 * With `view = null` and `tol = 0` nothing is culled or simplified, which is
 * what the exporter uses, so on-screen and exported output share one path.
 */

/**
 * @typedef {object} LayerGeometry
 * @property {number} count          Number of ways
 * @property {Float64Array} pts      Interleaved mercator x,y of all vertices
 * @property {Uint32Array} starts    count+1 vertex offsets into pts (in vertices)
 * @property {Float64Array} bounds   Per way: minX, minY, maxX, maxY (mercator)
 */

/** @type {WeakMap<object, LayerGeometry>} */
const cache = new WeakMap();

/**
 * Get (building on first use) the projected geometry for an array of ways.
 * Keyed on the array's identity, so a new fetch naturally invalidates it.
 * @param {[number,number][][]} ways  Polylines of [lon, lat]
 * @returns {LayerGeometry}
 */
export function getLayerGeometry(ways) {
  let geom = cache.get(ways);
  if (!geom) {
    geom = buildLayerGeometry(ways);
    cache.set(ways, geom);
  }
  return geom;
}

function buildLayerGeometry(ways) {
  const count = ways.length;
  let total = 0;
  for (const w of ways) total += w.length;

  const pts = new Float64Array(total * 2);
  const starts = new Uint32Array(count + 1);
  const bounds = new Float64Array(count * 4);

  let v = 0;
  for (let i = 0; i < count; i++) {
    const way = ways[i];
    starts[i] = v;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let j = 0; j < way.length; j++) {
      const [mx, my] = toMercator(way[j][0], way[j][1]);
      pts[2 * v] = mx;
      pts[2 * v + 1] = my;
      v++;
      if (mx < minX) minX = mx;
      if (mx > maxX) maxX = mx;
      if (my < minY) minY = my;
      if (my > maxY) maxY = my;
    }
    bounds.set([minX, minY, maxX, maxY], i * 4);
  }
  starts[count] = v;
  return { count, pts, starts, bounds };
}

/**
 * Draw a layer from cached geometry into print space.
 *
 * @param {CanvasRenderingContext2D} ctx  Transform already maps print px → device
 * @param {[number,number][][]} ways      Source ways (cache key)
 * @param {{ originX: number, originY: number, scale: number }} transform  mercator → print px
 * @param {{ color: string, stroke: number, mode?: 'fill'|'stroke' }} style
 * @param {object} [opts]
 * @param {{x0:number,y0:number,x1:number,y1:number}|null} [opts.view]  Visible rect in print px; null = no culling
 * @param {number} [opts.tol=0]  Simplification tolerance in print px (≈ 1 device px); 0 = exact
 */
export function renderLayerGeometry(ctx, ways, transform, style, { view = null, tol = 0 } = {}) {
  if (!ways || ways.length === 0) return;
  const geom = getLayerGeometry(ways);
  const fill = style.mode === 'fill';
  const { originX: ox, originY: oy, scale: sc } = transform;
  const { count, pts, starts, bounds } = geom;

  // Visible rect → mercator, padded so strokes/joins at the edge aren't clipped.
  let cull = false, vx0 = 0, vx1 = 0, vy0 = 0, vy1 = 0;
  if (view) {
    const pad = (fill ? 0 : style.stroke) + tol;
    cull = true;
    vx0 = ox + (view.x0 - pad) / sc;
    vx1 = ox + (view.x1 + pad) / sc;
    vy1 = oy - (view.y0 - pad) / sc; // print y grows downward, mercator y upward
    vy0 = oy - (view.y1 + pad) / sc;
  }

  // Extents (mercator) below which a way is sub-pixel.
  const tinyM = tol / sc;
  const skipM = tinyM * 0.5;

  if (fill) ctx.fillStyle = style.color;
  else {
    ctx.strokeStyle = style.color;
    ctx.lineWidth = style.stroke;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
  }

  // Strokes: whole layer in one path. Fills: one fill per polygon (rings may
  // overlap with opposite winding, so they can't share a nonzero path), plus
  // a single batched Path2D for sub-pixel polygons.
  if (!fill) ctx.beginPath();
  const tinyPath = fill && tol > 0 ? new Path2D() : null;
  let tinyCount = 0;

  for (let i = 0; i < count; i++) {
    const b = i * 4;
    if (cull && (bounds[b + 2] < vx0 || bounds[b] > vx1 || bounds[b + 3] < vy0 || bounds[b + 1] > vy1)) continue;

    const s0 = starts[i], s1 = starts[i + 1];
    if (s1 - s0 < (fill ? 3 : 2)) continue;

    if (tol > 0) {
      const ew = bounds[b + 2] - bounds[b], eh = bounds[b + 3] - bounds[b + 1];
      if (fill) {
        if (ew < tinyM && eh < tinyM) {
          // Sub-pixel polygon: keep its tonal contribution via a cheap rect.
          tinyPath.rect((bounds[b] - ox) * sc, (oy - bounds[b + 3]) * sc, ew * sc, eh * sc);
          tinyCount++;
          continue;
        }
      } else if (ew < skipM && eh < skipM) {
        continue;
      }
    }

    if (fill) ctx.beginPath();
    let px = (pts[2 * s0] - ox) * sc;
    let py = (oy - pts[2 * s0 + 1]) * sc;
    ctx.moveTo(px, py);
    let lx = px, ly = py;
    const last = s1 - 1;
    for (let j = s0 + 1; j <= last; j++) {
      px = (pts[2 * j] - ox) * sc;
      py = (oy - pts[2 * j + 1]) * sc;
      if (tol > 0 && j < last && Math.abs(px - lx) < tol && Math.abs(py - ly) < tol) continue;
      ctx.lineTo(px, py);
      lx = px; ly = py;
    }
    if (fill) {
      ctx.closePath();
      ctx.fill();
    }
  }

  if (!fill) ctx.stroke();
  else if (tinyCount) ctx.fill(tinyPath);
}
