/**
 * Layout maths for splitting a large poster into tiles that fit on smaller
 * sheets of paper (e.g. A4), so it can be printed on a home printer and
 * assembled afterwards.
 *
 * Assembly model: neighbouring tiles share an `overlap` strip. Each tile
 * that has a neighbour to its left/top is trimmed exactly at its image edge
 * and glued over the overlap strip of that neighbour, using the guide line
 * printed there. Tiles never need to be cut through the artwork.
 */

/** Row label for a 0-based row index: 0 → A, 25 → Z, 26 → AA … */
export function rowLabel(row) {
  let s = '';
  let n = row + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Tile label such as "B3" (row letter + 1-based column number). */
export function tileLabel(row, col) {
  return `${rowLabel(row)}${col + 1}`;
}

function axisSegments(posterLen, contentLen, overlap) {
  if (contentLen <= overlap) throw new Error('Overlap must be smaller than the printable area of a sheet.');
  if (posterLen <= contentLen) return [{ start: 0, len: posterLen }];
  const step = contentLen - overlap;
  const count = Math.ceil((posterLen - overlap) / step);
  const segs = [];
  for (let i = 0; i < count; i++) {
    const start = i * step;
    segs.push({ start, len: Math.min(contentLen, posterLen - start) });
  }
  return segs;
}

/**
 * Compute a tile grid for one sheet orientation.
 *
 * @param {object} opts
 * @param {number} opts.posterW   Poster width (mm)
 * @param {number} opts.posterH   Poster height (mm)
 * @param {number} opts.sheetW    Sheet width (mm)
 * @param {number} opts.sheetH    Sheet height (mm)
 * @param {number} opts.margin    Unprinted margin on each side of the sheet (mm)
 * @param {number} opts.overlap   Overlap between neighbouring tiles (mm)
 */
function gridFor({ posterW, posterH, sheetW, sheetH, margin, overlap }) {
  const contentW = sheetW - 2 * margin;
  const contentH = sheetH - 2 * margin;
  if (contentW <= 0 || contentH <= 0) throw new Error('Sheet margin is too large for the sheet size.');
  const xs = axisSegments(posterW, contentW, overlap);
  const ys = axisSegments(posterH, contentH, overlap);
  const tiles = [];
  ys.forEach((y, row) => {
    xs.forEach((x, col) => {
      tiles.push({
        row, col,
        index: row * xs.length + col,
        label: tileLabel(row, col),
        x: x.start, y: y.start, w: x.len, h: y.len,
      });
    });
  });
  return { sheetW, sheetH, cols: xs.length, rows: ys.length, tiles };
}

/**
 * Lay out a poster over a grid of sheets.
 *
 * @param {object} opts
 * @param {number} opts.posterW
 * @param {number} opts.posterH
 * @param {number} opts.sheetW      Sheet size in portrait (any order is fine)
 * @param {number} opts.sheetH
 * @param {'auto'|'portrait'|'landscape'} [opts.orientation='auto']
 *        'auto' picks whichever orientation needs fewer sheets (portrait on ties).
 * @param {number} [opts.margin=10]
 * @param {number} [opts.overlap=10]
 * @returns {{ sheetW: number, sheetH: number, cols: number, rows: number, margin: number, overlap: number,
 *             tiles: { row: number, col: number, index: number, label: string, x: number, y: number, w: number, h: number }[] }}
 *          Tile rectangles are in poster mm.
 */
export function computeTileLayout({ posterW, posterH, sheetW, sheetH, orientation = 'auto', margin = 10, overlap = 10 }) {
  if (!(posterW > 0 && posterH > 0)) throw new Error('Invalid poster size.');
  if (margin < 0 || overlap < 0) throw new Error('Margin and overlap must not be negative.');
  const short = Math.min(sheetW, sheetH);
  const long = Math.max(sheetW, sheetH);
  const base = { posterW, posterH, margin, overlap };
  const portrait = () => gridFor({ ...base, sheetW: short, sheetH: long });
  const landscape = () => gridFor({ ...base, sheetW: long, sheetH: short });

  let grid;
  if (orientation === 'portrait') grid = portrait();
  else if (orientation === 'landscape') grid = landscape();
  else {
    const p = portrait();
    const l = landscape();
    grid = l.tiles.length < p.tiles.length ? l : p;
  }
  return { ...grid, margin, overlap };
}
