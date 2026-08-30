// Journey H2 expressive-dialogue follow-up: the one, small, admin-authoring-time-only LLM call
// this gate adds - "Enhance Delivery" turns a scenario's canonical spoken dialogue into an
// ElevenLabs-tagged performance script. Deliberately NOT a new pattern-ai-server.mjs endpoint or a
// new community-api -> pattern-ai internal-secret bridge (community-api has never called that
// process before this gate, and inventing that direction is exactly the class of new cross-service
// wiring that caused this feature area's last production incident - see the Dockerfile fix's own
// commit). Instead this calls OpenAI directly, the same way pattern-ai-server.mjs's own
// callOpenAI() does (Responses API, `text.format` json_schema, strict:true) - a small, deliberate
// duplication of that one call shape, not a shared import, since pattern-ai-server.mjs is a
// standalone process entrypoint (importing it would execute its own http.createServer() listen
// call), consistent with this repo's own "kept in sync by inspection, not a shared module"
// precedent for genuinely un-shareable code.
//
// The admin-configured OpenAI key (`repo.adminKeys.get('openai')`, already read directly by other
// server/admin/*.mjs routes) is the ONLY key source - community-api has no OPENAI_API_KEY env
// fallback at all (that only exists on pattern-ai's own env), so an unconfigured admin key fails
// loudly (see routes.conversation-scenarios.mjs's own 400 on this), never silently falling back to
// a different provider.

import { ApiError } from './errors.mjs';
import { SUPPORTED_AUDIO_TAGS, CAUTION_DOMAINS } from './performance-text.mjs';

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const TIMEOUT_MS = 30000;
const ENHANCE_MODEL = 'gpt-5.6';

// Mirrors pattern-ai-server.mjs's own outputText() exactly (not imported - see this file's own
// header on why) - prefers the Responses API's convenience `output_text` field, else scans
// output[].content[].text.
function outputText(result) {
  if (typeof result.output_text === 'string') return result.output_text;
  for (const item of result.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === 'string') return content.text;
    }
  }
  return null;
}

const RESPONSE_FORMAT = {
  type: 'json_schema',
  name: 'enhanced_delivery',
  strict: true,
  schema: {
    type: 'object', additionalProperties: false,
    properties: { performanceText: { type: 'string' } },
    required: ['performanceText']
  }
};

// Spec section 8's own prompt contract, verbatim in intent. Section 9: a scenario in one of the
// small CAUTION_DOMAINS list gets an extra line steering the model away from playful/laughter
// tags - a deterministic instruction, never a runtime policy engine.
function buildPrompt({ canonicalSpokenText, language, scenarioTitle, domain, contextLabel, deliveryNote }) {
  const caution = domain && CAUTION_DOMAINS.indexOf(String(domain).toLowerCase()) !== -1;
  const lines = [
    'You enhance dialogue for expressive speech.',
    'Preserve every spoken word and the original meaning.',
    'Do not add new dialogue, facts, trading claims, advice, or a call-to-action that did not exist.',
    'Do not remove any dialogue, and do not rewrite the meaning or reorder the sentence.',
    `Only add these supported vocal audio tags, in square brackets, where they genuinely help: ${SUPPORTED_AUDIO_TAGS.join(', ')}.`,
    'Use non-verbal cues sparingly. Do not add visual or stage directions. Do not add sound effects.',
    'The result must sound natural when spoken aloud.',
    'Return only the enhanced dialogue text as the performanceText field - nothing else.',
    `Language: ${language}.`,
    scenarioTitle ? `Scenario: ${scenarioTitle}.` : null,
    contextLabel ? `Dialogue context: ${contextLabel}.` : null,
    deliveryNote ? `Admin delivery note: ${deliveryNote}.` : null,
    caution ? 'This is a sensitive/serious scenario domain - never use [laughs] or [excited]; keep delivery calm and measured.' : null,
    '',
    'Canonical spoken dialogue (enhance this exact text, do not paraphrase):',
    canonicalSpokenText
  ].filter((line) => line !== null);
  return lines.join('\n');
}

// Returns the raw model output ({performanceText}) - the caller (routes.conversation-scenarios.mjs)
// is responsible for running it through validatePerformanceText() before ever showing it to the
// admin as a good suggestion; this function itself makes no eligibility/validity judgment.
export async function generatePerformanceText(apiKey, params) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: ENHANCE_MODEL,
        input: [{ role: 'user', content: buildPrompt(params) }],
        text: { format: RESPONSE_FORMAT }
      }),
      signal: controller.signal
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new ApiError(502, 'ENHANCE_DELIVERY_PROVIDER_FAILED', body.error?.message || `OPENAI_${response.status}`);
    const text = outputText(body);
    if (!text) throw new ApiError(502, 'ENHANCE_DELIVERY_PROVIDER_FAILED', 'No output text returned.');
    const parsed = JSON.parse(text);
    return { performanceText: String(parsed.performanceText || '') };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error.name === 'AbortError') throw new ApiError(504, 'ENHANCE_DELIVERY_TIMEOUT');
    throw new ApiError(502, 'ENHANCE_DELIVERY_PROVIDER_FAILED', error.message);
  } finally {
    clearTimeout(timer);
  }
}
