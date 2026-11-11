import { computeTransform } from './projection.js';
import { drawPoster, withContours } from './render.js';
import { getPrintPx, getTitleBlock, trackBusy } from './state.js';
import state from './state.js'
import { resolvePaperMM, TILE_SHEET_SIZES } from './paper.js';
import { computeTileLayout } from './tiling.js';

/**
 * Render the full-resolution poster (sized per the current paper/DPI
 * settings) to an offscreen canvas, including layers and the title block.
 *
 * @param {object} osmData
 * @param {[number,number,number,number]} bbox  [minLat, minLon, maxLat, maxLon]
 * @returns {HTMLCanvasElement}
 */
function renderPrintCanvas(osmData, bbox) {
  const { w: printW, h: printH } = getPrintPx();

  const offscreen = document.createElement('canvas');
  offscreen.width = printW;
  offscreen.height = printH;

  const ctx = offscreen.getContext('2d');
  if (!ctx) throw new Error('Could not obtain 2D context for offscreen canvas.');

  // Line widths in physical units (~0.1 mm / ~0.18 mm), so they print the same at any DPI.
  const pxPerMM = state.get('dpi') / 25.4;
  const layers = withContours(osmData, state.get('styles'), state.get('contours'), {
    minor: 0.1 * pxPerMM,
    major: 0.18 * pxPerMM,
  });

  drawPoster(ctx, {
    osmData: layers.osmData,
    styles: layers.styles,
    transform: computeTransform(bbox, printW, printH),
    width: printW,
    height: printH,
    backgroundColor: state.get('backgroundStyle').color,
    titleBlock: getTitleBlock(),
  });

  return offscreen;
}

function slugFilename(ext) {
  const title = state.get('title')?.trim();
  const base = title ? title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') : 'map-poster';
  return `${base}.${ext}`;
}

/**
 * Render the print canvas and trigger a PNG download.
 * @param {object} osmData
 * @param {[number,number,number,number]} bbox
 */
export async function exportPNG(osmData, bbox) {
  const { w: printW, h: printH } = getPrintPx();
  const confirmed = confirm(
    `Export full-resolution PNG (${printW} × ${printH} px)?\n\n` +
    `⚠ This may use a large amount of memory and take a while, especially on mobile.`
  );
  if (!confirmed) return;
  await trackBusy(async () => {
    state.set('statusText', 'Rendering print canvas… (this may take a moment)')
    await new Promise((r) => setTimeout(r, 60));

    try {
      const offscreen = renderPrintCanvas(osmData, bbox);

      state.set('statusText', 'Encoding PNG…')
      await new Promise((r) => setTimeout(r, 60));

      const blob = await new Promise((resolve) => offscreen.toBlob(resolve, 'image/png'));
      if (!blob) {
        state.set('statusText', 'Export failed: PNG encoding returned no data.')
        return;
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = slugFilename('png');
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      state.set('statusText', `Export complete — ${a.download} downloaded.`)
    } catch (err) {
      const msg = `Export failed: ${err.message}`;
      state.set('statusText', msg)
      alert(msg);
      console.error(err);
    }
  });
}

/**
 * Render the print canvas and embed it into a print-accurate PDF (physical
 * page size matches the chosen paper size in mm) and trigger a download.
 * @param {object} osmData
 * @param {[number,number,number,number]} bbox
 */
export async function exportPDF(osmData, bbox) {
  const { w: printW, h: printH } = getPrintPx();
  const confirmed = confirm(
    `Export print-quality PDF (${printW} × ${printH} px embedded image)?\n\n` +
    `⚠ This may use a large amount of memory and take a while, especially on mobile.`
  );
  if (!confirmed) return;
  await trackBusy(async () => {
    state.set('statusText', 'Rendering print canvas… (this may take a moment)')
    await new Promise((r) => setTimeout(r, 60));

    try {
      const { jsPDF } = await import('jspdf');
      const { wMM, hMM } = resolvePaperMM({
        paperSizeId: state.get('paperSizeId'),
        customWidthMM: state.get('customWidthMM'),
        customHeightMM: state.get('customHeightMM'),
      });

      const offscreen = renderPrintCanvas(osmData, bbox);

      state.set('statusText', 'Encoding PDF…')
      await new Promise((r) => setTimeout(r, 60));

      const imgData = offscreen.toDataURL('image/png');

      const pdf = new jsPDF({
        orientation: hMM >= wMM ? 'portrait' : 'landscape',
        unit: 'mm',
        format: [wMM, hMM],
        compress: true,
      });
      pdf.addImage(imgData, 'PNG', 0, 0, wMM, hMM, undefined, 'FAST');
      pdf.save(slugFilename('pdf'));

      state.set('statusText', 'Export complete — PDF downloaded.')
    } catch (err) {
      const msg = `Export failed: ${err.message}`;
      state.set('statusText', msg)
      alert(msg);
      console.error(err);
    }
  });
}

/** Current tiled-export layout (in mm), derived from paper + tiling state. */
export function getTileLayout() {
  const { wMM, hMM } = resolvePaperMM({
    paperSizeId: state.get('paperSizeId'),
    customWidthMM: state.get('customWidthMM'),
    customHeightMM: state.get('customHeightMM'),
  });
  const sheet = TILE_SHEET_SIZES.find((s) => s.id === state.get('tileSheetId')) ?? TILE_SHEET_SIZES[0];
  const layout = computeTileLayout({
    posterW: wMM,
    posterH: hMM,
    sheetW: sheet.w,
    sheetH: sheet.h,
    orientation: state.get('tileOrientation'),
    margin: state.get('tileMarginMM'),
    overlap: state.get('tileOverlapMM'),
  });
  return { layout, sheet, posterW: wMM, posterH: hMM };
}

/**
 * Render the poster and split it into a multi-page PDF of smaller sheets
 * (default A4) with crop marks, registration targets, overlap guides and
 * numbering, plus an optional assembly-guide first page.
 * @param {object} osmData
 * @param {[number,number,number,number]} bbox
 */
export async function exportTiledPDF(osmData, bbox) {
  let tiling;
  try {
    tiling = getTileLayout();
  } catch (err) {
    alert(`Cannot tile poster: ${err.message}`);
    return;
  }
  const { layout, sheet, posterW, posterH } = tiling;
  const confirmed = confirm(
    `Export tiled PDF: ${layout.tiles.length} ${sheet.label} sheets ` +
    `(${layout.rows} rows × ${layout.cols} columns)?\n\n` +
    `⚠ This may use a large amount of memory and take a while, especially on mobile.`
  );
  if (!confirmed) return;
  await trackBusy(async () => {
    state.set('statusText', 'Rendering print canvas… (this may take a moment)');
    await new Promise((r) => setTimeout(r, 60));

    try {
      const { jsPDF } = await import('jspdf');
      const { drawTileSheet, drawAssemblyGuide } = await import('./tiling-pdf.js');

      const offscreen = renderPrintCanvas(osmData, bbox);
      const kx = offscreen.width / posterW;
      const ky = offscreen.height / posterH;
      const title = state.get('title')?.trim() ?? '';

      const { sheetW, sheetH } = layout;
      const orientation = sheetW > sheetH ? 'landscape' : 'portrait';
      const pdf = new jsPDF({ orientation, unit: 'mm', format: [sheetW, sheetH], compress: true });

      if (state.get('tileAssemblyGuide')) {
        // Downscaled preview of the whole poster for the guide page.
        const scale = Math.min(1, 1600 / Math.max(offscreen.width, offscreen.height));
        const thumb = document.createElement('canvas');
        thumb.width = Math.max(1, Math.round(offscreen.width * scale));
        thumb.height = Math.max(1, Math.round(offscreen.height * scale));
        const tctx = thumb.getContext('2d');
        tctx.imageSmoothingQuality = 'high';
        tctx.drawImage(offscreen, 0, 0, thumb.width, thumb.height);
        drawAssemblyGuide(pdf, layout, thumb, {
          posterW, posterH, title,
          posterLabel: state.get('paperSizeId') === 'custom'
            ? `${posterW} x ${posterH} mm`
            : `${state.get('paperSizeId')} (${posterW} x ${posterH} mm)`,
          sheetLabel: `${sheet.label} ${orientation}`,
        });
        pdf.addPage([sheetW, sheetH], orientation);
      }

      const tileCanvas = document.createElement('canvas');
      const tctx = tileCanvas.getContext('2d');
      for (const [i, tile] of layout.tiles.entries()) {
        state.set('statusText', `Encoding sheet ${tile.label} (${i + 1} of ${layout.tiles.length})…`);
        await new Promise((r) => setTimeout(r, 0));

        const sx = Math.round(tile.x * kx);
        const sy = Math.round(tile.y * ky);
        const sw = Math.max(1, Math.min(offscreen.width, Math.round((tile.x + tile.w) * kx)) - sx);
        const sh = Math.max(1, Math.min(offscreen.height, Math.round((tile.y + tile.h) * ky)) - sy);
        tileCanvas.width = sw;
        tileCanvas.height = sh;
        tctx.drawImage(offscreen, sx, sy, sw, sh, 0, 0, sw, sh);

        if (i > 0) pdf.addPage([sheetW, sheetH], orientation);
        drawTileSheet(pdf, layout, tile, tileCanvas.toDataURL('image/png'), { title });
      }

      pdf.save(slugFilename('pdf').replace(/\.pdf$/, `-tiled-${sheet.id.toLowerCase()}.pdf`));
      state.set('statusText', `Export complete — ${layout.tiles.length}-sheet tiled PDF downloaded.`);
    } catch (err) {
      const msg = `Export failed: ${err.message}`;
      state.set('statusText', msg);
      alert(msg);
      console.error(err);
    }
  });
}
