/**
 * Analysis Profile AI client - Analysis Profiles domain (see ARCHITECTURE.md §7.25).
 *
 * `window.TradeJournalAnalysisProfileAI.suggestFocuses(...)` is the onboarding wizard's "Suggest
 * more with AI" (regenerate) call, POSTing to the real billed `/api/analysis-profiles/suggest`
 * route (server/pattern-ai-server.mjs). Same real request()/baseUrl convention as
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

  function request(path, payload) {
    var controller = new AbortController();
    var timeout = window.setTimeout(function () { controller.abort(); }, 45000);
    return fetch(baseUrl + path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: controller.signal
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

  // options: { primaryStyleId, secondaryStyleIds, customMethodNotes, alreadySelected,
  //            alreadySuggested, language }. alreadySelected/alreadySuggested are plain name
  // strings (registry focus names + custom focus names already on screen) - the server's own
  // sanitizer treats them as case/whitespace-insensitive exclusions, never trusting the model
  // alone to avoid repeating them.
  async function suggestFocuses(options) {
    var opts = options || {};
    var styles = styleRegistry();
    var primaryStyle = styles && opts.primaryStyleId ? styles.get(opts.primaryStyleId) : null;
    var secondaryStyles = (opts.secondaryStyleIds || []).map(function (id) { return styles ? styles.get(id) : null; }).filter(Boolean);
    var payload = {
      kind: 'focuses', language: opts.language || 'en',
      primaryStyle: primaryStyle, secondaryStyles: secondaryStyles, customMethodNotes: opts.customMethodNotes || '',
      alreadySelected: (opts.alreadySelected || []).slice(0, 60), alreadySuggested: (opts.alreadySuggested || []).slice(0, 60)
    };
    var result = await request('/api/analysis-profiles/suggest', payload);
    recordUsage('analysisProfiles.suggestFocuses', result);
    return { suggestions: result.suggestions || [], provider: result.provider || 'openai', usage: result.usage || null };
  }

  window.TradeJournalAnalysisProfileAI = { suggestFocuses: suggestFocuses, AnalysisProfileAIError: AnalysisProfileAIError };
}());
