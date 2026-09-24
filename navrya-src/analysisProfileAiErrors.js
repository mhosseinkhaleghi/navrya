import { trt } from './analysisProfileTrainingCopy.js';

// One place that turns "what the AI call failed with" into a translated, actionable message for every
// Analysis Profile AI surface (Suggestions, Memory learning, Preview, Chat, Knowledge teaching). Before this,
// each surface knew two outcomes - "insufficient wallet" and "generic" - so an expired session, a dead proxy, a
// timeout, a quota, a missing provider key and a PDF-incompatible model all read as the same "try again".
//
// The codes are the gateway's stable error codes (server/pattern-ai-server.mjs answers every failure with
// { error: '<CODE>' }) plus the three the browser client adds itself (analysis-profile-ai.js: a timeout, a network
// failure, and a proxy failure - an error status with no gateway code, i.e. something in front of the gateway
// answered). Anything unrecognised is 'generic': a failure is never replaced with made-up text, and the raw code is
// shown next to the message so it stays diagnosable.

export const AI_ERROR_KINDS = ['auth', 'network', 'timeout', 'wallet', 'quota', 'provider', 'pdf_provider', 'generic'];

const KIND_COPY_KEY = {
  auth: 'aiErrAuth', network: 'aiErrNetwork', timeout: 'aiErrTimeout', wallet: 'aiErrWallet', quota: 'aiErrQuota',
  provider: 'aiErrProvider', pdf_provider: 'sourceErrPdfProvider', generic: 'aiErrorGeneric'
};

const CODE_KIND = {
  AUTH_SESSION_REQUIRED: 'auth', ACCOUNT_SUSPENDED: 'auth', UNAUTHORIZED: 'auth',
  ANALYSIS_PROFILE_AI_NETWORK_ERROR: 'network', ANALYSIS_PROFILE_AI_PROXY_ERROR: 'network',
  ANALYSIS_PROFILE_AI_TIMEOUT: 'timeout', PROVIDER_TIMEOUT: 'timeout', SOURCE_TIMEOUT: 'timeout',
  WALLET_INSUFFICIENT_BALANCE: 'wallet',
  AI_QUOTA_USER_EXCEEDED: 'quota', AI_QUOTA_GLOBAL_EXCEEDED: 'quota', FEATURE_NOT_ENTITLED: 'quota', STORAGE_QUOTA_EXCEEDED: 'quota',
  PROVIDER_PRICING_NOT_CONFIGURED: 'provider', WALLET_SERVICE_UNAVAILABLE: 'provider', PROVIDER_FAILED: 'provider', PROVIDER_ERROR: 'provider',
  EMPTY_MODEL_RESPONSE: 'provider', SCHEMA_VALIDATION_FAILED: 'provider', ANALYSIS_OUTPUT_TRUNCATED: 'provider', MODEL_VISION_UNSUPPORTED: 'provider',
  MODEL_PDF_UNSUPPORTED: 'pdf_provider'
};

// `status` is the HTTP status when the failure came from a response. It only decides the cases the code cannot: a
// 401 is an authentication failure even if the body was lost, and a 429 is a quota.
export function classifyAiError(code, status) {
  const value = String(code || '');
  if (Object.prototype.hasOwnProperty.call(CODE_KIND, value)) return CODE_KIND[value];
  if (/_API_KEY_MISSING$/.test(value)) return 'provider';
  if (Number(status) === 401) return 'auth';
  if (Number(status) === 429) return 'quota';
  // The AI routes always exist on the gateway, so a 404 / 405 (or the community API's own NOT_FOUND) means the request never reached it: a
  // proxy or routing problem in front of the AI service, which is a connectivity failure - not something "trying again" with the same data fixes.
  if (value === 'NOT_FOUND' || Number(status) === 404 || Number(status) === 405) return 'network';
  return 'generic';
}

// The caught value of an AI call (an AnalysisProfileAIError, or anything a store/UI layer threw) as the small,
// plain, serialisable shape the UI keeps in state: { code, status? }. Never keeps the error object itself, its
// cause, or its message - only the stable code and the HTTP status.
export function toAiError(caught) {
  const code = caught && caught.code ? String(caught.code) : 'ANALYSIS_PROFILE_AI_REQUEST_FAILED';
  const status = caught && Number.isFinite(Number(caught.status)) && Number(caught.status) > 0 ? Number(caught.status) : undefined;
  return status === undefined ? { code } : { code, status };
}

// { kind, text, detail } - `text` is the translated, actionable sentence; `detail` is the stable code (plus the HTTP
// status when there was one), shown small so a support conversation can start from it.
export function describeAiError(lang, error) {
  const code = error && error.code ? String(error.code) : '';
  const status = error && error.status;
  const kind = classifyAiError(code, status);
  const codePart = code ? trt(lang, 'aiErrCode', { code }) : '';
  return { kind, text: trt(lang, KIND_COPY_KEY[kind]), detail: codePart ? codePart + (status ? ' · HTTP ' + status : '') : (status ? 'HTTP ' + status : '') };
}

// Convenience for the surfaces that only want the sentence (Knowledge's read-source mapper falls back to it).
export function aiErrorText(lang, code, status) {
  return describeAiError(lang, { code, status }).text;
}
