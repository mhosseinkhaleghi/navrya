import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// HOTFIX: NewSessionDialog.jsx's own date fields defaulted to hardcoded, stale mock strings
// ('08/01/2026'/'۱۴۰۵/۰۵/۱۰') left over from an early design mockup - every session created
// without the user manually touching the date fields silently recorded that literal fake date
// forever, regardless of when it was actually created (a real data-integrity bug found live: a
// user's real session was dated 08/01/2026 though created on a completely different day).
// '08/01/2026' also isn't ISO 'yyyy-MM-dd', so liveSessionView.jsx's ChartEntryModal - the one
// real <input type="date"> in the whole NAVRYA React tree - silently failed to display it and
// logged a real browser format warning once that session's own date reached it.
//
// Both .jsx files here have no JSX/ESM transform wired into this project's plain `node --test`
// runner (the established, documented limitation for every navrya-src/*.jsx and
// public/pages/shared/navrya/**/*.jsx file), so this is static source-assertion coverage,
// matching the rest of this project's own convention for the same reason.
const root = process.cwd();

test("NewSessionDialog.jsx's date defaults are computed for real (todayIso()/todayJalali()), never a hardcoded mock string", async () => {
  const text = await readFile(path.join(root, 'public', 'pages', 'shared', 'navrya', 'components', 'sessions', 'NewSessionDialog.jsx'), 'utf8');
  const defaultsLine = text.split('\n').find((line) => line.includes('defaults = {'));
  assert.ok(defaultsLine, 'could not find the defaults = {...} parameter line');
  assert.doesNotMatch(defaultsLine, /08\/01\/2026/, 'the old hardcoded mock Gregorian date must be gone from the actual defaults object (a comment mentioning it for context elsewhere in the file is fine)');
  assert.doesNotMatch(defaultsLine, /۱۴۰۵\/۰۵\/۱۰/, 'the old hardcoded mock Jalali date must be gone from the actual defaults object');
  assert.match(text, /function todayIso\(\)\s*\{\s*return new Date\(\)\.toISOString\(\)\.slice\(0,\s*10\);\s*\}/, 'todayIso() must return a real, current ISO date');
  assert.match(text, /function todayJalali\(\)\s*\{\s*return new Intl\.DateTimeFormat\('fa-IR-u-ca-persian',\s*\{\s*year:\s*'numeric',\s*month:\s*'2-digit',\s*day:\s*'2-digit'\s*\}\)\.format\(new Date\(\)\);\s*\}/);
  assert.match(defaultsLine, /gregorian:\s*todayIso\(\),\s*jalali:\s*todayJalali\(\)/, 'the defaults object must actually use the real computed values, not just declare unused functions');
});

test("liveSessionView.jsx's ChartEntryModal validates session.date is real ISO ('yyyy-MM-dd') before trusting it as the native date input's value - falls back to today's real date for a malformed/legacy value instead of feeding the browser's <input type=\"date\"> something it will silently reject", async () => {
  const text = await readFile(path.join(root, 'navrya-src', 'liveSessionView.jsx'), 'utf8');
  assert.match(text, /const isIsoDate = \(value\) => typeof value === 'string' && \/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\/\.test\(value\);/);
  assert.match(text, /const \[date, setDate\] = React\.useState\(isIsoDate\(session\.date\) \? session\.date : new Date\(\)\.toISOString\(\)\.slice\(0, 10\)\);/);
  assert.doesNotMatch(text, /React\.useState\(session\.date \|\| new Date\(\)/, 'the old ungated pass-through must be gone');
});
