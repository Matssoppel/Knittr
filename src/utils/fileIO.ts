import {
  Cell,
  DEFAULT_GAUGE,
  DEFAULT_PALETTE,
  DEFAULT_YARN,
  PatternDoc,
  Stitch,
} from '../store/usePatternStore';

// We store the file as JSON under a .txt extension: structured enough to parse
// reliably, plain enough to peek at in a text editor if something goes wrong.

const FILE_VERSION = 2;

export function downloadPattern(doc: PatternDoc) {
  const json = JSON.stringify({ version: FILE_VERSION, ...doc }, null, 2);
  const blob = new Blob([json], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `${doc.name || 'pattern'}.txt`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Files saved before yarn colors existed store each cell as a bare stitch
// name; upgrade those to gray-yarn cells.
function upgradeCells(cells: unknown[][]): Cell[][] {
  return cells.map((row) =>
    row.map((cell) => (typeof cell === 'string' ? { stitch: cell as Stitch, color: DEFAULT_YARN } : (cell as Cell)))
  );
}

// Version 1 files held a single grid plus how much fabric to preview — either
// repeat counts or (later) a garment size. That grid becomes the only swatch.
function fromVersion1(p: any): PatternDoc {
  const gauge = p.gauge ?? DEFAULT_GAUGE;
  const cm = (n: number) => Math.round(n * 10) / 10;
  const garment =
    p.garment ??
    (p.repeatX && p.repeatY
      ? {
          width: cm(((p.repeatX * p.cols) / gauge.stitches) * 10),
          length: cm(((p.repeatY * p.rows) / gauge.rows) * 10),
        }
      : { width: 50, length: 60 });
  return {
    name: p.name ?? 'pattern',
    palette: p.palette ?? DEFAULT_PALETTE,
    gauge,
    garment,
    swatches: [{ id: 'swatch-1', name: 'Swatch 1', rows: p.rows, cols: p.cols, cells: upgradeCells(p.cells) }],
    layout: { regions: [], overrides: {}, shaping: {} },
  };
}

export function readPatternFile(file: File): Promise<PatternDoc> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string);
        // Light validation so a malformed/foreign file fails loudly instead of
        // silently rendering a broken grid.
        if (parsed?.version === FILE_VERSION) {
          if (!Array.isArray(parsed.swatches) || parsed.swatches.length === 0 || !parsed.layout) {
            throw new Error('File does not look like a valid pattern.');
          }
          const { version: _version, ...doc } = parsed;
          resolve(doc as PatternDoc);
          return;
        }
        if (
          typeof parsed?.rows !== 'number' ||
          typeof parsed?.cols !== 'number' ||
          !Array.isArray(parsed?.cells)
        ) {
          throw new Error('File does not look like a valid pattern.');
        }
        resolve(fromVersion1(parsed));
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
