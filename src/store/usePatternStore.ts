import { create } from 'zustand';

// The stitch types a cell can hold. Extend this as your pattern language grows
// (cables, yarn-overs, colorwork slots, etc.) — the rest of the app only cares
// that a cell has a `stitch` value and doesn't hardcode this list.
export type Stitch = 'empty' | 'knit' | 'purl';

export const STITCH_ORDER: Stitch[] = ['empty', 'knit', 'purl'];

export const STITCH_COLORS: Record<Stitch, string> = {
  empty: '#ffffff',
  knit: '#2b6cb0',
  purl: '#e07a5f',
};

export interface PatternFile {
  name: string;
  rows: number;
  cols: number;
  cells: Stitch[][]; // [row][col]
  repeatX: number;
  repeatY: number;
}

interface PatternState extends PatternFile {
  setCell: (row: number, col: number, stitch: Stitch) => void;
  cycleCell: (row: number, col: number) => void;
  resize: (rows: number, cols: number) => void;
  setRepeat: (repeatX: number, repeatY: number) => void;
  setName: (name: string) => void;
  loadPattern: (pattern: PatternFile) => void;
}

const DEFAULT_ROWS = 12;
const DEFAULT_COLS = 12;

function makeGrid(rows: number, cols: number, fill: Stitch = 'empty'): Stitch[][] {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => fill));
}

export const usePatternStore = create<PatternState>((set, get) => ({
  name: 'untitled-pattern',
  rows: DEFAULT_ROWS,
  cols: DEFAULT_COLS,
  cells: makeGrid(DEFAULT_ROWS, DEFAULT_COLS),
  repeatX: 3,
  repeatY: 2,

  setCell: (row, col, stitch) =>
    set((state) => {
      const cells = state.cells.map((r) => [...r]);
      cells[row][col] = stitch;
      return { cells };
    }),

  cycleCell: (row, col) => {
    const current = get().cells[row][col];
    const next = STITCH_ORDER[(STITCH_ORDER.indexOf(current) + 1) % STITCH_ORDER.length];
    get().setCell(row, col, next);
  },

  resize: (rows, cols) =>
    set((state) => {
      const cells = makeGrid(rows, cols);
      for (let r = 0; r < Math.min(rows, state.rows); r++) {
        for (let c = 0; c < Math.min(cols, state.cols); c++) {
          cells[r][c] = state.cells[r][c];
        }
      }
      return { rows, cols, cells };
    }),

  setRepeat: (repeatX, repeatY) => set({ repeatX, repeatY }),
  setName: (name) => set({ name }),

  loadPattern: (pattern) =>
    set({
      name: pattern.name,
      rows: pattern.rows,
      cols: pattern.cols,
      cells: pattern.cells,
      repeatX: pattern.repeatX,
      repeatY: pattern.repeatY,
    }),
}));
