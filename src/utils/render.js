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
 * Render an array of polylines (ways) onto a canvas context as strokes.
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

/**
 * Render an array of closed ways (polygon-like areas, e.g. water, parks,
 * buildings) onto a canvas context as filled shapes. Each ring is filled
 * independently (no hole-cutting), which is a reasonable approximation for
 * simple OSM area ways.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {[number,number][][]} ways   Array of polygon rings
 * @param {{ originX: number, originY: number, scale: number }} transform
 * @param {string}  fillStyle          CSS colour string
 */
export function renderFilledWays(ctx, ways, transform, fillStyle) {
  if (!ways || ways.length === 0) return;

  ctx.fillStyle = fillStyle;

  for (const way of ways) {
    if (way.length < 3) continue;

    ctx.beginPath();
    const [x0, y0] = toCanvas(...toMercator(way[0][0], way[0][1]), transform);
    ctx.moveTo(x0, y0);

    for (let i = 1; i < way.length; i++) {
      const [x, y] = toCanvas(...toMercator(way[i][0], way[i][1]), transform);
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  }
}

/**
 * Render a layer using the mode declared on its style ('fill' or 'stroke').
 * @param {CanvasRenderingContext2D} ctx
 * @param {[number,number][][]} ways
 * @param {{ originX: number, originY: number, scale: number }} transform
 * @param {{ color: string, stroke: number, mode?: 'fill'|'stroke' }} style
 */
export function renderLayer(ctx, ways, transform, style) {
  if (style.mode === 'fill') {
    renderFilledWays(ctx, ways, transform, style.color);
  } else {
    renderWays(ctx, ways, transform, style.color, style.stroke);
  }
}

/**
 * Draw a title block (city/title + coordinate subtitle) near the bottom of
 * the print canvas. Sizing scales with canvas height so it looks consistent
 * across paper sizes.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ title: string, subtitle: string, width: number, height: number }} opts
 */
export function drawTitleBlock(ctx, { title, subtitle, width, height }) {
  if (!title && !subtitle) return;

  const titleSize = Math.round(height * 0.028);
  const subtitleSize = Math.round(height * 0.012);
  const bottomMargin = height * 0.06;
  const gap = height * 0.012;

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  let y = height - bottomMargin;

  if (subtitle) {
    ctx.font = `${subtitleSize}px sans-serif`;
    ctx.fillStyle = '#333333';
    ctx.letterSpacing = `${Math.round(subtitleSize * 0.3)}px`;
    ctx.fillText(subtitle.toUpperCase(), width / 2, y);
    ctx.letterSpacing = '0px';
    y -= subtitleSize + gap;
  }

  if (title) {
    ctx.font = `${titleSize}px serif`;
    ctx.fillStyle = '#111111';
    ctx.fillText(title, width / 2, y);
  }

  ctx.restore();
}
