import { newId } from './id.mjs';
import { ApiError } from '../community/errors.mjs';

function mapUser(row) {
  return {
    id: row.id, displayName: row.display_name, avatarUrl: row.avatar_url, bio: row.bio, role: row.role, suspendedAt: row.suspended_at,
    email: row.email, emailVerified: row.email_verified, phone: row.phone, phoneVerified: row.phone_verified,
    profileRole: row.profile_role, kycStatus: row.kyc_status, xpTotal: row.xp_total, avatarDataUrl: row.avatar_data_url,
    createdAt: row.created_at
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
function mapPurchase(row) { return { id: row.id, listingId: row.listing_id, buyerId: row.buyer_id, purchasedAt: row.purchased_at, priceAtPurchase: Number(row.price_at_purchase), mock: row.mock }; }
function mapRating(row) { return { id: row.id, listingId: row.listing_id, buyerId: row.buyer_id, rating: row.rating, reviewText: row.review_text, createdAt: row.created_at }; }
function mapThread(row) { return { id: row.id, listingId: row.listing_id, buyerId: row.buyer_id, sellerId: row.seller_id, createdAt: row.created_at }; }
function mapMessage(row) { return { id: row.id, threadId: row.thread_id, senderId: row.sender_id, content: row.content, createdAt: row.created_at, readAt: row.read_at }; }
function mapReport(row) { return { id: row.id, targetType: row.target_type, targetId: row.target_id, reporterId: row.reporter_id, reason: row.reason, status: row.status, createdAt: row.created_at }; }
function mapSession(row) { return { id: row.id, userId: row.user_id, startedAt: row.started_at, lastHeartbeatAt: row.last_heartbeat_at, endedAt: row.ended_at }; }
function mapUsageEvent(row) { return { id: row.id, userId: row.user_id, provider: row.provider, promptTokens: row.prompt_tokens, completionTokens: row.completion_tokens, totalTokens: row.total_tokens, source: row.source, createdAt: row.created_at }; }
function mapHealthEvent(row) { return { id: row.id, provider: row.provider, ok: row.ok, errorCode: row.error_code, latencyMs: row.latency_ms, source: row.source, createdAt: row.created_at }; }
function mapProviderPricing(row) { return { provider: row.provider, promptPricePer1k: row.prompt_price_per_1k == null ? null : Number(row.prompt_price_per_1k), completionPricePer1k: row.completion_price_per_1k == null ? null : Number(row.completion_price_per_1k), monthlyTokenBudget: row.monthly_token_budget, updatedAt: row.updated_at }; }
function mapAdminKey(row) { return { provider: row.provider, apiKey: row.api_key, updatedBy: row.updated_by, updatedAt: row.updated_at }; }
function mapAuditLog(row) { return { id: row.id, adminUserId: row.admin_user_id, action: row.action, targetType: row.target_type, targetId: row.target_id, details: row.details, createdAt: row.created_at }; }
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
    probabilityHistory: row.probability_history || [], pattern: row.pattern, executionPlan: row.execution_plan
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
function mapTradingSession(row, entries, activityLog) {
  return {
    id: row.id, userId: row.user_id, character: row.character, name: row.name, market: row.market,
    timeframe: row.timeframe, date: row.date, jalali: row.jalali, startedAt: row.started_at, closedAt: row.closed_at,
    status: row.status, updateIntervalMinutes: row.update_interval_minutes, gracePeriodMinutes: row.grace_period_minutes,
    fateSummary: row.fate_summary, previousSessionSummary: row.previous_session_summary,
    aiSessionAnalysis: row.ai_session_analysis, aiSessionAnalysisResult: row.ai_session_analysis_result,
    finalEntryId: row.final_entry_id, entries: entries || [], activityLog: activityLog || [],
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
    chartNote: row.chart_note, statusHistory: row.status_history || [],
    source: { character: row.source_character, sessionId: row.source_session_id, scenarioId: row.source_scenario_id },
    aiPredictionLinks: row.ai_prediction_links || [], aiInitialAnalysis: row.ai_initial_analysis,
    disciplineImpact: row.discipline_impact == null ? 0 : Number(row.discipline_impact),
    screenshots: screenshots || [], emotionLog: emotionLog || [],
    createdAt: row.created_at, updatedAt: row.updated_at, openedAt: row.opened_at, closedAt: row.closed_at
  };
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
        return mapUser(rows[0]);
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
        'UPDATE users SET display_name=$2, avatar_url=$3, bio=$4, role=$5, suspended_at=$6 WHERE id=$1 RETURNING *',
        [id, merged.displayName, merged.avatarUrl, merged.bio, merged.role, merged.suspendedAt]
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
    async create({ userId, provider, promptTokens, completionTokens, totalTokens, source }) {
      const id = newId('usageEvent');
      const { rows } = await pool.query(
        'INSERT INTO ai_usage_events (id, user_id, provider, prompt_tokens, completion_tokens, total_tokens, source) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
        [id, userId || null, String(provider || 'unknown'), promptTokens ?? null, completionTokens ?? null, totalTokens ?? null, String(source || 'unknown')]
      );
      return mapUsageEvent(rows[0]);
    },
    async aggregateByProviderAndDay({ since } = {}) {
      const params = [];
      let text = "SELECT provider, date_trunc('day', created_at) AS day, SUM(COALESCE(total_tokens,0)) AS total_tokens FROM ai_usage_events";
      if (since) { params.push(since); text += ` WHERE created_at >= $${params.length}`; }
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
        const { rows: ownerRows } = await client.query('SELECT user_id FROM trading_sessions WHERE id=$1', [record.id]);
        if (ownerRows[0] && ownerRows[0].user_id !== userId) throw new ApiError(403, 'NOT_SESSION_OWNER');

        const startedAt = record.startedAt ? new Date(record.startedAt).toISOString() : null;
        const closedAt = record.closedAt ? new Date(record.closedAt).toISOString() : null;
        const { rows: sessionRows } = await client.query(
          `INSERT INTO trading_sessions
            (id, user_id, character, name, market, timeframe, date, jalali, started_at, closed_at, status,
             update_interval_minutes, grace_period_minutes, fate_summary, previous_session_summary,
             ai_session_analysis, ai_session_analysis_result, final_entry_id, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9,now()),$10,$11,$12,$13,$14,$15,$16,$17,$18,now())
           ON CONFLICT (id) DO UPDATE SET
             character=$3, name=$4, market=$5, timeframe=$6, date=$7, jalali=$8,
             started_at=COALESCE($9, trading_sessions.started_at), closed_at=$10, status=$11,
             update_interval_minutes=$12, grace_period_minutes=$13, fate_summary=$14, previous_session_summary=$15,
             ai_session_analysis=$16, ai_session_analysis_result=$17, final_entry_id=$18, updated_at=now()
           RETURNING *`,
          [record.id, userId, String(record.character || 'hunter'), record.name || null, record.market || null,
            record.timeframe || null, record.date || null, record.jalali || null, startedAt, closedAt,
            record.status === 'closed' ? 'closed' : 'open', Number(record.updateIntervalMinutes) || 30,
            Number(record.gracePeriodMinutes) || 5, JSON.stringify(record.fateSummary ?? null),
            JSON.stringify(record.previousSessionSummary ?? null), record.aiSessionAnalysis || null,
            JSON.stringify(record.aiSessionAnalysisResult ?? null), record.finalEntryId || null]
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
            [entry.id, record.id, entry.type, entry.createdAt ? new Date(entry.createdAt).toISOString() : null,
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
                 completion_percent, probability_history, pattern, execution_plan)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
               RETURNING *`,
              [scenario.id, entry.id, record.id, scenario.title || '', scenario.description || null,
                scenario.evidence || null, scenario.trigger || null, scenario.occurred === true,
                (scenario.pattern && scenario.pattern.patternTagId) || null,
                scenario.completion != null ? Number(scenario.completion) : null,
                JSON.stringify(Array.isArray(scenario.probabilityHistory) ? scenario.probabilityHistory : []),
                JSON.stringify(scenario.pattern ?? null), JSON.stringify(scenario.executionPlan ?? null)]
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

        const { rows: patternRows } = await client.query(
          `INSERT INTO patterns (id, user_id, name, description, completion_threshold, usage_count, is_public, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,now())
           ON CONFLICT (id) DO UPDATE SET
             name=$3, description=$4, completion_threshold=$5, usage_count=$6, is_public=$7, updated_at=now()
           RETURNING *`,
          [record.id, userId, record.name || '', record.description || '',
            Math.max(0, Math.min(100, Number(record.completionThreshold ?? 70))),
            Math.max(0, Number(record.usageCount || 0)), Boolean(record.isPublic)]
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
             overall_framework_description, ai_understanding_summary, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,now())
           ON CONFLICT (id) DO UPDATE SET
             name=$3, active=$4, is_public=$5, origin=$6, entry_rules=$7, stop_loss_rules=$8, exit_target_rules=$9,
             position_sizing_rules=$10, position_management_notes=$11, max_risk_per_trade_percent=$12,
             daily_drawdown_limit_percent=$13, total_drawdown_limit_percent=$14, max_concurrent_trades=$15,
             max_profit_cap_per_trade=$16, risk_management_notes=$17, overall_framework_description=$18,
             ai_understanding_summary=$19, updated_at=now()
           RETURNING *`,
          [record.id, userId, record.name || '', record.active !== false, Boolean(record.isPublic),
            record.origin === 'ai_from_event' ? 'ai_from_event' : 'manual',
            pm.entryRules || '', pm.stopLossRules || '', pm.exitTargetRules || '', pm.positionSizingRules || '', pm.freeNotes || '',
            rm.maxRiskPerTradePercent ?? null, rm.dailyDrawdownLimitPercent ?? null, rm.totalDrawdownLimitPercent ?? null,
            rm.maxConcurrentTrades ?? null, rm.maxProfitCapPerTrade ?? null, rm.freeNotes || '',
            of.description || '', JSON.stringify(record.aiUnderstandingSummary ?? null)]
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
        const { rows: ownerRows } = await client.query('SELECT user_id FROM trades WHERE id=$1', [record.id]);
        if (ownerRows[0] && ownerRows[0].user_id !== userId) throw new ApiError(403, 'NOT_TRADE_OWNER');

        const { rows: tradeRows } = await client.query(
          `INSERT INTO trades
            (id, user_id, status, direction, entry_mode, entry_price, stop_loss, take_profits, sl_distance_percent,
             risk_percent, risk_amount, leverage, position_size, margin_required, liquidation_price, rr, margin_mode,
             commission, breakeven_percent, exit_price, outcome, pnl, pnl_percent, session, primary_timeframe,
             timeframe_trends, concept_tags, linked_pattern_ids, linked_strategy_id, chart_note, status_history,
             source_character, source_session_id, source_scenario_id, ai_prediction_links, ai_initial_analysis,
             discipline_impact, opened_at, closed_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,
                   $28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,now())
           ON CONFLICT (id) DO UPDATE SET
             status=$3, direction=$4, entry_mode=$5, entry_price=$6, stop_loss=$7, take_profits=$8, sl_distance_percent=$9,
             risk_percent=$10, risk_amount=$11, leverage=$12, position_size=$13, margin_required=$14, liquidation_price=$15,
             rr=$16, margin_mode=$17, commission=$18, breakeven_percent=$19, exit_price=$20, outcome=$21, pnl=$22,
             pnl_percent=$23, session=$24, primary_timeframe=$25, timeframe_trends=$26, concept_tags=$27,
             linked_pattern_ids=$28, linked_strategy_id=$29, chart_note=$30, status_history=$31, source_character=$32,
             source_session_id=$33, source_scenario_id=$34, ai_prediction_links=$35, ai_initial_analysis=$36,
             discipline_impact=$37, opened_at=$38, closed_at=$39, updated_at=now()
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
            JSON.stringify(record.linkedPatternIds || []), record.linkedStrategyId || null, record.chartNote || '',
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
      tradeSummary: row.trade_summary, fateSummaryText: row.fate_summary_text, createdAt: row.created_at
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
      const { rows } = await pool.query(
        `INSERT INTO session_signatures
           (id, user_id, session_id, character, market, timeframe, date, movement_sequence, pattern_ids, strategy_ids, scenario_outcomes, trade_summary, fate_summary_text)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (id) DO UPDATE SET
           session_id=$3, character=$4, market=$5, timeframe=$6, date=$7, movement_sequence=$8,
           pattern_ids=$9, strategy_ids=$10, scenario_outcomes=$11, trade_summary=$12, fate_summary_text=$13
         RETURNING *`,
        [record.id, userId, String(record.sessionId), record.character || '', record.market || '',
          record.timeframe || '', record.date || '', JSON.stringify(record.movementSequence || []),
          JSON.stringify(record.patternIds || []), JSON.stringify(record.strategyIds || []),
          JSON.stringify(record.scenarioOutcomes || []), JSON.stringify(record.tradeSummary || {}),
          record.fateSummaryText || '']
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
    // total_tokens is INCREMENTED (this call's new tokens only), never replaced - the client
    // always sends the whole messages array but only the newest exchange's token count.
    async appendAndSave(userId, id, { title, messages, tokens }) {
      if (!Array.isArray(messages)) throw new ApiError(400, 'VALIDATION_FAILED');
      const { rows } = await pool.query(
        `UPDATE ai_chat_history SET messages=$3, title=COALESCE($4, title), total_tokens=total_tokens+$5, updated_at=now()
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

  return { users, posts, comments, likes, listings, purchases, ratings, threads, messages, reports, sessions, usageEvents, providerHealth, providerPricing, adminKeys, auditLog, xpEvents, achievements, xpConfig, tradingSessions, patterns, strategies, trades, mentalHealthProfile, aiChatHistory, companionState, sessionSignatures, userPreferences, health };
}
