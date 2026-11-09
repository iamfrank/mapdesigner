import { toMercator, toCanvas } from './projection.js';
import { renderLayerGeometry } from './geometry.js';
import { renderPlaceLabels } from './labels.js';

/**
 * Chain coastline ways end-to-end into longer polylines/rings by matching
 * shared endpoint coordinates (OSM splits one coastline into many ways).
 * Direction is preserved (water on the right), so ways are only ever joined
 * head-to-tail; a way running the opposite direction is never reversed.
 * @param {[number,number][][]} ways  Each way is an array of [lon,lat] pairs
 * @returns {{ pts: [number,number][], closed: boolean }[]}
 */
function chainCoastlines(ways) {
  const key = (p) => p[0] + ',' + p[1];
  const list = ways.filter((w) => w.length > 1);
  const byStart = new Map();
  list.forEach((w, i) => {
    const k = key(w[0]);
    if (!byStart.has(k)) byStart.set(k, []);
    byStart.get(k).push(i);
  });
  const endKeys = new Set(list.map((w) => key(w[w.length - 1])));
  const used = new Array(list.length).fill(false);
  const chains = [];

  const follow = (startIdx) => {
    const pts = list[startIdx].slice();
    used[startIdx] = true;
    const startKey = key(pts[0]);
    for (;;) {
      const lastKey = key(pts[pts.length - 1]);
      if (pts.length > 2 && lastKey === startKey) return { pts, closed: true };
      const next = (byStart.get(lastKey) ?? []).find((i) => !used[i]);
      if (next === undefined) return { pts, closed: false };
      used[next] = true;
      const w = list[next];
      for (let j = 1; j < w.length; j++) pts.push(w[j]);
    }
  };

  // Open chains first: start only from ways whose start no other way ends at.
  list.forEach((w, i) => {
    if (!used[i] && !endKeys.has(key(w[0]))) chains.push(follow(i));
  });
  // What's left are rings (or chains with a dangling join): follow them too.
  list.forEach((w, i) => {
    if (!used[i]) chains.push(follow(i));
  });
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

/** Split a canvas-space polyline into the runs that lie inside the
 * [0,w] x [0,h] canvas. Each run starts/ends on the boundary where the chain
 * crosses it; a run that begins/ends strictly inside (the chain itself ends
 * there) is flagged so it can be extended to the boundary. Handles any number
 * of crossings, including segments that cut a corner with both ends outside. */
function clipChainToBox(points, w, h) {
  const runs = [];
  let run = null;
  const lerp = (A, B, t) => [A[0] + t * (B[0] - A[0]), A[1] + t * (B[1] - A[1])];

  for (let i = 0; i < points.length - 1; i++) {
    const A = points[i], B = points[i + 1];
    const t = liangBarsky(A[0], A[1], B[0], B[1], w, h);
    if (!t) { run = null; continue; }
    if (!run) {
      run = { pts: [t[0] > 0 ? lerp(A, B, t[0]) : A], openStart: i === 0 && t[0] === 0, openEnd: false };
      runs.push(run);
    }
    run.pts.push(t[1] < 1 ? lerp(A, B, t[1]) : B);
    if (t[1] < 1) run = null;
  }
  if (run) run.openEnd = true;
  return runs;
}

/** Nearest point on the boundary of [0,w] x [0,h] to an inside point. */
function snapToBoundary([x, y], w, h) {
  const d = [y, w - x, h - y, x];
  const m = Math.min(...d);
  if (m === d[0]) return [x, 0];
  if (m === d[1]) return [w, y];
  if (m === d[2]) return [x, h];
  return [0, y];
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

/** Signed area in canvas space (y down): > 0 is visually clockwise. */
function signedArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length];
    a += x0 * y1 - x1 * y0;
  }
  return a / 2;
}

function pointInPolygon([x, y], pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Build sea-fill polygons and island (land) cutouts from a set of coastline
 * ways, clipped/closed against a canvas of the given size.
 *
 * Per OSM convention, land is on the left and water on the right when
 * travelling along a coastline way. Coastline ways are chained, clipped to
 * the canvas (a chain may enter/leave several times), and the resulting
 * pieces are stitched into sea polygons: after a piece leaves the canvas we
 * walk clockwise along the canvas edge to the next piece that enters, which
 * keeps the water on the right all the way round.
 *
 * Closed rings are islands (visually counter-clockwise) or inland water
 * (clockwise). With no coastline crossing the canvas, the canvas is land if
 * enclosed by an island ring, sea if it merely contains islands, and is left
 * blank if there is nothing to go on.
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
  const perim = 2 * (width + height);

  const sea = [];
  const islands = [];
  const runs = [];

  for (const { pts, closed } of chainCoastlines(coastlineWays)) {
    const chain = pts.map(toPx);
    if (closed) {
      chain.pop(); // drop duplicated closing vertex
      if (chain.length < 3) continue;
      (signedArea(chain) < 0 ? islands : sea).push(chain);
      continue;
    }
    for (const r of clipChainToBox(chain, width, height)) {
      let p = r.pts;
      if (r.openStart) p = [snapToBoundary(p[0], width, height), ...p];
      if (r.openEnd) p = [...p, snapToBoundary(p[p.length - 1], width, height)];
      const first = p[0], last = p[p.length - 1];
      // Ignore chains that merely graze the canvas.
      if (p.length < 2 || p.every((q) => Math.abs(q[0] - first[0]) < 1e-9 && Math.abs(q[1] - first[1]) < 1e-9)) continue;
      runs.push({ pts: p, entryT: edgeParam(first, width, height), exitT: edgeParam(last, width, height) });
    }
  }

  if (runs.length === 0) {
    const box = [[0, 0], [width, 0], [width, height], [0, height]];
    if (islands.length) {
      const centre = [width / 2, height / 2];
      const enclosing = islands.some((r) => pointInPolygon(centre, r));
      if (enclosing) return { sea: [], islands: [] }; // canvas is inside a landmass
      sea.push(box);
    }
    return { sea, islands };
  }

  // Stitch runs into closed polygons.
  const delta = (from, to) => {
    const d = (((to - from) % perim) + perim) % perim;
    return d > perim - 1e-6 ? 0 : d;
  };
  const used = new Set();
  for (const start of runs) {
    if (used.has(start)) continue;
    const poly = [];
    let cur = start;
    while (cur && !used.has(cur)) {
      used.add(cur);
      poly.push(...cur.pts);
      let next = null, best = Infinity;
      for (const r of runs) {
        const d = delta(cur.exitT, r.entryT);
        if (d < best) { best = d; next = r; }
      }
      poly.push(...boxWalk(cur.pts[cur.pts.length - 1], next.pts[0], width, height));
      cur = next;
    }
    sea.push(poly);
  }

  return { sea, islands };
}

/**
 * Fill precomputed sea polygons (see {@link computeSeaPolygons}).
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ sea: [number,number][][], islands: [number,number][][] }} polys
 * @param {string} seaColor
 * @param {string} [landColor='#ffffff']  Fill colour used to cut out islands
 */
export function fillSeaPolygons(ctx, { sea, islands }, seaColor, landColor = '#ffffff') {
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
 * Fill in the sea using the coastline data, so open water renders as a solid
 * colour rather than being left blank. See {@link computeSeaPolygons}.
 * @param {CanvasRenderingContext2D} ctx
 * @param {[number,number][][]} coastlineWays
 * @param {{ originX: number, originY: number, scale: number }} transform
 * @param {string} seaColor   Fill colour for open water
 * @param {string} [landColor='#ffffff']  Fill colour used to cut out islands
 * @param {{ width: number, height: number }} [size]  Box the sea is closed
 *   against; defaults to the canvas size.
 */
export function renderSea(ctx, coastlineWays, transform, seaColor, landColor = '#ffffff', size) {
  const width = size?.width ?? ctx.canvas.width;
  const height = size?.height ?? ctx.canvas.height;
  fillSeaPolygons(ctx, computeSeaPolygons(coastlineWays, transform, width, height), seaColor, landColor);
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

/**
 * Draw the whole poster (page, layers, title block) in *print space*: the
 * caller sets the context transform, and everything here is expressed in
 * print pixels over [0,width] × [0,height]. The same function backs the
 * on-screen view (with a camera transform) and the export (identity), so
 * both always look the same.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} opts
 * @param {object|null} opts.osmData
 * @param {object[]} opts.styles
 * @param {{ originX: number, originY: number, scale: number }} opts.transform  mercator → print px
 * @param {number} opts.width    Page width in print px
 * @param {number} opts.height   Page height in print px
 * @param {string} opts.backgroundColor  Page and island fill colour
 * @param {{ sea: any[], islands: any[] }} [opts.sea]  Precomputed sea polygons (print space)
 * @param {{x0:number,y0:number,x1:number,y1:number}|null} [opts.view]  Visible rect in print px for culling (null = draw everything)
 * @param {number} [opts.tol=0]  Vertex-simplification tolerance in print px (0 = exact)
 * @param {number} [opts.minStroke=0]  Minimum stroke width in print px (keeps hairlines visible when zoomed out)
 * @param {{ title: string, subtitle: string }|null} [opts.titleBlock]
 */
export function drawPoster(ctx, { osmData, styles, transform, width, height, backgroundColor, sea, view = null, tol = 0, minStroke = 0, titleBlock }) {
  ctx.save();
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, width, height);
  ctx.beginPath();
  ctx.rect(0, 0, width, height);
  ctx.clip();

  if (osmData) {
    const waterStyle = styles.find((s) => s.id === 'water');
    if (waterStyle?.visible) {
      if (sea) fillSeaPolygons(ctx, sea, waterStyle.color, backgroundColor);
      else renderSea(ctx, osmData.coastlines, transform, waterStyle.color, backgroundColor, { width, height });
    }

    for (const style of styles) {
      if (!style.visible) continue;
      if (style.mode === 'text') {
        renderPlaceLabels(ctx, osmData[style.id], transform, style, { width, height, haloColor: backgroundColor, view });
        continue;
      }
      const s = style.mode === 'fill' || style.stroke >= minStroke ? style : { ...style, stroke: minStroke };
      renderLayerGeometry(ctx, osmData[style.id], transform, s, { view, tol });
    }
  }

  if (titleBlock) drawTitleBlock(ctx, { ...titleBlock, width, height });
  ctx.restore();
}

/**
 * Add elevation contour layers (below the first stroke layer) to the data and
 * styles. Returns the inputs unchanged when there are no contours.
 * @param {object|null} osmData
 * @param {object[]} styles
 * @param {{ minor: any[], major: any[] }|null} contours
 * @param {{ minor: number, major: number }} strokes  Line widths in print px
 */
export function withContours(osmData, styles, contours, strokes) {
  if (!contours) return { osmData, styles };
  const firstStroke = styles.findIndex((style) => style.mode === 'stroke');
  const index = firstStroke < 0 ? styles.length : firstStroke;
  return {
    osmData: { ...osmData, contoursMinor: contours.minor, contoursMajor: contours.major },
    styles: [
      ...styles.slice(0, index),
      { id: 'contoursMinor', visible: true, mode: 'stroke', color: 'rgba(130,92,55,0.5)', stroke: strokes.minor },
      { id: 'contoursMajor', visible: true, mode: 'stroke', color: 'rgba(115,76,40,0.8)', stroke: strokes.major },
      ...styles.slice(index),
    ],
  };
}
