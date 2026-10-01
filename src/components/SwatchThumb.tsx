import { useEffect, useRef } from 'react';
import type { Swatch } from '../store/usePatternStore';

// A tiny flat-color picture of a swatch for the swatch list. Repeats the
// swatch to fill the square so small swatches still read as a pattern.
export default function SwatchThumb({ swatch, size = 44 }: { swatch: Swatch; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);
    // At least 4px per stitch, so big swatches show a crop rather than mush.
    const cell = Math.max(4, size / Math.max(swatch.rows, swatch.cols));
    const n = Math.ceil(size / cell);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const { stitch, color } = swatch.cells[r % swatch.rows][c % swatch.cols];
        if (stitch === 'empty') continue;
        ctx.fillStyle = color;
        ctx.fillRect(Math.floor(c * cell), Math.floor(r * cell), Math.ceil(cell), Math.ceil(cell));
      }
    }
  }, [swatch, size]);

  return <canvas ref={ref} className="swatch-thumb" style={{ width: size, height: size }} aria-hidden />;
}
