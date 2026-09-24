/**
 * Analysis Profile AI client - Analysis Profiles domain (see ARCHITECTURE.md §7.25).
 *
 * `window.TradeJournalAnalysisProfileAI` holds every billed AI call the Analysis Profile domain
 * makes: `suggestFocuses` (the onboarding wizard's "Suggest more with AI"), `suggestConcepts` (the
 * Concepts tab's own suggestions) - both POST to `/api/analysis-profiles/suggest` - and
 * `ingestLearning` (the engine-memory learning loop, POST `/api/analysis-profiles/ingest`); all
 * three are real, wallet-billed routes in server/pattern-ai-server.mjs. `readSource` (POST
 * `/api/analysis-profiles/read-source`) is the one call here that is NOT billed - it only fetches
 * a website/YouTube page and never touches an LLM, so it carries no provider key and records no usage.
 * `chat` (the teaching-chat tab, POST `/api/analysis-profiles/chat`) and `preview` (the Preview
 * tab's optional billed sample, POST `/api/analysis-profiles/preview`) are both real, wallet-billed
 * routes like `suggestFocuses`/`suggestConcepts`/`ingestLearning`. Same real request()/baseUrl convention as
 * pattern-registry-ai.js/strategy-education-ai.js, but deliberately does NOT fall back to a canned
 * local reply on failure - a billed AI feature that silently pretends to succeed with fake text
 * would hide a real WALLET_INSUFFICIENT_BALANCE/PROVIDER_PRICING_NOT_CONFIGURED condition from the
 * trader. A failure rejects with a typed error the UI shows honestly instead.
 */
(function () {
  'use strict';

  // Resolved on EVERY request, never captured at script evaluation: pattern-ai-config.js (or a late
  // bootstrap that sets TradeJournalPatternAIConfig.baseUrl after this script ran) would otherwise leave
  // this client pointing at the same-origin default forever - a request to the wrong origin that fails
  // with an undiagnosable network/proxy error instead of reaching the gateway.
  function apiBase() {
    var config = window.TradeJournalPatternAIConfig || {};
    return String(config.baseUrl || '').replace(/\/$/, '');
  }

  function styleRegistry() { return window.TradeJournalAnalysisStyleRegistry; }

  // `status` is the HTTP status when the failure came from a response (undefined for a timeout or a
  // network failure that never produced one) - it is what lets the UI tell "the gateway said no" from
  // "something between the browser and the gateway answered instead".
  function AnalysisProfileAIError(code, cause, status) {
    this.name = 'AnalysisProfileAIError';
    this.code = code;
    this.message = code;
    this.cause = cause;
    if (status != null) this.status = status;
  }
  AnalysisProfileAIError.prototype = Object.create(Error.prototype);

  // Every request carries the provider and model the trader selected in AI settings - the same
  // convention the AI dock and Session analysis follow - so a platform-billed call is priced and
  // served on a model the trader can already use. The personal API key is added ONLY when one is
  // configured: that alone makes the gateway treat the call as BYOK and never wallet-bill it
  // (server/pattern-ai-server.mjs's `isByok`), which is what makes the UI's "free with your own API
  // key" hint true. This used to send nothing at all without a key, on the assumption that the
  // gateway would fall back to a platform default; its wallet gate priced that as `undefined`
  // instead, so every wallet-funded teach/suggest/chat/preview failed with
  // PROVIDER_PRICING_NOT_CONFIGURED. The gateway now also resolves an omitted provider/model itself.
  function providerContext() {
    try {
      var settings = window.TradeJournalAISettingsStore;
      if (!settings || typeof settings.activeProvider !== 'function') return {};
      var provider = settings.activeProvider();
      if (!provider) return {};
      var context = { provider: provider };
      var model = typeof settings.activeModel === 'function' ? settings.activeModel() : null;
      if (model) context.model = model;
      var apiKey = typeof settings.getKey === 'function' ? settings.getKey(provider) : '';
      if (apiKey) context.apiKey = apiKey;
      return context;
    } catch (_) { return {}; }
  }

  // `settings.free` (read-source) sends no provider key and allows the longer wait a server-side page
  // fetch can take; every billed call keeps the original 45s ceiling and carries the BYOK context.
  function request(path, payload, settings) {
    var free = Boolean(settings && settings.free);
    var controller = new AbortController();
    var timeout = window.setTimeout(function () { controller.abort(); }, free ? 60000 : 45000);
    return fetch(apiBase() + path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({}, free ? {} : providerContext(), payload)), signal: controller.signal
    }).then(function (response) {
      if (!response.ok) {
        return response.json().catch(function () { return {}; }).then(function (body) {
          // The gateway ALWAYS answers a failure with { error: '<STABLE_CODE>' }. A failure without one was
          // not produced by the gateway: a reverse proxy / load balancer answered instead (502/503/504, or a
          // 404/405 for a route it does not forward), so it is reported as a proxy failure, never as a
          // generic request failure the trader cannot act on.
          var code = body && typeof body.error === 'string' && body.error ? body.error
            : (response.status >= 500 || response.status === 404 || response.status === 405 ? 'ANALYSIS_PROFILE_AI_PROXY_ERROR' : 'ANALYSIS_PROFILE_AI_REQUEST_FAILED');
          throw new AnalysisProfileAIError(code, undefined, response.status);
        });
      }
      return response.json();
    }).catch(function (error) {
      if (error instanceof AnalysisProfileAIError) throw error;
      if (error && error.name === 'AbortError') throw new AnalysisProfileAIError('ANALYSIS_PROFILE_AI_TIMEOUT', error);
      throw new AnalysisProfileAIError('ANALYSIS_PROFILE_AI_NETWORK_ERROR', error);
    }).finally(function () { window.clearTimeout(timeout); });
  }

  // A small, NON-SECRET description of how the next billed call will be served, for the readiness line in
  // the Analysis Profile area: BYOK (the trader's own key - never wallet-billed) or platform-managed (billed
  // per the token policy), plus the provider/model the trader selected when one is known locally. It never
  // returns, logs or exposes the key itself - only whether one is set. Best-effort: a missing/throwing
  // settings store reads as platform-managed.
  function readiness() {
    var out = { mode: 'platform', provider: '', providerLabel: '', model: '' };
    try {
      var settings = window.TradeJournalAISettingsStore;
      if (!settings || typeof settings.activeProvider !== 'function') return out;
      var provider = settings.activeProvider() || '';
      var hasKey = Boolean(provider && typeof settings.getKey === 'function' && settings.getKey(provider));
      out.mode = hasKey ? 'byok' : 'platform';
      out.provider = provider;
      out.model = typeof settings.activeModel === 'function' ? (settings.activeModel() || '') : '';
      if (typeof settings.providerCatalog === 'function') {
        var entry = (settings.providerCatalog() || []).filter(function (item) { return item && item.id === provider; })[0];
        out.providerLabel = entry && entry.label ? String(entry.label) : provider;
      } else out.providerLabel = provider;
    } catch (_) { /* readiness is display-only */ }
    return out;
  }

  // Records the real, server-reported usage against this tab's own visible usage counter - same
  // convention session-analysis-client.js's analyzeSession() already established for a billed
  // feature. Best-effort: the store recording a display counter must never fail the real call.
  function recordUsage(source, result) {
    try { if (window.TradeJournalAIUsage && result) window.TradeJournalAIUsage.record({ provider: result.provider, usage: result.usage, source: source }); } catch (_) { /* display-only */ }
  }

  // The style half of every request body: resolved from the REAL registry (never a second,
  // invented style shape), tolerant of an unknown/missing id (resolves to null, never throws).
  function styleContext(opts) {
    var styles = styleRegistry();
    return {
      primaryStyle: styles && opts.primaryStyleId ? styles.get(opts.primaryStyleId) : null,
      secondaryStyles: (opts.secondaryStyleIds || []).map(function (id) { return styles ? styles.get(id) : null; }).filter(Boolean),
      customMethodNotes: opts.customMethodNotes || ''
    };
  }
  function suggest(kind, sourceLabel, options) {
    var opts = options || {};
    var payload = Object.assign({
      kind: kind, language: opts.language || 'en',
      alreadySelected: (opts.alreadySelected || []).slice(0, 60), alreadySuggested: (opts.alreadySuggested || []).slice(0, 60)
    }, styleContext(opts));
    return request('/api/analysis-profiles/suggest', payload).then(function (result) {
      recordUsage(sourceLabel, result);
      return { suggestions: result.suggestions || [], provider: result.provider || 'openai', usage: result.usage || null };
    });
  }

  // options: { primaryStyleId, secondaryStyleIds, customMethodNotes, alreadySelected,
  //            alreadySuggested, language }. alreadySelected/alreadySuggested are plain name
  // strings (registry focus names + custom focus names already on screen) - the server's own
  // sanitizer treats them as case/whitespace-insensitive exclusions, never trusting the model
  // alone to avoid repeating them.
  function suggestFocuses(options) { return suggest('focuses', 'analysisProfiles.suggestFocuses', options); }
  // Same options; each returned suggestion also carries a validated `priority`
  // (mandatory | preferred | reference).
  function suggestConcepts(options) { return suggest('concepts', 'analysisProfiles.suggestConcepts', options); }

  // The engine-memory learning loop's ONE AI call. options: { kind: 'note' | 'chat' | 'correction'
  // | 'source', text, primaryStyleId, secondaryStyleIds, customMethodNotes, existingConceptTitles,
  // currentUnderstanding, language, attachment? }. `attachment` ({ dataUrl, fileName }) is a PDF the
  // model reads natively - only valid for kind 'source', and then `text` may be empty. Resolves to a PROPOSAL only -
  // { updatedUnderstanding, conceptsProposed: [{title, description, priority}], provider, usage } -
  // which the caller shows for explicit approval and then applies through
  // TradeJournalAnalysisProfileStore.applyLearning() (one save, one ledger event); this function
  // never writes anywhere. Empty text is refused locally, before any network call, so a click on
  // an empty box can never bill.
  async function ingestLearning(options) {
    var opts = options || {};
    var text = typeof opts.text === 'string' ? opts.text.trim() : '';
    var attachment = opts.attachment && typeof opts.attachment.dataUrl === 'string' && opts.attachment.dataUrl ? { dataUrl: opts.attachment.dataUrl, fileName: opts.attachment.fileName || 'source.pdf' } : null;
    if (!text && !attachment) throw new AnalysisProfileAIError('ANALYSIS_PROFILE_INGEST_TEXT_REQUIRED');
    var payload = Object.assign({
      kind: opts.kind || 'note', text: text, language: opts.language || 'en',
      currentUnderstanding: opts.currentUnderstanding || '',
      existingConcepts: (opts.existingConceptTitles || []).slice(0, 120).map(function (title) { return { title: title }; })
    }, attachment ? { attachment: attachment } : {}, styleContext(opts));
    var result = await request('/api/analysis-profiles/ingest', payload);
    recordUsage('analysisProfiles.ingest', result);
    return {
      updatedUnderstanding: String(result.updatedUnderstanding || ''),
      conceptsProposed: result.conceptsProposed || [],
      provider: result.provider || 'openai', usage: result.usage || null
    };
  }

  // Reads a website or YouTube URL server-side (SSRF-hardened) into a title and a BOUNDED plain-text
  // digest. Free: no tokens, no provider key sent. Resolves to { type: 'website' | 'youtube', url,
  // title, digest, transcriptAvailable? } - `transcriptAvailable:false` on a YouTube result means the
  // video offered no readable captions, and the UI asks the trader to paste a transcript instead.
  // Rejects with the server's stable code (SOURCE_ADDRESS_BLOCKED, SOURCE_TIMEOUT, ...).
  async function readSource(options) {
    var opts = options || {};
    var url = typeof opts.url === 'string' ? opts.url.trim() : '';
    if (!url) throw new AnalysisProfileAIError('SOURCE_URL_INVALID');
    var result = await request('/api/analysis-profiles/read-source', { url: url, language: opts.language || 'en' }, { free: true });
    return {
      type: result.type === 'youtube' ? 'youtube' : 'website', url: String(result.url || url), title: String(result.title || ''),
      digest: String(result.digest || ''), transcriptAvailable: result.type === 'youtube' ? Boolean(result.transcriptAvailable) : undefined
    };
  }

  // Unlike suggest/ingest (which only need the style half, built by styleContext() from raw ids),
  // chat and preview read the SAME full profile shape the Session analysis prompt does - focuses,
  // customFocuses, concepts, understanding, requiredInputs too - because both build the shared brief
  // (server/ai/analysis-profile-brief.mjs) server-side. `profileContext` is exactly
  // window.TradeJournalAnalysisContext.getAnalysisContext(profileId)'s own return value; forwarded
  // wholesale so the two can never drift out of sync field by field.
  function fullProfileContext(profileContext) { return profileContext || {}; }

  // The teaching chat's ONE AI call. options: { message, history, profileContext, language }.
  // `history` is the conversation so far as plain {role, content} turns (proposals/tokenUsage are the
  // caller's own concern, never sent back to the model). Resolves to { reply, proposals, provider,
  // usage } - `proposals` is already the exact shape analysis_profile_messages.proposals expects,
  // ready to pass straight to TradeJournalAnalysisProfileStore.appendMessages(). Empty text is
  // refused locally, before any network call.
  async function chat(options) {
    var opts = options || {};
    var message = typeof opts.message === 'string' ? opts.message.trim() : '';
    if (!message) throw new AnalysisProfileAIError('ANALYSIS_PROFILE_CHAT_MESSAGE_REQUIRED');
    var payload = {
      message: message, language: opts.language || 'en', profile: fullProfileContext(opts.profileContext),
      history: (opts.history || []).slice(-24).map(function (m) { return { role: m.role, content: String(m.content || '') }; })
    };
    var result = await request('/api/analysis-profiles/chat', payload);
    recordUsage('analysisProfiles.chat', result);
    return { reply: String(result.reply || ''), proposals: result.proposals || [], provider: result.provider || 'openai', usage: result.usage || null };
  }

  // The Preview tab's optional billed sample. options: { profileContext, language }. Resolves to
  // { observations: [{title, detail}], provider, usage } - each observation is clearly illustrative,
  // never claiming a real chart (server/pattern-ai-server.mjs's own system prompt enforces this).
  async function preview(options) {
    var opts = options || {};
    var payload = { language: opts.language || 'en', profile: fullProfileContext(opts.profileContext) };
    var result = await request('/api/analysis-profiles/preview', payload);
    recordUsage('analysisProfiles.preview', result);
    return { observations: result.observations || [], provider: result.provider || 'openai', usage: result.usage || null };
  }

  window.TradeJournalAnalysisProfileAI = {
    suggestFocuses: suggestFocuses, suggestConcepts: suggestConcepts, ingestLearning: ingestLearning, readSource: readSource,
    chat: chat, preview: preview, readiness: readiness,
    AnalysisProfileAIError: AnalysisProfileAIError
  };
}());
