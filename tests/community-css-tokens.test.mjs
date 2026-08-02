import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const shared = (...parts) => path.join(root, 'public', 'pages', 'shared', ...parts);
const source = file => readFile(shared(file), 'utf8');

test('every new Community CSS file themes its accent color off var(--ps-accent...), not a hardcoded competing palette', async () => {
  for (const file of ['community.css', 'marketplace.css', 'messages.css', 'dev-user-switcher.css']) {
    const css = await source(file);
    assert.match(css, /var\(--ps-accent/, file + ' must reference --ps-accent at least once so it themes per-character');
  }
});

test('the dev-mode badge is a fixed, always-legible warning color, not themed off the character accent (it must stay recognizable across all four characters)', async () => {
  const css = await source('dev-user-switcher.css');
  assert.match(css, /\.tj-dev-mode-badge\{[^}]*background:#[0-9a-fA-F]{3,6}/, 'the badge uses a fixed background color rather than var(--ps-accent), so it reads the same regardless of character theme');
});

test('marketplace and messages CSS avoid hardcoding a border color that would fight --ps-line across all four character themes', async () => {
  for (const file of ['marketplace.css', 'messages.css', 'community.css']) {
    const css = await source(file);
    const borderDeclarations = css.match(/border(?:-\w+)?:\s*1px solid[^;]+/g) || [];
    borderDeclarations.forEach((decl) => {
      assert.match(decl, /var\(--ps-(line|accent)/, file + ': "' + decl + '" should use a --ps-* token, not a hardcoded color');
    });
  }
});
