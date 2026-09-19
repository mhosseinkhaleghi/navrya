/**
 * Analysis Profile AI client - Analysis Profiles domain (see ARCHITECTURE.md §7.25).
 *
 * `window.TradeJournalAnalysisProfileAI` holds every billed AI call the Analysis Profile domain
 * makes: `suggestFocuses` (the onboarding wizard's "Suggest more with AI"), `suggestConcepts` (the
 * Concepts tab's own suggestions) - both POST to `/api/analysis-profiles/suggest` - and
 * `ingestLearning` (the engine-memory learning loop, POST `/api/analysis-profiles/ingest`); all
 * three are real, wallet-billed routes in server/pattern-ai-server.mjs. `readSource` (POST
 * `/api/analysis-profiles/read-source`) is the one call here that is NOT billed - it only fetches
 * a website/YouTube page and never touches an LLM, so it carries no provider key and records no usage. Same real request()/baseUrl convention as
 * pattern-registry-ai.js/strategy-education-ai.js, but deliberately does NOT fall back to a canned
 * local reply on failure - a billed AI feature that silently pretends to succeed with fake text
 * would hide a real WALLET_INSUFFICIENT_BALANCE/PROVIDER_PRICING_NOT_CONFIGURED condition from the
 * trader. A failure rejects with a typed error the UI shows honestly instead.
 */
(function () {
  'use strict';

  var config = window.TradeJournalPatternAIConfig || {};
  var baseUrl = String(config.baseUrl || '').replace(/\/$/, '');

  function styleRegistry() { return window.TradeJournalAnalysisStyleRegistry; }

  function AnalysisProfileAIError(code, cause) {
    this.name = 'AnalysisProfileAIError';
    this.code = code;
    this.message = code;
    this.cause = cause;
  }
  AnalysisProfileAIError.prototype = Object.create(Error.prototype);

  // Bring-your-own-key: when the trader has configured their own provider key (Settings), every
  // request also carries it plus their chosen provider/model, and the gateway treats the call as
  // BYOK - never wallet-billed (server/pattern-ai-server.mjs's `isByok`). With no personal key
  // nothing is added: the platform default provider serves the call and it is billed per the token
  // policy. Same convention the Session analysis and Analysis Map AI already follow, which is what
  // makes the UI's "free with your own API key" hint actually true.
  function providerContext() {
    try {
      var settings = window.TradeJournalAISettingsStore;
      if (!settings || typeof settings.activeProvider !== 'function' || typeof settings.getKey !== 'function') return {};
      var provider = settings.activeProvider();
      var apiKey = provider ? settings.getKey(provider) : '';
      if (!apiKey) return {};
      return { provider: provider, model: typeof settings.activeModel === 'function' ? settings.activeModel() : undefined, apiKey: apiKey };
    } catch (_) { return {}; }
  }

  // `settings.free` (read-source) sends no provider key and allows the longer wait a server-side page
  // fetch can take; every billed call keeps the original 45s ceiling and carries the BYOK context.
  function request(path, payload, settings) {
    var free = Boolean(settings && settings.free);
    var controller = new AbortController();
    var timeout = window.setTimeout(function () { controller.abort(); }, free ? 60000 : 45000);
    return fetch(baseUrl + path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({}, free ? {} : providerContext(), payload)), signal: controller.signal
    }).then(function (response) {
      if (!response.ok) {
        return response.json().catch(function () { return {}; }).then(function (body) {
          throw new AnalysisProfileAIError(body.error || 'ANALYSIS_PROFILE_AI_REQUEST_FAILED');
        });
      }
      return response.json();
    }).catch(function (error) {
      if (error instanceof AnalysisProfileAIError) throw error;
      if (error && error.name === 'AbortError') throw new AnalysisProfileAIError('ANALYSIS_PROFILE_AI_TIMEOUT', error);
      throw new AnalysisProfileAIError('ANALYSIS_PROFILE_AI_NETWORK_ERROR', error);
    }).finally(function () { window.clearTimeout(timeout); });
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

  window.TradeJournalAnalysisProfileAI = {
    suggestFocuses: suggestFocuses, suggestConcepts: suggestConcepts, ingestLearning: ingestLearning, readSource: readSource,
    AnalysisProfileAIError: AnalysisProfileAIError
  };
}());
