import { newId } from './id.mjs';
import { ApiError } from '../community/errors.mjs';
import { encryptSecret, decryptSecret } from '../community/security/crypto-util.mjs';
import { encryptionKeyHex } from '../community/security/secrets.mjs';
import { normalizeInstrumentCode, normalizeInstrumentCodes } from './instrument-normalize.mjs';
import { WALLET_DEFAULTS, DEFAULT_STORAGE_PRODUCTS } from '../commercial/commercial-defaults.mjs';
import { spokenTextFor, computeAudioContentHash } from '../community/conversation-audio-identity.mjs';

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
    adminKeys: new Map(), auditLog: new Map(),
    voiceProviderCredentials: new Map(), voiceLanguageConfigs: new Map(), voiceCharacterConfigs: new Map(), voiceTtsUsage: new Map(),
    xpEvents: new Map(), achievements: new Map(), xpConfig: new Map(),
    tradingSessions: new Map(), patterns: new Map(), strategies: new Map(), trades: new Map(), accounts: new Map(),
    instrumentCatalog: new Map(),
    mentalHealthProfiles: new Map(), aiChatHistory: new Map(), companionState: new Map(),
    sessionSignatures: new Map(), userPreferences: new Map(),
    authSessions: new Map(), externalIdentities: new Map(), securityEvents: new Map(), authTransactions: new Map(),
    commercialConfigOverrides: new Map(), commercialConfigVersions: new Map(), markupRules: new Map(),
    providerModelPricing: new Map(), walletAccounts: new Map(), walletLedger: new Map(), walletReservations: new Map(),
    quotaLocks: new Map(), analysisSymbols: new Map(),
    subscriptions: new Map(), paymentTransactions: new Map(), paymentEvents: new Map(), cryptoInvoices: new Map(),
    // Singleton row, mirrors the real 039_bsc_payment_secrets.sql table (id 'default' implied -
    // there is exactly one BSC provider config per deployment) - a plain object, not a Map.
    bscPaymentSecrets: {
      rpcUrlEncrypted: null, webhookSecretEncrypted: null, webhookSecretHint: null,
      lastTestedAt: null, lastTestOk: null, lastDetectedChainId: null, updatedBy: null, updatedAt: null
    },
    storageProducts: new Map(), storageEntitlements: new Map(), storageObjects: new Map(),
    conversationScenarios: new Map(), conversationScenarioVersions: new Map(), conversationAudioAssets: new Map(),
    // AI Cost Control (043_ai_cost_control.sql) - see repo.pg.mjs's identical-purpose domains.
    providerCostCredentials: new Map(), providerCostSyncRuns: new Map(), providerCostSnapshots: new Map(), providerBalanceSnapshots: new Map()
  };

  function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
  function requireUser(userId) { if (!state.users.has(userId)) throw new ApiError(400, 'USER_NOT_FOUND'); }
  function now() { return new Date().toISOString(); }
  // Commercial System Slice 1 - see repo.pg.mjs's identical-purpose helper for the full
  // reasoning (reads the admin override directly rather than through commercial-config.mjs, since
  // that module takes a `repo` this factory function hasn't finished building yet).
  function resolveSignupPromoRetailUsd() {
    const override = state.commercialConfigOverrides.get('wallet:signupPromoRetailUsd');
    const amount = override && override.value && Number(override.value.amount);
    return Number.isFinite(amount) && amount >= 0 ? amount : WALLET_DEFAULTS.signupPromoRetailUsd;
  }
  function grantSignupPromoCredit(userId) {
    const amountUsd = resolveSignupPromoRetailUsd();
    const amountMicroUsd = Math.round(amountUsd * 1000000);
    if (amountMicroUsd <= 0) return;
    const idempotencyKey = 'signup-promo:' + userId;
    if (Array.from(state.walletLedger.values()).some((entry) => entry.idempotencyKey === idempotencyKey)) return;
    if (!state.walletAccounts.has(userId)) state.walletAccounts.set(userId, { userId, paidBalanceMicroUsd: 0, promoBalanceMicroUsd: 0, createdAt: now(), updatedAt: now() });
    const account = state.walletAccounts.get(userId);
    account.promoBalanceMicroUsd += amountMicroUsd;
    account.updatedAt = now();
    const entry = {
      id: newId('walletLedger'), userId, type: 'PROMO_CREDIT', cashDeltaMicroUsd: 0, promoDeltaMicroUsd: amountMicroUsd,
      providerCostMicroUsd: null, retailChargeMicroUsd: null, markupPercent: null, retailMultiplier: null,
      provider: null, model: null, feature: null, sourceAction: 'signup', adminUserId: null,
      idempotencyKey, metadata: { amountUsd }, createdAt: now()
    };
    state.walletLedger.set(entry.id, entry);
  }
  // Instrument Catalog domain (025_instrument_catalog.sql) - see repo.pg.mjs's identical helper
  // for the full reasoning (plain code string, not a foreign id, checked at the application layer).
  function assertInstrumentInCatalog(userId, codes) {
    const wanted = normalizeInstrumentCodes(Array.isArray(codes) ? codes : [codes]);
    if (!wanted.length) return;
    const known = new Set(Array.from(state.instrumentCatalog.values()).filter((item) => item.userId === userId).map((item) => item.code));
    if (wanted.some((code) => !known.has(code))) throw new ApiError(400, 'INSTRUMENT_NOT_IN_CATALOG');
  }
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
        xpTotal: 0, avatarDataUrl: null, totpEnabledAt: null, plan: 'free', createdAt: now()
      };
      state.users.set(record.id, record);
      grantSignupPromoCredit(record.id);
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
    // Mirrors repo.pg.mjs's usageEvents.create() exactly - see that method's own comment for why
    // model/feature/cost/origin/linkedLedgerIdempotencyKey are all optional and additive.
    async create({
      userId, provider, promptTokens, completionTokens, totalTokens, source, model, feature, providerCostMicroUsd, retailChargeMicroUsd, origin, linkedLedgerIdempotencyKey,
      cachedInputTokens, cacheWriteInputTokens, reasoningTokens, usageRaw
    }) {
      const record = {
        id: newId('usageEvent'), userId: userId || null, provider: String(provider || 'unknown'),
        promptTokens: promptTokens ?? null, completionTokens: completionTokens ?? null, totalTokens: totalTokens ?? null,
        source: String(source || 'unknown'), model: model || null, feature: feature || null,
        providerCostMicroUsd: providerCostMicroUsd ?? null, retailChargeMicroUsd: retailChargeMicroUsd ?? null,
        origin: origin || 'client', linkedLedgerIdempotencyKey: linkedLedgerIdempotencyKey || null,
        // AI Cost Control (043_ai_cost_control.sql) - see repo.pg.mjs's mapUsageEvent() comment.
        cachedInputTokens: cachedInputTokens ?? null, cacheWriteInputTokens: cacheWriteInputTokens ?? null,
        reasoningTokens: reasoningTokens ?? null, usageRaw: usageRaw || null,
        createdAt: now()
      };
      state.usageEvents.set(record.id, record);
      return clone(record);
    },
    // Mirrors repo.pg.mjs's aggregateByModelForUser()/aggregateByModel() exactly - see that
    // method's own comment. Defaults to origin='gateway' so a client-reported row (no cost data)
    // is excluded from real $ reporting by default.
    async aggregateByModelForUser(userId, { origin = 'gateway', since } = {}) {
      let values = Array.from(state.usageEvents.values()).filter((e) => e.userId === userId && (e.origin || 'client') === origin);
      if (since) values = values.filter((e) => new Date(e.createdAt) >= new Date(since));
      const buckets = new Map();
      values.forEach((e) => {
        const key = e.provider + '|' + (e.model || '');
        const bucket = buckets.get(key) || { provider: e.provider, model: e.model || null, calls: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, providerCostMicroUsd: 0, retailChargeMicroUsd: 0 };
        bucket.calls += 1;
        bucket.promptTokens += e.promptTokens || 0; bucket.completionTokens += e.completionTokens || 0; bucket.totalTokens += e.totalTokens || 0;
        bucket.providerCostMicroUsd += e.providerCostMicroUsd || 0; bucket.retailChargeMicroUsd += e.retailChargeMicroUsd || 0;
        buckets.set(key, bucket);
      });
      return Array.from(buckets.values()).sort((a, b) => b.providerCostMicroUsd - a.providerCostMicroUsd);
    },
    async aggregateByModel({ origin = 'gateway', since } = {}) {
      let values = Array.from(state.usageEvents.values()).filter((e) => (e.origin || 'client') === origin);
      if (since) values = values.filter((e) => new Date(e.createdAt) >= new Date(since));
      const buckets = new Map();
      values.forEach((e) => {
        const key = e.provider + '|' + (e.model || '');
        const bucket = buckets.get(key) || { provider: e.provider, model: e.model || null, calls: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, providerCostMicroUsd: 0, retailChargeMicroUsd: 0 };
        bucket.calls += 1;
        bucket.promptTokens += e.promptTokens || 0; bucket.completionTokens += e.completionTokens || 0; bucket.totalTokens += e.totalTokens || 0;
        bucket.providerCostMicroUsd += e.providerCostMicroUsd || 0; bucket.retailChargeMicroUsd += e.retailChargeMicroUsd || 0;
        buckets.set(key, bucket);
      });
      return Array.from(buckets.values()).sort((a, b) => b.providerCostMicroUsd - a.providerCostMicroUsd);
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
    },
    // AI Cost Control's exact internal reconciliation domain - mirrors repo.pg.mjs's identical-
    // named methods exactly, see that file's own comments.
    async listBilledInRange({ start, end, limit = 200, offset = 0 } = {}) {
      const values = Array.from(state.usageEvents.values())
        .filter((e) => e.origin === 'gateway' && e.linkedLedgerIdempotencyKey && e.createdAt >= start && e.createdAt < end)
        .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
      return values.slice(offset, offset + limit).map(clone);
    },
    async countBilledInRange({ start, end } = {}) {
      return Array.from(state.usageEvents.values())
        .filter((e) => e.origin === 'gateway' && e.linkedLedgerIdempotencyKey && e.createdAt >= start && e.createdAt < end).length;
    },
    async countExcludedInRange({ start, end } = {}) {
      return Array.from(state.usageEvents.values())
        .filter((e) => e.createdAt >= start && e.createdAt < end && !(e.origin === 'gateway' && e.linkedLedgerIdempotencyKey)).length;
    },
    async aggregateByModelInRange({ start, end }) {
      const buckets = new Map();
      Array.from(state.usageEvents.values())
        .filter((e) => e.origin === 'gateway' && e.createdAt >= start && e.createdAt < end)
        .forEach((e) => {
          const key = e.provider + '|' + (e.model || '');
          const bucket = buckets.get(key) || {
            provider: e.provider, model: e.model || null, calls: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0,
            cachedInputTokens: 0, cacheWriteInputTokens: 0, reasoningTokens: 0, providerCostMicroUsd: 0, retailChargeMicroUsd: 0
          };
          bucket.calls += 1;
          bucket.promptTokens += e.promptTokens || 0; bucket.completionTokens += e.completionTokens || 0; bucket.totalTokens += e.totalTokens || 0;
          bucket.cachedInputTokens += e.cachedInputTokens || 0; bucket.cacheWriteInputTokens += e.cacheWriteInputTokens || 0; bucket.reasoningTokens += e.reasoningTokens || 0;
          bucket.providerCostMicroUsd += e.providerCostMicroUsd || 0; bucket.retailChargeMicroUsd += e.retailChargeMicroUsd || 0;
          buckets.set(key, bucket);
        });
      return Array.from(buckets.values()).sort((a, b) => b.providerCostMicroUsd - a.providerCostMicroUsd);
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

  function voiceKeyHintFor(apiKey) {
    const trimmed = String(apiKey || '');
    return trimmed.length >= 4 ? '…' + trimmed.slice(-4) : '…';
  }
  // Found via real production testing (a pasted key that read back as "Invalid" from the admin
  // panel): a copy/paste from some sources (browser dashboards, PDFs, rich-text) can carry
  // invisible unicode - zero-width space/joiner/non-joiner, a BOM, a non-breaking space - that
  // plain .trim() never touches, silently corrupting the key while looking completely normal in
  // a text input. Same fix as repo.pg.mjs's own sanitizeApiKey().
  function sanitizeApiKey(apiKey) {
    return String(apiKey || '').replace(new RegExp("[​‌‍﻿ ]", 'g'), '').trim();
  }
  // Same shape/behavior as repo.pg.mjs's mapVoiceCredential - real encryption here too (not a
  // plaintext stand-in), since this is the exact backend the contract test suite exercises for
  // "encrypted-at-rest"/"wrong ENCRYPTION_KEY" behavior.
  function shapeVoiceCredential(record, { includeDecrypted } = {}) {
    const base = {
      id: record.id, provider: record.provider, label: record.label, keyHint: record.keyHint, enabled: record.enabled,
      validationStatus: record.validationStatus, validationError: record.validationError, validatedAt: record.validatedAt,
      updatedBy: record.updatedBy, createdAt: record.createdAt, updatedAt: record.updatedAt
    };
    if (includeDecrypted) base.apiKey = decryptSecret(record.apiKeyEncrypted, encryptionKeyHex());
    return clone(base);
  }

  const voiceProviderCredentials = {
    async create({ provider, label, apiKey, updatedBy }) {
      const trimmed = sanitizeApiKey(apiKey);
      if (!trimmed) throw new ApiError(400, 'VALIDATION_FAILED');
      const record = {
        id: newId('voiceCred'), provider: provider || 'elevenlabs', label: String(label || '').trim() || 'Untitled profile',
        apiKeyEncrypted: encryptSecret(trimmed, encryptionKeyHex()), keyHint: voiceKeyHintFor(trimmed), enabled: true,
        validationStatus: 'unknown', validationError: null, validatedAt: null,
        updatedBy: updatedBy || null, createdAt: now(), updatedAt: now()
      };
      state.voiceProviderCredentials.set(record.id, record);
      return shapeVoiceCredential(record);
    },
    async replace(id, { label, apiKey, enabled, updatedBy }) {
      const record = state.voiceProviderCredentials.get(id);
      if (!record) throw new ApiError(404, 'CREDENTIAL_NOT_FOUND');
      if (label != null) record.label = String(label).trim() || 'Untitled profile';
      if (enabled != null) record.enabled = Boolean(enabled);
      const trimmed = apiKey != null ? sanitizeApiKey(apiKey) : '';
      if (trimmed) {
        record.apiKeyEncrypted = encryptSecret(trimmed, encryptionKeyHex());
        record.keyHint = voiceKeyHintFor(trimmed);
        record.validationStatus = 'unknown'; record.validationError = null; record.validatedAt = null;
      }
      record.updatedBy = updatedBy || null; record.updatedAt = now();
      return shapeVoiceCredential(record);
    },
    async recordValidation(id, { status, error }) {
      const record = state.voiceProviderCredentials.get(id);
      if (!record) return null;
      record.validationStatus = status; record.validationError = error || null; record.validatedAt = now(); record.updatedAt = now();
      return shapeVoiceCredential(record);
    },
    async delete(id) {
      Array.from(state.voiceLanguageConfigs.values()).forEach((cfg) => { if (cfg.credentialId === id) cfg.credentialId = null; });
      Array.from(state.voiceCharacterConfigs.values()).forEach((cfg) => { if (cfg.credentialId === id) cfg.credentialId = null; });
      return state.voiceProviderCredentials.delete(id);
    },
    async list() { return Array.from(state.voiceProviderCredentials.values()).map((r) => shapeVoiceCredential(r)); },
    async get(id, { includeDecrypted } = {}) {
      const record = state.voiceProviderCredentials.get(id);
      return record ? shapeVoiceCredential(record, { includeDecrypted }) : null;
    }
  };

  const voiceLanguageConfigs = {
    async list() { return Array.from(state.voiceLanguageConfigs.values()).sort((a, b) => a.languageCode.localeCompare(b.languageCode)).map(clone); },
    async get(languageCode) { const record = state.voiceLanguageConfigs.get(languageCode); return record ? clone(record) : null; },
    async upsert({ languageCode, provider, credentialId, voiceId, modelId, enabled, voiceSettings, fallbackProvider, fallbackVoice, updatedBy }) {
      const record = {
        languageCode, provider: provider || 'elevenlabs', credentialId: credentialId || null, voiceId: voiceId || null,
        modelId: modelId || null, enabled: Boolean(enabled), voiceSettings: voiceSettings || {},
        fallbackProvider: fallbackProvider || 'openai', fallbackVoice: fallbackVoice || null,
        updatedBy: updatedBy || null, createdAt: (state.voiceLanguageConfigs.get(languageCode) || {}).createdAt || now(), updatedAt: now()
      };
      state.voiceLanguageConfigs.set(languageCode, record);
      return clone(record);
    }
  };

  // Per-character, per-gender voice routing (024_voice_character_gender.sql) - see
  // repo.pg.mjs's own header comment for the same domain object.
  function characterGenderKey(character, gender) { return character + ':' + gender; }
  const voiceCharacterConfigs = {
    async list() {
      return Array.from(state.voiceCharacterConfigs.values())
        .sort((a, b) => (a.character + a.gender).localeCompare(b.character + b.gender)).map(clone);
    },
    async get(character, gender) {
      const record = state.voiceCharacterConfigs.get(characterGenderKey(character, gender));
      return record ? clone(record) : null;
    },
    async upsert({ character, gender, provider, credentialId, voiceId, modelId, enabled, voiceSettings, fallbackProvider, fallbackVoice, updatedBy }) {
      const key = characterGenderKey(character, gender);
      const record = {
        character, gender, provider: provider || 'elevenlabs', credentialId: credentialId || null, voiceId: voiceId || null,
        modelId: modelId || null, enabled: Boolean(enabled), voiceSettings: voiceSettings || {},
        fallbackProvider: fallbackProvider || 'openai', fallbackVoice: fallbackVoice || null,
        updatedBy: updatedBy || null, createdAt: (state.voiceCharacterConfigs.get(key) || {}).createdAt || now(), updatedAt: now()
      };
      state.voiceCharacterConfigs.set(key, record);
      return clone(record);
    }
  };

  const voiceTtsUsage = {
    async record({ languageCode, provider, credentialId, source, characters, characterCost, success, errorCode, latencyMs }) {
      const record = {
        id: newId('voiceTts'), languageCode, provider, credentialId: credentialId || null, source,
        characters: Math.max(0, Math.round(Number(characters) || 0)),
        characterCost: characterCost == null ? null : Math.round(Number(characterCost)),
        success: Boolean(success), errorCode: errorCode || null,
        latencyMs: latencyMs == null ? null : Math.round(Number(latencyMs)), createdAt: now()
      };
      state.voiceTtsUsage.set(record.id, record);
      return clone(record);
    },
    async aggregateByLanguage({ since } = {}) {
      const sinceMs = since ? new Date(since).getTime() : 0;
      const byLang = {};
      Array.from(state.voiceTtsUsage.values()).filter((e) => new Date(e.createdAt).getTime() >= sinceMs).forEach((e) => {
        const bucket = byLang[e.languageCode] || (byLang[e.languageCode] = { languageCode: e.languageCode, requestCount: 0, totalCharacters: 0, successCount: 0, latencySum: 0, lastSuccessAt: null, lastErrorCode: null });
        bucket.requestCount += 1; bucket.totalCharacters += e.characters; bucket.latencySum += e.latencyMs || 0;
        if (e.success) { bucket.successCount += 1; if (!bucket.lastSuccessAt || e.createdAt > bucket.lastSuccessAt) bucket.lastSuccessAt = e.createdAt; }
        else bucket.lastErrorCode = e.errorCode;
      });
      return Object.values(byLang).map((b) => ({
        languageCode: b.languageCode, requestCount: b.requestCount, totalCharacters: b.totalCharacters, successCount: b.successCount,
        successRatePercent: b.requestCount > 0 ? Math.round((b.successCount / b.requestCount) * 100) : null,
        avgLatencyMs: b.requestCount > 0 ? Math.round(b.latencySum / b.requestCount) : 0,
        lastSuccessAt: b.lastSuccessAt, lastErrorCode: b.lastErrorCode
      }));
    },
    async recent({ limit } = {}) {
      return Array.from(state.voiceTtsUsage.values()).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, limit || 50).map(clone);
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
  // HOTFIX defense-in-depth, mirrored from repo.pg.mjs's own normalizeTradingEntryType(): the
  // real Postgres schema enforces trading_session_entries.type NOT NULL + CHECK (chart/movement/
  // fate) and trading_sessions.market NOT NULL - this in-memory fake enforced neither, which is
  // exactly why a real client bug (an entry with no `type`) shipped a production 500 that the
  // full API contract test suite (running against this repo) never caught. Mirroring the same
  // defaulting here means this repo's own behavior actually matches what repo.pg.mjs does, so a
  // test against either backend proves the same thing.
  const VALID_TRADING_ENTRY_TYPES = ['chart', 'movement', 'fate'];
  function normalizeTradingEntryType(type) { return VALID_TRADING_ENTRY_TYPES.indexOf(type) > -1 ? type : 'chart'; }

  const tradingSessions = {
    async upsert(userId, record) {
      requireUser(userId);
      if (!record || !record.id) throw new ApiError(400, 'VALIDATION_FAILED');
      const existing = state.tradingSessions.get(record.id);
      if (existing && existing.userId !== userId) throw new ApiError(403, 'NOT_SESSION_OWNER');
      // Defect #5: same optional-but-verified accountId contract as repo.pg.mjs's upsert() -
      // never mandatory (a session is a journal concept, not a money-attribution one like a
      // trade), but a supplied accountId must resolve to this user's own account, and an
      // archived account can never be a NEW assignment (defect #3).
      if (record.accountId) {
        const account = state.accounts.get(record.accountId);
        if (!account || account.userId !== userId) throw new ApiError(403, 'NOT_ACCOUNT_OWNER');
        const isNewAssignment = !existing || existing.accountId !== record.accountId;
        if (isNewAssignment && account.status === 'archived') throw new ApiError(403, 'ACCOUNT_ARCHIVED');
      }
      // Instrument Catalog domain (025_instrument_catalog.sql) - see repo.pg.mjs's identical
      // upsert() checks for the full reasoning (mandatory for a brand-new session only, catalog
      // membership required, never retroactively forced onto a pre-existing NULL row).
      const instrument = normalizeInstrumentCode(record.instrument);
      if (!existing && !instrument) throw new ApiError(400, 'INSTRUMENT_REQUIRED');
      if (instrument) assertInstrumentInCatalog(userId, instrument);
      const stamp = now();
      const stored = {
        id: record.id, userId, character: String(record.character || 'hunter'),
        name: record.name || null, market: record.market || 'London', timeframe: record.timeframe || null,
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
        finalEntryId: record.finalEntryId || null, accountId: record.accountId || null, instrument,
        entries: (record.entries || []).map(function (entry) {
          return {
            id: entry.id, sessionId: record.id, type: normalizeTradingEntryType(entry.type),
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
                pattern: scenario.pattern ?? null, executionPlan: scenario.executionPlan ?? null,
                // 2026-08-28 bug report: problem/invalidationNote/invalidationTagIds were never
                // persisted server-side at all - client-side data (real, pre-existing app
                // functionality, not new) silently lost on every reconcile/reload. Confirmed via
                // real production testing: a real DOM edit (not just AI) to the Scenario's
                // "problem" field visibly landed locally but never survived a re-read, because
                // this repo's own mapping (and repo.pg.mjs's real INSERT/SELECT columns) never
                // carried these 3 fields through at all.
                problem: scenario.problem || null, invalidationNote: scenario.invalidationNote || null,
                invalidationTagIds: Array.isArray(scenario.invalidationTagIds) ? scenario.invalidationTagIds : []
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
      // Instrument Catalog domain (025_instrument_catalog.sql) - see repo.pg.mjs's identical
      // upsert() check for the full reasoning (a brand-new pattern must explicitly carry at
      // least one instrument before it is ever persisted).
      const instruments = normalizeInstrumentCodes(record.instruments);
      if (!existing && !instruments.length) throw new ApiError(400, 'PATTERN_INSTRUMENT_REQUIRED');
      if (instruments.length) assertInstrumentInCatalog(userId, instruments);
      const stamp = now();
      const stored = {
        id: record.id, userId,
        name: record.name || '', description: record.description || '',
        completionThreshold: Math.max(0, Math.min(100, Number(record.completionThreshold ?? 70))),
        usageCount: Math.max(0, Number(record.usageCount || 0)), isPublic: Boolean(record.isPublic),
        instruments,
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
      // Defect #1: a brand-new trade (no existing record with this id yet) must carry a real
      // accountId once the user owns at least one active account - client validation alone is
      // not enough, since the real save path is this one. `existing` already-created trades are
      // never retroactively forced to pick one (a trade created before the user's first account,
      // or via any other legitimate accountless path, keeps accountId:null forever - "legacy" is
      // about existing records, not a moving target).
      if (!record.accountId && !existing) {
        const hasActiveAccount = Array.from(state.accounts.values()).some((a) => a.userId === userId && a.status === 'active');
        if (hasActiveAccount) throw new ApiError(400, 'ACCOUNT_REQUIRED');
      }
      // A trade's accountId must resolve to an account this same user owns - collapsing
      // existence and ownership into one lookup, the same SOURCE_VERIFIERS idiom
      // routes.profile.mjs already uses for session/pattern/strategy source ids.
      if (record.accountId) {
        const account = state.accounts.get(record.accountId);
        if (!account || account.userId !== userId) throw new ApiError(403, 'NOT_ACCOUNT_OWNER');
        // Archived accounts are read-only for NEW assignment (defect #3): a brand-new trade, or
        // an existing trade being re-pointed onto this account, is rejected outright. A trade
        // that already carried this exact accountId before it was archived is left alone - the
        // archived account still owns its real trade history, and every other field on that
        // trade (chart note, emotion log, ...) must stay editable; only re-ASSIGNING the link is
        // blocked, matching "an archived account may keep its historical trades and remain
        // viewable" - it just may never be freshly chosen again.
        const isNewAssignment = !existing || existing.accountId !== record.accountId;
        if (isNewAssignment && account.status === 'archived') throw new ApiError(403, 'ACCOUNT_ARCHIVED');
      }
      // Instrument Catalog domain (025_instrument_catalog.sql) - see repo.pg.mjs's identical
      // upsert() checks for the full reasoning (mandatory for a brand-new trade only, catalog
      // membership required, and a sourced trade must match its source session's instrument).
      const instrument = normalizeInstrumentCode(record.instrument);
      if (!existing && !instrument) throw new ApiError(400, 'INSTRUMENT_REQUIRED');
      if (instrument) assertInstrumentInCatalog(userId, instrument);
      const source = record.source || {};
      if (source.sessionId) {
        const sourceSession = state.tradingSessions.get(source.sessionId);
        if (sourceSession && sourceSession.userId === userId && sourceSession.instrument && sourceSession.instrument !== instrument) {
          throw new ApiError(400, 'TRADE_SESSION_INSTRUMENT_MISMATCH');
        }
      }
      const stamp = now();
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
        linkedStrategyId: record.linkedStrategyId || null, accountId: record.accountId || null,
        instrument,
        chartNote: record.chartNote || '',
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

  // NAVRYA Accounts domain (021_accounts.sql). No equity/balance/P&L/connection-state field
  // here on purpose - see the migration file's own comment: this app has no real broker/prop
  // API integration, so every account is manual by construction and every performance figure is
  // derived client-side from starting_balance plus the account's own trades, never stored.
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
  const accounts = {
    async upsert(userId, record) {
      requireUser(userId);
      if (!record || !record.id) throw new ApiError(400, 'VALIDATION_FAILED');
      const existing = state.accounts.get(record.id);
      if (existing && existing.userId !== userId) throw new ApiError(403, 'NOT_ACCOUNT_OWNER');
      const stamp = now();
      const kind = record.kind === 'personal' ? 'personal' : 'prop';
      const status = record.status === 'archived' ? 'archived' : 'active';
      const stored = {
        id: record.id, userId, kind,
        firm: String(record.firm || '').trim(), program: record.program || null, platform: record.platform || null,
        numberMasked: record.numberMasked || null,
        status, archivedAt: status === 'archived' ? (record.archivedAt || stamp) : null,
        currency: ['USD', 'EUR', 'GBP', 'AUD'].indexOf(record.currency) > -1 ? record.currency : 'USD',
        startDate: record.startDate || stamp.slice(0, 10),
        startingBalance: Number(record.startingBalance) || 0,
        rules: normalizeRules(kind, record.rules),
        createdAt: existing ? existing.createdAt : (record.createdAt || stamp), updatedAt: stamp
      };
      state.accounts.set(record.id, stored);
      return clone(stored);
    },
    async get(userId, id) {
      const record = state.accounts.get(id);
      if (!record || record.userId !== userId) return null;
      return clone(record);
    },
    async listByUser(userId) {
      return Array.from(state.accounts.values()).filter((a) => a.userId === userId).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).map(clone);
    },
    // Archives rather than hard-deletes whenever any trade still references the account -
    // trade history must never be silently orphaned/lost. An account nothing ever traded
    // against (the "I made this by mistake" case) is genuinely removed.
    async remove(userId, id) {
      const record = state.accounts.get(id);
      if (!record) return;
      if (record.userId !== userId) throw new ApiError(403, 'NOT_ACCOUNT_OWNER');
      const referenced = Array.from(state.trades.values()).some((t) => t.accountId === id);
      if (referenced) {
        record.status = 'archived'; record.archivedAt = now(); record.updatedAt = record.archivedAt;
        return;
      }
      state.accounts.delete(id);
    }
  };

  // Instrument Catalog domain (025_instrument_catalog.sql) - see repo.pg.mjs's identical
  // instrumentCatalog for the full reasoning. No archive-vs-delete distinction needed (nothing
  // else holds a foreign key to this row's own id - every consumer stores the plain code string).
  const instrumentCatalog = {
    async upsert(userId, record) {
      requireUser(userId);
      if (!record || !record.id) throw new ApiError(400, 'VALIDATION_FAILED');
      const code = normalizeInstrumentCode(record.code);
      if (!code) throw new ApiError(400, 'VALIDATION_FAILED');
      const existing = state.instrumentCatalog.get(record.id);
      if (existing && existing.userId !== userId) throw new ApiError(403, 'NOT_INSTRUMENT_OWNER');
      // "Codes must be unique per user after normalization" - a duplicate add (or a rename onto
      // an already-used code) is a real 409, never a silent second row, mirroring the DB unique
      // index repo.pg.mjs relies on for the same rule.
      const duplicate = Array.from(state.instrumentCatalog.values()).some((item) => item.userId === userId && item.code === code && item.id !== record.id);
      if (duplicate) throw new ApiError(409, 'INSTRUMENT_ALREADY_EXISTS');
      const stamp = now();
      const stored = {
        id: record.id, userId, code, displayName: record.displayName || null,
        createdAt: existing ? existing.createdAt : stamp, updatedAt: stamp
      };
      state.instrumentCatalog.set(record.id, stored);
      return clone(stored);
    },
    async get(userId, id) {
      const record = state.instrumentCatalog.get(id);
      if (!record || record.userId !== userId) return null;
      return clone(record);
    },
    async listByUser(userId) {
      return Array.from(state.instrumentCatalog.values()).filter((item) => item.userId === userId).sort((a, b) => a.code.localeCompare(b.code)).map(clone);
    },
    async remove(userId, id) {
      const record = state.instrumentCatalog.get(id);
      if (!record) return;
      if (record.userId !== userId) throw new ApiError(403, 'NOT_INSTRUMENT_OWNER');
      state.instrumentCatalog.delete(id);
    }
  };

  // ---------------------------------------------------------------------------------------------
  // Commercial System Slice 1 - mirrors repo.pg.mjs's identical-named domains exactly (same
  // method surface, same business rules), re-implemented over plain Maps.
  // ---------------------------------------------------------------------------------------------
  const commercialConfig = {
    async list() { return Array.from(state.commercialConfigOverrides.values()).sort((a, b) => (a.configKey < b.configKey ? -1 : 1)).map(clone); },
    async get(configKey) {
      const row = state.commercialConfigOverrides.get(configKey);
      return row ? clone(row) : null;
    },
    async publish(configKey, value, { updatedBy, changeSummary } = {}) {
      const previous = state.commercialConfigOverrides.get(configKey);
      const record = { configKey, value: value ?? null, updatedBy: updatedBy || null, updatedAt: now() };
      state.commercialConfigOverrides.set(configKey, record);
      const version = {
        id: newId('commercialConfigVersion'), configKey, changedBy: updatedBy || null, changeSummary: changeSummary || null,
        previousValue: previous ? previous.value : null, newValue: value ?? null, changedAt: now()
      };
      state.commercialConfigVersions.set(version.id, version);
      return clone(record);
    },
    async listVersions({ configKey, limit } = {}) {
      return Array.from(state.commercialConfigVersions.values())
        .filter((v) => !configKey || v.configKey === configKey)
        .sort((a, b) => (a.changedAt < b.changedAt ? 1 : -1)).slice(0, limit || 100).map(clone);
    }
  };

  const markupRules = {
    async list() { return Array.from(state.markupRules.values()).map(clone); },
    async upsert({ scopeType, scopeKey, markupPercent, enabled }) {
      const existing = Array.from(state.markupRules.values()).find((r) => r.scopeType === scopeType && r.scopeKey === scopeKey);
      const record = {
        id: existing ? existing.id : newId('markupRule'), scopeType, scopeKey, markupPercent: Number(markupPercent), enabled: enabled !== false,
        createdAt: existing ? existing.createdAt : now(), updatedAt: now()
      };
      state.markupRules.set(record.id, record);
      return clone(record);
    },
    async remove(id) { state.markupRules.delete(id); }
  };

  const providerModelPricing = {
    async list() { return Array.from(state.providerModelPricing.values()).map(clone); },
    async get(provider, model) {
      const row = state.providerModelPricing.get(provider + ':' + model);
      return row ? clone(row) : null;
    },
    async upsert({ provider, model, promptPricePer1k, completionPricePer1k, cachedInputPricePer1k, cacheWriteInputPricePer1k, currency, enabled }) {
      const key = provider + ':' + model;
      const record = {
        provider, model, promptPricePer1k: promptPricePer1k ?? null, completionPricePer1k: completionPricePer1k ?? null,
        // AI Cost Control (043_ai_cost_control.sql) - see repo.pg.mjs's mapProviderModelPricing() comment.
        cachedInputPricePer1k: cachedInputPricePer1k ?? null, cacheWriteInputPricePer1k: cacheWriteInputPricePer1k ?? null,
        currency: currency || 'USD', enabled: enabled !== false, effectiveFrom: null, effectiveUntil: null, updatedAt: now()
      };
      state.providerModelPricing.set(key, record);
      return clone(record);
    },
    async remove(provider, model) { state.providerModelPricing.delete(provider + ':' + model); }
  };

  // AI billing operational fix (task B) - mirrors repo.pg.mjs's identical-purpose
  // sweepStalePendingReservations() exactly (see that function's own comment for the full
  // reasoning): recovers a truly orphaned 'pending' reservation (pattern-ai-server.mjs crashed, or
  // every settle/record retry was exhausted) by releasing it - never charging it, since the real
  // usage was never recovered.
  function sweepStalePendingReservationsMemory(userId, thresholdMs) {
    const cutoff = Date.now() - thresholdMs;
    Array.from(state.walletReservations.values())
      .filter((r) => r.userId === userId && r.status === 'pending' && new Date(r.createdAt).getTime() < cutoff)
      .forEach((r) => {
        r.status = 'released';
        r.resolvedAt = now();
        const entry = {
          id: newId('walletLedger'), userId: r.userId, type: 'AI_RELEASE', cashDeltaMicroUsd: 0, promoDeltaMicroUsd: 0,
          providerCostMicroUsd: null, retailChargeMicroUsd: null, markupPercent: null, retailMultiplier: null,
          provider: r.provider, model: r.model, feature: r.feature, sourceAction: 'ai-release-stale',
          adminUserId: null, idempotencyKey: null, metadata: { reservationId: r.id, reason: 'stale' }, createdAt: now()
        };
        state.walletLedger.set(entry.id, entry);
      });
  }
  const STALE_RESERVATION_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes - see repo.pg.mjs's identical constant

  const wallet = {
    async getAccount(userId) {
      if (!state.walletAccounts.has(userId)) state.walletAccounts.set(userId, { userId, paidBalanceMicroUsd: 0, promoBalanceMicroUsd: 0, createdAt: now(), updatedAt: now() });
      return clone(state.walletAccounts.get(userId));
    },
    async releaseStalePendingReservations(userId, thresholdMs = STALE_RESERVATION_THRESHOLD_MS) {
      sweepStalePendingReservationsMemory(userId, thresholdMs);
    },
    async reserve(userId, { estimatedRetailMicroUsd, provider, model, feature }) {
      sweepStalePendingReservationsMemory(userId, STALE_RESERVATION_THRESHOLD_MS);
      await wallet.getAccount(userId);
      const account = state.walletAccounts.get(userId);
      const pending = Array.from(state.walletReservations.values())
        .filter((r) => r.userId === userId && r.status === 'pending')
        .reduce((sum, r) => sum + r.estimatedRetailMicroUsd, 0);
      const availableMicroUsd = account.paidBalanceMicroUsd + account.promoBalanceMicroUsd - pending;
      if (availableMicroUsd < estimatedRetailMicroUsd) return { ok: false, reason: 'WALLET_INSUFFICIENT_BALANCE', availableMicroUsd, estimatedRetailMicroUsd };
      const reservation = {
        id: newId('walletReservation'), userId, status: 'pending', estimatedRetailMicroUsd,
        provider: provider || null, model: model || null, feature: feature || null, createdAt: now(), resolvedAt: null
      };
      state.walletReservations.set(reservation.id, reservation);
      return { ok: true, reservation: clone(reservation) };
    },
    async settle(reservationId, { providerCostMicroUsd, retailChargeMicroUsd, markupPercent, retailMultiplier, provider, model, feature, idempotencyKey }) {
      const reservation = state.walletReservations.get(reservationId);
      if (!reservation) throw new ApiError(404, 'WALLET_RESERVATION_NOT_FOUND');
      if (idempotencyKey) {
        const existing = Array.from(state.walletLedger.values()).find((e) => e.idempotencyKey === idempotencyKey);
        if (existing) return { ok: true, alreadySettled: true, ledgerEntry: clone(existing) };
      }
      if (reservation.status !== 'pending') return { ok: true, alreadySettled: true, ledgerEntry: null };
      const account = state.walletAccounts.get(reservation.userId);
      const promoSpend = Math.max(0, Math.min(account.promoBalanceMicroUsd, retailChargeMicroUsd));
      const paidSpend = retailChargeMicroUsd - promoSpend;
      account.promoBalanceMicroUsd -= promoSpend;
      account.paidBalanceMicroUsd -= paidSpend;
      account.updatedAt = now();
      reservation.status = 'settled';
      reservation.resolvedAt = now();
      const entry = {
        id: newId('walletLedger'), userId: reservation.userId, type: 'AI_SETTLEMENT',
        cashDeltaMicroUsd: -paidSpend, promoDeltaMicroUsd: -promoSpend,
        providerCostMicroUsd: providerCostMicroUsd ?? null, retailChargeMicroUsd: retailChargeMicroUsd ?? null,
        markupPercent: markupPercent ?? null, retailMultiplier: retailMultiplier ?? null,
        provider: provider || null, model: model || null, feature: feature || null, sourceAction: 'ai-settlement',
        adminUserId: null, idempotencyKey: idempotencyKey || null, metadata: { reservationId }, createdAt: now()
      };
      state.walletLedger.set(entry.id, entry);
      return { ok: true, ledgerEntry: clone(entry) };
    },
    async release(reservationId) {
      const reservation = state.walletReservations.get(reservationId);
      if (!reservation || reservation.status !== 'pending') return { ok: true, alreadyResolved: true };
      reservation.status = 'released';
      reservation.resolvedAt = now();
      const entry = {
        id: newId('walletLedger'), userId: reservation.userId, type: 'AI_RELEASE', cashDeltaMicroUsd: 0, promoDeltaMicroUsd: 0,
        providerCostMicroUsd: null, retailChargeMicroUsd: null, markupPercent: null, retailMultiplier: null,
        provider: reservation.provider, model: reservation.model, feature: reservation.feature, sourceAction: 'ai-release',
        adminUserId: null, idempotencyKey: null, metadata: { reservationId }, createdAt: now()
      };
      state.walletLedger.set(entry.id, entry);
      return { ok: true };
    },
    async grant(userId, { type, cashDeltaMicroUsd = 0, promoDeltaMicroUsd = 0, adminUserId, sourceAction, idempotencyKey, metadata }) {
      if (idempotencyKey && Array.from(state.walletLedger.values()).some((e) => e.idempotencyKey === idempotencyKey)) return { ok: true, duplicate: true };
      await wallet.getAccount(userId);
      const account = state.walletAccounts.get(userId);
      account.paidBalanceMicroUsd += cashDeltaMicroUsd;
      account.promoBalanceMicroUsd += promoDeltaMicroUsd;
      account.updatedAt = now();
      const entry = {
        id: newId('walletLedger'), userId, type, cashDeltaMicroUsd, promoDeltaMicroUsd,
        providerCostMicroUsd: null, retailChargeMicroUsd: null, markupPercent: null, retailMultiplier: null,
        provider: null, model: null, feature: null, sourceAction: sourceAction || null,
        adminUserId: adminUserId || null, idempotencyKey: idempotencyKey || null, metadata: metadata || {}, createdAt: now()
      };
      state.walletLedger.set(entry.id, entry);
      return { ok: true, ledgerEntry: clone(entry) };
    },
    async ledgerForUser(userId, { limit } = {}) {
      return Array.from(state.walletLedger.values()).filter((e) => e.userId === userId)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, limit || 50).map(clone);
    },
    // AI Cost Control's per-user drill-down - mirrors repo.pg.mjs's identical-named method exactly.
    async settlementsForUser(userId, { limit } = {}) {
      return Array.from(state.walletLedger.values()).filter((e) => e.userId === userId && e.type === 'AI_SETTLEMENT')
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, limit || 100).map(clone);
    },
    async recentLedger({ limit } = {}) {
      return Array.from(state.walletLedger.values()).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, limit || 100).map(clone);
    },
    // AI Cost Control's exact internal reconciliation domain - mirrors repo.pg.mjs's identical-
    // named methods exactly.
    async listSettlementsInRange({ start, end, limit = 200, offset = 0 } = {}) {
      const values = Array.from(state.walletLedger.values())
        .filter((e) => e.type === 'AI_SETTLEMENT' && e.createdAt >= start && e.createdAt < end)
        .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
      return values.slice(offset, offset + limit).map(clone);
    },
    async countSettlementsInRange({ start, end } = {}) {
      return Array.from(state.walletLedger.values()).filter((e) => e.type === 'AI_SETTLEMENT' && e.createdAt >= start && e.createdAt < end).length;
    },
    // AI Cost Control - mirrors repo.pg.mjs's identical-named method exactly.
    async sumSettlementsInRange({ start, end } = {}) {
      const matches = Array.from(state.walletLedger.values()).filter((e) => e.type === 'AI_SETTLEMENT' && e.createdAt >= start && e.createdAt < end);
      const cashMicroUsd = matches.reduce((sum, e) => sum + Math.abs(e.cashDeltaMicroUsd), 0);
      const promoMicroUsd = matches.reduce((sum, e) => sum + Math.abs(e.promoDeltaMicroUsd), 0);
      return { count: matches.length, cashMicroUsd, promoMicroUsd, totalMicroUsd: cashMicroUsd + promoMicroUsd };
    }
  };

  // Single-process async mutex keyed by (userId, resourceType) - the in-memory-repo equivalent of
  // repo.pg.mjs's pg_advisory_xact_lock-based quota.withCreateLock. Correct for this repo's own
  // use (tests, local dev without Postgres): every await point inside `fn` is still cooperative
  // JS, so chaining onto the previous holder's promise serializes concurrent callers for the
  // same key exactly like the pg version's lock does across connections.
  const quota = {
    async withCreateLock(userId, resourceType, fn) {
      const key = userId + ':' + resourceType;
      const previous = state.quotaLocks.get(key) || Promise.resolve();
      let release;
      const gate = new Promise((resolve) => { release = resolve; });
      state.quotaLocks.set(key, previous.then(() => gate));
      await previous;
      try {
        return await fn();
      } finally {
        release();
      }
    }
  };

  const analysisSymbols = {
    async upsert(userId, record) {
      requireUser(userId);
      if (!record || !record.id || !record.symbol) throw new ApiError(400, 'VALIDATION_FAILED');
      const existing = state.analysisSymbols.get(record.id);
      if (existing && existing.userId !== userId) throw new ApiError(403, 'NOT_ANALYSIS_SYMBOL_OWNER');
      const stored = { id: record.id, userId, symbol: String(record.symbol).trim().toUpperCase(), createdAt: existing ? existing.createdAt : now() };
      state.analysisSymbols.set(record.id, stored);
      return clone(stored);
    },
    async listByUser(userId) {
      return Array.from(state.analysisSymbols.values()).filter((s) => s.userId === userId).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1)).map(clone);
    },
    async remove(userId, id) {
      const record = state.analysisSymbols.get(id);
      if (!record) return;
      if (record.userId !== userId) throw new ApiError(403, 'NOT_ANALYSIS_SYMBOL_OWNER');
      state.analysisSymbols.delete(id);
    }
  };

  // ---------------------------------------------------------------------------------------------
  // Commercial System Slice 2 - mirrors repo.pg.mjs's identical-named domains exactly (same
  // method surface, same business rules), re-implemented over plain Maps.
  // ---------------------------------------------------------------------------------------------
  const subscriptions = {
    async create({ userId, planId, provider, externalCustomerId, externalSubscriptionId, status, currentPeriodStart, currentPeriodEnd, cancelAtPeriodEnd, priceAmountMicroUsd, currency, paymentTransactionId }) {
      const stamp = now();
      const record = {
        id: newId('subscription'), userId, planId, provider: provider || 'manual',
        externalCustomerId: externalCustomerId || null, externalSubscriptionId: externalSubscriptionId || null,
        status, currentPeriodStart: currentPeriodStart || null, currentPeriodEnd: currentPeriodEnd || null,
        cancelAtPeriodEnd: Boolean(cancelAtPeriodEnd), priceAmountMicroUsd: priceAmountMicroUsd || 0, currency: currency || 'USD',
        paymentTransactionId: paymentTransactionId || null, createdAt: stamp, updatedAt: stamp
      };
      state.subscriptions.set(record.id, record);
      return clone(record);
    },
    async get(id) {
      const record = state.subscriptions.get(id);
      return record ? clone(record) : null;
    },
    async getByPaymentTransactionId(transactionId) {
      const record = Array.from(state.subscriptions.values()).find((sub) => sub.paymentTransactionId === transactionId);
      return record ? clone(record) : null;
    },
    async update(id, patch) {
      const record = state.subscriptions.get(id);
      if (!record) throw new ApiError(404, 'SUBSCRIPTION_NOT_FOUND');
      Object.assign(record, patch, { updatedAt: now() });
      return clone(record);
    },
    // Mirrors repo.pg.mjs's identical query - period_end is the universal gate, computed at read
    // time, no background expiry job. See 031_subscriptions.sql's comment for the full reasoning.
    async getActiveForUser(userId) {
      const nowMs = Date.now();
      const candidates = Array.from(state.subscriptions.values()).filter((sub) => {
        if (sub.userId !== userId) return false;
        if (!sub.currentPeriodEnd || new Date(sub.currentPeriodEnd).getTime() <= nowMs) return false;
        if (sub.status === 'active' || sub.status === 'past_due') return true;
        if (sub.status === 'canceled' && sub.cancelAtPeriodEnd) return true;
        return false;
      });
      if (!candidates.length) return null;
      candidates.sort((a, b) => new Date(b.currentPeriodEnd) - new Date(a.currentPeriodEnd));
      return clone(candidates[0]);
    },
    async listForUser(userId) {
      return Array.from(state.subscriptions.values()).filter((sub) => sub.userId === userId)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).map(clone);
    },
    async adminStats() {
      const nowMs = Date.now();
      const stats = { activePlus: 0, activePersonalized: 0, pastDue: 0, canceling: 0, expired: 0, mrrMicroUsd: 0 };
      Array.from(state.subscriptions.values())
        .filter((sub) => (sub.currentPeriodEnd && new Date(sub.currentPeriodEnd).getTime() > nowMs) || sub.status === 'past_due' || sub.status === 'canceled')
        .forEach((sub) => {
          if (sub.status === 'active' && !sub.cancelAtPeriodEnd) {
            if (sub.planId === 'plus') stats.activePlus += 1;
            if (sub.planId === 'personalized') stats.activePersonalized += 1;
            stats.mrrMicroUsd += sub.priceAmountMicroUsd;
          }
          if (sub.status === 'past_due') stats.pastDue += 1;
          if (sub.status === 'active' && sub.cancelAtPeriodEnd) stats.canceling += 1;
          if (sub.status === 'expired') stats.expired += 1;
        });
      return stats;
    }
  };

  const paymentTransactions = {
    async create({ userId, type, provider, externalTransactionId, amountMicroUsd, currency, productId, metadata }) {
      const stamp = now();
      const record = {
        id: newId('paymentTx'), userId, type, provider: provider || 'manual', externalTransactionId: externalTransactionId || null,
        status: 'pending', amountMicroUsd, currency: currency || 'USD', productId: productId || null, metadata: metadata || {},
        createdAt: stamp, confirmedAt: null
      };
      state.paymentTransactions.set(record.id, record);
      return clone(record);
    },
    async get(id) {
      const record = state.paymentTransactions.get(id);
      return record ? clone(record) : null;
    },
    async setStatus(id, status, { confirmedAt } = {}) {
      const record = state.paymentTransactions.get(id);
      if (!record) return null;
      record.status = status;
      record.confirmedAt = confirmedAt || null;
      return clone(record);
    },
    async listForUser(userId, { limit } = {}) {
      return Array.from(state.paymentTransactions.values()).filter((t) => t.userId === userId)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, limit || 50).map(clone);
    },
    async listAll({ status, limit } = {}) {
      return Array.from(state.paymentTransactions.values()).filter((t) => !status || t.status === status)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, limit || 200).map(clone);
    },
    async findRefundFor(originalTransactionId) {
      const record = Array.from(state.paymentTransactions.values())
        .find((t) => t.type === 'refund' && t.metadata && t.metadata.originalTransactionId === originalTransactionId);
      return record ? clone(record) : null;
    }
  };

  const paymentEvents = {
    async recordIfNew({ provider, externalEventId, transactionId }) {
      const key = provider + ':' + externalEventId;
      if (state.paymentEvents.has(key)) return { isNew: false };
      state.paymentEvents.set(key, { id: newId('paymentEvent'), provider, externalEventId, transactionId: transactionId || null, processedAt: now(), createdAt: now() });
      return { isNew: true };
    }
  };

  // Mirrors repo.pg.mjs's cryptoInvoices exactly - see 038_crypto_invoices.sql's own comment.
  const cryptoInvoices = {
    async create({ transactionId, provider, chainId, assetSymbol, tokenContract, tokenDecimals, recipientAddress, atomicAmount, usdAmountMicroUsd, exchangeRateSnapshot, expiresAt, gatewayInvoiceId }) {
      const record = {
        id: newId('cryptoInvoice'), transactionId, provider: provider || 'bsc_crypto', chainId, assetSymbol, tokenContract, tokenDecimals,
        recipientAddress, atomicAmount: String(atomicAmount), usdAmountMicroUsd, exchangeRateSnapshot,
        status: 'pending', expiresAt, gatewayInvoiceId: gatewayInvoiceId || null, txHash: null, confirmationCount: 0,
        createdAt: now(), confirmedAt: null
      };
      state.cryptoInvoices.set(record.id, record);
      return clone(record);
    },
    async get(id) {
      const record = state.cryptoInvoices.get(id);
      return record ? clone(record) : null;
    },
    async getByTransactionId(transactionId) {
      const record = Array.from(state.cryptoInvoices.values()).find((r) => r.transactionId === transactionId);
      return record ? clone(record) : null;
    },
    // Mirrors repo.pg.mjs's atomic claimTxHash() - the same hash can never be claimed by two
    // different invoices, and an invoice that already has a DIFFERENT hash refuses a second claim.
    // Re-claiming the SAME hash the SAME invoice already holds is an idempotent no-op success -
    // required for a legitimate retry (e.g. "insufficient confirmations, check again later" with
    // the same tx hash) to ever succeed once enough confirmations accumulate.
    async claimTxHash(id, txHash) {
      const record = state.cryptoInvoices.get(id);
      if (!record) return { ok: false, claimedByOtherInvoice: false };
      if (record.txHash === txHash) return { ok: true, invoice: clone(record) };
      if (record.txHash) return { ok: false, claimedByOtherInvoice: false };
      const claimedElsewhere = Array.from(state.cryptoInvoices.values()).some((r) => r.id !== id && r.txHash === txHash);
      if (claimedElsewhere) return { ok: false, claimedByOtherInvoice: true };
      record.txHash = txHash;
      return { ok: true, invoice: clone(record) };
    },
    async updateStatus(id, status, { confirmationCount, confirmedAt } = {}) {
      const record = state.cryptoInvoices.get(id);
      if (!record) return null;
      record.status = status;
      if (confirmationCount != null) record.confirmationCount = confirmationCount;
      record.confirmedAt = confirmedAt || null;
      return clone(record);
    }
  };

  // Mirrors repo.pg.mjs's bscPaymentSecrets exactly - get() masked/status-only, getRaw() the
  // internal-only decrypted counterpart (server/commercial/bsc-config.mjs is the sole caller).
  function mapBscSecretsStatus() {
    const row = state.bscPaymentSecrets;
    return {
      rpcConfigured: Boolean(row.rpcUrlEncrypted), webhookConfigured: Boolean(row.webhookSecretEncrypted),
      webhookSecretHint: row.webhookSecretHint, lastTestedAt: row.lastTestedAt, lastTestOk: row.lastTestOk,
      lastDetectedChainId: row.lastDetectedChainId
    };
  }
  const bscPaymentSecrets = {
    async get() { return mapBscSecretsStatus(); },
    async getRaw() {
      const row = state.bscPaymentSecrets;
      return {
        rpcUrl: row.rpcUrlEncrypted ? decryptSecret(row.rpcUrlEncrypted, encryptionKeyHex()) : null,
        webhookSecret: row.webhookSecretEncrypted ? decryptSecret(row.webhookSecretEncrypted, encryptionKeyHex()) : null
      };
    },
    async setRpcUrl(plaintextUrl, { updatedBy } = {}) {
      const row = state.bscPaymentSecrets;
      row.rpcUrlEncrypted = encryptSecret(plaintextUrl, encryptionKeyHex());
      row.updatedBy = updatedBy || null; row.updatedAt = now();
      return mapBscSecretsStatus();
    },
    async clearRpcUrl({ updatedBy } = {}) {
      const row = state.bscPaymentSecrets;
      row.rpcUrlEncrypted = null; row.updatedBy = updatedBy || null; row.updatedAt = now();
      return mapBscSecretsStatus();
    },
    async setWebhookSecret(plaintextSecret, { updatedBy } = {}) {
      const row = state.bscPaymentSecrets;
      row.webhookSecretEncrypted = encryptSecret(plaintextSecret, encryptionKeyHex());
      row.webhookSecretHint = String(plaintextSecret).slice(-4);
      row.updatedBy = updatedBy || null; row.updatedAt = now();
      return mapBscSecretsStatus();
    },
    async clearWebhookSecret({ updatedBy } = {}) {
      const row = state.bscPaymentSecrets;
      row.webhookSecretEncrypted = null; row.webhookSecretHint = null;
      row.updatedBy = updatedBy || null; row.updatedAt = now();
      return mapBscSecretsStatus();
    },
    async recordTestResult({ ok, chainId }) {
      const row = state.bscPaymentSecrets;
      row.lastTestedAt = now(); row.lastTestOk = Boolean(ok); row.lastDetectedChainId = Number.isFinite(chainId) ? chainId : null;
      return mapBscSecretsStatus();
    }
  };

  // AI Cost Control (043_ai_cost_control.sql) - mirrors repo.pg.mjs's identical-purpose domains
  // exactly (real encryption, same shape), see that file's own comments.
  function shapeCostCredential(record, { includeDecrypted } = {}) {
    const base = {
      id: record.id, provider: record.provider, label: record.label, keyHint: record.keyHint, scopeConfig: record.scopeConfig || {}, enabled: record.enabled,
      validationStatus: record.validationStatus, validationError: record.validationError, validatedAt: record.validatedAt,
      updatedBy: record.updatedBy, createdAt: record.createdAt, updatedAt: record.updatedAt
    };
    if (includeDecrypted) base.apiKey = decryptSecret(record.apiKeyEncrypted, encryptionKeyHex());
    return clone(base);
  }
  const providerCostCredentials = {
    async create({ provider, label, apiKey, scopeConfig, updatedBy }) {
      const trimmed = sanitizeApiKey(apiKey);
      if (!trimmed) throw new ApiError(400, 'VALIDATION_FAILED');
      const record = {
        id: newId('providerCostCred'), provider: String(provider || '').trim(), label: String(label || '').trim() || 'Untitled credential',
        apiKeyEncrypted: encryptSecret(trimmed, encryptionKeyHex()), keyHint: voiceKeyHintFor(trimmed), scopeConfig: scopeConfig || {}, enabled: true,
        validationStatus: 'unknown', validationError: null, validatedAt: null,
        updatedBy: updatedBy || null, createdAt: now(), updatedAt: now()
      };
      state.providerCostCredentials.set(record.id, record);
      return shapeCostCredential(record);
    },
    async replace(id, { label, apiKey, scopeConfig, enabled, updatedBy }) {
      const record = state.providerCostCredentials.get(id);
      if (!record) throw new ApiError(404, 'CREDENTIAL_NOT_FOUND');
      if (label != null) record.label = String(label).trim() || 'Untitled credential';
      if (scopeConfig != null) record.scopeConfig = scopeConfig;
      if (enabled != null) record.enabled = Boolean(enabled);
      const trimmed = apiKey != null ? sanitizeApiKey(apiKey) : '';
      if (trimmed) {
        record.apiKeyEncrypted = encryptSecret(trimmed, encryptionKeyHex());
        record.keyHint = voiceKeyHintFor(trimmed);
        record.validationStatus = 'unknown'; record.validationError = null; record.validatedAt = null;
      }
      record.updatedBy = updatedBy || null; record.updatedAt = now();
      return shapeCostCredential(record);
    },
    async recordValidation(id, { status, error }) {
      const record = state.providerCostCredentials.get(id);
      if (!record) return null;
      record.validationStatus = status; record.validationError = error || null; record.validatedAt = now(); record.updatedAt = now();
      return shapeCostCredential(record);
    },
    async delete(id) { return state.providerCostCredentials.delete(id); },
    async list() { return Array.from(state.providerCostCredentials.values()).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1)).map((r) => shapeCostCredential(r)); },
    async listByProvider(provider) {
      return Array.from(state.providerCostCredentials.values()).filter((r) => r.provider === provider).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1)).map((r) => shapeCostCredential(r));
    },
    async get(id, { includeDecrypted } = {}) {
      const record = state.providerCostCredentials.get(id);
      return record ? shapeCostCredential(record, { includeDecrypted }) : null;
    }
  };

  const providerCostSync = {
    async createRun({ provider, scopeKey, requestedStart, requestedEnd, triggeredBy }) {
      const record = {
        id: newId('providerCostSyncRun'), provider, scopeKey: scopeKey || 'default', requestedStart, requestedEnd,
        status: 'running', errorCode: null, triggeredBy: triggeredBy || null, startedAt: now(), finishedAt: null
      };
      state.providerCostSyncRuns.set(record.id, record);
      return clone(record);
    },
    async finishRun(id, { status, errorCode } = {}) {
      const record = state.providerCostSyncRuns.get(id);
      if (!record) return null;
      record.status = status; record.errorCode = errorCode || null; record.finishedAt = now();
      return clone(record);
    },
    async insertSnapshots(syncRunId, rows) {
      const run = state.providerCostSyncRuns.get(syncRunId);
      if (!run) throw new ApiError(404, 'SYNC_RUN_NOT_FOUND');
      if (!rows || !rows.length) return [];
      const inserted = [];
      for (const row of rows) {
        const record = {
          id: newId('providerCostSnapshot'), syncRunId, provider: run.provider, scopeKey: run.scopeKey,
          periodStart: row.periodStart, periodEnd: row.periodEnd, currency: row.currency || 'usd',
          amountMicroUsd: row.amountMicroUsd, lineItem: row.lineItem || null, projectId: row.projectId || null, createdAt: now()
        };
        state.providerCostSnapshots.set(record.id, record);
        inserted.push(clone(record));
      }
      return inserted;
    },
    async snapshotsForRun(syncRunId) {
      return Array.from(state.providerCostSnapshots.values()).filter((s) => s.syncRunId === syncRunId).sort((a, b) => (a.periodStart < b.periodStart ? -1 : 1)).map(clone);
    },
    async latestSuccessfulRunCovering({ provider, scopeKey, start, end }) {
      const key = scopeKey || 'default';
      const matches = Array.from(state.providerCostSyncRuns.values())
        .filter((r) => r.provider === provider && r.scopeKey === key && r.status === 'success' && r.requestedStart <= start && r.requestedEnd >= end)
        .sort((a, b) => (a.finishedAt < b.finishedAt ? 1 : -1));
      return matches[0] ? clone(matches[0]) : null;
    },
    async latestRunsByProvider() {
      const byKey = new Map();
      Array.from(state.providerCostSyncRuns.values())
        .sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1))
        .forEach((r) => { byKey.set(r.provider + ':' + r.scopeKey, r); });
      return Array.from(byKey.values()).map(clone);
    },
    async recentRuns({ provider, limit } = {}) {
      let values = Array.from(state.providerCostSyncRuns.values());
      if (provider) values = values.filter((r) => r.provider === provider);
      return values.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1)).slice(0, limit || 20).map(clone);
    }
  };

  const providerBalanceSnapshots = {
    async create({ provider, amountMicroUsd, currency, note, adminUserId }) {
      const record = { id: newId('providerBalanceSnapshot'), provider, amountMicroUsd, currency: currency || 'usd', note: note || null, adminUserId: adminUserId || null, createdAt: now() };
      state.providerBalanceSnapshots.set(record.id, record);
      return clone(record);
    },
    async latest(provider) {
      const matches = Array.from(state.providerBalanceSnapshots.values()).filter((s) => s.provider === provider).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      return matches[0] ? clone(matches[0]) : null;
    }
  };

  const storageProducts = {
    // Mirrors repo.pg.mjs's lazy self-seed exactly - see that method's own comment.
    async list() {
      if (state.storageProducts.size === 0) {
        DEFAULT_STORAGE_PRODUCTS.forEach((product) => {
          state.storageProducts.set(product.id, {
            id: product.id, name: product.name, capacityBytes: product.capacityBytes,
            priceAmountMicroUsd: Math.round(product.priceAmountUsd * 1000000), currency: 'USD',
            validityDays: product.validityDays, enabled: true, displayOrder: product.displayOrder,
            stackingAllowed: true, purchaseLimit: null, updatedAt: now()
          });
        });
      }
      return Array.from(state.storageProducts.values()).sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name)).map(clone);
    },
    // Mirrors repo.pg.mjs's identical get() - ensures the lazy self-seed has run first.
    async get(id) {
      await storageProducts.list();
      const record = state.storageProducts.get(id);
      return record ? clone(record) : null;
    },
    async upsert({ id, name, capacityBytes, priceAmountMicroUsd, currency, validityDays, enabled, displayOrder, stackingAllowed, purchaseLimit }) {
      const rowId = id || newId('storageProduct');
      const record = {
        id: rowId, name, capacityBytes, priceAmountMicroUsd, currency: currency || 'USD', validityDays,
        enabled: enabled !== false, displayOrder: displayOrder || 0, stackingAllowed: stackingAllowed !== false,
        purchaseLimit: purchaseLimit || null, updatedAt: now()
      };
      state.storageProducts.set(rowId, record);
      return clone(record);
    }
  };

  const storageEntitlements = {
    async create({ userId, productId, capacityBytesSnapshot, pricePaidSnapshotMicroUsd, currency, validityDaysSnapshot, expiresAt, paymentTransactionId }) {
      const record = {
        id: newId('storageEntitlement'), userId, productId: productId || null, capacityBytesSnapshot,
        pricePaidSnapshotMicroUsd, currency: currency || 'USD', validityDaysSnapshot, startsAt: now(), expiresAt,
        status: 'active', paymentTransactionId: paymentTransactionId || null, createdAt: now()
      };
      state.storageEntitlements.set(record.id, record);
      return clone(record);
    },
    async listForUser(userId) {
      return Array.from(state.storageEntitlements.values()).filter((e) => e.userId === userId)
        .sort((a, b) => new Date(b.expiresAt) - new Date(a.expiresAt)).map(clone);
    },
    async sumActiveCapacityForUser(userId) {
      const nowMs = Date.now();
      return Array.from(state.storageEntitlements.values())
        .filter((e) => e.userId === userId && new Date(e.expiresAt).getTime() > nowMs)
        .reduce((sum, e) => sum + e.capacityBytesSnapshot, 0);
    },
    async get(id) {
      const record = state.storageEntitlements.get(id);
      return record ? clone(record) : null;
    },
    // Mirrors repo.pg.mjs's revoke() - moves expires_at to now() rather than deleting the row or
    // introducing a new status concept; the existing read-time expiry gate does the rest.
    async revoke(id) {
      const record = state.storageEntitlements.get(id);
      if (!record) return null;
      record.expiresAt = now();
      record.status = 'expired';
      return clone(record);
    },
    async getByPaymentTransactionId(transactionId) {
      const record = Array.from(state.storageEntitlements.values()).find((e) => e.paymentTransactionId === transactionId);
      return record ? clone(record) : null;
    }
  };

  const storageObjects = {
    async record({ userId, objectKey, sizeBytes, mimeType, category, sourceDomain, sourceRecordId }) {
      const record = {
        id: newId('storageObject'), userId, objectKey, sizeBytes, mimeType: mimeType || null, category,
        sourceDomain: sourceDomain || null, sourceRecordId: sourceRecordId || null, createdAt: now(), deletedAt: null
      };
      state.storageObjects.set(record.id, record);
      return clone(record);
    },
    async sumActiveBytesForUser(userId) {
      return Array.from(state.storageObjects.values())
        .filter((o) => o.userId === userId && !o.deletedAt)
        .reduce((sum, o) => sum + o.sizeBytes, 0);
    },
    async get(id) {
      const record = state.storageObjects.get(id);
      return record ? clone(record) : null;
    },
    async listActiveForUser(userId) {
      return Array.from(state.storageObjects.values()).filter((o) => o.userId === userId && !o.deletedAt)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).map(clone);
    },
    async markDeleted(id) {
      const record = state.storageObjects.get(id);
      if (!record) return null;
      record.deletedAt = now();
      return clone(record);
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
      // Instrument Catalog domain (025_instrument_catalog.sql) - see repo.pg.mjs's identical
      // check for the full reasoning (defensive consistency check, not a hard "required" gate -
      // signatures are server-derived, never directly user-authored).
      const instrument = normalizeInstrumentCode(record.instrument);
      if (instrument) assertInstrumentInCatalog(userId, instrument);
      const stored = {
        id: record.id, userId, sessionId: String(record.sessionId), character: record.character || '',
        market: record.market || '', timeframe: record.timeframe || '', date: record.date || '',
        movementSequence: record.movementSequence || [], patternIds: record.patternIds || [],
        strategyIds: record.strategyIds || [], scenarioOutcomes: record.scenarioOutcomes || [],
        tradeSummary: record.tradeSummary || {}, fateSummaryText: record.fateSummaryText || '', instrument,
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
    // reauthAt: undefined (no other caller in this codebase passes it) keeps the previous default
    // (now()); session-service.mjs's createSession() always passes it explicitly now (now() for a
    // real reauth moment, null otherwise) - see that module's own comment on the bug this fixes.
    async create({ userId, sessionHash, familyId, idleExpiresAt, absoluteExpiresAt, reauthAt, ipHash, userAgent }) {
      requireUser(userId);
      const record = {
        id: newId('asess'), userId, sessionHash, familyId, createdAt: now(), lastSeenAt: now(),
        idleExpiresAt, absoluteExpiresAt, revokedAt: null, revokedReason: null,
        reauthAt: reauthAt !== undefined ? reauthAt : now(),
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

  // Journey H2, Gate 2: Conversation Studio. Same draft/published/archived shape as
  // marketplace_listings' own status lifecycle, plus a real version history
  // (conversation_scenario_versions) - see 041_conversation_scenarios.sql for the full reasoning.
  // composeScenario() attaches the real draft/published version OBJECTS (not just their ids) -
  // every caller (the admin detail route, the Trigger Lab) needs the actual content, never a
  // second round trip.
  function composeScenario(scenario) {
    const draft = scenario.draftVersionId ? state.conversationScenarioVersions.get(scenario.draftVersionId) : null;
    const published = scenario.publishedVersionId ? state.conversationScenarioVersions.get(scenario.publishedVersionId) : null;
    return Object.assign(clone(scenario), { draftVersion: draft ? clone(draft) : null, publishedVersion: published ? clone(published) : null });
  }
  function nextVersionNumber(scenarioId) {
    const numbers = Array.from(state.conversationScenarioVersions.values()).filter((v) => v.scenarioId === scenarioId).map((v) => v.versionNumber);
    return (numbers.length ? Math.max(...numbers) : 0) + 1;
  }
  const conversationScenarios = {
    async create({ scenarioKey, domain, kind, dataQueryRef, ctaActionId, allowedProcesses, allowedSteps, definition, createdBy }) {
      if (Array.from(state.conversationScenarios.values()).some((s) => s.scenarioKey === scenarioKey)) throw new ApiError(409, 'SCENARIO_KEY_TAKEN');
      const stamp = now();
      const scenarioId = newId('convscn');
      const versionId = newId('convscnver');
      state.conversationScenarioVersions.set(versionId, {
        id: versionId, scenarioId, versionNumber: 1, status: 'draft', definition: definition || {},
        publishedAt: null, createdBy: createdBy || null, publishedBy: null, createdAt: stamp, updatedAt: stamp
      });
      state.conversationScenarios.set(scenarioId, {
        id: scenarioId, scenarioKey, domain: domain || null, kind, dataQueryRef: dataQueryRef || null,
        ctaActionId: ctaActionId || null, allowedProcesses: allowedProcesses || null, allowedSteps: allowedSteps || null,
        publishedVersionId: null, draftVersionId: versionId, archivedAt: null, createdAt: stamp, updatedAt: stamp
      });
      return composeScenario(state.conversationScenarios.get(scenarioId));
    },
    async get(id) { const scenario = state.conversationScenarios.get(id); return scenario ? composeScenario(scenario) : null; },
    async getByKey(scenarioKey) {
      const scenario = Array.from(state.conversationScenarios.values()).find((s) => s.scenarioKey === scenarioKey);
      return scenario ? composeScenario(scenario) : null;
    },
    async list({ status, domain } = {}) {
      let values = Array.from(state.conversationScenarios.values());
      if (domain) values = values.filter((s) => s.domain === domain);
      if (status === 'archived') values = values.filter((s) => s.archivedAt);
      else if (status === 'published') values = values.filter((s) => !s.archivedAt && s.publishedVersionId);
      else if (status === 'draft') values = values.filter((s) => !s.archivedAt && s.draftVersionId);
      return values.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).map(composeScenario);
    },
    async listVersions(scenarioId) {
      return Array.from(state.conversationScenarioVersions.values()).filter((v) => v.scenarioId === scenarioId)
        .sort((a, b) => b.versionNumber - a.versionNumber).map(clone);
    },
    async getVersion(versionId) { const version = state.conversationScenarioVersions.get(versionId); return version ? clone(version) : null; },
    async updateDraft(scenarioId, definitionPatch) {
      const scenario = state.conversationScenarios.get(scenarioId);
      if (!scenario) throw new ApiError(404, 'SCENARIO_NOT_FOUND');
      if (!scenario.draftVersionId) throw new ApiError(400, 'NO_DRAFT_TO_EDIT');
      const version = state.conversationScenarioVersions.get(scenario.draftVersionId);
      version.definition = Object.assign({}, version.definition, definitionPatch);
      version.updatedAt = now();
      scenario.updatedAt = version.updatedAt;
      return composeScenario(scenario);
    },
    async startNewRevision(scenarioId, createdBy) {
      const scenario = state.conversationScenarios.get(scenarioId);
      if (!scenario) throw new ApiError(404, 'SCENARIO_NOT_FOUND');
      if (scenario.draftVersionId) throw new ApiError(409, 'DRAFT_ALREADY_EXISTS');
      if (!scenario.publishedVersionId) throw new ApiError(400, 'NO_PUBLISHED_VERSION');
      const published = state.conversationScenarioVersions.get(scenario.publishedVersionId);
      const stamp = now();
      const versionId = newId('convscnver');
      state.conversationScenarioVersions.set(versionId, {
        id: versionId, scenarioId, versionNumber: nextVersionNumber(scenarioId), status: 'draft',
        definition: clone(published.definition), publishedAt: null, createdBy: createdBy || null, publishedBy: null,
        createdAt: stamp, updatedAt: stamp
      });
      scenario.draftVersionId = versionId;
      scenario.updatedAt = stamp;
      return composeScenario(scenario);
    },
    async publish(scenarioId, versionId, publishedBy) {
      const scenario = state.conversationScenarios.get(scenarioId);
      if (!scenario) throw new ApiError(404, 'SCENARIO_NOT_FOUND');
      if (scenario.draftVersionId !== versionId) throw new ApiError(400, 'NOT_CURRENT_DRAFT');
      const draft = state.conversationScenarioVersions.get(versionId);
      if (!draft || draft.status !== 'draft') throw new ApiError(400, 'VERSION_NOT_DRAFT');
      const stamp = now();
      if (scenario.publishedVersionId) {
        const previous = state.conversationScenarioVersions.get(scenario.publishedVersionId);
        if (previous) { previous.status = 'archived'; previous.updatedAt = stamp; }
      }
      draft.status = 'published'; draft.publishedAt = stamp; draft.publishedBy = publishedBy || null; draft.updatedAt = stamp;
      scenario.publishedVersionId = versionId;
      scenario.draftVersionId = null;
      scenario.updatedAt = stamp;
      return composeScenario(scenario);
    },
    // Never an in-place mutation of a past version - copies targetVersion's content into a
    // brand-new, immediately-published version, reusing the exact same "archive the old
    // published version" step publish() already performs, so there is only one real "become the
    // live version" code path in this whole domain.
    async rollback(scenarioId, targetVersionId, actorId) {
      const scenario = state.conversationScenarios.get(scenarioId);
      if (!scenario) throw new ApiError(404, 'SCENARIO_NOT_FOUND');
      const target = state.conversationScenarioVersions.get(targetVersionId);
      if (!target || target.scenarioId !== scenarioId) throw new ApiError(404, 'VERSION_NOT_FOUND');
      if (scenario.draftVersionId) throw new ApiError(409, 'DRAFT_ALREADY_EXISTS');
      const stamp = now();
      const versionId = newId('convscnver');
      state.conversationScenarioVersions.set(versionId, {
        id: versionId, scenarioId, versionNumber: nextVersionNumber(scenarioId), status: 'published',
        definition: clone(target.definition), publishedAt: stamp, createdBy: actorId || null, publishedBy: actorId || null,
        createdAt: stamp, updatedAt: stamp
      });
      if (scenario.publishedVersionId) {
        const previous = state.conversationScenarioVersions.get(scenario.publishedVersionId);
        if (previous) { previous.status = 'archived'; previous.updatedAt = stamp; }
      }
      scenario.publishedVersionId = versionId;
      scenario.updatedAt = stamp;
      return composeScenario(scenario);
    },
    // Scenario-level metadata only (ctaActionId/domain/allowedProcesses/allowedSteps) - never
    // scenarioKey/kind, which stay immutable after create() by design (spec section 11: other
    // systems may reference the stable key).
    async updateMetadata(scenarioId, patch) {
      const scenario = state.conversationScenarios.get(scenarioId);
      if (!scenario) throw new ApiError(404, 'SCENARIO_NOT_FOUND');
      ['domain', 'ctaActionId', 'allowedProcesses', 'allowedSteps'].forEach((key) => {
        if (Object.prototype.hasOwnProperty.call(patch, key)) scenario[key] = patch[key];
      });
      scenario.updatedAt = now();
      return composeScenario(scenario);
    },
    async archive(scenarioId) {
      const scenario = state.conversationScenarios.get(scenarioId);
      if (!scenario) throw new ApiError(404, 'SCENARIO_NOT_FOUND');
      scenario.archivedAt = now();
      scenario.updatedAt = scenario.archivedAt;
      return composeScenario(scenario);
    },
    async unarchive(scenarioId) {
      const scenario = state.conversationScenarios.get(scenarioId);
      if (!scenario) throw new ApiError(404, 'SCENARIO_NOT_FOUND');
      scenario.archivedAt = null;
      scenario.updatedAt = now();
      return composeScenario(scenario);
    },
    // The production Router's own bundle source (server/community/routes.conversation-scenarios-
    // sync.mjs) - every non-archived scenario with a real published version, full definition
    // content included. Never returns draft content, by construction (only publishedVersionId is
    // ever read here).
    async listPublishedForBundle() {
      return Array.from(state.conversationScenarios.values())
        .filter((s) => !s.archivedAt && s.publishedVersionId)
        .map((s) => {
          const version = state.conversationScenarioVersions.get(s.publishedVersionId);
          return {
            id: s.id, scenarioKey: s.scenarioKey, domain: s.domain, kind: s.kind,
            dataQueryRef: s.dataQueryRef, ctaActionId: s.ctaActionId,
            allowedProcesses: s.allowedProcesses, allowedSteps: s.allowedSteps,
            publishedVersion: version ? version.versionNumber : null, publishedAt: version ? version.publishedAt : null,
            definition: version ? clone(version.definition) : {},
            audio: approvedAudioFor(s.publishedVersionId, version)
          };
        });
    }
  };

  // Journey H2, Gate 3: mirrors repo.pg.mjs's approvedAudioByVersionIds() exactly, one version at
  // a time (the in-memory backend has no real query-batching concern to optimize for) - never
  // exposes anything beyond {url, mimeType, durationMs}, and re-verifies the content hash against
  // the version's OWN current definition before ever serving a row, regardless of its stored status.
  function approvedAudioFor(versionId, version) {
    if (!versionId || !version) return {};
    const assets = Array.from(state.conversationAudioAssets.values())
      .filter((a) => a.scenarioVersionId === versionId && a.status === 'approved');
    const result = {};
    assets.forEach((asset) => {
      const spoken = spokenTextFor(version.definition, asset.language);
      const expectedHash = computeAudioContentHash({ text: spoken.text, language: asset.language, provider: asset.provider, voiceId: asset.voiceId, modelId: asset.modelId });
      if (!spoken.text || expectedHash !== asset.contentHash) return;
      if (!result[asset.language]) result[asset.language] = {};
      result[asset.language][asset.variantKey] = { url: asset.fileUrl, mimeType: asset.mimeType, durationMs: asset.durationMs };
    });
    return result;
  }

  const conversationAudioAssets = {
    async create({ scenarioId, scenarioVersionId, language, variantKey, contentHash, provider, voiceProfileKey, voiceId, modelId, fileUrl, mimeType, durationMs, createdBy }) {
      const stamp = now();
      const record = {
        id: newId('convaudio'), scenarioId, scenarioVersionId, language, variantKey: variantKey || 'standard',
        contentHash, provider: provider || 'elevenlabs', voiceProfileKey, voiceId, modelId: modelId || null,
        fileUrl, mimeType, durationMs: durationMs == null ? null : Math.round(Number(durationMs)), status: 'preview',
        createdBy: createdBy || null, approvedBy: null, approvedAt: null, createdAt: stamp, updatedAt: stamp
      };
      state.conversationAudioAssets.set(record.id, record);
      return clone(record);
    },
    async get(id) { const record = state.conversationAudioAssets.get(id); return record ? clone(record) : null; },
    async listForVersion(scenarioVersionId) {
      return Array.from(state.conversationAudioAssets.values())
        .filter((a) => a.scenarioVersionId === scenarioVersionId)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map(clone);
    },
    async approve(id, approvedBy) {
      const asset = state.conversationAudioAssets.get(id);
      if (!asset) throw new ApiError(404, 'AUDIO_ASSET_NOT_FOUND');
      const stamp = now();
      Array.from(state.conversationAudioAssets.values())
        .filter((a) => a.id !== id && a.scenarioVersionId === asset.scenarioVersionId && a.language === asset.language && a.variantKey === asset.variantKey && a.status === 'approved')
        .forEach((a) => { a.status = 'archived'; a.updatedAt = stamp; });
      asset.status = 'approved'; asset.approvedBy = approvedBy || null; asset.approvedAt = stamp; asset.updatedAt = stamp;
      return clone(asset);
    },
    async archive(id) {
      const asset = state.conversationAudioAssets.get(id);
      if (!asset) throw new ApiError(404, 'AUDIO_ASSET_NOT_FOUND');
      asset.status = 'archived'; asset.updatedAt = now();
      return clone(asset);
    }
  };

  return {
    users, posts, comments, likes, listings, purchases, ratings, threads, messages, reports, sessions, usageEvents,
    providerHealth, providerPricing, adminKeys, auditLog, voiceProviderCredentials, voiceLanguageConfigs, voiceCharacterConfigs, voiceTtsUsage,
    xpEvents, achievements, xpConfig, tradingSessions, patterns,
    strategies, trades, accounts, instrumentCatalog, mentalHealthProfile, aiChatHistory, companionState, sessionSignatures, userPreferences,
    authSessions, externalIdentities, securityEvents, authTransactions, health,
    commercialConfig, markupRules, providerModelPricing, wallet, quota, analysisSymbols,
    subscriptions, paymentTransactions, paymentEvents, cryptoInvoices, bscPaymentSecrets, storageProducts, storageEntitlements, storageObjects,
    conversationScenarios, conversationAudioAssets,
    providerCostCredentials, providerCostSync, providerBalanceSnapshots
  };
}
