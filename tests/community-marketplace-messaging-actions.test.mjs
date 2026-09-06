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
const strategiesHubSrc = await readFile(path.join(root, 'navrya-src', 'strategiesHubView.jsx'), 'utf8');
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

test('marketplace.publish resolves the active Pattern OR Strategy (never both), and opens the LIVE Strategies Hub\'s own Share tab (openExisting(id, \'share\')) before polling for its publish form', () => {
  const block = actionBlock('marketplace.publish');
  assert.match(block, /resolveActivePatternId\(context\) \|\| resolveActiveStrategyId\(context\)/);
  assert.match(block, /window\.TradeJournalNavryaPatternHub\.openExisting\(patternId, 'share'\)/);
  assert.match(block, /window\.TradeJournalNavryaStrategyHub\.openExisting\(strategyId, 'share'\)/);
  assert.match(block, /window\.TradeJournalNavryaShareTabHub/);
  assert.match(block, /shareHub\.openPublishForm\(\)/);
});

// Journey H1: marketplace.publish used to route through the orphaned, pre-NAVRYA legacy pages
// (pattern-registry.js's window.TradeJournalPatternRegistry.render() / strategy-education.js's
// window.TradeJournalStrategyEducation.openDetail()) instead of the LIVE Strategies Hub - found
// via real code tracing (panel-system.js's own showCustom(), what those legacy pages' layer.show()
// calls into, never unmounts the previous React root, unlike the real render() path). Fixed to
// open the live Hub's own Share tab/publish form instead - these two globals must never appear in
// the action's own open()/submit() again, structurally, not just by manual inspection.
test('marketplace.publish never CALLS the legacy pattern-registry.js/strategy-education.js globals anymore (a code-comment mention of the old bug, for context, is fine - an actual invocation is not)', () => {
  const block = actionBlock('marketplace.publish');
  assert.doesNotMatch(block, /window\.TradeJournalPatternRegistry\.(render|open)/, 'the legacy Pattern Registry page must never be routed through again');
  assert.doesNotMatch(block, /window\.TradeJournalStrategyEducation\.openDetail/, 'the legacy Strategy Education page must never be routed through again');
  assert.doesNotMatch(block, /'#strategies\/patterns\/.*\/sharing'/, 'the legacy hash-route navigation must be gone');
});

test('marketplace.publish forces the real, unmount-safe render() path onto \'strategies\' (self-healing any already-orphaned legacy root) only when not already there, and submits through the new strategy-hub-publish-flow process', () => {
  const block = actionBlock('marketplace.publish');
  assert.match(block, /if \(store\.getState\(\)\.activeId !== 'strategies'\) store\.setActiveId\('strategies'\);/);
  assert.match(block, /registry\.query\('strategy-hub-publish-flow'\)\.open/);
  assert.match(block, /processId: 'strategy-hub-publish-flow'/);
  assert.match(block, /TradeJournalAIProcessRegistry\.submit\('strategy-hub-publish-flow'\)/);
});

test('strategiesHubView.jsx\'s live ShareTab/PublishForm register \'strategy-hub-publish-flow\' with the Process Registry - a NEW id, deliberately distinct from the legacy publishFlowModal.jsx\'s own \'publish-flow\'', () => {
  assert.match(strategiesHubSrc, /registry\.register\('strategy-hub-publish-flow', \{/);
  assert.match(strategiesHubSrc, /layer: 'foreground'/);
  assert.match(strategiesHubSrc, /allowlist: \['title', 'description', 'priceAmount', 'priceCurrency', 'previewItemCount', 'confirmPublish'\]/);
  assert.match(strategiesHubSrc, /submit: \(\) => submitRef\.current\(\)/);
  assert.match(strategiesHubSrc, /window\.TradeJournalNavryaShareTabHub = \{ openPublishForm: \(\) => setFormOpenRef\.current\(true\) \}/);
});

test('openExistingPattern/openExistingStrategy accept an optional target tab (needed to open straight into \'share\'), defaulting to \'details\' exactly as before', () => {
  assert.match(strategiesHubSrc, /function openExistingPattern\(id, tabId\) \{ setTab\('patterns'\); openItem\('pattern', id, tabId \|\| 'details'\); \}/);
  assert.match(strategiesHubSrc, /function openExistingStrategy\(id, tabId\) \{ setTab\('strategies'\); openItem\('strategy', id, tabId \|\| 'details'\); \}/);
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

// Slice W1 (field/gate contracts), audit finding: marketplace.messageSeller targets
// 'messages-thread-reply' (the previous test pins its real allowlist as ['draft', 'send']), but
// the action's own field schema declared 'text' - every extracted message body silently failed
// ai-process-registry.js's own allowlist check, so voice/chat could never actually fill the
// message draft for this specific action. message.reply (the other action targeting the same
// real process) already used the correct 'draft' name - only messageSeller was wrong.
test('marketplace.messageSeller declares the same field name its real target (messages-thread-reply) actually accepts - draft, not text', () => {
  const block = actionBlock('marketplace.messageSeller');
  assert.match(block, /optionalFields: \['draft'\]/);
  assert.doesNotMatch(block, /optionalFields: \['text'\]/);
});

// message.compose is a DIFFERENT process (messages-compose, the "New Message" composer, not the
// thread-reply panel) whose own real allowlist genuinely is ['text', 'recipientName', 'send'] -
// confirming here that this action's matching 'text' field name is correct and must never be
// "fixed" to 'draft' by mistake alongside marketplace.messageSeller's real bug above.
test('message.compose correctly uses text (its real target, messages-compose, actually accepts text) - a different process from messages-thread-reply, never to be confused with marketplace.messageSeller\'s fix', () => {
  const block = actionBlock('message.compose');
  assert.match(block, /optionalFields: \['recipientName', 'text'\]/);
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

// --- Slice U1-e (execution brief section 9 item 9, "real Marketplace search/sort" + "existing
// listing opening") ---

test('marketplace.search only fills the real query/sort state the storefront\'s own SearchField/Select already own - sort is validated/mapped to the exact real i18n keys the component expects, never an invented value', () => {
  const block = actionBlock('marketplace.search');
  assert.match(block, /entityAlreadyPersisted: true/);
  assert.match(block, /optionalFields: \['query', 'sort'\]/);
  assert.match(block, /newest: 'marketplaceSortNewest'/);
  assert.match(block, /'price high to low': 'marketplaceSortPriceHigh'/);
});

test('the real marketplace-storefront registration exists, with an allowlist of exactly query/sort, and sort is validated against the real SORT_OPTIONS list', () => {
  const registration = /registry\.register\('marketplace-storefront', \{[\s\S]*?\n {4}\}\);/.exec(marketplaceViewSrc);
  assert.ok(registration);
  assert.match(registration[0], /allowlist: \['query', 'sort'\]/);
  assert.match(registration[0], /if \(path === 'sort' && SORT_OPTIONS\.indexOf\(value\) !== -1\) setSort\(value\);/);
});

test('marketplace-storefront and marketplace.search are excluded from the same entityAlreadyPersisted-workflow bug class every other such settings/search action already is', () => {
  assert.match(chatDockCoreSrc, /activeProcess\.id === 'marketplace-storefront'/);
  assert.match(chatDockCoreSrc, /workflowProcessId === 'marketplace-storefront'/);
});

test('marketplace.listing.open requires listingTitle and resolves it via an exact, case-insensitive title match against the real listing list - zero or multiple matches resolve nothing, never guessed', () => {
  const block = actionBlock('marketplace.listing.open');
  assert.match(block, /requiredFields: \['listingTitle'\], optionalFields: \[\]/);
  assert.match(block, /store\.listListings\(\{\}\)\.then\(\(listings\) => \{/);
  assert.match(block, /String\(l\.title \|\| ''\)\.trim\(\)\.toLowerCase\(\) === wanted/);
  assert.match(block, /if \(matches\.length !== 1\) \{ resolve\(null\); return; \} \/\/ zero or ambiguous - never guess/);
});

test('marketplace.listing.open navigates via the real #community/marketplace/{id} hash and polls for the exact same real marketplace-listing-{id} registration marketplace.rate/messageSeller already target once open', () => {
  const block = actionBlock('marketplace.listing.open');
  assert.match(block, /location\.hash = '#community\/marketplace\/' \+ encodeURIComponent\(listingId\);/);
  assert.match(block, /registry\.query\('marketplace-listing-' \+ listingId\)\.open/);
  assert.match(block, /\(\) => resolve\(\{ processId: 'marketplace-listing-' \+ listingId \}\),/);
});

test('marketplace.search and marketplace.listing.open never touch API keys, auth tokens, or admin credentials', () => {
  for (const id of ['marketplace.search', 'marketplace.listing.open']) {
    assert.doesNotMatch(actionBlock(id), /apiKey|authToken|credential|admin/i);
  }
});
