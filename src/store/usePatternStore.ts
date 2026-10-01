import { create } from 'zustand';

// The stitch types a cell can hold. Extend this as your pattern language grows
// (cables, yarn-overs, etc.) — the canvas looks up each type's shape in
// components/stitchShapes.ts.
export type Stitch = 'empty' | 'knit' | 'purl';

export const STITCH_ORDER: Stitch[] = ['empty', 'knit', 'purl'];

// Neutral yarn gray from the Figma stitch design.
export const DEFAULT_YARN = '#d9d9d9';

// Starter yarns: the default gray plus the palette from the Figma file. A
// pattern has a fixed set of this many yarns; edit a swatch to change one.
export const PALETTE_SIZE = 6;
const DEFAULT_PALETTE = [DEFAULT_YARN, '#f2f2f2', '#bfa288', '#8c4a4a', '#594040', '#1f2326'];

export interface Cell {
  stitch: Stitch;
  color: string; // yarn color as #rrggbb; ignored for empty cells
}

// Knitting gauge: stitches and rows in 10 cm of fabric.
export interface Gauge {
  stitches: number;
  rows: number;
}

export const DEFAULT_GAUGE: Gauge = { stitches: 22, rows: 28 };

// Finished garment piece size in cm; the preview fills it with repeats.
export interface Garment {
  width: number;
  length: number;
}

const DEFAULT_GARMENT: Garment = { width: 50, length: 60 };

// The garment's size in stitches and rows at a given gauge.
export function garmentStitches(garment: Garment, gauge: Gauge) {
  return {
    cols: Math.max(1, Math.round((garment.width / 10) * gauge.stitches)),
    rows: Math.max(1, Math.round((garment.length / 10) * gauge.rows)),
  };
}

export interface PatternFile {
  name: string;
  rows: number;
  cols: number;
  cells: Cell[][]; // [row][col]
  garment?: Garment; // missing in older files, which stored repeatX/repeatY instead
  repeatX?: number;
  repeatY?: number;
  palette?: string[]; // yarn swatches; missing in files saved before swatches were editable
  gauge?: Gauge; // missing in files saved before gauge existed
}

export type Tool = 'paint' | 'select';

// How the grid is drawn: realistic stitches, or flat squares like a printed
// knitting chart.
export type View = 'stitch' | 'chart';

// Inclusive cell range; r0/c0 is where the drag started, so it may be below or
// right of r1/c1.
export interface Selection {
  r0: number;
  c0: number;
  r1: number;
  c1: number;
}

// What undo restores: the grid as it was before an edit.
interface Snapshot {
  rows: number;
  cols: number;
  cells: Cell[][];
  palette: string[];
}

const HISTORY_LIMIT = 100;

interface PatternState extends PatternFile {
  palette: string[];
  gauge: Gauge;
  setGauge: (gauge: Gauge) => void;
  // Cells being recolored by an in-progress swatch edit (see editSwatch).
  swatchCells: [number, number][];
  // The "brush": what clicking a cell paints into it.
  activeStitch: Stitch;
  activeColor: string;
  tool: Tool;
  view: View;
  selection: Selection | null;
  past: Snapshot[];
  // Tags the newest history entry so a burst of edits of the same kind (a
  // paint drag, dragging the color picker) undoes as one step.
  historyKey: string | null;
  undo: () => void;
  beginStroke: () => void;
  endStroke: () => void;
  // Picking a stitch or yarn also applies it to the current selection.
  setActiveStitch: (stitch: Stitch) => void;
  setActiveColor: (color: string) => void;
  // Recolor swatch `index` and every stitch knitted in it.
  editSwatch: (index: number, color: string) => void;
  setTool: (tool: Tool) => void;
  setView: (view: View) => void;
  setSelection: (selection: Selection | null) => void;
  fillSelection: () => void;
  paintCell: (row: number, col: number) => void;
  resize: (rows: number, cols: number) => void;
  garment: Garment;
  setGarment: (garment: Garment) => void;
  setName: (name: string) => void;
  loadPattern: (pattern: PatternFile) => void;
}

const DEFAULT_ROWS = 12;
const DEFAULT_COLS = 12;

// New grids (and rows/cols added by resizing) start as plain gray knit
// fabric, so there's always a base to color in.
const blankCell = (): Cell => ({ stitch: 'knit', color: DEFAULT_YARN });

function makeGrid(rows: number, cols: number): Cell[][] {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, blankCell));
}

function applyToSelection(
  cells: Cell[][],
  sel: Selection,
  change: Partial<Cell>
): Cell[][] {
  const [rMin, rMax] = [Math.min(sel.r0, sel.r1), Math.max(sel.r0, sel.r1)];
  const [cMin, cMax] = [Math.min(sel.c0, sel.c1), Math.max(sel.c0, sel.c1)];
  return cells.map((row, r) =>
    r < rMin || r > rMax
      ? row
      : row.map((cell, c) => (c < cMin || c > cMax ? cell : { ...cell, ...change }))
  );
}

// Push the current grid onto the undo stack. With a key, consecutive edits that
// share it collapse into the first entry.
function record(state: PatternState, key: string | null = null): Partial<PatternState> {
  if (key && key === state.historyKey) return {};
  const snapshot = { rows: state.rows, cols: state.cols, cells: state.cells, palette: state.palette };
  return { past: [...state.past, snapshot].slice(-HISTORY_LIMIT), historyKey: key };
}

export const usePatternStore = create<PatternState>((set) => ({
  name: 'untitled-pattern',
  rows: DEFAULT_ROWS,
  cols: DEFAULT_COLS,
  cells: makeGrid(DEFAULT_ROWS, DEFAULT_COLS),
  garment: DEFAULT_GARMENT,
  activeStitch: 'knit',
  activeColor: DEFAULT_YARN,
  tool: 'paint',
  view: 'chart',
  selection: null,
  past: [],
  historyKey: null,
  palette: DEFAULT_PALETTE,
  swatchCells: [],
  gauge: DEFAULT_GAUGE,

  setGauge: (gauge) => set({ gauge }),

  undo: () =>
    set((state) => {
      const prev = state.past[state.past.length - 1];
      if (!prev) return {};
      // If the active yarn's swatch is being reverted, follow it to its old color.
      const i = state.palette.indexOf(state.activeColor);
      const activeColor = i >= 0 && prev.palette[i] ? prev.palette[i] : state.activeColor;
      return { ...prev, activeColor, past: state.past.slice(0, -1), historyKey: null, selection: null };
    }),

  // A paint drag records one snapshot up front; if the drag changed nothing
  // (cells is still the same array), the snapshot is dropped again.
  beginStroke: () => set((state) => record(state, 'stroke')),
  endStroke: () =>
    set((state) => {
      if (state.historyKey !== 'stroke') return {};
      const top = state.past[state.past.length - 1];
      return top?.cells === state.cells
        ? { past: state.past.slice(0, -1), historyKey: null }
        : { historyKey: null };
    }),

  setActiveStitch: (activeStitch) =>
    set((state) => ({
      activeStitch,
      ...(state.selection && {
        ...record(state),
        cells: applyToSelection(state.cells, state.selection, { stitch: activeStitch }),
      }),
    })),
  setActiveColor: (activeColor) =>
    set((state) => ({
      activeColor,
      ...(state.selection && {
        ...record(state),
        cells: applyToSelection(state.cells, state.selection, { color: activeColor }),
      }),
    })),
  // Dragging the color picker fires many edits; they share one undo step, and
  // the cells to recolor are captured once at the start. Matching by color on
  // every tick could otherwise pull in stitches of another yarn the picker
  // happens to pass through.
  editSwatch: (index, color) =>
    set((state) => {
      const old = state.palette[index];
      if (old === undefined || old === color) return {};
      const key = `swatch-${index}`;
      const swatchCells: [number, number][] =
        state.historyKey === key
          ? state.swatchCells
          : state.cells.flatMap((row, r) =>
              row.flatMap((cell, c): [number, number][] => (cell.color === old ? [[r, c]] : []))
            );
      const cells = state.cells.map((row) => [...row]);
      for (const [r, c] of swatchCells) cells[r][c] = { ...cells[r][c], color };
      const palette = state.palette.map((p, i) => (i === index ? color : p));
      return {
        ...record(state, key),
        cells,
        palette,
        swatchCells,
        activeColor: state.activeColor === old ? color : state.activeColor,
      };
    }),

  setTool: (tool) => set({ tool, selection: null }),
  setView: (view) => set({ view }),
  setSelection: (selection) => set({ selection }),
  fillSelection: () =>
    set((state) =>
      state.selection
        ? {
            ...record(state),
            cells: applyToSelection(state.cells, state.selection, {
              stitch: state.activeStitch,
              color: state.activeColor,
            }),
          }
        : {}
    ),

  paintCell: (row, col) =>
    set((state) => {
      const current = state.cells[row]?.[col];
      if (!current) return {};
      // Dragging repeatedly over the same cell shouldn't trigger re-renders.
      if (current.stitch === state.activeStitch && current.color === state.activeColor) return {};
      const cells = state.cells.map((r) => [...r]);
      cells[row][col] = { stitch: state.activeStitch, color: state.activeColor };
      return { cells };
    }),

  resize: (rows, cols) =>
    set((state) => {
      // Knitting starts bottom-right, so the grid is anchored there: rows are
      // added/removed at the top and columns at the left.
      const dr = rows - state.rows;
      const dc = cols - state.cols;
      const cells = makeGrid(rows, cols);
      for (let r = Math.max(0, dr); r < rows; r++) {
        for (let c = Math.max(0, dc); c < cols; c++) {
          cells[r][c] = state.cells[r - dr][c - dc];
        }
      }
      return { ...record(state), rows, cols, cells, selection: null };
    }),

  setGarment: (garment) => set({ garment }),
  setName: (name) => set({ name }),

  loadPattern: (pattern) =>
    set((state) => ({
      ...record(state),
      name: pattern.name,
      rows: pattern.rows,
      cols: pattern.cols,
      cells: pattern.cells,
      ...(pattern.palette && { palette: pattern.palette.slice(0, PALETTE_SIZE) }),
      ...(pattern.gauge && { gauge: pattern.gauge }),
      ...(pattern.garment
        ? { garment: pattern.garment }
        : pattern.repeatX &&
          pattern.repeatY && {
            // Older files: turn the repeat counts into the size they covered.
            garment: (() => {
              const gauge = pattern.gauge ?? state.gauge;
              const cm = (n: number) => Math.round(n * 10) / 10;
              return {
                width: cm(((pattern.repeatX * pattern.cols) / gauge.stitches) * 10),
                length: cm(((pattern.repeatY * pattern.rows) / gauge.rows) * 10),
              };
            })(),
          }),
      selection: null,
    })),
}));
