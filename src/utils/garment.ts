import type { Cell, Garment, GarmentLayout, Gauge, Region, Swatch } from '../store/usePatternStore';

// A grid as drawn: null marks a spot with no fabric (shaped away by an
// increase or decrease).
export type Grid = (Cell | null)[][];

// Garment positions are stored in knitting order — rows counted up from the
// bottom, stitches counted in from the right — so resizing the garment only
// adds or removes rows at the top and stitches at the left.
export const cellKey = (rb: number, cr: number) => `${rb},${cr}`;

// The garment's size in stitches and rows at a given gauge.
export function garmentStitches(garment: Garment, gauge: Gauge) {
  return {
    cols: Math.max(1, Math.round((garment.width / 10) * gauge.stitches)),
    rows: Math.max(1, Math.round((garment.length / 10) * gauge.rows)),
  };
}

// The swatch stitch at a position measured from a tile's bottom-right corner.
export function tileCell(swatch: Swatch, rFromBottom: number, cFromRight: number): Cell {
  return swatch.cells[swatch.rows - 1 - (rFromBottom % swatch.rows)][
    swatch.cols - 1 - (cFromRight % swatch.cols)
  ];
}

// An outRows × outCols grid filled with repeats of a swatch, anchored
// bottom-right so partial repeats land at the top and left.
export function tileGrid(swatch: Swatch, outRows: number, outCols: number): Grid {
  return Array.from({ length: outRows }, (_, r) =>
    Array.from({ length: outCols }, (_, c) => tileCell(swatch, outRows - 1 - r, outCols - 1 - c))
  );
}

// A region's extent at the garment's current size: full-width and
// full-height bands stretch to whatever the garment is now.
export function regionBounds(region: Region, rows: number, cols: number) {
  return {
    rb0: region.span === 'height' ? 0 : region.rb0,
    rb1: region.span === 'height' ? rows - 1 : region.rb1,
    cr0: region.span === 'width' ? 0 : region.cr0,
    cr1: region.span === 'width' ? cols - 1 : region.cr1,
  };
}

// Is the stitch at (rb, cr) knitted, given the garment's shaping?
export function isKnitted(layout: GarmentLayout, rb: number, cr: number): boolean {
  const s = layout.shaping[cr];
  if (!s) return true;
  return (s.bottom === undefined || rb >= s.bottom) && (s.top === undefined || rb <= s.top);
}

// Flatten the garment's layers into a drawable grid (row 0 at the top): the
// base yarn, then swatch areas in the order they were painted, then single
// stitch edits, then shaping.
export function buildGarmentGrid(
  layout: GarmentLayout,
  swatches: Swatch[],
  base: Cell,
  rows: number,
  cols: number
): Grid {
  const grid: Grid = Array.from({ length: rows }, () => Array<Cell | null>(cols).fill(base));
  const byId = new Map(swatches.map((s) => [s.id, s]));

  for (const region of layout.regions) {
    const swatch = byId.get(region.swatchId);
    if (!swatch) continue;
    const { rb0, rb1, cr0, cr1 } = regionBounds(region, rows, cols);
    for (let rb = Math.max(0, rb0); rb <= Math.min(rows - 1, rb1); rb++) {
      for (let cr = Math.max(0, cr0); cr <= Math.min(cols - 1, cr1); cr++) {
        grid[rows - 1 - rb][cols - 1 - cr] = tileCell(swatch, rb - rb0, cr - cr0);
      }
    }
  }

  for (const [key, cell] of Object.entries(layout.overrides)) {
    const [rb, cr] = key.split(',').map(Number);
    if (rb < rows && cr < cols) grid[rows - 1 - rb][cols - 1 - cr] = cell;
  }

  for (const key of Object.keys(layout.shaping)) {
    const cr = Number(key);
    if (cr >= cols) continue;
    for (let rb = 0; rb < rows; rb++) {
      if (!isKnitted(layout, rb, cr)) grid[rows - 1 - rb][cols - 1 - cr] = null;
    }
  }

  return grid;
}
