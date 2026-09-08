// Voice Command Learning Profile addendum. One shared module for the two things every Learned
// Command Record must get right before it ever reaches a database row:
//
// 1. Privacy-preserving phrase normalization (section 5) - normalizedPhrase is the ONLY form of
//    "what the user said" this domain is ever allowed to persist, never a raw transcript. This is
//    the single place that turns raw utterance text into that safe, storable form, imported by
//    both repo.pg.mjs and repo.memory.mjs so the write-time rule can never drift between backends
//    - the same "one spec, both repos import it" convention instrument-normalize.mjs already
//    established for the Instrument Catalog domain.
// 2. The deterministic confidence/correction policy (section 8) - a small integer, moved by fixed
//    steps for fixed reasons, never an opaque model-produced score. Exported as a pure function so
//    a test can assert on the exact policy without touching a database.
//
// Neither function has any DB/Express dependency - both are plain data transforms.

// --- 1. Phrase normalization + redaction ------------------------------------------------------

// Persian/Arabic digit variants -> plain ASCII digits, and the handful of Arabic-script letter
// variants that commonly stand in for their Persian canonical form (ي/ك/ة are Arabic keyboard
// variants of ی/ک/ه) - the same "same phrase, different script variant" problem this app's own
// voice pipeline already has to normalize elsewhere for command matching to work at all.
const DIGIT_MAP = {
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9'
};
const CHAR_VARIANT_MAP = { 'ي': 'ی', 'ك': 'ک', 'ة': 'ه' }; // ي->ی, ك->ک, ة->ه

// Conservative on purpose - only whole leading/trailing filler words/phrases where removing them
// provably cannot change meaning (a politeness wrapper, not content). Never strips a mid-sentence
// word, which is exactly the kind of "removal changes meaning" case section 5 warns against.
const LEADING_FILLERS = [
  /^(please|just|can you please|could you please|can you|could you)\s+/i,
  /^(لطفا|میشه|میتونی|می‌تونی|ممکنه)\s+/,
  /^(من فضلك|من فضلكم|هل يمكنك)\s+/,
  /^(por favor|puedes|podrías)\s+/i
];
const TRAILING_FILLERS = [/\s+(please|لطفا|من فضلك|por favor)[.!?]*$/i];

// Each pattern below replaces a genuine PII/secret shape with a fixed, content-free placeholder -
// never a partial mask that could still leak the value, and never simply dropped (dropping could
// silently change "text 0x1234...abcd to me" into a different, wrong-meaning sentence).
const REDACTIONS = [
  { name: 'email', re: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, placeholder: '[email]' },
  { name: 'url', re: /\bhttps?:\/\/\S+/gi, placeholder: '[link]' },
  { name: 'evmWallet', re: /\b0x[a-f0-9]{40}\b/gi, placeholder: '[wallet]' },
  // This app's own newId() shape (id.mjs): "<prefix>-<base36 timestamp>-<8 hex chars>" - trade/
  // session/pattern/order ids all look exactly like this.
  { name: 'appEntityId', re: /\b[a-z]+-[0-9a-z]{6,12}-[0-9a-f]{8}\b/gi, placeholder: '[id]' },
  { name: 'uuid', re: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, placeholder: '[id]' },
  // A long, unbroken run of letters+digits (an API key, an order confirmation code, a wallet seed
  // fragment) - deliberately requires BOTH a letter and a digit so an ordinary long word is never
  // caught by this fallback.
  { name: 'opaqueToken', re: /\b(?=[a-z0-9]*[a-z])(?=[a-z0-9]*[0-9])[a-z0-9]{20,}\b/gi, placeholder: '[token]' },
  // Phone numbers - a run of 7+ digits, optionally grouped with spaces/dashes/parens, with an
  // optional leading +. Requires a digit-heavy run so it never fires on an ordinary short number
  // like a lot size or a price the user actually meant to keep.
  { name: 'phone', re: /(?:\+?\d[\d\s().-]{6,}\d)/g, placeholder: '[phone]' }
];

function normalizeCharVariants(text) {
  let out = text;
  for (const [from, to] of Object.entries(DIGIT_MAP)) out = out.split(from).join(to);
  for (const [from, to] of Object.entries(CHAR_VARIANT_MAP)) out = out.split(from).join(to);
  return out;
}

function stripFillers(text) {
  let out = text;
  LEADING_FILLERS.forEach((re) => { out = out.replace(re, ''); });
  TRAILING_FILLERS.forEach((re) => { out = out.replace(re, ''); });
  return out;
}

// Turns raw utterance text into the safe, storable normalizedPhrase. Returns both the result and
// whether anything was actually redacted, so a caller (the Learned Commands dashboard, section 10)
// can show the user an honest "we removed something that looked sensitive" note rather than
// silently altering their phrase with no explanation.
export function normalizeLearnedPhrase(raw) {
  const original = String(raw == null ? '' : raw).trim();
  if (!original) return { normalizedPhrase: '', redacted: false };
  // Case-fold first (a no-op for Persian/Arabic script, which has no case) - "Log this trade" and
  // "log THIS trade" must resolve to the exact same stored phrase for matching to ever work.
  let text = original.replace(/\s+/g, ' ').toLowerCase();
  text = normalizeCharVariants(text);
  text = stripFillers(text).trim();
  let redacted = false;
  REDACTIONS.forEach(({ re, placeholder }) => {
    if (re.test(text)) redacted = true;
    re.lastIndex = 0; // re is reused with /g - reset before the real replace pass below
    text = text.replace(re, placeholder);
  });
  text = text.replace(/\s+/g, ' ').trim().replace(/[.!?،؛;,]+$/, '').trim();
  return { normalizedPhrase: text.slice(0, 200), redacted };
}

// Defense-in-depth for the "never persist a permanent entity id as a phrase preference" rule
// (section 4) - the CLIENT is responsible for only ever constructing safe field-mapping values
// (a small sentinel like ACTIVE_OPEN_TRADE, or a genuine scalar like "XAUUSD"/"high" the user
// actually said), never a raw database id; this is the server-side backstop that rejects a value
// shaped like one anyway, the same "don't just trust the caller" posture repo.pg.mjs already
// applies everywhere else (e.g. normalizeRules(), normalizeInstrumentCode()).
const OPAQUE_ID_PATTERNS = [
  /^[a-z]+-[0-9a-z]{6,12}-[0-9a-f]{8}$/i, // this app's own newId() shape
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, // uuid
  /^(?=[a-z0-9]*[a-z])(?=[a-z0-9]*[0-9])[a-z0-9]{20,}$/i // long opaque alnum token
];
export function looksLikeOpaqueId(value) {
  if (typeof value !== 'string') return false;
  const text = value.trim();
  return OPAQUE_ID_PATTERNS.some((re) => re.test(text));
}

export const SAFE_TARGET_STRATEGIES = ['active_open_trade', 'currently_open_session', 'most_recent_matching_entity', 'ask_when_multiple'];
export const MAX_FIELD_VALUE_LEN = 200;

// Voice Command Learning Profile addendum, section 4: a CLOSED schema for fieldMappings - reject
// the whole write (never silently drop the offending field and keep the rest) the instant any one
// entry violates the policy, so a crafted request can never partially succeed with an unsafe
// mapping. `allowedKeys` is the action's own reusableFields allowlist
// (server/db/action-learnability.mjs, mechanically derived from its real requiredFields/
// optionalFields minus its own gateField) - never a second, hand-typed per-field list here.
export class FieldMappingValidationError extends Error {
  constructor(reason) { super('INVALID_FIELD_MAPPING:' + reason); this.reason = reason; }
}
export function validateFieldMappingsStrict(raw, allowedKeys) {
  if (raw == null) return {};
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new FieldMappingValidationError('not_an_object');
  const allowedSet = new Set(allowedKeys || []);
  const out = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!allowedSet.has(key)) throw new FieldMappingValidationError('field_not_allowed:' + key);
    if (value === null || value === undefined) continue; // omitting/clearing a field is harmless
    if (typeof value === 'object') throw new FieldMappingValidationError('nested_value_not_allowed:' + key);
    const text = String(value);
    if (text.length > MAX_FIELD_VALUE_LEN) throw new FieldMappingValidationError('value_too_long:' + key);
    if (looksLikeOpaqueId(text)) throw new FieldMappingValidationError('opaque_id_not_allowed:' + key);
    out[key] = text;
  }
  return out;
}

// Section 4: targetStrategy is a fixed, closed enum - reject (never silently null it out) an
// unsupported value, the same "reject, don't guess" posture as validateFieldMappingsStrict above.
export function validateTargetStrategy(value) {
  if (value === null || value === undefined) return null;
  if (SAFE_TARGET_STRATEGIES.indexOf(value) === -1) throw new FieldMappingValidationError('unsupported_target_strategy:' + value);
  return value;
}

// --- 2. Deterministic confidence/correction policy (section 8) -----------------------------

export const CONFIDENCE_MIN = 0;
export const CONFIDENCE_MAX = 100;
export const CONFIDENCE_NEW = 60; // a fresh, explicitly-approved mapping starts "trusted enough to use, not yet proven" - never 100 on the very first approval
export const CONFIDENCE_SUCCESS_STEP = 10;
export const CONFIDENCE_CORRECTION_STEP = 25;
// "correction thresholds that disable mappings" (section 8) - two corrections against the same
// mapping (regardless of how many prior successes) means it is no longer trustworthy enough to
// keep auto-applying; the user can still see and manually re-enable it from the Learned Commands
// dashboard (section 10).
export const CORRECTION_DISABLE_THRESHOLD = 2;

function clampConfidence(n) { return Math.max(CONFIDENCE_MIN, Math.min(CONFIDENCE_MAX, n)); }

// outcome: 'success' (the learned mapping was used and the user did not correct it) or
// 'correction' (the user pushed back on it this time). Returns the next {confidence, enabled} -
// pure and auditable: every change is one fixed step for one fixed, named reason, never a
// black-box score a support conversation could not explain.
export function applyLearnedCommandOutcome(current, outcome) {
  const confidence = clampConfidence(Number.isFinite(current.confidence) ? current.confidence : CONFIDENCE_NEW);
  const successCount = Number.isFinite(current.successCount) ? current.successCount : 0;
  const correctionCount = Number.isFinite(current.correctionCount) ? current.correctionCount : 0;
  if (outcome === 'success') {
    return { confidence: clampConfidence(confidence + CONFIDENCE_SUCCESS_STEP), successCount: successCount + 1, correctionCount, enabled: current.enabled !== false };
  }
  if (outcome === 'correction') {
    const nextCorrectionCount = correctionCount + 1;
    const nextConfidence = clampConfidence(confidence - CONFIDENCE_CORRECTION_STEP);
    const enabled = nextCorrectionCount < CORRECTION_DISABLE_THRESHOLD && nextConfidence > CONFIDENCE_MIN;
    return { confidence: nextConfidence, successCount, correctionCount: nextCorrectionCount, enabled };
  }
  return { confidence, successCount, correctionCount, enabled: current.enabled !== false };
}
