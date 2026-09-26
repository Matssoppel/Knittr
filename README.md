# Knit Pattern Designer (starter)

A minimal starting point: React + TypeScript + Vite, with `react-konva` for the
canvas grid and `zustand` for state. No backend, no accounts — patterns save
to a local `.txt` file (JSON inside) and reload from the same file.

## Getting it running

```bash
npm install
npm run dev
```

Then open the local URL Vite prints (usually `http://localhost:5173`).

## Project structure

```
src/
  main.tsx              # React entry point
  App.tsx               # Toolbar + layout
  components/
    PatternCanvas.tsx    # The Konva stage: editable grid + tiled preview
  store/
    usePatternStore.ts   # All pattern state (grid, repeats, stitch types)
  utils/
    fileIO.ts             # Save-to-file / load-from-file logic
```

## How it works right now

- Click a cell in the "Edit one repeat" grid to cycle it through
  empty → knit → purl.
- The "Preview" panel tiles that one repeat across the Repeat X / Repeat Y
  values you set, so you can see how the motif looks at full project scale.
- "Save as .txt" downloads the current pattern as a JSON-in-a-textfile.
- "Load .txt" re-opens a previously saved file and restores the grid.

## Where to take it next

- Swap the flat color squares for real stitch symbols (SVG icons per stitch
  type) once you've settled on which symbols/stitches you want to support.
- Pull your color/spacing values from Figma via Tokens Studio instead of the
  hardcoded values in `usePatternStore.ts` and `index.css`.
- If patterns get very large, consider Konva's `FastLayer` or reducing the
  number of individually-clickable shapes (e.g. one Rect + drag-select instead
  of per-cell click handlers).
