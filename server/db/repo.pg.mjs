import { newId } from './id.mjs';
import { ApiError } from '../community/errors.mjs';
import { encryptSecret, decryptSecret } from '../community/security/crypto-util.mjs';
import { encryptionKeyHex } from '../community/security/secrets.mjs';
import { normalizeInstrumentCode, normalizeInstrumentCodes } from './instrument-normalize.mjs';
import { WALLET_DEFAULTS, DEFAULT_STORAGE_PRODUCTS } from '../commercial/commercial-defaults.mjs';
import { computeAudioContentHash } from '../community/conversation-audio-identity.mjs';
import { effectiveVoiceTextFor } from '../community/performance-text.mjs';
import { getConversationMatcher } from '../community/conversation-matcher-bridge.mjs';

// Commercial System Slice 1 (026_commercial_config.sql) - reads the admin-set signup promo
// amount directly rather than going through commercial-config.mjs's getWalletRules(), since that
// module takes a `repo` object as its argument and this helper runs INSIDE repo.pg.mjs itself,
// before the repo object it would need exists. Falls back to the code default on any error
// (including "table not migrated yet" during a rolling deploy) so registration can never fail
// because of this best-effort read.
async function resolveSignupPromoRetailUsd(pool) {
  try {
    const { rows } = await pool.query(`SELECT value FROM commercial_config_overrides WHERE config_key='wallet:signupPromoRetailUsd'`);
    const amount = rows[0] && rows[0].value && Number(rows[0].value.amount);
    return Number.isFinite(amount) && amount >= 0 ? amount : WALLET_DEFAULTS.signupPromoRetailUsd;
  } catch (_) {
    return WALLET_DEFAULTS.signupPromoRetailUsd;
  }
}

// Grants the one-time signup promo credit (spec section 22/23) - called from every
// users.create() path (password register / Google / generic OIDC all funnel through this one
// function), so there is exactly one place that could ever grant it, and it only ever runs at
// creation time - never a backfill for pre-existing accounts (spec section 73's explicit
// caution). idempotency_key ('signup-promo:{userId}') makes an accidental second call for the
// same user a safe no-op via wallet_ledger's UNIQUE constraint, never a double grant.
async function grantSignupPromoCredit(pool, userId) {
  const amountUsd = await resolveSignupPromoRetailUsd(pool);
  const amountMicroUsd = Math.round(amountUsd * 1000000);
  if (amountMicroUsd <= 0) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('INSERT INTO wallet_accounts (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [userId]);
    await client.query(
      'UPDATE wallet_accounts SET promo_balance_micro_usd = promo_balance_micro_usd + $2, updated_at=now() WHERE user_id=$1',
      [userId, amountMicroUsd]
    );
    await client.query(
      `INSERT INTO wallet_ledger (id, user_id, type, promo_delta_micro_usd, source_action, idempotency_key, metadata)
       VALUES ($1,$2,'PROMO_CREDIT',$3,'signup',$4,$5)`,
      [newId('walletLedger'), userId, amountMicroUsd, 'signup-promo:' + userId, JSON.stringify({ amountUsd })]
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    if (!(error && error.code === '23505')) throw error; // already granted for this user - safe no-op
  } finally {
    client.release();
  }
}

// Instrument Catalog domain (025_instrument_catalog.sql). Shared by tradingSessions/trades/
// patterns/sessionSignatures below - every one of them stores the plain normalized code string
// directly (never the catalog row's own id, see that migration's comment), so membership is a
// query against this one table rather than a DB foreign key. `queryable` is either a checked-out
// transaction `client` (tradingSessions/trades/patterns already run inside one) or the bare
// `pool` (sessionSignatures never opens its own transaction) - both expose the same `.query()`.
async function assertInstrumentInCatalog(queryable, userId, codes) {
  const wanted = normalizeInstrumentCodes(Array.isArray(codes) ? codes : [codes]);
  if (!wanted.length) return;
  const { rows } = await queryable.query('SELECT code FROM instrument_catalog WHERE user_id=$1 AND code = ANY($2)', [userId, wanted]);
  const known = new Set(rows.map((row) => row.code));
  if (wanted.some((code) => !known.has(code))) throw new ApiError(400, 'INSTRUMENT_NOT_IN_CATALOG');
}

function mapUser(row) {
  return {
    id: row.id, displayName: row.display_name, avatarUrl: row.avatar_url, bio: row.bio, role: row.role, suspendedAt: row.suspended_at,
    email: row.email, emailVerified: row.email_verified, emailVerifiedAt: row.email_verified_at, phone: row.phone, phoneVerified: row.phone_verified,
    profileRole: row.profile_role, kycStatus: row.kyc_status, xpTotal: row.xp_total, avatarDataUrl: row.avatar_data_url,
    totpEnabledAt: row.totp_enabled_at, plan: row.plan, createdAt: row.created_at
  };
}
function mapPost(row) { return { id: row.id, userId: row.user_id, content: row.content, images: row.images, createdAt: row.created_at, updatedAt: row.updated_at }; }
function mapComment(row) { return { id: row.id, postId: row.post_id, userId: row.user_id, content: row.content, createdAt: row.created_at }; }
function mapPostLike(row) { return { id: row.id, postId: row.post_id, userId: row.user_id, createdAt: row.created_at }; }
function mapListing(row) {
  return {
    id: row.id, sellerId: row.seller_id, type: row.type, sourceId: row.source_id, title: row.title,
    description: row.description, priceAmount: Number(row.price_amount), priceCurrency: row.price_currency,
    successRatePercent: row.success_rate_percent == null ? null : Number(row.success_rate_percent),
    sampleSize: row.sample_size, evidenceAsOf: row.evidence_as_of, previewContent: row.preview_content,
    fullContent: row.full_content, screenshots: row.screenshots, status: row.status, featured: row.featured,
    createdAt: row.created_at, updatedAt: row.updated_at
  };
}
function mapConversationScenario(row) {
  return {
    id: row.id, scenarioKey: row.scenario_key, domain: row.domain, kind: row.kind,
    dataQueryRef: row.data_query_ref, ctaActionId: row.cta_action_id,
    allowedProcesses: row.allowed_processes, allowedSteps: row.allowed_steps,
    publishedVersionId: row.published_version_id, draftVersionId: row.draft_version_id,
    archivedAt: row.archived_at, createdAt: row.created_at, updatedAt: row.updated_at
  };
}
function mapConversationScenarioVersion(row) {
  return {
    id: row.id, scenarioId: row.scenario_id, versionNumber: row.version_number, status: row.status,
    definition: row.definition, publishedAt: row.published_at, createdBy: row.created_by, publishedBy: row.published_by,
    createdAt: row.created_at, updatedAt: row.updated_at
  };
}
function mapConversationAudioAsset(row) {
  return {
    id: row.id, scenarioId: row.scenario_id, scenarioVersionId: row.scenario_version_id,
    language: row.language, variantKey: row.variant_key, contentHash: row.content_hash,
    provider: row.provider, voiceProfileKey: row.voice_profile_key, voiceId: row.voice_id, modelId: row.model_id,
    fileUrl: row.file_url, mimeType: row.mime_type, durationMs: row.duration_ms, status: row.status,
    createdBy: row.created_by, approvedBy: row.approved_by, approvedAt: row.approved_at,
    createdAt: row.created_at, updatedAt: row.updated_at
  };
}
function mapScenarioExposure(row) {
  return { userId: row.user_id, scenarioKey: row.scenario_key, count: row.count, lastPresentedAt: row.last_presented_at, lastVariantKey: row.last_variant_key };
}
function mapPurchase(row) { return { id: row.id, listingId: row.listing_id, buyerId: row.buyer_id, purchasedAt: row.purchased_at, priceAtPurchase: Number(row.price_at_purchase), mock: row.mock }; }
function mapRating(row) { return { id: row.id, listingId: row.listing_id, buyerId: row.buyer_id, rating: row.rating, reviewText: row.review_text, createdAt: row.created_at }; }
function mapThread(row) { return { id: row.id, listingId: row.listing_id, buyerId: row.buyer_id, sellerId: row.seller_id, createdAt: row.created_at }; }
function mapMessage(row) { return { id: row.id, threadId: row.thread_id, senderId: row.sender_id, content: row.content, createdAt: row.created_at, readAt: row.read_at }; }
function mapReport(row) { return { id: row.id, targetType: row.target_type, targetId: row.target_id, reporterId: row.reporter_id, reason: row.reason, status: row.status, createdAt: row.created_at }; }
// Launch-readiness audit fix (P1-1, 052_client_errors.sql).
function mapClientError(row) {
  return {
    id: row.id, fingerprint: row.fingerprint, releaseVersion: row.release_version, source: row.source,
    message: row.message, route: row.route, firstSeenAt: row.first_seen_at, lastSeenAt: row.last_seen_at,
    occurrenceCount: row.occurrence_count, samplePayload: row.sample_payload, status: row.status
  };
}
function mapSession(row) { return { id: row.id, userId: row.user_id, startedAt: row.started_at, lastHeartbeatAt: row.last_heartbeat_at, endedAt: row.ended_at }; }
function mapUsageEvent(row) {
  return {
    id: row.id, userId: row.user_id, provider: row.provider, promptTokens: row.prompt_tokens, completionTokens: row.completion_tokens,
    totalTokens: row.total_tokens, source: row.source, model: row.model, feature: row.feature,
    providerCostMicroUsd: row.provider_cost_micro_usd == null ? null : Number(row.provider_cost_micro_usd),
    retailChargeMicroUsd: row.retail_charge_micro_usd == null ? null : Number(row.retail_charge_micro_usd),
    tokenDiscountPercent: row.token_discount_percent == null ? null : Number(row.token_discount_percent),
    origin: row.origin, linkedLedgerIdempotencyKey: row.linked_ledger_idempotency_key,
    // AI Cost Control (043_ai_cost_control.sql) - additive/nullable, see that migration's comment.
    cachedInputTokens: row.cached_input_tokens, cacheWriteInputTokens: row.cache_write_input_tokens,
    reasoningTokens: row.reasoning_tokens, usageRaw: row.usage_raw || null,
    createdAt: row.created_at
  };
}
function mapHealthEvent(row) { return { id: row.id, provider: row.provider, ok: row.ok, errorCode: row.error_code, latencyMs: row.latency_ms, source: row.source, createdAt: row.created_at }; }
function mapProviderPricing(row) { return { provider: row.provider, promptPricePer1k: row.prompt_price_per_1k == null ? null : Number(row.prompt_price_per_1k), completionPricePer1k: row.completion_price_per_1k == null ? null : Number(row.completion_price_per_1k), monthlyTokenBudget: row.monthly_token_budget, updatedAt: row.updated_at }; }
function mapAdminKey(row) { return { provider: row.provider, apiKey: row.api_key, updatedBy: row.updated_by, updatedAt: row.updated_at }; }
function mapAuditLog(row) { return { id: row.id, adminUserId: row.admin_user_id, action: row.action, targetType: row.target_type, targetId: row.target_id, details: row.details, createdAt: row.created_at }; }
// `includeDecrypted` is ONLY ever passed true by the one internal-service bridge route that
// hands a runtime config to the DB-free pattern-ai gateway (server/community/routes.internal.mjs)
// - every admin-facing/browser-facing caller must leave it false (the default) so a raw key can
// never reach an HTTP response by omission. Fails closed: decryptSecret() itself throws (not
// returns null/plaintext-garbage) on a wrong/missing ENCRYPTION_KEY or a malformed envelope - see
// crypto-util.mjs.
function mapVoiceCredential(row, { includeDecrypted } = {}) {
  const base = {
    id: row.id, provider: row.provider, label: row.label, keyHint: row.key_hint, enabled: row.enabled,
    validationStatus: row.validation_status, validationError: row.validation_error, validatedAt: row.validated_at,
    updatedBy: row.updated_by, createdAt: row.created_at, updatedAt: row.updated_at
  };
  if (includeDecrypted) base.apiKey = decryptSecret(row.api_key_encrypted, encryptionKeyHex());
  return base;
}
// Masked status only - the shape every admin-facing GET uses. Never includes a decrypted value;
// see mapBscSecretsRaw() below for the internal-only counterpart.
function mapBscSecretsStatus(row) {
  if (!row) return { rpcConfigured: false, webhookConfigured: false, webhookSecretHint: null, lastTestedAt: null, lastTestOk: null, lastDetectedChainId: null };
  return {
    rpcConfigured: Boolean(row.rpc_url_encrypted),
    webhookConfigured: Boolean(row.webhook_secret_encrypted),
    webhookSecretHint: row.webhook_secret_hint,
    lastTestedAt: row.last_tested_at,
    lastTestOk: row.last_test_ok,
    lastDetectedChainId: row.last_detected_chain_id
  };
}
// Internal-only - real decrypted secret values. Only ever called by
// server/commercial/bsc-config.mjs's resolveBscRuntimeConfig(), never by an admin/browser-facing
// route (mirrors mapVoiceCredential's includeDecrypted convention).
function mapBscSecretsRaw(row) {
  if (!row) return { rpcUrl: null, webhookSecret: null };
  return {
    rpcUrl: row.rpc_url_encrypted ? decryptSecret(row.rpc_url_encrypted, encryptionKeyHex()) : null,
    webhookSecret: row.webhook_secret_encrypted ? decryptSecret(row.webhook_secret_encrypted, encryptionKeyHex()) : null
  };
}
function mapVoiceLanguageConfig(row) {
  return {
    languageCode: row.language_code, provider: row.provider, credentialId: row.credential_id,
    voiceId: row.voice_id, modelId: row.model_id, enabled: row.enabled, voiceSettings: row.voice_settings || {},
    fallbackProvider: row.fallback_provider, fallbackVoice: row.fallback_voice,
    updatedBy: row.updated_by, createdAt: row.created_at, updatedAt: row.updated_at
  };
}
function mapVoiceCharacterConfig(row) {
  return {
    character: row.character, gender: row.gender, provider: row.provider, credentialId: row.credential_id,
    voiceId: row.voice_id, modelId: row.model_id, enabled: row.enabled, voiceSettings: row.voice_settings || {},
    fallbackProvider: row.fallback_provider, fallbackVoice: row.fallback_voice,
    updatedBy: row.updated_by, createdAt: row.created_at, updatedAt: row.updated_at
  };
}
function mapVoiceTtsUsageEvent(row) {
  return {
    id: row.id, languageCode: row.language_code, provider: row.provider, credentialId: row.credential_id,
    source: row.source, characters: row.characters, characterCost: row.character_cost, success: row.success,
    errorCode: row.error_code, latencyMs: row.latency_ms, createdAt: row.created_at
  };
}
// Last-4-characters-only hint, never anything that could help reconstruct the real key - matches
// the mission's "masked identifier only, such as last four characters" requirement exactly.
function voiceKeyHintFor(apiKey) {
  const trimmed = String(apiKey || '');
  return trimmed.length >= 4 ? '…' + trimmed.slice(-4) : '…';
}
// Found via real production testing (a pasted key that read back as "Invalid" from the admin
// panel): a copy/paste from some sources (browser dashboards, PDFs, rich-text) can carry invisible
// unicode - zero-width space/joiner/non-joiner, a BOM, a non-breaking space - that plain .trim()
// never touches, silently corrupting the key sent as the xi-api-key header while looking completely
// normal in a text input. Stripped once here, at the one place every ElevenLabs credential is ever
// written, so every downstream read (validate, TTS, voices/models lookups) is unaffected.
function sanitizeApiKey(apiKey) {
  return String(apiKey || '').replace(new RegExp("[​‌‍﻿ ]", 'g'), '').trim();
}
function mapXpEvent(row) {
  return {
    id: row.id, userId: row.user_id, type: row.type, domain: row.domain, points: row.points,
    sourceType: row.source_type, sourceId: row.source_id, dedupeKey: row.dedupe_key,
    meta: row.meta, occurredAt: row.occurred_at
  };
}
function mapAchievement(row) { return { id: row.id, userId: row.user_id, achievementKey: row.achievement_key, unlockedAt: row.unlocked_at, evidence: row.evidence }; }
function mapXpConfigOverride(row) { return { key: row.config_key, value: row.value, updatedBy: row.updated_by, updatedAt: row.updated_at }; }

// Module 1 of the local-first-to-server migration (see ARCHITECTURE.md's Global Data Sync
// section). Reassembles the flat rows from trading_sessions/trading_session_entries/
// trading_session_scenarios back into the exact nested SessionRecord/SessionEntry/
// SessionScenario shape the client already uses - see the migration file's comment for why
// title/occurred/pattern_tag_id are real columns while the rest of the scenario/pattern shape
// stays jsonb.
function mapTradingSessionScenario(row) {
  return {
    id: row.id, entryId: row.entry_id, sessionId: row.session_id, title: row.title,
    description: row.description, evidence: row.evidence, trigger: row.trigger_text,
    occurred: row.occurred, patternTagId: row.pattern_tag_id,
    completionPercent: row.completion_percent == null ? null : Number(row.completion_percent),
    probabilityHistory: row.probability_history || [], pattern: row.pattern, executionPlan: row.execution_plan,
    // 2026-08-28 bug report: problem/invalidationNote/invalidationTagIds were never real columns
    // at all (039_trading_session_scenario_gaps.sql adds them) - real, pre-existing client-side
    // Scenario fields silently dropped on every server round-trip since the Phase 2 migration to
    // server-authoritative sync, confirmed via real production testing (a plain DOM edit, not
    // just AI/voice, never survived a reconcile).
    problem: row.problem, invalidationNote: row.invalidation_note, invalidationTagIds: row.invalidation_tag_ids || [],
    // Adaptive AI Session Analysis (2026-08-31 production incident fix) - same "real column,
    // never a fold into an existing jsonb blob" fix as problem/invalidationNote/invalidationTagIds
    // above; these three were previously not referenced by this INSERT at all and silently
    // vanished on the very next session save.
    status: row.status, aiSource: row.ai_source, aiVisualization: row.ai_visualization, lastEvaluation: row.last_evaluation
  };
}
function mapTradingSessionEntry(row, scenarios) {
  return {
    id: row.id, sessionId: row.session_id, type: row.type, createdAt: row.created_at,
    hasImage: row.has_image, imageBlobId: row.image_blob_id, imageUrl: row.image_url,
    timeframe: row.timeframe, market: row.market, tradingSession: row.trading_session,
    gregorianDate: row.gregorian_date, note: row.note, movementNote: row.movement_note,
    relatedScenarioIds: row.related_scenario_ids || [], aiAnalysisResult: row.ai_analysis_result,
    scenarios: scenarios || []
  };
}
function mapActivityLogItem(row) {
  return { id: row.id, sessionId: row.session_id, type: row.type, detail: row.detail, scenarioId: row.scenario_id, loggedAt: row.logged_at, countsTowardLoopUpdate: row.counts_toward_loop_update };
}
// HOTFIX defense-in-depth: trading_session_entries.type is NOT NULL with a
// CHECK (type IN ('chart','movement','fate')) constraint (006_trading_sessions.sql). A real
// client bug (navrya-src/sessionsAdapter.js's createSession(), fixed alongside this) once sent
// entries with no `type` at all, which threw a raw constraint-violation error - the whole
// upsert() transaction (session + every entry + every scenario) rolled back and the request
// 500'd, with no test catching it because tests/trading-sessions-api-contract.test.mjs always
// set `type` explicitly and the in-memory repo (repo.memory.mjs) never enforced this constraint
// to begin with. Normalizing here, mirroring the exact fallback
// public/pages/shared/session-workspace-logic.js's own normalize() already uses client-side
// (`entry.type = entry.type || 'chart'`), means ANY future caller that omits/mistypes this field
// degrades to a sensible default instead of losing the whole session's write.
const VALID_TRADING_ENTRY_TYPES = ['chart', 'movement', 'fate'];
function normalizeTradingEntryType(type) { return VALID_TRADING_ENTRY_TYPES.indexOf(type) > -1 ? type : 'chart'; }

function mapTradingSession(row, entries, activityLog) {
  return {
    id: row.id, userId: row.user_id, character: row.character, name: row.name, market: row.market,
    timeframe: row.timeframe, date: row.date, jalali: row.jalali, startedAt: row.started_at, closedAt: row.closed_at,
    status: row.status, updateIntervalMinutes: row.update_interval_minutes, gracePeriodMinutes: row.grace_period_minutes,
    fateSummary: row.fate_summary, previousSessionSummary: row.previous_session_summary,
    aiSessionAnalysis: row.ai_session_analysis, aiSessionAnalysisResult: row.ai_session_analysis_result,
    finalEntryId: row.final_entry_id, accountId: row.account_id, instrument: row.instrument, entries: entries || [], activityLog: activityLog || [],
    createdAt: row.created_at, updatedAt: row.updated_at
  };
}

// Module 2 of the local-first-to-server migration. Mirrors pattern-registry.types.js
// field-for-field - see the migration file's comment for why stages/screenshots/chat messages
// are each a flat child table here despite being simple arrays client-side.
function mapPatternStage(row) { return { id: row.id, patternId: row.pattern_id, order: row.stage_order, text: row.text }; }
function mapPatternScreenshot(row) { return { id: row.id, patternId: row.pattern_id, fileName: row.file_name, blobId: row.blob_id, imageUrl: row.image_url, uploadedAt: row.uploaded_at, note: row.note }; }
function mapPatternChatMessage(row) { return { id: row.id, patternId: row.pattern_id, role: row.role, content: row.content, createdAt: row.created_at, suggestedStages: row.suggested_stages }; }
function mapPattern(row, stages, referenceScreenshots, chatHistory) {
  return {
    id: row.id, userId: row.user_id, name: row.name, description: row.description,
    completionThreshold: row.completion_threshold, usageCount: row.usage_count, isPublic: row.is_public,
    instruments: row.instruments || [],
    stages: stages || [], referenceScreenshots: referenceScreenshots || [], chatHistory: chatHistory || [],
    createdAt: row.created_at, updatedAt: row.updated_at
  };
}

// Module 3 of the local-first-to-server migration. Mirrors strategy-education.types.js - see
// the migration file's comment for why the three sections are flattened onto the parent row
// while attachments/chatHistory/detectionEvents stay their own child tables.
function mapStrategyAttachment(row) { return { id: row.id, strategyId: row.strategy_id, category: row.category, fileName: row.file_name, blobId: row.blob_id, fileUrl: row.file_url, mimeType: row.mime_type, size: row.size_bytes, note: row.note, uploadedAt: row.uploaded_at }; }
function mapStrategyChatMessage(row) { return { id: row.id, strategyId: row.strategy_id, role: row.role, content: row.content, createdAt: row.created_at, suggestions: row.suggestions }; }
function mapStrategyDetectionEvent(row) { return { id: row.id, strategyId: row.strategy_id, detectedAt: row.detected_at, source: row.source, predictedOutcome: row.predicted_outcome, status: row.status, resolvedAt: row.resolved_at, note: row.note }; }
function mapStrategy(row, attachments, chatHistory, detectionEvents) {
  const byCategory = (category) => (attachments || []).filter((item) => item.category === category);
  return {
    id: row.id, userId: row.user_id, name: row.name, active: row.active, isPublic: row.is_public, origin: row.origin,
    positionManagement: {
      entryRules: row.entry_rules, stopLossRules: row.stop_loss_rules, exitTargetRules: row.exit_target_rules,
      positionSizingRules: row.position_sizing_rules, freeNotes: row.position_management_notes,
      attachments: byCategory('positionManagement')
    },
    riskManagement: {
      maxRiskPerTradePercent: row.max_risk_per_trade_percent == null ? null : Number(row.max_risk_per_trade_percent),
      dailyDrawdownLimitPercent: row.daily_drawdown_limit_percent == null ? null : Number(row.daily_drawdown_limit_percent),
      totalDrawdownLimitPercent: row.total_drawdown_limit_percent == null ? null : Number(row.total_drawdown_limit_percent),
      maxConcurrentTrades: row.max_concurrent_trades, maxProfitCapPerTrade: row.max_profit_cap_per_trade == null ? null : Number(row.max_profit_cap_per_trade),
      freeNotes: row.risk_management_notes, attachments: byCategory('riskManagement')
    },
    overallFramework: { description: row.overall_framework_description, attachments: byCategory('overallFramework') },
    chatHistory: chatHistory || [], aiUnderstandingSummary: row.ai_understanding_summary, detectionEvents: detectionEvents || [],
    // Analysis Profiles domain (044_analysis_profiles.sql) - optional, loose reference, no FK.
    linkedAnalysisProfileId: row.linked_analysis_profile_id || null,
    createdAt: row.created_at, updatedAt: row.updated_at
  };
}

// Analysis Profiles domain (see ARCHITECTURE.md §7.25, 044_analysis_profiles.sql). Flat row, no
// child tables - secondary_style_ids/focus_ids are small id arrays nothing queries into
// individually (same reasoning as trades.take_profits/concept_tags).
function mapAnalysisProfile(row) {
  return {
    id: row.id, userId: row.user_id, name: row.name, description: row.description,
    primaryStyleId: row.primary_style_id, secondaryStyleIds: row.secondary_style_ids || [],
    focusIds: row.focus_ids || [], customMethodNotes: row.custom_method_notes,
    isDefault: row.is_default, isActive: row.is_active, registryVersion: row.registry_version,
    createdAt: row.created_at, updatedAt: row.updated_at
  };
}

// Module 4 of the local-first-to-server migration. Mirrors trade.types.js - see the migration
// file's comment for the column-vs-jsonb split. `timestamp` on emotion-log entries is stored as
// `occurred_at` (consistent with every other *_at column name in this schema) and mapped back
// to `timestamp` here, the one place that translation happens.
function mapTradeScreenshot(row) { return { id: row.id, tradeId: row.trade_id, fileName: row.file_name, blobId: row.blob_id, imageUrl: row.image_url, mimeType: row.mime_type, uploadedAt: row.uploaded_at }; }
function mapTradeEmotionLog(row) {
  return {
    id: row.id, tradeId: row.trade_id, timestamp: row.occurred_at, stage: row.stage,
    dominantEmotions: row.dominant_emotions || [], emotionDetails: row.emotion_details || [],
    stressLevel: row.stress_level, focusQuality: row.focus_quality, planCommitment: row.plan_commitment,
    wouldTakeIfNotForced: row.would_take_if_not_forced, note: row.note
  };
}
function mapTrade(row, screenshots, emotionLog) {
  return {
    id: row.id, userId: row.user_id, status: row.status, direction: row.direction, entryMode: row.entry_mode,
    entryPrice: row.entry_price == null ? null : Number(row.entry_price), stopLoss: row.stop_loss == null ? null : Number(row.stop_loss),
    takeProfits: row.take_profits || [], slDistancePercent: row.sl_distance_percent == null ? null : Number(row.sl_distance_percent),
    riskPercent: row.risk_percent == null ? null : Number(row.risk_percent), riskAmount: row.risk_amount == null ? null : Number(row.risk_amount),
    leverage: row.leverage == null ? null : Number(row.leverage), positionSize: row.position_size == null ? null : Number(row.position_size),
    marginRequired: row.margin_required == null ? null : Number(row.margin_required), liquidationPrice: row.liquidation_price == null ? null : Number(row.liquidation_price),
    rr: row.rr == null ? null : Number(row.rr), marginMode: row.margin_mode, commission: row.commission,
    breakevenPercent: row.breakeven_percent == null ? null : Number(row.breakeven_percent), exitPrice: row.exit_price == null ? null : Number(row.exit_price),
    outcome: row.outcome, pnl: row.pnl == null ? null : Number(row.pnl), pnlPercent: row.pnl_percent == null ? null : Number(row.pnl_percent),
    session: row.session, primaryTimeframe: row.primary_timeframe, timeframeTrends: row.timeframe_trends || [],
    conceptTags: row.concept_tags || [], linkedPatternIds: row.linked_pattern_ids || [], linkedStrategyId: row.linked_strategy_id,
    accountId: row.account_id, instrument: row.instrument,
    chartNote: row.chart_note, statusHistory: row.status_history || [],
    source: { character: row.source_character, sessionId: row.source_session_id, scenarioId: row.source_scenario_id },
    aiPredictionLinks: row.ai_prediction_links || [], aiInitialAnalysis: row.ai_initial_analysis,
    disciplineImpact: row.discipline_impact == null ? 0 : Number(row.discipline_impact),
    screenshots: screenshots || [], emotionLog: emotionLog || [],
    createdAt: row.created_at, updatedAt: row.updated_at, openedAt: row.opened_at, closedAt: row.closed_at
  };
}

// NAVRYA Accounts domain (021_accounts.sql). See repo.memory.mjs's identical normalizeRules()
// for why rules is one jsonb blob rather than ~10 nullable columns.
// Real IANA-zone validation (Node's Intl matches the browser's) - an unrecognized string is
// rejected back to the safe UTC default server-side too, never trusted verbatim from a client.
function isValidTz(tz) { if (!tz || typeof tz !== 'string') return false; try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch (_) { return false; } }
function normalizeRules(kind, rules) {
  const r = rules || {};
  const num = (v) => (v === null || v === undefined || v === '' ? null : (Number.isFinite(Number(v)) ? Number(v) : null));
  const resetHour = (v) => { const h = num(v); return h === null ? 0 : Math.max(0, Math.min(23, Math.round(h))); };
  const reset = {
    dailyResetTimezone: isValidTz(r.dailyResetTimezone) ? r.dailyResetTimezone : 'UTC',
    dailyResetHour: resetHour(r.dailyResetHour),
    dailyLossBasis: ['realized', 'realized_and_open'].indexOf(r.dailyLossBasis) > -1 ? r.dailyLossBasis : 'realized'
  };
  if (kind === 'personal') {
    return {
      kind: 'personal',
      dailyLossCap: num(r.dailyLossCap), maxRiskPerTradePercent: num(r.maxRiskPerTradePercent),
      monthlyGoalPercent: num(r.monthlyGoalPercent), maxOpenPositions: num(r.maxOpenPositions),
      hardFloor: num(r.hardFloor), ...reset
    };
  }
  return {
    kind: 'prop',
    profitTargetPercent: num(r.profitTargetPercent), dailyLossLimitPercent: num(r.dailyLossLimitPercent),
    maxDrawdownPercent: num(r.maxDrawdownPercent), drawdownType: r.drawdownType === 'trailing' ? 'trailing' : 'static',
    minTradingDays: num(r.minTradingDays), consistencyCapPercent: num(r.consistencyCapPercent),
    maxLotSize: num(r.maxLotSize), maxOpenPositions: num(r.maxOpenPositions), maxRiskPerTradePercent: num(r.maxRiskPerTradePercent), ...reset
  };
}
function mapAccount(row) {
  return {
    id: row.id, userId: row.user_id, kind: row.kind, firm: row.firm, program: row.program, platform: row.platform,
    numberMasked: row.number_masked, status: row.status, archivedAt: row.archived_at, currency: row.currency,
    startDate: row.start_date, startingBalance: row.starting_balance == null ? 0 : Number(row.starting_balance),
    rules: row.rules || {}, createdAt: row.created_at, updatedAt: row.updated_at
  };
}

function mapInstrumentCatalog(row) {
  return { id: row.id, userId: row.user_id, code: row.code, displayName: row.display_name, createdAt: row.created_at, updatedAt: row.updated_at };
}

// "Online" threshold for sessions.aggregateByUser(): 3x the client heartbeat interval
// (admin-heartbeat.js beats every 45s), matching the lazy-sweep threshold used elsewhere for
// the same reason - a missed beat or two shouldn't flip a still-open tab to "offline".
const ONLINE_THRESHOLD_SECONDS = 135;

// Real implementation of the same repo interface repo.memory.mjs exposes. Parameterized SQL
// throughout (never string-interpolated user input), snake_case DB columns <-> camelCase JS.
// node-postgres does NOT auto-parse JSON parameters going IN (JSON.stringify is required on
// write) but DOES auto-parse JSONB columns coming OUT (no JSON.parse needed on read).
export function createPgRepo(pool) {
  const users = {
    async create({ displayName, avatarUrl, bio, email }) {
      const trimmed = String(displayName || '').trim();
      if (!trimmed) throw new ApiError(400, 'VALIDATION_FAILED');
      const id = newId('user');
      try {
        const { rows } = await pool.query(
          'INSERT INTO users (id, display_name, avatar_url, bio, email) VALUES ($1,$2,$3,$4,$5) RETURNING *',
          [id, trimmed, avatarUrl || null, bio || null, email || null]
        );
        const user = mapUser(rows[0]);
        await grantSignupPromoCredit(pool, user.id);
        return user;
      } catch (error) {
        if (error && error.code === '23505') throw new ApiError(409, 'EMAIL_TAKEN');
        throw error;
      }
    },
    // Auth-only lookups - deliberately bypass mapUser() so password_hash/google_id can never
    // leak into the public user shape that get()/list()/update() return (that shape is what
    // req.currentUser and every API response use). These three methods are the ONLY code paths
    // that ever read or write those two columns - see 013_real_auth.sql.
    async findCredentialsByEmail(email) {
      const { rows } = await pool.query('SELECT id, password_hash, suspended_at FROM users WHERE email=$1', [email]);
      if (!rows[0]) return null;
      return { id: rows[0].id, passwordHash: rows[0].password_hash, suspendedAt: rows[0].suspended_at };
    },
    async findIdByGoogleId(googleId) {
      const { rows } = await pool.query('SELECT id FROM users WHERE google_id=$1', [googleId]);
      return rows[0] ? rows[0].id : null;
    },
    async setCredentials(id, { passwordHash, googleId } = {}) {
      await pool.query(
        'UPDATE users SET password_hash=COALESCE($2,password_hash), google_id=COALESCE($3,google_id) WHERE id=$1',
        [id, passwordHash || null, googleId || null]
      );
    },
    async get(id) {
      const { rows } = await pool.query('SELECT * FROM users WHERE id=$1', [id]);
      return rows[0] ? mapUser(rows[0]) : null;
    },
    // The ONLY way emailVerified/emailVerifiedAt is ever written (020_auth_sessions.sql).
    async markEmailVerified(id) {
      const { rows } = await pool.query('UPDATE users SET email_verified=true, email_verified_at=now() WHERE id=$1 RETURNING *', [id]);
      if (!rows[0]) throw new ApiError(404, 'USER_NOT_FOUND');
      return mapUser(rows[0]);
    },
    async list() {
      const { rows } = await pool.query('SELECT * FROM users ORDER BY created_at DESC');
      return rows.map(mapUser);
    },
    // Recipient autocomplete for the Messages "New message" dialog - substring match on
    // display_name, self excluded, capped for a dropdown-sized result set.
    async search(query, { excludeUserId, limit } = {}) {
      const trimmed = String(query || '').trim();
      if (!trimmed) return [];
      const params = [`%${trimmed}%`];
      let text = 'SELECT * FROM users WHERE display_name ILIKE $1';
      if (excludeUserId) { params.push(excludeUserId); text += ` AND id<>$${params.length}`; }
      params.push(limit || 8);
      text += ` ORDER BY display_name ASC LIMIT $${params.length}`;
      const { rows } = await pool.query(text, params);
      return rows.map(mapUser);
    },
    async update(id, patch) {
      const existing = await users.get(id);
      if (!existing) throw new ApiError(404, 'USER_NOT_FOUND');
      const merged = { ...existing, ...patch };
      const { rows } = await pool.query(
        'UPDATE users SET display_name=$2, avatar_url=$3, bio=$4, role=$5, suspended_at=$6, plan=$7 WHERE id=$1 RETURNING *',
        [id, merged.displayName, merged.avatarUrl, merged.bio, merged.role, merged.suspendedAt, merged.plan]
      );
      return mapUser(rows[0]);
    },
    // Trader-editable profile fields only. kyc_status/xp_total/role are structurally absent from
    // this SQL statement's column list - not merely filtered by the route layer - so this method
    // can never write them even if a caller's patch object happened to carry them.
    async updateProfile(id, patch) {
      const existing = await users.get(id);
      if (!existing) throw new ApiError(404, 'USER_NOT_FOUND');
      const merged = { ...existing, ...patch };
      try {
        const { rows } = await pool.query(
          'UPDATE users SET display_name=$2, email=$3, phone=$4, profile_role=$5, avatar_data_url=$6 WHERE id=$1 RETURNING *',
          [id, merged.displayName, merged.email || null, merged.phone || null, merged.profileRole, merged.avatarDataUrl || null]
        );
        return mapUser(rows[0]);
      } catch (error) {
        if (error && error.code === '23505') throw new ApiError(409, 'EMAIL_TAKEN');
        throw error;
      }
    },
    // The ONLY way kyc_status is ever written - called exclusively from the admin-only
    // PATCH /api/admin/users/:id/kyc route, never from the trader-facing profile endpoint.
    async updateKyc(id, kycStatus) {
      if (!['not_started', 'pending', 'verified', 'rejected'].includes(kycStatus)) throw new ApiError(400, 'VALIDATION_FAILED');
      const existing = await users.get(id);
      if (!existing) throw new ApiError(404, 'USER_NOT_FOUND');
      const { rows } = await pool.query('UPDATE users SET kyc_status=$2 WHERE id=$1 RETURNING *', [id, kycStatus]);
      return mapUser(rows[0]);
    }
  };

  const posts = {
    async create({ userId, content, images }) {
      const owner = await users.get(userId);
      if (!owner) throw new ApiError(400, 'USER_NOT_FOUND');
      const id = newId('post');
      const { rows } = await pool.query(
        'INSERT INTO posts (id, user_id, content, images) VALUES ($1,$2,$3,$4) RETURNING *',
        [id, userId, String(content || ''), JSON.stringify(images || [])]
      );
      return mapPost(rows[0]);
    },
    async list({ limit, before } = {}) {
      const params = [limit || 20];
      let text = 'SELECT * FROM posts';
      if (before) { params.push(before); text += ` WHERE created_at < $${params.length}`; }
      text += ' ORDER BY created_at DESC LIMIT $1';
      const { rows } = await pool.query(text, params);
      return rows.map(mapPost);
    },
    async get(id) {
      const { rows } = await pool.query('SELECT * FROM posts WHERE id=$1', [id]);
      return rows[0] ? mapPost(rows[0]) : null;
    },
    async remove(id, userId) {
      const { rows } = await pool.query('SELECT * FROM posts WHERE id=$1', [id]);
      if (!rows[0]) throw new ApiError(404, 'POST_NOT_FOUND');
      if (rows[0].user_id !== userId) throw new ApiError(403, 'NOT_POST_OWNER');
      await pool.query('DELETE FROM posts WHERE id=$1', [id]);
    }
  };

  const comments = {
    async create({ postId, userId, content }) {
      const post = await posts.get(postId);
      if (!post) throw new ApiError(404, 'POST_NOT_FOUND');
      const trimmed = String(content || '').trim();
      if (!trimmed) throw new ApiError(400, 'VALIDATION_FAILED');
      const id = newId('comment');
      const { rows } = await pool.query(
        'INSERT INTO comments (id, post_id, user_id, content) VALUES ($1,$2,$3,$4) RETURNING *',
        [id, postId, userId, trimmed]
      );
      return mapComment(rows[0]);
    },
    async listByPost(postId) {
      const { rows } = await pool.query('SELECT * FROM comments WHERE post_id=$1 ORDER BY created_at ASC', [postId]);
      return rows.map(mapComment);
    }
  };

  const likes = {
    async find(postId, userId) {
      const { rows } = await pool.query('SELECT * FROM post_likes WHERE post_id=$1 AND user_id=$2', [postId, userId]);
      return rows[0] ? mapPostLike(rows[0]) : null;
    },
    async create({ postId, userId }) {
      const post = await posts.get(postId);
      if (!post) throw new ApiError(404, 'POST_NOT_FOUND');
      const id = newId('like');
      try {
        const { rows } = await pool.query(
          'INSERT INTO post_likes (id, post_id, user_id) VALUES ($1,$2,$3) RETURNING *',
          [id, postId, userId]
        );
        return mapPostLike(rows[0]);
      } catch (error) {
        if (error && error.code === '23505') return likes.find(postId, userId);
        throw error;
      }
    },
    async remove(postId, userId) {
      await pool.query('DELETE FROM post_likes WHERE post_id=$1 AND user_id=$2', [postId, userId]);
    },
    async listByPost(postId) {
      const { rows } = await pool.query('SELECT * FROM post_likes WHERE post_id=$1 ORDER BY created_at ASC', [postId]);
      return rows.map(mapPostLike);
    }
  };

  const listings = {
    async create(input) {
      const id = newId('listing');
      const { rows } = await pool.query(
        `INSERT INTO marketplace_listings
          (id, seller_id, type, source_id, title, description, price_amount, price_currency,
           success_rate_percent, sample_size, evidence_as_of, preview_content, full_content, screenshots, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         RETURNING *`,
        [id, input.sellerId, input.type, input.sourceId, input.title, input.description || '',
          Number(input.priceAmount) || 0, input.priceCurrency || 'USD', input.successRatePercent ?? null,
          input.sampleSize || 0, input.evidenceAsOf || new Date().toISOString(),
          JSON.stringify(input.previewContent ?? null), JSON.stringify(input.fullContent ?? null),
          JSON.stringify(input.screenshots || []), input.status || 'published']
      );
      return mapListing(rows[0]);
    },
    async get(id) {
      const { rows } = await pool.query('SELECT * FROM marketplace_listings WHERE id=$1', [id]);
      return rows[0] ? mapListing(rows[0]) : null;
    },
    async listPublished({ type, limit, before } = {}) {
      const params = [];
      let text = "SELECT * FROM marketplace_listings WHERE status='published'";
      if (type) { params.push(type); text += ` AND type=$${params.length}`; }
      if (before) { params.push(before); text += ` AND created_at < $${params.length}`; }
      params.push(limit || 20);
      text += ` ORDER BY created_at DESC LIMIT $${params.length}`;
      const { rows } = await pool.query(text, params);
      return rows.map(mapListing);
    },
    async listBySeller(sellerId) {
      const { rows } = await pool.query('SELECT * FROM marketplace_listings WHERE seller_id=$1 ORDER BY created_at DESC', [sellerId]);
      return rows.map(mapListing);
    },
    async findBySource(sourceId, sellerId) {
      const { rows } = await pool.query('SELECT * FROM marketplace_listings WHERE source_id=$1 AND seller_id=$2', [sourceId, sellerId]);
      return rows[0] ? mapListing(rows[0]) : null;
    },
    async update(id, patch) {
      const existing = await listings.get(id);
      if (!existing) throw new ApiError(404, 'LISTING_NOT_FOUND');
      const merged = { ...existing, ...patch };
      const { rows } = await pool.query(
        `UPDATE marketplace_listings SET title=$2, description=$3, price_amount=$4, price_currency=$5,
           success_rate_percent=$6, sample_size=$7, evidence_as_of=$8, preview_content=$9, full_content=$10,
           screenshots=$11, status=$12, featured=$13, updated_at=now()
         WHERE id=$1 RETURNING *`,
        [id, merged.title, merged.description, merged.priceAmount, merged.priceCurrency,
          merged.successRatePercent, merged.sampleSize, merged.evidenceAsOf,
          JSON.stringify(merged.previewContent), JSON.stringify(merged.fullContent),
          JSON.stringify(merged.screenshots), merged.status, Boolean(merged.featured)]
      );
      return mapListing(rows[0]);
    },
    async listAll({ status } = {}) {
      const params = [];
      let text = 'SELECT * FROM marketplace_listings';
      if (status && status !== 'all') { params.push(status); text += ` WHERE status=$${params.length}`; }
      text += ' ORDER BY created_at DESC';
      const { rows } = await pool.query(text, params);
      return rows.map(mapListing);
    }
  };

  const purchases = {
    async create({ listingId, buyerId, priceAtPurchase }) {
      const listing = await listings.get(listingId);
      if (!listing) throw new ApiError(404, 'LISTING_NOT_FOUND');
      if (listing.sellerId === buyerId) throw new ApiError(400, 'CANNOT_PURCHASE_OWN_LISTING');
      const existing = await purchases.find(listingId, buyerId);
      if (existing) throw new ApiError(409, 'ALREADY_PURCHASED');
      const id = newId('purchase');
      try {
        const { rows } = await pool.query(
          'INSERT INTO marketplace_purchases (id, listing_id, buyer_id, price_at_purchase, mock) VALUES ($1,$2,$3,$4,TRUE) RETURNING *',
          [id, listingId, buyerId, Number(priceAtPurchase) || 0]
        );
        return mapPurchase(rows[0]);
      } catch (error) {
        if (error && error.code === '23505') throw new ApiError(409, 'ALREADY_PURCHASED');
        throw error;
      }
    },
    async find(listingId, buyerId) {
      const { rows } = await pool.query('SELECT * FROM marketplace_purchases WHERE listing_id=$1 AND buyer_id=$2', [listingId, buyerId]);
      return rows[0] ? mapPurchase(rows[0]) : null;
    },
    async listByBuyer(buyerId) {
      const { rows } = await pool.query('SELECT * FROM marketplace_purchases WHERE buyer_id=$1', [buyerId]);
      return rows.map(mapPurchase);
    },
    async countByListing(listingId) {
      const { rows } = await pool.query('SELECT COUNT(*) AS count FROM marketplace_purchases WHERE listing_id=$1', [listingId]);
      return Number(rows[0].count);
    },
    async aggregateByBuyer() {
      const { rows } = await pool.query('SELECT buyer_id, COUNT(*) AS count, SUM(price_at_purchase) AS total FROM marketplace_purchases GROUP BY buyer_id');
      const result = {};
      rows.forEach((row) => { result[row.buyer_id] = { count: Number(row.count), total: Number(row.total || 0) }; });
      return result;
    }
  };

  const ratings = {
    async create({ listingId, buyerId, rating, reviewText }) {
      const purchase = await purchases.find(listingId, buyerId);
      if (!purchase) throw new ApiError(403, 'PURCHASE_REQUIRED');
      const value = Number(rating);
      if (!Number.isInteger(value) || value < 1 || value > 5) throw new ApiError(400, 'VALIDATION_FAILED');
      const id = newId('rating');
      try {
        const { rows } = await pool.query(
          'INSERT INTO marketplace_ratings (id, listing_id, buyer_id, rating, review_text) VALUES ($1,$2,$3,$4,$5) RETURNING *',
          [id, listingId, buyerId, value, reviewText || null]
        );
        return mapRating(rows[0]);
      } catch (error) {
        if (error && error.code === '23505') throw new ApiError(409, 'ALREADY_RATED');
        throw error;
      }
    },
    async listByListing(listingId) {
      const { rows } = await pool.query('SELECT * FROM marketplace_ratings WHERE listing_id=$1 ORDER BY created_at DESC', [listingId]);
      return rows.map(mapRating);
    }
  };

  const threads = {
    // listingId path: existing buyer-asks-seller-about-this-item flow, unchanged. counterpartyId
    // path (listingId omitted): general DM to any user, backed by 015_post_likes_and_general_
    // messaging.sql's nullable listing_id + the unordered-pair partial unique index, so either
    // participant starting a thread lands on the same row.
    async findOrCreate({ listingId, buyerId, counterpartyId }) {
      if (listingId) {
        const listing = await listings.get(listingId);
        if (!listing) throw new ApiError(404, 'LISTING_NOT_FOUND');
        if (listing.sellerId === buyerId) throw new ApiError(400, 'CANNOT_MESSAGE_OWN_LISTING');
        const { rows: existingRows } = await pool.query('SELECT * FROM dm_threads WHERE listing_id=$1 AND buyer_id=$2', [listingId, buyerId]);
        if (existingRows[0]) return mapThread(existingRows[0]);
        const id = newId('thread');
        const { rows } = await pool.query(
          'INSERT INTO dm_threads (id, listing_id, buyer_id, seller_id) VALUES ($1,$2,$3,$4) RETURNING *',
          [id, listingId, buyerId, listing.sellerId]
        );
        return mapThread(rows[0]);
      }
      if (!counterpartyId) throw new ApiError(400, 'VALIDATION_FAILED');
      if (counterpartyId === buyerId) throw new ApiError(400, 'CANNOT_MESSAGE_SELF');
      const counterparty = await users.get(counterpartyId);
      if (!counterparty) throw new ApiError(404, 'USER_NOT_FOUND');
      const { rows: existingRows } = await pool.query(
        `SELECT * FROM dm_threads WHERE listing_id IS NULL AND
           ((buyer_id=$1 AND seller_id=$2) OR (buyer_id=$2 AND seller_id=$1))`,
        [buyerId, counterpartyId]
      );
      if (existingRows[0]) return mapThread(existingRows[0]);
      const id = newId('thread');
      const { rows } = await pool.query(
        'INSERT INTO dm_threads (id, listing_id, buyer_id, seller_id) VALUES ($1,NULL,$2,$3) RETURNING *',
        [id, buyerId, counterpartyId]
      );
      return mapThread(rows[0]);
    },
    async get(id) {
      const { rows } = await pool.query('SELECT * FROM dm_threads WHERE id=$1', [id]);
      return rows[0] ? mapThread(rows[0]) : null;
    },
    async listByUser(userId) {
      const { rows } = await pool.query('SELECT * FROM dm_threads WHERE buyer_id=$1 OR seller_id=$1 ORDER BY created_at DESC', [userId]);
      return rows.map(mapThread);
    }
  };

  const messages = {
    async create({ threadId, senderId, content }) {
      const thread = await threads.get(threadId);
      if (!thread) throw new ApiError(404, 'THREAD_NOT_FOUND');
      const trimmed = String(content || '').trim();
      if (!trimmed) throw new ApiError(400, 'VALIDATION_FAILED');
      const id = newId('message');
      const { rows } = await pool.query(
        'INSERT INTO dm_messages (id, thread_id, sender_id, content) VALUES ($1,$2,$3,$4) RETURNING *',
        [id, threadId, senderId, trimmed]
      );
      return mapMessage(rows[0]);
    },
    async listByThread(threadId) {
      const { rows } = await pool.query('SELECT * FROM dm_messages WHERE thread_id=$1 ORDER BY created_at ASC', [threadId]);
      return rows.map(mapMessage);
    },
    async markRead({ threadId, userId }) {
      await pool.query('UPDATE dm_messages SET read_at=now() WHERE thread_id=$1 AND sender_id<>$2 AND read_at IS NULL', [threadId, userId]);
    }
  };

  const reports = {
    async create({ targetType, targetId, reporterId, reason }) {
      const validTypes = ['post', 'comment', 'listing', 'message'];
      if (!validTypes.includes(targetType)) throw new ApiError(400, 'INVALID_TARGET_TYPE');
      const trimmedReason = String(reason || '').trim();
      if (!trimmedReason) throw new ApiError(400, 'VALIDATION_FAILED');
      const tableByType = { post: 'posts', comment: 'comments', listing: 'marketplace_listings', message: 'dm_messages' };
      const { rows: targetRows } = await pool.query(`SELECT id FROM ${tableByType[targetType]} WHERE id=$1`, [targetId]);
      if (!targetRows[0]) throw new ApiError(404, 'TARGET_NOT_FOUND');
      const id = newId('report');
      const { rows } = await pool.query(
        'INSERT INTO reports (id, target_type, target_id, reporter_id, reason) VALUES ($1,$2,$3,$4,$5) RETURNING *',
        [id, targetType, targetId, reporterId, trimmedReason]
      );
      return mapReport(rows[0]);
    },
    // Launch-readiness audit fix (P1-4): reports could be created since day one but nothing ever
    // read them back - reports_status_idx (003_marketplace_and_messaging.sql) anticipated this
    // exact query shape from the start.
    async list({ status } = {}) {
      const { rows } = status
        ? await pool.query('SELECT * FROM reports WHERE status=$1 ORDER BY created_at DESC', [status])
        : await pool.query('SELECT * FROM reports ORDER BY created_at DESC');
      return rows.map(mapReport);
    },
    async updateStatus(id, status) {
      if (!['open', 'reviewed', 'dismissed'].includes(status)) throw new ApiError(400, 'VALIDATION_FAILED');
      const { rows: existingRows } = await pool.query('SELECT id FROM reports WHERE id=$1', [id]);
      if (!existingRows[0]) throw new ApiError(404, 'REPORT_NOT_FOUND');
      const { rows } = await pool.query('UPDATE reports SET status=$2 WHERE id=$1 RETURNING *', [id, status]);
      return mapReport(rows[0]);
    }
  };

  // Launch-readiness audit fix (P1-1, 052_client_errors.sql). One row per (fingerprint,
  // releaseVersion) - a repeated error is an UPDATE (bump last_seen_at/occurrence_count), never a
  // new row, so 100,000 identical client errors never become 100,000 writes.
  const clientErrors = {
    async record({ fingerprint, releaseVersion, source, message, route, samplePayload }) {
      const { rows } = await pool.query(
        `INSERT INTO client_errors (id, fingerprint, release_version, source, message, route, sample_payload)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (fingerprint, release_version) DO UPDATE SET
           last_seen_at = now(), occurrence_count = client_errors.occurrence_count + 1
         RETURNING *`,
        [newId('clienterr'), fingerprint, releaseVersion || 'unknown', source === 'server' ? 'server' : 'client',
          String(message || '').slice(0, 500), route ? String(route).slice(0, 200) : null, JSON.stringify(samplePayload ?? null)]
      );
      return mapClientError(rows[0]);
    },
    async list({ status, limit } = {}) {
      const { rows } = status
        ? await pool.query('SELECT * FROM client_errors WHERE status=$1 ORDER BY last_seen_at DESC LIMIT $2', [status, limit || 100])
        : await pool.query('SELECT * FROM client_errors ORDER BY last_seen_at DESC LIMIT $1', [limit || 100]);
      return rows.map(mapClientError);
    },
    async updateStatus(id, status) {
      if (!['open', 'investigating', 'resolved', 'ignored'].includes(status)) throw new ApiError(400, 'VALIDATION_FAILED');
      const { rows: existingRows } = await pool.query('SELECT id FROM client_errors WHERE id=$1', [id]);
      if (!existingRows[0]) throw new ApiError(404, 'CLIENT_ERROR_NOT_FOUND');
      const { rows } = await pool.query('UPDATE client_errors SET status=$2 WHERE id=$1 RETURNING *', [id, status]);
      return mapClientError(rows[0]);
    }
  };

  const sessions = {
    async heartbeat(userId) {
      const { rows: openRows } = await pool.query('SELECT * FROM user_sessions WHERE user_id=$1 AND ended_at IS NULL', [userId]);
      if (openRows[0]) {
        const { rows } = await pool.query('UPDATE user_sessions SET last_heartbeat_at=now() WHERE id=$1 RETURNING *', [openRows[0].id]);
        return mapSession(rows[0]);
      }
      const id = newId('session');
      try {
        const { rows } = await pool.query('INSERT INTO user_sessions (id, user_id) VALUES ($1,$2) RETURNING *', [id, userId]);
        return mapSession(rows[0]);
      } catch (error) {
        if (error && error.code === '23505') {
          // Race: a concurrent heartbeat already created the open session - update it instead.
          const { rows } = await pool.query('UPDATE user_sessions SET last_heartbeat_at=now() WHERE user_id=$1 AND ended_at IS NULL RETURNING *', [userId]);
          return mapSession(rows[0]);
        }
        throw error;
      }
    },
    async sweepStale(thresholdMs) {
      const seconds = Math.max(0, Math.floor(thresholdMs / 1000));
      await pool.query(
        "UPDATE user_sessions SET ended_at = last_heartbeat_at WHERE ended_at IS NULL AND last_heartbeat_at < now() - ($1 * INTERVAL '1 second')",
        [seconds]
      );
    },
    async get(id) {
      const { rows } = await pool.query('SELECT * FROM user_sessions WHERE id=$1', [id]);
      return rows[0] ? mapSession(rows[0]) : null;
    },
    async listByUser(userId) {
      const { rows } = await pool.query('SELECT * FROM user_sessions WHERE user_id=$1 ORDER BY started_at DESC', [userId]);
      return rows.map(mapSession);
    },
    async aggregateByUser() {
      const { rows } = await pool.query(
        `SELECT user_id, MAX(started_at) AS last_login_at,
                BOOL_OR(ended_at IS NULL AND last_heartbeat_at > now() - ($1 * INTERVAL '1 second')) AS is_online,
                SUM(EXTRACT(EPOCH FROM (COALESCE(ended_at, last_heartbeat_at) - started_at))) AS total_seconds
         FROM user_sessions GROUP BY user_id`,
        [ONLINE_THRESHOLD_SECONDS]
      );
      const result = {};
      rows.forEach((row) => { result[row.user_id] = { lastLoginAt: row.last_login_at, isOnline: row.is_online, hoursOnline: Number(row.total_seconds || 0) / 3600 }; });
      return result;
    },
    // Backs the account profile's "app uptime" stat - total accumulated online time across every
    // user_sessions row ever recorded for this user, same accumulation aggregateByUser() does for
    // the admin panel, just scoped to one user so switching characters (a full page reload) never
    // resets it back to zero.
    async hoursOnlineFor(userId) {
      const { rows } = await pool.query(
        `SELECT SUM(EXTRACT(EPOCH FROM (COALESCE(ended_at, last_heartbeat_at) - started_at))) AS total_seconds
         FROM user_sessions WHERE user_id=$1`,
        [userId]
      );
      return Number(rows[0].total_seconds || 0) / 3600;
    },
    // Backs the server-only 'five_day_login_streak' achievement check - the longest run of
    // consecutive calendar days with at least one session, not necessarily ending today.
    async consecutiveLoginDays(userId) {
      const { rows } = await pool.query("SELECT DISTINCT date_trunc('day', started_at) AS day FROM user_sessions WHERE user_id=$1 ORDER BY day", [userId]);
      const sortedDays = rows.map((row) => row.day.toISOString().slice(0, 10));
      let best = 0, current = 0, prev = null;
      sortedDays.forEach((day) => {
        current = prev && (new Date(day) - new Date(prev)) / 86400000 === 1 ? current + 1 : 1;
        best = Math.max(best, current);
        prev = day;
      });
      return best;
    }
  };

  const usageEvents = {
    // model/feature/providerCostMicroUsd/retailChargeMicroUsd/origin/linkedLedgerIdempotencyKey
    // are all optional and additive - every pre-existing call site (the client's own
    // POST /api/users/usage-report -> reportToServer()) keeps working unchanged and lands as
    // origin='client' with these left null, exactly reflecting that it never carried this data.
    // The new gateway-side writer (server/community/routes.internal.mjs's /internal/usage/record,
    // called from server/pattern-ai-server.mjs's dispatch) is the only caller that passes
    // origin='gateway' plus real model/cost data.
    async create({
      userId, provider, promptTokens, completionTokens, totalTokens, source, model, feature, providerCostMicroUsd, retailChargeMicroUsd, tokenDiscountPercent, origin, linkedLedgerIdempotencyKey,
      cachedInputTokens, cacheWriteInputTokens, reasoningTokens, usageRaw
    }) {
      const id = newId('usageEvent');
      const { rows } = await pool.query(
        `INSERT INTO ai_usage_events
           (id, user_id, provider, prompt_tokens, completion_tokens, total_tokens, source, model, feature, provider_cost_micro_usd, retail_charge_micro_usd, token_discount_percent, origin, linked_ledger_idempotency_key,
            cached_input_tokens, cache_write_input_tokens, reasoning_tokens, usage_raw)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
        [
          id, userId || null, String(provider || 'unknown'), promptTokens ?? null, completionTokens ?? null, totalTokens ?? null, String(source || 'unknown'),
          model || null, feature || null, providerCostMicroUsd ?? null, retailChargeMicroUsd ?? null, tokenDiscountPercent ?? null, origin || 'client', linkedLedgerIdempotencyKey || null,
          cachedInputTokens ?? null, cacheWriteInputTokens ?? null, reasoningTokens ?? null, usageRaw ? JSON.stringify(usageRaw) : null
        ]
      );
      return mapUsageEvent(rows[0]);
    },
    // Real per-model $ reporting (client "my AI usage" table, admin user detail, admin AI tab) -
    // grouped by (provider, model) and, by default, scoped to origin='gateway' rows only, so a
    // client-reported row (untrusted, no cost data) can never double-count or masquerade as real
    // settled cost. `since` bounds the reporting period; omitted means lifetime.
    async aggregateByModelForUser(userId, { origin = 'gateway', since } = {}) {
      const params = [userId, origin];
      let text = `SELECT provider, model, COUNT(*) AS calls,
                    SUM(COALESCE(prompt_tokens,0)) AS prompt_tokens, SUM(COALESCE(completion_tokens,0)) AS completion_tokens, SUM(COALESCE(total_tokens,0)) AS total_tokens,
                    SUM(COALESCE(provider_cost_micro_usd,0)) AS provider_cost_micro_usd, SUM(COALESCE(retail_charge_micro_usd,0)) AS retail_charge_micro_usd
                  FROM ai_usage_events WHERE user_id=$1 AND origin=$2`;
      if (since) { params.push(since); text += ` AND created_at >= $${params.length}`; }
      text += ' GROUP BY provider, model ORDER BY provider_cost_micro_usd DESC';
      const { rows } = await pool.query(text, params);
      return rows.map((row) => ({
        provider: row.provider, model: row.model, calls: Number(row.calls || 0),
        promptTokens: Number(row.prompt_tokens || 0), completionTokens: Number(row.completion_tokens || 0), totalTokens: Number(row.total_tokens || 0),
        providerCostMicroUsd: Number(row.provider_cost_micro_usd || 0), retailChargeMicroUsd: Number(row.retail_charge_micro_usd || 0)
      }));
    },
    async aggregateByModel({ origin = 'gateway', since } = {}) {
      const params = [origin];
      let text = `SELECT provider, model, COUNT(*) AS calls,
                    SUM(COALESCE(prompt_tokens,0)) AS prompt_tokens, SUM(COALESCE(completion_tokens,0)) AS completion_tokens, SUM(COALESCE(total_tokens,0)) AS total_tokens,
                    SUM(COALESCE(provider_cost_micro_usd,0)) AS provider_cost_micro_usd, SUM(COALESCE(retail_charge_micro_usd,0)) AS retail_charge_micro_usd
                  FROM ai_usage_events WHERE origin=$1`;
      if (since) { params.push(since); text += ` AND created_at >= $${params.length}`; }
      text += ' GROUP BY provider, model ORDER BY provider_cost_micro_usd DESC';
      const { rows } = await pool.query(text, params);
      return rows.map((row) => ({
        provider: row.provider, model: row.model, calls: Number(row.calls || 0),
        promptTokens: Number(row.prompt_tokens || 0), completionTokens: Number(row.completion_tokens || 0), totalTokens: Number(row.total_tokens || 0),
        providerCostMicroUsd: Number(row.provider_cost_micro_usd || 0), retailChargeMicroUsd: Number(row.retail_charge_micro_usd || 0)
      }));
    },
    async aggregateByProviderAndDay({ since } = {}) {
      const params = [];
      let text = "SELECT provider, date_trunc('day', created_at) AS day, SUM(COALESCE(total_tokens,0)) AS total_tokens FROM ai_usage_events";
      if (since) { params.push(since); text += ` WHERE created_at >= $${params.length}`; }
      text += ' GROUP BY provider, day ORDER BY day ASC';
      const { rows } = await pool.query(text, params);
      return rows.map((row) => ({ provider: row.provider, day: row.day, totalTokens: Number(row.total_tokens || 0) }));
    },
    // AI dashboard's Costs & Usage tab (daily-by-engine chart) - the per-user counterpart to
    // aggregateByProviderAndDay() above (that one is global/admin-only). Same day-grouping,
    // scoped to one real user's own rows, same convention as summaryForUser().
    async aggregateByProviderAndDayForUser(userId, { since } = {}) {
      const params = [userId];
      let text = "SELECT provider, date_trunc('day', created_at) AS day, SUM(COALESCE(total_tokens,0)) AS total_tokens FROM ai_usage_events WHERE user_id=$1";
      if (since) { params.push(since); text += ` AND created_at >= $${params.length}`; }
      text += ' GROUP BY provider, day ORDER BY day ASC';
      const { rows } = await pool.query(text, params);
      return rows.map((row) => ({ provider: row.provider, day: row.day, totalTokens: Number(row.total_tokens || 0) }));
    },
    async aggregateByUser() {
      const { rows } = await pool.query('SELECT user_id, SUM(COALESCE(total_tokens,0)) AS total FROM ai_usage_events WHERE user_id IS NOT NULL GROUP BY user_id');
      const result = {};
      rows.forEach((row) => { result[row.user_id] = Number(row.total || 0); });
      return result;
    },
    async aggregateByProviderForMonth(monthKey) {
      const { rows } = await pool.query(
        `SELECT provider, SUM(COALESCE(prompt_tokens,0)) AS prompt_tokens, SUM(COALESCE(completion_tokens,0)) AS completion_tokens, SUM(COALESCE(total_tokens,0)) AS total_tokens
         FROM ai_usage_events WHERE to_char(created_at, 'YYYY-MM') = $1 GROUP BY provider`,
        [monthKey]
      );
      return rows.map((row) => ({ provider: row.provider, promptTokens: Number(row.prompt_tokens || 0), completionTokens: Number(row.completion_tokens || 0), totalTokens: Number(row.total_tokens || 0) }));
    },
    // Section 7.16 follow-up: per-user AND per-provider (not just one lifetime total per user),
    // for the Admin Users tab's per-user detail view.
    async aggregateByUserAndProvider(userId) {
      const { rows } = await pool.query(
        'SELECT provider, SUM(COALESCE(total_tokens,0)) AS total FROM ai_usage_events WHERE user_id=$1 GROUP BY provider',
        [userId]
      );
      return rows.map((row) => ({ provider: row.provider, totalTokens: Number(row.total || 0) }));
    },
    // Phase 8c of the local-first-to-server-authoritative migration (see ARCHITECTURE.md's Known
    // Constraints section) - the user-facing counterpart to the admin-only aggregates above,
    // scoped to one real user's own ai_usage_events rows (the same table reportToServer() in
    // ai-usage-store.js already writes to on every real call - this is a read-side reconciliation,
    // never a second usage ledger). `todayKey`/`monthKey` are returned alongside their own bucket
    // so the client can detect a day/month rollover that happened while its tab stayed open and
    // treat a stale key as "no data" rather than silently misattributing yesterday's totals to
    // today - see ai-usage-store.js's own baseline() for the client-side half of that guard.
    async summaryForUser(userId) {
      const todayKey = new Date().toISOString().slice(0, 10);
      const monthKey = new Date().toISOString().slice(0, 7);
      function toBucket(rows) {
        const bucket = { promptTokens: 0, completionTokens: 0, totalTokens: 0, byProvider: {} };
        rows.forEach((row) => {
          const promptTokens = Number(row.prompt_tokens || 0), completionTokens = Number(row.completion_tokens || 0), totalTokens = Number(row.total_tokens || 0), calls = Number(row.calls || 0);
          bucket.promptTokens += promptTokens; bucket.completionTokens += completionTokens; bucket.totalTokens += totalTokens;
          bucket.byProvider[row.provider] = { promptTokens, completionTokens, totalTokens, calls };
        });
        return bucket;
      }
      const AGG = "provider, SUM(COALESCE(prompt_tokens,0)) AS prompt_tokens, SUM(COALESCE(completion_tokens,0)) AS completion_tokens, SUM(COALESCE(total_tokens,0)) AS total_tokens, COUNT(*) AS calls";
      const [todayRows, monthRows, lifetimeRows] = await Promise.all([
        pool.query(`SELECT ${AGG} FROM ai_usage_events WHERE user_id=$1 AND created_at >= $2::date GROUP BY provider`, [userId, todayKey]),
        pool.query(`SELECT ${AGG} FROM ai_usage_events WHERE user_id=$1 AND to_char(created_at, 'YYYY-MM')=$2 GROUP BY provider`, [userId, monthKey]),
        pool.query(`SELECT ${AGG} FROM ai_usage_events WHERE user_id=$1 GROUP BY provider`, [userId])
      ]);
      return {
        todayKey, today: toBucket(todayRows.rows),
        monthKey, thisMonth: toBucket(monthRows.rows),
        lifetime: toBucket(lifetimeRows.rows)
      };
    },
    // AI Cost Control's exact internal reconciliation domain: every gateway-origin usage event
    // that was actually billed (carries a linked_ledger_idempotency_key, meaning a wallet
    // reservation existed for it) in a UTC range - the set this reconciliation checks against
    // wallet_ledger's matching AI_SETTLEMENT rows (see server/commercial/reconciliation-service.mjs).
    // Paginated - this table can grow large in production.
    async listBilledInRange({ start, end, limit = 200, offset = 0 } = {}) {
      const { rows } = await pool.query(
        `SELECT * FROM ai_usage_events
         WHERE origin='gateway' AND linked_ledger_idempotency_key IS NOT NULL AND created_at >= $1 AND created_at < $2
         ORDER BY created_at ASC LIMIT $3 OFFSET $4`,
        [start, end, limit, offset]
      );
      return rows.map(mapUsageEvent);
    },
    async countBilledInRange({ start, end } = {}) {
      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS count FROM ai_usage_events
         WHERE origin='gateway' AND linked_ledger_idempotency_key IS NOT NULL AND created_at >= $1 AND created_at < $2`,
        [start, end]
      );
      return rows[0].count;
    },
    // Non-billable/excluded rows for the same range - reported as a transparency count in the
    // reconciliation panel (never silently dropped from the picture), never compared for
    // amount/provider/model mismatch since they were never billed in the first place.
    async countExcludedInRange({ start, end } = {}) {
      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS count FROM ai_usage_events
         WHERE created_at >= $1 AND created_at < $2 AND NOT (origin='gateway' AND linked_ledger_idempotency_key IS NOT NULL)`,
        [start, end]
      );
      return rows[0].count;
    },
    // Model-level breakdown for the AI Cost Control model table, including the new cache/reasoning
    // dimensions - a superset of aggregateByModel() above (which stays unchanged for its own
    // existing callers), scoped by an explicit UTC range required.
    async aggregateByModelInRange({ start, end }) {
      const { rows } = await pool.query(
        `SELECT provider, model, COUNT(*) AS calls,
                SUM(COALESCE(prompt_tokens,0)) AS prompt_tokens, SUM(COALESCE(completion_tokens,0)) AS completion_tokens,
                SUM(COALESCE(total_tokens,0)) AS total_tokens, SUM(COALESCE(cached_input_tokens,0)) AS cached_input_tokens,
                SUM(COALESCE(cache_write_input_tokens,0)) AS cache_write_input_tokens, SUM(COALESCE(reasoning_tokens,0)) AS reasoning_tokens,
                SUM(COALESCE(provider_cost_micro_usd,0)) AS provider_cost_micro_usd, SUM(COALESCE(retail_charge_micro_usd,0)) AS retail_charge_micro_usd
         FROM ai_usage_events WHERE origin='gateway' AND created_at >= $1 AND created_at < $2
         GROUP BY provider, model ORDER BY provider_cost_micro_usd DESC`,
        [start, end]
      );
      return rows.map((row) => ({
        provider: row.provider, model: row.model, calls: Number(row.calls || 0),
        promptTokens: Number(row.prompt_tokens || 0), completionTokens: Number(row.completion_tokens || 0), totalTokens: Number(row.total_tokens || 0),
        cachedInputTokens: Number(row.cached_input_tokens || 0), cacheWriteInputTokens: Number(row.cache_write_input_tokens || 0), reasoningTokens: Number(row.reasoning_tokens || 0),
        providerCostMicroUsd: Number(row.provider_cost_micro_usd || 0), retailChargeMicroUsd: Number(row.retail_charge_micro_usd || 0)
      }));
    }
  };

  // Section 7.16 follow-up: append-only log of every callProvider() outcome (success or
  // failure), reported by pattern-ai-server.mjs via POST /internal/ai-health-event - see
  // 016_ai_provider_health.sql. Read-side aggregation (status derivation) lives in
  // server/admin/routes.mjs, not here.
  const providerHealth = {
    async record({ provider, ok, errorCode, latencyMs, source }) {
      const id = newId('aiHealthEvent');
      const { rows } = await pool.query(
        'INSERT INTO ai_provider_health_events (id, provider, ok, error_code, latency_ms, source) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
        [id, String(provider || 'unknown'), Boolean(ok), errorCode || null, latencyMs == null ? null : Math.round(latencyMs), source || null]
      );
      return mapHealthEvent(rows[0]);
    },
    // One row per provider - the most recent event, whatever it was. DISTINCT ON is the
    // idiomatic Postgres way to do this in a single query (mirrors nothing else in this file
    // yet, but is the standard "latest row per group" pattern).
    async latestByProvider() {
      const { rows } = await pool.query(
        'SELECT DISTINCT ON (provider) * FROM ai_provider_health_events ORDER BY provider, created_at DESC'
      );
      const result = {};
      rows.forEach((row) => { result[row.provider] = mapHealthEvent(row); });
      return result;
    },
    async aggregateSince(sinceIso) {
      const { rows } = await pool.query(
        `SELECT provider, COUNT(*) AS calls, COUNT(*) FILTER (WHERE ok = FALSE) AS failures, AVG(latency_ms) AS avg_latency_ms
         FROM ai_provider_health_events WHERE created_at >= $1 GROUP BY provider`,
        [sinceIso]
      );
      return rows.map((row) => ({
        provider: row.provider, calls: Number(row.calls || 0), failures: Number(row.failures || 0),
        avgLatencyMs: row.avg_latency_ms == null ? null : Number(row.avg_latency_ms)
      }));
    },
    async recent({ limit } = {}) {
      const { rows } = await pool.query('SELECT * FROM ai_provider_health_events ORDER BY created_at DESC LIMIT $1', [limit || 50]);
      return rows.map(mapHealthEvent);
    }
  };

  const providerPricing = {
    async upsert({ provider, promptPricePer1k, completionPricePer1k, monthlyTokenBudget }) {
      const { rows } = await pool.query(
        `INSERT INTO provider_pricing (provider, prompt_price_per_1k, completion_price_per_1k, monthly_token_budget, updated_at)
         VALUES ($1,$2,$3,$4,now())
         ON CONFLICT (provider) DO UPDATE SET prompt_price_per_1k=$2, completion_price_per_1k=$3, monthly_token_budget=$4, updated_at=now()
         RETURNING *`,
        [provider, promptPricePer1k ?? null, completionPricePer1k ?? null, monthlyTokenBudget ?? null]
      );
      return mapProviderPricing(rows[0]);
    },
    async get(provider) {
      const { rows } = await pool.query('SELECT * FROM provider_pricing WHERE provider=$1', [provider]);
      return rows[0] ? mapProviderPricing(rows[0]) : null;
    },
    async list() {
      const { rows } = await pool.query('SELECT * FROM provider_pricing');
      return rows.map(mapProviderPricing);
    }
  };

  const adminKeys = {
    async upsert({ provider, apiKey, updatedBy }) {
      const trimmed = String(apiKey || '').trim();
      if (!trimmed) throw new ApiError(400, 'VALIDATION_FAILED');
      const { rows } = await pool.query(
        `INSERT INTO admin_ai_keys (provider, api_key, updated_by, updated_at) VALUES ($1,$2,$3,now())
         ON CONFLICT (provider) DO UPDATE SET api_key=$2, updated_by=$3, updated_at=now()
         RETURNING *`,
        [provider, trimmed, updatedBy || null]
      );
      return mapAdminKey(rows[0]);
    },
    async list() {
      const { rows } = await pool.query('SELECT * FROM admin_ai_keys');
      return rows.map(mapAdminKey);
    },
    async get(provider) {
      const { rows } = await pool.query('SELECT * FROM admin_ai_keys WHERE provider=$1', [provider]);
      return rows[0] ? mapAdminKey(rows[0]) : null;
    }
  };

  const auditLog = {
    async create({ adminUserId, action, targetType, targetId, details }) {
      const id = newId('auditLog');
      const { rows } = await pool.query(
        'INSERT INTO admin_audit_log (id, admin_user_id, action, target_type, target_id, details) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
        [id, adminUserId || null, String(action || ''), targetType || null, targetId || null, JSON.stringify(details ?? null)]
      );
      return mapAuditLog(rows[0]);
    },
    async list({ limit } = {}) {
      const { rows } = await pool.query('SELECT * FROM admin_audit_log ORDER BY created_at DESC LIMIT $1', [limit || 50]);
      return rows.map(mapAuditLog);
    }
  };

  // Admin-managed, encrypted ElevenLabs voice-provider credentials (023_voice_providers.sql) -
  // see that migration's own header comment for why this is a separate domain from adminKeys.
  const voiceProviderCredentials = {
    async create({ provider, label, apiKey, updatedBy }) {
      const trimmed = sanitizeApiKey(apiKey);
      if (!trimmed) throw new ApiError(400, 'VALIDATION_FAILED');
      const id = newId('voiceCred');
      const encrypted = encryptSecret(trimmed, encryptionKeyHex());
      const { rows } = await pool.query(
        `INSERT INTO admin_voice_provider_credentials (id, provider, label, api_key_encrypted, key_hint, updated_by, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,now(),now()) RETURNING *`,
        [id, provider || 'elevenlabs', String(label || '').trim() || 'Untitled profile', encrypted, voiceKeyHintFor(trimmed), updatedBy || null]
      );
      return mapVoiceCredential(rows[0]);
    },
    // A blank/omitted apiKey retains the existing encrypted value untouched - only ever
    // re-encrypts and re-hints when a real new key is actually supplied (mission requirement:
    // "a blank key during a normal configuration update must retain the current key"). Any real
    // key replacement resets validation_status back to 'unknown' - the OLD key's validation result
    // must never be presented as if it verified the NEW one.
    async replace(id, { label, apiKey, enabled, updatedBy }) {
      const trimmed = apiKey != null ? sanitizeApiKey(apiKey) : '';
      const sets = ['updated_at = now()', 'updated_by = $2'];
      const values = [id, updatedBy || null];
      let idx = 3;
      if (label != null) { sets.push(`label = $${idx}`); values.push(String(label).trim() || 'Untitled profile'); idx += 1; }
      if (enabled != null) { sets.push(`enabled = $${idx}`); values.push(Boolean(enabled)); idx += 1; }
      if (trimmed) {
        sets.push(`api_key_encrypted = $${idx}`); values.push(encryptSecret(trimmed, encryptionKeyHex())); idx += 1;
        sets.push(`key_hint = $${idx}`); values.push(voiceKeyHintFor(trimmed)); idx += 1;
        sets.push("validation_status = 'unknown'", 'validation_error = NULL', 'validated_at = NULL');
      }
      const { rows } = await pool.query(`UPDATE admin_voice_provider_credentials SET ${sets.join(', ')} WHERE id = $1 RETURNING *`, values);
      if (!rows[0]) throw new ApiError(404, 'CREDENTIAL_NOT_FOUND');
      return mapVoiceCredential(rows[0]);
    },
    async recordValidation(id, { status, error }) {
      const { rows } = await pool.query(
        `UPDATE admin_voice_provider_credentials SET validation_status=$2, validation_error=$3, validated_at=now(), updated_at=now() WHERE id=$1 RETURNING *`,
        [id, status, error || null]
      );
      return rows[0] ? mapVoiceCredential(rows[0]) : null;
    },
    // Explicit, separate action from replace() (mission: "key deletion must be an explicit
    // separate action") - never implied by an empty-string PATCH. Detaches (never cascades to
    // delete) any language config still pointing at this credential, so a language's own
    // enabled/voice/model choice survives; it simply loses its credential until an admin picks a
    // new one, and falls back per the documented runtime precedence in the meantime.
    async delete(id) {
      await pool.query('UPDATE admin_voice_language_configs SET credential_id = NULL WHERE credential_id = $1', [id]);
      await pool.query('UPDATE admin_voice_character_configs SET credential_id = NULL WHERE credential_id = $1', [id]);
      const { rowCount } = await pool.query('DELETE FROM admin_voice_provider_credentials WHERE id = $1', [id]);
      return rowCount > 0;
    },
    async list() {
      const { rows } = await pool.query('SELECT * FROM admin_voice_provider_credentials ORDER BY created_at ASC');
      return rows.map((row) => mapVoiceCredential(row));
    },
    // includeDecrypted must NEVER be set true by any admin/browser-facing route - only the
    // internal-service bridge (server/community/routes.internal.mjs) is allowed to pass it.
    async get(id, { includeDecrypted } = {}) {
      const { rows } = await pool.query('SELECT * FROM admin_voice_provider_credentials WHERE id = $1', [id]);
      return rows[0] ? mapVoiceCredential(rows[0], { includeDecrypted }) : null;
    }
  };

  const voiceLanguageConfigs = {
    async list() {
      const { rows } = await pool.query('SELECT * FROM admin_voice_language_configs ORDER BY language_code ASC');
      return rows.map(mapVoiceLanguageConfig);
    },
    async get(languageCode) {
      const { rows } = await pool.query('SELECT * FROM admin_voice_language_configs WHERE language_code = $1', [languageCode]);
      return rows[0] ? mapVoiceLanguageConfig(rows[0]) : null;
    },
    async upsert({ languageCode, provider, credentialId, voiceId, modelId, enabled, voiceSettings, fallbackProvider, fallbackVoice, updatedBy }) {
      const { rows } = await pool.query(
        `INSERT INTO admin_voice_language_configs
           (language_code, provider, credential_id, voice_id, model_id, enabled, voice_settings, fallback_provider, fallback_voice, updated_by, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now(),now())
         ON CONFLICT (language_code) DO UPDATE SET
           provider=$2, credential_id=$3, voice_id=$4, model_id=$5, enabled=$6, voice_settings=$7,
           fallback_provider=$8, fallback_voice=$9, updated_by=$10, updated_at=now()
         RETURNING *`,
        [languageCode, provider || 'elevenlabs', credentialId || null, voiceId || null, modelId || null,
          Boolean(enabled), JSON.stringify(voiceSettings || {}), fallbackProvider || 'openai', fallbackVoice || null, updatedBy || null]
      );
      return mapVoiceLanguageConfig(rows[0]);
    }
  };

  // Per-character, per-gender voice routing (024_voice_character_gender.sql) - the mechanism the
  // live Voice Mode actually resolves against; voiceLanguageConfigs above is left functional but
  // unused by the runtime/admin UI going forward. character is one of the 4 fixed app skins
  // ('hunter'|'commander'|'engineer'|'sage' - navrya-src/characters.js), gender is 'male'|'female'.
  const voiceCharacterConfigs = {
    async list() {
      const { rows } = await pool.query('SELECT * FROM admin_voice_character_configs ORDER BY character ASC, gender ASC');
      return rows.map(mapVoiceCharacterConfig);
    },
    async get(character, gender) {
      const { rows } = await pool.query('SELECT * FROM admin_voice_character_configs WHERE character = $1 AND gender = $2', [character, gender]);
      return rows[0] ? mapVoiceCharacterConfig(rows[0]) : null;
    },
    async upsert({ character, gender, provider, credentialId, voiceId, modelId, enabled, voiceSettings, fallbackProvider, fallbackVoice, updatedBy }) {
      const { rows } = await pool.query(
        `INSERT INTO admin_voice_character_configs
           (character, gender, provider, credential_id, voice_id, model_id, enabled, voice_settings, fallback_provider, fallback_voice, updated_by, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now(),now())
         ON CONFLICT (character, gender) DO UPDATE SET
           provider=$3, credential_id=$4, voice_id=$5, model_id=$6, enabled=$7, voice_settings=$8,
           fallback_provider=$9, fallback_voice=$10, updated_by=$11, updated_at=now()
         RETURNING *`,
        [character, gender, provider || 'elevenlabs', credentialId || null, voiceId || null, modelId || null,
          Boolean(enabled), JSON.stringify(voiceSettings || {}), fallbackProvider || 'openai', fallbackVoice || null, updatedBy || null]
      );
      return mapVoiceCharacterConfig(rows[0]);
    }
  };

  // Real TTS usage/events - deliberately never written into the LLM usage_events/token tables
  // (mission: "a separate TTS usage/event table rather than writing characters into LLM token
  // tables" - ElevenLabs bills in characters, an entirely different unit and cost model).
  const voiceTtsUsage = {
    async record({ languageCode, provider, credentialId, source, characters, characterCost, success, errorCode, latencyMs }) {
      const id = newId('voiceTts');
      const { rows } = await pool.query(
        `INSERT INTO voice_tts_usage_events (id, language_code, provider, credential_id, source, characters, character_cost, success, error_code, latency_ms, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now()) RETURNING *`,
        [id, languageCode, provider, credentialId || null, source, Math.max(0, Math.round(Number(characters) || 0)),
          characterCost == null ? null : Math.round(Number(characterCost)), Boolean(success), errorCode || null,
          latencyMs == null ? null : Math.round(Number(latencyMs))]
      );
      return mapVoiceTtsUsageEvent(rows[0]);
    },
    async aggregateByLanguage({ since } = {}) {
      const { rows } = await pool.query(
        `SELECT language_code,
                COUNT(*)::int AS request_count,
                COALESCE(SUM(characters),0)::int AS total_characters,
                COALESCE(SUM(CASE WHEN success THEN 1 ELSE 0 END),0)::int AS success_count,
                COALESCE(AVG(latency_ms),0)::float AS avg_latency_ms,
                MAX(CASE WHEN success THEN created_at END) AS last_success_at,
                MAX(CASE WHEN NOT success THEN error_code END) AS last_error_code
         FROM voice_tts_usage_events WHERE created_at >= $1 GROUP BY language_code`,
        [since || new Date(0).toISOString()]
      );
      return rows.map((row) => ({
        languageCode: row.language_code, requestCount: row.request_count, totalCharacters: row.total_characters,
        successCount: row.success_count,
        successRatePercent: row.request_count > 0 ? Math.round((row.success_count / row.request_count) * 100) : null,
        avgLatencyMs: Math.round(row.avg_latency_ms), lastSuccessAt: row.last_success_at, lastErrorCode: row.last_error_code
      }));
    },
    async recent({ limit } = {}) {
      const { rows } = await pool.query('SELECT * FROM voice_tts_usage_events ORDER BY created_at DESC LIMIT $1', [limit || 50]);
      return rows.map(mapVoiceTtsUsageEvent);
    }
  };

  const xpEvents = {
    // Records the event AND bumps users.xp_total in the same transaction, so xp_total is
    // always a maintained running total (never recomputed by summing every read) - the exact
    // convention marketplace_listings.sample_size already uses. A dedupe_key collision (a
    // unique-violation on user_xp_events_dedupe_idx) is the expected happy path for a client
    // re-sending the same dedupe key after a reload - it rolls back cleanly and reports
    // {duplicate:true} instead of throwing, so xp_total is never double-incremented.
    async record({ userId, type, domain, points, sourceType, sourceId, dedupeKey, meta }) {
      const id = newId('xpEvent');
      const pointsValue = Math.round(Number(points) || 0);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        let rows;
        try {
          ({ rows } = await client.query(
            `INSERT INTO user_xp_events (id, user_id, type, domain, points, source_type, source_id, dedupe_key, meta)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
            [id, userId, String(type || ''), domain || null, pointsValue, sourceType || null, sourceId || null,
              dedupeKey || null, JSON.stringify(meta || {})]
          ));
        } catch (error) {
          if (error && error.code === '23505') { await client.query('ROLLBACK'); return { duplicate: true }; }
          throw error;
        }
        const { rows: userRows } = await client.query('UPDATE users SET xp_total = xp_total + $2 WHERE id=$1 RETURNING *', [userId, pointsValue]);
        await client.query('COMMIT');
        return { event: mapXpEvent(rows[0]), user: mapUser(userRows[0]) };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    async listForUser(userId) {
      const { rows } = await pool.query('SELECT * FROM user_xp_events WHERE user_id=$1 ORDER BY occurred_at DESC', [userId]);
      return rows.map(mapXpEvent);
    },
    async totalForUser(userId) {
      const user = await users.get(userId);
      return user ? user.xpTotal : 0;
    },
    // Backs the ONCE_PER_USER_TYPES check in routes.profile.mjs - has this user already been
    // awarded this one-time event type (e.g. 'intake_completed')?
    async hasType(userId, type) {
      const { rows } = await pool.query('SELECT 1 FROM user_xp_events WHERE user_id=$1 AND type=$2 LIMIT 1', [userId, type]);
      return rows.length > 0;
    },
    // Backs PER_SOURCE_MAX (e.g. "at most 3 chart-entry awards per session") - sourceId here is
    // the grouping key (a session/pattern/strategy/trade id), independent of each event's own
    // unique dedupeKey.
    async countForSource(userId, type, sourceId) {
      const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM user_xp_events WHERE user_id=$1 AND type=$2 AND source_id=$3', [userId, type, sourceId]);
      return rows[0].n;
    },
    // Backs PER_TYPE_PERIOD_CAP - periodStart is a Date computed by the caller (start of today/week).
    async countForPeriod(userId, type, periodStart) {
      const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM user_xp_events WHERE user_id=$1 AND type=$2 AND occurred_at >= $3', [userId, type, periodStart]);
      return rows[0].n;
    },
    // Backs DOMAIN_DAILY_CAP - UTC calendar day, documented simplification (same spirit as the
    // app's existing UTC-based trading-session-detection known constraint).
    async domainTotalToday(userId, domain) {
      const { rows } = await pool.query(
        "SELECT COALESCE(SUM(points),0)::int AS n FROM user_xp_events WHERE user_id=$1 AND domain=$2 AND occurred_at >= date_trunc('day', now())",
        [userId, domain]
      );
      return rows[0].n;
    },
    // Backs RECURRING_DAILY_CAP_TOTAL - only counts domain-tagged, non-once-per-user events:
    // achievement/streak awards are recorded with domain=null (they have their own, separate
    // one-time/period-scoped dedupe and must never count against this cap), and onceTypes
    // (profile/walkthrough/first-of-kind bonuses) are one-time by design, never "recurring".
    async recurringTotalToday(userId, onceTypes) {
      const { rows } = await pool.query(
        "SELECT COALESCE(SUM(points),0)::int AS n FROM user_xp_events WHERE user_id=$1 AND occurred_at >= date_trunc('day', now()) AND domain IS NOT NULL AND NOT (type = ANY($2))",
        [userId, onceTypes || []]
      );
      return rows[0].n;
    },
    // Backs SOURCE_TOTAL_CAP - running sum of every event tagged to one sourceType+sourceId
    // (e.g. every trade_* event tagged to one tradeId), so a new award can be clamped to
    // whatever headroom remains under the ceiling.
    async sourceTotal(userId, sourceType, sourceId) {
      const { rows } = await pool.query('SELECT COALESCE(SUM(points),0)::int AS n FROM user_xp_events WHERE user_id=$1 AND source_type=$2 AND source_id=$3', [userId, sourceType, sourceId]);
      return rows[0].n;
    },
    // Feeds mastery-gate domain-balance checks (ARCHITECTURE.md Section 11.13/11.18).
    async domainBreakdown(userId) {
      const { rows } = await pool.query('SELECT domain, COALESCE(SUM(points),0)::int AS n FROM user_xp_events WHERE user_id=$1 AND domain IS NOT NULL GROUP BY domain', [userId]);
      const out = { session: 0, pattern: 0, strategy: 0, trade: 0, psychology: 0, community: 0 };
      rows.forEach((row) => { if (row.domain in out) out[row.domain] = row.n; });
      return out;
    },
    // Distinct UTC calendar days with at least one XP event of an eligible "useful activity"
    // type - backs streak-milestone checks (ARCHITECTURE.md Section 11.12).
    async usefulActivityDays(userId, eligibleTypes) {
      const { rows } = await pool.query(
        "SELECT DISTINCT date_trunc('day', occurred_at) AS d FROM user_xp_events WHERE user_id=$1 AND type = ANY($2) ORDER BY d DESC",
        [userId, eligibleTypes || []]
      );
      return rows.map((row) => row.d);
    },
    // Feeds mastery-gate snapshot building (server/community/mastery-rules.mjs).
    async countByType(userId, type) {
      const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM user_xp_events WHERE user_id=$1 AND type=$2', [userId, type]);
      return rows[0].n;
    },
    // Per-sourceId event counts for one type (e.g. how many pattern_outcome_recorded events
    // each individual pattern has) - the mastery layer decides what threshold counts as "valid".
    async sourceCountsForType(userId, type) {
      const { rows } = await pool.query(
        'SELECT source_id, COUNT(*)::int AS n FROM user_xp_events WHERE user_id=$1 AND type=$2 AND source_id IS NOT NULL GROUP BY source_id',
        [userId, type]
      );
      return rows.map((row) => ({ sourceId: row.source_id, count: row.n }));
    },
    // sourceIds that have at least one event for EVERY type in `types` (e.g. a strategy that has
    // completed all three of position/risk/overall-framework).
    async sourceIdsWithAllTypes(userId, types) {
      if (!types || !types.length) return [];
      const { rows } = await pool.query(
        'SELECT source_id FROM user_xp_events WHERE user_id=$1 AND type = ANY($2) AND source_id IS NOT NULL GROUP BY source_id HAVING COUNT(DISTINCT type) = $3',
        [userId, types, types.length]
      );
      return rows.map((row) => row.source_id);
    }
  };

  const achievements = {
    // Idempotent: a repeat unlock attempt for the same (user, key) is a no-op backed by the
    // UNIQUE(user_id, achievement_key) constraint, translated the same way ALREADY_PURCHASED
    // already is elsewhere in this file (catch pg error code '23505').
    async unlock({ userId, achievementKey, evidence }) {
      const id = newId('achievement');
      try {
        const { rows } = await pool.query(
          'INSERT INTO user_achievements (id, user_id, achievement_key, evidence) VALUES ($1,$2,$3,$4) RETURNING *',
          [id, userId, String(achievementKey || ''), JSON.stringify(evidence || {})]
        );
        return { achievement: mapAchievement(rows[0]), created: true };
      } catch (error) {
        if (error && error.code === '23505') {
          const { rows } = await pool.query('SELECT * FROM user_achievements WHERE user_id=$1 AND achievement_key=$2', [userId, achievementKey]);
          return { achievement: mapAchievement(rows[0]), created: false };
        }
        throw error;
      }
    },
    async listForUser(userId) {
      const { rows } = await pool.query('SELECT * FROM user_achievements WHERE user_id=$1 ORDER BY unlocked_at DESC', [userId]);
      return rows.map(mapAchievement);
    }
  };

  // Admin-editable XP configuration (Admin Panel "XP & Segmentation" tab, Section 11 XP engine).
  // Same natural-key upsert-by-PK shape as providerPricing/adminKeys above, generic over a JSONB
  // value since different config_key namespaces (points:/domainCap:/sourceCap:/periodCap:/
  // recurringCap/achievementPoints:/mastery:) have different shapes - see 012_xp_config_overrides.sql.
  const xpConfig = {
    async list() {
      const { rows } = await pool.query('SELECT * FROM xp_config_overrides ORDER BY config_key ASC');
      return rows.map(mapXpConfigOverride);
    },
    async set(configKey, value, updatedBy) {
      const { rows } = await pool.query(
        `INSERT INTO xp_config_overrides (config_key, value, updated_by, updated_at) VALUES ($1,$2,$3,now())
         ON CONFLICT (config_key) DO UPDATE SET value=$2, updated_by=$3, updated_at=now()
         RETURNING *`,
        [String(configKey || ''), JSON.stringify(value ?? null), updatedBy || null]
      );
      return mapXpConfigOverride(rows[0]);
    },
    async remove(configKey) {
      await pool.query('DELETE FROM xp_config_overrides WHERE config_key=$1', [String(configKey || '')]);
    }
  };

  // Joins the three child tables back onto their parent sessions and reassembles the nested
  // shape - a handful of separate queries (not one giant array_agg JOIN) since this only ever
  // runs on the background sync path, never the interactive one.
  async function attachChildren(sessionRows) {
    if (!sessionRows.length) return [];
    const ids = sessionRows.map((row) => row.id);
    const { rows: entryRows } = await pool.query('SELECT * FROM trading_session_entries WHERE session_id = ANY($1) ORDER BY created_at ASC', [ids]);
    const { rows: scenarioRows } = await pool.query('SELECT * FROM trading_session_scenarios WHERE session_id = ANY($1)', [ids]);
    const { rows: logRows } = await pool.query('SELECT * FROM trading_session_activity_log WHERE session_id = ANY($1) ORDER BY logged_at ASC', [ids]);
    const scenariosByEntry = new Map();
    scenarioRows.forEach((row) => {
      if (!scenariosByEntry.has(row.entry_id)) scenariosByEntry.set(row.entry_id, []);
      scenariosByEntry.get(row.entry_id).push(mapTradingSessionScenario(row));
    });
    const entriesBySession = new Map();
    entryRows.forEach((row) => {
      if (!entriesBySession.has(row.session_id)) entriesBySession.set(row.session_id, []);
      entriesBySession.get(row.session_id).push(mapTradingSessionEntry(row, scenariosByEntry.get(row.id) || []));
    });
    const logsBySession = new Map();
    logRows.forEach((row) => {
      if (!logsBySession.has(row.session_id)) logsBySession.set(row.session_id, []);
      logsBySession.get(row.session_id).push(mapActivityLogItem(row));
    });
    return sessionRows.map((row) => mapTradingSession(row, entriesBySession.get(row.id) || [], logsBySession.get(row.id) || []));
  }

  // Module 1 of the local-first-to-server migration. Named tradingSessions (table
  // trading_sessions), never sessions/user_sessions - that name is already the admin
  // heartbeat/presence domain above (repo.sessions); an unrelated concept that happens to
  // share the English word. Scoped by user_id alone, not (user_id, character) - see the
  // migration file's comment for the reasoning (mirrors session-signature-store.js's existing
  // cross-character treatment).
  const tradingSessions = {
    // Upsert always replaces every child row wholesale (delete-then-reinsert) rather than
    // diffing the incoming entries[]/scenarios[] against what's stored - the array can freely
    // add/remove/reorder between syncs, and this is a background write, never the interactive
    // save path, so the extra round-trip costs nothing a user would notice.
    async upsert(userId, record) {
      if (!record || !record.id) throw new ApiError(400, 'VALIDATION_FAILED');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows: ownerRows } = await client.query('SELECT user_id, account_id FROM trading_sessions WHERE id=$1', [record.id]);
        if (ownerRows[0] && ownerRows[0].user_id !== userId) throw new ApiError(403, 'NOT_SESSION_OWNER');

        // Defect #5: a session's accountId is additive and optional (never mandatory the way a
        // trade's is - see 022_sessions_accounts.sql's comment), but when one IS supplied it must
        // still resolve to a real account this same user owns, and an archived account can never
        // be a NEW assignment (defect #3 - "never selectable for ... session"), mirroring the
        // trades.upsert() checks above field-for-field.
        if (record.accountId) {
          const { rows: accountOwnerRows } = await client.query('SELECT user_id, status FROM accounts WHERE id=$1', [record.accountId]);
          if (!accountOwnerRows[0] || accountOwnerRows[0].user_id !== userId) throw new ApiError(403, 'NOT_ACCOUNT_OWNER');
          const isNewAssignment = !ownerRows[0] || ownerRows[0].account_id !== record.accountId;
          if (isNewAssignment && accountOwnerRows[0].status === 'archived') throw new ApiError(403, 'ACCOUNT_ARCHIVED');
        }

        // Instrument Catalog domain (025_instrument_catalog.sql): mandatory for a brand-new
        // session only (`!ownerRows[0]`, the same gate trades.upsert()'s ACCOUNT_REQUIRED check
        // already uses) - never retroactively forced onto a pre-existing NULL row from before
        // this migration. A supplied instrument must already be in this user's catalog (fail
        // closed, no silent alias guessing).
        const instrument = normalizeInstrumentCode(record.instrument);
        if (!ownerRows[0] && !instrument) throw new ApiError(400, 'INSTRUMENT_REQUIRED');
        if (instrument) await assertInstrumentInCatalog(client, userId, instrument);

        const startedAt = record.startedAt ? new Date(record.startedAt).toISOString() : null;
        const closedAt = record.closedAt ? new Date(record.closedAt).toISOString() : null;
        const { rows: sessionRows } = await client.query(
          `INSERT INTO trading_sessions
            (id, user_id, character, name, market, timeframe, date, jalali, started_at, closed_at, status,
             update_interval_minutes, grace_period_minutes, fate_summary, previous_session_summary,
             ai_session_analysis, ai_session_analysis_result, final_entry_id, account_id, instrument, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9,now()),$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,now())
           ON CONFLICT (id) DO UPDATE SET
             character=$3, name=$4, market=$5, timeframe=$6, date=$7, jalali=$8,
             started_at=COALESCE($9, trading_sessions.started_at), closed_at=$10, status=$11,
             update_interval_minutes=$12, grace_period_minutes=$13, fate_summary=$14, previous_session_summary=$15,
             ai_session_analysis=$16, ai_session_analysis_result=$17, final_entry_id=$18, account_id=$19, instrument=$20, updated_at=now()
           RETURNING *`,
          // market is NOT NULL (006_trading_sessions.sql) - a bare `|| null` here is what a real
          // NOT-NULL constraint violation looks like the moment any caller sends an empty/missing
          // market, same defense-in-depth reasoning as normalizeTradingEntryType() above.
          // instrument, unlike market, is nullable and never defaulted (see the migration's
          // comment) - an update to a pre-existing row that still has no instrument keeps it null.
          [record.id, userId, String(record.character || 'hunter'), record.name || null, record.market || 'London',
            record.timeframe || null, record.date || null, record.jalali || null, startedAt, closedAt,
            record.status === 'closed' ? 'closed' : 'open', Number(record.updateIntervalMinutes) || 30,
            Number(record.gracePeriodMinutes) || 5, JSON.stringify(record.fateSummary ?? null),
            JSON.stringify(record.previousSessionSummary ?? null), record.aiSessionAnalysis || null,
            JSON.stringify(record.aiSessionAnalysisResult ?? null), record.finalEntryId || null, record.accountId || null,
            instrument]
        );

        await client.query('DELETE FROM trading_session_entries WHERE session_id=$1', [record.id]);
        const entries = Array.isArray(record.entries) ? record.entries : [];
        const mappedEntries = [];
        for (const entry of entries) {
          const { rows: entryRows } = await client.query(
            `INSERT INTO trading_session_entries
              (id, session_id, type, created_at, has_image, image_blob_id, image_url, timeframe, market,
               trading_session, gregorian_date, note, movement_note, related_scenario_ids, ai_analysis_result)
             VALUES ($1,$2,$3,COALESCE($4,now()),$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
             RETURNING *`,
            [entry.id, record.id, normalizeTradingEntryType(entry.type), entry.createdAt ? new Date(entry.createdAt).toISOString() : null,
              !!entry.hasImage, entry.imageBlobId || null, entry.imageUrl || null, entry.timeframe || null,
              entry.market || null, entry.tradingSession || null, entry.gregorianDate || null, entry.note || null,
              entry.movementNote || null, JSON.stringify(Array.isArray(entry.relatedScenarioIds) ? entry.relatedScenarioIds : []),
              JSON.stringify(entry.aiAnalysisResult ?? null)]
          );
          const scenarios = Array.isArray(entry.scenarios) ? entry.scenarios : [];
          const mappedScenarios = [];
          for (const scenario of scenarios) {
            const { rows: scenarioRows } = await client.query(
              `INSERT INTO trading_session_scenarios
                (id, entry_id, session_id, title, description, evidence, trigger_text, occurred, pattern_tag_id,
                 completion_percent, probability_history, pattern, execution_plan, problem, invalidation_note, invalidation_tag_ids,
                 status, ai_source, ai_visualization, last_evaluation)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
               RETURNING *`,
              [scenario.id, entry.id, record.id, scenario.title || '', scenario.description || null,
                scenario.evidence || null, scenario.trigger || null, scenario.occurred === true,
                (scenario.pattern && scenario.pattern.patternTagId) || null,
                scenario.completion != null ? Number(scenario.completion) : null,
                JSON.stringify(Array.isArray(scenario.probabilityHistory) ? scenario.probabilityHistory : []),
                JSON.stringify(scenario.pattern ?? null), JSON.stringify(scenario.executionPlan ?? null),
                // 2026-08-28 bug report: real columns added (039_trading_session_scenario_gaps.sql) -
                // see mapTradingSessionScenario()'s own comment above for the full history.
                scenario.problem || null, scenario.invalidationNote || null,
                JSON.stringify(Array.isArray(scenario.invalidationTagIds) ? scenario.invalidationTagIds : []),
                // Adaptive AI Session Analysis (2026-08-31 production incident fix) -
                // 045_scenario_ai_analysis_fields.sql, same "real column" fix as the three above.
                scenario.status || null, JSON.stringify(scenario.aiSource ?? null),
                JSON.stringify(scenario.aiVisualization ?? null), JSON.stringify(scenario.lastEvaluation ?? null)]
            );
            mappedScenarios.push(mapTradingSessionScenario(scenarioRows[0]));
          }
          mappedEntries.push(mapTradingSessionEntry(entryRows[0], mappedScenarios));
        }

        await client.query('DELETE FROM trading_session_activity_log WHERE session_id=$1', [record.id]);
        const activityLog = Array.isArray(record.activityLog) ? record.activityLog : [];
        const mappedActivity = [];
        for (const item of activityLog) {
          const { rows: logRows } = await client.query(
            `INSERT INTO trading_session_activity_log (id, session_id, type, detail, scenario_id, logged_at, counts_toward_loop_update)
             VALUES ($1,$2,$3,$4,$5,COALESCE($6,now()),$7) RETURNING *`,
            [item.id, record.id, item.type, item.detail || null, item.scenarioId || null,
              item.loggedAt ? new Date(item.loggedAt).toISOString() : null, item.countsTowardLoopUpdate !== false]
          );
          mappedActivity.push(mapActivityLogItem(logRows[0]));
        }

        await client.query('COMMIT');
        return mapTradingSession(sessionRows[0], mappedEntries, mappedActivity);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    async get(userId, id) {
      const { rows } = await pool.query('SELECT * FROM trading_sessions WHERE id=$1 AND user_id=$2', [id, userId]);
      if (!rows[0]) return null;
      const [full] = await attachChildren(rows);
      return full;
    },
    async listByUser(userId) {
      const { rows } = await pool.query('SELECT * FROM trading_sessions WHERE user_id=$1 ORDER BY updated_at DESC', [userId]);
      return attachChildren(rows);
    },
    async remove(userId, id) {
      const { rows } = await pool.query('SELECT user_id FROM trading_sessions WHERE id=$1', [id]);
      if (!rows[0]) return;
      if (rows[0].user_id !== userId) throw new ApiError(403, 'NOT_SESSION_OWNER');
      await pool.query('DELETE FROM trading_sessions WHERE id=$1', [id]); // cascades to entries/scenarios/activity log
    },
    // Backs the XP engine's pattern_report_generated gate (5+ real samples) - real server-side
    // verification rather than trusting the client's own scenarioReport() count, made possible
    // because trading_session_scenarios.pattern_tag_id is already indexed (Section 7.18 Module 1
    // anticipated exactly this).
    async countScenariosForPattern(userId, patternId) {
      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS n FROM trading_session_scenarios s
         JOIN trading_sessions t ON t.id = s.session_id
         WHERE t.user_id=$1 AND s.pattern_tag_id=$2`,
        [userId, patternId]
      );
      return rows[0].n;
    },
    // P0-2 launch-readiness fix (server/community/security/upload-ownership.mjs's fallback tier) -
    // resolves the real owner of a chart-entry image uploaded before storage_objects existed.
    // Returns a plain userId or null, never a row shape - the one thing this call site needs.
    async findOwnerByEntryImageUrl(imageUrl) {
      const { rows } = await pool.query(
        `SELECT s.user_id FROM trading_session_entries e
         JOIN trading_sessions s ON s.id = e.session_id
         WHERE e.image_url=$1 LIMIT 1`,
        [imageUrl]
      );
      return rows[0] ? rows[0].user_id : null;
    }
  };

  async function attachPatternChildren(patternRows) {
    if (!patternRows.length) return [];
    const ids = patternRows.map((row) => row.id);
    const { rows: stageRows } = await pool.query('SELECT * FROM pattern_stages WHERE pattern_id = ANY($1) ORDER BY stage_order ASC', [ids]);
    const { rows: screenshotRows } = await pool.query('SELECT * FROM pattern_screenshots WHERE pattern_id = ANY($1) ORDER BY uploaded_at ASC', [ids]);
    const { rows: chatRows } = await pool.query('SELECT * FROM pattern_chat_messages WHERE pattern_id = ANY($1) ORDER BY created_at ASC', [ids]);
    const stagesByPattern = new Map();
    stageRows.forEach((row) => { if (!stagesByPattern.has(row.pattern_id)) stagesByPattern.set(row.pattern_id, []); stagesByPattern.get(row.pattern_id).push(mapPatternStage(row)); });
    const screenshotsByPattern = new Map();
    screenshotRows.forEach((row) => { if (!screenshotsByPattern.has(row.pattern_id)) screenshotsByPattern.set(row.pattern_id, []); screenshotsByPattern.get(row.pattern_id).push(mapPatternScreenshot(row)); });
    const chatByPattern = new Map();
    chatRows.forEach((row) => { if (!chatByPattern.has(row.pattern_id)) chatByPattern.set(row.pattern_id, []); chatByPattern.get(row.pattern_id).push(mapPatternChatMessage(row)); });
    return patternRows.map((row) => mapPattern(row, stagesByPattern.get(row.id) || [], screenshotsByPattern.get(row.id) || [], chatByPattern.get(row.id) || []));
  }

  // Module 2 of the local-first-to-server migration. Same delete-then-reinsert-children
  // approach as tradingSessions.upsert() above, for the same reason (a background write, never
  // the interactive save path, so the extra round-trip inside one transaction costs nothing a
  // user would notice, in exchange for never getting an array diff subtly wrong).
  const patterns = {
    async upsert(userId, record) {
      if (!record || !record.id) throw new ApiError(400, 'VALIDATION_FAILED');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows: ownerRows } = await client.query('SELECT user_id FROM patterns WHERE id=$1', [record.id]);
        if (ownerRows[0] && ownerRows[0].user_id !== userId) throw new ApiError(403, 'NOT_PATTERN_OWNER');

        // Instrument Catalog domain (025_instrument_catalog.sql): a brand-new pattern must
        // explicitly carry at least one instrument before it is ever persisted (no more
        // "create blank pattern, edit after" for this field specifically) - never retroactively
        // forced onto a pre-existing pattern whose instruments array is still empty/legacy.
        const instruments = normalizeInstrumentCodes(record.instruments);
        if (!ownerRows[0] && !instruments.length) throw new ApiError(400, 'PATTERN_INSTRUMENT_REQUIRED');
        if (instruments.length) await assertInstrumentInCatalog(client, userId, instruments);

        const { rows: patternRows } = await client.query(
          `INSERT INTO patterns (id, user_id, name, description, completion_threshold, usage_count, is_public, instruments, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())
           ON CONFLICT (id) DO UPDATE SET
             name=$3, description=$4, completion_threshold=$5, usage_count=$6, is_public=$7, instruments=$8, updated_at=now()
           RETURNING *`,
          [record.id, userId, record.name || '', record.description || '',
            Math.max(0, Math.min(100, Number(record.completionThreshold ?? 70))),
            Math.max(0, Number(record.usageCount || 0)), Boolean(record.isPublic), instruments]
        );

        await client.query('DELETE FROM pattern_stages WHERE pattern_id=$1', [record.id]);
        const stages = Array.isArray(record.stages) ? record.stages : [];
        const mappedStages = [];
        for (let index = 0; index < stages.length; index += 1) {
          const stage = stages[index];
          const { rows } = await client.query(
            'INSERT INTO pattern_stages (id, pattern_id, stage_order, text) VALUES ($1,$2,$3,$4) RETURNING *',
            [stage.id, record.id, Number(stage.order || index + 1), stage.text || '']
          );
          mappedStages.push(mapPatternStage(rows[0]));
        }

        await client.query('DELETE FROM pattern_screenshots WHERE pattern_id=$1', [record.id]);
        const screenshots = Array.isArray(record.referenceScreenshots) ? record.referenceScreenshots : [];
        const mappedScreenshots = [];
        for (const shot of screenshots) {
          const { rows } = await client.query(
            `INSERT INTO pattern_screenshots (id, pattern_id, file_name, blob_id, image_url, uploaded_at, note)
             VALUES ($1,$2,$3,$4,$5,COALESCE($6,now()),$7) RETURNING *`,
            [shot.id, record.id, shot.fileName || null, shot.blobId || null, shot.imageUrl || null,
              shot.uploadedAt ? new Date(shot.uploadedAt).toISOString() : null, shot.note || null]
          );
          mappedScreenshots.push(mapPatternScreenshot(rows[0]));
        }

        await client.query('DELETE FROM pattern_chat_messages WHERE pattern_id=$1', [record.id]);
        const chatHistory = Array.isArray(record.chatHistory) ? record.chatHistory : [];
        const mappedChat = [];
        for (const message of chatHistory) {
          const { rows } = await client.query(
            `INSERT INTO pattern_chat_messages (id, pattern_id, role, content, created_at, suggested_stages)
             VALUES ($1,$2,$3,$4,COALESCE($5,now()),$6) RETURNING *`,
            [message.id, record.id, message.role, message.content || '',
              message.createdAt ? new Date(message.createdAt).toISOString() : null,
              JSON.stringify(message.suggestedStages ?? null)]
          );
          mappedChat.push(mapPatternChatMessage(rows[0]));
        }

        await client.query('COMMIT');
        return mapPattern(patternRows[0], mappedStages, mappedScreenshots, mappedChat);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    async get(userId, id) {
      const { rows } = await pool.query('SELECT * FROM patterns WHERE id=$1 AND user_id=$2', [id, userId]);
      if (!rows[0]) return null;
      const [full] = await attachPatternChildren(rows);
      return full;
    },
    async listByUser(userId) {
      const { rows } = await pool.query('SELECT * FROM patterns WHERE user_id=$1 ORDER BY updated_at DESC', [userId]);
      return attachPatternChildren(rows);
    },
    async remove(userId, id) {
      const { rows } = await pool.query('SELECT user_id FROM patterns WHERE id=$1', [id]);
      if (!rows[0]) return;
      if (rows[0].user_id !== userId) throw new ApiError(403, 'NOT_PATTERN_OWNER');
      await pool.query('DELETE FROM patterns WHERE id=$1', [id]); // cascades to stages/screenshots/chat messages
    },
    // P0-2 launch-readiness fix - see tradingSessions.findOwnerByEntryImageUrl()'s own comment.
    async findOwnerByScreenshotUrl(imageUrl) {
      const { rows } = await pool.query(
        `SELECT p.user_id FROM pattern_screenshots ps
         JOIN patterns p ON p.id = ps.pattern_id
         WHERE ps.image_url=$1 LIMIT 1`,
        [imageUrl]
      );
      return rows[0] ? rows[0].user_id : null;
    }
  };

  async function attachStrategyChildren(strategyRows) {
    if (!strategyRows.length) return [];
    const ids = strategyRows.map((row) => row.id);
    const { rows: attachmentRows } = await pool.query('SELECT * FROM strategy_attachments WHERE strategy_id = ANY($1) ORDER BY uploaded_at ASC', [ids]);
    const { rows: chatRows } = await pool.query('SELECT * FROM strategy_chat_messages WHERE strategy_id = ANY($1) ORDER BY created_at ASC', [ids]);
    const { rows: eventRows } = await pool.query('SELECT * FROM strategy_detection_events WHERE strategy_id = ANY($1) ORDER BY detected_at DESC', [ids]);
    const attachmentsByStrategy = new Map();
    attachmentRows.forEach((row) => { if (!attachmentsByStrategy.has(row.strategy_id)) attachmentsByStrategy.set(row.strategy_id, []); attachmentsByStrategy.get(row.strategy_id).push(mapStrategyAttachment(row)); });
    const chatByStrategy = new Map();
    chatRows.forEach((row) => { if (!chatByStrategy.has(row.strategy_id)) chatByStrategy.set(row.strategy_id, []); chatByStrategy.get(row.strategy_id).push(mapStrategyChatMessage(row)); });
    const eventsByStrategy = new Map();
    eventRows.forEach((row) => { if (!eventsByStrategy.has(row.strategy_id)) eventsByStrategy.set(row.strategy_id, []); eventsByStrategy.get(row.strategy_id).push(mapStrategyDetectionEvent(row)); });
    return strategyRows.map((row) => mapStrategy(row, attachmentsByStrategy.get(row.id) || [], chatByStrategy.get(row.id) || [], eventsByStrategy.get(row.id) || []));
  }

  // Module 3 of the local-first-to-server migration. Same delete-then-reinsert-children
  // approach as tradingSessions/patterns above, for the same reason.
  const strategies = {
    async upsert(userId, record) {
      if (!record || !record.id) throw new ApiError(400, 'VALIDATION_FAILED');
      const pm = record.positionManagement || {}, rm = record.riskManagement || {}, of = record.overallFramework || {};
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows: ownerRows } = await client.query('SELECT user_id FROM strategies WHERE id=$1', [record.id]);
        if (ownerRows[0] && ownerRows[0].user_id !== userId) throw new ApiError(403, 'NOT_STRATEGY_OWNER');

        const { rows: strategyRows } = await client.query(
          `INSERT INTO strategies
            (id, user_id, name, active, is_public, origin, entry_rules, stop_loss_rules, exit_target_rules,
             position_sizing_rules, position_management_notes, max_risk_per_trade_percent, daily_drawdown_limit_percent,
             total_drawdown_limit_percent, max_concurrent_trades, max_profit_cap_per_trade, risk_management_notes,
             overall_framework_description, ai_understanding_summary, linked_analysis_profile_id, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,now())
           ON CONFLICT (id) DO UPDATE SET
             name=$3, active=$4, is_public=$5, origin=$6, entry_rules=$7, stop_loss_rules=$8, exit_target_rules=$9,
             position_sizing_rules=$10, position_management_notes=$11, max_risk_per_trade_percent=$12,
             daily_drawdown_limit_percent=$13, total_drawdown_limit_percent=$14, max_concurrent_trades=$15,
             max_profit_cap_per_trade=$16, risk_management_notes=$17, overall_framework_description=$18,
             ai_understanding_summary=$19, linked_analysis_profile_id=$20, updated_at=now()
           RETURNING *`,
          [record.id, userId, record.name || '', record.active !== false, Boolean(record.isPublic),
            record.origin === 'ai_from_event' ? 'ai_from_event' : 'manual',
            pm.entryRules || '', pm.stopLossRules || '', pm.exitTargetRules || '', pm.positionSizingRules || '', pm.freeNotes || '',
            rm.maxRiskPerTradePercent ?? null, rm.dailyDrawdownLimitPercent ?? null, rm.totalDrawdownLimitPercent ?? null,
            rm.maxConcurrentTrades ?? null, rm.maxProfitCapPerTrade ?? null, rm.freeNotes || '',
            of.description || '', JSON.stringify(record.aiUnderstandingSummary ?? null), record.linkedAnalysisProfileId || null]
        );

        await client.query('DELETE FROM strategy_attachments WHERE strategy_id=$1', [record.id]);
        const sections = [['positionManagement', pm.attachments], ['riskManagement', rm.attachments], ['overallFramework', of.attachments]];
        const mappedAttachments = [];
        for (const [category, list] of sections) {
          for (const item of (Array.isArray(list) ? list : [])) {
            const { rows } = await client.query(
              `INSERT INTO strategy_attachments (id, strategy_id, category, file_name, blob_id, file_url, mime_type, size_bytes, note, uploaded_at)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,COALESCE($10,now())) RETURNING *`,
              [item.id, record.id, category, item.fileName || null, item.blobId || null, item.fileUrl || null,
                item.mimeType || null, Number(item.size || 0), item.note || null,
                item.uploadedAt ? new Date(item.uploadedAt).toISOString() : null]
            );
            mappedAttachments.push(mapStrategyAttachment(rows[0]));
          }
        }

        await client.query('DELETE FROM strategy_chat_messages WHERE strategy_id=$1', [record.id]);
        const chatHistory = Array.isArray(record.chatHistory) ? record.chatHistory : [];
        const mappedChat = [];
        for (const message of chatHistory) {
          const { rows } = await client.query(
            `INSERT INTO strategy_chat_messages (id, strategy_id, role, content, created_at, suggestions)
             VALUES ($1,$2,$3,$4,COALESCE($5,now()),$6) RETURNING *`,
            [message.id, record.id, message.role, message.content || '',
              message.createdAt ? new Date(message.createdAt).toISOString() : null, JSON.stringify(message.suggestions ?? null)]
          );
          mappedChat.push(mapStrategyChatMessage(rows[0]));
        }

        await client.query('DELETE FROM strategy_detection_events WHERE strategy_id=$1', [record.id]);
        const detectionEvents = Array.isArray(record.detectionEvents) ? record.detectionEvents : [];
        const mappedEvents = [];
        for (const event of detectionEvents) {
          const { rows } = await client.query(
            `INSERT INTO strategy_detection_events (id, strategy_id, detected_at, source, predicted_outcome, status, resolved_at, note)
             VALUES ($1,$2,COALESCE($3,now()),$4,$5,$6,$7,$8) RETURNING *`,
            [event.id, record.id, event.detectedAt ? new Date(event.detectedAt).toISOString() : null,
              JSON.stringify(event.source ?? null), event.predictedOutcome || '',
              ['pending', 'confirmed', 'invalidated'].indexOf(event.status) > -1 ? event.status : 'pending',
              event.resolvedAt ? new Date(event.resolvedAt).toISOString() : null, event.note || null]
          );
          mappedEvents.push(mapStrategyDetectionEvent(rows[0]));
        }

        await client.query('COMMIT');
        return mapStrategy(strategyRows[0], mappedAttachments, mappedChat, mappedEvents);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    async get(userId, id) {
      const { rows } = await pool.query('SELECT * FROM strategies WHERE id=$1 AND user_id=$2', [id, userId]);
      if (!rows[0]) return null;
      const [full] = await attachStrategyChildren(rows);
      return full;
    },
    async listByUser(userId) {
      const { rows } = await pool.query('SELECT * FROM strategies WHERE user_id=$1 ORDER BY updated_at DESC', [userId]);
      return attachStrategyChildren(rows);
    },
    async remove(userId, id) {
      const { rows } = await pool.query('SELECT user_id FROM strategies WHERE id=$1', [id]);
      if (!rows[0]) return;
      if (rows[0].user_id !== userId) throw new ApiError(403, 'NOT_STRATEGY_OWNER');
      await pool.query('DELETE FROM strategies WHERE id=$1', [id]); // cascades to attachments/chat/detection events
    },
    // P0-2 launch-readiness fix - see tradingSessions.findOwnerByEntryImageUrl()'s own comment.
    async findOwnerByAttachmentUrl(fileUrl) {
      const { rows } = await pool.query(
        `SELECT s.user_id FROM strategy_attachments a
         JOIN strategies s ON s.id = a.strategy_id
         WHERE a.file_url=$1 LIMIT 1`,
        [fileUrl]
      );
      return rows[0] ? rows[0].user_id : null;
    }
  };

  // Analysis Profiles domain (see ARCHITECTURE.md §7.25, 044_analysis_profiles.sql). Flat table,
  // no child tables/transaction needed - mirrors patterns.upsert()'s ownership pre-check without
  // patterns' extra child-table steps. "Exactly one default per user" is enforced two ways here,
  // defense in depth: the partial unique index (044_analysis_profiles.sql) is the hard backstop;
  // this upsert also proactively clears any other default row for the same user inside the same
  // transaction when the incoming record itself is being set as the default, so a client that
  // skips its own clear-the-old-default step (analysis-profile-store.js's save()) still can't
  // leave two rows with is_default=true - it would violate the partial unique index instead.
  const analysisProfiles = {
    async upsert(userId, record) {
      if (!record || !record.id) throw new ApiError(400, 'VALIDATION_FAILED');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows: ownerRows } = await client.query('SELECT user_id FROM analysis_profiles WHERE id=$1', [record.id]);
        if (ownerRows[0] && ownerRows[0].user_id !== userId) throw new ApiError(403, 'NOT_ANALYSIS_PROFILE_OWNER');

        const isDefault = Boolean(record.isDefault);
        if (isDefault) {
          await client.query('UPDATE analysis_profiles SET is_default=FALSE WHERE user_id=$1 AND id<>$2 AND is_default', [userId, record.id]);
        }

        const { rows } = await client.query(
          `INSERT INTO analysis_profiles
            (id, user_id, name, description, primary_style_id, secondary_style_ids, focus_ids,
             custom_method_notes, is_default, is_active, registry_version, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now())
           ON CONFLICT (id) DO UPDATE SET
             name=$3, description=$4, primary_style_id=$5, secondary_style_ids=$6, focus_ids=$7,
             custom_method_notes=$8, is_default=$9, is_active=$10, registry_version=$11, updated_at=now()
           RETURNING *`,
          [record.id, userId, record.name || '', record.description || '',
            record.primaryStyleId || 'general_analysis',
            JSON.stringify(Array.isArray(record.secondaryStyleIds) ? record.secondaryStyleIds : []),
            JSON.stringify(Array.isArray(record.focusIds) ? record.focusIds : []),
            record.customMethodNotes || '', isDefault, record.isActive !== false,
            Math.max(1, Number(record.registryVersion) || 1)]
        );

        await client.query('COMMIT');
        return mapAnalysisProfile(rows[0]);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    async get(userId, id) {
      const { rows } = await pool.query('SELECT * FROM analysis_profiles WHERE id=$1 AND user_id=$2', [id, userId]);
      return rows[0] ? mapAnalysisProfile(rows[0]) : null;
    },
    async listByUser(userId) {
      const { rows } = await pool.query('SELECT * FROM analysis_profiles WHERE user_id=$1 ORDER BY updated_at DESC', [userId]);
      return rows.map(mapAnalysisProfile);
    },
    async remove(userId, id) {
      const { rows } = await pool.query('SELECT user_id FROM analysis_profiles WHERE id=$1', [id]);
      if (!rows[0]) return;
      if (rows[0].user_id !== userId) throw new ApiError(403, 'NOT_ANALYSIS_PROFILE_OWNER');
      await pool.query('DELETE FROM analysis_profiles WHERE id=$1', [id]);
    }
  };

  async function attachTradeChildren(tradeRows) {
    if (!tradeRows.length) return [];
    const ids = tradeRows.map((row) => row.id);
    const { rows: screenshotRows } = await pool.query('SELECT * FROM trade_screenshots WHERE trade_id = ANY($1) ORDER BY uploaded_at ASC', [ids]);
    const { rows: emotionRows } = await pool.query('SELECT * FROM trade_emotion_log WHERE trade_id = ANY($1) ORDER BY occurred_at ASC', [ids]);
    const screenshotsByTrade = new Map();
    screenshotRows.forEach((row) => { if (!screenshotsByTrade.has(row.trade_id)) screenshotsByTrade.set(row.trade_id, []); screenshotsByTrade.get(row.trade_id).push(mapTradeScreenshot(row)); });
    const emotionsByTrade = new Map();
    emotionRows.forEach((row) => { if (!emotionsByTrade.has(row.trade_id)) emotionsByTrade.set(row.trade_id, []); emotionsByTrade.get(row.trade_id).push(mapTradeEmotionLog(row)); });
    return tradeRows.map((row) => mapTrade(row, screenshotsByTrade.get(row.id) || [], emotionsByTrade.get(row.id) || []));
  }

  // Module 4 of the local-first-to-server migration. Same delete-then-reinsert-children
  // approach as tradingSessions/patterns/strategies above, for the same reason.
  const trades = {
    async upsert(userId, record) {
      if (!record || !record.id) throw new ApiError(400, 'VALIDATION_FAILED');
      const source = record.source || {};
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows: ownerRows } = await client.query('SELECT user_id, account_id FROM trades WHERE id=$1', [record.id]);
        if (ownerRows[0] && ownerRows[0].user_id !== userId) throw new ApiError(403, 'NOT_TRADE_OWNER');
        // Defect #1: see repo.memory.mjs's identical check for the full reasoning - a brand-new
        // trade must carry a real accountId once the user owns at least one active account.
        if (!record.accountId && !ownerRows[0]) {
          const { rows: activeRows } = await client.query("SELECT 1 FROM accounts WHERE user_id=$1 AND status='active' LIMIT 1", [userId]);
          if (activeRows[0]) throw new ApiError(400, 'ACCOUNT_REQUIRED');
        }
        // Same existence-collapses-with-ownership check as repo.memory.mjs - see 021_accounts.sql's
        // comment on trades.account_id for why this is a hard FK, not the loose linked_strategy_id
        // convention.
        if (record.accountId) {
          const { rows: accountOwnerRows } = await client.query('SELECT user_id, status FROM accounts WHERE id=$1', [record.accountId]);
          if (!accountOwnerRows[0] || accountOwnerRows[0].user_id !== userId) throw new ApiError(403, 'NOT_ACCOUNT_OWNER');
          // Archived accounts are read-only for NEW assignment (defect #3) - see
          // repo.memory.mjs's identical check for the full reasoning. A trade already carrying
          // this exact account_id before it was archived is left alone; only a fresh/changed
          // assignment onto an archived account is rejected.
          const isNewAssignment = !ownerRows[0] || ownerRows[0].account_id !== record.accountId;
          if (isNewAssignment && accountOwnerRows[0].status === 'archived') throw new ApiError(403, 'ACCOUNT_ARCHIVED');
        }

        // Instrument Catalog domain (025_instrument_catalog.sql): mandatory for a brand-new
        // trade only, same ACCOUNT_REQUIRED-style gate as above - never retroactively forced onto
        // a pre-existing trade. A supplied instrument must already be in this user's catalog.
        const instrument = normalizeInstrumentCode(record.instrument);
        if (!ownerRows[0] && !instrument) throw new ApiError(400, 'INSTRUMENT_REQUIRED');
        if (instrument) await assertInstrumentInCatalog(client, userId, instrument);
        // A trade sourced from a live Session must never silently drift onto a different
        // instrument than the one it was actually logged under - this is the concrete "never
        // compare/attribute BTC against XAU" guarantee at the write boundary. Only enforced when
        // the source session itself has a real instrument (a legacy/unassigned session imposes
        // no equality constraint - nothing real to match against).
        if (source.sessionId) {
          const { rows: sourceSessionRows } = await client.query('SELECT instrument FROM trading_sessions WHERE id=$1 AND user_id=$2', [source.sessionId, userId]);
          if (sourceSessionRows[0] && sourceSessionRows[0].instrument && sourceSessionRows[0].instrument !== instrument) {
            throw new ApiError(400, 'TRADE_SESSION_INSTRUMENT_MISMATCH');
          }
        }

        const { rows: tradeRows } = await client.query(
          `INSERT INTO trades
            (id, user_id, status, direction, entry_mode, entry_price, stop_loss, take_profits, sl_distance_percent,
             risk_percent, risk_amount, leverage, position_size, margin_required, liquidation_price, rr, margin_mode,
             commission, breakeven_percent, exit_price, outcome, pnl, pnl_percent, session, primary_timeframe,
             timeframe_trends, concept_tags, linked_pattern_ids, linked_strategy_id, account_id, instrument, chart_note, status_history,
             source_character, source_session_id, source_scenario_id, ai_prediction_links, ai_initial_analysis,
             discipline_impact, opened_at, closed_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,
                   $28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,now())
           ON CONFLICT (id) DO UPDATE SET
             status=$3, direction=$4, entry_mode=$5, entry_price=$6, stop_loss=$7, take_profits=$8, sl_distance_percent=$9,
             risk_percent=$10, risk_amount=$11, leverage=$12, position_size=$13, margin_required=$14, liquidation_price=$15,
             rr=$16, margin_mode=$17, commission=$18, breakeven_percent=$19, exit_price=$20, outcome=$21, pnl=$22,
             pnl_percent=$23, session=$24, primary_timeframe=$25, timeframe_trends=$26, concept_tags=$27,
             linked_pattern_ids=$28, linked_strategy_id=$29, account_id=$30, instrument=$31, chart_note=$32, status_history=$33,
             source_character=$34, source_session_id=$35, source_scenario_id=$36, ai_prediction_links=$37, ai_initial_analysis=$38,
             discipline_impact=$39, opened_at=$40, closed_at=$41, updated_at=now()
           RETURNING *`,
          [record.id, userId,
            ['hunting', 'open', 'closed', 'cancelled'].indexOf(record.status) > -1 ? record.status : 'hunting',
            record.direction === 'short' ? 'short' : 'long', record.entryMode === 'quick' ? 'quick' : 'full',
            record.entryPrice ?? null, record.stopLoss ?? null, JSON.stringify(record.takeProfits || []),
            record.slDistancePercent ?? null, record.riskPercent ?? null, record.riskAmount ?? null, record.leverage ?? null,
            record.positionSize ?? null, record.marginRequired ?? null, record.liquidationPrice ?? null, record.rr ?? null,
            record.marginMode === 'cross' ? 'cross' : 'isolated', JSON.stringify(record.commission ?? null),
            record.breakevenPercent ?? null, record.exitPrice ?? null, record.outcome || null, record.pnl ?? null,
            record.pnlPercent ?? null, record.session || 'london', record.primaryTimeframe || null,
            JSON.stringify(record.timeframeTrends || []), JSON.stringify(record.conceptTags || []),
            JSON.stringify(record.linkedPatternIds || []), record.linkedStrategyId || null,
            record.accountId || null, instrument,
            record.chartNote || '',
            JSON.stringify(record.statusHistory || []), source.character || null, source.sessionId || null,
            source.scenarioId || null, JSON.stringify(record.aiPredictionLinks || []), JSON.stringify(record.aiInitialAnalysis ?? null),
            Number(record.disciplineImpact || 0), record.openedAt ? new Date(record.openedAt).toISOString() : null,
            record.closedAt ? new Date(record.closedAt).toISOString() : null]
        );

        await client.query('DELETE FROM trade_screenshots WHERE trade_id=$1', [record.id]);
        const mappedScreenshots = [];
        for (const item of (Array.isArray(record.screenshots) ? record.screenshots : [])) {
          const { rows } = await client.query(
            `INSERT INTO trade_screenshots (id, trade_id, file_name, blob_id, image_url, mime_type, uploaded_at)
             VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7,now())) RETURNING *`,
            [item.id, record.id, item.fileName || null, item.blobId || null, item.imageUrl || null, item.mimeType || null,
              item.uploadedAt ? new Date(item.uploadedAt).toISOString() : null]
          );
          mappedScreenshots.push(mapTradeScreenshot(rows[0]));
        }

        await client.query('DELETE FROM trade_emotion_log WHERE trade_id=$1', [record.id]);
        const mappedEmotionLog = [];
        for (const item of (Array.isArray(record.emotionLog) ? record.emotionLog : [])) {
          const { rows } = await client.query(
            `INSERT INTO trade_emotion_log
              (id, trade_id, occurred_at, stage, dominant_emotions, emotion_details, stress_level, focus_quality, plan_commitment, would_take_if_not_forced, note)
             VALUES ($1,$2,COALESCE($3,now()),$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
            [item.id, record.id, item.timestamp ? new Date(item.timestamp).toISOString() : null,
              ['entry', 'mid_trade', 'exit'].indexOf(item.stage) > -1 ? item.stage : 'entry',
              JSON.stringify(item.dominantEmotions || []), JSON.stringify(item.emotionDetails || []),
              item.stressLevel ?? null, item.focusQuality ?? null, item.planCommitment ?? null,
              item.wouldTakeIfNotForced ?? null, item.note || null]
          );
          mappedEmotionLog.push(mapTradeEmotionLog(rows[0]));
        }

        await client.query('COMMIT');
        return mapTrade(tradeRows[0], mappedScreenshots, mappedEmotionLog);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    async get(userId, id) {
      const { rows } = await pool.query('SELECT * FROM trades WHERE id=$1 AND user_id=$2', [id, userId]);
      if (!rows[0]) return null;
      const [full] = await attachTradeChildren(rows);
      return full;
    },
    async listByUser(userId) {
      const { rows } = await pool.query('SELECT * FROM trades WHERE user_id=$1 ORDER BY updated_at DESC', [userId]);
      return attachTradeChildren(rows);
    },
    async remove(userId, id) {
      const { rows } = await pool.query('SELECT user_id FROM trades WHERE id=$1', [id]);
      if (!rows[0]) return;
      if (rows[0].user_id !== userId) throw new ApiError(403, 'NOT_TRADE_OWNER');
      await pool.query('DELETE FROM trades WHERE id=$1', [id]); // cascades to screenshots/emotion log
    },
    // P0-2 launch-readiness fix - see tradingSessions.findOwnerByEntryImageUrl()'s own comment.
    async findOwnerByScreenshotUrl(imageUrl) {
      const { rows } = await pool.query(
        `SELECT t.user_id FROM trade_screenshots ts
         JOIN trades t ON t.id = ts.trade_id
         WHERE ts.image_url=$1 LIMIT 1`,
        [imageUrl]
      );
      return rows[0] ? rows[0].user_id : null;
    }
  };

  // NAVRYA Accounts domain (021_accounts.sql). See repo.memory.mjs's identical implementation
  // for the reasoning (no equity/balance/connection-state column - derived client-side only).
  const accounts = {
    async upsert(userId, record) {
      if (!record || !record.id) throw new ApiError(400, 'VALIDATION_FAILED');
      const { rows: ownerRows } = await pool.query('SELECT user_id FROM accounts WHERE id=$1', [record.id]);
      if (ownerRows[0] && ownerRows[0].user_id !== userId) throw new ApiError(403, 'NOT_ACCOUNT_OWNER');
      const kind = record.kind === 'personal' ? 'personal' : 'prop';
      const status = record.status === 'archived' ? 'archived' : 'active';
      const { rows } = await pool.query(
        `INSERT INTO accounts
           (id, user_id, kind, firm, program, platform, number_masked, status, archived_at, currency, start_date, starting_balance, rules, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now())
         ON CONFLICT (id) DO UPDATE SET
           kind=$3, firm=$4, program=$5, platform=$6, number_masked=$7, status=$8, archived_at=$9,
           currency=$10, start_date=$11, starting_balance=$12, rules=$13, updated_at=now()
         RETURNING *`,
        [record.id, userId, kind, String(record.firm || '').trim(), record.program || null, record.platform || null,
          record.numberMasked || null, status, status === 'archived' ? (record.archivedAt ? new Date(record.archivedAt).toISOString() : new Date().toISOString()) : null,
          ['USD', 'EUR', 'GBP', 'AUD'].indexOf(record.currency) > -1 ? record.currency : 'USD',
          record.startDate || new Date().toISOString().slice(0, 10), Number(record.startingBalance) || 0,
          JSON.stringify(normalizeRules(kind, record.rules))]
      );
      return mapAccount(rows[0]);
    },
    async get(userId, id) {
      const { rows } = await pool.query('SELECT * FROM accounts WHERE id=$1 AND user_id=$2', [id, userId]);
      return rows[0] ? mapAccount(rows[0]) : null;
    },
    async listByUser(userId) {
      const { rows } = await pool.query('SELECT * FROM accounts WHERE user_id=$1 ORDER BY updated_at DESC', [userId]);
      return rows.map(mapAccount);
    },
    // Archives rather than hard-deletes whenever any trade still references the account -
    // trade history must never be silently orphaned/lost.
    async remove(userId, id) {
      const { rows } = await pool.query('SELECT user_id FROM accounts WHERE id=$1', [id]);
      if (!rows[0]) return;
      if (rows[0].user_id !== userId) throw new ApiError(403, 'NOT_ACCOUNT_OWNER');
      const { rows: referencing } = await pool.query('SELECT id FROM trades WHERE account_id=$1 LIMIT 1', [id]);
      if (referencing.length) {
        await pool.query(`UPDATE accounts SET status='archived', archived_at=now(), updated_at=now() WHERE id=$1`, [id]);
        return;
      }
      await pool.query('DELETE FROM accounts WHERE id=$1', [id]);
    }
  };

  // Instrument Catalog domain (025_instrument_catalog.sql). No archive-vs-delete distinction
  // like accounts.remove() needs - nothing else holds a foreign key to this row's own id, since
  // every consumer stores the plain code string, not this id (see the migration's comment).
  const instrumentCatalog = {
    async upsert(userId, record) {
      if (!record || !record.id) throw new ApiError(400, 'VALIDATION_FAILED');
      const code = normalizeInstrumentCode(record.code);
      if (!code) throw new ApiError(400, 'VALIDATION_FAILED');
      const { rows: ownerRows } = await pool.query('SELECT user_id FROM instrument_catalog WHERE id=$1', [record.id]);
      if (ownerRows[0] && ownerRows[0].user_id !== userId) throw new ApiError(403, 'NOT_INSTRUMENT_OWNER');
      try {
        const { rows } = await pool.query(
          `INSERT INTO instrument_catalog (id, user_id, code, display_name, updated_at)
           VALUES ($1,$2,$3,$4,now())
           ON CONFLICT (id) DO UPDATE SET code=$3, display_name=$4, updated_at=now()
           RETURNING *`,
          [record.id, userId, code, record.displayName || null]
        );
        return mapInstrumentCatalog(rows[0]);
      } catch (error) {
        // "Codes must be unique per user after normalization" - a duplicate add (or a rename onto
        // an already-used code) hits instrument_catalog_user_code_idx and surfaces here as a real
        // 409, never a silent second row.
        if (error && error.code === '23505') throw new ApiError(409, 'INSTRUMENT_ALREADY_EXISTS');
        throw error;
      }
    },
    async get(userId, id) {
      const { rows } = await pool.query('SELECT * FROM instrument_catalog WHERE id=$1 AND user_id=$2', [id, userId]);
      return rows[0] ? mapInstrumentCatalog(rows[0]) : null;
    },
    async listByUser(userId) {
      const { rows } = await pool.query('SELECT * FROM instrument_catalog WHERE user_id=$1 ORDER BY code ASC', [userId]);
      return rows.map(mapInstrumentCatalog);
    },
    async remove(userId, id) {
      const { rows } = await pool.query('SELECT user_id FROM instrument_catalog WHERE id=$1', [id]);
      if (!rows[0]) return;
      if (rows[0].user_id !== userId) throw new ApiError(403, 'NOT_INSTRUMENT_OWNER');
      await pool.query('DELETE FROM instrument_catalog WHERE id=$1', [id]);
    }
  };

  // ---------------------------------------------------------------------------------------------
  // Commercial System Slice 1 (026-029_*.sql) - see server/commercial/*.mjs for the business
  // logic (entitlement resolution, markup resolution, wallet reserve/settle/release orchestration)
  // that calls these; this layer stays pure persistence, mirroring every other domain above.
  // ---------------------------------------------------------------------------------------------
  function mapCommercialConfigOverride(row) { return { configKey: row.config_key, value: row.value, updatedBy: row.updated_by, updatedAt: row.updated_at }; }
  function mapCommercialConfigVersion(row) {
    return { id: row.id, configKey: row.config_key, changedBy: row.changed_by, changeSummary: row.change_summary, previousValue: row.previous_value, newValue: row.new_value, changedAt: row.changed_at };
  }
  const commercialConfig = {
    async list() {
      const { rows } = await pool.query('SELECT * FROM commercial_config_overrides ORDER BY config_key ASC');
      return rows.map(mapCommercialConfigOverride);
    },
    async get(configKey) {
      const { rows } = await pool.query('SELECT * FROM commercial_config_overrides WHERE config_key=$1', [configKey]);
      return rows[0] ? mapCommercialConfigOverride(rows[0]) : null;
    },
    // Upserts the override AND appends an immutable version row in one transaction (spec section
    // 43's Configuration History) - a publish and its own history entry are atomic, never one
    // without the other.
    async publish(configKey, value, { updatedBy, changeSummary } = {}) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows: beforeRows } = await client.query('SELECT value FROM commercial_config_overrides WHERE config_key=$1', [configKey]);
        const previousValue = beforeRows[0] ? beforeRows[0].value : null;
        const { rows } = await client.query(
          `INSERT INTO commercial_config_overrides (config_key, value, updated_by, updated_at) VALUES ($1,$2,$3,now())
           ON CONFLICT (config_key) DO UPDATE SET value=$2, updated_by=$3, updated_at=now()
           RETURNING *`,
          [configKey, JSON.stringify(value ?? null), updatedBy || null]
        );
        await client.query(
          `INSERT INTO commercial_config_versions (id, config_key, changed_by, change_summary, previous_value, new_value)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [newId('commercialConfigVersion'), configKey, updatedBy || null, changeSummary || null, JSON.stringify(previousValue), JSON.stringify(value ?? null)]
        );
        await client.query('COMMIT');
        return mapCommercialConfigOverride(rows[0]);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    async listVersions({ configKey, limit } = {}) {
      const { rows } = configKey
        ? await pool.query('SELECT * FROM commercial_config_versions WHERE config_key=$1 ORDER BY changed_at DESC LIMIT $2', [configKey, limit || 100])
        : await pool.query('SELECT * FROM commercial_config_versions ORDER BY changed_at DESC LIMIT $1', [limit || 100]);
      return rows.map(mapCommercialConfigVersion);
    }
  };

  function mapMarkupRule(row) {
    return { id: row.id, scopeType: row.scope_type, scopeKey: row.scope_key, markupPercent: Number(row.markup_percent), enabled: row.enabled, createdAt: row.created_at, updatedAt: row.updated_at };
  }
  const markupRules = {
    async list() {
      const { rows } = await pool.query('SELECT * FROM ai_markup_rules ORDER BY scope_type ASC, scope_key ASC');
      return rows.map(mapMarkupRule);
    },
    async upsert({ scopeType, scopeKey, markupPercent, enabled }) {
      const { rows } = await pool.query(
        `INSERT INTO ai_markup_rules (id, scope_type, scope_key, markup_percent, enabled, updated_at)
         VALUES ($1,$2,$3,$4,$5,now())
         ON CONFLICT (scope_type, scope_key) DO UPDATE SET markup_percent=$4, enabled=$5, updated_at=now()
         RETURNING *`,
        [newId('markupRule'), scopeType, scopeKey, markupPercent, enabled !== false]
      );
      return mapMarkupRule(rows[0]);
    },
    async remove(id) {
      await pool.query('DELETE FROM ai_markup_rules WHERE id=$1', [id]);
    }
  };

  function mapProviderModelPricing(row) {
    return {
      provider: row.provider, model: row.model,
      promptPricePer1k: row.prompt_price_per_1k == null ? null : Number(row.prompt_price_per_1k),
      completionPricePer1k: row.completion_price_per_1k == null ? null : Number(row.completion_price_per_1k),
      // AI Cost Control (043_ai_cost_control.sql) - additive/nullable, see that migration's comment.
      cachedInputPricePer1k: row.cached_input_price_per_1k == null ? null : Number(row.cached_input_price_per_1k),
      cacheWriteInputPricePer1k: row.cache_write_input_price_per_1k == null ? null : Number(row.cache_write_input_price_per_1k),
      // 046_flat_priced_ai_features.sql - a non-token, per-call rate (e.g. gpt-image-1) - see
      // wallet-service.mjs's resolvePricingRate()/reserveForAiCall()/settleAiCall() for how this
      // takes precedence over the token-based fields above when set.
      flatPricePerCallMicroUsd: row.flat_price_per_call_micro_usd == null ? null : Number(row.flat_price_per_call_micro_usd),
      currency: row.currency, enabled: row.enabled, effectiveFrom: row.effective_from, effectiveUntil: row.effective_until,
      updatedAt: row.updated_at
    };
  }
  const providerModelPricing = {
    async list() {
      const { rows } = await pool.query('SELECT * FROM provider_model_pricing ORDER BY provider ASC, model ASC');
      return rows.map(mapProviderModelPricing);
    },
    async get(provider, model) {
      const { rows } = await pool.query('SELECT * FROM provider_model_pricing WHERE provider=$1 AND model=$2', [provider, model]);
      return rows[0] ? mapProviderModelPricing(rows[0]) : null;
    },
    async upsert({ provider, model, promptPricePer1k, completionPricePer1k, cachedInputPricePer1k, cacheWriteInputPricePer1k, flatPricePerCallMicroUsd, currency, enabled }) {
      const { rows } = await pool.query(
        `INSERT INTO provider_model_pricing (provider, model, prompt_price_per_1k, completion_price_per_1k, cached_input_price_per_1k, cache_write_input_price_per_1k, flat_price_per_call_micro_usd, currency, enabled, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
         ON CONFLICT (provider, model) DO UPDATE SET prompt_price_per_1k=$3, completion_price_per_1k=$4, cached_input_price_per_1k=$5, cache_write_input_price_per_1k=$6, flat_price_per_call_micro_usd=$7, currency=$8, enabled=$9, updated_at=now()
         RETURNING *`,
        [provider, model, promptPricePer1k ?? null, completionPricePer1k ?? null, cachedInputPricePer1k ?? null, cacheWriteInputPricePer1k ?? null, flatPricePerCallMicroUsd ?? null, currency || 'USD', enabled !== false]
      );
      return mapProviderModelPricing(rows[0]);
    },
    async remove(provider, model) {
      await pool.query('DELETE FROM provider_model_pricing WHERE provider=$1 AND model=$2', [provider, model]);
    }
  };

  function mapWalletAccount(row) {
    return { userId: row.user_id, paidBalanceMicroUsd: Number(row.paid_balance_micro_usd), promoBalanceMicroUsd: Number(row.promo_balance_micro_usd), createdAt: row.created_at, updatedAt: row.updated_at };
  }
  function mapWalletLedgerEntry(row) {
    return {
      id: row.id, userId: row.user_id, type: row.type,
      cashDeltaMicroUsd: Number(row.cash_delta_micro_usd), promoDeltaMicroUsd: Number(row.promo_delta_micro_usd),
      providerCostMicroUsd: row.provider_cost_micro_usd == null ? null : Number(row.provider_cost_micro_usd),
      retailChargeMicroUsd: row.retail_charge_micro_usd == null ? null : Number(row.retail_charge_micro_usd),
      markupPercent: row.markup_percent == null ? null : Number(row.markup_percent),
      retailMultiplier: row.retail_multiplier == null ? null : Number(row.retail_multiplier),
      tokenDiscountPercent: row.token_discount_percent == null ? null : Number(row.token_discount_percent),
      provider: row.provider, model: row.model, feature: row.feature, sourceAction: row.source_action,
      adminUserId: row.admin_user_id, idempotencyKey: row.idempotency_key, metadata: row.metadata, createdAt: row.created_at
    };
  }
  function mapWalletReservation(row) {
    return {
      id: row.id, userId: row.user_id, status: row.status, estimatedRetailMicroUsd: Number(row.estimated_retail_micro_usd),
      provider: row.provider, model: row.model, feature: row.feature, createdAt: row.created_at, resolvedAt: row.resolved_at
    };
  }
  // AI billing operational fix (task B) - the gap the reserve()/release() comments below used to
  // name and leave open: "no background sweep in this slice". A reservation only ever ages out of
  // the pending-sum's MEANING once something concludes it - if pattern-ai-server.mjs crashes (or
  // every settle/record retry is exhausted) mid-flight, nothing ever did that, and the hold would
  // otherwise count against this same user's available balance forever. Called lazily, scoped to
  // one user, from inside reserve()'s own transaction (mirrors the lazy-sweep-on-next-relevant-
  // write convention `sessions.sweepStale()` already uses elsewhere in this file) - this can only
  // ever RELEASE (never charge) a reservation whose real usage was never recovered, the same
  // conservative direction release() already takes for a known failure. STALE_RESERVATION_
  // THRESHOLD_MS is generous past callOpenAI()'s own 90s provider timeout plus the settle/record
  // retry's well-under-1s, so it never races a genuinely in-flight call.
  async function sweepStalePendingReservations(client, userId, thresholdMs) {
    // Deliberately NOT clamped to >= 0 (unlike sessions.sweepStale() above) - a caller passing a
    // small negative threshold (verification only; production always uses the real positive
    // STALE_RESERVATION_THRESHOLD_MS constant) means "treat anything up to now as stale", which
    // must work with a real time margin rather than racing Date.now()'s own millisecond boundary.
    const seconds = Math.floor(thresholdMs / 1000);
    const { rows: staleRows } = await client.query(
      `UPDATE wallet_reservations SET status='released', resolved_at=now()
       WHERE user_id=$1 AND status='pending' AND created_at < now() - ($2 * INTERVAL '1 second')
       RETURNING id, provider, model, feature`,
      [userId, seconds]
    );
    for (const row of staleRows) {
      await client.query(
        `INSERT INTO wallet_ledger (id, user_id, type, provider, model, feature, source_action, metadata)
         VALUES ($1,$2,'AI_RELEASE',$3,$4,$5,'ai-release-stale',$6)`,
        [newId('walletLedger'), userId, row.provider, row.model, row.feature, JSON.stringify({ reservationId: row.id, reason: 'stale' })]
      );
    }
  }
  const STALE_RESERVATION_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

  const wallet = {
    async getAccount(userId) {
      const { rows } = await pool.query('INSERT INTO wallet_accounts (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING RETURNING *', [userId]);
      if (rows[0]) return mapWalletAccount(rows[0]);
      const { rows: existing } = await pool.query('SELECT * FROM wallet_accounts WHERE user_id=$1', [userId]);
      return mapWalletAccount(existing[0]);
    },
    // Plain read, no lock/transaction - lets settleAiCall() (wallet-service.mjs) learn WHICH user a
    // reservation belongs to before it computes the final (discount-applied) retail charge, since
    // that computation must happen before calling settle() below. Returns null rather than
    // throwing for an unknown id, matching settle()/release()'s own "not found" handling.
    async getReservation(reservationId) {
      const { rows } = await pool.query('SELECT * FROM wallet_reservations WHERE id=$1', [reservationId]);
      return rows[0] ? mapWalletReservation(rows[0]) : null;
    },
    // Places a hold for an upcoming AI call. "Available" is the stored balance minus every OTHER
    // still-pending reservation for this user - reserving never mutates wallet_accounts itself
    // (only settle()/release()/grant() do), so a caller that crashes before resolving its own
    // reservation cannot permanently lock funds away from a later request; a truly orphaned
    // 'pending' row is recovered by sweepStalePendingReservations() above rather than counting
    // against this user forever.
    async reserve(userId, { estimatedRetailMicroUsd, provider, model, feature }) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await sweepStalePendingReservations(client, userId, STALE_RESERVATION_THRESHOLD_MS);
        await client.query('INSERT INTO wallet_accounts (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [userId]);
        const { rows: accountRows } = await client.query('SELECT * FROM wallet_accounts WHERE user_id=$1 FOR UPDATE', [userId]);
        const account = accountRows[0];
        const { rows: pendingRows } = await client.query(
          `SELECT COALESCE(SUM(estimated_retail_micro_usd),0) AS pending FROM wallet_reservations WHERE user_id=$1 AND status='pending'`,
          [userId]
        );
        const balanceMicroUsd = Number(account.paid_balance_micro_usd) + Number(account.promo_balance_micro_usd);
        const availableMicroUsd = balanceMicroUsd - Number(pendingRows[0].pending);
        if (availableMicroUsd < estimatedRetailMicroUsd) {
          await client.query('ROLLBACK');
          return { ok: false, reason: 'WALLET_INSUFFICIENT_BALANCE', availableMicroUsd, estimatedRetailMicroUsd };
        }
        const { rows } = await client.query(
          `INSERT INTO wallet_reservations (id, user_id, status, estimated_retail_micro_usd, provider, model, feature)
           VALUES ($1,$2,'pending',$3,$4,$5,$6) RETURNING *`,
          [newId('walletReservation'), userId, estimatedRetailMicroUsd, provider || null, model || null, feature || null]
        );
        await client.query('COMMIT');
        return { ok: true, reservation: mapWalletReservation(rows[0]) };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    // Public entry point for the same sweep reserve() runs automatically (task B) - exposed as
    // its own method so an explicit/shorter threshold can be used for verification without
    // waiting out the real STALE_RESERVATION_THRESHOLD_MS.
    async releaseStalePendingReservations(userId, thresholdMs = STALE_RESERVATION_THRESHOLD_MS) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await sweepStalePendingReservations(client, userId, thresholdMs);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    // Resolves a reservation into a real charge, spending promo balance before paid (spec section
    // 23). Idempotent by idempotencyKey - a retried settle for a reservation that is no longer
    // 'pending' returns the already-recorded ledger entry instead of writing (or charging) again.
    async settle(reservationId, { providerCostMicroUsd, retailChargeMicroUsd, markupPercent, retailMultiplier, tokenDiscountPercent, provider, model, feature, idempotencyKey }) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows: reservationRows } = await client.query('SELECT * FROM wallet_reservations WHERE id=$1 FOR UPDATE', [reservationId]);
        const reservation = reservationRows[0];
        if (!reservation) { await client.query('ROLLBACK'); throw new ApiError(404, 'WALLET_RESERVATION_NOT_FOUND'); }
        if (reservation.status !== 'pending') {
          const { rows: existingLedger } = await client.query('SELECT * FROM wallet_ledger WHERE idempotency_key=$1', [idempotencyKey || null]);
          await client.query('COMMIT');
          return { ok: true, alreadySettled: true, ledgerEntry: existingLedger[0] ? mapWalletLedgerEntry(existingLedger[0]) : null };
        }
        const userId = reservation.user_id;
        const { rows: accountRows } = await client.query('SELECT * FROM wallet_accounts WHERE user_id=$1 FOR UPDATE', [userId]);
        const account = accountRows[0];
        const promoSpend = Math.max(0, Math.min(Number(account.promo_balance_micro_usd), retailChargeMicroUsd));
        const paidSpend = retailChargeMicroUsd - promoSpend;
        await client.query(
          `UPDATE wallet_accounts SET promo_balance_micro_usd = promo_balance_micro_usd - $2, paid_balance_micro_usd = paid_balance_micro_usd - $3, updated_at=now() WHERE user_id=$1`,
          [userId, promoSpend, paidSpend]
        );
        await client.query(`UPDATE wallet_reservations SET status='settled', resolved_at=now() WHERE id=$1`, [reservationId]);
        let ledgerRow;
        try {
          const { rows } = await client.query(
            `INSERT INTO wallet_ledger
               (id, user_id, type, cash_delta_micro_usd, promo_delta_micro_usd, provider_cost_micro_usd, retail_charge_micro_usd,
                markup_percent, retail_multiplier, token_discount_percent, provider, model, feature, source_action, idempotency_key, metadata)
             VALUES ($1,$2,'AI_SETTLEMENT',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'ai-settlement',$13,$14) RETURNING *`,
            [newId('walletLedger'), userId, -paidSpend, -promoSpend, providerCostMicroUsd ?? null, retailChargeMicroUsd,
              markupPercent ?? null, retailMultiplier ?? null, tokenDiscountPercent ?? null, provider || null, model || null, feature || null,
              idempotencyKey || null, JSON.stringify({ reservationId })]
          );
          ledgerRow = rows[0];
        } catch (error) {
          if (error && error.code === '23505') {
            await client.query('ROLLBACK');
            const { rows: existingLedger } = await pool.query('SELECT * FROM wallet_ledger WHERE idempotency_key=$1', [idempotencyKey]);
            return { ok: true, alreadySettled: true, ledgerEntry: existingLedger[0] ? mapWalletLedgerEntry(existingLedger[0]) : null };
          }
          throw error;
        }
        await client.query('COMMIT');
        return { ok: true, ledgerEntry: mapWalletLedgerEntry(ledgerRow) };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    // A failed/aborted provider call never charges the user (spec section 27) - releases the hold
    // with zero balance movement. Idempotent: releasing an already-resolved reservation is a
    // no-op, not an error.
    async release(reservationId) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows: reservationRows } = await client.query('SELECT * FROM wallet_reservations WHERE id=$1 FOR UPDATE', [reservationId]);
        const reservation = reservationRows[0];
        if (!reservation || reservation.status !== 'pending') { await client.query('COMMIT'); return { ok: true, alreadyResolved: true }; }
        await client.query(`UPDATE wallet_reservations SET status='released', resolved_at=now() WHERE id=$1`, [reservationId]);
        await client.query(
          `INSERT INTO wallet_ledger (id, user_id, type, provider, model, feature, source_action, metadata)
           VALUES ($1,$2,'AI_RELEASE',$3,$4,$5,'ai-release',$6)`,
          [newId('walletLedger'), reservation.user_id, reservation.provider, reservation.model, reservation.feature, JSON.stringify({ reservationId })]
        );
        await client.query('COMMIT');
        return { ok: true };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    // Direct balance movement not tied to an AI reservation - Admin credit/debit (spec section
    // 50). idempotencyKey lets a caller retry defensively without ever double-crediting.
    async grant(userId, { type, cashDeltaMicroUsd = 0, promoDeltaMicroUsd = 0, adminUserId, sourceAction, idempotencyKey, metadata }) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('INSERT INTO wallet_accounts (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [userId]);
        await client.query(
          `UPDATE wallet_accounts SET paid_balance_micro_usd = paid_balance_micro_usd + $2, promo_balance_micro_usd = promo_balance_micro_usd + $3, updated_at=now() WHERE user_id=$1`,
          [userId, cashDeltaMicroUsd, promoDeltaMicroUsd]
        );
        let rows;
        try {
          ({ rows } = await client.query(
            `INSERT INTO wallet_ledger (id, user_id, type, cash_delta_micro_usd, promo_delta_micro_usd, admin_user_id, source_action, idempotency_key, metadata)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
            [newId('walletLedger'), userId, type, cashDeltaMicroUsd, promoDeltaMicroUsd, adminUserId || null, sourceAction || null, idempotencyKey || null, JSON.stringify(metadata || {})]
          ));
        } catch (error) {
          if (error && error.code === '23505') { await client.query('ROLLBACK'); return { ok: true, duplicate: true }; }
          throw error;
        }
        await client.query('COMMIT');
        return { ok: true, ledgerEntry: mapWalletLedgerEntry(rows[0]) };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    async ledgerForUser(userId, { limit } = {}) {
      const { rows } = await pool.query('SELECT * FROM wallet_ledger WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2', [userId, limit || 50]);
      return rows.map(mapWalletLedgerEntry);
    },
    // AI Cost Control's per-user drill-down (server/admin/routes.mjs's GET /users/:id) - type-
    // filtered so a heavy top-up/admin-credit history can never crowd real AI_SETTLEMENT rows out
    // of a fixed-size window the way a plain ledgerForUser(limit) could.
    async settlementsForUser(userId, { limit } = {}) {
      const { rows } = await pool.query(
        `SELECT * FROM wallet_ledger WHERE user_id=$1 AND type='AI_SETTLEMENT' ORDER BY created_at DESC LIMIT $2`,
        [userId, limit || 100]
      );
      return rows.map(mapWalletLedgerEntry);
    },
    async recentLedger({ limit } = {}) {
      const { rows } = await pool.query('SELECT * FROM wallet_ledger ORDER BY created_at DESC LIMIT $1', [limit || 100]);
      return rows.map(mapWalletLedgerEntry);
    },
    // AI Cost Control's exact internal reconciliation domain: every AI_SETTLEMENT ledger row in a
    // UTC range, keyed by idempotency_key (== an ai_usage_events row's own
    // linked_ledger_idempotency_key, "ai-settle:" + reservationId) - see
    // server/commercial/reconciliation-service.mjs for how the two sets are compared.
    async listSettlementsInRange({ start, end, limit = 200, offset = 0 } = {}) {
      const { rows } = await pool.query(
        `SELECT * FROM wallet_ledger WHERE type='AI_SETTLEMENT' AND created_at >= $1 AND created_at < $2
         ORDER BY created_at ASC LIMIT $3 OFFSET $4`,
        [start, end, limit, offset]
      );
      return rows.map(mapWalletLedgerEntry);
    },
    async countSettlementsInRange({ start, end } = {}) {
      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS count FROM wallet_ledger WHERE type='AI_SETTLEMENT' AND created_at >= $1 AND created_at < $2`,
        [start, end]
      );
      return rows[0].count;
    },
    // AI Cost Control overview card's "actual wallet debit" figure - the REAL cash+promo balance
    // movement AI_SETTLEMENT caused in a range, computed server-side (never a client-side sum over
    // a paginated list, for accuracy at any real data volume). Deliberately a distinct number from
    // retail_charge_micro_usd's own sum (ai_usage_events' own estimate) - see this feature's own
    // Domain A reconciliation for what a divergence between the two would mean.
    async sumSettlementsInRange({ start, end } = {}) {
      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS count, COALESCE(SUM(ABS(cash_delta_micro_usd)),0)::bigint AS cash, COALESCE(SUM(ABS(promo_delta_micro_usd)),0)::bigint AS promo
         FROM wallet_ledger WHERE type='AI_SETTLEMENT' AND created_at >= $1 AND created_at < $2`,
        [start, end]
      );
      const row = rows[0];
      return { count: row.count, cashMicroUsd: Number(row.cash), promoMicroUsd: Number(row.promo), totalMicroUsd: Number(row.cash) + Number(row.promo) };
    }
  };

  // Race-condition-safe "may this user create one more X" gate (spec section 53). A transaction-
  // scoped Postgres advisory lock (auto-released at COMMIT/ROLLBACK, same primitive
  // server/db/migrate.mjs already uses for its own schema-migration lock) keyed by
  // (userId, resourceType) - concurrent callers for the SAME key block on the lock acquisition
  // itself, so the count-check inside `fn` and its caller's subsequent insert (which happens on
  // a different pooled connection, but only AFTER this lock is held and only COMMITted here once
  // `fn` resolves) can never race to both pass the same count check.
  const quota = {
    async withCreateLock(userId, resourceType, fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [userId + ':' + resourceType]);
        const result = await fn();
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }
  };

  // The "Active Analysis Symbols" entitlement primitive (030_analysis_symbols.sql) - see that
  // migration's comment for why this is a new table rather than a retrofit of an existing
  // feature. No dedupe-by-symbol constraint (unlike instrumentCatalog's per-user unique code) -
  // this is intentionally minimal since nothing in the product yet reads/writes it.
  function mapAnalysisSymbol(row) { return { id: row.id, userId: row.user_id, symbol: row.symbol, createdAt: row.created_at }; }
  const analysisSymbols = {
    async upsert(userId, record) {
      if (!record || !record.id || !record.symbol) throw new ApiError(400, 'VALIDATION_FAILED');
      const { rows: ownerRows } = await pool.query('SELECT user_id FROM user_analysis_symbols WHERE id=$1', [record.id]);
      if (ownerRows[0] && ownerRows[0].user_id !== userId) throw new ApiError(403, 'NOT_ANALYSIS_SYMBOL_OWNER');
      const { rows } = await pool.query(
        `INSERT INTO user_analysis_symbols (id, user_id, symbol) VALUES ($1,$2,$3)
         ON CONFLICT (id) DO UPDATE SET symbol=$3 RETURNING *`,
        [record.id, userId, String(record.symbol).trim().toUpperCase()]
      );
      return mapAnalysisSymbol(rows[0]);
    },
    async listByUser(userId) {
      const { rows } = await pool.query('SELECT * FROM user_analysis_symbols WHERE user_id=$1 ORDER BY created_at ASC', [userId]);
      return rows.map(mapAnalysisSymbol);
    },
    async remove(userId, id) {
      const { rows } = await pool.query('SELECT user_id FROM user_analysis_symbols WHERE id=$1', [id]);
      if (!rows[0]) return;
      if (rows[0].user_id !== userId) throw new ApiError(403, 'NOT_ANALYSIS_SYMBOL_OWNER');
      await pool.query('DELETE FROM user_analysis_symbols WHERE id=$1', [id]);
    }
  };

  // ---------------------------------------------------------------------------------------------
  // Commercial System Slice 2 (031-035_*.sql) - subscriptions, payment transactions, storage
  // products/entitlements/objects. See server/commercial/*-service.mjs for the business logic
  // (activation, snapshotting, quota math) that calls these; this layer stays pure persistence.
  // ---------------------------------------------------------------------------------------------
  function mapSubscription(row) {
    return {
      id: row.id, userId: row.user_id, planId: row.plan_id, provider: row.provider,
      externalCustomerId: row.external_customer_id, externalSubscriptionId: row.external_subscription_id,
      status: row.status, currentPeriodStart: row.current_period_start, currentPeriodEnd: row.current_period_end,
      cancelAtPeriodEnd: row.cancel_at_period_end, priceAmountMicroUsd: Number(row.price_amount_micro_usd),
      currency: row.currency, paymentTransactionId: row.payment_transaction_id, createdAt: row.created_at, updatedAt: row.updated_at
    };
  }
  const subscriptions = {
    async create({ userId, planId, provider, externalCustomerId, externalSubscriptionId, status, currentPeriodStart, currentPeriodEnd, cancelAtPeriodEnd, priceAmountMicroUsd, currency, paymentTransactionId }) {
      const { rows } = await pool.query(
        `INSERT INTO user_subscriptions
           (id, user_id, plan_id, provider, external_customer_id, external_subscription_id, status,
            current_period_start, current_period_end, cancel_at_period_end, price_amount_micro_usd, currency, payment_transaction_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
        [newId('subscription'), userId, planId, provider || 'manual', externalCustomerId || null, externalSubscriptionId || null,
          status, currentPeriodStart || null, currentPeriodEnd || null, Boolean(cancelAtPeriodEnd), priceAmountMicroUsd || 0, currency || 'USD',
          paymentTransactionId || null]
      );
      return mapSubscription(rows[0]);
    },
    async get(id) {
      const { rows } = await pool.query('SELECT * FROM user_subscriptions WHERE id=$1', [id]);
      return rows[0] ? mapSubscription(rows[0]) : null;
    },
    // Validation Gate - lets refund reversal (server/commercial/payment-service.mjs) find the
    // EXACT subscription a given transaction produced, rather than guessing via "the user's
    // current active subscription" (wrong the moment the plan has changed again since purchase).
    async getByPaymentTransactionId(transactionId) {
      const { rows } = await pool.query('SELECT * FROM user_subscriptions WHERE payment_transaction_id=$1', [transactionId]);
      return rows[0] ? mapSubscription(rows[0]) : null;
    },
    async update(id, patch) {
      const existing = await subscriptions.get(id);
      if (!existing) throw new ApiError(404, 'SUBSCRIPTION_NOT_FOUND');
      const merged = { ...existing, ...patch };
      const { rows } = await pool.query(
        `UPDATE user_subscriptions SET status=$2, current_period_start=$3, current_period_end=$4,
           cancel_at_period_end=$5, price_amount_micro_usd=$6, currency=$7, external_subscription_id=$8,
           external_customer_id=$9, payment_transaction_id=$10, updated_at=now()
         WHERE id=$1 RETURNING *`,
        [id, merged.status, merged.currentPeriodStart, merged.currentPeriodEnd, merged.cancelAtPeriodEnd,
          merged.priceAmountMicroUsd, merged.currency, merged.externalSubscriptionId, merged.externalCustomerId, merged.paymentTransactionId]
      );
      return mapSubscription(rows[0]);
    },
    // The single source of truth for "which subscription (if any) currently confers its plan" -
    // period_end is the universal gate (computed at read time, no background expiry job - see
    // 031_subscriptions.sql's own comment): active/past_due while unexpired is a grace period,
    // canceled only still counts if cancelAtPeriodEnd was set and the period hasn't ended yet.
    async getActiveForUser(userId) {
      const { rows } = await pool.query(
        `SELECT * FROM user_subscriptions
         WHERE user_id=$1 AND current_period_end > now()
           AND (status IN ('active','past_due') OR (status='canceled' AND cancel_at_period_end))
         ORDER BY current_period_end DESC LIMIT 1`,
        [userId]
      );
      return rows[0] ? mapSubscription(rows[0]) : null;
    },
    async listForUser(userId) {
      const { rows } = await pool.query('SELECT * FROM user_subscriptions WHERE user_id=$1 ORDER BY created_at DESC', [userId]);
      return rows.map(mapSubscription);
    },
    // Admin stats (spec section 18) - counts real rows only, never a mock/estimated figure.
    async adminStats() {
      const { rows } = await pool.query(
        `SELECT plan_id, status, cancel_at_period_end, price_amount_micro_usd
         FROM user_subscriptions WHERE current_period_end > now() OR status IN ('past_due','canceled')`
      );
      const stats = { activePlus: 0, activePro: 0, activePersonalized: 0, pastDue: 0, canceling: 0, expired: 0, mrrMicroUsd: 0 };
      rows.forEach((row) => {
        if (row.status === 'active' && !row.cancel_at_period_end) {
          if (row.plan_id === 'plus') stats.activePlus += 1;
          if (row.plan_id === 'pro') stats.activePro += 1;
          if (row.plan_id === 'personalized') stats.activePersonalized += 1;
          stats.mrrMicroUsd += Number(row.price_amount_micro_usd);
        }
        if (row.status === 'past_due') stats.pastDue += 1;
        if (row.status === 'active' && row.cancel_at_period_end) stats.canceling += 1;
        if (row.status === 'expired') stats.expired += 1;
      });
      return stats;
    }
  };

  function mapPaymentTransaction(row) {
    return {
      id: row.id, userId: row.user_id, type: row.type, provider: row.provider, externalTransactionId: row.external_transaction_id,
      status: row.status, amountMicroUsd: Number(row.amount_micro_usd), currency: row.currency, productId: row.product_id,
      metadata: row.metadata, createdAt: row.created_at, confirmedAt: row.confirmed_at
    };
  }
  const paymentTransactions = {
    async create({ userId, type, provider, externalTransactionId, amountMicroUsd, currency, productId, metadata }) {
      const { rows } = await pool.query(
        `INSERT INTO payment_transactions (id, user_id, type, provider, external_transaction_id, status, amount_micro_usd, currency, product_id, metadata)
         VALUES ($1,$2,$3,$4,$5,'pending',$6,$7,$8,$9) RETURNING *`,
        [newId('paymentTx'), userId, type, provider || 'manual', externalTransactionId || null, amountMicroUsd, currency || 'USD', productId || null, JSON.stringify(metadata || {})]
      );
      return mapPaymentTransaction(rows[0]);
    },
    async get(id) {
      const { rows } = await pool.query('SELECT * FROM payment_transactions WHERE id=$1', [id]);
      return rows[0] ? mapPaymentTransaction(rows[0]) : null;
    },
    async setStatus(id, status, { confirmedAt } = {}) {
      const { rows } = await pool.query(
        'UPDATE payment_transactions SET status=$2, confirmed_at=$3 WHERE id=$1 RETURNING *',
        [id, status, confirmedAt || null]
      );
      return rows[0] ? mapPaymentTransaction(rows[0]) : null;
    },
    // Validation Gate (spec section 21/22) - a refund transaction records which original
    // transaction it reverses in its own metadata; this is how ManualBillingProvider.refund()
    // refuses a second refund attempt for the same original rather than creating a duplicate
    // pending refund transaction.
    async findRefundFor(originalTransactionId) {
      const { rows } = await pool.query(
        `SELECT * FROM payment_transactions WHERE type='refund' AND metadata->>'originalTransactionId'=$1 LIMIT 1`,
        [originalTransactionId]
      );
      return rows[0] ? mapPaymentTransaction(rows[0]) : null;
    },
    async listForUser(userId, { limit } = {}) {
      const { rows } = await pool.query('SELECT * FROM payment_transactions WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2', [userId, limit || 50]);
      return rows.map(mapPaymentTransaction);
    },
    async listAll({ status, limit } = {}) {
      const { rows } = status
        ? await pool.query('SELECT * FROM payment_transactions WHERE status=$1 ORDER BY created_at DESC LIMIT $2', [status, limit || 200])
        : await pool.query('SELECT * FROM payment_transactions ORDER BY created_at DESC LIMIT $1', [limit || 200]);
      return rows.map(mapPaymentTransaction);
    }
  };

  // Idempotency guard for provider events (spec section 15) - a (provider, externalEventId) pair
  // can only ever be recorded once; `ON CONFLICT DO NOTHING` + checking `rows.length` is how the
  // caller (server/commercial/payment-service.mjs) learns whether THIS call was the one that
  // actually got to process the event, or a harmless replay.
  const paymentEvents = {
    async recordIfNew({ provider, externalEventId, transactionId }) {
      const { rows } = await pool.query(
        `INSERT INTO payment_events (id, provider, external_event_id, transaction_id)
         VALUES ($1,$2,$3,$4) ON CONFLICT (provider, external_event_id) DO NOTHING RETURNING *`,
        [newId('paymentEvent'), provider, externalEventId, transactionId || null]
      );
      return { isNew: rows.length > 0 };
    }
  };

  function mapCryptoInvoice(row) {
    return {
      id: row.id, transactionId: row.transaction_id, provider: row.provider, chainId: row.chain_id,
      assetSymbol: row.asset_symbol, tokenContract: row.token_contract, tokenDecimals: row.token_decimals,
      recipientAddress: row.recipient_address, atomicAmount: row.atomic_amount, usdAmountMicroUsd: Number(row.usd_amount_micro_usd),
      exchangeRateSnapshot: row.exchange_rate_snapshot == null ? null : Number(row.exchange_rate_snapshot),
      status: row.status, expiresAt: row.expires_at, gatewayInvoiceId: row.gateway_invoice_id, txHash: row.tx_hash,
      confirmationCount: row.confirmation_count, createdAt: row.created_at, confirmedAt: row.confirmed_at,
      mismatchCreditedMicroUsd: row.mismatch_credited_micro_usd == null ? null : Number(row.mismatch_credited_micro_usd)
    };
  }
  // Real BSC crypto payment invoices (task A) - one row per payment_transactions row, created
  // once with every chain/pricing fact frozen (see 038_crypto_invoices.sql's own comment); only
  // status/tx_hash/confirmation_count/confirmed_at are ever updated afterward.
  const cryptoInvoices = {
    async create({ transactionId, provider, chainId, assetSymbol, tokenContract, tokenDecimals, recipientAddress, atomicAmount, usdAmountMicroUsd, exchangeRateSnapshot, expiresAt, gatewayInvoiceId }) {
      const { rows } = await pool.query(
        `INSERT INTO crypto_invoices
           (id, transaction_id, provider, chain_id, asset_symbol, token_contract, token_decimals, recipient_address, atomic_amount, usd_amount_micro_usd, exchange_rate_snapshot, expires_at, gateway_invoice_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
        [
          newId('cryptoInvoice'), transactionId, provider || 'bsc_crypto', chainId, assetSymbol, tokenContract, tokenDecimals,
          recipientAddress, String(atomicAmount), usdAmountMicroUsd, exchangeRateSnapshot, expiresAt, gatewayInvoiceId || null
        ]
      );
      return mapCryptoInvoice(rows[0]);
    },
    async get(id) {
      const { rows } = await pool.query('SELECT * FROM crypto_invoices WHERE id=$1', [id]);
      return rows[0] ? mapCryptoInvoice(rows[0]) : null;
    },
    async getByTransactionId(transactionId) {
      const { rows } = await pool.query('SELECT * FROM crypto_invoices WHERE transaction_id=$1', [transactionId]);
      return rows[0] ? mapCryptoInvoice(rows[0]) : null;
    },
    // Atomic claim: a tx hash already used by ANY invoice (not just this one) refuses the claim -
    // the DB-level UNIQUE constraint on tx_hash is the real guarantee; ON CONFLICT DO NOTHING lets
    // the caller distinguish "I claimed it" from "someone/something already had it" without a
    // separate SELECT-then-UPDATE race. Re-claiming the SAME hash THIS invoice already holds is an
    // idempotent no-op success (checked first, before the conditional UPDATE, which only ever
    // fires when tx_hash IS NULL) - required for a legitimate retry (e.g. "insufficient
    // confirmations, check again later" with the same tx hash) to ever succeed later.
    async claimTxHash(id, txHash) {
      const current = await pool.query('SELECT * FROM crypto_invoices WHERE id=$1', [id]);
      if (current.rows[0] && current.rows[0].tx_hash === txHash) return { ok: true, invoice: mapCryptoInvoice(current.rows[0]) };
      const { rows } = await pool.query('UPDATE crypto_invoices SET tx_hash=$2 WHERE id=$1 AND tx_hash IS NULL RETURNING *', [id, txHash]);
      if (rows[0]) return { ok: true, invoice: mapCryptoInvoice(rows[0]) };
      // Either this invoice already has a different hash claimed, or the hash belongs to another
      // invoice (UNIQUE violation) - both are "not claimed by this call", never thrown as a 500.
      const existing = await pool.query('SELECT * FROM crypto_invoices WHERE tx_hash=$1', [txHash]).catch(() => ({ rows: [] }));
      return { ok: false, claimedByOtherInvoice: existing.rows.length > 0 && existing.rows[0].id !== id };
    },
    async updateStatus(id, status, { confirmationCount, confirmedAt, mismatchCreditedMicroUsd } = {}) {
      const { rows } = await pool.query(
        'UPDATE crypto_invoices SET status=$2, confirmation_count=COALESCE($3, confirmation_count), confirmed_at=$4, mismatch_credited_micro_usd=COALESCE($5, mismatch_credited_micro_usd) WHERE id=$1 RETURNING *',
        [id, status, confirmationCount ?? null, confirmedAt || null, mismatchCreditedMicroUsd ?? null]
      );
      return rows[0] ? mapCryptoInvoice(rows[0]) : null;
    }
  };

  // Encrypted-at-rest BSC provider secrets (admin-config task, section B) - a singleton row (id
  // 'default'), deliberately separate from commercial_config_overrides/versions (see
  // 039_bsc_payment_secrets.sql's own comment). Every write is an upsert against that one row;
  // get() is the ONLY method any admin/browser-facing route may call - getRaw() is internal-only
  // (server/commercial/bsc-config.mjs), matching admin_voice_provider_credentials' masked-by-
  // default convention exactly.
  const bscPaymentSecrets = {
    async _row() {
      const { rows } = await pool.query('SELECT * FROM bsc_payment_secrets WHERE id=$1', ['default']);
      return rows[0] || null;
    },
    async get() { return mapBscSecretsStatus(await bscPaymentSecrets._row()); },
    async getRaw() { return mapBscSecretsRaw(await bscPaymentSecrets._row()); },
    async setRpcUrl(plaintextUrl, { updatedBy } = {}) {
      const encrypted = encryptSecret(plaintextUrl, encryptionKeyHex());
      await pool.query(
        `INSERT INTO bsc_payment_secrets (id, rpc_url_encrypted, updated_by, updated_at) VALUES ('default',$1,$2,now())
         ON CONFLICT (id) DO UPDATE SET rpc_url_encrypted=$1, updated_by=$2, updated_at=now()`,
        [encrypted, updatedBy || null]
      );
      return bscPaymentSecrets.get();
    },
    async clearRpcUrl({ updatedBy } = {}) {
      await pool.query(
        `INSERT INTO bsc_payment_secrets (id, rpc_url_encrypted, updated_by, updated_at) VALUES ('default',NULL,$1,now())
         ON CONFLICT (id) DO UPDATE SET rpc_url_encrypted=NULL, updated_by=$1, updated_at=now()`,
        [updatedBy || null]
      );
      return bscPaymentSecrets.get();
    },
    async setWebhookSecret(plaintextSecret, { updatedBy } = {}) {
      const encrypted = encryptSecret(plaintextSecret, encryptionKeyHex());
      const hint = String(plaintextSecret).slice(-4);
      await pool.query(
        `INSERT INTO bsc_payment_secrets (id, webhook_secret_encrypted, webhook_secret_hint, updated_by, updated_at) VALUES ('default',$1,$2,$3,now())
         ON CONFLICT (id) DO UPDATE SET webhook_secret_encrypted=$1, webhook_secret_hint=$2, updated_by=$3, updated_at=now()`,
        [encrypted, hint, updatedBy || null]
      );
      return bscPaymentSecrets.get();
    },
    async clearWebhookSecret({ updatedBy } = {}) {
      await pool.query(
        `INSERT INTO bsc_payment_secrets (id, webhook_secret_encrypted, webhook_secret_hint, updated_by, updated_at) VALUES ('default',NULL,NULL,$1,now())
         ON CONFLICT (id) DO UPDATE SET webhook_secret_encrypted=NULL, webhook_secret_hint=NULL, updated_by=$1, updated_at=now()`,
        [updatedBy || null]
      );
      return bscPaymentSecrets.get();
    },
    async recordTestResult({ ok, chainId }) {
      await pool.query(
        `INSERT INTO bsc_payment_secrets (id, last_tested_at, last_test_ok, last_detected_chain_id) VALUES ('default',now(),$1,$2)
         ON CONFLICT (id) DO UPDATE SET last_tested_at=now(), last_test_ok=$1, last_detected_chain_id=$2`,
        [Boolean(ok), Number.isFinite(chainId) ? chainId : null]
      );
      return bscPaymentSecrets.get();
    }
  };

  // AI Cost Control (043_ai_cost_control.sql) - encrypted credentials for a provider's EXTERNAL
  // cost-reconciliation API (e.g. an OpenAI organization admin key), deliberately separate from
  // both the legacy plaintext admin_ai_keys (used to call the model API itself) and
  // admin_voice_provider_credentials (a different provider category). Same shape/pattern as
  // voiceProviderCredentials above - multi-row, multi-provider, generated id, includeDecrypted
  // gated the same way.
  function mapCostCredential(row, { includeDecrypted } = {}) {
    const base = {
      id: row.id, provider: row.provider, label: row.label, keyHint: row.key_hint, scopeConfig: row.scope_config || {}, enabled: row.enabled,
      validationStatus: row.validation_status, validationError: row.validation_error, validatedAt: row.validated_at,
      updatedBy: row.updated_by, createdAt: row.created_at, updatedAt: row.updated_at
    };
    if (includeDecrypted) base.apiKey = decryptSecret(row.api_key_encrypted, encryptionKeyHex());
    return base;
  }
  const providerCostCredentials = {
    async create({ provider, label, apiKey, scopeConfig, updatedBy }) {
      const trimmed = sanitizeApiKey(apiKey);
      if (!trimmed) throw new ApiError(400, 'VALIDATION_FAILED');
      const id = newId('providerCostCred');
      const encrypted = encryptSecret(trimmed, encryptionKeyHex());
      const { rows } = await pool.query(
        `INSERT INTO provider_cost_credentials (id, provider, label, api_key_encrypted, key_hint, scope_config, updated_by, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,now(),now()) RETURNING *`,
        [id, String(provider || '').trim(), String(label || '').trim() || 'Untitled credential', encrypted, voiceKeyHintFor(trimmed), JSON.stringify(scopeConfig || {}), updatedBy || null]
      );
      return mapCostCredential(rows[0]);
    },
    // A blank/omitted apiKey retains the existing encrypted value - same convention as
    // voiceProviderCredentials.replace(). A real key replacement resets validation_status.
    async replace(id, { label, apiKey, scopeConfig, enabled, updatedBy }) {
      const trimmed = apiKey != null ? sanitizeApiKey(apiKey) : '';
      const sets = ['updated_at = now()', 'updated_by = $2'];
      const values = [id, updatedBy || null];
      let idx = 3;
      if (label != null) { sets.push(`label = $${idx}`); values.push(String(label).trim() || 'Untitled credential'); idx += 1; }
      if (scopeConfig != null) { sets.push(`scope_config = $${idx}`); values.push(JSON.stringify(scopeConfig)); idx += 1; }
      if (enabled != null) { sets.push(`enabled = $${idx}`); values.push(Boolean(enabled)); idx += 1; }
      if (trimmed) {
        sets.push(`api_key_encrypted = $${idx}`); values.push(encryptSecret(trimmed, encryptionKeyHex())); idx += 1;
        sets.push(`key_hint = $${idx}`); values.push(voiceKeyHintFor(trimmed)); idx += 1;
        sets.push("validation_status = 'unknown'", 'validation_error = NULL', 'validated_at = NULL');
      }
      const { rows } = await pool.query(`UPDATE provider_cost_credentials SET ${sets.join(', ')} WHERE id = $1 RETURNING *`, values);
      if (!rows[0]) throw new ApiError(404, 'CREDENTIAL_NOT_FOUND');
      return mapCostCredential(rows[0]);
    },
    async recordValidation(id, { status, error }) {
      const { rows } = await pool.query(
        `UPDATE provider_cost_credentials SET validation_status=$2, validation_error=$3, validated_at=now(), updated_at=now() WHERE id=$1 RETURNING *`,
        [id, status, error || null]
      );
      return rows[0] ? mapCostCredential(rows[0]) : null;
    },
    async delete(id) {
      const { rowCount } = await pool.query('DELETE FROM provider_cost_credentials WHERE id = $1', [id]);
      return rowCount > 0;
    },
    async list() {
      const { rows } = await pool.query('SELECT * FROM provider_cost_credentials ORDER BY provider ASC, created_at ASC');
      return rows.map((row) => mapCostCredential(row));
    },
    async listByProvider(provider) {
      const { rows } = await pool.query('SELECT * FROM provider_cost_credentials WHERE provider=$1 ORDER BY created_at ASC', [provider]);
      return rows.map((row) => mapCostCredential(row));
    },
    // includeDecrypted must NEVER be set true by any admin/browser-facing route - only the
    // adapter that actually calls the provider's cost API is allowed to pass it.
    async get(id, { includeDecrypted } = {}) {
      const { rows } = await pool.query('SELECT * FROM provider_cost_credentials WHERE id = $1', [id]);
      return rows[0] ? mapCostCredential(rows[0], { includeDecrypted }) : null;
    }
  };

  // AI Cost Control: one row per admin-triggered fetch against a provider's official cost API,
  // plus its resulting immutable line-item snapshots. See 043_ai_cost_control.sql's own comment
  // for why a read always picks ONE run's rows rather than merging across runs.
  function mapCostSyncRun(row) {
    return {
      id: row.id, provider: row.provider, scopeKey: row.scope_key, requestedStart: row.requested_start, requestedEnd: row.requested_end,
      status: row.status, errorCode: row.error_code, triggeredBy: row.triggered_by, startedAt: row.started_at, finishedAt: row.finished_at
    };
  }
  function mapCostSnapshot(row) {
    return {
      id: row.id, syncRunId: row.sync_run_id, provider: row.provider, scopeKey: row.scope_key,
      periodStart: row.period_start, periodEnd: row.period_end, currency: row.currency,
      amountMicroUsd: Number(row.amount_micro_usd), lineItem: row.line_item, projectId: row.project_id, createdAt: row.created_at
    };
  }
  const providerCostSync = {
    async createRun({ provider, scopeKey, requestedStart, requestedEnd, triggeredBy }) {
      const id = newId('providerCostSyncRun');
      const { rows } = await pool.query(
        `INSERT INTO provider_cost_sync_runs (id, provider, scope_key, requested_start, requested_end, status, triggered_by, started_at)
         VALUES ($1,$2,$3,$4,$5,'running',$6,now()) RETURNING *`,
        [id, provider, scopeKey || 'default', requestedStart, requestedEnd, triggeredBy || null]
      );
      return mapCostSyncRun(rows[0]);
    },
    async finishRun(id, { status, errorCode } = {}) {
      const { rows } = await pool.query(
        `UPDATE provider_cost_sync_runs SET status=$2, error_code=$3, finished_at=now() WHERE id=$1 RETURNING *`,
        [id, status, errorCode || null]
      );
      return rows[0] ? mapCostSyncRun(rows[0]) : null;
    },
    async insertSnapshots(syncRunId, rows) {
      if (!rows || !rows.length) return [];
      const run = await pool.query('SELECT provider, scope_key FROM provider_cost_sync_runs WHERE id=$1', [syncRunId]);
      if (!run.rows[0]) throw new ApiError(404, 'SYNC_RUN_NOT_FOUND');
      const { provider, scope_key: scopeKey } = run.rows[0];
      const inserted = [];
      for (const row of rows) {
        const { rows: result } = await pool.query(
          `INSERT INTO provider_cost_snapshots (id, sync_run_id, provider, scope_key, period_start, period_end, currency, amount_micro_usd, line_item, project_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
          [newId('providerCostSnapshot'), syncRunId, provider, scopeKey, row.periodStart, row.periodEnd, row.currency || 'usd', row.amountMicroUsd, row.lineItem || null, row.projectId || null]
        );
        inserted.push(mapCostSnapshot(result[0]));
      }
      return inserted;
    },
    async snapshotsForRun(syncRunId) {
      const { rows } = await pool.query('SELECT * FROM provider_cost_snapshots WHERE sync_run_id=$1 ORDER BY period_start ASC', [syncRunId]);
      return rows.map(mapCostSnapshot);
    },
    // The one real read this whole domain exists for: the LATEST successful (never partial/error)
    // run for (provider, scopeKey) whose OWN requested range fully covers [start, end) - the
    // deterministic "pick one run" rule 043_ai_cost_control.sql's comment requires, so two
    // overlapping refreshes can never be summed together.
    async latestSuccessfulRunCovering({ provider, scopeKey, start, end }) {
      const { rows } = await pool.query(
        `SELECT * FROM provider_cost_sync_runs
         WHERE provider=$1 AND scope_key=$2 AND status='success' AND requested_start <= $3 AND requested_end >= $4
         ORDER BY finished_at DESC LIMIT 1`,
        [provider, scopeKey || 'default', start, end]
      );
      return rows[0] ? mapCostSyncRun(rows[0]) : null;
    },
    async latestRunsByProvider() {
      const { rows } = await pool.query(
        `SELECT DISTINCT ON (provider, scope_key) * FROM provider_cost_sync_runs ORDER BY provider, scope_key, started_at DESC`
      );
      return rows.map(mapCostSyncRun);
    },
    async recentRuns({ provider, limit } = {}) {
      const { rows } = provider
        ? await pool.query('SELECT * FROM provider_cost_sync_runs WHERE provider=$1 ORDER BY started_at DESC LIMIT $2', [provider, limit || 20])
        : await pool.query('SELECT * FROM provider_cost_sync_runs ORDER BY started_at DESC LIMIT $1', [limit || 20]);
      return rows.map(mapCostSyncRun);
    }
  };

  // Explicitly-labeled manual balance entries - never read by any reconciliation math (see
  // 043_ai_cost_control.sql's own comment).
  function mapBalanceSnapshot(row) {
    return {
      id: row.id, provider: row.provider, amountMicroUsd: Number(row.amount_micro_usd), currency: row.currency,
      note: row.note, adminUserId: row.admin_user_id, createdAt: row.created_at
    };
  }
  const providerBalanceSnapshots = {
    async create({ provider, amountMicroUsd, currency, note, adminUserId }) {
      const { rows } = await pool.query(
        `INSERT INTO provider_balance_manual_snapshots (id, provider, amount_micro_usd, currency, note, admin_user_id)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [newId('providerBalanceSnapshot'), provider, amountMicroUsd, currency || 'usd', note || null, adminUserId || null]
      );
      return mapBalanceSnapshot(rows[0]);
    },
    async latest(provider) {
      const { rows } = await pool.query('SELECT * FROM provider_balance_manual_snapshots WHERE provider=$1 ORDER BY created_at DESC LIMIT 1', [provider]);
      return rows[0] ? mapBalanceSnapshot(rows[0]) : null;
    }
  };

  function mapStorageProduct(row) {
    return {
      id: row.id, name: row.name, capacityBytes: Number(row.capacity_bytes), priceAmountMicroUsd: Number(row.price_amount_micro_usd),
      currency: row.currency, validityDays: row.validity_days, enabled: row.enabled, displayOrder: row.display_order,
      stackingAllowed: row.stacking_allowed, purchaseLimit: row.purchase_limit, updatedAt: row.updated_at
    };
  }
  const storageProducts = {
    // Lazily self-seeds the 3 default products (spec section 6) on first call, rather than a
    // migration-level INSERT (this repo's migrations never seed rows) - fixed ids make this
    // idempotent, and every row (including the defaults) is a real, independently editable row
    // from the moment it's inserted, never a synthetic/merged value.
    async list() {
      const { rows: countRows } = await pool.query('SELECT COUNT(*)::int AS count FROM storage_products');
      if (countRows[0].count === 0) {
        for (const product of DEFAULT_STORAGE_PRODUCTS) {
          await pool.query(
            `INSERT INTO storage_products (id, name, capacity_bytes, price_amount_micro_usd, currency, validity_days, display_order)
             VALUES ($1,$2,$3,$4,'USD',$5,$6) ON CONFLICT (id) DO NOTHING`,
            [product.id, product.name, product.capacityBytes, Math.round(product.priceAmountUsd * 1000000), product.validityDays, product.displayOrder]
          );
        }
      }
      const { rows } = await pool.query('SELECT * FROM storage_products ORDER BY display_order ASC, name ASC');
      return rows.map(mapStorageProduct);
    },
    // Ensures the lazy self-seed (see list()'s own comment) has run even when a caller looks up a
    // single default product's id before ever calling list() on this process/repo - otherwise a
    // fresh install's very first purchase attempt would 404 on 'storage-25' before it exists.
    async get(id) {
      await storageProducts.list();
      const { rows } = await pool.query('SELECT * FROM storage_products WHERE id=$1', [id]);
      return rows[0] ? mapStorageProduct(rows[0]) : null;
    },
    async upsert({ id, name, capacityBytes, priceAmountMicroUsd, currency, validityDays, enabled, displayOrder, stackingAllowed, purchaseLimit }) {
      const rowId = id || newId('storageProduct');
      const { rows } = await pool.query(
        `INSERT INTO storage_products (id, name, capacity_bytes, price_amount_micro_usd, currency, validity_days, enabled, display_order, stacking_allowed, purchase_limit, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
         ON CONFLICT (id) DO UPDATE SET name=$2, capacity_bytes=$3, price_amount_micro_usd=$4, currency=$5,
           validity_days=$6, enabled=$7, display_order=$8, stacking_allowed=$9, purchase_limit=$10, updated_at=now()
         RETURNING *`,
        [rowId, name, capacityBytes, priceAmountMicroUsd, currency || 'USD', validityDays, enabled !== false, displayOrder || 0, stackingAllowed !== false, purchaseLimit || null]
      );
      return mapStorageProduct(rows[0]);
    }
  };

  function mapStorageEntitlement(row) {
    return {
      id: row.id, userId: row.user_id, productId: row.product_id, capacityBytesSnapshot: Number(row.capacity_bytes_snapshot),
      pricePaidSnapshotMicroUsd: Number(row.price_paid_snapshot_micro_usd), currency: row.currency,
      validityDaysSnapshot: row.validity_days_snapshot, startsAt: row.starts_at, expiresAt: row.expires_at,
      status: row.status, paymentTransactionId: row.payment_transaction_id, createdAt: row.created_at
    };
  }
  const storageEntitlements = {
    async create({ userId, productId, capacityBytesSnapshot, pricePaidSnapshotMicroUsd, currency, validityDaysSnapshot, expiresAt, paymentTransactionId }) {
      const { rows } = await pool.query(
        `INSERT INTO storage_entitlements (id, user_id, product_id, capacity_bytes_snapshot, price_paid_snapshot_micro_usd, currency, validity_days_snapshot, expires_at, payment_transaction_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [newId('storageEntitlement'), userId, productId || null, capacityBytesSnapshot, pricePaidSnapshotMicroUsd, currency || 'USD', validityDaysSnapshot, expiresAt, paymentTransactionId || null]
      );
      return mapStorageEntitlement(rows[0]);
    },
    async listForUser(userId) {
      const { rows } = await pool.query('SELECT * FROM storage_entitlements WHERE user_id=$1 ORDER BY expires_at DESC', [userId]);
      return rows.map(mapStorageEntitlement);
    },
    async sumActiveCapacityForUser(userId) {
      const { rows } = await pool.query('SELECT COALESCE(SUM(capacity_bytes_snapshot),0) AS total FROM storage_entitlements WHERE user_id=$1 AND expires_at > now()', [userId]);
      return Number(rows[0].total);
    },
    async get(id) {
      const { rows } = await pool.query('SELECT * FROM storage_entitlements WHERE id=$1', [id]);
      return rows[0] ? mapStorageEntitlement(rows[0]) : null;
    },
    // Validation Gate (spec section 20) - a fully refunded storage purchase revokes its
    // entitlement immediately by moving expires_at to now(), reusing the exact same read-time
    // expiry gate sumActiveCapacityForUser()/the storage quota resolver already trust - no new
    // "revoked" status concept needed. Files are never touched (spec: "Do NOT delete files").
    async revoke(id) {
      const { rows } = await pool.query(
        `UPDATE storage_entitlements SET expires_at=now(), status='expired' WHERE id=$1 RETURNING *`,
        [id]
      );
      return rows[0] ? mapStorageEntitlement(rows[0]) : null;
    },
    async getByPaymentTransactionId(transactionId) {
      const { rows } = await pool.query('SELECT * FROM storage_entitlements WHERE payment_transaction_id=$1', [transactionId]);
      return rows[0] ? mapStorageEntitlement(rows[0]) : null;
    }
  };

  function mapStorageObject(row) {
    return {
      id: row.id, userId: row.user_id, objectKey: row.object_key, sizeBytes: Number(row.size_bytes), mimeType: row.mime_type,
      category: row.category, sourceDomain: row.source_domain, sourceRecordId: row.source_record_id,
      createdAt: row.created_at, deletedAt: row.deleted_at
    };
  }
  const storageObjects = {
    async record({ userId, objectKey, sizeBytes, mimeType, category, sourceDomain, sourceRecordId }) {
      const { rows } = await pool.query(
        `INSERT INTO storage_objects (id, user_id, object_key, size_bytes, mime_type, category, source_domain, source_record_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [newId('storageObject'), userId, objectKey, sizeBytes, mimeType || null, category, sourceDomain || null, sourceRecordId || null]
      );
      return mapStorageObject(rows[0]);
    },
    async sumActiveBytesForUser(userId) {
      const { rows } = await pool.query('SELECT COALESCE(SUM(size_bytes),0) AS total FROM storage_objects WHERE user_id=$1 AND deleted_at IS NULL', [userId]);
      return Number(rows[0].total);
    },
    async get(id) {
      const { rows } = await pool.query('SELECT * FROM storage_objects WHERE id=$1', [id]);
      return rows[0] ? mapStorageObject(rows[0]) : null;
    },
    async listActiveForUser(userId) {
      const { rows } = await pool.query('SELECT * FROM storage_objects WHERE user_id=$1 AND deleted_at IS NULL ORDER BY created_at DESC', [userId]);
      return rows.map(mapStorageObject);
    },
    // Validation Gate (spec section 15) - marks the metadata deleted; the caller
    // (server/community/routes.storage.mjs) is responsible for having already deleted the real
    // file via ObjectStorageProvider.delete() first. Idempotent: marking an already-deleted row
    // deleted again is harmless (deleted_at simply moves forward).
    async markDeleted(id) {
      const { rows } = await pool.query('UPDATE storage_objects SET deleted_at=now() WHERE id=$1 RETURNING *', [id]);
      return rows[0] ? mapStorageObject(rows[0]) : null;
    },
    // P0-2 launch-readiness fix (server/community/security/upload-ownership.mjs) - the fast,
    // indexed ownership lookup for every upload made since this table existed (051_upload_
    // ownership_indexes.sql adds the object_key index this depends on). Returns a plain userId or
    // null, matching every other findOwnerBy*() method's shape, not the full mapped row.
    async findActiveByObjectKey(objectKey) {
      const { rows } = await pool.query(
        'SELECT user_id FROM storage_objects WHERE object_key=$1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1',
        [objectKey]
      );
      return rows[0] ? rows[0].user_id : null;
    }
  };

  // Module 5 (final module) of the local-first-to-server migration. One row per user, the
  // entire client profile stored (and returned) verbatim as a single jsonb column - no child
  // tables, no transaction needed (a single-row upsert can't partially fail the way a
  // parent-plus-children upsert can), see the migration file's reasoning.
  const mentalHealthProfile = {
    async upsert(userId, profile) {
      if (!profile || typeof profile !== 'object') throw new ApiError(400, 'VALIDATION_FAILED');
      const { rows } = await pool.query(
        `INSERT INTO mental_health_profiles (user_id, profile, updated_at) VALUES ($1,$2,now())
         ON CONFLICT (user_id) DO UPDATE SET profile=$2, updated_at=now()
         RETURNING profile`,
        [userId, JSON.stringify(profile)]
      );
      return rows[0].profile;
    },
    async get(userId) {
      const { rows } = await pool.query('SELECT profile FROM mental_health_profiles WHERE user_id=$1', [userId]);
      return rows[0] ? rows[0].profile : null;
    }
  };

  // Journey G (AI Companion & Journey Orchestration). Same one-row-per-user, whole-document jsonb
  // shape as mentalHealthProfile above, for the same reason - see 018_companion_state.sql.
  const companionState = {
    async upsert(userId, companionStateBody) {
      if (!companionStateBody || typeof companionStateBody !== 'object') throw new ApiError(400, 'VALIDATION_FAILED');
      const { rows } = await pool.query(
        `INSERT INTO companion_state (user_id, state, updated_at) VALUES ($1,$2,now())
         ON CONFLICT (user_id) DO UPDATE SET state=$2, updated_at=now()
         RETURNING state`,
        [userId, JSON.stringify(companionStateBody)]
      );
      return rows[0].state;
    },
    async get(userId) {
      const { rows } = await pool.query('SELECT state FROM companion_state WHERE user_id=$1', [userId]);
      return rows[0] ? rows[0].state : null;
    }
  };

  // Phase 8a of the local-first-to-server-authoritative migration (see ARCHITECTURE.md's Known
  // Constraints section, 019_session_signatures_and_preferences.sql). Flat where the client
  // actually compares/filters, jsonb where nothing queries into individual fields - see the
  // migration file's own comment.
  function mapSessionSignature(row) {
    return {
      id: row.id, sessionId: row.session_id, character: row.character, market: row.market,
      timeframe: row.timeframe, date: row.date, movementSequence: row.movement_sequence,
      patternIds: row.pattern_ids, strategyIds: row.strategy_ids, scenarioOutcomes: row.scenario_outcomes,
      tradeSummary: row.trade_summary, fateSummaryText: row.fate_summary_text, instrument: row.instrument, createdAt: row.created_at
    };
  }
  const sessionSignatures = {
    async upsert(userId, record) {
      if (!record || !record.id || !record.sessionId) throw new ApiError(400, 'VALIDATION_FAILED');
      // Ownership pre-check before the INSERT ... ON CONFLICT, same as patterns/trading_sessions
      // above - without it, ON CONFLICT (id) DO UPDATE would happily overwrite another user's
      // row's content (the SET clause never touches user_id, but every other field would still
      // silently change under a stranger's POST).
      const { rows: ownerRows } = await pool.query('SELECT user_id FROM session_signatures WHERE id=$1', [record.id]);
      if (ownerRows[0] && ownerRows[0].user_id !== userId) throw new ApiError(403, 'NOT_SIGNATURE_OWNER');
      // Instrument Catalog domain (025_instrument_catalog.sql): signatures are server-derived
      // from a real session (session-signature-store.js's buildSignatureFromSession()), never
      // directly user-authored, so this is a defensive consistency check rather than a hard
      // "required" gate - a signature backfilled from a legacy, instrument-less session stays
      // null, which session-signature-engine.js's compare() already treats as fail-closed.
      const instrument = normalizeInstrumentCode(record.instrument);
      if (instrument) await assertInstrumentInCatalog(pool, userId, instrument);
      const { rows } = await pool.query(
        `INSERT INTO session_signatures
           (id, user_id, session_id, character, market, timeframe, date, movement_sequence, pattern_ids, strategy_ids, scenario_outcomes, trade_summary, fate_summary_text, instrument)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         ON CONFLICT (id) DO UPDATE SET
           session_id=$3, character=$4, market=$5, timeframe=$6, date=$7, movement_sequence=$8,
           pattern_ids=$9, strategy_ids=$10, scenario_outcomes=$11, trade_summary=$12, fate_summary_text=$13, instrument=$14
         RETURNING *`,
        [record.id, userId, String(record.sessionId), record.character || '', record.market || '',
          record.timeframe || '', record.date || '', JSON.stringify(record.movementSequence || []),
          JSON.stringify(record.patternIds || []), JSON.stringify(record.strategyIds || []),
          JSON.stringify(record.scenarioOutcomes || []), JSON.stringify(record.tradeSummary || {}),
          record.fateSummaryText || '', instrument]
      );
      return mapSessionSignature(rows[0]);
    },
    async listByUser(userId) {
      const { rows } = await pool.query('SELECT * FROM session_signatures WHERE user_id=$1 ORDER BY created_at DESC', [userId]);
      return rows.map(mapSessionSignature);
    },
    async remove(userId, id) {
      const { rows } = await pool.query('SELECT user_id FROM session_signatures WHERE id=$1', [id]);
      if (!rows[0]) return;
      if (rows[0].user_id !== userId) throw new ApiError(403, 'NOT_SIGNATURE_OWNER');
      await pool.query('DELETE FROM session_signatures WHERE id=$1', [id]);
    }
  };

  // Generic {user_id, pref_key -> value} store shared by every Phase 8 sub-module that is a
  // small scalar/object setting rather than a growing list of its own records - see
  // 019_session_signatures_and_preferences.sql's own comment. Modeled as a list domain from the
  // client's perspective (one "record" per preference key, upserted/removed individually), the
  // same generic server-replica.js contract every list-shaped domain already uses - no new
  // client-side primitive needed for this shape.
  function mapPreference(row) {
    return { id: row.pref_key, value: row.value, updatedAt: row.updated_at };
  }
  const userPreferences = {
    async upsert(userId, prefKey, value) {
      const key = String(prefKey || '');
      if (!key) throw new ApiError(400, 'VALIDATION_FAILED');
      const { rows } = await pool.query(
        `INSERT INTO user_preferences (user_id, pref_key, value, updated_at) VALUES ($1,$2,$3,now())
         ON CONFLICT (user_id, pref_key) DO UPDATE SET value=$3, updated_at=now()
         RETURNING *`,
        [userId, key, JSON.stringify(value ?? null)]
      );
      return mapPreference(rows[0]);
    },
    async listByUser(userId) {
      const { rows } = await pool.query('SELECT * FROM user_preferences WHERE user_id=$1 ORDER BY pref_key ASC', [userId]);
      return rows.map(mapPreference);
    },
    async remove(userId, prefKey) {
      await pool.query('DELETE FROM user_preferences WHERE user_id=$1 AND pref_key=$2', [userId, String(prefKey || '')]);
    }
  };

  // One row per conversation (017_ai_conversations.sql) - the global AI assistant dock's real,
  // multiple, resumable chat threads. `messages` stays a single jsonb array per row (same
  // "nothing queries into it individually" reasoning as mentalHealthProfile/strategies'
  // chatHistory) - only `list()` needs the lightweight per-conversation summary shape.
  function mapConversation(row) {
    return { id: row.id, userId: row.user_id, title: row.title, provider: row.provider, messages: row.messages, tokens: row.total_tokens, updatedAt: row.updated_at };
  }
  const aiChatHistory = {
    async list(userId) {
      const { rows } = await pool.query(
        `SELECT id, title, provider, jsonb_array_length(messages) AS message_count, total_tokens, updated_at
         FROM ai_chat_history WHERE user_id=$1 ORDER BY updated_at DESC`,
        [userId]
      );
      return rows.map((row) => ({ id: row.id, title: row.title, provider: row.provider, messageCount: row.message_count, tokens: row.total_tokens, updatedAt: row.updated_at }));
    },
    async get(userId, id) {
      const { rows } = await pool.query('SELECT * FROM ai_chat_history WHERE id=$1 AND user_id=$2', [id, userId]);
      return rows[0] ? mapConversation(rows[0]) : null;
    },
    async create({ userId, provider, title, messages, tokens }) {
      if (!Array.isArray(messages)) throw new ApiError(400, 'VALIDATION_FAILED');
      const id = newId('aiConv');
      const { rows } = await pool.query(
        `INSERT INTO ai_chat_history (id, user_id, title, provider, messages, total_tokens, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,now()) RETURNING *`,
        [id, userId, title || 'Untitled conversation', provider || 'openai', JSON.stringify(messages), Math.max(0, Number(tokens) || 0)]
      );
      return mapConversation(rows[0]);
    },
    // Atomic append, not a whole-array replace: `messages` here is ONLY the new turn(s) being
    // added, concatenated onto the real, current row value server-side via jsonb's own `||`
    // operator inside a single UPDATE statement - Postgres serializes concurrent UPDATEs to the
    // same row, so this is safe regardless of how many tabs/devices append at once. The previous
    // shape (`SET messages=$3` with the client's own GET-then-concatenated full array) was a
    // classic lost-update race: two near-simultaneous appends (two tabs, or a slow request that
    // straddles a fast one) each read the same base array, each appended their own turn, and
    // whichever PATCH's UPDATE committed last silently discarded the other tab's message from the
    // stored history - it stayed visible in that tab's own local transcript state but vanished
    // from what any later GET (a different tab, a different device, a page reload) would ever see
    // again. total_tokens is likewise INCREMENTED (this call's own new tokens only), never
    // replaced.
    async appendAndSave(userId, id, { title, messages, tokens }) {
      if (!Array.isArray(messages) || !messages.length) throw new ApiError(400, 'VALIDATION_FAILED');
      const { rows } = await pool.query(
        `UPDATE ai_chat_history SET messages=messages || $3::jsonb, title=COALESCE($4, title), total_tokens=total_tokens+$5, updated_at=now()
         WHERE id=$1 AND user_id=$2 RETURNING *`,
        [id, userId, JSON.stringify(messages), title || null, Math.max(0, Number(tokens) || 0)]
      );
      return rows[0] ? mapConversation(rows[0]) : null;
    },
    async remove(userId, id) {
      const { rowCount } = await pool.query('DELETE FROM ai_chat_history WHERE id=$1 AND user_id=$2', [id, userId]);
      return rowCount > 0;
    }
  };

  // Real, server-side sessions (020_auth_sessions.sql) - see server/community/security/
  // session-service.mjs for the raw-id-vs-hash discipline (this domain only ever sees a hash).
  function mapAuthSession(row) {
    return {
      id: row.id, userId: row.user_id, sessionHash: row.session_hash, familyId: row.family_id,
      createdAt: row.created_at, lastSeenAt: row.last_seen_at, idleExpiresAt: row.idle_expires_at,
      absoluteExpiresAt: row.absolute_expires_at, revokedAt: row.revoked_at, revokedReason: row.revoked_reason,
      reauthAt: row.reauth_at, ipHash: row.ip_hash, userAgent: row.user_agent
    };
  }
  const authSessions = {
    // reauthAt is explicit (never a column default - see migration 020, which leaves reauth_at
    // with no DEFAULT at all) so a genuine login/step-up moment (session-service.mjs's createSession,
    // reauth:true) actually persists reauth_at=now(), and an explicitly non-reauth session
    // (reauth:false) persists NULL - both previously silently lost, since the old caller only
    // mutated the already-returned row.
    async create({ userId, sessionHash, familyId, idleExpiresAt, absoluteExpiresAt, reauthAt, ipHash, userAgent }) {
      const id = newId('asess');
      const { rows } = await pool.query(
        `INSERT INTO auth_sessions (id, user_id, session_hash, family_id, idle_expires_at, absolute_expires_at, reauth_at, ip_hash, user_agent)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [id, userId, sessionHash, familyId, idleExpiresAt, absoluteExpiresAt, reauthAt || null, ipHash || null, userAgent || null]
      );
      return mapAuthSession(rows[0]);
    },
    async findByHash(sessionHash) {
      const { rows } = await pool.query('SELECT * FROM auth_sessions WHERE session_hash=$1', [sessionHash]);
      return rows[0] ? mapAuthSession(rows[0]) : null;
    },
    async touch(id, { lastSeenAt, idleExpiresAt } = {}) {
      await pool.query(
        'UPDATE auth_sessions SET last_seen_at=$2, idle_expires_at=COALESCE($3, idle_expires_at) WHERE id=$1',
        [id, lastSeenAt || new Date().toISOString(), idleExpiresAt || null]
      );
    },
    async markReauth(id) {
      await pool.query('UPDATE auth_sessions SET reauth_at=now() WHERE id=$1', [id]);
    },
    async revoke(id, reason) {
      await pool.query('UPDATE auth_sessions SET revoked_at=now(), revoked_reason=$2 WHERE id=$1 AND revoked_at IS NULL', [id, reason || 'logout']);
    },
    async revokeAllForUser(userId, reason, { exceptId } = {}) {
      const { rowCount } = await pool.query(
        'UPDATE auth_sessions SET revoked_at=now(), revoked_reason=$2 WHERE user_id=$1 AND revoked_at IS NULL AND id IS DISTINCT FROM $3',
        [userId, reason || 'logout_all', exceptId || null]
      );
      return rowCount;
    },
    async revokeFamily(familyId, reason) {
      await pool.query('UPDATE auth_sessions SET revoked_at=now(), revoked_reason=$2 WHERE family_id=$1 AND revoked_at IS NULL', [familyId, reason || 'replay_detected']);
    },
    async listActiveForUser(userId) {
      const { rows } = await pool.query('SELECT * FROM auth_sessions WHERE user_id=$1 AND revoked_at IS NULL ORDER BY last_seen_at DESC', [userId]);
      return rows.map(mapAuthSession);
    },
    async deleteExpired(before) {
      const { rowCount } = await pool.query('DELETE FROM auth_sessions WHERE absolute_expires_at < $1', [before]);
      return rowCount;
    }
  };

  function mapExternalIdentity(row) {
    return { id: row.id, userId: row.user_id, issuer: row.issuer, subject: row.subject, emailAtLink: row.email_at_link, linkedAt: row.linked_at };
  }
  const externalIdentities = {
    async findUserId(issuer, subject) {
      const { rows } = await pool.query('SELECT user_id FROM external_identities WHERE issuer=$1 AND subject=$2', [issuer, subject]);
      return rows[0] ? rows[0].user_id : null;
    },
    async link({ userId, issuer, subject, emailAtLink }) {
      try {
        const { rows } = await pool.query(
          `INSERT INTO external_identities (id, user_id, issuer, subject, email_at_link) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
          [newId('extid'), userId, issuer, subject, emailAtLink || null]
        );
        return mapExternalIdentity(rows[0]);
      } catch (error) {
        if (error && error.code === '23505') {
          const { rows } = await pool.query('SELECT * FROM external_identities WHERE issuer=$1 AND subject=$2', [issuer, subject]);
          if (rows[0] && rows[0].user_id !== userId) throw new ApiError(409, 'IDENTITY_ALREADY_LINKED');
          return mapExternalIdentity(rows[0]);
        }
        throw error;
      }
    },
    async listForUser(userId) {
      const { rows } = await pool.query('SELECT * FROM external_identities WHERE user_id=$1', [userId]);
      return rows.map(mapExternalIdentity);
    }
  };

  const securityEvents = {
    async record({ userId, type, ipHash, detail }) {
      const { rows } = await pool.query(
        `INSERT INTO security_events (id, user_id, type, ip_hash, detail) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [newId('sevt'), userId || null, type, ipHash || null, JSON.stringify(detail || {})]
      );
      const row = rows[0];
      return { id: row.id, userId: row.user_id, type: row.type, ipHash: row.ip_hash, detail: row.detail, createdAt: row.created_at };
    },
    async listForUser(userId, { limit = 50 } = {}) {
      const { rows } = await pool.query('SELECT * FROM security_events WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2', [userId, limit]);
      return rows.map((row) => ({ id: row.id, userId: row.user_id, type: row.type, ipHash: row.ip_hash, detail: row.detail, createdAt: row.created_at }));
    },
    async countRecentByType(type, { sinceMs }) {
      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS count FROM security_events WHERE type=$1 AND created_at >= now() - ($2 || ' milliseconds')::interval`,
        [type, String(sinceMs)]
      );
      return rows[0] ? rows[0].count : 0;
    }
  };

  function mapAuthTransaction(row) {
    return { id: row.id, purpose: row.purpose, userId: row.user_id, tokenHash: row.token_hash, payload: row.payload, createdAt: row.created_at, expiresAt: row.expires_at, consumedAt: row.consumed_at };
  }
  const authTransactions = {
    async create({ id, purpose, userId, tokenHash, payload, expiresAt }) {
      const { rows } = await pool.query(
        `INSERT INTO auth_transactions (id, purpose, user_id, token_hash, payload, expires_at) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [id || newId('atxn'), purpose, userId || null, tokenHash || null, JSON.stringify(payload || {}), expiresAt]
      );
      return mapAuthTransaction(rows[0]);
    },
    async get(id) {
      const { rows } = await pool.query('SELECT * FROM auth_transactions WHERE id=$1', [id]);
      return rows[0] ? mapAuthTransaction(rows[0]) : null;
    },
    async findByTokenHash(tokenHash) {
      const { rows } = await pool.query('SELECT * FROM auth_transactions WHERE token_hash=$1', [tokenHash]);
      return rows[0] ? mapAuthTransaction(rows[0]) : null;
    },
    // Atomic claim: UPDATE ... WHERE consumed_at IS NULL AND expires_at > now() RETURNING * is a
    // single round trip, so two concurrent requests racing to consume the SAME transaction id
    // (a double-submitted OIDC callback, a reset link opened twice) can never both succeed -
    // exactly the "simultaneous callbacks" concurrency case called out in the instructions.
    async consume(id) {
      const { rows } = await pool.query(
        `UPDATE auth_transactions SET consumed_at=now() WHERE id=$1 AND consumed_at IS NULL AND expires_at > now() RETURNING *`,
        [id]
      );
      return rows[0] ? mapAuthTransaction(rows[0]) : null;
    },
    async deleteExpired(before) {
      const { rowCount } = await pool.query('DELETE FROM auth_transactions WHERE expires_at < $1', [before]);
      return rowCount;
    }
  };

  // Journey H2, Gate 2: Conversation Studio. Same draft/published/archived shape as
  // marketplace_listings' own status lifecycle, plus a real version history
  // (conversation_scenario_versions) - see 041_conversation_scenarios.sql for the full reasoning,
  // including why the two cross-table FKs are DEFERRABLE (create() below relies on it).
  async function composeScenario(client, scenarioRow) {
    const draftPromise = scenarioRow.draft_version_id
      ? client.query('SELECT * FROM conversation_scenario_versions WHERE id=$1', [scenarioRow.draft_version_id])
      : Promise.resolve({ rows: [] });
    const publishedPromise = scenarioRow.published_version_id
      ? client.query('SELECT * FROM conversation_scenario_versions WHERE id=$1', [scenarioRow.published_version_id])
      : Promise.resolve({ rows: [] });
    const [draftResult, publishedResult] = await Promise.all([draftPromise, publishedPromise]);
    return Object.assign(mapConversationScenario(scenarioRow), {
      draftVersion: draftResult.rows[0] ? mapConversationScenarioVersion(draftResult.rows[0]) : null,
      publishedVersion: publishedResult.rows[0] ? mapConversationScenarioVersion(publishedResult.rows[0]) : null
    });
  }
  async function nextVersionNumber(client, scenarioId) {
    const { rows } = await client.query('SELECT COALESCE(MAX(version_number),0) AS max FROM conversation_scenario_versions WHERE scenario_id=$1', [scenarioId]);
    return Number(rows[0].max) + 1;
  }
  const conversationScenarios = {
    async create({ scenarioKey, domain, kind, dataQueryRef, ctaActionId, allowedProcesses, allowedSteps, definition, createdBy }) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const scenarioId = newId('convscn');
        const versionId = newId('convscnver');
        let scenarioRow;
        try {
          ({ rows: [scenarioRow] } = await client.query(
            `INSERT INTO conversation_scenarios (id, scenario_key, domain, kind, data_query_ref, cta_action_id, allowed_processes, allowed_steps, draft_version_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
            [scenarioId, scenarioKey, domain || null, kind, dataQueryRef || null, ctaActionId || null,
              JSON.stringify(allowedProcesses || null), JSON.stringify(allowedSteps || null), versionId]
          ));
        } catch (error) {
          if (error && error.code === '23505') { await client.query('ROLLBACK'); throw new ApiError(409, 'SCENARIO_KEY_TAKEN'); }
          throw error;
        }
        const { rows: [versionRow] } = await client.query(
          `INSERT INTO conversation_scenario_versions (id, scenario_id, version_number, status, definition, created_by)
           VALUES ($1,$2,1,'draft',$3,$4) RETURNING *`,
          [versionId, scenarioId, JSON.stringify(definition || {}), createdBy || null]
        );
        await client.query('COMMIT');
        return Object.assign(mapConversationScenario(scenarioRow), { draftVersion: mapConversationScenarioVersion(versionRow), publishedVersion: null });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    async get(id) {
      const { rows } = await pool.query('SELECT * FROM conversation_scenarios WHERE id=$1', [id]);
      return rows[0] ? composeScenario(pool, rows[0]) : null;
    },
    async getByKey(scenarioKey) {
      const { rows } = await pool.query('SELECT * FROM conversation_scenarios WHERE scenario_key=$1', [scenarioKey]);
      return rows[0] ? composeScenario(pool, rows[0]) : null;
    },
    async list({ status, domain } = {}) {
      const params = [];
      let text = 'SELECT * FROM conversation_scenarios WHERE 1=1';
      if (domain) { params.push(domain); text += ` AND domain=$${params.length}`; }
      if (status === 'archived') text += ' AND archived_at IS NOT NULL';
      else if (status === 'published') text += ' AND archived_at IS NULL AND published_version_id IS NOT NULL';
      else if (status === 'draft') text += ' AND archived_at IS NULL AND draft_version_id IS NOT NULL';
      text += ' ORDER BY updated_at DESC';
      const { rows } = await pool.query(text, params);
      return Promise.all(rows.map((row) => composeScenario(pool, row)));
    },
    async listVersions(scenarioId) {
      const { rows } = await pool.query('SELECT * FROM conversation_scenario_versions WHERE scenario_id=$1 ORDER BY version_number DESC', [scenarioId]);
      return rows.map(mapConversationScenarioVersion);
    },
    async getVersion(versionId) {
      const { rows } = await pool.query('SELECT * FROM conversation_scenario_versions WHERE id=$1', [versionId]);
      return rows[0] ? mapConversationScenarioVersion(rows[0]) : null;
    },
    async updateDraft(scenarioId, definitionPatch) {
      const { rows: scenarioRows } = await pool.query('SELECT * FROM conversation_scenarios WHERE id=$1', [scenarioId]);
      if (!scenarioRows[0]) throw new ApiError(404, 'SCENARIO_NOT_FOUND');
      const scenario = scenarioRows[0];
      if (!scenario.draft_version_id) throw new ApiError(400, 'NO_DRAFT_TO_EDIT');
      const { rows: draftRows } = await pool.query('SELECT * FROM conversation_scenario_versions WHERE id=$1', [scenario.draft_version_id]);
      const merged = Object.assign({}, draftRows[0].definition, definitionPatch);
      await pool.query('UPDATE conversation_scenario_versions SET definition=$2, updated_at=now() WHERE id=$1', [scenario.draft_version_id, JSON.stringify(merged)]);
      await pool.query('UPDATE conversation_scenarios SET updated_at=now() WHERE id=$1', [scenarioId]);
      return composeScenario(pool, scenario);
    },
    async startNewRevision(scenarioId, createdBy) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows: scenarioRows } = await client.query('SELECT * FROM conversation_scenarios WHERE id=$1 FOR UPDATE', [scenarioId]);
        const scenario = scenarioRows[0];
        if (!scenario) throw new ApiError(404, 'SCENARIO_NOT_FOUND');
        if (scenario.draft_version_id) throw new ApiError(409, 'DRAFT_ALREADY_EXISTS');
        if (!scenario.published_version_id) throw new ApiError(400, 'NO_PUBLISHED_VERSION');
        const { rows: publishedRows } = await client.query('SELECT * FROM conversation_scenario_versions WHERE id=$1', [scenario.published_version_id]);
        const versionId = newId('convscnver');
        const versionNumber = await nextVersionNumber(client, scenarioId);
        const { rows: [versionRow] } = await client.query(
          `INSERT INTO conversation_scenario_versions (id, scenario_id, version_number, status, definition, created_by)
           VALUES ($1,$2,$3,'draft',$4,$5) RETURNING *`,
          [versionId, scenarioId, versionNumber, JSON.stringify(publishedRows[0].definition), createdBy || null]
        );
        const { rows: [updatedScenario] } = await client.query('UPDATE conversation_scenarios SET draft_version_id=$2, updated_at=now() WHERE id=$1 RETURNING *', [scenarioId, versionId]);
        await client.query('COMMIT');
        return Object.assign(mapConversationScenario(updatedScenario), { draftVersion: mapConversationScenarioVersion(versionRow), publishedVersion: mapConversationScenarioVersion(publishedRows[0]) });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    async publish(scenarioId, versionId, publishedBy) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows: scenarioRows } = await client.query('SELECT * FROM conversation_scenarios WHERE id=$1 FOR UPDATE', [scenarioId]);
        const scenario = scenarioRows[0];
        if (!scenario) throw new ApiError(404, 'SCENARIO_NOT_FOUND');
        if (scenario.draft_version_id !== versionId) throw new ApiError(400, 'NOT_CURRENT_DRAFT');
        const { rows: draftRows } = await client.query('SELECT * FROM conversation_scenario_versions WHERE id=$1', [versionId]);
        if (!draftRows[0] || draftRows[0].status !== 'draft') throw new ApiError(400, 'VERSION_NOT_DRAFT');
        if (scenario.published_version_id) {
          await client.query(`UPDATE conversation_scenario_versions SET status='archived', updated_at=now() WHERE id=$1`, [scenario.published_version_id]);
        }
        const { rows: [publishedRow] } = await client.query(
          `UPDATE conversation_scenario_versions SET status='published', published_at=now(), published_by=$2, updated_at=now() WHERE id=$1 RETURNING *`,
          [versionId, publishedBy || null]
        );
        const { rows: [updatedScenario] } = await client.query(
          'UPDATE conversation_scenarios SET published_version_id=$2, draft_version_id=NULL, updated_at=now() WHERE id=$1 RETURNING *',
          [scenarioId, versionId]
        );
        await client.query('COMMIT');
        return Object.assign(mapConversationScenario(updatedScenario), { draftVersion: null, publishedVersion: mapConversationScenarioVersion(publishedRow) });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    // Never an in-place mutation of a past version - copies targetVersion's content into a
    // brand-new, immediately-published version, reusing the same "archive the old published
    // version" step publish() performs, so there is only one real "become the live version" code
    // path in this whole domain.
    async rollback(scenarioId, targetVersionId, actorId) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows: scenarioRows } = await client.query('SELECT * FROM conversation_scenarios WHERE id=$1 FOR UPDATE', [scenarioId]);
        const scenario = scenarioRows[0];
        if (!scenario) throw new ApiError(404, 'SCENARIO_NOT_FOUND');
        if (scenario.draft_version_id) throw new ApiError(409, 'DRAFT_ALREADY_EXISTS');
        const { rows: targetRows } = await client.query('SELECT * FROM conversation_scenario_versions WHERE id=$1 AND scenario_id=$2', [targetVersionId, scenarioId]);
        if (!targetRows[0]) throw new ApiError(404, 'VERSION_NOT_FOUND');
        if (scenario.published_version_id) {
          await client.query(`UPDATE conversation_scenario_versions SET status='archived', updated_at=now() WHERE id=$1`, [scenario.published_version_id]);
        }
        const versionId = newId('convscnver');
        const versionNumber = await nextVersionNumber(client, scenarioId);
        const { rows: [versionRow] } = await client.query(
          `INSERT INTO conversation_scenario_versions (id, scenario_id, version_number, status, definition, published_at, created_by, published_by)
           VALUES ($1,$2,$3,'published',$4,now(),$5,$5) RETURNING *`,
          [versionId, scenarioId, versionNumber, JSON.stringify(targetRows[0].definition), actorId || null]
        );
        const { rows: [updatedScenario] } = await client.query(
          'UPDATE conversation_scenarios SET published_version_id=$2, updated_at=now() WHERE id=$1 RETURNING *',
          [scenarioId, versionId]
        );
        await client.query('COMMIT');
        return Object.assign(mapConversationScenario(updatedScenario), { draftVersion: null, publishedVersion: mapConversationScenarioVersion(versionRow) });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    // Scenario-level metadata only (ctaActionId/domain/allowedProcesses/allowedSteps) - never
    // scenarioKey/kind, which stay immutable after create() by design (spec section 11: other
    // systems may reference the stable key).
    async updateMetadata(scenarioId, patch) {
      const existing = await pool.query('SELECT * FROM conversation_scenarios WHERE id=$1', [scenarioId]);
      if (!existing.rows[0]) throw new ApiError(404, 'SCENARIO_NOT_FOUND');
      const merged = Object.assign({}, mapConversationScenario(existing.rows[0]), patch);
      const { rows: [row] } = await pool.query(
        'UPDATE conversation_scenarios SET domain=$2, cta_action_id=$3, allowed_processes=$4, allowed_steps=$5, updated_at=now() WHERE id=$1 RETURNING *',
        [scenarioId, merged.domain, merged.ctaActionId, JSON.stringify(merged.allowedProcesses), JSON.stringify(merged.allowedSteps)]
      );
      return composeScenario(pool, row);
    },
    async archive(scenarioId) {
      const { rows: [row] } = await pool.query('UPDATE conversation_scenarios SET archived_at=now(), updated_at=now() WHERE id=$1 RETURNING *', [scenarioId]);
      if (!row) throw new ApiError(404, 'SCENARIO_NOT_FOUND');
      return composeScenario(pool, row);
    },
    async unarchive(scenarioId) {
      const { rows: [row] } = await pool.query('UPDATE conversation_scenarios SET archived_at=NULL, updated_at=now() WHERE id=$1 RETURNING *', [scenarioId]);
      if (!row) throw new ApiError(404, 'SCENARIO_NOT_FOUND');
      return composeScenario(pool, row);
    },
    // The production Router's own bundle source (server/community/routes.conversation-scenarios-
    // sync.mjs) - every non-archived scenario with a real published version, full definition
    // content included. Never returns draft content, by construction (only published_version_id
    // is ever joined here).
    // Journey H2, Gate 3: joins approved, currently-hash-valid audio onto each published
    // scenario row as `audio: {[language]: {[variantKey]: {url, mimeType, durationMs}}}`. A
    // second, batched query (not N+1) against every published version id at once - this endpoint
    // is only ever called once per bundle-refresh request, but there is no reason to make it
    // scale linearly with query count as the scenario library grows.
    async listPublishedForBundle() {
      const { rows } = await pool.query(
        `SELECT s.id, s.scenario_key, s.domain, s.kind, s.data_query_ref, s.cta_action_id,
                s.allowed_processes, s.allowed_steps, s.published_version_id,
                v.version_number, v.definition, v.published_at
         FROM conversation_scenarios s
         JOIN conversation_scenario_versions v ON v.id = s.published_version_id
         WHERE s.archived_at IS NULL AND s.published_version_id IS NOT NULL`
      );
      const versionIds = rows.map((row) => row.published_version_id);
      const audioByVersion = await approvedAudioByVersionIds(versionIds);
      return rows.map((row) => ({
        id: row.id, scenarioKey: row.scenario_key, domain: row.domain, kind: row.kind,
        dataQueryRef: row.data_query_ref, ctaActionId: row.cta_action_id,
        allowedProcesses: row.allowed_processes, allowedSteps: row.allowed_steps,
        publishedVersion: row.version_number, publishedAt: row.published_at, definition: row.definition,
        audio: audioByVersion[row.published_version_id] || {}
      }));
    }
  };

  // Shared by conversationScenarios.listPublishedForBundle() above - never exposes anything
  // beyond {url, mimeType, durationMs} (never voice_profile_key/voice_id/provider/credential
  // internals) and only ever reads status='approved' rows, re-verified against each version's
  // OWN current definition hash (defensive: always true for a genuinely-approved published
  // version, since Gate 2 made version definitions immutable, but never trusted blindly).
  async function approvedAudioByVersionIds(versionIds) {
    const uniqueIds = Array.from(new Set(versionIds)).filter(Boolean);
    if (!uniqueIds.length) return {};
    const { rows: assetRows } = await pool.query(
      `SELECT * FROM conversation_audio_assets WHERE scenario_version_id = ANY($1) AND status = 'approved'`,
      [uniqueIds]
    );
    if (!assetRows.length) return {};
    const { rows: versionRows } = await pool.query('SELECT id, definition FROM conversation_scenario_versions WHERE id = ANY($1)', [uniqueIds]);
    const definitionByVersion = {};
    versionRows.forEach((row) => { definitionByVersion[row.id] = row.definition; });
    const matcher = await getConversationMatcher();
    const result = {};
    assetRows.forEach((row) => {
      const definition = definitionByVersion[row.scenario_version_id];
      // Journey H2 expressive/context follow-up: variant-aware - row.variant_key resolves the
      // right response set (STANDARD or an authored variant), and performanceText (when present,
      // valid, and the recorded model supports it) is what was actually hashed/synthesized.
      const resolved = effectiveVoiceTextFor(matcher, definition, row.language, row.variant_key, row.model_id);
      const expectedHash = computeAudioContentHash({ text: resolved.text, language: row.language, provider: row.provider, voiceId: row.voice_id, modelId: row.model_id });
      if (!resolved.text || expectedHash !== row.content_hash) return; // hash mismatch - never served, even though status says approved
      if (!result[row.scenario_version_id]) result[row.scenario_version_id] = {};
      if (!result[row.scenario_version_id][row.language]) result[row.scenario_version_id][row.language] = {};
      result[row.scenario_version_id][row.language][row.variant_key] = { url: row.file_url, mimeType: row.mime_type, durationMs: row.duration_ms };
    });
    return result;
  }

  const conversationAudioAssets = {
    async create({ scenarioId, scenarioVersionId, language, variantKey, contentHash, provider, voiceProfileKey, voiceId, modelId, fileUrl, mimeType, durationMs, createdBy }) {
      const id = newId('convaudio');
      const { rows } = await pool.query(
        `INSERT INTO conversation_audio_assets
          (id, scenario_id, scenario_version_id, language, variant_key, content_hash, provider, voice_profile_key, voice_id, model_id, file_url, mime_type, duration_ms, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
        [id, scenarioId, scenarioVersionId, language, variantKey || 'standard', contentHash, provider || 'elevenlabs', voiceProfileKey, voiceId, modelId || null, fileUrl, mimeType, durationMs == null ? null : Math.round(Number(durationMs)), createdBy || null]
      );
      return mapConversationAudioAsset(rows[0]);
    },
    async get(id) {
      const { rows } = await pool.query('SELECT * FROM conversation_audio_assets WHERE id=$1', [id]);
      return rows[0] ? mapConversationAudioAsset(rows[0]) : null;
    },
    async listForVersion(scenarioVersionId) {
      const { rows } = await pool.query('SELECT * FROM conversation_audio_assets WHERE scenario_version_id=$1 ORDER BY created_at DESC', [scenarioVersionId]);
      return rows.map(mapConversationAudioAsset);
    },
    // Archives whatever was previously approved for the same (version, language, variant) slot,
    // then approves this one - in one transaction, mirroring conversationScenarios.publish()'s own
    // "archive the old, promote the new" shape exactly.
    async approve(id, approvedBy) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows: assetRows } = await client.query('SELECT * FROM conversation_audio_assets WHERE id=$1 FOR UPDATE', [id]);
        const asset = assetRows[0];
        if (!asset) throw new ApiError(404, 'AUDIO_ASSET_NOT_FOUND');
        await client.query(
          `UPDATE conversation_audio_assets SET status='archived', updated_at=now()
           WHERE scenario_version_id=$1 AND language=$2 AND variant_key=$3 AND status='approved' AND id != $4`,
          [asset.scenario_version_id, asset.language, asset.variant_key, id]
        );
        const { rows: [updated] } = await client.query(
          `UPDATE conversation_audio_assets SET status='approved', approved_by=$2, approved_at=now(), updated_at=now() WHERE id=$1 RETURNING *`,
          [id, approvedBy || null]
        );
        await client.query('COMMIT');
        return mapConversationAudioAsset(updated);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    async archive(id) {
      const { rows: [row] } = await pool.query(`UPDATE conversation_audio_assets SET status='archived', updated_at=now() WHERE id=$1 RETURNING *`, [id]);
      if (!row) throw new ApiError(404, 'AUDIO_ASSET_NOT_FOUND');
      return mapConversationAudioAsset(row);
    }
  };

  // Journey H2 expressive/context follow-up (043_conversation_scenario_exposures.sql): the small,
  // bounded per-user counter ai-conversation-matcher.js's selectVariant() needs - "how many times
  // has THIS scenario actually been delivered to this user before now." `record()` is the ONE
  // write path, and it always server-increments - the client only ever says "this exact scenario
  // was just delivered," never a count.
  const conversationScenarioExposures = {
    async get(userId, scenarioKey) {
      const { rows } = await pool.query('SELECT * FROM conversation_scenario_exposures WHERE user_id=$1 AND scenario_key=$2', [userId, scenarioKey]);
      return rows[0] ? mapScenarioExposure(rows[0]) : null;
    },
    async getAllForUser(userId) {
      const { rows } = await pool.query('SELECT * FROM conversation_scenario_exposures WHERE user_id=$1', [userId]);
      return rows.map(mapScenarioExposure);
    },
    async record(userId, scenarioKey, variantKey) {
      const { rows } = await pool.query(
        `INSERT INTO conversation_scenario_exposures (user_id, scenario_key, count, last_presented_at, last_variant_key, updated_at)
         VALUES ($1,$2,1,now(),$3,now())
         ON CONFLICT (user_id, scenario_key) DO UPDATE SET
           count = conversation_scenario_exposures.count + 1, last_presented_at = now(), last_variant_key = $3, updated_at = now()
         RETURNING *`,
        [userId, scenarioKey, variantKey || null]
      );
      return mapScenarioExposure(rows[0]);
    }
  };

  // Backs the admin Technical tab's DB-connectivity check (a real SELECT 1) and applied-
  // migrations list. Not domain-scoped like everything else above, so it sits at the top
  // level of the returned repo object rather than inside one of the per-noun sub-objects.
  async function health() {
    let dbOk = false;
    try { await pool.query('SELECT 1'); dbOk = true; } catch (_) { dbOk = false; }
    let migrations = [];
    try {
      const { rows } = await pool.query('SELECT id, applied_at FROM schema_migrations ORDER BY id');
      migrations = rows.map((row) => ({ id: row.id, appliedAt: row.applied_at }));
    } catch (_) { migrations = []; }
    return { backend: 'postgres', dbOk, migrations };
  }

  return {
    users, posts, comments, likes, listings, purchases, ratings, threads, messages, reports, sessions, usageEvents,
    providerHealth, providerPricing, adminKeys, auditLog, voiceProviderCredentials, voiceLanguageConfigs, voiceCharacterConfigs, voiceTtsUsage,
    xpEvents, achievements, xpConfig, tradingSessions, patterns,
    strategies, analysisProfiles, trades, accounts, instrumentCatalog, mentalHealthProfile, aiChatHistory, companionState, sessionSignatures, userPreferences,
    authSessions, externalIdentities, securityEvents, authTransactions, health,
    commercialConfig, markupRules, providerModelPricing, wallet, quota, analysisSymbols,
    subscriptions, paymentTransactions, paymentEvents, cryptoInvoices, bscPaymentSecrets, storageProducts, storageEntitlements, storageObjects,
    conversationScenarios, conversationAudioAssets, conversationScenarioExposures,
    providerCostCredentials, providerCostSync, providerBalanceSnapshots, clientErrors
  };
}
