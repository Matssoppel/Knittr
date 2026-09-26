import { useRef } from 'react';
import PatternCanvas from './components/PatternCanvas';
import { usePatternStore } from './store/usePatternStore';
import { downloadPattern, readPatternFile } from './utils/fileIO';

export default function App() {
  const { name, rows, cols, cells, repeatX, repeatY, resize, setRepeat, setName, loadPattern } =
    usePatternStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSave = () => {
    downloadPattern({ name, rows, cols, cells, repeatX, repeatY });
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
    <div>
      <div className="toolbar">
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} style={{ width: 140 }} />
        </label>

        <label>
          Rows
          <input
            type="number"
            min={1}
            value={rows}
            onChange={(e) => resize(Number(e.target.value) || 1, cols)}
            style={{ width: 60 }}
          />
        </label>

        <label>
          Cols
          <input
            type="number"
            min={1}
            value={cols}
            onChange={(e) => resize(rows, Number(e.target.value) || 1)}
            style={{ width: 60 }}
          />
        </label>

        <label>
          Repeat X
          <input
            type="number"
            min={1}
            value={repeatX}
            onChange={(e) => setRepeat(Number(e.target.value) || 1, repeatY)}
            style={{ width: 60 }}
          />
        </label>

        <label>
          Repeat Y
          <input
            type="number"
            min={1}
            value={repeatY}
            onChange={(e) => setRepeat(repeatX, Number(e.target.value) || 1)}
            style={{ width: 60 }}
          />
        </label>

        <button onClick={handleSave}>Save as .txt</button>
        <button onClick={handleUploadClick}>Load .txt</button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,application/json"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      </div>

      <div className="stage-wrapper">
        <PatternCanvas />
      </div>
    </div>
  );
}
