/**
 * Camera maths for the zoomable poster view.
 *
 * The poster lives in "print space": 1 unit = 1 print pixel (paper size × DPI),
 * origin top-left. The camera is a window onto that space:
 *
 *   k       CSS pixels per print pixel (zoom). 1 = 100 % = true print scale.
 *   cx, cy  print-space point shown at the centre of the viewport.
 *
 * Screen (CSS px) ↔ print:  screen = (print − c) · k + viewCentre
 */

/** Maximum zoom (CSS px per print px). */
export const MAX_ZOOM = 8;
/** Breathing room (CSS px) kept around the page when it is fully visible. */
export const PAD = 24;

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

/** Zoom at which the whole page fits in the viewport (with padding). */
export function fitScale(printW, printH, viewW, viewH) {
  const k = Math.min((viewW - 2 * PAD) / printW, (viewH - 2 * PAD) / printH);
  return Math.max(k, 1e-6);
}

/** Camera showing the whole page, centred. */
export function fitCamera(printW, printH, viewW, viewH) {
  return { k: fitScale(printW, printH, viewW, viewH), cx: printW / 2, cy: printH / 2 };
}

/**
 * Limit zoom to [fit, MAX_ZOOM] and keep the page on screen. On an axis where
 * the page is smaller than the viewport it is centred; otherwise the camera
 * may pan until the page edge reaches PAD from the viewport edge.
 */
export function clampCamera(cam, printW, printH, viewW, viewH) {
  const minK = fitScale(printW, printH, viewW, viewH);
  const k = clamp(cam.k, minK, Math.max(MAX_ZOOM, minK));
  const axis = (c, pageLen, viewLen) => {
    if (pageLen * k + 2 * PAD <= viewLen) return pageLen / 2;
    const half = (viewLen / 2 - PAD) / k;
    return clamp(c, half, pageLen - half);
  };
  return { k, cx: axis(cam.cx, printW, viewW), cy: axis(cam.cy, printH, viewH) };
}

/** Zoom to `newK` keeping the print point under screen (sx, sy) fixed. */
export function zoomAt(cam, sx, sy, newK, viewW, viewH) {
  const px = (sx - viewW / 2) / cam.k + cam.cx;
  const py = (sy - viewH / 2) / cam.k + cam.cy;
  return {
    k: newK,
    cx: px - (sx - viewW / 2) / newK,
    cy: py - (sy - viewH / 2) / newK,
  };
}

/**
 * CSS transform (transform-origin: 0 0) that maps a bitmap rendered with
 * camera `from` onto what camera `to` would show. Used for instant, GPU-only
 * feedback while the real re-render is pending.
 */
export function cssTransformBetween(from, to, viewW, viewH) {
  const s = to.k / from.k;
  const tx = viewW / 2 - s * (viewW / 2) + (from.cx - to.cx) * to.k;
  const ty = viewH / 2 - s * (viewH / 2) + (from.cy - to.cy) * to.k;
  return `translate(${tx}px, ${ty}px) scale(${s})`;
}
