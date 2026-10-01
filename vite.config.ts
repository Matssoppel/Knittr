import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative asset paths, so the build works from a subfolder such as
  // https://<user>.github.io/Knittr/ (GitHub Pages) as well as from a root.
  base: './',
});
