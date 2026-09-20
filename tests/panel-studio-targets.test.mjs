import assert from 'node:assert/strict';
import test from 'node:test';
import { getTarget, isSupportedTarget, ENABLED_TARGET_IDS, TARGETS } from '../navrya-src/panelStudioTargets.js';

test('dashboard.panel is the only enabled v1 target', () => {
  assert.deepEqual(ENABLED_TARGET_IDS, ['dashboard.panel']);
  assert.equal(TARGETS['dashboard.panel'].enabled, true);
});

test('getTarget/isSupportedTarget accept the one enabled target and reject everything else', () => {
  assert.ok(getTarget('dashboard.panel'));
  assert.equal(isSupportedTarget('dashboard.panel'), true);
  ['session.panel', 'report.widget', 'nonsense', '', undefined, null].forEach((id) => {
    assert.equal(getTarget(id), null, `${id} must not resolve to a target`);
    assert.equal(isSupportedTarget(id), false, `${id} must not be treated as supported`);
  });
});

test('the enabled target declares its full plug-in contract', () => {
  const target = TARGETS['dashboard.panel'];
  assert.equal(typeof target.promptBuilderModule, 'string');
  assert.equal(typeof target.sandboxModule, 'string');
  assert.equal(typeof target.applyAdapter, 'string');
  assert.ok(Array.isArray(target.bridgeMethods) && target.bridgeMethods.length > 0);
  assert.equal(target.maxSourceBytes, 12 * 1024);
  assert.equal(target.maxPromptChars, 400);
});
