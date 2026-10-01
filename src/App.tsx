import { useEffect, useRef } from 'react';
import Icon from './components/Icon';
import PatternCanvas from './components/PatternCanvas';
import paintIcon from './assets/icons/paint.svg';
import selectIcon from './assets/icons/select.svg';
import fillSelectionIcon from './assets/icons/fill-selection.svg';
import deselectIcon from './assets/icons/deselect.svg';
import undoIcon from './assets/icons/undo.svg';
import knitIcon from './assets/icons/knit.svg';
import purlIcon from './assets/icons/purl.svg';
import emptyIcon from './assets/icons/empty.svg';
import { Stitch, Tool, View, garmentStitches, usePatternStore } from './store/usePatternStore';
import { downloadPattern, readPatternFile } from './utils/fileIO';

const TOOLS: { tool: Tool; label: string; icon: string }[] = [
  { tool: 'paint', label: 'Paint', icon: paintIcon },
  { tool: 'select', label: 'Select', icon: selectIcon },
];

const VIEWS: { view: View; label: string }[] = [
  { view: 'chart', label: 'Chart' },
  { view: 'stitch', label: 'Stitches' },
];

const BRUSH_STITCHES: { stitch: Stitch; label: string; icon: string }[] = [
  { stitch: 'knit', label: 'Knit', icon: knitIcon },
  { stitch: 'purl', label: 'Purl', icon: purlIcon },
  { stitch: 'empty', label: 'Empty', icon: emptyIcon },
];

export default function App() {
  const {
    name,
    rows,
    cols,
    cells,
    garment,
    activeStitch,
    activeColor,
    resize,
    setGarment,
    setName,
    loadPattern,
    setActiveStitch,
    setActiveColor,
    tool,
    selection,
    setTool,
    setSelection,
    fillSelection,
    undo,
    past,
    view,
    setView,
    palette,
    editSwatch,
    gauge,
    setGauge,
  } = usePatternStore();

  // Finished size in cm: a stitch is 10/gauge.stitches cm wide and
  // 10/gauge.rows cm tall.
  const cm = (n: number) => (Math.round(n * 10) / 10).toString();
  const repeatW = (cols / gauge.stitches) * 10;
  const repeatH = (rows / gauge.rows) * 10;
  const garmentSize = garmentStitches(garment, gauge);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelection(null);
      // Leave Ctrl/Cmd+Z alone inside text fields so it undoes typing there.
      const typing = e.target instanceof HTMLInputElement && e.target.type !== 'color';
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && !typing) {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setSelection, undo]);

  const handleSave = () => {
    downloadPattern({ name, rows, cols, cells, garment, palette, gauge });
  };

  const handleUploadClick = () => fileInputRef.current?.click();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const pattern = await readPatternFile(file);
      loadPattern(pattern);
    } catch (err) {
      alert('Could not read that file — is it a pattern you saved from this app?');
      console.error(err);
    }
    e.target.value = ''; // allow re-selecting the same file later
  };

  return (
    <div className="app">
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
        <filter id="wobble">
          <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="2" seed="6" />
          <feDisplacementMap in="SourceGraphic" scale="2.5" />
        </filter>
      </svg>
      <aside className="sidebar">
        <h2 className="sidebar-title">Pattern</h2>
        <label>
          Name
          <span className="field">
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </span>
        </label>

        <div className="field-row">
          <label>
            Rows
            <span className="field">
              <input
                type="number"
                min={1}
                value={rows}
                onChange={(e) => resize(Number(e.target.value) || 1, cols)}
              />
            </span>
          </label>

          <label>
            Cols
            <span className="field">
              <input
                type="number"
                min={1}
                value={cols}
                onChange={(e) => resize(rows, Number(e.target.value) || 1)}
              />
            </span>
          </label>
        </div>

        <div className="field-row">
          <label>
            Width cm
            <span className="field">
              <input
                type="number"
                min={1}
                value={garment.width}
                onChange={(e) => setGarment({ ...garment, width: Number(e.target.value) || 1 })}
              />
            </span>
          </label>

          <label>
            Length cm
            <span className="field">
              <input
                type="number"
                min={1}
                value={garment.length}
                onChange={(e) => setGarment({ ...garment, length: Number(e.target.value) || 1 })}
              />
            </span>
          </label>
        </div>

        <div className="sidebar-group">
          <span className="sidebar-label">Gauge per 10 cm</span>
          <div className="field-row">
            <label>
              Stitches
              <span className="field">
                <input
                  type="number"
                  min={1}
                  step={0.5}
                  value={gauge.stitches}
                  onChange={(e) => setGauge({ ...gauge, stitches: Number(e.target.value) || 1 })}
                />
              </span>
            </label>

            <label>
              Rows
              <span className="field">
                <input
                  type="number"
                  min={1}
                  step={0.5}
                  value={gauge.rows}
                  onChange={(e) => setGauge({ ...gauge, rows: Number(e.target.value) || 1 })}
                />
              </span>
            </label>
          </div>
          <span className="sidebar-note">
            Repeat {cm(repeatW)} × {cm(repeatH)} cm
            <br />
            Garment {garmentSize.cols} sts × {garmentSize.rows} rows
          </span>
        </div>

        <div className="sidebar-group">
          <span className="sidebar-label">Stitch</span>
          <div className="segmented">
            {BRUSH_STITCHES.map(({ stitch, label, icon }) => (
              <button
                key={stitch}
                className={`icon-button${stitch === activeStitch ? ' active' : ''}`}
                onClick={() => setActiveStitch(stitch)}
                title={label}
                aria-label={label}
              >
                <Icon src={icon} />
              </button>
            ))}
          </div>
        </div>

        <div className="sidebar-group">
          <span className="sidebar-label">Yarn</span>
          <div className="swatches">
            {/* First click picks a yarn; clicking the picked yarn again opens
                its color picker, and edits recolor the stitches using it. */}
            {palette.map((color, i) => {
              const active = color === activeColor;
              return (
                <label
                  key={i}
                  className={`swatch${active ? ' active' : ''}`}
                  style={{ background: color }}
                  title={active ? 'Click to edit this yarn' : undefined}
                >
                  <input
                    type="color"
                    value={color}
                    onClick={(e) => {
                      if (active) return;
                      e.preventDefault();
                      setActiveColor(color);
                    }}
                    onChange={(e) => editSwatch(i, e.target.value)}
                    aria-label={active ? `Edit yarn ${color}` : `Yarn ${color}`}
                  />
                </label>
              );
            })}
          </div>
        </div>

        <div className="sidebar-actions">
          <button onClick={handleSave}>Save as .txt</button>
          <button onClick={handleUploadClick}>Load .txt</button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,application/json"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      </aside>

      <main className="stage-wrapper">
        <div className="toolbar">
          <div className="segmented">
            {TOOLS.map(({ tool: t, label, icon }) => (
              <button
                key={t}
                className={`icon-button${t === tool ? ' active' : ''}`}
                onClick={() => setTool(t)}
                title={label}
                aria-label={label}
              >
                <Icon src={icon} />
              </button>
            ))}
          </div>
          <button
            className="icon-button"
            onClick={undo}
            disabled={past.length === 0}
            title="Undo (Ctrl/Cmd+Z)"
            aria-label="Undo"
          >
            <Icon src={undoIcon} />
          </button>
          {selection && (
            <>
              <button
                className="icon-button"
                onClick={fillSelection}
                title="Fill selection"
                aria-label="Fill selection"
              >
                <Icon src={fillSelectionIcon} />
              </button>
              <button
                className="icon-button"
                onClick={() => setSelection(null)}
                title="Deselect (Esc)"
                aria-label="Deselect"
              >
                <Icon src={deselectIcon} />
              </button>
              <span className="toolbar-hint">Pick a stitch or yarn to change the selection</span>
            </>
          )}
          <div className="segmented view-toggle">
            {VIEWS.map(({ view: v, label }) => (
              <button
                key={v}
                className={v === view ? 'active' : undefined}
                onClick={() => setView(v)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <PatternCanvas />
      </main>
    </div>
  );
}
