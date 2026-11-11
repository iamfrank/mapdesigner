/**
 * Draws tiled-poster sheets (artwork + crop marks, registration targets,
 * overlap guides and numbering) into a jsPDF document.
 *
 * Kept free of DOM/canvas code: the caller supplies an `getTileImage(tile)`
 * callback returning anything `pdf.addImage` accepts.
 */
import { tileLabel } from './tiling.js';

const BLACK = [0, 0, 0];
const WHITE = [255, 255, 255];
const GREY = [110, 110, 110];

/** Registration target: circle with a crosshair extending past it. */
function drawTarget(pdf, x, y, r) {
  pdf.setLineDashPattern([], 0);
  pdf.setDrawColor(...BLACK);
  pdf.setLineWidth(0.15);
  pdf.circle(x, y, r * 0.6, 'S');
  pdf.line(x - r, y, x + r, y);
  pdf.line(x, y - r, x, y + r);
}

/** Corner crop marks just outside the image rectangle, within the margin. */
function drawCropMarks(pdf, x1, y1, x2, y2, margin) {
  const gap = Math.min(1.5, margin * 0.2);
  const len = Math.min(5, margin - gap - 0.5);
  if (len <= 0.5) return;
  pdf.setLineDashPattern([], 0);
  pdf.setDrawColor(...BLACK);
  pdf.setLineWidth(0.2);
  for (const [cx, sx] of [[x1, -1], [x2, 1]]) {
    for (const [cy, sy] of [[y1, -1], [y2, 1]]) {
      pdf.line(cx + sx * gap, cy, cx + sx * (gap + len), cy);
      pdf.line(cx, cy + sy * gap, cx, cy + sy * (gap + len));
    }
  }
}

/** Dashed line that stays visible on any artwork (white underlay, black dashes). */
function drawGuideLine(pdf, x1, y1, x2, y2) {
  pdf.setLineDashPattern([], 0);
  pdf.setDrawColor(...WHITE);
  pdf.setLineWidth(0.6);
  pdf.line(x1, y1, x2, y2);
  pdf.setDrawColor(...BLACK);
  pdf.setLineWidth(0.25);
  pdf.setLineDashPattern([2, 1.5], 0);
  pdf.line(x1, y1, x2, y2);
  pdf.setLineDashPattern([], 0);
}

/** Small label with a white box behind it, drawn on top of artwork. */
function drawBoxedText(pdf, text, x, y, { size = 7, angle = 0 } = {}) {
  pdf.setFontSize(size);
  const w = pdf.getTextWidth(text);
  const h = size * 0.3528; // pt → mm
  const pad = 0.8;
  pdf.setFillColor(...WHITE);
  if (angle === 90) {
    // Rotated text reads bottom → top; (x, y) is the box centre.
    pdf.rect(x - h / 2 - pad, y - w / 2 - pad, h + 2 * pad, w + 2 * pad, 'F');
    pdf.setTextColor(...BLACK);
    pdf.text(text, x + h * 0.35, y + w / 2, { angle: 90 });
  } else {
    pdf.rect(x - w / 2 - pad, y - h / 2 - pad, w + 2 * pad, h + 2 * pad, 'F');
    pdf.setTextColor(...BLACK);
    pdf.text(text, x - w / 2, y + h * 0.35);
  }
}

/** Mini overview grid with the current tile highlighted. */
function drawMiniGrid(pdf, layout, current, x, y, maxW, maxH) {
  const cell = Math.min(maxW / layout.cols, maxH / layout.rows, 4);
  if (cell < 0.8) return;
  pdf.setLineDashPattern([], 0);
  pdf.setLineWidth(0.1);
  pdf.setDrawColor(...GREY);
  for (let r = 0; r < layout.rows; r++) {
    for (let c = 0; c < layout.cols; c++) {
      const isCur = current && r === current.row && c === current.col;
      pdf.setFillColor(...(isCur ? BLACK : WHITE));
      pdf.rect(x + c * cell, y + r * cell, cell, cell, 'FD');
    }
  }
}

function neighbour(layout, tile, dRow, dCol) {
  const row = tile.row + dRow;
  const col = tile.col + dCol;
  if (row < 0 || col < 0 || row >= layout.rows || col >= layout.cols) return null;
  return layout.tiles[row * layout.cols + col];
}

/**
 * Draw one tile sheet onto the current pdf page.
 * @param {import('jspdf').jsPDF} pdf
 * @param {ReturnType<import('./tiling.js').computeTileLayout>} layout
 * @param {object} tile
 * @param {*} image  Anything accepted by pdf.addImage
 * @param {{ title?: string, imageFormat?: string }} [opts]
 */
export function drawTileSheet(pdf, layout, tile, image, { title = '', imageFormat = 'PNG' } = {}) {
  const { margin, sheetW, sheetH } = layout;
  const total = layout.tiles.length;
  const x1 = margin, y1 = margin;
  const x2 = margin + tile.w, y2 = margin + tile.h;

  pdf.addImage(image, imageFormat, x1, y1, tile.w, tile.h, `tile-${tile.label}`, 'FAST');

  const right = neighbour(layout, tile, 0, 1);
  const below = neighbour(layout, tile, 1, 0);
  const left = neighbour(layout, tile, 0, -1);
  const above = neighbour(layout, tile, -1, 0);

  // Overlap strips: covered by the right/lower neighbour. Draw where that
  // neighbour's trimmed edge must be placed.
  const targetR = Math.min(3, margin / 2 - 0.5);
  if (right) {
    const gx = x1 + (right.x - tile.x);
    drawGuideLine(pdf, gx, y1, gx, y2);
    if (gx < x2 - 3) drawBoxedText(pdf, `${right.label} here`, (gx + x2) / 2, (y1 + y2) / 2, { size: 6, angle: 90 });
    if (targetR >= 1) {
      drawTarget(pdf, gx, y1 - margin / 2, targetR);
      drawTarget(pdf, gx, y2 + margin / 2, targetR);
    }
  }
  if (below) {
    const gy = y1 + (below.y - tile.y);
    drawGuideLine(pdf, x1, gy, x2, gy);
    if (gy < y2 - 3) drawBoxedText(pdf, `${below.label} here`, (x1 + x2) / 2, (gy + y2) / 2, { size: 6 });
    if (targetR >= 1) {
      drawTarget(pdf, x1 - margin / 2, gy, targetR);
      drawTarget(pdf, x2 + margin / 2, gy, targetR);
    }
  }
  // Matching targets on this sheet's own trimmed (left/top) edges.
  if (targetR >= 1) {
    if (left) {
      drawTarget(pdf, x1, y1 - margin / 2, targetR);
      drawTarget(pdf, x1, y2 + margin / 2, targetR);
    }
    if (above) {
      drawTarget(pdf, x1 - margin / 2, y1, targetR);
      drawTarget(pdf, x2 + margin / 2, y1, targetR);
    }
  }

  drawCropMarks(pdf, x1, y1, x2, y2, margin);

  // Numbering and assembly hints in the margins.
  if (margin >= 4) {
    const size = Math.min(8, margin * 1.4);
    pdf.setTextColor(...BLACK);
    pdf.setFontSize(size + 2);
    pdf.setFont('helvetica', 'bold');
    const head = `${tile.label}`;
    pdf.text(head, x1 + 7, margin * 0.62);
    const headW = pdf.getTextWidth(head);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(size);
    const titlePart = title ? `${title}  -  ` : '';
    const info = `${titlePart}sheet ${tile.index + 1} of ${total}  (row ${tile.row + 1}/${layout.rows}, column ${tile.col + 1}/${layout.cols})`;
    const infoX = x1 + 9 + headW;
    pdf.text(info, infoX, margin * 0.62);

    // Mini overview grid right after the header text, if there is room
    // before the right-hand registration target.
    const maxH = margin - 3;
    const cell = Math.min(40 / layout.cols, maxH / layout.rows, 4);
    const gridX = infoX + pdf.getTextWidth(info) + 4;
    const limitX = (right ? x1 + (right.x - tile.x) : x2) - targetR - 2;
    if (gridX + layout.cols * cell <= limitX) {
      drawMiniGrid(pdf, layout, tile, gridX, (margin - layout.rows * cell) / 2, 40, maxH);
    }

    const cut = [
      'left', 'top',
      !right && 'right',
      !below && 'bottom',
    ].filter(Boolean);
    const glue = [left && `${left.label} (left)`, above && `${above.label} (top)`].filter(Boolean);
    const hint = `Cut ${cut.join(', ')} edge${cut.length > 1 ? 's' : ''} along the crop marks.` +
      (glue.length ? ` Overlap onto ${glue.join(' and ')} at the dashed line.` : ' Start assembling here.');
    pdf.setTextColor(...GREY);
    pdf.text(hint, x1 + 7, sheetH - margin * 0.38);
  }
}

/**
 * Draw an assembly guide page: poster thumbnail with the tile grid overlaid.
 * @param {import('jspdf').jsPDF} pdf
 * @param {ReturnType<import('./tiling.js').computeTileLayout>} layout
 * @param {*} thumbnail  Image of the whole poster (anything pdf.addImage accepts)
 * @param {{ posterW: number, posterH: number, title?: string, posterLabel?: string, sheetLabel?: string, imageFormat?: string }} opts
 */
export function drawAssemblyGuide(pdf, layout, thumbnail, { posterW, posterH, title = '', posterLabel = '', sheetLabel = '', imageFormat = 'PNG' }) {
  const { sheetW, sheetH } = layout;
  const pad = Math.max(layout.margin, 10);
  pdf.setTextColor(...BLACK);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14);
  pdf.text(title ? `${title} - assembly guide` : 'Poster assembly guide', pad, pad + 4);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  const lines = [
    `Poster ${posterLabel || `${Math.round(posterW)} x ${Math.round(posterH)} mm`} on ${layout.tiles.length} sheets ` +
      `(${layout.rows} rows x ${layout.cols} columns${sheetLabel ? `, ${sheetLabel}` : ''}).`,
    'Print every page at 100% / "Actual size" (no "fit to page" scaling).',
    'Trim each sheet along its left and top image edges (and any outer poster edge) using the crop marks.',
    `Lay each sheet over its left/upper neighbour so the trimmed edge sits on the dashed guide line${layout.overlap > 0 ? ` (${layout.overlap} mm overlap)` : ''}.`,
    'Line up the registration targets in the margins before gluing. Work row by row, starting at A1.',
  ];
  let y = pad + 11;
  for (const line of lines) {
    for (const l of pdf.splitTextToSize(line, sheetW - 2 * pad)) {
      pdf.text(l, pad, y);
      y += 4.2;
    }
  }

  const top = y + 4;
  const availW = sheetW - 2 * pad;
  const availH = sheetH - top - pad;
  const k = Math.min(availW / posterW, availH / posterH);
  const w = posterW * k, h = posterH * k;
  const ox = pad + (availW - w) / 2;
  const oy = top + (availH - h) / 2;
  pdf.addImage(thumbnail, imageFormat, ox, oy, w, h, 'assembly-thumb', 'FAST');

  // Tile boundaries: each tile's own (trimmed) left/top edge is where it starts.
  for (const t of layout.tiles) {
    const tx = ox + t.x * k, ty = oy + t.y * k;
    pdf.setLineDashPattern([], 0);
    pdf.setDrawColor(...WHITE);
    pdf.setLineWidth(0.8);
    pdf.rect(tx, ty, t.w * k, t.h * k, 'S');
    pdf.setDrawColor(...BLACK);
    pdf.setLineWidth(0.3);
    pdf.rect(tx, ty, t.w * k, t.h * k, 'S');
  }
  for (const t of layout.tiles) {
    // Centre the label on the part of the tile not covered by neighbours.
    const right = neighbour(layout, t, 0, 1);
    const below = neighbour(layout, t, 1, 0);
    const visW = right ? right.x - t.x : t.w;
    const visH = below ? below.y - t.y : t.h;
    const size = Math.max(5, Math.min(14, Math.min(visW, visH) * k * 0.8));
    drawBoxedText(pdf, tileLabel(t.row, t.col), ox + (t.x + visW / 2) * k, oy + (t.y + visH / 2) * k, { size });
  }
}
