import { newId } from './id.mjs';
import { ApiError } from '../community/errors.mjs';

// Same method surface as repo.pg.mjs, re-implementing the same business-rule invariants
// (unique purchase per buyer/listing, rating requires a prior purchase, thread find-or-create
// idempotency) in plain JS. This is what every contract test injects, so the full API
// behavior is verified with zero Postgres dependency.
export function createMemoryRepo() {
  const state = {
    users: new Map(), posts: new Map(), comments: new Map(),
    listings: new Map(), purchases: new Map(), ratings: new Map(),
    threads: new Map(), messages: new Map(), reports: new Map(),
    sessions: new Map(), usageEvents: new Map(), providerPricing: new Map(),
    adminKeys: new Map(), auditLog: new Map()
  };

  function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
  function requireUser(userId) { if (!state.users.has(userId)) throw new ApiError(400, 'USER_NOT_FOUND'); }
  function now() { return new Date().toISOString(); }
  // Mirrors repo.pg.mjs's ONLINE_THRESHOLD_SECONDS - 3x the 45s client heartbeat interval.
  const ONLINE_THRESHOLD_MS = 135000;

  const users = {
    async create({ displayName, avatarUrl, bio }) {
      const trimmed = String(displayName || '').trim();
      if (!trimmed) throw new ApiError(400, 'VALIDATION_FAILED');
      const record = { id: newId('user'), displayName: trimmed, avatarUrl: avatarUrl || null, bio: bio || null, role: 'user', suspendedAt: null, createdAt: now() };
      state.users.set(record.id, record);
      return clone(record);
    },
    async get(id) { const record = state.users.get(id); return record ? clone(record) : null; },
    async list() { return Array.from(state.users.values()).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map(clone); },
    async update(id, patch) {
      const record = state.users.get(id);
      if (!record) throw new ApiError(404, 'USER_NOT_FOUND');
      Object.assign(record, patch);
      return clone(record);
    }
  };

  const posts = {
    async create({ userId, content, images }) {
      requireUser(userId);
      const record = { id: newId('post'), userId, content: String(content || ''), images: images || [], createdAt: now(), updatedAt: now() };
      state.posts.set(record.id, record);
      return clone(record);
    },
    async list({ limit, before } = {}) {
      let values = Array.from(state.posts.values()).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      if (before) values = values.filter((p) => new Date(p.createdAt) < new Date(before));
      return values.slice(0, limit || 20).map(clone);
    },
    async get(id) { const record = state.posts.get(id); return record ? clone(record) : null; },
    async remove(id, userId) {
      const record = state.posts.get(id);
      if (!record) throw new ApiError(404, 'POST_NOT_FOUND');
      if (record.userId !== userId) throw new ApiError(403, 'NOT_POST_OWNER');
      state.posts.delete(id);
      Array.from(state.comments.values()).filter((c) => c.postId === id).forEach((c) => state.comments.delete(c.id));
    }
  };

  const comments = {
    async create({ postId, userId, content }) {
      if (!state.posts.has(postId)) throw new ApiError(404, 'POST_NOT_FOUND');
      requireUser(userId);
      const trimmed = String(content || '').trim();
      if (!trimmed) throw new ApiError(400, 'VALIDATION_FAILED');
      const record = { id: newId('comment'), postId, userId, content: trimmed, createdAt: now() };
      state.comments.set(record.id, record);
      return clone(record);
    },
    async listByPost(postId) {
      return Array.from(state.comments.values()).filter((c) => c.postId === postId).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)).map(clone);
    }
  };

  const listings = {
    async create(input) {
      requireUser(input.sellerId);
      const stamp = now();
      const record = {
        id: newId('listing'), sellerId: input.sellerId, type: input.type, sourceId: input.sourceId,
        title: input.title, description: input.description || '', priceAmount: Number(input.priceAmount) || 0,
        priceCurrency: input.priceCurrency || 'USD', successRatePercent: input.successRatePercent ?? null,
        sampleSize: input.sampleSize || 0, evidenceAsOf: input.evidenceAsOf || stamp,
        previewContent: input.previewContent ?? null, fullContent: input.fullContent ?? null,
        screenshots: input.screenshots || [], status: input.status || 'published', featured: false,
        createdAt: stamp, updatedAt: stamp
      };
      state.listings.set(record.id, record);
      return clone(record);
    },
    async get(id) { const record = state.listings.get(id); return record ? clone(record) : null; },
    async listPublished({ type, limit, before } = {}) {
      let values = Array.from(state.listings.values()).filter((l) => l.status === 'published');
      if (type) values = values.filter((l) => l.type === type);
      values = values.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      if (before) values = values.filter((l) => new Date(l.createdAt) < new Date(before));
      return values.slice(0, limit || 20).map(clone);
    },
    async listBySeller(sellerId) {
      return Array.from(state.listings.values()).filter((l) => l.sellerId === sellerId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map(clone);
    },
    async findBySource(sourceId, sellerId) {
      const record = Array.from(state.listings.values()).find((l) => l.sourceId === sourceId && l.sellerId === sellerId);
      return record ? clone(record) : null;
    },
    async update(id, patch) {
      const record = state.listings.get(id);
      if (!record) throw new ApiError(404, 'LISTING_NOT_FOUND');
      Object.assign(record, patch, { updatedAt: now() });
      return clone(record);
    },
    async listAll({ status } = {}) {
      let values = Array.from(state.listings.values());
      if (status && status !== 'all') values = values.filter((l) => l.status === status);
      return values.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map(clone);
    }
  };

  const purchases = {
    async create({ listingId, buyerId, priceAtPurchase }) {
      const listing = state.listings.get(listingId);
      if (!listing) throw new ApiError(404, 'LISTING_NOT_FOUND');
      requireUser(buyerId);
      if (listing.sellerId === buyerId) throw new ApiError(400, 'CANNOT_PURCHASE_OWN_LISTING');
      const existing = Array.from(state.purchases.values()).find((p) => p.listingId === listingId && p.buyerId === buyerId);
      if (existing) throw new ApiError(409, 'ALREADY_PURCHASED');
      const record = { id: newId('purchase'), listingId, buyerId, purchasedAt: now(), priceAtPurchase: Number(priceAtPurchase) || 0, mock: true };
      state.purchases.set(record.id, record);
      return clone(record);
    },
    async find(listingId, buyerId) {
      const record = Array.from(state.purchases.values()).find((p) => p.listingId === listingId && p.buyerId === buyerId);
      return record ? clone(record) : null;
    },
    async listByBuyer(buyerId) { return Array.from(state.purchases.values()).filter((p) => p.buyerId === buyerId).map(clone); },
    async aggregateByBuyer() {
      const result = {};
      Array.from(state.purchases.values()).forEach((p) => {
        if (!result[p.buyerId]) result[p.buyerId] = { count: 0, total: 0 };
        result[p.buyerId].count += 1;
        result[p.buyerId].total += p.priceAtPurchase;
      });
      return result;
    }
  };

  const ratings = {
    async create({ listingId, buyerId, rating, reviewText }) {
      const purchase = await purchases.find(listingId, buyerId);
      if (!purchase) throw new ApiError(403, 'PURCHASE_REQUIRED');
      const existing = Array.from(state.ratings.values()).find((r) => r.listingId === listingId && r.buyerId === buyerId);
      if (existing) throw new ApiError(409, 'ALREADY_RATED');
      const value = Number(rating);
      if (!Number.isInteger(value) || value < 1 || value > 5) throw new ApiError(400, 'VALIDATION_FAILED');
      const record = { id: newId('rating'), listingId, buyerId, rating: value, reviewText: reviewText || null, createdAt: now() };
      state.ratings.set(record.id, record);
      return clone(record);
    },
    async listByListing(listingId) { return Array.from(state.ratings.values()).filter((r) => r.listingId === listingId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map(clone); }
  };

  const threads = {
    async findOrCreate({ listingId, buyerId }) {
      const listing = state.listings.get(listingId);
      if (!listing) throw new ApiError(404, 'LISTING_NOT_FOUND');
      if (listing.sellerId === buyerId) throw new ApiError(400, 'CANNOT_MESSAGE_OWN_LISTING');
      const existing = Array.from(state.threads.values()).find((t) => t.listingId === listingId && t.buyerId === buyerId);
      if (existing) return clone(existing);
      const record = { id: newId('thread'), listingId, buyerId, sellerId: listing.sellerId, createdAt: now() };
      state.threads.set(record.id, record);
      return clone(record);
    },
    async get(id) { const record = state.threads.get(id); return record ? clone(record) : null; },
    async listByUser(userId) {
      return Array.from(state.threads.values()).filter((t) => t.buyerId === userId || t.sellerId === userId).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map(clone);
    }
  };

  const messages = {
    async create({ threadId, senderId, content }) {
      if (!state.threads.has(threadId)) throw new ApiError(404, 'THREAD_NOT_FOUND');
      const trimmed = String(content || '').trim();
      if (!trimmed) throw new ApiError(400, 'VALIDATION_FAILED');
      const record = { id: newId('message'), threadId, senderId, content: trimmed, createdAt: now(), readAt: null };
      state.messages.set(record.id, record);
      return clone(record);
    },
    async listByThread(threadId) {
      return Array.from(state.messages.values()).filter((m) => m.threadId === threadId).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)).map(clone);
    },
    async markRead({ threadId, userId }) {
      Array.from(state.messages.values()).filter((m) => m.threadId === threadId && m.senderId !== userId && !m.readAt).forEach((m) => { m.readAt = now(); });
    }
  };

  const reports = {
    async create({ targetType, targetId, reporterId, reason }) {
      const validTypes = ['post', 'comment', 'listing', 'message'];
      if (!validTypes.includes(targetType)) throw new ApiError(400, 'INVALID_TARGET_TYPE');
      requireUser(reporterId);
      const trimmedReason = String(reason || '').trim();
      if (!trimmedReason) throw new ApiError(400, 'VALIDATION_FAILED');
      const existsMap = { post: state.posts, comment: state.comments, listing: state.listings, message: state.messages };
      if (!existsMap[targetType].has(targetId)) throw new ApiError(404, 'TARGET_NOT_FOUND');
      const record = { id: newId('report'), targetType, targetId, reporterId, reason: trimmedReason, status: 'open', createdAt: now() };
      state.reports.set(record.id, record);
      return clone(record);
    }
  };

  const sessions = {
    async heartbeat(userId) {
      requireUser(userId);
      const open = Array.from(state.sessions.values()).find((s) => s.userId === userId && !s.endedAt);
      if (open) { open.lastHeartbeatAt = now(); return clone(open); }
      const record = { id: newId('session'), userId, startedAt: now(), lastHeartbeatAt: now(), endedAt: null };
      state.sessions.set(record.id, record);
      return clone(record);
    },
    async sweepStale(thresholdMs) {
      const cutoff = Date.now() - thresholdMs;
      Array.from(state.sessions.values()).forEach((s) => {
        if (!s.endedAt && new Date(s.lastHeartbeatAt).getTime() < cutoff) s.endedAt = s.lastHeartbeatAt;
      });
    },
    async get(id) { const record = state.sessions.get(id); return record ? clone(record) : null; },
    async listByUser(userId) {
      return Array.from(state.sessions.values()).filter((s) => s.userId === userId).sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt)).map(clone);
    },
    async aggregateByUser() {
      const result = {};
      Array.from(state.sessions.values()).forEach((s) => {
        if (!result[s.userId]) result[s.userId] = { lastLoginAt: null, isOnline: false, totalMs: 0 };
        const bucket = result[s.userId];
        if (!bucket.lastLoginAt || new Date(s.startedAt) > new Date(bucket.lastLoginAt)) bucket.lastLoginAt = s.startedAt;
        if (!s.endedAt && (Date.now() - new Date(s.lastHeartbeatAt).getTime()) < ONLINE_THRESHOLD_MS) bucket.isOnline = true;
        const end = s.endedAt || s.lastHeartbeatAt;
        bucket.totalMs += Math.max(0, new Date(end) - new Date(s.startedAt));
      });
      Object.keys(result).forEach((userId) => { result[userId].hoursOnline = result[userId].totalMs / 3600000; delete result[userId].totalMs; });
      return result;
    }
  };

  const usageEvents = {
    async create({ userId, provider, promptTokens, completionTokens, totalTokens, source }) {
      const record = {
        id: newId('usageEvent'), userId: userId || null, provider: String(provider || 'unknown'),
        promptTokens: promptTokens ?? null, completionTokens: completionTokens ?? null, totalTokens: totalTokens ?? null,
        source: String(source || 'unknown'), createdAt: now()
      };
      state.usageEvents.set(record.id, record);
      return clone(record);
    },
    async aggregateByProviderAndDay({ since } = {}) {
      let values = Array.from(state.usageEvents.values());
      if (since) values = values.filter((e) => new Date(e.createdAt) >= new Date(since));
      const buckets = new Map();
      values.forEach((e) => {
        const day = e.createdAt.slice(0, 10);
        const key = e.provider + '|' + day;
        buckets.set(key, (buckets.get(key) || 0) + (e.totalTokens || 0));
      });
      return Array.from(buckets.entries()).map(([key, totalTokens]) => { const [provider, day] = key.split('|'); return { provider, day, totalTokens }; });
    },
    async aggregateByUser() {
      const result = {};
      Array.from(state.usageEvents.values()).forEach((e) => { if (e.userId) result[e.userId] = (result[e.userId] || 0) + (e.totalTokens || 0); });
      return result;
    },
    async aggregateByProviderForMonth(monthKey) {
      const buckets = new Map();
      Array.from(state.usageEvents.values()).filter((e) => e.createdAt.slice(0, 7) === monthKey).forEach((e) => {
        const bucket = buckets.get(e.provider) || { provider: e.provider, promptTokens: 0, completionTokens: 0, totalTokens: 0 };
        bucket.promptTokens += e.promptTokens || 0; bucket.completionTokens += e.completionTokens || 0; bucket.totalTokens += e.totalTokens || 0;
        buckets.set(e.provider, bucket);
      });
      return Array.from(buckets.values());
    }
  };

  const providerPricing = {
    async upsert({ provider, promptPricePer1k, completionPricePer1k, monthlyTokenBudget }) {
      const record = { provider, promptPricePer1k: promptPricePer1k ?? null, completionPricePer1k: completionPricePer1k ?? null, monthlyTokenBudget: monthlyTokenBudget ?? null, updatedAt: now() };
      state.providerPricing.set(provider, record);
      return clone(record);
    },
    async get(provider) { const record = state.providerPricing.get(provider); return record ? clone(record) : null; },
    async list() { return Array.from(state.providerPricing.values()).map(clone); }
  };

  const adminKeys = {
    async upsert({ provider, apiKey, updatedBy }) {
      const trimmed = String(apiKey || '').trim();
      if (!trimmed) throw new ApiError(400, 'VALIDATION_FAILED');
      const record = { provider, apiKey: trimmed, updatedBy: updatedBy || null, updatedAt: now() };
      state.adminKeys.set(provider, record);
      return clone(record);
    },
    async list() { return Array.from(state.adminKeys.values()).map(clone); },
    async get(provider) { const record = state.adminKeys.get(provider); return record ? clone(record) : null; }
  };

  const auditLog = {
    async create({ adminUserId, action, targetType, targetId, details }) {
      const record = { id: newId('auditLog'), adminUserId: adminUserId || null, action: String(action || ''), targetType: targetType || null, targetId: targetId || null, details: details ?? null, createdAt: now() };
      state.auditLog.set(record.id, record);
      return clone(record);
    },
    async list({ limit } = {}) {
      return Array.from(state.auditLog.values()).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, limit || 50).map(clone);
    }
  };

  // Mirrors repo.pg.mjs's health() shape for the admin Technical tab, so that tab works
  // unmodified under the zero-setup in-memory fallback too - there is no real "database" here
  // to check connectivity against, so this is honestly synthetic rather than faking a query.
  async function health() { return { backend: 'memory', dbOk: true, migrations: [] }; }

  return { users, posts, comments, listings, purchases, ratings, threads, messages, reports, sessions, usageEvents, providerPricing, adminKeys, auditLog, health };
}
