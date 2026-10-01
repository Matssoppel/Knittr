import { useEffect, useRef, useState } from 'react';
import Icon from './components/Icon';
import PatternCanvas from './components/PatternCanvas';
import SwatchThumb from './components/SwatchThumb';
import paintIcon from './assets/icons/paint.svg';
import selectIcon from './assets/icons/select.svg';
import fillSelectionIcon from './assets/icons/fill-selection.svg';
import deselectIcon from './assets/icons/deselect.svg';
import undoIcon from './assets/icons/undo.svg';
import clearIcon from './assets/icons/clear.svg';
import knitIcon from './assets/icons/knit.svg';
import purlIcon from './assets/icons/purl.svg';
import emptyIcon from './assets/icons/empty.svg';
import swatchAreaIcon from './assets/icons/swatch-area.svg';
import increaseIcon from './assets/icons/increase.svg';
import decreaseIcon from './assets/icons/decrease.svg';
import swatchWidthIcon from './assets/icons/swatch-width.svg';
import swatchHeightIcon from './assets/icons/swatch-height.svg';
import chartViewIcon from './assets/icons/chart-view.svg';
import stitchViewIcon from './assets/icons/stitch-view.svg';
import logo from './assets/logo.svg';
import {
  GARMENT_ONLY_TOOLS,
  Mode,
  Stitch,
  SwatchFill,
  Tool,
  View,
  usePatternStore,
} from './store/usePatternStore';
import { garmentStitches } from './utils/garment';
import { downloadPattern, readPatternFile } from './utils/fileIO';

const MODES: { mode: Mode; label: string }[] = [
  { mode: 'swatch', label: 'Swatches' },
  { mode: 'garment', label: 'Garment' },
];

const TOOLS: { tool: Tool; label: string; icon: string }[] = [
  { tool: 'paint', label: 'Paint', icon: paintIcon },
  { tool: 'select', label: 'Select', icon: selectIcon },
  { tool: 'swatch', label: 'Fill area with swatch', icon: swatchAreaIcon },
  { tool: 'increase', label: 'Increase', icon: increaseIcon },
  { tool: 'decrease', label: 'Decrease', icon: decreaseIcon },
];

// Variants of the swatch tool, picked by right-clicking it.
const SWATCH_FILLS: { fill: SwatchFill; label: string; icon: string }[] = [
  { fill: 'area', label: 'Fill area with swatch', icon: swatchAreaIcon },
  { fill: 'width', label: 'Fill full width', icon: swatchWidthIcon },
  { fill: 'height', label: 'Fill full height', icon: swatchHeightIcon },
];

const VIEWS: { view: View; label: string; icon: string }[] = [
  { view: 'chart', label: 'Chart view', icon: chartViewIcon },
  { view: 'stitch', label: 'Stitch view', icon: stitchViewIcon },
];

const BRUSH_STITCHES: { stitch: Stitch; label: string; icon: string }[] = [
  { stitch: 'knit', label: 'Knit', icon: knitIcon },
  { stitch: 'purl', label: 'Purl', icon: purlIcon },
  { stitch: 'empty', label: 'Empty', icon: emptyIcon },
];

export default function App() {
  const {
    name,
    setName,
    mode,
    setMode,
    swatches,
    activeSwatchId,
    selectSwatch,
    addSwatch,
    deleteSwatch,
    renameSwatch,
    resizeSwatch,
    layout,
    garment,
    setGarment,
    gauge,
    setGauge,
    activeStitch,
    activeColor,
    setActiveStitch,
    setActiveColor,
    palette,
    editYarn,
    tool,
    setTool,
    swatchFill,
    setSwatchFill,
    selection,
    setSelection,
    fillSelection,
    undo,
    clearAll,
    past,
    view,
    setView,
    loadPattern,
  } = usePatternStore();

  const swatch = swatches.find((s) => s.id === activeSwatchId) ?? swatches[0];
  // Finished size in cm: a stitch is 10/gauge.stitches cm wide and
  // 10/gauge.rows cm tall.
  const cm = (n: number) => (Math.round(n * 10) / 10).toString();
  const garmentSize = garmentStitches(garment, gauge);
  const tools = TOOLS.filter((t) => mode === 'garment' || !GARMENT_ONLY_TOOLS.includes(t.tool));
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fillMenuOpen, setFillMenuOpen] = useState(false);
  const fillMenuRef = useRef<HTMLDivElement>(null);

  // Close the swatch fill menu on any click outside it.
  useEffect(() => {
    if (!fillMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!fillMenuRef.current?.contains(e.target as Node)) setFillMenuOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [fillMenuOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelection(null);
        setFillMenuOpen(false);
      }
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
    downloadPattern({ name, palette, gauge, garment, swatches, layout });
  };

  const handleUploadClick = () => fileInputRef.current?.click();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      loadPattern(await readPatternFile(file));
    } catch (err) {
      alert('Could not read that file — is it a pattern you saved from this app?');
      console.error(err);
    }
    e.target.value = ''; // allow re-selecting the same file later
  };

  const toolHint =
    tool === 'swatch'
      ? swatchFill === 'width'
        ? `Drag rows to fill them across the garment with ${swatch.name}`
        : swatchFill === 'height'
          ? `Drag columns to fill them up the garment with ${swatch.name}`
          : `Drag an area to fill it with ${swatch.name}`
      : tool === 'increase'
        ? 'Drag along the edge: rows below each stitch become blank'
        : tool === 'decrease'
          ? 'Drag along the edge: rows above each stitch become blank'
          : null;

  return (
    <div className="app">
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
        <filter id="wobble">
          <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="2" seed="6" />
          <feDisplacementMap in="SourceGraphic" scale="2.5" />
        </filter>
      </svg>
      <aside className="sidebar">
        <img className="logo" src={logo} alt="Knittr" />
        <div className="segmented mode-toggle">
          {MODES.map(({ mode: m, label }) => (
            <button key={m} className={m === mode ? 'active' : undefined} onClick={() => setMode(m)}>
              {label}
            </button>
          ))}
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
                  title={active ? 'Click to edit this yarn' : i === 0 ? 'Main yarn' : undefined}
                >
                  <input
                    type="color"
                    value={color}
                    onClick={(e) => {
                      if (active) return;
                      e.preventDefault();
                      setActiveColor(color);
                    }}
                    onChange={(e) => editYarn(i, e.target.value)}
                    aria-label={active ? `Edit yarn ${color}` : `Yarn ${color}`}
                  />
                </label>
              );
            })}
          </div>
        </div>

        <div className="sidebar-group">
          <span className="sidebar-label">
            {mode === 'garment' ? 'Paint with swatch' : 'Swatches'}
          </span>
          <div className="swatch-list">
            {swatches.map((s) => (
              <button
                key={s.id}
                className={`swatch-item${s.id === activeSwatchId ? ' active' : ''}`}
                onClick={() => selectSwatch(s.id)}
                title={s.name}
              >
                <SwatchThumb swatch={s} />
                <span className="swatch-name">{s.name}</span>
              </button>
            ))}
            <button className="swatch-item add-swatch" onClick={addSwatch} title="New swatch" aria-label="New swatch">
              +
            </button>
          </div>
        </div>

        {mode === 'swatch' ? (
          <>
            <label>
              Swatch name
              <span className="field">
                <input value={swatch.name} onChange={(e) => renameSwatch(e.target.value)} />
              </span>
            </label>

            <div className="field-row">
              <label>
                Rows
                <span className="field">
                  <input
                    type="number"
                    min={1}
                    value={swatch.rows}
                    onChange={(e) => resizeSwatch(Number(e.target.value) || 1, swatch.cols)}
                  />
                </span>
              </label>

              <label>
                Cols
                <span className="field">
                  <input
                    type="number"
                    min={1}
                    value={swatch.cols}
                    onChange={(e) => resizeSwatch(swatch.rows, Number(e.target.value) || 1)}
                  />
                </span>
              </label>
            </div>

            <button
              className="danger"
              onClick={() => deleteSwatch(swatch.id)}
              disabled={swatches.length <= 1}
              title={swatches.length <= 1 ? 'A pattern needs at least one swatch' : 'Also removes it from the garment'}
            >
              Delete swatch
            </button>
          </>
        ) : (
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
        )}

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
            {mode === 'swatch'
              ? `Repeat ${cm((swatch.cols / gauge.stitches) * 10)} × ${cm((swatch.rows / gauge.rows) * 10)} cm`
              : `Garment ${garmentSize.cols} sts × ${garmentSize.rows} rows`}
          </span>
        </div>

        <div className="sidebar-group sidebar-file">
          <span className="sidebar-label">Pattern</span>
          <label>
            Name
            <span className="field">
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </span>
          </label>
          <div className="sidebar-actions">
            <button onClick={handleSave}>Save as .txt</button>
            <button onClick={handleUploadClick}>Load .txt</button>
          </div>
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
            {tools.map(({ tool: t, label, icon }) => {
              if (t !== 'swatch') {
                return (
                  <button
                    key={t}
                    className={`icon-button${t === tool ? ' active' : ''}`}
                    onClick={() => setTool(t)}
                    title={label}
                    aria-label={label}
                  >
                    <Icon src={icon} />
                  </button>
                );
              }
              // The swatch tool shows its current variant; right-click it to
              // pick another.
              const fill = SWATCH_FILLS.find((f) => f.fill === swatchFill) ?? SWATCH_FILLS[0];
              return (
                <div key={t} className="tool-menu-anchor" ref={fillMenuRef}>
                  <button
                    className={`icon-button has-menu${t === tool ? ' active' : ''}`}
                    onClick={() => setTool(t)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setFillMenuOpen((open) => !open);
                    }}
                    title={`${fill.label} (right-click for more)`}
                    aria-label={fill.label}
                    aria-haspopup="menu"
                    aria-expanded={fillMenuOpen}
                  >
                    <Icon src={fill.icon} />
                  </button>
                  {fillMenuOpen && (
                    <div className="tool-menu" role="menu">
                      {SWATCH_FILLS.map((f) => (
                        <button
                          key={f.fill}
                          role="menuitemradio"
                          aria-checked={f.fill === swatchFill}
                          className={f.fill === swatchFill ? 'active' : undefined}
                          onClick={() => {
                            setSwatchFill(f.fill);
                            setFillMenuOpen(false);
                          }}
                        >
                          <Icon src={f.icon} size={20} />
                          {f.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
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
          <button
            className="icon-button"
            onClick={clearAll}
            title={mode === 'garment' ? 'Clear garment' : 'Clear swatch'}
            aria-label={mode === 'garment' ? 'Clear garment' : 'Clear swatch'}
          >
            <Icon src={clearIcon} />
          </button>
          {selection && tool === 'select' && (
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
          {toolHint && <span className="toolbar-hint">{toolHint}</span>}
          <div className="segmented view-toggle">
            {VIEWS.map(({ view: v, label, icon }) => (
              <button
                key={v}
                className={`icon-button${v === view ? ' active' : ''}`}
                onClick={() => setView(v)}
                title={label}
                aria-label={label}
              >
                <Icon src={icon} luminance />
              </button>
            ))}
          </div>
        </div>
        <PatternCanvas />
      </main>
    </div>
  );
}
