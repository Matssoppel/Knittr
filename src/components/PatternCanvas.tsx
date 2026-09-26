import { Stage, Layer, Rect, Line } from 'react-konva';
import { STITCH_COLORS, Stitch, usePatternStore } from '../store/usePatternStore';

const CELL_SIZE = 28; // px per stitch in the editable grid
const PREVIEW_CELL_SIZE = 10; // px per stitch in the tiled preview (smaller = fits more repeats)

interface GridProps {
  cells: Stitch[][];
  cellSize: number;
  editable?: boolean;
}

function StitchGrid({ cells, cellSize, editable = false }: GridProps) {
  const cycleCell = usePatternStore((s) => s.cycleCell);
  const rows = cells.length;
  const cols = cells[0]?.length ?? 0;

  const gridLines = [];
  if (editable) {
    for (let r = 0; r <= rows; r++) {
      gridLines.push(
        <Line
          key={`h-${r}`}
          points={[0, r * cellSize, cols * cellSize, r * cellSize]}
          stroke="#ddd"
          strokeWidth={1}
        />
      );
    }
    for (let c = 0; c <= cols; c++) {
      gridLines.push(
        <Line
          key={`v-${c}`}
          points={[c * cellSize, 0, c * cellSize, rows * cellSize]}
          stroke="#ddd"
          strokeWidth={1}
        />
      );
    }
  }

  return (
    <>
      {cells.map((row, r) =>
        row.map((stitch, c) => (
          <Rect
            key={`${r}-${c}`}
            x={c * cellSize}
            y={r * cellSize}
            width={cellSize}
            height={cellSize}
            fill={STITCH_COLORS[stitch]}
            stroke={editable ? '#ddd' : undefined}
            strokeWidth={editable ? 1 : 0}
            onClick={editable ? () => cycleCell(r, c) : undefined}
            onTap={editable ? () => cycleCell(r, c) : undefined}
          />
        ))
      )}
      {gridLines}
    </>
  );
}

export default function PatternCanvas() {
  const { cells, rows, cols, repeatX, repeatY } = usePatternStore();

  const editorWidth = cols * CELL_SIZE;
  const editorHeight = rows * CELL_SIZE;

  const previewWidth = cols * repeatX * PREVIEW_CELL_SIZE;
  const previewHeight = rows * repeatY * PREVIEW_CELL_SIZE;

  return (
    <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
      <div>
        <h3 style={{ margin: '0 0 0.5rem' }}>Edit one repeat</h3>
        <Stage width={editorWidth} height={editorHeight}>
          <Layer>
            <StitchGrid cells={cells} cellSize={CELL_SIZE} editable />
          </Layer>
        </Stage>
      </div>

      <div>
        <h3 style={{ margin: '0 0 0.5rem' }}>
          Preview — {repeatX}×{repeatY} repeats
        </h3>
        <Stage width={previewWidth} height={previewHeight}>
          <Layer>
            {Array.from({ length: repeatY }).map((_, ry) =>
              Array.from({ length: repeatX }).map((_, rx) => (
                <TileGroup
                  key={`${rx}-${ry}`}
                  x={rx * cols * PREVIEW_CELL_SIZE}
                  y={ry * rows * PREVIEW_CELL_SIZE}
                  cells={cells}
                />
              ))
            )}
          </Layer>
        </Stage>
      </div>
    </div>
  );
}

// A single tiled copy of the base pattern, offset into position. Konva doesn't
// have a built-in "repeat" primitive, so we just draw the grid N times at
// different x/y offsets using a Group-like wrapper.
function TileGroup({ x, y, cells }: { x: number; y: number; cells: Stitch[][] }) {
  return (
    <>
      {cells.map((row, r) =>
        row.map((stitch, c) => (
          <Rect
            key={`${x}-${y}-${r}-${c}`}
            x={x + c * PREVIEW_CELL_SIZE}
            y={y + r * PREVIEW_CELL_SIZE}
            width={PREVIEW_CELL_SIZE}
            height={PREVIEW_CELL_SIZE}
            fill={STITCH_COLORS[stitch]}
          />
        ))
      )}
    </>
  );
}
