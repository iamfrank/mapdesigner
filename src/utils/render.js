import { toMercator, toCanvas } from './projection.js';

/**
 * Clear a canvas and fill it with white.
 * @param {CanvasRenderingContext2D} ctx
 */
export function clearCanvas(ctx) {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}

/**
 * Chain coastline ways end-to-end into longer polylines/rings by matching
 * shared endpoint coordinates. OSM often splits a single coastline into many
 * ways; merging them first gives cleaner results when closing them off
 * against the canvas edge below.
 * @param {[number,number][][]} ways  Each way is an array of [lon,lat] pairs
 * @returns {[number,number][][]} Chained polylines/rings, still in [lon,lat]
 */
function chainCoastlines(ways) {
  const closeEnough = (a, b, eps = 1e-7) =>
    Math.abs(a[0] - b[0]) < eps && Math.abs(a[1] - b[1]) < eps;

  const remaining = ways.filter((w) => w.length > 1).map((w) => w.slice());
  const chains = [];

  while (remaining.length) {
    let chain = remaining.shift();
    let extended = true;
    while (extended) {
      extended = false;
      // A closed ring doesn't need (and shouldn't get) further chaining.
      if (closeEnough(chain[0], chain[chain.length - 1])) break;
      for (let i = 0; i < remaining.length; i++) {
        const w = remaining[i];
        if (closeEnough(chain[chain.length - 1], w[0])) {
          chain = chain.concat(w.slice(1));
        } else if (closeEnough(chain[chain.length - 1], w[w.length - 1])) {
          chain = chain.concat(w.slice(0, -1).reverse());
        } else if (closeEnough(chain[0], w[w.length - 1])) {
          chain = w.slice(0, -1).concat(chain);
        } else if (closeEnough(chain[0], w[0])) {
          chain = w.slice(1).reverse().concat(chain);
        } else {
          continue;
        }
        remaining.splice(i, 1);
        extended = true;
        break;
      }
    }
    chains.push(chain);
  }

  return chains;
}

/**
 * Clip a segment (canvas space) against the [0,w] x [0,h] rectangle using
 * Liang–Barsky, returning the [tEntry, tExit] portion of the segment (as
 * parameters along A→B) that lies inside the rectangle, or null if none of
 * it does.
 */
function liangBarsky(ax, ay, bx, by, w, h) {
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dy = by - ay;
  const p = [-dx, dx, -dy, dy];
  const q = [ax, w - ax, ay, h - ay];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return null;
    } else {
      const r = q[i] / p[i];
      if (p[i] < 0) {
        if (r > t1) return null;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return null;
        if (r < t1) t1 = r;
      }
    }
  }
  return [t0, t1];
}

/** Trim an open canvas-space polyline down to the portion that overlaps the
 * [0,w] x [0,h] canvas, inserting exact boundary-crossing points at the ends
 * (assumes the polyline crosses the boundary at most once on each side —
 * a reasonable simplification for coastline segments spanning one view). */
function clipChainToBox(points, w, h) {
  const inside = ([x, y]) => x >= 0 && x <= w && y >= 0 && y <= h;
  let run = null;

  for (let i = 0; i < points.length - 1; i++) {
    const A = points[i], B = points[i + 1];
    const aIn = inside(A), bIn = inside(B);

    if (aIn && bIn) {
      if (!run) run = [A];
      run.push(B);
    } else if (aIn && !bIn) {
      if (!run) run = [A];
      const t = liangBarsky(A[0], A[1], B[0], B[1], w, h);
      if (t) run.push([A[0] + t[1] * (B[0] - A[0]), A[1] + t[1] * (B[1] - A[1])]);
      return run;
    } else if (!aIn && bIn) {
      const t = liangBarsky(A[0], A[1], B[0], B[1], w, h);
      if (t) run = [[A[0] + t[0] * (B[0] - A[0]), A[1] + t[0] * (B[1] - A[1])], B];
    }
  }
  return run;
}

/** Which point on the [0,w] x [0,h] boundary a (near-)boundary point maps to,
 * expressed as a distance clockwise from the top-left corner. Points not
 * exactly on the boundary are snapped to the nearest edge. */
function edgeParam([x, y], w, h) {
  const clampedX = Math.min(Math.max(x, 0), w);
  const clampedY = Math.min(Math.max(y, 0), h);
  const dTop = y, dBottom = h - y, dLeft = x, dRight = w - x;
  const m = Math.min(dTop, dBottom, dLeft, dRight);
  if (m === dTop) return clampedX;
  if (m === dRight) return w + clampedY;
  if (m === dBottom) return w + h + (w - clampedX);
  return w + h + w + (h - clampedY);
}

/** Points (in clockwise boundary order) to insert while walking clockwise
 * around the [0,w] x [0,h] box from `from` to `to`. */
function boxWalk(from, to, w, h) {
  const perim = 2 * (w + h);
  const tFrom = edgeParam(from, w, h);
  const tTo = edgeParam(to, w, h);
  const delta = (t) => ((t - tFrom) + perim) % perim;
  const targetDelta = delta(tTo);

  const corners = [[0, 0], [w, 0], [w, h], [0, h]];
  const cornerParams = [0, w, w + h, w + h + w];

  const passed = corners
    .map((c, i) => ({ c, d: delta(cornerParams[i]) }))
    .filter(({ d }) => d < targetDelta - 1e-6)
    .sort((a, b) => a.d - b.d)
    .map(({ c }) => c);

  return [...passed, to];
}

/**
 * Build sea-fill polygons and island (land) cutouts from a set of coastline
 * ways, clipped/closed against a canvas of the given size.
 *
 * Per OSM convention, water is on the right-hand side when travelling along
 * a coastline way. Open coastline chains are closed into a fillable polygon
 * by walking clockwise around the canvas boundary from where the chain
 * exits back to where it enters — which always traces out the sea side.
 * Closed rings (islands, lakes-as-coastline, etc.) are filled directly and
 * treated as land cutouts.
 *
 * This is a reasonable approximation, not an exact clipper: chains that
 * cross the canvas boundary more than twice, or that end mid-canvas without
 * closing, aren't fully handled.
 *
 * @param {[number,number][][]} coastlineWays  Each way as [lon,lat] pairs
 * @param {{ originX: number, originY: number, scale: number }} transform
 * @param {number} width   Canvas width in pixels
 * @param {number} height  Canvas height in pixels
 * @returns {{ sea: [number,number][][], islands: [number,number][][] }}
 */
export function computeSeaPolygons(coastlineWays, transform, width, height) {
  if (!coastlineWays || coastlineWays.length === 0) return { sea: [], islands: [] };

  const toPx = ([lon, lat]) => toCanvas(...toMercator(lon, lat), transform);
  const closeEnoughPx = (a, b, eps = 0.5) =>
    Math.abs(a[0] - b[0]) < eps && Math.abs(a[1] - b[1]) < eps;

  const sea = [];
  const islands = [];

  for (const chainLonLat of chainCoastlines(coastlineWays)) {
    const chain = chainLonLat.map(toPx);
    if (chain.length < 3) continue;

    if (closeEnoughPx(chain[0], chain[chain.length - 1])) {
      islands.push(chain);
      continue;
    }

    const clipped = clipChainToBox(chain, width, height);
    if (!clipped || clipped.length < 2) continue;

    const entry = clipped[0];
    const exit = clipped[clipped.length - 1];
    sea.push([...clipped, ...boxWalk(exit, entry, width, height)]);
  }

  return { sea, islands };
}

/**
 * Fill in the sea using the coastline data, so open water renders as a solid
 * colour rather than being left blank. See {@link computeSeaPolygons}.
 * @param {CanvasRenderingContext2D} ctx
 * @param {[number,number][][]} coastlineWays
 * @param {{ originX: number, originY: number, scale: number }} transform
 * @param {string} seaColor   Fill colour for open water
 * @param {string} [landColor='#ffffff']  Fill colour used to cut out islands
 */
export function renderSea(ctx, coastlineWays, transform, seaColor, landColor = '#ffffff') {
  const { sea, islands } = computeSeaPolygons(coastlineWays, transform, ctx.canvas.width, ctx.canvas.height);
  if (sea.length === 0) return;

  const fillPolygon = (points) => {
    if (points.length < 3) return;
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    ctx.closePath();
    ctx.fill();
  };

  ctx.fillStyle = seaColor;
  sea.forEach(fillPolygon);

  if (islands.length) {
    ctx.fillStyle = landColor;
    islands.forEach(fillPolygon);
  }
}

/**
 * Render an array of polylines (ways) onto a canvas context as strokes.
 *
 * Each way is an array of [lon, lat] coordinate pairs.
 * All ways are drawn in a single path for performance.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {[number,number][][]} ways         Array of polylines
 * @param {{ originX: number, originY: number, scale: number }} transform
 * @param {string}  strokeStyle             CSS colour string
 * @param {number}  lineWidth               Stroke width in canvas pixels
 */
export function renderWays(ctx, ways, transform, strokeStyle, lineWidth) {
  if (!ways || ways.length === 0) return;

  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  ctx.beginPath();

  for (const way of ways) {
    if (way.length < 2) continue;

    const [x0, y0] = toCanvas(...toMercator(way[0][0], way[0][1]), transform);
    ctx.moveTo(x0, y0);

    for (let i = 1; i < way.length; i++) {
      const [x, y] = toCanvas(...toMercator(way[i][0], way[i][1]), transform);
      ctx.lineTo(x, y);
    }
  }

  ctx.stroke();
}

/**
 * Render an array of closed ways (polygon-like areas, e.g. water, parks,
 * buildings) onto a canvas context as filled shapes. Each ring is filled
 * independently (no hole-cutting), which is a reasonable approximation for
 * simple OSM area ways.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {[number,number][][]} ways   Array of polygon rings
 * @param {{ originX: number, originY: number, scale: number }} transform
 * @param {string}  fillStyle          CSS colour string
 */
export function renderFilledWays(ctx, ways, transform, fillStyle) {
  if (!ways || ways.length === 0) return;

  ctx.fillStyle = fillStyle;

  for (const way of ways) {
    if (way.length < 3) continue;

    ctx.beginPath();
    const [x0, y0] = toCanvas(...toMercator(way[0][0], way[0][1]), transform);
    ctx.moveTo(x0, y0);

    for (let i = 1; i < way.length; i++) {
      const [x, y] = toCanvas(...toMercator(way[i][0], way[i][1]), transform);
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  }
}

/**
 * Render a layer using the mode declared on its style ('fill' or 'stroke').
 * @param {CanvasRenderingContext2D} ctx
 * @param {[number,number][][]} ways
 * @param {{ originX: number, originY: number, scale: number }} transform
 * @param {{ color: string, stroke: number, mode?: 'fill'|'stroke' }} style
 */
export function renderLayer(ctx, ways, transform, style) {
  if (style.mode === 'fill') {
    renderFilledWays(ctx, ways, transform, style.color);
  } else {
    renderWays(ctx, ways, transform, style.color, style.stroke);
  }
}

/**
 * Draw a title block (city/title + coordinate subtitle) near the bottom of
 * the print canvas. Sizing scales with canvas height so it looks consistent
 * across paper sizes.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ title: string, subtitle: string, width: number, height: number }} opts
 */
export function drawTitleBlock(ctx, { title, subtitle, width, height }) {
  if (!title && !subtitle) return;

  const titleSize = Math.round(height * 0.028);
  const subtitleSize = Math.round(height * 0.012);
  const bottomMargin = height * 0.06;
  const gap = height * 0.012;

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  let y = height - bottomMargin;

  if (subtitle) {
    ctx.font = `${subtitleSize}px sans-serif`;
    ctx.fillStyle = '#333333';
    ctx.letterSpacing = `${Math.round(subtitleSize * 0.3)}px`;
    ctx.fillText(subtitle.toUpperCase(), width / 2, y);
    ctx.letterSpacing = '0px';
    y -= subtitleSize + gap;
  }

  if (title) {
    ctx.font = `${titleSize}px serif`;
    ctx.fillStyle = '#111111';
    ctx.fillText(title, width / 2, y);
  }

  ctx.restore();
}
