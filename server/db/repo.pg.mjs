import { newId } from './id.mjs';
import { ApiError } from '../community/errors.mjs';

function mapUser(row) { return { id: row.id, displayName: row.display_name, avatarUrl: row.avatar_url, bio: row.bio, role: row.role, suspendedAt: row.suspended_at, createdAt: row.created_at }; }
function mapPost(row) { return { id: row.id, userId: row.user_id, content: row.content, images: row.images, createdAt: row.created_at, updatedAt: row.updated_at }; }
function mapComment(row) { return { id: row.id, postId: row.post_id, userId: row.user_id, content: row.content, createdAt: row.created_at }; }
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
function mapProviderPricing(row) { return { provider: row.provider, promptPricePer1k: row.prompt_price_per_1k == null ? null : Number(row.prompt_price_per_1k), completionPricePer1k: row.completion_price_per_1k == null ? null : Number(row.completion_price_per_1k), monthlyTokenBudget: row.monthly_token_budget, updatedAt: row.updated_at }; }
function mapAdminKey(row) { return { provider: row.provider, apiKey: row.api_key, updatedBy: row.updated_by, updatedAt: row.updated_at }; }
function mapAuditLog(row) { return { id: row.id, adminUserId: row.admin_user_id, action: row.action, targetType: row.target_type, targetId: row.target_id, details: row.details, createdAt: row.created_at }; }

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
    async create({ displayName, avatarUrl, bio }) {
      const trimmed = String(displayName || '').trim();
      if (!trimmed) throw new ApiError(400, 'VALIDATION_FAILED');
      const id = newId('user');
      const { rows } = await pool.query(
        'INSERT INTO users (id, display_name, avatar_url, bio) VALUES ($1,$2,$3,$4) RETURNING *',
        [id, trimmed, avatarUrl || null, bio || null]
      );
      return mapUser(rows[0]);
    },
    async get(id) {
      const { rows } = await pool.query('SELECT * FROM users WHERE id=$1', [id]);
      return rows[0] ? mapUser(rows[0]) : null;
    },
    async list() {
      const { rows } = await pool.query('SELECT * FROM users ORDER BY created_at DESC');
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
    async findOrCreate({ listingId, buyerId }) {
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

  return { users, posts, comments, listings, purchases, ratings, threads, messages, reports, sessions, usageEvents, providerPricing, adminKeys, auditLog, health };
}
