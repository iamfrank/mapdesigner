import { toMercator, toCanvas } from './projection.js';

/**
 * Clear a canvas and fill it with white.
 * @param {CanvasRenderingContext2D} ctx
 */
export function clearCanvas(ctx) {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}

/**
 * Render an array of polylines (ways) onto a canvas context.
 *
 * Each way is an array of [lon, lat] coordinate pairs.
 * All ways are drawn in a single path for performance.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {[number,number][][]} ways         Array of polylines
 * @param {{ originX: number, originY: number, scale: number }} transform
 * @param {string}  strokeStyle             CSS colour string
 * @param {number}  lineWidth               Stroke width in canvas pixels
 */
export function renderWays(ctx, ways, transform, strokeStyle, lineWidth) {
  if (!ways || ways.length === 0) return;

  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  ctx.beginPath();

  for (const way of ways) {
    if (way.length < 2) continue;

    const [x0, y0] = toCanvas(...toMercator(way[0][0], way[0][1]), transform);
    ctx.moveTo(x0, y0);

    for (let i = 1; i < way.length; i++) {
      const [x, y] = toCanvas(...toMercator(way[i][0], way[i][1]), transform);
      ctx.lineTo(x, y);
    }
  }

  ctx.stroke();
}
