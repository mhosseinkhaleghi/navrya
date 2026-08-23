import { newId } from './id.mjs';
import { ApiError } from '../community/errors.mjs';

// Same method surface as repo.pg.mjs, re-implementing the same business-rule invariants
// (unique purchase per buyer/listing, rating requires a prior purchase, thread find-or-create
// idempotency) in plain JS. This is what every contract test injects, so the full API
// behavior is verified with zero Postgres dependency.
export function createMemoryRepo() {
  const state = {
    users: new Map(), credentials: new Map(), posts: new Map(), comments: new Map(), likes: new Map(),
    listings: new Map(), purchases: new Map(), ratings: new Map(),
    threads: new Map(), messages: new Map(), reports: new Map(),
    sessions: new Map(), usageEvents: new Map(), providerHealth: new Map(), providerPricing: new Map(),
    adminKeys: new Map(), auditLog: new Map(), xpEvents: new Map(), achievements: new Map(), xpConfig: new Map(),
    tradingSessions: new Map(), patterns: new Map(), strategies: new Map(), trades: new Map(),
    mentalHealthProfiles: new Map(), aiChatHistory: new Map(), companionState: new Map(),
    sessionSignatures: new Map(), userPreferences: new Map(),
    authSessions: new Map(), externalIdentities: new Map(), securityEvents: new Map(), authTransactions: new Map()
  };

  function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
  function requireUser(userId) { if (!state.users.has(userId)) throw new ApiError(400, 'USER_NOT_FOUND'); }
  function now() { return new Date().toISOString(); }
  // Mirrors repo.pg.mjs's ONLINE_THRESHOLD_SECONDS - 3x the 45s client heartbeat interval.
  const ONLINE_THRESHOLD_MS = 135000;

  const users = {
    async create({ displayName, avatarUrl, bio, email }) {
      const trimmed = String(displayName || '').trim();
      if (!trimmed) throw new ApiError(400, 'VALIDATION_FAILED');
      if (email && Array.from(state.users.values()).some((u) => u.email === email)) throw new ApiError(409, 'EMAIL_TAKEN');
      const record = {
        id: newId('user'), displayName: trimmed, avatarUrl: avatarUrl || null, bio: bio || null, role: 'user', suspendedAt: null,
        email: email || null, emailVerified: false, emailVerifiedAt: null, phone: null, phoneVerified: false, profileRole: 'trader', kycStatus: 'not_started',
        xpTotal: 0, avatarDataUrl: null, totpEnabledAt: null, createdAt: now()
      };
      state.users.set(record.id, record);
      return clone(record);
    },
    // Auth-only lookups - mirror repo.pg.mjs's methods of the same name. passwordHash/googleId
    // live in a wholly separate state.credentials Map, never inside a `users` record, so they
    // are structurally impossible for list()/get()/update()'s clone(record) to leak - unlike a
    // field-filtering discipline, a value that was never on the object can't be forgotten later.
    async findCredentialsByEmail(email) {
      const record = Array.from(state.users.values()).find((u) => u.email === email);
      if (!record) return null;
      const creds = state.credentials.get(record.id) || {};
      return { id: record.id, passwordHash: creds.passwordHash || null, suspendedAt: record.suspendedAt };
    },
    async findIdByGoogleId(googleId) {
      for (const [id, creds] of state.credentials) if (creds.googleId === googleId) return id;
      return null;
    },
    async setCredentials(id, { passwordHash, googleId } = {}) {
      if (!state.users.has(id)) throw new ApiError(404, 'USER_NOT_FOUND');
      const existing = state.credentials.get(id) || {};
      state.credentials.set(id, {
        passwordHash: passwordHash != null ? passwordHash : existing.passwordHash || null,
        googleId: googleId != null ? googleId : existing.googleId || null
      });
    },
    async get(id) { const record = state.users.get(id); return record ? clone(record) : null; },
    async list() { return Array.from(state.users.values()).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map(clone); },
    // Mirrors repo.pg.mjs's search() exactly - substring match on displayName, self excluded.
    async search(query, { excludeUserId, limit } = {}) {
      const needle = String(query || '').trim().toLowerCase();
      if (!needle) return [];
      let values = Array.from(state.users.values()).filter((u) => u.displayName.toLowerCase().includes(needle));
      if (excludeUserId) values = values.filter((u) => u.id !== excludeUserId);
      values = values.sort((a, b) => a.displayName.localeCompare(b.displayName));
      return values.slice(0, limit || 8).map(clone);
    },
    async update(id, patch) {
      const record = state.users.get(id);
      if (!record) throw new ApiError(404, 'USER_NOT_FOUND');
      Object.assign(record, patch);
      return clone(record);
    },
    // Trader-editable fields only - mirrors repo.pg.mjs's updateProfile() exactly: kyc_status/
    // xp_total/role are never assigned here, structurally, regardless of what patch contains.
    async updateProfile(id, patch) {
      const record = state.users.get(id);
      if (!record) throw new ApiError(404, 'USER_NOT_FOUND');
      if (patch.email) {
        const taken = Array.from(state.users.values()).find((u) => u.id !== id && u.email === patch.email);
        if (taken) throw new ApiError(409, 'EMAIL_TAKEN');
      }
      if ('displayName' in patch) record.displayName = patch.displayName;
      if ('email' in patch) record.email = patch.email || null;
      if ('phone' in patch) record.phone = patch.phone || null;
      if ('profileRole' in patch) record.profileRole = patch.profileRole;
      if ('avatarDataUrl' in patch) record.avatarDataUrl = patch.avatarDataUrl || null;
      return clone(record);
    },
    // The ONLY way emailVerified/emailVerifiedAt is ever written (020_auth_sessions.sql) - set
    // once a real email-verification transaction (routes.auth.mjs) is consumed, never trusted
    // from any client-supplied field on register/update.
    async markEmailVerified(id) {
      const record = state.users.get(id);
      if (!record) throw new ApiError(404, 'USER_NOT_FOUND');
      record.emailVerified = true;
      record.emailVerifiedAt = now();
      return clone(record);
    },
    // The ONLY way kycStatus is ever written - mirrors repo.pg.mjs's updateKyc().
    async updateKyc(id, kycStatus) {
      if (!['not_started', 'pending', 'verified', 'rejected'].includes(kycStatus)) throw new ApiError(400, 'VALIDATION_FAILED');
      const record = state.users.get(id);
      if (!record) throw new ApiError(404, 'USER_NOT_FOUND');
      record.kycStatus = kycStatus;
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
      Array.from(state.likes.values()).filter((l) => l.postId === id).forEach((l) => state.likes.delete(l.id));
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

  const likes = {
    async find(postId, userId) {
      const record = Array.from(state.likes.values()).find((l) => l.postId === postId && l.userId === userId);
      return record ? clone(record) : null;
    },
    async create({ postId, userId }) {
      if (!state.posts.has(postId)) throw new ApiError(404, 'POST_NOT_FOUND');
      requireUser(userId);
      const existing = await likes.find(postId, userId);
      if (existing) return existing;
      const record = { id: newId('like'), postId, userId, createdAt: now() };
      state.likes.set(record.id, record);
      return clone(record);
    },
    async remove(postId, userId) {
      const record = Array.from(state.likes.values()).find((l) => l.postId === postId && l.userId === userId);
      if (record) state.likes.delete(record.id);
    },
    async listByPost(postId) {
      return Array.from(state.likes.values()).filter((l) => l.postId === postId).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)).map(clone);
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
    async countByListing(listingId) { return Array.from(state.purchases.values()).filter((p) => p.listingId === listingId).length; },
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
    // Mirrors repo.pg.mjs's findOrCreate: listingId path unchanged, counterpartyId path (listingId
    // omitted) is a general DM to any user, looked up symmetrically regardless of who initiated.
    async findOrCreate({ listingId, buyerId, counterpartyId }) {
      if (listingId) {
        const listing = state.listings.get(listingId);
        if (!listing) throw new ApiError(404, 'LISTING_NOT_FOUND');
        if (listing.sellerId === buyerId) throw new ApiError(400, 'CANNOT_MESSAGE_OWN_LISTING');
        const existing = Array.from(state.threads.values()).find((t) => t.listingId === listingId && t.buyerId === buyerId);
        if (existing) return clone(existing);
        const record = { id: newId('thread'), listingId, buyerId, sellerId: listing.sellerId, createdAt: now() };
        state.threads.set(record.id, record);
        return clone(record);
      }
      if (!counterpartyId) throw new ApiError(400, 'VALIDATION_FAILED');
      if (counterpartyId === buyerId) throw new ApiError(400, 'CANNOT_MESSAGE_SELF');
      requireUser(counterpartyId);
      const existing = Array.from(state.threads.values()).find((t) =>
        !t.listingId && ((t.buyerId === buyerId && t.sellerId === counterpartyId) || (t.buyerId === counterpartyId && t.sellerId === buyerId)));
      if (existing) return clone(existing);
      const record = { id: newId('thread'), listingId: null, buyerId, sellerId: counterpartyId, createdAt: now() };
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
    },
    // Backs the account profile's "app uptime" stat - total accumulated online time across every
    // user_sessions row ever recorded for this user (started_at..ended_at/last_heartbeat_at),
    // same accumulation aggregateByUser() does for the admin panel, just scoped to one user so
    // switching characters (a full page reload) never resets it back to zero.
    async hoursOnlineFor(userId) {
      requireUser(userId);
      const totalMs = Array.from(state.sessions.values())
        .filter((s) => s.userId === userId)
        .reduce((sum, s) => sum + Math.max(0, new Date(s.endedAt || s.lastHeartbeatAt) - new Date(s.startedAt)), 0);
      return totalMs / 3600000;
    },
    // Backs the server-only 'five_day_login_streak' achievement check - mirrors repo.pg.mjs's
    // consecutiveLoginDays() exactly: longest run of consecutive calendar days with a session.
    async consecutiveLoginDays(userId) {
      const days = new Set();
      Array.from(state.sessions.values()).filter((s) => s.userId === userId).forEach((s) => { days.add(new Date(s.startedAt).toISOString().slice(0, 10)); });
      const sortedDays = Array.from(days).sort();
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
    },
    // Section 7.16 follow-up: per-user AND per-provider breakdown (not just one lifetime
    // total), for the Admin Users tab's per-user detail view.
    async aggregateByUserAndProvider(userId) {
      const buckets = new Map();
      Array.from(state.usageEvents.values()).filter((e) => e.userId === userId).forEach((e) => {
        buckets.set(e.provider, (buckets.get(e.provider) || 0) + (e.totalTokens || 0));
      });
      return Array.from(buckets.entries()).map(([provider, totalTokens]) => ({ provider, totalTokens }));
    },
    // Phase 8c - mirrors repo.pg.mjs's summaryForUser() exactly, see its own comment.
    async summaryForUser(userId) {
      const todayKey = now().slice(0, 10);
      const monthKey = now().slice(0, 7);
      function emptyBucket() { return { promptTokens: 0, completionTokens: 0, totalTokens: 0, byProvider: {} }; }
      function addInto(bucket, e) {
        const promptTokens = e.promptTokens || 0, completionTokens = e.completionTokens || 0, totalTokens = e.totalTokens || 0;
        bucket.promptTokens += promptTokens; bucket.completionTokens += completionTokens; bucket.totalTokens += totalTokens;
        const perProvider = bucket.byProvider[e.provider] || { promptTokens: 0, completionTokens: 0, totalTokens: 0, calls: 0 };
        perProvider.promptTokens += promptTokens; perProvider.completionTokens += completionTokens; perProvider.totalTokens += totalTokens; perProvider.calls += 1;
        bucket.byProvider[e.provider] = perProvider;
      }
      const mine = Array.from(state.usageEvents.values()).filter((e) => e.userId === userId);
      const today = emptyBucket(), thisMonth = emptyBucket(), lifetime = emptyBucket();
      mine.forEach((e) => {
        if (e.createdAt.slice(0, 10) === todayKey) addInto(today, e);
        if (e.createdAt.slice(0, 7) === monthKey) addInto(thisMonth, e);
        addInto(lifetime, e);
      });
      return { todayKey, today, monthKey, thisMonth, lifetime };
    }
  };

  // Section 7.16 follow-up: append-only log of every callProvider() outcome (success or
  // failure), reported by pattern-ai-server.mjs via POST /internal/ai-health-event. Read-side
  // aggregation (status derivation) lives in server/admin/routes.mjs, not here - mirrors
  // repo.pg.mjs's providerHealth domain exactly.
  const providerHealth = {
    async record({ provider, ok, errorCode, latencyMs, source }) {
      const record = {
        id: newId('aiHealthEvent'), provider: String(provider || 'unknown'), ok: Boolean(ok),
        errorCode: errorCode || null, latencyMs: latencyMs == null ? null : Math.round(latencyMs),
        source: source || null, createdAt: now()
      };
      state.providerHealth.set(record.id, record);
      return clone(record);
    },
    async latestByProvider() {
      const result = {};
      Array.from(state.providerHealth.values())
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
        .forEach((event) => { result[event.provider] = clone(event); });
      return result;
    },
    async aggregateSince(sinceIso) {
      const buckets = new Map();
      Array.from(state.providerHealth.values()).filter((e) => new Date(e.createdAt) >= new Date(sinceIso)).forEach((e) => {
        const bucket = buckets.get(e.provider) || { provider: e.provider, calls: 0, failures: 0, latencies: [] };
        bucket.calls += 1;
        if (!e.ok) bucket.failures += 1;
        if (e.latencyMs != null) bucket.latencies.push(e.latencyMs);
        buckets.set(e.provider, bucket);
      });
      return Array.from(buckets.values()).map((b) => ({
        provider: b.provider, calls: b.calls, failures: b.failures,
        avgLatencyMs: b.latencies.length ? b.latencies.reduce((sum, v) => sum + v, 0) / b.latencies.length : null
      }));
    },
    async recent({ limit } = {}) {
      return Array.from(state.providerHealth.values())
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, limit || 50)
        .map(clone);
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

  const xpEvents = {
    // Records the event AND bumps the user's xpTotal in the same call - mirrors repo.pg.mjs's
    // record() exactly, so xpTotal is always a maintained running total, never re-summed. A
    // dedupeKey collision mirrors repo.pg.mjs's unique-violation handling: {duplicate:true},
    // xpTotal untouched, instead of a second row.
    async record({ userId, type, domain, points, sourceType, sourceId, dedupeKey, meta }) {
      requireUser(userId);
      if (dedupeKey && Array.from(state.xpEvents.values()).some((e) => e.userId === userId && e.dedupeKey === dedupeKey)) {
        return { duplicate: true };
      }
      const pointsValue = Math.round(Number(points) || 0);
      const record = {
        id: newId('xpEvent'), userId, type: String(type || ''), domain: domain || null, points: pointsValue,
        sourceType: sourceType || null, sourceId: sourceId || null, dedupeKey: dedupeKey || null,
        meta: meta || {}, occurredAt: now()
      };
      state.xpEvents.set(record.id, record);
      const user = state.users.get(userId);
      user.xpTotal = (user.xpTotal || 0) + pointsValue;
      return { event: clone(record), user: clone(user) };
    },
    async listForUser(userId) {
      return Array.from(state.xpEvents.values()).filter((e) => e.userId === userId).sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt)).map(clone);
    },
    async totalForUser(userId) {
      const user = state.users.get(userId);
      return user ? user.xpTotal || 0 : 0;
    },
    async hasType(userId, type) {
      return Array.from(state.xpEvents.values()).some((e) => e.userId === userId && e.type === type);
    },
    async countForSource(userId, type, sourceId) {
      return Array.from(state.xpEvents.values()).filter((e) => e.userId === userId && e.type === type && e.sourceId === sourceId).length;
    },
    async countForPeriod(userId, type, periodStart) {
      const start = new Date(periodStart).getTime();
      return Array.from(state.xpEvents.values()).filter((e) => e.userId === userId && e.type === type && new Date(e.occurredAt).getTime() >= start).length;
    },
    async domainTotalToday(userId, domain) {
      const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0);
      return Array.from(state.xpEvents.values())
        .filter((e) => e.userId === userId && e.domain === domain && new Date(e.occurredAt).getTime() >= dayStart.getTime())
        .reduce((sum, e) => sum + e.points, 0);
    },
    async recurringTotalToday(userId, onceTypes) {
      const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0);
      const once = new Set(onceTypes || []);
      return Array.from(state.xpEvents.values())
        .filter((e) => e.userId === userId && e.domain && !once.has(e.type) && new Date(e.occurredAt).getTime() >= dayStart.getTime())
        .reduce((sum, e) => sum + e.points, 0);
    },
    async sourceTotal(userId, sourceType, sourceId) {
      return Array.from(state.xpEvents.values())
        .filter((e) => e.userId === userId && e.sourceType === sourceType && e.sourceId === sourceId)
        .reduce((sum, e) => sum + e.points, 0);
    },
    async domainBreakdown(userId) {
      const out = { session: 0, pattern: 0, strategy: 0, trade: 0, psychology: 0, community: 0 };
      Array.from(state.xpEvents.values()).forEach((e) => { if (e.userId === userId && e.domain in out) out[e.domain] += e.points; });
      return out;
    },
    async usefulActivityDays(userId, eligibleTypes) {
      const eligible = new Set(eligibleTypes || []);
      const days = new Set();
      Array.from(state.xpEvents.values()).forEach((e) => {
        if (e.userId === userId && eligible.has(e.type)) days.add(new Date(e.occurredAt).toISOString().slice(0, 10));
      });
      return Array.from(days).sort().reverse();
    },
    async countByType(userId, type) {
      return Array.from(state.xpEvents.values()).filter((e) => e.userId === userId && e.type === type).length;
    },
    async sourceCountsForType(userId, type) {
      const counts = new Map();
      Array.from(state.xpEvents.values()).forEach((e) => {
        if (e.userId === userId && e.type === type && e.sourceId) counts.set(e.sourceId, (counts.get(e.sourceId) || 0) + 1);
      });
      return Array.from(counts.entries()).map(([sourceId, count]) => ({ sourceId, count }));
    },
    async sourceIdsWithAllTypes(userId, types) {
      if (!types || !types.length) return [];
      const typesBySource = new Map();
      Array.from(state.xpEvents.values()).forEach((e) => {
        if (e.userId !== userId || !e.sourceId || !types.includes(e.type)) return;
        if (!typesBySource.has(e.sourceId)) typesBySource.set(e.sourceId, new Set());
        typesBySource.get(e.sourceId).add(e.type);
      });
      const out = [];
      typesBySource.forEach((typeSet, sourceId) => { if (typeSet.size === types.length) out.push(sourceId); });
      return out;
    }
  };

  const achievements = {
    async unlock({ userId, achievementKey, evidence }) {
      requireUser(userId);
      const existing = Array.from(state.achievements.values()).find((a) => a.userId === userId && a.achievementKey === achievementKey);
      if (existing) return { achievement: clone(existing), created: false };
      const record = { id: newId('achievement'), userId, achievementKey: String(achievementKey || ''), unlockedAt: now(), evidence: evidence || {} };
      state.achievements.set(record.id, record);
      return { achievement: clone(record), created: true };
    },
    async listForUser(userId) {
      return Array.from(state.achievements.values()).filter((a) => a.userId === userId).sort((a, b) => new Date(b.unlockedAt) - new Date(a.unlockedAt)).map(clone);
    }
  };

  // Mirrors repo.pg.mjs's xpConfig exactly - see 012_xp_config_overrides.sql for the config_key
  // namespace convention.
  const xpConfig = {
    async list() {
      return Array.from(state.xpConfig.values()).sort((a, b) => (a.key < b.key ? -1 : 1)).map(clone);
    },
    async set(configKey, value, updatedBy) {
      const record = { key: String(configKey || ''), value: value ?? null, updatedBy: updatedBy || null, updatedAt: now() };
      state.xpConfig.set(record.key, record);
      return clone(record);
    },
    async remove(configKey) {
      state.xpConfig.delete(String(configKey || ''));
    }
  };

  // Module 1 of the local-first-to-server migration (see ARCHITECTURE.md's Global Data Sync
  // section). Named tradingSessions, not sessions - that name is already the admin heartbeat
  // domain above. Stores the full nested SessionRecord shape (entries[].scenarios[]) as one
  // record per session; repo.pg.mjs explodes the same logical shape into real child tables for
  // cross-scenario querying, but the in-memory fake only needs to reproduce the same reads/
  // writes, not the same physical layout - see its own comment for why those columns are real
  // there. Scoped by user_id alone (not by character - see the migration file's comment).
  const tradingSessions = {
    async upsert(userId, record) {
      requireUser(userId);
      if (!record || !record.id) throw new ApiError(400, 'VALIDATION_FAILED');
      const existing = state.tradingSessions.get(record.id);
      if (existing && existing.userId !== userId) throw new ApiError(403, 'NOT_SESSION_OWNER');
      const stamp = now();
      const stored = {
        id: record.id, userId, character: String(record.character || 'hunter'),
        name: record.name || null, market: record.market || null, timeframe: record.timeframe || null,
        date: record.date || null, jalali: record.jalali || null,
        startedAt: record.startedAt ? new Date(record.startedAt).toISOString() : (existing ? existing.startedAt : stamp),
        closedAt: record.closedAt ? new Date(record.closedAt).toISOString() : null,
        status: record.status === 'closed' ? 'closed' : 'open',
        updateIntervalMinutes: Number(record.updateIntervalMinutes) || 30,
        gracePeriodMinutes: Number(record.gracePeriodMinutes) || 5,
        fateSummary: record.fateSummary ?? null,
        previousSessionSummary: record.previousSessionSummary ?? null,
        aiSessionAnalysis: record.aiSessionAnalysis || null,
        aiSessionAnalysisResult: record.aiSessionAnalysisResult ?? null,
        finalEntryId: record.finalEntryId || null,
        entries: (record.entries || []).map(function (entry) {
          return {
            id: entry.id, sessionId: record.id, type: entry.type,
            createdAt: entry.createdAt ? new Date(entry.createdAt).toISOString() : stamp,
            hasImage: !!entry.hasImage, imageBlobId: entry.imageBlobId || null, imageUrl: entry.imageUrl || null,
            timeframe: entry.timeframe || null, market: entry.market || null, tradingSession: entry.tradingSession || null,
            gregorianDate: entry.gregorianDate || null, note: entry.note || null, movementNote: entry.movementNote || null,
            relatedScenarioIds: Array.isArray(entry.relatedScenarioIds) ? entry.relatedScenarioIds : [],
            aiAnalysisResult: entry.aiAnalysisResult ?? null,
            scenarios: (entry.scenarios || []).map(function (scenario) {
              return {
                id: scenario.id, entryId: entry.id, sessionId: record.id,
                title: scenario.title || '', description: scenario.description || null, evidence: scenario.evidence || null,
                trigger: scenario.trigger || null, occurred: scenario.occurred === true,
                patternTagId: (scenario.pattern && scenario.pattern.patternTagId) || null,
                completionPercent: scenario.completion != null ? Number(scenario.completion) : null,
                probabilityHistory: Array.isArray(scenario.probabilityHistory) ? scenario.probabilityHistory : [],
                pattern: scenario.pattern ?? null, executionPlan: scenario.executionPlan ?? null
              };
            })
          };
        }),
        activityLog: (record.activityLog || []).map(function (item) {
          return {
            id: item.id, sessionId: record.id, type: item.type, detail: item.detail || null,
            scenarioId: item.scenarioId || null, loggedAt: item.loggedAt ? new Date(item.loggedAt).toISOString() : stamp,
            countsTowardLoopUpdate: item.countsTowardLoopUpdate !== false
          };
        }),
        createdAt: existing ? existing.createdAt : stamp, updatedAt: stamp
      };
      state.tradingSessions.set(record.id, stored);
      return clone(stored);
    },
    async get(userId, id) {
      const record = state.tradingSessions.get(id);
      if (!record || record.userId !== userId) return null;
      return clone(record);
    },
    async listByUser(userId) {
      return Array.from(state.tradingSessions.values()).filter((s) => s.userId === userId).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).map(clone);
    },
    async remove(userId, id) {
      const record = state.tradingSessions.get(id);
      if (!record) return;
      if (record.userId !== userId) throw new ApiError(403, 'NOT_SESSION_OWNER');
      state.tradingSessions.delete(id);
    },
    // Mirrors repo.pg.mjs's countScenariosForPattern() - backs the XP engine's
    // pattern_report_generated 5-sample gate.
    async countScenariosForPattern(userId, patternId) {
      let count = 0;
      Array.from(state.tradingSessions.values()).forEach((session) => {
        if (session.userId !== userId) return;
        (session.entries || []).forEach((entry) => {
          (entry.scenarios || []).forEach((scenario) => { if (scenario.patternTagId === patternId) count += 1; });
        });
      });
      return count;
    }
  };

  // Module 2 of the local-first-to-server migration (see ARCHITECTURE.md's Global Data Sync
  // section, 7.18). Flatter than tradingSessions - stages/screenshots/chat messages are each a
  // simple one-level array here too, no denormalized cross-link needed (repo.pg.mjs still uses
  // real child tables for these, per the migration file's reasoning, but the in-memory fake only
  // needs to reproduce the same reads/writes, not the same physical layout).
  const patterns = {
    async upsert(userId, record) {
      requireUser(userId);
      if (!record || !record.id) throw new ApiError(400, 'VALIDATION_FAILED');
      const existing = state.patterns.get(record.id);
      if (existing && existing.userId !== userId) throw new ApiError(403, 'NOT_PATTERN_OWNER');
      const stamp = now();
      const stored = {
        id: record.id, userId,
        name: record.name || '', description: record.description || '',
        completionThreshold: Math.max(0, Math.min(100, Number(record.completionThreshold ?? 70))),
        usageCount: Math.max(0, Number(record.usageCount || 0)), isPublic: Boolean(record.isPublic),
        stages: (record.stages || []).map(function (item, index) {
          return { id: item.id, patternId: record.id, order: Number(item.order || index + 1), text: item.text || '' };
        }),
        referenceScreenshots: (record.referenceScreenshots || []).map(function (item) {
          return {
            id: item.id, patternId: record.id, fileName: item.fileName || null, blobId: item.blobId || null,
            imageUrl: item.imageUrl || null, uploadedAt: item.uploadedAt || stamp, note: item.note || null
          };
        }),
        chatHistory: (record.chatHistory || []).map(function (item) {
          return {
            id: item.id, patternId: record.id, role: item.role, content: item.content || '',
            createdAt: item.createdAt || stamp, suggestedStages: item.suggestedStages || null
          };
        }),
        createdAt: existing ? existing.createdAt : stamp, updatedAt: stamp
      };
      state.patterns.set(record.id, stored);
      return clone(stored);
    },
    async get(userId, id) {
      const record = state.patterns.get(id);
      if (!record || record.userId !== userId) return null;
      return clone(record);
    },
    async listByUser(userId) {
      return Array.from(state.patterns.values()).filter((p) => p.userId === userId).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).map(clone);
    },
    async remove(userId, id) {
      const record = state.patterns.get(id);
      if (!record) return;
      if (record.userId !== userId) throw new ApiError(403, 'NOT_PATTERN_OWNER');
      state.patterns.delete(id);
    }
  };

  // Module 3 of the local-first-to-server migration (see ARCHITECTURE.md's Global Data Sync
  // section, 7.18). Mirrors the strategies domain shape - see the migration file's comment for
  // why the three sections are flattened onto the parent object while attachments/chatHistory/
  // detectionEvents stay their own arrays.
  const strategies = {
    async upsert(userId, record) {
      requireUser(userId);
      if (!record || !record.id) throw new ApiError(400, 'VALIDATION_FAILED');
      const existing = state.strategies.get(record.id);
      if (existing && existing.userId !== userId) throw new ApiError(403, 'NOT_STRATEGY_OWNER');
      const stamp = now();
      const pm = record.positionManagement || {}, rm = record.riskManagement || {}, of = record.overallFramework || {};
      const attachmentsOf = function (category, list) {
        return (list || []).map(function (item) {
          return {
            id: item.id, strategyId: record.id, category: category, fileName: item.fileName || null,
            blobId: item.blobId || null, fileUrl: item.fileUrl || null, mimeType: item.mimeType || null,
            size: Number(item.size || 0), note: item.note || null, uploadedAt: item.uploadedAt || stamp
          };
        });
      };
      const stored = {
        id: record.id, userId,
        name: record.name || '', active: record.active !== false, isPublic: Boolean(record.isPublic),
        origin: record.origin === 'ai_from_event' ? 'ai_from_event' : 'manual',
        positionManagement: {
          entryRules: pm.entryRules || '', stopLossRules: pm.stopLossRules || '', exitTargetRules: pm.exitTargetRules || '',
          positionSizingRules: pm.positionSizingRules || '', freeNotes: pm.freeNotes || '',
          attachments: attachmentsOf('positionManagement', pm.attachments)
        },
        riskManagement: {
          maxRiskPerTradePercent: rm.maxRiskPerTradePercent ?? null, dailyDrawdownLimitPercent: rm.dailyDrawdownLimitPercent ?? null,
          totalDrawdownLimitPercent: rm.totalDrawdownLimitPercent ?? null, maxConcurrentTrades: rm.maxConcurrentTrades ?? null,
          maxProfitCapPerTrade: rm.maxProfitCapPerTrade ?? null, freeNotes: rm.freeNotes || '',
          attachments: attachmentsOf('riskManagement', rm.attachments)
        },
        overallFramework: { description: of.description || '', attachments: attachmentsOf('overallFramework', of.attachments) },
        chatHistory: (record.chatHistory || []).map(function (item) {
          return { id: item.id, strategyId: record.id, role: item.role, content: item.content || '', createdAt: item.createdAt || stamp, suggestions: item.suggestions || null };
        }),
        aiUnderstandingSummary: record.aiUnderstandingSummary || null,
        detectionEvents: (record.detectionEvents || []).map(function (item) {
          return {
            id: item.id, strategyId: record.id, detectedAt: item.detectedAt || stamp, source: item.source || null,
            predictedOutcome: item.predictedOutcome || '', status: ['pending', 'confirmed', 'invalidated'].indexOf(item.status) > -1 ? item.status : 'pending',
            resolvedAt: item.resolvedAt || null, note: item.note || null
          };
        }),
        createdAt: existing ? existing.createdAt : stamp, updatedAt: stamp
      };
      state.strategies.set(record.id, stored);
      return clone(stored);
    },
    async get(userId, id) {
      const record = state.strategies.get(id);
      if (!record || record.userId !== userId) return null;
      return clone(record);
    },
    async listByUser(userId) {
      return Array.from(state.strategies.values()).filter((s) => s.userId === userId).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).map(clone);
    },
    async remove(userId, id) {
      const record = state.strategies.get(id);
      if (!record) return;
      if (record.userId !== userId) throw new ApiError(403, 'NOT_STRATEGY_OWNER');
      state.strategies.delete(id);
    }
  };

  // Module 4 of the local-first-to-server migration (see ARCHITECTURE.md's Global Data Sync
  // section, 7.18). Mirrors trade.types.js's Trade shape - screenshots/emotionLog get their own
  // arrays (repo.pg.mjs uses real child tables for these); everything else stays flattened onto
  // the record object, matching the migration file's column-vs-jsonb reasoning.
  const trades = {
    async upsert(userId, record) {
      requireUser(userId);
      if (!record || !record.id) throw new ApiError(400, 'VALIDATION_FAILED');
      const existing = state.trades.get(record.id);
      if (existing && existing.userId !== userId) throw new ApiError(403, 'NOT_TRADE_OWNER');
      const stamp = now();
      const source = record.source || {};
      const stored = {
        id: record.id, userId,
        status: ['hunting', 'open', 'closed', 'cancelled'].indexOf(record.status) > -1 ? record.status : 'hunting',
        direction: record.direction === 'short' ? 'short' : 'long',
        entryMode: record.entryMode === 'quick' ? 'quick' : 'full',
        entryPrice: record.entryPrice ?? null, stopLoss: record.stopLoss ?? null,
        takeProfits: Array.isArray(record.takeProfits) ? record.takeProfits : [],
        slDistancePercent: record.slDistancePercent ?? null, riskPercent: record.riskPercent ?? null, riskAmount: record.riskAmount ?? null,
        leverage: record.leverage ?? null, positionSize: record.positionSize ?? null, marginRequired: record.marginRequired ?? null,
        liquidationPrice: record.liquidationPrice ?? null, rr: record.rr ?? null,
        marginMode: record.marginMode === 'cross' ? 'cross' : 'isolated',
        commission: record.commission || null, breakevenPercent: record.breakevenPercent ?? null,
        exitPrice: record.exitPrice ?? null, outcome: record.outcome || null, pnl: record.pnl ?? null, pnlPercent: record.pnlPercent ?? null,
        session: record.session || 'london', primaryTimeframe: record.primaryTimeframe || null,
        timeframeTrends: Array.isArray(record.timeframeTrends) ? record.timeframeTrends : [],
        conceptTags: Array.isArray(record.conceptTags) ? record.conceptTags : [],
        linkedPatternIds: Array.isArray(record.linkedPatternIds) ? record.linkedPatternIds : [],
        linkedStrategyId: record.linkedStrategyId || null, chartNote: record.chartNote || '',
        statusHistory: Array.isArray(record.statusHistory) ? record.statusHistory : [],
        source: { character: source.character || null, sessionId: source.sessionId || null, scenarioId: source.scenarioId || null },
        aiPredictionLinks: Array.isArray(record.aiPredictionLinks) ? record.aiPredictionLinks : [],
        aiInitialAnalysis: record.aiInitialAnalysis || null, disciplineImpact: Number(record.disciplineImpact || 0),
        screenshots: (record.screenshots || []).map(function (item) {
          return { id: item.id, tradeId: record.id, fileName: item.fileName || null, blobId: item.blobId || null, imageUrl: item.imageUrl || null, mimeType: item.mimeType || null, uploadedAt: item.uploadedAt || stamp };
        }),
        emotionLog: (record.emotionLog || []).map(function (item) {
          return {
            id: item.id, tradeId: record.id, timestamp: item.timestamp || stamp, stage: ['entry', 'mid_trade', 'exit'].indexOf(item.stage) > -1 ? item.stage : 'entry',
            dominantEmotions: Array.isArray(item.dominantEmotions) ? item.dominantEmotions : [], emotionDetails: Array.isArray(item.emotionDetails) ? item.emotionDetails : [],
            stressLevel: item.stressLevel ?? null, focusQuality: item.focusQuality ?? null, planCommitment: item.planCommitment ?? null,
            wouldTakeIfNotForced: item.wouldTakeIfNotForced ?? null, note: item.note || ''
          };
        }),
        createdAt: existing ? existing.createdAt : (record.createdAt || stamp), updatedAt: stamp,
        openedAt: record.openedAt || null, closedAt: record.closedAt || null
      };
      state.trades.set(record.id, stored);
      return clone(stored);
    },
    async get(userId, id) {
      const record = state.trades.get(id);
      if (!record || record.userId !== userId) return null;
      return clone(record);
    },
    async listByUser(userId) {
      return Array.from(state.trades.values()).filter((t) => t.userId === userId).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).map(clone);
    },
    async remove(userId, id) {
      const record = state.trades.get(id);
      if (!record) return;
      if (record.userId !== userId) throw new ApiError(403, 'NOT_TRADE_OWNER');
      state.trades.delete(id);
    }
  };

  // Module 5 (final module) of the local-first-to-server migration. One document per user, no
  // child tables, no list - see the migration file's comment. Stored (and returned) verbatim as
  // the client sent it; this repo layer only owns the user_id-scoped upsert/read, never
  // reshapes the profile's internal fields.
  const mentalHealthProfile = {
    async upsert(userId, profile) {
      requireUser(userId);
      if (!profile || typeof profile !== 'object') throw new ApiError(400, 'VALIDATION_FAILED');
      const existing = state.mentalHealthProfiles.get(userId);
      const stamp = now();
      state.mentalHealthProfiles.set(userId, { userId, profile, createdAt: existing ? existing.createdAt : stamp, updatedAt: stamp });
      return clone(profile);
    },
    async get(userId) {
      const record = state.mentalHealthProfiles.get(userId);
      return record ? clone(record.profile) : null;
    }
  };

  // Journey G (AI Companion & Journey Orchestration). Same one-document-per-user shape as
  // mentalHealthProfile above, for the same reason - see 018_companion_state.sql's comment.
  const companionState = {
    async upsert(userId, companionStateBody) {
      requireUser(userId);
      if (!companionStateBody || typeof companionStateBody !== 'object') throw new ApiError(400, 'VALIDATION_FAILED');
      const existing = state.companionState.get(userId);
      const stamp = now();
      state.companionState.set(userId, { userId, state: companionStateBody, createdAt: existing ? existing.createdAt : stamp, updatedAt: stamp });
      return clone(companionStateBody);
    },
    async get(userId) {
      const record = state.companionState.get(userId);
      return record ? clone(record.state) : null;
    }
  };

  // Phase 8a of the local-first-to-server-authoritative migration - see
  // 019_session_signatures_and_preferences.sql's own comment. Mirrors repo.pg.mjs's
  // sessionSignatures domain: keyed by the record's own id, deduped in practice by the client's
  // own sessionId lookup before it ever calls upsert().
  const sessionSignatures = {
    async upsert(userId, record) {
      requireUser(userId);
      if (!record || !record.id || !record.sessionId) throw new ApiError(400, 'VALIDATION_FAILED');
      const existing = state.sessionSignatures.get(record.id);
      if (existing && existing.userId !== userId) throw new ApiError(403, 'NOT_SIGNATURE_OWNER');
      const stored = {
        id: record.id, userId, sessionId: String(record.sessionId), character: record.character || '',
        market: record.market || '', timeframe: record.timeframe || '', date: record.date || '',
        movementSequence: record.movementSequence || [], patternIds: record.patternIds || [],
        strategyIds: record.strategyIds || [], scenarioOutcomes: record.scenarioOutcomes || [],
        tradeSummary: record.tradeSummary || {}, fateSummaryText: record.fateSummaryText || '',
        createdAt: existing ? existing.createdAt : now()
      };
      state.sessionSignatures.set(record.id, stored);
      return clone(stored);
    },
    async listByUser(userId) {
      return Array.from(state.sessionSignatures.values())
        .filter((s) => s.userId === userId)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .map(clone);
    },
    async remove(userId, id) {
      const record = state.sessionSignatures.get(id);
      if (!record) return;
      if (record.userId !== userId) throw new ApiError(403, 'NOT_SIGNATURE_OWNER');
      state.sessionSignatures.delete(id);
    }
  };

  // Generic {user_id, pref_key -> value} store - see 019_session_signatures_and_preferences.sql's
  // own comment. Keyed by a composite "userId::prefKey" string since this Map has no natural
  // compound key the way a real table's PRIMARY KEY (user_id, pref_key) does.
  function preferenceMapKey(userId, prefKey) { return `${userId}::${prefKey}`; }
  const userPreferences = {
    async upsert(userId, prefKey, value) {
      requireUser(userId);
      const key = String(prefKey || '');
      if (!key) throw new ApiError(400, 'VALIDATION_FAILED');
      const stored = { id: key, value: value ?? null, updatedAt: now() };
      state.userPreferences.set(preferenceMapKey(userId, key), stored);
      return clone(stored);
    },
    async listByUser(userId) {
      const prefix = `${userId}::`;
      return Array.from(state.userPreferences.entries())
        .filter(([mapKey]) => mapKey.startsWith(prefix))
        .map(([, value]) => clone(value))
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    },
    async remove(userId, prefKey) {
      state.userPreferences.delete(preferenceMapKey(userId, String(prefKey || '')));
    }
  };

  // One row per conversation (017_ai_conversations.sql) - mirrors repo.pg.mjs's aiChatHistory
  // domain exactly. state.aiChatHistory is keyed by conversation id, not userId, since a user
  // can now have many.
  const aiChatHistory = {
    async list(userId) {
      return Array.from(state.aiChatHistory.values())
        .filter((c) => c.userId === userId)
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
        .map((c) => ({ id: c.id, title: c.title, provider: c.provider, messageCount: c.messages.length, tokens: c.tokens, updatedAt: c.updatedAt }));
    },
    async get(userId, id) {
      const record = state.aiChatHistory.get(id);
      return record && record.userId === userId ? clone(record) : null;
    },
    async create({ userId, provider, title, messages, tokens }) {
      requireUser(userId);
      if (!Array.isArray(messages)) throw new ApiError(400, 'VALIDATION_FAILED');
      const record = { id: newId('aiConv'), userId, title: title || 'Untitled conversation', provider: provider || 'openai', messages, tokens: Math.max(0, Number(tokens) || 0), updatedAt: now() };
      state.aiChatHistory.set(record.id, record);
      return clone(record);
    },
    // Atomic append, mirrors repo.pg.mjs's `messages=messages || $3::jsonb` exactly: `messages`
    // here is ONLY the new turn(s) being added, concatenated onto the real, current record - never
    // a client-supplied full array replacing it (see repo.pg.mjs's own comment for the lost-update
    // race this replaces). tokens is likewise INCREMENTED (this call's own new tokens only), never
    // replaced.
    async appendAndSave(userId, id, { title, messages, tokens }) {
      if (!Array.isArray(messages) || !messages.length) throw new ApiError(400, 'VALIDATION_FAILED');
      const existing = state.aiChatHistory.get(id);
      if (!existing || existing.userId !== userId) return null;
      const record = { ...existing, messages: existing.messages.concat(messages), title: title || existing.title, tokens: (existing.tokens || 0) + Math.max(0, Number(tokens) || 0), updatedAt: now() };
      state.aiChatHistory.set(id, record);
      return clone(record);
    },
    async remove(userId, id) {
      const existing = state.aiChatHistory.get(id);
      if (!existing || existing.userId !== userId) return false;
      state.aiChatHistory.delete(id);
      return true;
    }
  };

  // Real, server-side sessions (020_auth_sessions.sql) - mirrors repo.pg.mjs's authSessions
  // domain exactly. Sessions are looked up by the SHA-256 hash of the raw cookie value, never
  // by the raw value itself (see server/community/security/session-service.mjs) - this domain
  // never sees a raw session id at all, only its hash, exactly like real Postgres storage would.
  const authSessions = {
    async create({ userId, sessionHash, familyId, idleExpiresAt, absoluteExpiresAt, ipHash, userAgent }) {
      requireUser(userId);
      const record = {
        id: newId('asess'), userId, sessionHash, familyId, createdAt: now(), lastSeenAt: now(),
        idleExpiresAt, absoluteExpiresAt, revokedAt: null, revokedReason: null, reauthAt: now(),
        ipHash: ipHash || null, userAgent: userAgent || null
      };
      state.authSessions.set(record.id, record);
      return clone(record);
    },
    async findByHash(sessionHash) {
      const record = Array.from(state.authSessions.values()).find((s) => s.sessionHash === sessionHash);
      return record ? clone(record) : null;
    },
    async touch(id, { lastSeenAt, idleExpiresAt } = {}) {
      const record = state.authSessions.get(id);
      if (!record) return;
      record.lastSeenAt = lastSeenAt || now();
      if (idleExpiresAt) record.idleExpiresAt = idleExpiresAt;
    },
    async markReauth(id) {
      const record = state.authSessions.get(id);
      if (record) record.reauthAt = now();
    },
    async revoke(id, reason) {
      const record = state.authSessions.get(id);
      if (record && !record.revokedAt) { record.revokedAt = now(); record.revokedReason = reason || 'logout'; }
    },
    async revokeAllForUser(userId, reason, { exceptId } = {}) {
      let count = 0;
      for (const record of state.authSessions.values()) {
        if (record.userId === userId && !record.revokedAt && record.id !== exceptId) {
          record.revokedAt = now(); record.revokedReason = reason || 'logout_all'; count += 1;
        }
      }
      return count;
    },
    async revokeFamily(familyId, reason) {
      for (const record of state.authSessions.values()) {
        if (record.familyId === familyId && !record.revokedAt) { record.revokedAt = now(); record.revokedReason = reason || 'replay_detected'; }
      }
    },
    async listActiveForUser(userId) {
      return Array.from(state.authSessions.values())
        .filter((s) => s.userId === userId && !s.revokedAt)
        .sort((a, b) => new Date(b.lastSeenAt) - new Date(a.lastSeenAt))
        .map(clone);
    },
    async deleteExpired(before) {
      let count = 0;
      for (const [id, record] of state.authSessions) {
        if (new Date(record.absoluteExpiresAt) < new Date(before)) { state.authSessions.delete(id); count += 1; }
      }
      return count;
    }
  };

  // (issuer, subject) -> userId mapping for Google/generic-OIDC identities (020_auth_sessions.sql).
  const externalIdentities = {
    async findUserId(issuer, subject) {
      const record = Array.from(state.externalIdentities.values()).find((r) => r.issuer === issuer && r.subject === subject);
      return record ? record.userId : null;
    },
    async link({ userId, issuer, subject, emailAtLink }) {
      requireUser(userId);
      const existing = Array.from(state.externalIdentities.values()).find((r) => r.issuer === issuer && r.subject === subject);
      if (existing && existing.userId !== userId) throw new ApiError(409, 'IDENTITY_ALREADY_LINKED');
      if (existing) return clone(existing);
      const record = { id: newId('extid'), userId, issuer, subject, emailAtLink: emailAtLink || null, linkedAt: now() };
      state.externalIdentities.set(record.id, record);
      return clone(record);
    },
    async listForUser(userId) {
      return Array.from(state.externalIdentities.values()).filter((r) => r.userId === userId).map(clone);
    }
  };

  const securityEvents = {
    async record({ userId, type, ipHash, detail }) {
      const record = { id: newId('sevt'), userId: userId || null, type, ipHash: ipHash || null, detail: detail || {}, createdAt: now() };
      state.securityEvents.set(record.id, record);
      return clone(record);
    },
    async listForUser(userId, { limit = 50 } = {}) {
      return Array.from(state.securityEvents.values())
        .filter((r) => r.userId === userId)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, limit)
        .map(clone);
    },
    async countRecentByType(type, { sinceMs }) {
      const cutoff = Date.now() - sinceMs;
      return Array.from(state.securityEvents.values()).filter((r) => r.type === type && new Date(r.createdAt).getTime() >= cutoff).length;
    }
  };

  // Short-lived OIDC/password-reset/email-verify/legacy-exchange transactions (020_auth_sessions.sql).
  const authTransactions = {
    async create({ id, purpose, userId, tokenHash, payload, expiresAt }) {
      const record = { id: id || newId('atxn'), purpose, userId: userId || null, tokenHash: tokenHash || null, payload: payload || {}, createdAt: now(), expiresAt, consumedAt: null };
      state.authTransactions.set(record.id, record);
      return clone(record);
    },
    async get(id) {
      const record = state.authTransactions.get(id);
      return record ? clone(record) : null;
    },
    async findByTokenHash(tokenHash) {
      const record = Array.from(state.authTransactions.values()).find((r) => r.tokenHash === tokenHash);
      return record ? clone(record) : null;
    },
    async consume(id) {
      const record = state.authTransactions.get(id);
      if (!record || record.consumedAt) return null;
      if (new Date(record.expiresAt) < new Date()) return null;
      record.consumedAt = now();
      return clone(record);
    },
    async deleteExpired(before) {
      let count = 0;
      for (const [id, record] of state.authTransactions) {
        if (new Date(record.expiresAt) < new Date(before)) { state.authTransactions.delete(id); count += 1; }
      }
      return count;
    }
  };

  // Mirrors repo.pg.mjs's health() shape for the admin Technical tab, so that tab works
  // unmodified under the zero-setup in-memory fallback too - there is no real "database" here
  // to check connectivity against, so this is honestly synthetic rather than faking a query.
  async function health() { return { backend: 'memory', dbOk: true, migrations: [] }; }

  return {
    users, posts, comments, likes, listings, purchases, ratings, threads, messages, reports, sessions, usageEvents,
    providerHealth, providerPricing, adminKeys, auditLog, xpEvents, achievements, xpConfig, tradingSessions, patterns,
    strategies, trades, mentalHealthProfile, aiChatHistory, companionState, sessionSignatures, userPreferences,
    authSessions, externalIdentities, securityEvents, authTransactions, health
  };
}
