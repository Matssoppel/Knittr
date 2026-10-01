import { useEffect, useMemo, useRef, useState } from 'react';
import { Stage, Layer, Line, Rect, Shape } from 'react-konva';
import Konva from 'konva';
import type { Context } from 'konva/lib/Context';
import { Cell, View, usePatternStore } from '../store/usePatternStore';
import { Grid, buildGarmentGrid, garmentStitches, tileGrid } from '../utils/garment';
import { STITCH_BOX, STITCH_PARTS, shade } from './stitchShapes';

const CELL_SIZE = 28; // px per stitch in the swatch editor

// The swatch preview shows a knitted test piece this size, shrunk to fit.
const SWATCH_PREVIEW_CM = 20;
const PREVIEW_MAX_CELL = 10;
const PREVIEW_MAX_SIZE = 420;

// The garment editor starts sized to fit this width; zoom adjusts from there.
const GARMENT_FIT_WIDTH = 880;
const GARMENT_MIN_CELL = 3;
const GARMENT_MAX_CELL = 28;

const MIN_GRID_CELL = 5; // below this many px per stitch, grid lines are skipped

// In stitch view a drawn stitch is taller than the row spacing, so each row
// slightly overlaps the row above — like real knitted fabric.
const ROW_STEP = 0.78;

const GRID_LINE = '#dddddd';
const EMPTY_FILL = '#ffffff';
const CHART_GRID = '#b8b8b8';
const CHART_INK = '#1f2326';
const SELECTION_STROKE = '#1f2326';
const SELECTION_FILL = 'rgba(31, 35, 38, 0.12)';

// Path2D objects are reusable, so parse each SVG path once.
const pathCache = new Map<string, Path2D>();
function path2d(d: string): Path2D {
  let p = pathCache.get(d);
  if (!p) {
    p = new Path2D(d);
    pathCache.set(d, p);
  }
  return p;
}

// How much darker the bottom of a stitch is than its top. The soft gradient
// keeps a stitch visible where it overlaps a same-colored stitch below it.
const GRADIENT_DEPTH = 0.14;

function yarnGradient(ctx: CanvasRenderingContext2D, top: string): CanvasGradient {
  const g = ctx.createLinearGradient(0, 0, 0, STITCH_BOX);
  g.addColorStop(0, top);
  g.addColorStop(1, shade(top, GRADIENT_DEPTH));
  return g;
}

// Perceived brightness, to pick a purl dot that contrasts with the yarn.
function isLight(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) > 140;
}

// px per row: stitch view follows the gauge (a stitch is 1/stitches wide and
// 1/rows tall); chart view uses square cells.
function rowPitch(view: View, cellSize: number, gauge: { stitches: number; rows: number }) {
  return view === 'stitch' ? cellSize * (gauge.stitches / gauge.rows) : cellSize;
}

// Draw a grid in either view. Null cells (shaped away) are left blank so the
// page shows through.
function drawFabric(
  con: Context,
  grid: Grid,
  cellSize: number,
  pitch: number,
  view: View,
  showGrid: boolean
) {
  const ctx = con._context;
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  // Snap cell edges to whole pixels so neighbouring squares meet without
  // seams at fractional cell sizes.
  const xAt = (c: number) => Math.round(c * cellSize);
  const yAt = (r: number) => Math.round(r * pitch);

  const eachCell = (fn: (cell: Cell, r: number, c: number) => void) => {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = grid[r][c];
        if (cell) fn(cell, r, c);
      }
    }
  };

  const strokeGrid = (color: string) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    eachCell((_, r, c) => ctx.rect(xAt(c) + 0.5, yAt(r) + 0.5, xAt(c + 1) - xAt(c), yAt(r + 1) - yAt(r)));
    ctx.stroke();
  };

  ctx.fillStyle = EMPTY_FILL;
  eachCell((_, r, c) => ctx.fillRect(xAt(c), yAt(r), xAt(c + 1) - xAt(c), yAt(r + 1) - yAt(r)));

  if (view === 'chart') {
    // Each cell is a flat square in its yarn color, with the standard chart
    // symbols — blank for knit, a dot for purl — and an X for no stitch.
    eachCell(({ stitch, color }, r, c) => {
      const x = xAt(c);
      const y = yAt(r);
      const w = xAt(c + 1) - x;
      const h = yAt(r + 1) - y;
      if (stitch === 'empty') {
        const ix = w * 0.3;
        const iy = h * 0.3;
        ctx.strokeStyle = GRID_LINE;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + ix, y + iy);
        ctx.lineTo(x + w - ix, y + h - iy);
        ctx.moveTo(x + w - ix, y + iy);
        ctx.lineTo(x + ix, y + h - iy);
        ctx.stroke();
        return;
      }
      ctx.fillStyle = color;
      ctx.fillRect(x, y, w, h);
      if (stitch === 'purl') {
        ctx.fillStyle = isLight(color) ? CHART_INK : '#ffffff';
        ctx.beginPath();
        ctx.arc(x + w / 2, y + h / 2, Math.min(w, h) * 0.13, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    // Grid lines go on top so they stay visible over colored squares.
    if (showGrid) strokeGrid(CHART_GRID);
    return;
  }

  if (showGrid) strokeGrid(GRID_LINE);

  // Every stitch is drawn in two passes — all dark parts first, then all
  // light parts — so light yarn always sits on top of dark yarn where rows
  // overlap.
  const scaleX = cellSize / STITCH_BOX;
  const scaleY = pitch / ROW_STEP / STITCH_BOX;
  // Gradients are defined in the stitch's own coordinates, so one per yarn
  // shade can be reused for every stitch.
  const gradients = new Map<string, CanvasGradient>();
  const gradientFor = (top: string) => {
    let g = gradients.get(top);
    if (!g) {
      g = yarnGradient(ctx, top);
      gradients.set(top, g);
    }
    return g;
  };
  for (const pass of ['dark', 'light'] as const) {
    eachCell(({ stitch, color }, r, c) => {
      if (stitch === 'empty') return;
      ctx.save();
      ctx.translate(c * cellSize, r * pitch);
      ctx.scale(scaleX, scaleY);
      ctx.fillStyle = gradientFor(pass === 'dark' ? shade(color) : color);
      for (const d of STITCH_PARTS[stitch][pass]) ctx.fill(path2d(d));
      ctx.restore();
    });
  }
}

interface FabricProps {
  grid: Grid;
  cellSize: number;
  editable?: boolean;
}

function Fabric({ grid, cellSize, editable = false }: FabricProps) {
  const tool = usePatternStore((s) => s.tool);
  const view = usePatternStore((s) => s.view);
  const gauge = usePatternStore((s) => s.gauge);
  const selection = usePatternStore((s) => s.selection);
  const swatchFill = usePatternStore((s) => s.swatchFill);
  const activeSwatch = usePatternStore((s) => s.swatches.find((sw) => sw.id === s.activeSwatchId));
  const stageRef = useRef<Konva.Stage>(null);
  const dragging = useRef(false);
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const pitch = rowPitch(view, cellSize, gauge);
  // Stitch view: the bottom row's stitches hang below the last row line.
  // Chart view: one extra pixel for the closing grid line.
  const overhang = view === 'stitch' ? pitch / ROW_STEP - pitch : 1;
  const width = Math.ceil(cols * cellSize) + 1;
  const height = Math.ceil(rows * pitch + overhang);
  const showGrid = cellSize >= MIN_GRID_CELL && (view === 'chart' || editable);

  // The cell under the pointer, clamped to the grid so a drag that leaves the
  // canvas keeps tracking the nearest edge.
  const cellAt = (evt: Event) => {
    const stage = stageRef.current;
    if (!stage) return null;
    stage.setPointersPositions(evt);
    const pos = stage.getPointerPosition();
    if (!pos) return null;
    const clamp = (v: number, max: number) => Math.min(Math.max(v, 0), max - 1);
    return { r: clamp(Math.floor(pos.y / pitch), rows), c: clamp(Math.floor(pos.x / cellSize), cols) };
  };

  // Paint and shaping drags act on every stitch they pass over; select and
  // swatch drags stretch a rectangle from where the drag started.
  const applyTool = (evt: Event, isStart: boolean) => {
    const cell = cellAt(evt);
    if (!cell) return;
    const { tool, swatchFill, selection, paintCell, shapeColumn, setSelection } = usePatternStore.getState();
    if (tool === 'paint') {
      paintCell(cell.r, cell.c);
    } else if (tool === 'increase' || tool === 'decrease') {
      shapeColumn(cell.r, cell.c);
    } else {
      const next =
        isStart || !selection
          ? { r0: cell.r, c0: cell.c, r1: cell.r, c1: cell.c }
          : { ...selection, r1: cell.r, c1: cell.c };
      // Full-width/height swatch fills stretch the dragged band edge to edge.
      if (tool === 'swatch' && swatchFill === 'width') Object.assign(next, { c0: 0, c1: cols - 1 });
      if (tool === 'swatch' && swatchFill === 'height') Object.assign(next, { r0: 0, r1: rows - 1 });
      setSelection(next);
    }
  };

  // Track moves on the window so drags keep working outside the canvas.
  useEffect(() => {
    if (!editable) return;
    const onMove = (e: MouseEvent | TouchEvent) => dragging.current && applyTool(e, false);
    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      const state = usePatternStore.getState();
      state.endStroke();
      // The swatch tool fills its area as soon as the drag ends.
      if (state.tool === 'swatch') state.fillAreaWithSwatch();
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchmove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchend', onUp);
    };
  });

  const onDown = (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
    dragging.current = true;
    const { tool, beginStroke } = usePatternStore.getState();
    if (tool === 'paint' || tool === 'increase' || tool === 'decrease') beginStroke();
    applyTool(e.evt, true);
  };

  const sel = editable && selection && {
    x: Math.min(selection.c0, selection.c1) * cellSize,
    y: Math.min(selection.r0, selection.r1) * pitch,
    width: (Math.abs(selection.c1 - selection.c0) + 1) * cellSize,
    height: (Math.abs(selection.r1 - selection.r0) + 1) * pitch,
  };

  const areaTool = tool === 'select' || tool === 'swatch';

  // While dragging a swatch fill, the outline thickens when the dragged size
  // holds a whole number of repeats. Full-width/height bands thicken all round
  // once their one dragged direction is whole. An area thickens its top and
  // bottom edges when the height is whole and its sides when the width is,
  // so each direction can be lined up separately.
  let thickTopBottom = false;
  let thickSides = false;
  if (tool === 'swatch' && selection && activeSwatch) {
    const rowsOk = (Math.abs(selection.r1 - selection.r0) + 1) % activeSwatch.rows === 0;
    const colsOk = (Math.abs(selection.c1 - selection.c0) + 1) % activeSwatch.cols === 0;
    if (swatchFill === 'width') thickTopBottom = thickSides = rowsOk;
    else if (swatchFill === 'height') thickTopBottom = thickSides = colsOk;
    else [thickTopBottom, thickSides] = [rowsOk, colsOk];
  }

  return (
    <Stage
      ref={stageRef}
      width={width}
      height={height}
      style={editable ? { touchAction: 'none', cursor: areaTool ? 'crosshair' : 'pointer' } : undefined}
      onMouseDown={editable ? onDown : undefined}
      onTouchStart={editable ? onDown : undefined}
    >
      <Layer listening={false}>
        <Shape sceneFunc={(con) => drawFabric(con, grid, cellSize, pitch, view, showGrid)} />
        {sel && (
          <>
            <Rect {...sel} fill={SELECTION_FILL} />
            {[
              { points: [sel.x, sel.y, sel.x + sel.width, sel.y], thick: thickTopBottom },
              { points: [sel.x, sel.y + sel.height, sel.x + sel.width, sel.y + sel.height], thick: thickTopBottom },
              { points: [sel.x, sel.y, sel.x, sel.y + sel.height], thick: thickSides },
              { points: [sel.x + sel.width, sel.y, sel.x + sel.width, sel.y + sel.height], thick: thickSides },
            ].map(({ points, thick }, i) => (
              <Line key={i} points={points} stroke={SELECTION_STROKE} strokeWidth={thick ? 4 : 2} dash={[6, 4]} />
            ))}
          </>
        )}
      </Layer>
    </Stage>
  );
}

function SwatchMaker() {
  const { swatches, activeSwatchId, view, gauge } = usePatternStore();
  const swatch = swatches.find((s) => s.id === activeSwatchId) ?? swatches[0];

  // A square test piece, like a knitter's gauge swatch.
  const { cols: outCols, rows: outRows } = garmentStitches(
    { width: SWATCH_PREVIEW_CM, length: SWATCH_PREVIEW_CM },
    gauge
  );
  const previewGrid = useMemo(() => tileGrid(swatch, outRows, outCols), [swatch, outRows, outCols]);
  const ratio = rowPitch(view, 1, gauge);
  const previewCell = Math.min(PREVIEW_MAX_CELL, PREVIEW_MAX_SIZE / outCols, PREVIEW_MAX_SIZE / (outRows * ratio));

  return (
    <div className="canvas-row">
      <div>
        <h3>Edit {swatch.name}</h3>
        <Fabric grid={swatch.cells} cellSize={CELL_SIZE} editable />
      </div>

      <div>
        <h3>
          Swatch preview — {SWATCH_PREVIEW_CM} × {SWATCH_PREVIEW_CM} cm
        </h3>
        <Fabric grid={previewGrid} cellSize={previewCell} />
      </div>
    </div>
  );
}

function GarmentView() {
  const { swatches, layout, palette, garment, gauge } = usePatternStore();
  const { rows, cols } = garmentStitches(garment, gauge);
  const grid = useMemo(
    () => buildGarmentGrid(layout, swatches, { stitch: 'knit', color: palette[0] }, rows, cols),
    [layout, swatches, palette, rows, cols]
  );

  const fitCell = Math.max(GARMENT_MIN_CELL, Math.min(GARMENT_MAX_CELL, GARMENT_FIT_WIDTH / cols));
  const [zoom, setZoom] = useState(1);
  const cellSize = Math.max(GARMENT_MIN_CELL, Math.min(GARMENT_MAX_CELL, fitCell * zoom));

  return (
    <div>
      <div className="canvas-heading">
        <h3>
          Garment — {garment.width} × {garment.length} cm
        </h3>
        <div className="zoom">
          <button onClick={() => setZoom((z) => z / 1.25)} aria-label="Zoom out" title="Zoom out">
            −
          </button>
          <button onClick={() => setZoom(1)} title="Fit to width">
            {Math.round(zoom * 100)}%
          </button>
          <button onClick={() => setZoom((z) => z * 1.25)} aria-label="Zoom in" title="Zoom in">
            +
          </button>
        </div>
      </div>
      <Fabric grid={grid} cellSize={cellSize} editable />
    </div>
  );
}

export default function PatternCanvas() {
  const mode = usePatternStore((s) => s.mode);
  return mode === 'garment' ? <GarmentView /> : <SwatchMaker />;
}
