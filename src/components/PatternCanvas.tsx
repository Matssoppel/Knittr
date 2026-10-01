import { useEffect, useRef } from 'react';
import { Stage, Layer, Rect, Shape } from 'react-konva';
import Konva from 'konva';
import type { Context } from 'konva/lib/Context';
import { Cell, garmentStitches, usePatternStore } from '../store/usePatternStore';
import { STITCH_BOX, STITCH_PARTS, shade } from './stitchShapes';

const CELL_SIZE = 28; // px per stitch in the editable grid
// The garment preview shrinks its stitches to fit this box, up to 10px each.
const PREVIEW_MAX_CELL = 10;
const PREVIEW_MAX_WIDTH = 560;
const PREVIEW_MAX_HEIGHT = 680;
const MIN_GRID_CELL = 5; // below this many px per stitch, chart grid lines are skipped

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

// The pattern cell shown at (R, C) of an outRows × outCols area tiled with
// repeats. Tiling is anchored bottom-right, where knitting starts, so any
// partial repeats land at the top and left edges.
function cellFor(cells: Cell[][], R: number, C: number, outRows: number, outCols: number): Cell {
  const rows = cells.length;
  const cols = cells[0].length;
  return cells[rows - 1 - ((outRows - 1 - R) % rows)][cols - 1 - ((outCols - 1 - C) % cols)];
}

// Draws every stitch in two passes — all dark parts first, then all light
// parts — so light yarn always sits on top of dark yarn where rows overlap.
function drawStitches(
  con: Context,
  cells: Cell[][],
  cellSize: number,
  pitch: number, // px per row
  outRows: number,
  outCols: number
) {
  const ctx = con._context;
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
    for (let r = 0; r < outRows; r++) {
      for (let c = 0; c < outCols; c++) {
        const { stitch, color } = cellFor(cells, r, c, outRows, outCols);
        if (stitch === 'empty') continue;
        ctx.save();
        ctx.translate(c * cellSize, r * pitch);
        ctx.scale(scaleX, scaleY);
        ctx.fillStyle = gradientFor(pass === 'dark' ? shade(color) : color);
        for (const d of STITCH_PARTS[stitch][pass]) ctx.fill(path2d(d));
        ctx.restore();
      }
    }
  }
}

// Chart view: each cell is a flat square in its yarn color, with the standard
// chart symbols — blank for knit, a dot for purl — and an X for no stitch.
function drawChart(
  con: Context,
  cells: Cell[][],
  cellSize: number,
  pitch: number, // px per row
  outRows: number,
  outCols: number
) {
  const ctx = con._context;
  const insetX = cellSize * 0.3;
  const insetY = pitch * 0.3;

  for (let r = 0; r < outRows; r++) {
    for (let c = 0; c < outCols; c++) {
      const { stitch, color } = cellFor(cells, r, c, outRows, outCols);
      // Snap to whole pixels so neighbouring squares meet without seams when
      // the preview is scaled to a fractional cell size.
      const x = Math.round(c * cellSize);
      const y = Math.round(r * pitch);
      const w = Math.round((c + 1) * cellSize) - x;
      const h = Math.round((r + 1) * pitch) - y;
      if (stitch === 'empty') {
        ctx.strokeStyle = GRID_LINE;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + insetX, y + insetY);
        ctx.lineTo(x + w - insetX, y + h - insetY);
        ctx.moveTo(x + w - insetX, y + insetY);
        ctx.lineTo(x + insetX, y + h - insetY);
        ctx.stroke();
        continue;
      }
      ctx.fillStyle = color;
      ctx.fillRect(x, y, w, h);
      if (stitch === 'purl') {
        ctx.fillStyle = isLight(color) ? CHART_INK : '#ffffff';
        ctx.beginPath();
        ctx.arc(x + w / 2, y + h / 2, Math.min(w, h) * 0.13, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Grid lines go on top so they stay visible over colored squares — unless
  // cells are so small the lines would drown them out.
  if (cellSize < MIN_GRID_CELL) return;
  const width = outCols * cellSize;
  const height = outRows * pitch;
  ctx.strokeStyle = CHART_GRID;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= outCols; i++) {
    ctx.moveTo(Math.round(i * cellSize) + 0.5, 0);
    ctx.lineTo(Math.round(i * cellSize) + 0.5, height);
  }
  for (let i = 0; i <= outRows; i++) {
    ctx.moveTo(0, Math.round(i * pitch) + 0.5);
    ctx.lineTo(width, Math.round(i * pitch) + 0.5);
  }
  ctx.stroke();
}

// Perceived brightness, to pick a purl dot that contrasts with the yarn.
function isLight(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) > 140;
}

interface FabricProps {
  cells: Cell[][];
  cellSize: number;
  // Size of the area to fill with repeats; defaults to one repeat.
  outRows?: number;
  outCols?: number;
  editable?: boolean;
}

function Fabric({ cells, cellSize, outRows, outCols, editable = false }: FabricProps) {
  const tool = usePatternStore((s) => s.tool);
  const view = usePatternStore((s) => s.view);
  const gauge = usePatternStore((s) => s.gauge);
  const selection = usePatternStore((s) => s.selection);
  const stageRef = useRef<Konva.Stage>(null);
  const dragging = useRef(false);
  const rows = cells.length;
  const cols = cells[0]?.length ?? 0;
  const totalRows = outRows ?? rows;
  const totalCols = outCols ?? cols;
  // Stitch view: a stitch is 1/stitches wide and 1/rows tall, so rows are
  // spaced by the gauge's stitches-to-rows ratio. Chart view: square cells.
  const pitch = view === 'stitch' ? cellSize * (gauge.stitches / gauge.rows) : cellSize;
  // How far the stitch view's overlapping stitches hang below the last row.
  const overhang = view === 'stitch' ? pitch / ROW_STEP - pitch : 1;

  // Chart view gets an extra pixel so the closing grid line isn't clipped.
  const width = totalCols * cellSize + (view === 'chart' ? 1 : 0);
  // Stitch view: the bottom row hangs below the last row line. Chart view: one
  // extra pixel for the closing grid line.
  const height = totalRows * pitch + overhang;

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

  // Paint drags fill every cell they pass over; select drags stretch a
  // rectangle from where the drag started.
  const applyTool = (evt: Event, isStart: boolean) => {
    const cell = cellAt(evt);
    if (!cell) return;
    const { tool, selection, paintCell, setSelection } = usePatternStore.getState();
    if (tool === 'paint') {
      paintCell(cell.r, cell.c);
    } else if (isStart || !selection) {
      setSelection({ r0: cell.r, c0: cell.c, r1: cell.r, c1: cell.c });
    } else {
      setSelection({ ...selection, r1: cell.r, c1: cell.c });
    }
  };

  // Track moves on the window so drags keep working outside the canvas.
  useEffect(() => {
    if (!editable) return;
    const onMove = (e: MouseEvent | TouchEvent) => dragging.current && applyTool(e, false);
    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      usePatternStore.getState().endStroke();
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
    if (usePatternStore.getState().tool === 'paint') usePatternStore.getState().beginStroke();
    applyTool(e.evt, true);
  };

  const sel = editable && selection && {
    x: Math.min(selection.c0, selection.c1) * cellSize,
    y: Math.min(selection.r0, selection.r1) * pitch,
    width: (Math.abs(selection.c1 - selection.c0) + 1) * cellSize,
    height: (Math.abs(selection.r1 - selection.r0) + 1) * pitch,
  };

  return (
    <Stage
      ref={stageRef}
      width={width}
      height={height}
      style={editable ? { touchAction: 'none', cursor: tool === 'select' ? 'crosshair' : 'pointer' } : undefined}
      onMouseDown={editable ? onDown : undefined}
      onTouchStart={editable ? onDown : undefined}
    >
      <Layer listening={false}>
        {editable ? (
          cells.map((row, r) =>
            row.map((_, c) => (
              <Rect
                key={`${r}-${c}`}
                x={c * cellSize}
                y={r * pitch}
                width={cellSize}
                height={pitch}
                fill={EMPTY_FILL}
                stroke={GRID_LINE}
                strokeWidth={1}
              />
            ))
          )
        ) : (
          <Rect width={width} height={totalRows * pitch} fill={EMPTY_FILL} />
        )}
        <Shape
          sceneFunc={(con) =>
            (view === 'stitch' ? drawStitches : drawChart)(con, cells, cellSize, pitch, totalRows, totalCols)
          }
        />
        {sel && (
          <Rect {...sel} fill={SELECTION_FILL} stroke={SELECTION_STROKE} strokeWidth={2} dash={[6, 4]} />
        )}
      </Layer>
    </Stage>
  );
}

export default function PatternCanvas() {
  const { cells, view, gauge, garment } = usePatternStore();

  const { cols: garmentCols, rows: garmentRows } = garmentStitches(garment, gauge);
  // Rows are shorter than stitches are wide in stitch view (see Fabric).
  const rowRatio = view === 'stitch' ? gauge.stitches / gauge.rows : 1;
  const previewCell = Math.min(
    PREVIEW_MAX_CELL,
    PREVIEW_MAX_WIDTH / garmentCols,
    PREVIEW_MAX_HEIGHT / (garmentRows * rowRatio)
  );

  return (
    <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
      <div>
        <h3 style={{ margin: '0 0 0.5rem' }}>Edit one repeat</h3>
        <Fabric cells={cells} cellSize={CELL_SIZE} editable />
      </div>

      <div>
        <h3 style={{ margin: '0 0 0.5rem' }}>
          Preview — {garment.width} × {garment.length} cm
        </h3>
        <Fabric cells={cells} cellSize={previewCell} outRows={garmentRows} outCols={garmentCols} />
      </div>
    </div>
  );
}
