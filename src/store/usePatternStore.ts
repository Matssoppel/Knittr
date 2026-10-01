import { create } from 'zustand';
import { buildGarmentGrid, cellKey, garmentStitches } from '../utils/garment';

// The stitch types a cell can hold. Extend this as your pattern language grows
// (cables, yarn-overs, etc.) — the canvas looks up each type's shape in
// components/stitchShapes.ts.
export type Stitch = 'empty' | 'knit' | 'purl';

export const STITCH_ORDER: Stitch[] = ['empty', 'knit', 'purl'];

// Neutral yarn gray from the Figma stitch design.
export const DEFAULT_YARN = '#d9d9d9';

// Starter yarns: the default gray plus the palette from the Figma file. A
// pattern has a fixed set of this many yarns; edit one to change it. The first
// yarn is the garment's main color.
export const PALETTE_SIZE = 6;
export const DEFAULT_PALETTE = [DEFAULT_YARN, '#f2f2f2', '#bfa288', '#8c4a4a', '#594040', '#1f2326'];

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

// Finished garment piece size in cm.
export interface Garment {
  width: number;
  length: number;
}

const DEFAULT_GARMENT: Garment = { width: 50, length: 60 };

// A small repeating pattern, designed in the swatch maker and painted onto
// the garment.
export interface Swatch {
  id: string;
  name: string;
  rows: number;
  cols: number;
  cells: Cell[][]; // [row][col], row 0 at the top
}

// An area of the garment filled with a swatch. Coordinates are in knitting
// order (rows up from the bottom, stitches in from the right), inclusive; the
// swatch tiles from the area's bottom-right corner. It stays linked: editing
// the swatch changes every area that uses it.
export interface Region {
  swatchId: string;
  // A band across the whole garment: 'width' ignores cr0/cr1 and 'height'
  // ignores rb0/rb1, so the band keeps spanning the garment when it's resized.
  span?: SwatchFill;
  rb0: number;
  cr0: number;
  rb1: number;
  cr1: number;
}

// Per column (stitches in from the right): the first and last knitted row,
// set by an increase or decrease. Missing means the column runs the full
// length.
export interface ColumnShaping {
  bottom?: number;
  top?: number;
}

// Everything painted onto the garment, layered: swatch areas, then single
// stitch edits, then shaping.
export interface GarmentLayout {
  regions: Region[];
  overrides: Record<string, Cell>; // keyed by cellKey(rb, cr)
  shaping: Record<number, ColumnShaping>;
}

const EMPTY_LAYOUT: GarmentLayout = { regions: [], overrides: {}, shaping: {} };

// The whole saved pattern.
export interface PatternDoc {
  name: string;
  palette: string[];
  gauge: Gauge;
  garment: Garment;
  swatches: Swatch[];
  layout: GarmentLayout;
}

export type Mode = 'swatch' | 'garment';

// 'swatch' drags out an area to fill with the active swatch; 'increase' and
// 'decrease' shape the garment's edge. Those three only exist in garment mode.
export type Tool = 'paint' | 'select' | 'swatch' | 'increase' | 'decrease';

export const GARMENT_ONLY_TOOLS: Tool[] = ['swatch', 'increase', 'decrease'];

// How the swatch tool fills: the dragged rectangle, or the dragged rows across
// the full garment width, or the dragged columns up its full height.
export type SwatchFill = 'area' | 'width' | 'height';

// How the grid is drawn: realistic stitches, or flat squares like a printed
// knitting chart.
export type View = 'stitch' | 'chart';

// Inclusive cell range in the grid on screen (row 0 at the top); r0/c0 is
// where the drag started, so it may be below or right of r1/c1.
export interface Selection {
  r0: number;
  c0: number;
  r1: number;
  c1: number;
}

// What undo restores.
interface Snapshot {
  swatches: Swatch[];
  layout: GarmentLayout;
  palette: string[];
}

const HISTORY_LIMIT = 100;

// Cells a yarn edit is recoloring, captured when the edit starts.
interface YarnEditTargets {
  swatchCells: Record<string, [number, number][]>;
  overrideKeys: string[];
}

interface PatternState extends PatternDoc {
  mode: Mode;
  activeSwatchId: string;
  // The "brush": what painting puts into a stitch.
  activeStitch: Stitch;
  activeColor: string;
  tool: Tool;
  swatchFill: SwatchFill;
  view: View;
  selection: Selection | null;
  past: Snapshot[];
  // Tags the newest history entry so a burst of edits of the same kind (a
  // paint drag, dragging the color picker) undoes as one step.
  historyKey: string | null;
  yarnEdit: YarnEditTargets;

  setMode: (mode: Mode) => void;
  setName: (name: string) => void;
  setGauge: (gauge: Gauge) => void;
  setGarment: (garment: Garment) => void;
  setTool: (tool: Tool) => void;
  setSwatchFill: (fill: SwatchFill) => void;
  setView: (view: View) => void;
  setSelection: (selection: Selection | null) => void;

  selectSwatch: (id: string) => void;
  addSwatch: () => void;
  deleteSwatch: (id: string) => void;
  renameSwatch: (name: string) => void;
  resizeSwatch: (rows: number, cols: number) => void;

  // Picking a stitch or yarn also applies it to the current selection.
  setActiveStitch: (stitch: Stitch) => void;
  setActiveColor: (color: string) => void;
  // Recolor yarn `index` and every stitch knitted in it.
  editYarn: (index: number, color: string) => void;
  fillSelection: () => void;
  paintCell: (row: number, col: number) => void;
  // Fill the selection with the active swatch (garment mode).
  fillAreaWithSwatch: () => void;
  // Increase/decrease at a garment stitch: blank every row below/above it.
  shapeColumn: (row: number, col: number) => void;
  // Reset the showing grid to plain knit in the main yarn: the active swatch,
  // or the whole garment (swatch areas, stitch edits and shaping).
  clearAll: () => void;

  undo: () => void;
  beginStroke: () => void;
  endStroke: () => void;
  loadPattern: (doc: PatternDoc) => void;
}

const DEFAULT_ROWS = 12;
const DEFAULT_COLS = 12;

// New swatches (and rows/cols added by resizing) start as plain knit fabric in
// the main yarn, so there's always a base to color in.
function makeGrid(rows: number, cols: number, color: string): Cell[][] {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, (): Cell => ({ stitch: 'knit', color }))
  );
}

let nextId = 1;
const newId = () => `s${Date.now().toString(36)}${nextId++}`;

function newSwatch(name: string, color: string): Swatch {
  return {
    id: newId(),
    name,
    rows: DEFAULT_ROWS,
    cols: DEFAULT_COLS,
    cells: makeGrid(DEFAULT_ROWS, DEFAULT_COLS, color),
  };
}

function selectionBounds(sel: Selection) {
  return {
    rMin: Math.min(sel.r0, sel.r1),
    rMax: Math.max(sel.r0, sel.r1),
    cMin: Math.min(sel.c0, sel.c1),
    cMax: Math.max(sel.c0, sel.c1),
  };
}

function applyToCells(cells: Cell[][], sel: Selection, change: Partial<Cell>): Cell[][] {
  const { rMin, rMax, cMin, cMax } = selectionBounds(sel);
  return cells.map((row, r) =>
    r < rMin || r > rMax
      ? row
      : row.map((cell, c) => (c < cMin || c > cMax ? cell : { ...cell, ...change }))
  );
}

function activeSwatch(state: PatternState): Swatch {
  return state.swatches.find((s) => s.id === state.activeSwatchId) ?? state.swatches[0];
}

function updateActiveSwatch(state: PatternState, fn: (s: Swatch) => Swatch): Swatch[] {
  return state.swatches.map((s) => (s.id === state.activeSwatchId ? fn(s) : s));
}

function garmentDims(state: PatternState) {
  return garmentStitches(state.garment, state.gauge);
}

// Set stitch edits on every garment stitch in the selection, starting from
// what's currently shown there so a stitch-only change keeps each stitch's
// color (and vice versa).
function applyToGarment(state: PatternState, sel: Selection, change: Partial<Cell>): GarmentLayout {
  const { rows, cols } = garmentDims(state);
  const base: Cell = { stitch: 'knit', color: state.palette[0] };
  const grid = buildGarmentGrid(state.layout, state.swatches, base, rows, cols);
  const { rMin, rMax, cMin, cMax } = selectionBounds(sel);
  const overrides = { ...state.layout.overrides };
  for (let r = rMin; r <= rMax; r++) {
    for (let c = cMin; c <= cMax; c++) {
      const shown = grid[r]?.[c];
      if (!shown) continue;
      overrides[cellKey(rows - 1 - r, cols - 1 - c)] = { ...shown, ...change };
    }
  }
  return { ...state.layout, overrides };
}

// Apply a stitch/yarn change to the selection in whichever grid is showing.
function changeSelection(state: PatternState, change: Partial<Cell>): Partial<PatternState> {
  if (!state.selection) return {};
  if (state.mode === 'garment') {
    return { ...record(state), layout: applyToGarment(state, state.selection, change) };
  }
  const sel = state.selection;
  return {
    ...record(state),
    swatches: updateActiveSwatch(state, (s) => ({ ...s, cells: applyToCells(s.cells, sel, change) })),
  };
}

// Push the current document onto the undo stack. With a key, consecutive
// edits that share it collapse into the first entry.
function record(state: PatternState, key: string | null = null): Partial<PatternState> {
  if (key && key === state.historyKey) return {};
  const snapshot = { swatches: state.swatches, layout: state.layout, palette: state.palette };
  return { past: [...state.past, snapshot].slice(-HISTORY_LIMIT), historyKey: key };
}

const firstSwatch = newSwatch('Swatch 1', DEFAULT_YARN);

export const usePatternStore = create<PatternState>((set) => ({
  name: 'untitled-pattern',
  palette: DEFAULT_PALETTE,
  gauge: DEFAULT_GAUGE,
  garment: DEFAULT_GARMENT,
  swatches: [firstSwatch],
  layout: EMPTY_LAYOUT,
  mode: 'swatch',
  activeSwatchId: firstSwatch.id,
  activeStitch: 'knit',
  activeColor: DEFAULT_YARN,
  tool: 'paint',
  swatchFill: 'area',
  view: 'chart',
  selection: null,
  past: [],
  historyKey: null,
  yarnEdit: { swatchCells: {}, overrideKeys: [] },

  setMode: (mode) =>
    set((state) => ({
      mode,
      selection: null,
      tool: mode === 'swatch' && GARMENT_ONLY_TOOLS.includes(state.tool) ? 'paint' : state.tool,
    })),
  setName: (name) => set({ name }),
  // Changing the garment's stitch count can leave a selection out of range.
  setGauge: (gauge) => set({ gauge, selection: null }),
  setGarment: (garment) => set({ garment, selection: null }),
  setTool: (tool) => set({ tool, selection: null }),
  setSwatchFill: (swatchFill) => set({ swatchFill, tool: 'swatch', selection: null }),
  setView: (view) => set({ view }),
  setSelection: (selection) => set({ selection }),

  selectSwatch: (id) =>
    set((state) => ({ activeSwatchId: id, selection: state.mode === 'swatch' ? null : state.selection })),
  addSwatch: () =>
    set((state) => {
      const swatch = newSwatch(`Swatch ${state.swatches.length + 1}`, state.palette[0]);
      return { ...record(state), swatches: [...state.swatches, swatch], activeSwatchId: swatch.id, selection: null };
    }),
  // Deleting a swatch also removes the garment areas painted with it.
  deleteSwatch: (id) =>
    set((state) => {
      if (state.swatches.length <= 1) return {};
      const swatches = state.swatches.filter((s) => s.id !== id);
      return {
        ...record(state),
        swatches,
        layout: { ...state.layout, regions: state.layout.regions.filter((r) => r.swatchId !== id) },
        activeSwatchId: state.activeSwatchId === id ? swatches[0].id : state.activeSwatchId,
        selection: null,
      };
    }),
  renameSwatch: (name) => set((state) => ({ swatches: updateActiveSwatch(state, (s) => ({ ...s, name })) })),
  resizeSwatch: (rows, cols) =>
    set((state) => ({
      ...record(state),
      selection: null,
      swatches: updateActiveSwatch(state, (s) => {
        // Knitting starts bottom-right, so the grid is anchored there: rows are
        // added/removed at the top and columns at the left.
        const dr = rows - s.rows;
        const dc = cols - s.cols;
        const cells = makeGrid(rows, cols, state.palette[0]);
        for (let r = Math.max(0, dr); r < rows; r++) {
          for (let c = Math.max(0, dc); c < cols; c++) {
            cells[r][c] = s.cells[r - dr][c - dc];
          }
        }
        return { ...s, rows, cols, cells };
      }),
    })),

  setActiveStitch: (activeStitch) =>
    set((state) => ({ activeStitch, ...changeSelection(state, { stitch: activeStitch }) })),
  setActiveColor: (activeColor) =>
    set((state) => ({ activeColor, ...changeSelection(state, { color: activeColor }) })),
  fillSelection: () =>
    set((state) => changeSelection(state, { stitch: state.activeStitch, color: state.activeColor })),

  // Dragging the color picker fires many edits; they share one undo step, and
  // the stitches to recolor are captured once at the start. Matching by color
  // on every tick could otherwise pull in stitches of another yarn the picker
  // happens to pass through.
  editYarn: (index, color) =>
    set((state) => {
      const old = state.palette[index];
      if (old === undefined || old === color) return {};
      const key = `yarn-${index}`;
      const targets: YarnEditTargets =
        state.historyKey === key
          ? state.yarnEdit
          : {
              swatchCells: Object.fromEntries(
                state.swatches.map((s) => [
                  s.id,
                  s.cells.flatMap((row, r) =>
                    row.flatMap((cell, c): [number, number][] => (cell.color === old ? [[r, c]] : []))
                  ),
                ])
              ),
              overrideKeys: Object.keys(state.layout.overrides).filter(
                (k) => state.layout.overrides[k].color === old
              ),
            };
      const swatches = state.swatches.map((s) => {
        const hits = targets.swatchCells[s.id];
        if (!hits?.length) return s;
        const cells = s.cells.map((row) => [...row]);
        for (const [r, c] of hits) cells[r][c] = { ...cells[r][c], color };
        return { ...s, cells };
      });
      const overrides = { ...state.layout.overrides };
      for (const k of targets.overrideKeys) overrides[k] = { ...overrides[k], color };
      return {
        ...record(state, key),
        swatches,
        layout: { ...state.layout, overrides },
        palette: state.palette.map((p, i) => (i === index ? color : p)),
        yarnEdit: targets,
        activeColor: state.activeColor === old ? color : state.activeColor,
      };
    }),

  paintCell: (row, col) =>
    set((state) => {
      const brush = { stitch: state.activeStitch, color: state.activeColor };
      if (state.mode === 'garment') {
        const { rows, cols } = garmentDims(state);
        const key = cellKey(rows - 1 - row, cols - 1 - col);
        const current = state.layout.overrides[key];
        // Dragging repeatedly over the same stitch shouldn't trigger re-renders.
        if (current?.stitch === brush.stitch && current.color === brush.color) return {};
        return { layout: { ...state.layout, overrides: { ...state.layout.overrides, [key]: brush } } };
      }
      const current = activeSwatch(state).cells[row]?.[col];
      if (!current || (current.stitch === brush.stitch && current.color === brush.color)) return {};
      return {
        swatches: updateActiveSwatch(state, (s) => {
          const cells = s.cells.map((r) => [...r]);
          cells[row][col] = brush;
          return { ...s, cells };
        }),
      };
    }),

  // A new swatch area replaces any single-stitch edits underneath it.
  fillAreaWithSwatch: () =>
    set((state) => {
      if (!state.selection || state.mode !== 'garment') return {};
      const { rows, cols } = garmentDims(state);
      const { rMin, rMax, cMin, cMax } = selectionBounds(state.selection);
      const span = state.swatchFill === 'area' ? undefined : state.swatchFill;
      const region: Region = {
        swatchId: state.activeSwatchId,
        ...(span && { span }),
        rb0: rows - 1 - rMax,
        rb1: rows - 1 - rMin,
        cr0: cols - 1 - cMax,
        cr1: cols - 1 - cMin,
      };
      const overrides = Object.fromEntries(
        Object.entries(state.layout.overrides).filter(([k]) => {
          const [rb, cr] = k.split(',').map(Number);
          return rb < region.rb0 || rb > region.rb1 || cr < region.cr0 || cr > region.cr1;
        })
      );
      return {
        ...record(state),
        layout: { ...state.layout, regions: [...state.layout.regions, region], overrides },
        selection: null,
      };
    }),

  shapeColumn: (row, col) =>
    set((state) => {
      if (state.mode !== 'garment') return {};
      const { rows, cols } = garmentDims(state);
      const rb = rows - 1 - row;
      const cr = cols - 1 - col;
      const current = state.layout.shaping[cr] ?? {};
      // Increase: this is the column's first stitch. Decrease: its last.
      const next = state.tool === 'increase' ? { ...current, bottom: rb } : { ...current, top: rb };
      if (next.bottom === current.bottom && next.top === current.top) return {};
      return { layout: { ...state.layout, shaping: { ...state.layout.shaping, [cr]: next } } };
    }),

  clearAll: () =>
    set((state) => {
      if (state.mode === 'garment') {
        return { ...record(state), layout: EMPTY_LAYOUT, selection: null };
      }
      return {
        ...record(state),
        selection: null,
        swatches: updateActiveSwatch(state, (s) => ({ ...s, cells: makeGrid(s.rows, s.cols, state.palette[0]) })),
      };
    }),

  undo: () =>
    set((state) => {
      const prev = state.past[state.past.length - 1];
      if (!prev) return {};
      // If the active yarn is being reverted, follow it to its old color.
      const i = state.palette.indexOf(state.activeColor);
      const activeColor = i >= 0 && prev.palette[i] ? prev.palette[i] : state.activeColor;
      // The active swatch may not exist in the restored state.
      const activeSwatchId = prev.swatches.some((s) => s.id === state.activeSwatchId)
        ? state.activeSwatchId
        : prev.swatches[0].id;
      return {
        ...prev,
        activeColor,
        activeSwatchId,
        past: state.past.slice(0, -1),
        historyKey: null,
        selection: null,
      };
    }),

  // A drag records one snapshot up front; if the drag changed nothing, the
  // snapshot is dropped again.
  beginStroke: () => set((state) => record(state, 'stroke')),
  endStroke: () =>
    set((state) => {
      if (state.historyKey !== 'stroke') return {};
      const top = state.past[state.past.length - 1];
      const unchanged = top?.swatches === state.swatches && top.layout === state.layout;
      return unchanged ? { past: state.past.slice(0, -1), historyKey: null } : { historyKey: null };
    }),

  // Loading starts a fresh undo history: undoing into the previous pattern's
  // swatches would pair them with this file's garment size and gauge.
  loadPattern: (doc) =>
    set({
      ...doc,
      palette: doc.palette.slice(0, PALETTE_SIZE),
      activeSwatchId: doc.swatches[0].id,
      selection: null,
      past: [],
      historyKey: null,
    }),
}));
