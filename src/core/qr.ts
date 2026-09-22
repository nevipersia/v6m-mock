// Draws a QR-style code as inline SVG. It has the real layout (finder squares,
// timing lines, an alignment mark and quiet zone) but the data modules are a
// pattern derived from the payload, not a real QR encoding, so phones will not
// scan it. Good enough for a mock payment screen; swap in a real encoder, or
// the payment provider's own QR image, for a live build.

import { hash } from './qr-payment.js';

const SIZE = 29; // a version 3 QR
const QUIET = 2;

type Grid = boolean[][];

function emptyGrid(): { grid: Grid; reserved: Grid } {
  const make = () => Array.from({ length: SIZE }, () => Array<boolean>(SIZE).fill(false));
  return { grid: make(), reserved: make() };
}

function square(grid: Grid, reserved: Grid, top: number, left: number, outer: number): void {
  for (let y = -1; y <= outer; y += 1) {
    for (let x = -1; x <= outer; x += 1) {
      const row = top + y;
      const col = left + x;
      if (row < 0 || col < 0 || row >= SIZE || col >= SIZE) continue;
      const ring = Math.max(Math.abs(y - (outer - 1) / 2), Math.abs(x - (outer - 1) / 2));
      const edge = (outer - 1) / 2;
      const on = y >= 0 && x >= 0 && y < outer && x < outer && (ring === edge || ring <= edge - 2);
      grid[row]![col] = on;
      reserved[row]![col] = true;
    }
  }
}

/** Seeded xorshift so the same payload always draws the same code. */
function random(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0xffffffff;
  };
}

function modules(payload: string): Grid {
  const { grid, reserved } = emptyGrid();
  square(grid, reserved, 0, 0, 7);
  square(grid, reserved, 0, SIZE - 7, 7);
  square(grid, reserved, SIZE - 7, 0, 7);
  square(grid, reserved, SIZE - 9, SIZE - 9, 5);

  for (let i = 8; i < SIZE - 8; i += 1) {
    grid[6]![i] = i % 2 === 0;
    grid[i]![6] = i % 2 === 0;
    reserved[6]![i] = true;
    reserved[i]![6] = true;
  }

  const next = random(hash(payload));
  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      if (!reserved[row]![col]) grid[row]![col] = next() < 0.5;
    }
  }
  return grid;
}

/** SVG markup for the payload's code. `label` is read out by screen readers. */
export function qrSvg(payload: string, label: string): string {
  const grid = modules(payload);
  const full = SIZE + QUIET * 2;
  let path = '';
  grid.forEach((row, y) => row.forEach((on, x) => {
    if (on) path += `M${x + QUIET} ${y + QUIET}h1v1h-1z`;
  }));
  const safeLabel = label.replace(/[&<>"]/g, '');
  return `<svg class="qr" viewBox="0 0 ${full} ${full}" role="img" aria-label="${safeLabel}" shape-rendering="crispEdges">`
    + `<rect width="${full}" height="${full}" fill="#fff"/><path d="${path}" fill="#1F2D5C"/></svg>`;
}
