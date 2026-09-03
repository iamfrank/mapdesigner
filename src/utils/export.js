import { computeTransform } from './projection.js';
import { clearCanvas, renderLayer, drawTitleBlock } from './render.js';
import { getPrintPx } from './state.js';
import state from './state.js'

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

  const printTransform = computeTransform(bbox, printW, printH);

  clearCanvas(ctx);

  const styles = state.get('styles');
  for (const style of styles) {
    if (!style.visible) continue;
    renderLayer(ctx, osmData[style.id], printTransform, style);
  }

  if (state.get('showTitleBlock')) {
    const title = state.get('title');
    const subtitle = state.get('autoSubtitle')
      ? formatCoords(state.get('center'))
      : state.get('subtitle');
    drawTitleBlock(ctx, { title, subtitle, width: printW, height: printH });
  }

  return offscreen;
}

function formatCoords([lon, lat]) {
  const latLabel = `${Math.abs(lat).toFixed(4)}°${lat >= 0 ? 'N' : 'S'}`;
  const lonLabel = `${Math.abs(lon).toFixed(4)}°${lon >= 0 ? 'E' : 'W'}`;
  return `${latLabel} / ${lonLabel}`;
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

  state.set('statusText', 'Rendering print canvas… (this may take a moment)')
  await new Promise((r) => setTimeout(r, 60));

  try {
    const offscreen = renderPrintCanvas(osmData, bbox);

    state.set('statusText', 'Encoding PNG…')
    await new Promise((r) => setTimeout(r, 60));

    offscreen.toBlob((blob) => {
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
    }, 'image/png');
  } catch (err) {
    const msg = `Export failed: ${err.message}`;
    state.set('statusText', msg)
    alert(msg);
    console.error(err);
  }
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

  state.set('statusText', 'Rendering print canvas… (this may take a moment)')
  await new Promise((r) => setTimeout(r, 60));

  try {
    const { jsPDF } = await import('jspdf');
    const { resolvePaperMM } = await import('./paper.js');
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
}
