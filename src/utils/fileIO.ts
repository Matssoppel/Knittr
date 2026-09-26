import { PatternFile } from '../store/usePatternStore';

// We store the file as JSON under a .txt extension: structured enough to parse
// reliably, plain enough to peek at in a text editor if something goes wrong.

export function downloadPattern(pattern: PatternFile) {
  const json = JSON.stringify(pattern, null, 2);
  const blob = new Blob([json], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `${pattern.name || 'pattern'}.txt`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function readPatternFile(file: File): Promise<PatternFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string);
        // Light validation so a malformed/foreign file fails loudly instead of
        // silently rendering a broken grid.
        if (
          typeof parsed?.rows !== 'number' ||
          typeof parsed?.cols !== 'number' ||
          !Array.isArray(parsed?.cells)
        ) {
          throw new Error('File does not look like a valid pattern.');
        }
        resolve(parsed as PatternFile);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
