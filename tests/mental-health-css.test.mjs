import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const cssPath = path.join(root, 'public', 'pages', 'shared', 'mental-health.css');

test('.mh-choice-grid buttons set explicit color/background (never relying on inherited button{color:inherit}), and the selected state themes off --ps-accent', async () => {
  const css = await readFile(cssPath, 'utf8');

  const base = css.match(/\.mh-choice-grid button\{([^}]*)\}/);
  assert.ok(base, '.mh-choice-grid button rule must exist');
  assert.match(base[1], /color:/, 'default state must set an explicit color, not rely on inheritance');
  assert.match(base[1], /background:/, 'default state must set an explicit background, not the native button face');

  const selected = css.match(/\.mh-choice-grid button\.selected\{([^}]*)\}/);
  assert.ok(selected, '.mh-choice-grid button.selected rule must exist');
  assert.match(selected[1], /var\(--ps-accent/, 'the selected state must theme off --ps-accent so it themes correctly across all four characters');
});
