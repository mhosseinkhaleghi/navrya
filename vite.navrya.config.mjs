import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// A separate, dedicated build for the NAVRYA design-system pilot (Sessions tab, all four
// characters). Kept entirely apart from vite.config.js (the main build) since
// public/pages/*/index.html files are plain static assets outside Vite's normal build graph -
// this produces one self-contained script per character (React + ReactDOM + the NAVRYA
// components bundled together, since character pages have no other React runtime available)
// that each page loads via a plain <script src> tag, the same way every other
// public/pages/shared/*.js file is a prebuilt, checked-in artifact.
//
// One character per invocation, selected via NAVRYA_CHARACTER (see navrya-src/build.mjs) -
// Rollup's IIFE output format does not support multi-entry code-splitting, so four characters
// sharing most of their dependency graph cannot be built as one multi-entry config; running this
// config four times (once per character) is the straightforward alternative.
const character = process.env.NAVRYA_CHARACTER || 'hunter';

export default defineConfig({
  plugins: [react()],
  // outDir lives inside the default publicDir ('public/'); without this, Vite's "copy
  // publicDir into outDir" step tries to copy public/ into public/pages/shared (which is
  // itself inside public/), recursively copying the tree into itself and hanging the build.
  publicDir: false,
  // React's UMD/dev-mode branches reference process.env.NODE_ENV; the main vite.config.js
  // build gets this for free from Vite's default esbuild/rollup setup for an HTML entry, but
  // this separate lib-mode IIFE build does not - without it the bundle throws
  // "process is not defined" the instant it loads in the browser (no Node "process" global there).
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    outDir: 'public/pages/shared',
    emptyOutDir: false,
    lib: {
      entry: 'navrya-src/entries/' + character + '.jsx',
      formats: ['iife'],
      name: 'NavryaApp_' + character,
      fileName: () => 'navrya-' + character + '-sessions-app.js'
    }
  }
});
