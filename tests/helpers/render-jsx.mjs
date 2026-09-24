import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';

// Renders the REAL navrya-src .jsx components in a test, without a DOM, a browser or a new dependency.
//
// `node --test` has no JSX transform, so most view tests are static (regex over the source). That blind spot
// shipped two ReferenceErrors to production (tests/analysis-profile-no-undefined-constants.test.mjs exists because
// of it): nothing ever EXECUTED a render. This bundles the requested modules with esbuild (already here as Vite's
// own compiler) together with React, and server-renders them: renderToStaticMarkup runs the whole render phase -
// every hook initialiser, every branch, every translation lookup - and skips effects (they need a DOM).
//
// The components read the same globals the character page provides (window.TradeJournal...); a test sets
// `globalThis.window` BEFORE rendering and deletes it afterwards.
//
//   const jsx = await loadJsx({ report: 'navrya-src/analysisProfileReport.jsx' });
//   const html = jsx.render(jsx.modules.report.ProfileReportView, { ... });
//   await jsx.cleanup();

const root = process.cwd();
const require = createRequire(import.meta.url);

export async function loadJsx(entries) {
  const names = Object.keys(entries);
  const scratch = await mkdtemp(path.join(os.tmpdir(), 'nv-render-'));
  const outfile = path.join(scratch, 'bundle.cjs');
  const contents = [
    "import React from 'react';",
    "import { renderToStaticMarkup } from 'react-dom/server';",
    ...names.map((name) => `import * as ${name} from ${JSON.stringify('./' + entries[name].replace(/\\/g, '/'))};`),
    `export { React, renderToStaticMarkup, ${names.join(', ')} };`
  ].join('\n');
  await build({
    stdin: { contents, resolveDir: root, loader: 'jsx', sourcefile: 'render-entry.jsx' },
    bundle: true, format: 'cjs', platform: 'node', outfile, jsx: 'transform',
    define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'silent'
  });
  const bundle = require(outfile);
  return {
    modules: names.reduce((map, name) => { map[name] = bundle[name]; return map; }, {}),
    React: bundle.React,
    render: (Component, props) => bundle.renderToStaticMarkup(bundle.React.createElement(Component, props)),
    cleanup: () => rm(scratch, { recursive: true, force: true })
  };
}

// Markup -> the text a reader sees (tags dropped, entities decoded), so an assertion can compare against a translated string.
export function visibleText(html) {
  return String(html)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ').trim();
}
