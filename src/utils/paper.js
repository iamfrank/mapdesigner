/**
 * Paper sizes, DPI → pixel conversion, and geographic-extent helpers.
 *
 * All "print" dimensions in this app are derived from a chosen paper size
 * (mm) and a chosen resolution (DPI), rather than being hardcoded, so any
 * ISO A-size up to A0 (or a custom size) can be exported at print quality.
 */

/** ISO 216 A-series sizes, portrait (width × height), in millimetres. */
export const PAPER_SIZES = [
  { id: "A4", label: "A4 (210 × 297 mm)", w: 210, h: 297 },
  { id: "A3", label: "A3 (297 × 420 mm)", w: 297, h: 420 },
  { id: "A2", label: "A2 (420 × 594 mm)", w: 420, h: 594 },
  { id: "A1", label: "A1 (594 × 841 mm)", w: 594, h: 841 },
  { id: "A0", label: "A0 (841 × 1189 mm)", w: 841, h: 1189 },
  { id: "custom", label: "Custom size…", w: null, h: null },
];

export const DPI_OPTIONS = [150, 300, 600];

const MM_PER_INCH = 25.4;

/** Convert a millimetre length to pixels at a given DPI. */
export function mmToPx(mm, dpi) {
  return Math.round((mm / MM_PER_INCH) * dpi);
}

/**
 * Resolve the current paper size (mm) from state, honouring custom overrides.
 * @param {{ paperSizeId: string, customWidthMM: number, customHeightMM: number }} opts
 * @returns {{ wMM: number, hMM: number }}
 */
export function resolvePaperMM({ paperSizeId, customWidthMM, customHeightMM }) {
  if (paperSizeId === "custom") {
    return { wMM: customWidthMM, hMM: customHeightMM };
  }
  const size = PAPER_SIZES.find((s) => s.id === paperSizeId) ?? PAPER_SIZES.at(-1);
  return { wMM: size.w, hMM: size.h };
}

/**
 * Compute print canvas pixel dimensions from paper size + DPI.
 * @returns {{ w: number, h: number }}
 */
export function computePrintPx({ paperSizeId, customWidthMM, customHeightMM, dpi }) {
  const { wMM, hMM } = resolvePaperMM({ paperSizeId, customWidthMM, customHeightMM });
  return { w: mmToPx(wMM, dpi), h: mmToPx(hMM, dpi) };
}
