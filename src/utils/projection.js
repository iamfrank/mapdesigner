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
 * Convert Web Mercator metres back to geographic coordinates.
 * @returns {[number, number]}  [lon, lat] in degrees
 */
export function fromMercator(mx, my) {
  const lon = (mx * 180) / (Math.PI * R);
  const lat = ((2 * Math.atan(Math.exp(my / R)) - Math.PI / 2) * 180) / Math.PI;
  return [lon, lat];
}

/**
 * Largest box of the given aspect ratio that fits inside a geographic bbox,
 * sharing its centre. Works in Mercator space, which is what the poster is
 * projected with, so the result maps onto the poster with no letterboxing.
 *
 * @param {[number,number,number,number]} bboxLonLat  [minLat, minLon, maxLat, maxLon]
 * @param {number} aspect  width / height of the target (e.g. paper)
 * @returns {[number,number,number,number]}  [minLat, minLon, maxLat, maxLon]
 */
export function fitBboxToAspect(bboxLonLat, aspect) {
  const [minLat, minLon, maxLat, maxLon] = bboxLonLat;
  const [x0, y0] = toMercator(minLon, minLat);
  const [x1, y1] = toMercator(maxLon, maxLat);
  let w = x1 - x0;
  let h = y1 - y0;
  if (w / h > aspect) w = h * aspect;
  else h = w / aspect;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const [lon0, lat0] = fromMercator(cx - w / 2, cy - h / 2);
  const [lon1, lat1] = fromMercator(cx + w / 2, cy + h / 2);
  return [lat0, lon0, lat1, lon1];
}
