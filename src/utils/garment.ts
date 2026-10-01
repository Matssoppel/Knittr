import type { CableDir, Cell, Garment, GarmentLayout, Gauge, Region, Swatch } from '../store/usePatternStore';

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

export interface PlacedCable {
  row: number;
  start: number; // leftmost column
  span: number;
  dir: CableDir;
}

// The cables in a grid whose stitches all still carry matching markers. A
// cable cut short (painted over, or split at the edge of a swatch area) isn't
// shown.
export function findCables(grid: Grid): PlacedCable[] {
  const found: PlacedCable[] = [];
  grid.forEach((row, r) => {
    row.forEach((cell, c) => {
      const cable = cell?.cable;
      if (!cable || cable.pos !== 0 || cable.span < 2 || cable.span % 2 !== 0) return;
      for (let i = 1; i < cable.span; i++) {
        const other = row[c + i]?.cable;
        if (!other || other.pos !== i || other.span !== cable.span || other.dir !== cable.dir) return;
      }
      found.push({ row: r, start: c, span: cable.span, dir: cable.dir });
    });
  });
  return found;
}

// How cable stitches lean in stitch view, keyed by cellKey(row, col) in grid
// coordinates: the column (possibly between two) where the stitch's foot sits
// on the row below and where its top is, and whether it crosses in front or
// behind. Each strand of the cable is a straight path from its old column to
// its new one, spread over more rows the wider the cable is: 2 stitches cross
// within the cable row, and every further 2 add a row above and below. Below
// the cable row a strand is the stitch at its old column; from the cable row
// up, the stitch at its new one.
export interface StitchLean {
  foot: number;
  top: number;
  front: boolean;
  back: boolean;
}

export interface CableLeans {
  leans: Map<string, StitchLean>;
  // The rows each cable's strands run through, in the order of `cables`.
  extents: { top: number; bottom: number }[];
}

export function cableLeans(cables: PlacedCable[], rows: number): CableLeans {
  const leans = new Map<string, StitchLean>();
  const cableRows = new Set(cables.map((cable) => cable.row));
  const extents = cables.map(({ row, start, span, dir }) => {
    const half = span / 2;
    // Spread up to half - 1 rows each way, stopping short of the grid's edge,
    // another cable's row, or rows another cable already leans through.
    const free = (r: number) =>
      r >= 0 &&
      r < rows &&
      !cableRows.has(r) &&
      Array.from({ length: span }, (_, i) => cellKey(r, start + i)).every((k) => !leans.has(k));
    let reach = 0;
    while (reach < half - 1 && free(row - reach - 1) && free(row + reach + 1)) reach++;
    const steps = 2 * reach + 1;
    for (let i = 0; i < span; i++) {
      const to = start + i;
      const leftHalf = i < half;
      const from = leftHalf ? to + half : to - half;
      // The half on the arrow's tail side travels in front to the head side.
      const front = dir === 'right' ? !leftHalf : leftHalf;
      for (let j = 0; j < steps; j++) {
        const r = row + reach - j; // j counts rows up from the bottom of the path
        const col = r > row ? from : to;
        leans.set(cellKey(r, col), {
          foot: from + ((to - from) * j) / steps,
          top: from + ((to - from) * (j + 1)) / steps,
          front,
          back: r === row && !front,
        });
      }
    }
    return { top: row - reach, bottom: row + reach };
  });
  return { leans, extents };
}
