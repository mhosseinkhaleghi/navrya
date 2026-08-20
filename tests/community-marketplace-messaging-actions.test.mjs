import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

// Journey F, F26-F32: community.post.create, community.comment.create, marketplace.publish,
// marketplace.rate, marketplace.messageSeller, message.compose, message.reply. Same convention as
// tests/trade-lifecycle-actions.test.mjs - navrya-src has no DOM test harness in this project, the
// real proof is real-browser verification (see the F26-F32 final report). These are static-source
// regression guards for the confirmation-gate design (LOCAL_DRAFT vs PUBLIC_MUTATION/
// OUTBOUND_MESSAGE), target resolution, and the fabricated-performance-data protection.

const root = process.cwd();
const characterAppSrc = await readFile(path.join(root, 'navrya-src', 'character-app.jsx'), 'utf8');
const communityViewSrc = await readFile(path.join(root, 'navrya-src', 'communityView.jsx'), 'utf8');
const publishFlowSrc = await readFile(path.join(root, 'navrya-src', 'publishFlowModal.jsx'), 'utf8');
const marketplaceViewSrc = await readFile(path.join(root, 'navrya-src', 'marketplaceView.jsx'), 'utf8');
const messagesViewSrc = await readFile(path.join(root, 'navrya-src', 'messagesView.jsx'), 'utf8');
const patternRegistrySrc = await readFile(path.join(root, 'navrya-src', 'patternRegistryView.jsx'), 'utf8');
const strategyEducationSrc = await readFile(path.join(root, 'navrya-src', 'strategyEducationView.jsx'), 'utf8');
const contextEngineSrc = await readFile(path.join(root, 'public', 'pages', 'shared', 'ai-context-engine.js'), 'utf8');
const chatDockCoreSrc = await readFile(path.join(root, 'public', 'pages', 'shared', 'chat-dock-core.js'), 'utf8');

function actionBlock(id) {
  const re = new RegExp(`id: '${id.replace(/\./g, '\\.')}'[\\s\\S]*?resultContext: [\\s\\S]*?\\}\\);`);
  const match = re.exec(characterAppSrc);
  assert.ok(match, `could not find the real ${id} registration`);
  return match[0];
}

const CONFIRMATION_GATED = [
  ['community.post.create', 'publish'],
  ['community.comment.create', 'send'],
  ['marketplace.publish', 'confirmPublish'],
  ['marketplace.messageSeller', 'send'],
  ['message.compose', 'send'],
  ['message.reply', 'send']
];

test('every external-side-effect action requires its own confirmation-gate field', () => {
  for (const [id, field] of CONFIRMATION_GATED) {
    const block = actionBlock(id);
    assert.match(block, new RegExp(`requiredFields: \\['${field}'\\]`), `${id} must require '${field}'`);
  }
});

test('the community/messaging actions (which do have a real drafting phrase - "write"/"draft"/"compose a post/comment/message") explicitly address that phrasing in their own description, so it is never mistaken for send/publish intent', () => {
  for (const id of ['community.post.create', 'community.comment.create', 'message.compose', 'message.reply']) {
    assert.match(actionBlock(id), /write|draft|compose/i, `${id}'s description must explicitly address drafting-only phrasing`);
  }
});

test('every confirmation-gated action\'s submit() checks the gate field strictly (=== true or the string "true") before performing any real registry.submit()', () => {
  for (const [id, field] of CONFIRMATION_GATED) {
    const block = actionBlock(id);
    const re = new RegExp(`if \\(known\\.${field} !== true && known\\.${field} !== 'true'\\) return undefined;`);
    assert.match(block, re, `${id}'s submit() must gate strictly on known.${field}`);
  }
});

test('marketplace.rate delegates eligibility entirely to the real marketplace-rate-{id} registry gate - the model never grants itself eligibility', () => {
  const block = actionBlock('marketplace.rate');
  assert.match(block, /requiredFields: \['ratingValue'\]/);
  assert.match(block, /registry\.query\('marketplace-rate-' \+ listingId\)\.open/);
  assert.match(block, /never claim eligibility yourself/i);
});

test('marketplace.publish never fabricates performance data - successRatePercent/sampleSize are not in its optionalFields, and its description explicitly forbids inventing them', () => {
  const block = actionBlock('marketplace.publish');
  assert.match(block, /optionalFields: \['title', 'description', 'priceAmount', 'priceCurrency', 'previewItemCount'\]/);
  assert.doesNotMatch(block, /successRatePercent|sampleSize/);
  assert.match(block, /NEVER FABRICATE|never invent/i);
});

test('marketplace.publish resolves the active Pattern OR Strategy (never both), and navigates to the real Sharing sub-tab before polling for its hub - the hub only mounts there', () => {
  const block = actionBlock('marketplace.publish');
  assert.match(block, /resolveActivePatternId\(context\) \|\| resolveActiveStrategyId\(context\)/);
  assert.match(block, /'#strategies\/patterns\/' \+ encodeURIComponent\(patternId\) \+ '\/sharing'/);
  assert.match(block, /window\.TradeJournalStrategyEducation\.openDetail\(strategyId, 'sharing'\)/);
});

test('community.comment.create and marketplace.rate/messageSeller never guess an entity - available() strictly requires an already-resolved active post/listing', () => {
  assert.match(actionBlock('community.comment.create'), /available: \(context\) => !!resolveActivePostId\(context\)/);
  assert.match(actionBlock('marketplace.messageSeller'), /available: \(context\) => !!resolveActiveListingId\(context\)/);
});

test('message.compose resolves recipientName through the real user-search endpoint only - never a raw guessed id, and only auto-picks a recipient on an exact, unambiguous match', () => {
  assert.match(messagesViewSrc, /searchUsers\(wanted\)/);
  assert.match(messagesViewSrc, /matches\.length === 1/);
  assert.doesNotMatch(messagesViewSrc, /matches\[0\]\)[\s\S]{0,20}\n[\s\S]{0,80}matches\.length !== 1/);
});

test('message.reply and marketplace.messageSeller resolve their target the same "already open/resolved, never guessed" way - message.reply via the real messages-thread-reply gate, messageSeller via openThread(listingId) (never openThreadWithUser)', () => {
  const replyBlock = actionBlock('message.reply');
  assert.match(replyBlock, /registry\.query\('messages-thread-reply'\)\.open/);
  const sellerBlock = actionBlock('marketplace.messageSeller');
  assert.match(sellerBlock, /TradeJournalNavryaMessageSeller/);
  assert.match(marketplaceViewSrc, /openThread\(listing\.id\)/);
});

test('the real DOM registrations extend their allowlist with the matching synthetic, AI-only confirmation field (publish/send/confirmPublish) - required so a continuation turn (activeProcess.allowlist) has a schema path to express it, since none of these real forms has a draft-then-publish two-step of their own', () => {
  assert.match(communityViewSrc, /registry\.register\('community-new-post', \{\s*[\s\S]*?allowlist: \['text', 'publish'\]/);
  assert.match(communityViewSrc, /registry\.register\('community-comment-' \+ post\.id, \{\s*[\s\S]*?allowlist: \['draft', 'send'\]/);
  assert.match(publishFlowSrc, /allowlist: \['title', 'description', 'priceAmount', 'priceCurrency', 'previewItemCount', 'confirmPublish'\]/);
  assert.match(messagesViewSrc, /registry\.register\('messages-compose', \{\s*[\s\S]*?allowlist: \['text', 'recipientName', 'send'\]/);
  assert.match(messagesViewSrc, /registry\.register\('messages-thread-reply', \{\s*[\s\S]*?allowlist: \['draft', 'send'\]/);
});

test('every new modal/panel exposing submit() to the registry does so through a ref kept current every render, avoiding the ScenarioEditor-class stale-closure bug', () => {
  for (const src of [communityViewSrc, publishFlowSrc, messagesViewSrc]) {
    assert.match(src, /const submitRef = React\.useRef\(null\);/);
    assert.match(src, /submit: \(\) => submitRef\.current\(\)/);
  }
  assert.match(marketplaceViewSrc, /const submitRef = React\.useRef\(null\);/);
  // ThreadPanel additionally needs a threadIdRef - send() must read the CURRENT thread, never a
  // stale one captured when this effect (deps []) first ran, to prevent stale-thread leakage when
  // switching conversations without remounting.
  assert.match(messagesViewSrc, /const threadIdRef = React\.useRef\(threadId\);/);
  assert.match(messagesViewSrc, /threadIdRef\.current = threadId;/);
});

test('publishFlowModal.jsx never receives or forwards performance data from its allowlist - evidence stays a fixed prop from the caller (Pattern/Strategy\'s own real computed stats), structurally unfabricatable via chat', () => {
  assert.doesNotMatch(publishFlowSrc, /applyValue:[\s\S]{0,400}successRatePercent/);
  assert.match(publishFlowSrc, /options\.evidence\.successRatePercent/);
});

test('PatternSharing/StrategySharing expose their real openFlow() via a window hook, refs kept current every render (same convention as every other TradeJournalNavryaXxxHub)', () => {
  assert.match(patternRegistrySrc, /window\.TradeJournalNavryaPatternSharingHub = \{/);
  assert.match(patternRegistrySrc, /openFlowRef\.current/);
  assert.match(strategyEducationSrc, /window\.TradeJournalNavryaStrategySharingHub = \{/);
});

test('ai-context-engine.js resolves patternId/strategyId/postId/listingId, all following the exact activeOpenProcess()-prefix pattern, and includes all four in snapshot().activeEntities', () => {
  for (const fn of ['activePatternId', 'activeStrategyId', 'activePostId', 'activeListingId']) {
    assert.match(contextEngineSrc, new RegExp(`function ${fn}\\(\\)`));
  }
  assert.match(contextEngineSrc, /patternId: activePatternId\(\), strategyId: activeStrategyId\(\)/);
  assert.match(contextEngineSrc, /postId: activePostId\(\), listingId: activeListingId\(\)/);
});

test('activeListingId() resolves from a dedicated marketplace-listing-{id} registration, not the conditional marketplace-rate-{id} (whose isOpen() is gated on rating eligibility - unsuitable as a general "is this listing being viewed" signal)', () => {
  assert.match(contextEngineSrc, /active\.id\.indexOf\('marketplace-listing-'\)/);
  assert.match(marketplaceViewSrc, /registry\.register\('marketplace-listing-' \+ listing\.id, \{ allowlist: \[\], isOpen: \(\) => mountedRef\.current \}\)/);
});

test('chat-dock-core.js excludes pattern-editor-/strategy-editor-/messages-thread-reply/community-comment-/marketplace-rate- from blocking fresh action-discovery, unless a workflow is already genuinely continuing through that exact process', () => {
  assert.match(chatDockCoreSrc, /pattern-editor-\|strategy-editor-\|messages-thread-reply\|community-comment-\|marketplace-rate-/);
  assert.match(chatDockCoreSrc, /passiveWorkflowMatch = currentWorkflow && currentWorkflow\.processId === activeProcess\.id/);
});

test('none of the seven new actions ever touch API keys, auth tokens, or admin credentials', () => {
  for (const [id] of [...CONFIRMATION_GATED, ['marketplace.rate']]) {
    assert.doesNotMatch(actionBlock(id), /apiKey|authToken|credential|admin/i);
  }
});
