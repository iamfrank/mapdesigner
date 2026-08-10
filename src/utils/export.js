import { computeTransform } from './projection.js';
import { clearCanvas, renderWays } from './render.js';
import { PRINT_H, PRINT_W } from './state.js';
import state from './state.js'

/**
 * Render the full A0 / 300 DPI map to an offscreen canvas and trigger a PNG download.
 *
 * @param {{ streets: [number,number][][], coastlines: [number,number][][] }} osmData
 * @param {[number,number,number,number]} bbox  [minLat, minLon, maxLat, maxLon]
 */
export async function exportPNG(osmData, bbox) {
  const confirmed = confirm(
    `Export full-resolution PNG at A0 / 300 DPI (${PRINT_W} × ${PRINT_H} px)?\n\n` +
    `⚠ This requires ~530 MB of canvas memory and may take a while.\n` +
    `It may fail on mobile or lower-spec systems.`
  );
  if (!confirmed) return;

  state.set('statusText', 'Rendering print canvas… (this may take a moment)')

  // Yield to the browser so the status message is painted before the heavy work
  await new Promise((r) => setTimeout(r, 60));

  try {
    const offscreen = document.createElement('canvas');
    offscreen.width = PRINT_W;
    offscreen.height = PRINT_H;

    const ctx = offscreen.getContext('2d');
    if (!ctx) throw new Error('Could not obtain 2D context for offscreen canvas.');

    const printTransform = computeTransform(bbox, PRINT_W, PRINT_H);

    clearCanvas(ctx);
    renderWays(ctx, osmData.streets, printTransform, '#000000', 1);
    renderWays(ctx, osmData.coastlines, printTransform, '#cc0000', 2);

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
      a.download = 'roskilde-map.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      state.set('statusText', 'Export complete — roskilde-map.png downloaded.')
    }, 'image/png');
  } catch (err) {
    const msg = `Export failed: ${err.message}`;
    state.set('statusText', msg)
    alert(msg);
    console.error(err);
  }
}
