import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// HOTFIX regression guard. Found live: adding a chart/movement entry to a session logged three
// real POST /api/users/me/xp-events 404 (SOURCE_NOT_FOUND) requests in the browser console. Root
// cause: session-workspace-logic.js's save() (and the equivalent save()/write() in
// trade-store.js/pattern-registry-store.js/strategy-education-store.js/mental-health-store.js)
// dispatches its own tradejournal:*-changed event synchronously, before that same call's
// fire-and-forget replica upsert()/set() has actually reached the server. account-profile-store.js
// listened to those events directly and scanned/fired XP awards in the same tick, so a brand-new
// record's own award (sourceType/sourceId pointing straight at the not-yet-landed record) could
// reach the server and 404 before routes.profile.mjs's verifySourceAndState() could find it.
//
// No XP was ever permanently lost - sync-queue.js's own retry-with-backoff already recovers this
// a couple seconds later once the source record exists - but every new session/trade/pattern/
// strategy/reflection needlessly failed its first send, alarming-looking in the console for no
// real reason. This file is static source-assertion coverage (account-profile-store.js has no
// existing dynamic vm-sandbox test infrastructure to build on - it reaches deep into several
// other stores' own live window globals - matching this project's own established fallback
// convention for files in that position).
const root = process.cwd();
const shared = (file) => path.join(root, 'public', 'pages', 'shared', file);

test('the five local-first-replica *-changed listeners (trades/sessions/patterns/strategy-education/mental-health) are wrapped in a short setTimeout defer, not called synchronously on the event', async () => {
  const text = await readFile(shared('account-profile-store.js'), 'utf8');
  assert.match(text, /function deferred\(fn\)\s*\{\s*return function\s*\(\)\s*\{\s*setTimeout\(fn,\s*300\);\s*\};\s*\}/);
  [
    "window.addEventListener('tradejournal:trades-changed', deferred(onTradesChangedXp));",
    "window.addEventListener('tradejournal:sessions-changed', deferred(onSessionsChangedXp));",
    "window.addEventListener('tradejournal:patterns-changed', deferred(onPatternsChangedXp));",
    "window.addEventListener('tradejournal:strategy-education-changed', deferred(onStrategiesChangedXp));",
    "window.addEventListener('tradejournal:mental-health-changed', deferred(onMentalHealthChangedXp));"
  ].forEach((line) => assert.ok(text.includes(line), 'missing or changed: ' + line));
});

test('community listing/post events are unaffected - they are a different domain (server-authoritative Community writes, not the local-first replica pattern) with no equivalent race to defer against', async () => {
  const text = await readFile(shared('account-profile-store.js'), 'utf8');
  assert.match(text, /window\.addEventListener\('tradejournal:listing-published', onListingPublished\);/);
  assert.match(text, /window\.addEventListener\('tradejournal:listing-purchased', onListingPurchased\);/);
  assert.match(text, /window\.addEventListener\('tradejournal:community-post-published', onCommunityPostPublished\);/);
});

test('the one-time boot-time XP scan (window.setTimeout(..., 0) calling every trigger once on load) is untouched by this fix - it already runs after the replica has had a chance to hydrate, so it is not the race this fix targets', async () => {
  const text = await readFile(shared('account-profile-store.js'), 'utf8');
  assert.match(text, /window\.setTimeout\(function \(\) \{\s*onTradesChangedXp\(\); onSessionsChangedXp\(\); onPatternsChangedXp\(\); onStrategiesChangedXp\(\);\s*onMentalHealthChangedXp\(\); checkSellerRatings\(\); checkAchievements\(\);\s*\}, 0\);/);
});
