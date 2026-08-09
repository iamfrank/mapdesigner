// WGS-84 equatorial radius in metres (EPSG:3857)
const R = 6378137;

/**
 * Convert geographic coordinates to Web Mercator metres.
 * @param {number} lon  Longitude in degrees
 * @param {number} lat  Latitude in degrees
 * @returns {[number, number]}  [mx, my] in metres
 */
export function toMercator(lon, lat) {
  const mx = (lon * Math.PI * R) / 180;
  const my = R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  return [mx, my];
}

/**
 * Convert Mercator metres to canvas pixels using a ViewTransform.
 *
 * A ViewTransform maps Mercator space onto a canvas:
 *   px = (mx − originX) × scale
 *   py = (originY − my) × scale   ← y-axis is inverted (canvas y goes down)
 *
 * @param {number} mx
 * @param {number} my
 * @param {{ originX: number, originY: number, scale: number }} transform
 * @returns {[number, number]}  [px, py] in canvas pixels
 */
export function toCanvas(mx, my, transform) {
  const px = (mx - transform.originX) * transform.scale;
  const py = (transform.originY - my) * transform.scale;
  return [px, py];
}

/**
 * Compute a ViewTransform that fits a geographic bounding box into a canvas,
 * centred with equal padding on all sides (letterbox when aspect ratios differ).
 *
 * @param {[number,number,number,number]} bboxLonLat  [minLat, minLon, maxLat, maxLon]
 * @param {number} canvasW  Canvas width in pixels
 * @param {number} canvasH  Canvas height in pixels
 * @returns {{ originX: number, originY: number, scale: number }}
 */
export function computeTransform(bboxLonLat, canvasW, canvasH) {
  const [minLat, minLon, maxLat, maxLon] = bboxLonLat;
  const [minMx, minMy] = toMercator(minLon, minLat);
  const [maxMx, maxMy] = toMercator(maxLon, maxLat);

  const mercW = maxMx - minMx;
  const mercH = maxMy - minMy;

  // Fit while preserving aspect ratio
  const scale = Math.min(canvasW / mercW, canvasH / mercH);

  // Centre the rendered area in the canvas
  const renderW = mercW * scale;
  const renderH = mercH * scale;
  const padX = (canvasW - renderW) / 2;
  const padY = (canvasH - renderH) / 2;

  return {
    originX: minMx - padX / scale,
    originY: maxMy + padY / scale,
    scale,
  };
}

/**
 * Compute a ViewTransform for the detail canvas: same scale as the print canvas
 * but with its origin offset so that a chosen geographic centre aligns with the
 * centre of the canvas.
 *
 * @param {number} centerLon
 * @param {number} centerLat
 * @param {number} printScale   pixels-per-metre from the full-print transform
 * @param {number} canvasW      detail canvas width in pixels
 * @param {number} canvasH      detail canvas height in pixels
 * @returns {{ originX: number, originY: number, scale: number }}
 */
export function computeDetailTransform(centerLon, centerLat, printScale, canvasW, canvasH) {
  const [cx, cy] = toMercator(centerLon, centerLat);
  return {
    originX: cx - canvasW / 2 / printScale,
    originY: cy + canvasH / 2 / printScale,
    scale: printScale,
  };
}
