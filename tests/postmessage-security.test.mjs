import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// src/release.js (the active shell) and src/App.jsx (its parallel, currently-unloaded twin) both
// drive React hooks/refs in a way this plain `node --test` runner has no JSX/hook-sandbox for
// (same category as session-workspace-logic.js/panel-system.js - see those tests' own header
// comments) - static source assertions cover the real fix here: the sender no longer targets '*'
// unconditionally, and the receiver validates origin, source, and message shape before acting.
const root = process.cwd();
const source = (...parts) => readFile(path.join(root, ...parts), 'utf8');

test("select/app.js's character-selection postMessage no longer targets '*' unconditionally - it targets the real parent origin except in the documented file:// exception", async () => {
  const text = await source('public', 'pages', 'select', 'app.js');
  assert.match(text, /window\.location\.protocol === 'file:' \? '\*' : window\.location\.origin/, 'the target origin must be computed, not hardcoded to *');
  assert.doesNotMatch(text, /postMessage\(\{[^}]*character-selected[^}]*\},\s*'\*'\)/, 'no call site may pass the literal string \'*\' directly as the target origin');
});

for (const [label, relativePath] of [['src/release.js', ['src', 'release.js']], ['src/App.jsx', ['src', 'App.jsx']]]) {
  test(`${label}'s message listener validates origin (isTrustedOrigin), source (the shell's own mounted iframe), and message shape before acting on a character-selected message`, async () => {
    const text = await source(...relativePath);
    assert.match(text, /isTrustedOrigin\(event\.origin\)/, `${label} must check event.origin`);
    assert.match(text, /event\.source\s*!==\s*iframeRef\.current\.contentWindow/, `${label} must check event.source against its own mounted iframe, not trust any sender`);
    assert.match(text, /isValidCharacterSelectedMessage\(event\.data\)/, `${label} must validate the message shape, not just check truthiness`);
  });

  test(`${label}'s isValidCharacterSelectedMessage only accepts a real, known character key, never an arbitrary string used to build a hash/URL`, async () => {
    const text = await source(...relativePath);
    assert.match(text, /Object\.prototype\.hasOwnProperty\.call\(pages, data\.character\)/, `${label} must check the character against its own known route table, not merely typeof`);
  });
}
