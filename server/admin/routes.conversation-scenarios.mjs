import express from 'express';
import { ApiError, asyncHandler } from '../community/errors.mjs';
import { getConversationMatcher } from '../community/conversation-matcher-bridge.mjs';
import { synthesize, ElevenLabsError } from '../community/elevenlabs-client.mjs';
import { computeAudioContentHash } from '../community/conversation-audio-identity.mjs';
import { saveAudio } from '../storage/audio-storage.mjs';
import {
  responseSetFor, effectiveVoiceText, effectiveVoiceTextFor, validatePerformanceText,
  SUPPORTED_AUDIO_TAGS, CAUTION_DOMAINS
} from '../community/performance-text.mjs';
import { generatePerformanceText } from '../community/enhance-delivery-provider.mjs';
import { rateLimit, sessionKey } from '../community/security/rate-limit.mjs';

// Governance audit (H2 follow-up review): Enhance Delivery spends real provider cost per call,
// exactly like the existing admin ElevenLabs /test-sample route
// (server/admin/routes.voice-providers.mjs) - the real, closest precedent for "an admin-authoring-
// time action that calls a paid AI provider directly, not through the user-facing gateway." That
// route is rate-limited (`testSampleLimiter`, 5/min/session); Enhance Delivery was missing the
// same control, found via this audit and fixed narrowly here - same shape, same store, no new
// infrastructure. (health-event reporting/quota/wallet do NOT apply here: those are
// pattern-ai-server.mjs's own governance for user-billed AI-gateway calls, a different category
// this admin-authoring action was never part of, exactly like /test-sample never was either.)
const enhanceDeliveryLimiter = rateLimit({ windowMs: 60 * 1000, max: 5, keyFn: sessionKey('conversation-enhance-delivery') });

// Journey H2, Gate 2: Conversation Studio admin API. Mounted at
// /api/admin/conversation-scenarios inside routes.mjs, so it inherits requireAdmin() for free
// (applied once at the outer /api/admin mount in app.mjs) - the exact same pattern
// voice-providers/commercial already use.
//
// Every mutating route calls audit() with the scenario id/version only - never the full
// `definition` body (spec section 7: no giant response bodies or sensitive data in the audit
// log). Publish/rollback both run the FULL quality gate (spec section 29) server-side via the
// shared matcher bridge before committing anything, so a client bypassing the admin UI cannot
// skip validation - the UI's own pre-publish checks are a convenience, not the real boundary.

const SUPPORTED_LANGUAGES = ['fa', 'ar', 'en', 'es'];
// A scenario's ctaActionId only ever needs to be a SAFE reference an admin can later use to power
// a suggested next step (spec section 25) - never executed by anything in this gate. Deliberately
// the well-known, non-destructive, already-documented actions from the real Action Registry
// (navrya-src/character-app.jsx) - kept as a small static allowlist here (server-side, no
// visibility into the browser's own registry) exactly like SUPPORTED_LANGUAGES/
// SUPPORTED_CHARACTERS in routes.voice-providers.mjs already does for its own equivalent case.
const SAFE_CTA_ACTION_IDS = ['session.create', 'trade.calculator', 'pattern.create', 'strategy.create', 'navigate.to'];
// The exact template variables each code-owned data-query resolver actually provides -
// ai-conversation-router.js's own DATA_QUERY_RESOLVERS map, restated here so publish validation
// can catch a response referencing a variable the resolver never supplies (spec section 29's
// "Invalid template variable").
const DATA_QUERY_VARIABLES = { 'trade.open_count': ['count'], 'trade.default_risk': ['value'] };

async function audit(req, repo, action, targetType, targetId, details) {
  await repo.auditLog.create({ adminUserId: req.currentUser.id, action, targetType, targetId, details: details || {} });
}

function summarizeScenario(scenario) {
  const languages = {};
  const definition = (scenario.publishedVersion || scenario.draftVersion || {}).definition || {};
  SUPPORTED_LANGUAGES.forEach((lang) => {
    const hasTriggers = !!(definition.languages && definition.languages[lang]);
    const hasResponse = !!(definition.responses && definition.responses[lang] && definition.responses[lang].written);
    languages[lang] = hasTriggers && hasResponse ? 'complete' : hasTriggers || hasResponse ? 'partial' : 'none';
  });
  return {
    id: scenario.id, scenarioKey: scenario.scenarioKey, domain: scenario.domain, kind: scenario.kind,
    status: scenario.archivedAt ? 'archived' : scenario.publishedVersionId ? 'published' : 'draft',
    publishedVersion: scenario.publishedVersion ? scenario.publishedVersion.versionNumber : null,
    hasDraft: !!scenario.draftVersionId, languages, updatedAt: scenario.updatedAt
  };
}

// Publish-time quality gate (spec section 29). Returns {errors, warnings} - publish is refused
// only for `errors`; `warnings` are surfaced but never block.
async function validateForPublish(matcher, draftDefinition, scenario, otherPublishedScenarios) {
  const errors = [];
  const warnings = [];
  const languages = draftDefinition.languages || {};
  const responses = draftDefinition.responses || {};
  const authoredLanguages = Object.keys(languages).filter((lang) => (languages[lang].groups || []).length);
  if (!authoredLanguages.length) errors.push({ code: 'NO_SUPPORTED_LANGUAGE', message: 'At least one language needs real trigger groups before this can be published.' });

  authoredLanguages.forEach((lang) => {
    if (!responses[lang] || !responses[lang].written) warnings.push({ code: 'LANGUAGE_TRIGGERS_WITHOUT_RESPONSE', language: lang, message: lang + ' has triggers but no response - it will never actually resolve for a user in that language.' });
  });

  if (scenario.ctaActionId && SAFE_CTA_ACTION_IDS.indexOf(scenario.ctaActionId) === -1) {
    errors.push({ code: 'UNSAFE_CTA_ACTION_ID', message: '"' + scenario.ctaActionId + '" is not in the known-safe CTA action allowlist.' });
  }

  const allowedVars = scenario.kind === 'data_query' ? (DATA_QUERY_VARIABLES[scenario.dataQueryRef] || []) : [];
  Object.keys(responses).forEach((lang) => {
    const used = matcher.templateVariablesIn(responses[lang].written).concat(matcher.templateVariablesIn(responses[lang].voiceReply || ''));
    const invalid = used.filter((name) => allowedVars.indexOf(name) === -1);
    if (invalid.length) errors.push({ code: 'INVALID_TEMPLATE_VARIABLE', language: lang, variables: invalid, message: 'Response in ' + lang + ' references unknown variable(s): ' + invalid.join(', ') });
  });

  // Journey H2 expressive/context follow-up (section 3/10): the REAL enforcement that a
  // performanceText can never silently diverge from its own canonical dialogue - the Enhance
  // Delivery endpoint already validates its own output before ever showing it to the admin, but an
  // admin can still hand-edit performanceText afterward (spec section 10), so this is the one
  // unbypassable gate. Checked for STANDARD (responses[lang]) and every authored variant alike.
  const variantsByLang = draftDefinition.variants || {};
  Object.keys(responses).forEach((lang) => {
    const responseSet = responses[lang];
    if (!responseSet.performanceText) return;
    const canonical = String(responseSet.voiceReply || responseSet.written || '').trim();
    const result = validatePerformanceText(matcher, { performanceText: responseSet.performanceText, canonicalSpokenText: canonical });
    if (!result.valid) errors.push({ code: 'INVALID_PERFORMANCE_TEXT', language: lang, reason: result.reason, message: 'The expressive performance text for ' + lang + ' (standard) no longer matches its own canonical dialogue (' + result.reason + ').' });
  });
  Object.keys(variantsByLang).forEach((lang) => {
    (variantsByLang[lang] || []).forEach((variant) => {
      if (!variant || !variant.performanceText) return;
      const canonical = String(variant.voiceReply || variant.written || '').trim();
      const result = validatePerformanceText(matcher, { performanceText: variant.performanceText, canonicalSpokenText: canonical });
      if (!result.valid) errors.push({ code: 'INVALID_PERFORMANCE_TEXT', language: lang, variantKey: variant.key, reason: result.reason, message: 'The expressive performance text for ' + lang + '/' + variant.key + ' no longer matches its own canonical dialogue (' + result.reason + ').' });
    });
  });

  // Section 20/34: two variants in the same language that could both match the exact same
  // real-world context at the same specificity is an authoring collision - the runtime selector
  // resolves it deterministically (never randomly), but publishing an ambiguous set at all is
  // refused outright rather than left to depend on authoring order.
  Object.keys(variantsByLang).forEach((lang) => {
    const list = variantsByLang[lang] || [];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (matcher.variantsCollide(list[i], list[j])) {
          errors.push({ code: 'VARIANT_CONTEXT_COLLISION', language: lang, variantKeys: [list[i].key, list[j].key], message: 'Variants "' + list[i].key + '" and "' + list[j].key + '" in ' + lang + ' can both match the same context - narrow one of them before publishing.' });
        }
      }
    }
  });

  // Real-utterance collision/veto checks against the actual matcher, exactly like the Trigger
  // Lab tester - the draft substitutes for this scenario's own published entry in the candidate
  // pool, so this is exactly what production would do the moment this version goes live.
  const candidatePool = otherPublishedScenarios.concat([Object.assign({ scenarioKey: scenario.scenarioKey }, matcher.scenarioFromBundleRow({ scenarioKey: scenario.scenarioKey, domain: scenario.domain, kind: scenario.kind, dataQueryRef: scenario.dataQueryRef, ctaActionId: scenario.ctaActionId, definition: draftDefinition }))]);
  const corpus = draftDefinition.testCorpus || {};
  (corpus.positive || []).forEach((example) => {
    const result = matcher.matchScenarios(example, candidatePool, {});
    if (result.confidenceBand === 'HIGH' && (!result.winner || result.winner.scenario.scenarioKey !== scenario.scenarioKey)) {
      errors.push({ code: 'POSITIVE_EXAMPLE_MISROUTED', example, resolvedTo: result.winner ? result.winner.scenario.scenarioKey : null, message: 'Positive example "' + example + '" resolves HIGH-confidence to a different scenario.' });
    }
  });
  (corpus.negative || []).forEach((example) => {
    const result = matcher.matchScenarios(example, candidatePool, {});
    if (result.confidenceBand === 'HIGH' && result.winner && result.winner.scenario.scenarioKey === scenario.scenarioKey) {
      errors.push({ code: 'NEGATIVE_EXAMPLE_STILL_MATCHES', example, message: 'Negative example "' + example + '" still resolves HIGH-confidence to this scenario.' });
    }
  });

  return { errors, warnings };
}

async function buildCollisionReport(matcher, draftDefinition, scenario, otherPublishedScenarios) {
  const flatDraft = matcher.scenarioFromBundleRow({ scenarioKey: scenario.scenarioKey, domain: scenario.domain, kind: scenario.kind, dataQueryRef: scenario.dataQueryRef, ctaActionId: scenario.ctaActionId, definition: draftDefinition });
  const candidatePool = otherPublishedScenarios.concat([flatDraft]);
  const languages = draftDefinition.languages || {};
  const probes = [];
  Object.keys(languages).forEach((lang) => { (languages[lang].strong || []).forEach((phrase) => probes.push(phrase)); });
  (draftDefinition.testCorpus && draftDefinition.testCorpus.positive || []).forEach((phrase) => probes.push(phrase));
  const collisions = [];
  probes.forEach((text) => {
    const result = matcher.matchScenarios(text, candidatePool, {});
    const mine = result.candidates.find((c) => c.scenario.scenarioKey === scenario.scenarioKey);
    const runnerUp = result.candidates.find((c) => c.scenario.scenarioKey !== scenario.scenarioKey);
    if (!mine || !runnerUp) return;
    const margin = mine.score - runnerUp.score;
    if (runnerUp.score > mine.score || margin < matcher.HIGH_MARGIN_THRESHOLD * 2) {
      collisions.push({ text, myScore: mine.score, otherScenarioKey: runnerUp.scenario.scenarioKey, otherScore: runnerUp.score, margin, severity: runnerUp.score >= mine.score ? 'severe' : 'close' });
    }
  });
  return collisions;
}

// Journey H2, Gate 3: safe admin-facing shape for a conversation_audio_assets row - never the
// provider credential id, never anything beyond what the admin UI's status/playback display
// needs. `contentHash` itself is never returned whole (a short diagnostic prefix only, spec
// section 51) - it is a content-identity value, not a secret, but there is no reason to hand out
// the full hash either.
function mapAudioAssetForAdmin(asset) {
  return {
    id: asset.id, scenarioVersionId: asset.scenarioVersionId, language: asset.language, variantKey: asset.variantKey,
    provider: asset.provider, voiceProfileKey: asset.voiceProfileKey, voiceId: asset.voiceId, modelId: asset.modelId,
    fileUrl: asset.fileUrl, mimeType: asset.mimeType, durationMs: asset.durationMs, status: asset.status,
    contentHashShort: String(asset.contentHash || '').slice(0, 10),
    createdAt: asset.createdAt, approvedAt: asset.approvedAt
  };
}

// Spec section 20: staleness is never stored - always recomputed against the version's CURRENT
// definition. Always false for an already-published version (Gate 2 made version definitions
// immutable), so this only ever matters while a version is still a mutable draft.
function isStaleFor(matcher, asset, definition) {
  const resolved = effectiveVoiceTextFor(matcher, definition, asset.language, asset.variantKey, asset.modelId);
  const expectedHash = computeAudioContentHash({ text: resolved.text, language: asset.language, provider: asset.provider, voiceId: asset.voiceId, modelId: asset.modelId });
  return !resolved.text || expectedHash !== asset.contentHash;
}

export function router(repo, uploadsDir) {
  const app = express.Router();

  app.get('/', asyncHandler(async (req, res) => {
    const scenarios = await repo.conversationScenarios.list({ status: req.query.status, domain: req.query.domain });
    res.json({ scenarios: scenarios.map(summarizeScenario) });
  }));

  app.get('/:id', asyncHandler(async (req, res) => {
    const scenario = await repo.conversationScenarios.get(req.params.id);
    if (!scenario) throw new ApiError(404, 'SCENARIO_NOT_FOUND');
    const versions = await repo.conversationScenarios.listVersions(req.params.id);
    res.json(Object.assign({}, scenario, { versions }));
  }));

  app.post('/', asyncHandler(async (req, res) => {
    const body = req.body || {};
    if (!String(body.scenarioKey || '').trim()) throw new ApiError(400, 'VALIDATION_FAILED');
    if (['faq', 'data_query', 'surface_help'].indexOf(body.kind) === -1) throw new ApiError(400, 'INVALID_KIND');
    if (body.ctaActionId && SAFE_CTA_ACTION_IDS.indexOf(body.ctaActionId) === -1) throw new ApiError(400, 'UNSAFE_CTA_ACTION_ID');
    const scenario = await repo.conversationScenarios.create({
      scenarioKey: String(body.scenarioKey).trim(), domain: body.domain || null, kind: body.kind,
      dataQueryRef: body.dataQueryRef || null, ctaActionId: body.ctaActionId || null,
      allowedProcesses: body.allowedProcesses || null, allowedSteps: body.allowedSteps || null,
      definition: body.definition || { languages: {}, responses: {} }, createdBy: req.currentUser.id
    });
    await audit(req, repo, 'conversationScenario.create', 'conversationScenario', scenario.id, { scenarioKey: scenario.scenarioKey, kind: scenario.kind });
    res.status(201).json(scenario);
  }));

  // Scenario-level metadata only (domain/ctaActionId/allowedProcesses/allowedSteps) - never
  // scenarioKey/kind, which are immutable after create() (spec section 11).
  app.patch('/:id', asyncHandler(async (req, res) => {
    const body = req.body || {};
    if (Object.prototype.hasOwnProperty.call(body, 'ctaActionId') && body.ctaActionId && SAFE_CTA_ACTION_IDS.indexOf(body.ctaActionId) === -1) throw new ApiError(400, 'UNSAFE_CTA_ACTION_ID');
    const scenario = await repo.conversationScenarios.updateMetadata(req.params.id, body);
    await audit(req, repo, 'conversationScenario.updateMetadata', 'conversationScenario', req.params.id, { ctaActionId: scenario.ctaActionId });
    res.json(scenario);
  }));

  app.patch('/:id/draft', asyncHandler(async (req, res) => {
    const scenario = await repo.conversationScenarios.updateDraft(req.params.id, req.body || {});
    await audit(req, repo, 'conversationScenario.updateDraft', 'conversationScenario', req.params.id, { versionId: scenario.draftVersionId });
    res.json(scenario);
  }));

  app.post('/:id/revision', asyncHandler(async (req, res) => {
    const scenario = await repo.conversationScenarios.startNewRevision(req.params.id, req.currentUser.id);
    await audit(req, repo, 'conversationScenario.startRevision', 'conversationScenario', req.params.id, { versionId: scenario.draftVersionId, versionNumber: scenario.draftVersion.versionNumber });
    res.status(201).json(scenario);
  }));

  app.post('/:id/publish', asyncHandler(async (req, res) => {
    const scenario = await repo.conversationScenarios.get(req.params.id);
    if (!scenario) throw new ApiError(404, 'SCENARIO_NOT_FOUND');
    if (!scenario.draftVersion) throw new ApiError(400, 'NO_DRAFT_TO_EDIT');
    const versionId = (req.body || {}).versionId || scenario.draftVersionId;
    const matcher = await getConversationMatcher();
    const allScenarios = await repo.conversationScenarios.list({ status: 'published' });
    const otherPublished = allScenarios.filter((s) => s.id !== scenario.id && s.publishedVersion)
      .map((s) => matcher.scenarioFromBundleRow({ scenarioKey: s.scenarioKey, domain: s.domain, kind: s.kind, dataQueryRef: s.dataQueryRef, ctaActionId: s.ctaActionId, definition: s.publishedVersion.definition }));
    const { errors, warnings } = await validateForPublish(matcher, scenario.draftVersion.definition, scenario, otherPublished);
    if (errors.length) throw new ApiError(422, 'PUBLISH_VALIDATION_FAILED', 'Publish blocked by validation errors.', { errors, warnings });
    const published = await repo.conversationScenarios.publish(req.params.id, versionId, req.currentUser.id);
    await audit(req, repo, 'conversationScenario.publish', 'conversationScenario', req.params.id, { versionId, versionNumber: published.publishedVersion.versionNumber, warnings: warnings.map((w) => w.code) });
    res.json(published);
  }));

  app.post('/:id/rollback', asyncHandler(async (req, res) => {
    const targetVersionId = (req.body || {}).targetVersionId;
    if (!targetVersionId) throw new ApiError(400, 'VALIDATION_FAILED');
    const scenario = await repo.conversationScenarios.rollback(req.params.id, targetVersionId, req.currentUser.id);
    await audit(req, repo, 'conversationScenario.rollback', 'conversationScenario', req.params.id, { targetVersionId, newVersionNumber: scenario.publishedVersion.versionNumber });
    res.json(scenario);
  }));

  app.post('/:id/archive', asyncHandler(async (req, res) => {
    const scenario = await repo.conversationScenarios.archive(req.params.id);
    await audit(req, repo, 'conversationScenario.archive', 'conversationScenario', req.params.id, {});
    res.json(scenario);
  }));

  app.post('/:id/unarchive', asyncHandler(async (req, res) => {
    const scenario = await repo.conversationScenarios.unarchive(req.params.id);
    await audit(req, repo, 'conversationScenario.unarchive', 'conversationScenario', req.params.id, {});
    res.json(scenario);
  }));

  // Trigger Lab tester (spec section 26) - runs one utterance through the exact same shared
  // matcher used in production, against every OTHER published scenario plus this scenario's own
  // DRAFT (never its stale published content) - so the admin sees real, current collision
  // behavior before ever publishing. Zero LLM calls, zero writes.
  app.post('/:id/test', asyncHandler(async (req, res) => {
    const scenario = await repo.conversationScenarios.get(req.params.id);
    if (!scenario) throw new ApiError(404, 'SCENARIO_NOT_FOUND');
    const versionUnderTest = scenario.draftVersion || scenario.publishedVersion;
    if (!versionUnderTest) throw new ApiError(400, 'NO_VERSION_TO_TEST');
    const body = req.body || {};
    const matcher = await getConversationMatcher();
    const allPublished = await repo.conversationScenarios.list({ status: 'published' });
    const pool = allPublished.filter((s) => s.id !== scenario.id && s.publishedVersion)
      .map((s) => matcher.scenarioFromBundleRow({ scenarioKey: s.scenarioKey, domain: s.domain, kind: s.kind, dataQueryRef: s.dataQueryRef, ctaActionId: s.ctaActionId, definition: s.publishedVersion.definition }))
      .concat([matcher.scenarioFromBundleRow({ scenarioKey: scenario.scenarioKey, domain: scenario.domain, kind: scenario.kind, dataQueryRef: scenario.dataQueryRef, ctaActionId: scenario.ctaActionId, definition: versionUnderTest.definition })]);
    const result = matcher.matchScenarios(String(body.text || ''), pool, body.surfaceContext || {});
    res.json({
      normalizedText: result.normalizedText, confidenceBand: result.confidenceBand, scoreMargin: result.scoreMargin,
      winnerScenarioKey: result.winner ? result.winner.scenario.scenarioKey : null,
      candidates: result.candidates.map((c) => ({ scenarioKey: c.scenario.scenarioKey, score: c.score, reasons: c.reasons })),
      resolution: result.winner && result.winner.scenario.scenarioKey === scenario.scenarioKey && result.confidenceBand === 'HIGH' ? 'LOCAL' : 'FALLBACK'
    });
  }));

  app.post('/:id/test-batch', asyncHandler(async (req, res) => {
    const scenario = await repo.conversationScenarios.get(req.params.id);
    if (!scenario) throw new ApiError(404, 'SCENARIO_NOT_FOUND');
    const versionUnderTest = scenario.draftVersion || scenario.publishedVersion;
    if (!versionUnderTest) throw new ApiError(400, 'NO_VERSION_TO_TEST');
    const matcher = await getConversationMatcher();
    const allPublished = await repo.conversationScenarios.list({ status: 'published' });
    const pool = allPublished.filter((s) => s.id !== scenario.id && s.publishedVersion)
      .map((s) => matcher.scenarioFromBundleRow({ scenarioKey: s.scenarioKey, domain: s.domain, kind: s.kind, dataQueryRef: s.dataQueryRef, ctaActionId: s.ctaActionId, definition: s.publishedVersion.definition }))
      .concat([matcher.scenarioFromBundleRow({ scenarioKey: scenario.scenarioKey, domain: scenario.domain, kind: scenario.kind, dataQueryRef: scenario.dataQueryRef, ctaActionId: scenario.ctaActionId, definition: versionUnderTest.definition })]);
    const corpus = versionUnderTest.definition.testCorpus || {};
    function run(examples, expectMatch) {
      return (examples || []).map((text) => {
        const result = matcher.matchScenarios(text, pool, {});
        const resolvedHere = result.confidenceBand === 'HIGH' && result.winner && result.winner.scenario.scenarioKey === scenario.scenarioKey;
        return { text, pass: expectMatch ? resolvedHere : !resolvedHere, resolvedTo: result.winner ? result.winner.scenario.scenarioKey : null, confidenceBand: result.confidenceBand };
      });
    }
    const positive = run(corpus.positive, true);
    const negative = run(corpus.negative, false);
    res.json({
      positive, negative,
      positivePassRate: positive.length ? positive.filter((r) => r.pass).length / positive.length : null,
      negativeRejectionRate: negative.length ? negative.filter((r) => r.pass).length / negative.length : null
    });
  }));

  app.get('/:id/collisions', asyncHandler(async (req, res) => {
    const scenario = await repo.conversationScenarios.get(req.params.id);
    if (!scenario) throw new ApiError(404, 'SCENARIO_NOT_FOUND');
    const versionUnderTest = scenario.draftVersion || scenario.publishedVersion;
    if (!versionUnderTest) throw new ApiError(400, 'NO_VERSION_TO_TEST');
    const matcher = await getConversationMatcher();
    const allPublished = await repo.conversationScenarios.list({ status: 'published' });
    const otherPublished = allPublished.filter((s) => s.id !== scenario.id && s.publishedVersion)
      .map((s) => matcher.scenarioFromBundleRow({ scenarioKey: s.scenarioKey, domain: s.domain, kind: s.kind, dataQueryRef: s.dataQueryRef, ctaActionId: s.ctaActionId, definition: s.publishedVersion.definition }));
    const collisions = await buildCollisionReport(matcher, versionUnderTest.definition, scenario, otherPublished);
    res.json({ collisions });
  }));

  // --- Journey H2, Gate 3: Voice asset pipeline --------------------------------------------------

  // List every generated candidate for an exact scenario version, each with a freshly-computed
  // isStale flag (spec section 16/51/52) - never a stored value.
  app.get('/:id/versions/:versionId/audio', asyncHandler(async (req, res) => {
    const scenario = await repo.conversationScenarios.get(req.params.id);
    if (!scenario) throw new ApiError(404, 'SCENARIO_NOT_FOUND');
    const version = await repo.conversationScenarios.getVersion(req.params.versionId);
    if (!version || version.scenarioId !== scenario.id) throw new ApiError(404, 'VERSION_NOT_FOUND');
    const assets = await repo.conversationAudioAssets.listForVersion(req.params.versionId);
    const matcher = await getConversationMatcher();
    res.json({ assets: assets.map((asset) => Object.assign(mapAudioAssetForAdmin(asset), { isStale: isStaleFor(matcher, asset, version.definition) })) });
  }));

  // Generate a preview candidate (spec section 17). Never trusts browser-supplied text - always
  // derives the authoritative spoken text from the STORED version content, so a preview can never
  // drift from what would actually be approved/published for it. Reuses the exact same
  // repo.voiceProviderCredentials/elevenlabs.synthesize() call the existing admin /test-sample
  // route already makes - no second ElevenLabs client.
  //
  // Release-prep hardening (H2 staging gate, item 27): eligibility is NOT merely "kind !==
  // 'data_query'" - that was the original Gate 3 check, and it is still applied first below as a
  // cheap, explicit rejection, but it is not the actual security boundary. The REAL structural
  // rule (spec: "static audio eligible only if approved static spoken text with no runtime
  // template values, no user/private value resolver, no personal user data") is enforced
  // independently of `kind`, right below, via the exact same `templateVariablesIn()` the publish
  // quality gate already uses (validateForPublish() above): the STORED spoken text for this exact
  // language is scanned for ANY `{variable}` placeholder, and generation is refused if one is
  // found, regardless of what kind the scenario claims to be. This matters because the only code
  // path through which live per-user or Mental-Health-private data could ever enter a Studio
  // response is a `{variable}` resolved against DATA_QUERY_RESOLVERS (or an equivalent future
  // resolver) - a response with zero such placeholders is, by construction, 100% static
  // admin-authored text, so checking for their absence is the actual eligibility test, not a
  // proxy for it. This also catches a scenario whose `kind` is wrong/stale, or a still-mutable
  // draft that hasn't passed publish validation yet (publish-time validation already blocks a
  // `{variable}` in a non-data_query response - see validateForPublish() - but that only runs at
  // `/publish`; this route can be called against a draft version before that gate ever ran).
  app.post('/:id/versions/:versionId/audio', asyncHandler(async (req, res) => {
    const scenario = await repo.conversationScenarios.get(req.params.id);
    if (!scenario) throw new ApiError(404, 'SCENARIO_NOT_FOUND');
    if (scenario.kind === 'data_query') throw new ApiError(400, 'AUDIO_NOT_ELIGIBLE_FOR_DATA_QUERY');
    const version = await repo.conversationScenarios.getVersion(req.params.versionId);
    if (!version || version.scenarioId !== scenario.id) throw new ApiError(404, 'VERSION_NOT_FOUND');
    const body = req.body || {};
    if (SUPPORTED_LANGUAGES.indexOf(body.language) === -1) throw new ApiError(400, 'UNSUPPORTED_LANGUAGE');
    if (!String(body.voiceId || '').trim()) throw new ApiError(400, 'VOICE_ID_REQUIRED');
    const credential = await repo.voiceProviderCredentials.get(body.credentialId, { includeDecrypted: true });
    if (!credential) throw new ApiError(400, 'CREDENTIAL_NOT_FOUND');
    const variantKey = body.variantKey || 'standard';
    // Journey H2 expressive/context follow-up: resolves the STANDARD response or the exact
    // authored variant this asset is for (never trusts browser-supplied dialogue text either way).
    const responseSet = responseSetFor(version.definition, body.language, variantKey);
    const spokenReply = String(responseSet.voiceReply || '').trim();
    const written = String(responseSet.written || '').trim();
    const canonicalSpokenText = spokenReply || written;
    const usedFallbackText = !spokenReply && !!written;
    if (!canonicalSpokenText) throw new ApiError(400, 'NO_SPOKEN_TEXT');
    const matcher = await getConversationMatcher();
    if (matcher.templateVariablesIn(canonicalSpokenText).length) throw new ApiError(400, 'AUDIO_NOT_ELIGIBLE_TEMPLATE_VARIABLES');
    // Section 11: the audio identity hash covers whatever text is ACTUALLY sent to ElevenLabs -
    // performanceText (when present, valid, and the model supports it) or the plain canonical
    // text otherwise (Section 27's fallback rule - a missing/invalid/unsupported performanceText
    // never blocks generation, it only changes which text gets hashed/synthesized).
    const picked = effectiveVoiceText(matcher, { performanceText: responseSet.performanceText, canonicalSpokenText, modelId: body.modelId });
    const contentHash = computeAudioContentHash({ text: picked.text, language: body.language, provider: 'elevenlabs', voiceId: body.voiceId, modelId: body.modelId });

    const startedAt = Date.now();
    let synthesized;
    try {
      synthesized = await synthesize(credential.apiKey, body.voiceId, {
        text: picked.text, modelId: body.modelId, languageCode: body.language, voiceSettings: body.voiceSettings, outputFormat: 'mp3_44100_128'
      });
    } catch (error) {
      await repo.voiceTtsUsage.record({
        languageCode: body.language, provider: 'elevenlabs', credentialId: credential.id, source: 'studio_audio_generation',
        characters: picked.text.length, characterCost: null, success: false,
        errorCode: error instanceof ElevenLabsError ? error.code : 'UNKNOWN_ERROR', latencyMs: Date.now() - startedAt
      });
      if (error instanceof ElevenLabsError) throw new ApiError(502, error.code);
      throw error;
    }
    // Recorded separately from live runtime usage (source:'studio_audio_generation' vs.
    // 'live_voice_mode') via the exact same voice_tts_usage_events table - no schema change
    // needed, and the economics (one admin generation vs. N avoided runtime generations) stay
    // visible in the existing Admin Voice usage view (spec section 59).
    await repo.voiceTtsUsage.record({
      languageCode: body.language, provider: 'elevenlabs', credentialId: credential.id, source: 'studio_audio_generation',
      characters: synthesized.estimatedCharacters, characterCost: synthesized.characterCost, success: true, latencyMs: Date.now() - startedAt
    });
    const saved = await saveAudio(synthesized.buffer, { uploadsDir, category: 'conversation-audio', declaredMimeType: synthesized.contentType });
    const asset = await repo.conversationAudioAssets.create({
      scenarioId: scenario.id, scenarioVersionId: version.id, language: body.language, variantKey,
      contentHash, provider: 'elevenlabs', voiceProfileKey: String(body.voiceProfileKey || '').trim() || 'default',
      voiceId: body.voiceId, modelId: body.modelId || null, fileUrl: saved.url, mimeType: saved.mimeType,
      createdBy: req.currentUser.id
    });
    await audit(req, repo, 'conversationAudio.generate', 'conversationAudioAsset', asset.id, {
      scenarioKey: scenario.scenarioKey, versionId: version.id, language: body.language, variantKey,
      usedFallbackText, usedPerformanceText: picked.usedPerformanceText
    });
    // Never runtime-active yet (spec section 18) - status is 'preview' until an explicit approve.
    res.status(201).json(Object.assign(mapAudioAssetForAdmin(asset), { usedFallbackText, usedPerformanceText: picked.usedPerformanceText }));
  }));

  // --- Journey H2 expressive-dialogue follow-up: Enhance Delivery ---------------------------------
  // Admin-authoring-time-only AI assist (spec section 6/7/8) - generates a candidate expressive
  // performance script from the STORED canonical dialogue (never trusts browser text - the exact
  // same rule audio generation already follows), validates it before ever calling it "good," and
  // NEVER auto-saves - the admin reviews/edits the result, then the existing Save Draft persists it
  // exactly like every other Studio field. Zero runtime model call: this only ever runs from the
  // admin editor, never from route()/sendChat().
  app.post('/:id/versions/:versionId/enhance-delivery', enhanceDeliveryLimiter, asyncHandler(async (req, res) => {
    const scenario = await repo.conversationScenarios.get(req.params.id);
    if (!scenario) throw new ApiError(404, 'SCENARIO_NOT_FOUND');
    const version = await repo.conversationScenarios.getVersion(req.params.versionId);
    if (!version || version.scenarioId !== scenario.id) throw new ApiError(404, 'VERSION_NOT_FOUND');
    const body = req.body || {};
    if (SUPPORTED_LANGUAGES.indexOf(body.language) === -1) throw new ApiError(400, 'UNSUPPORTED_LANGUAGE');
    const variantKey = body.variantKey || 'standard';
    const responseSet = responseSetFor(version.definition, body.language, variantKey);
    const canonicalSpokenText = String(responseSet.voiceReply || responseSet.written || '').trim();
    if (!canonicalSpokenText) throw new ApiError(400, 'NO_SPOKEN_TEXT');
    // community-api has no OPENAI_API_KEY env fallback at all (that only exists on pattern-ai's
    // own env) - an unconfigured admin key fails loudly here, never silently falling back to a
    // different provider or a key this process was never given.
    const adminKey = await repo.adminKeys.get('openai');
    if (!adminKey || !adminKey.apiKey) throw new ApiError(400, 'OPENAI_KEY_NOT_CONFIGURED');
    const generated = await generatePerformanceText(adminKey.apiKey, {
      canonicalSpokenText, language: body.language, scenarioTitle: scenario.scenarioKey, domain: scenario.domain,
      contextLabel: variantKey === 'standard' ? 'standard' : variantKey, deliveryNote: body.deliveryNote || null
    });
    const matcher = await getConversationMatcher();
    const validation = validatePerformanceText(matcher, { performanceText: generated.performanceText, canonicalSpokenText });
    await audit(req, repo, 'conversationAudio.enhanceDelivery', 'conversationScenario', scenario.id, {
      versionId: version.id, language: body.language, variantKey, valid: validation.valid, reason: validation.reason
    });
    // Always returns the raw suggestion plus its validity - an invalid suggestion is never
    // silently presented as good (spec section 3's own "reject the generated performanceText").
    res.json({ performanceText: generated.performanceText, valid: validation.valid, reason: validation.reason, supportedTags: SUPPORTED_AUDIO_TAGS });
  }));

  // Human approval (spec section 18/44) - re-verifies the hash against the version's CURRENT
  // definition before ever approving, so a candidate that went stale between generation and
  // approval (an admin kept editing the draft in another tab) can never become runtime-active.
  // Archives whatever was previously approved for the same (version, language, variant) slot in
  // the same transaction (repo.conversationAudioAssets.approve()).
  app.post('/:id/audio/:assetId/approve', asyncHandler(async (req, res) => {
    const scenario = await repo.conversationScenarios.get(req.params.id);
    if (!scenario) throw new ApiError(404, 'SCENARIO_NOT_FOUND');
    const asset = await repo.conversationAudioAssets.get(req.params.assetId);
    if (!asset || asset.scenarioId !== scenario.id) throw new ApiError(404, 'AUDIO_ASSET_NOT_FOUND');
    const version = await repo.conversationScenarios.getVersion(asset.scenarioVersionId);
    if (!version) throw new ApiError(404, 'VERSION_NOT_FOUND');
    const matcher = await getConversationMatcher();
    if (isStaleFor(matcher, asset, version.definition)) throw new ApiError(409, 'AUDIO_STALE');
    const approved = await repo.conversationAudioAssets.approve(asset.id, req.currentUser.id);
    await audit(req, repo, 'conversationAudio.approve', 'conversationAudioAsset', asset.id, {
      scenarioKey: scenario.scenarioKey, versionId: asset.scenarioVersionId, language: asset.language
    });
    res.json(mapAudioAssetForAdmin(approved));
  }));

  // Manual removal from runtime eligibility without deleting the row/file (spec section 46) - a
  // full retention/cleanup policy is documented, not automated, this gate.
  app.post('/:id/audio/:assetId/archive', asyncHandler(async (req, res) => {
    const scenario = await repo.conversationScenarios.get(req.params.id);
    if (!scenario) throw new ApiError(404, 'SCENARIO_NOT_FOUND');
    const asset = await repo.conversationAudioAssets.get(req.params.assetId);
    if (!asset || asset.scenarioId !== scenario.id) throw new ApiError(404, 'AUDIO_ASSET_NOT_FOUND');
    const archived = await repo.conversationAudioAssets.archive(asset.id);
    await audit(req, repo, 'conversationAudio.archive', 'conversationAudioAsset', asset.id, { scenarioKey: scenario.scenarioKey });
    res.json(mapAudioAssetForAdmin(archived));
  }));

  return app;
}
