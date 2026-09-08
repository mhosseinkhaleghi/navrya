import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

// Voice Command Learning Profile addendum, section 11: buildPersonaStyleText() (server/pattern-
// ai-server.mjs) is a pure, dependency-free function with NO existing automated coverage anywhere
// in this repo (confirmed: no test file imports pattern-ai-server.mjs at all - a big server
// bootstrap module with real side effects, a pre-existing gap this pass does not expand scope to
// fix generally). This function specifically is extractable and testable the same way
// aiAssistantView.jsx's combineCustomInstructions() already is - real, dynamic verification that
// the new strictness/preferredName/preferredLanguage/responseLength/coachingStyle fields actually
// render into the real system-prompt text sent to the model, not just that the source contains the
// right-looking lines.

const root = process.cwd();

async function loadBuildPersonaStyleText() {
  const source = await readFile(path.join(root, 'server', 'pattern-ai-server.mjs'), 'utf8');
  const start = source.indexOf('function buildPersonaStyleText(personaStyle) {');
  assert.ok(start > -1, 'could not find the real buildPersonaStyleText() in pattern-ai-server.mjs');
  const closingRe = /return lines\.join\('\\n'\);\r?\n\}/;
  const closingMatch = closingRe.exec(source.slice(start));
  assert.ok(closingMatch, 'could not find the real end of buildPersonaStyleText()');
  const fnSource = source.slice(start, start + closingMatch.index + closingMatch[0].length);
  const sandbox = {};
  vm.runInNewContext(fnSource, sandbox);
  return sandbox.buildPersonaStyleText;
}

test('buildPersonaStyleText(): renders the new strictness dimension using the same low/moderate/high hint banding as every other dimension', async () => {
  const build = await loadBuildPersonaStyleText();
  const strict = build({ toneDimensions: { strictness: 90 } });
  assert.match(strict, /strictness: 90\/100 \(be strict - push back, hold the user accountable, do not let things slide\)/);
  const lenient = build({ toneDimensions: { strictness: 10 } });
  assert.match(lenient, /strictness: 10\/100 \(be lenient, do not push back or hold the user accountable\)/);
});

test('buildPersonaStyleText(): renders preferredName as an address instruction, only when actually set', async () => {
  const build = await loadBuildPersonaStyleText();
  assert.match(build({ preferredName: 'Ali' }), /address the user as "Ali" when using their name/);
  assert.doesNotMatch(build({}), /address the user as/);
});

test('buildPersonaStyleText(): renders preferredLanguage as a real language name (not a raw locale code), and is omitted when unset', async () => {
  const build = await loadBuildPersonaStyleText();
  assert.match(build({ preferredLanguage: 'fa' }), /preferred reply language: Persian \(Farsi\)/);
  assert.match(build({ preferredLanguage: 'ar' }), /preferred reply language: Arabic/);
  assert.match(build({ preferredLanguage: 'es' }), /preferred reply language: Spanish/);
  assert.doesNotMatch(build({}), /preferred reply language/);
});

test('buildPersonaStyleText(): renders responseLength and coachingStyle with their own real hint text, only when set', async () => {
  const build = await loadBuildPersonaStyleText();
  assert.match(build({ responseLength: 'brief' }), /response length: brief \(keep replies short - a few sentences, no filler\)/);
  assert.match(build({ coachingStyle: 'socratic' }), /coaching style: socratic \(favor guiding questions over direct answers/);
  assert.doesNotMatch(build({}), /response length:|coaching style:/);
});

test('buildPersonaStyleText(): an empty/untouched personaStyle still renders the safety-boundary footer - persona preferences can never override WHAT is true', async () => {
  const build = await loadBuildPersonaStyleText();
  const text = build({});
  assert.match(text, /They can NEVER change WHAT is true/);
  assert.match(text, /=== END OF ASSISTANT PERSONA ===/);
});

test('buildPersonaStyleText(): a falsy/non-object personaStyle returns an empty string rather than throwing', async () => {
  const build = await loadBuildPersonaStyleText();
  assert.equal(build(null), '');
  assert.equal(build(undefined), '');
});
