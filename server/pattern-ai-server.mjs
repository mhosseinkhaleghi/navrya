import http from 'node:http';

const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || process.env.PATTERN_AI_PORT || 8787);
const maxBodyBytes = 100 * 1024 * 1024;

// Shared-secret gate for the public preview deploy - BASIC_AUTH_USER/PASS are unset in local
// dev (checkBasicAuth then always passes), and set as Render env vars once a real link is
// handed to testers/investors, since neither server has real user authentication yet.
function checkBasicAuth(request) {
  const user = process.env.BASIC_AUTH_USER;
  const pass = process.env.BASIC_AUTH_PASS;
  if (!user || !pass) return true;
  const header = request.headers['authorization'] || '';
  const [scheme, encoded] = header.split(' ');
  if (scheme !== 'Basic' || !encoded) return false;
  const decoded = Buffer.from(encoded, 'base64').toString('utf8');
  const sep = decoded.indexOf(':');
  if (sep === -1) return false;
  return decoded.slice(0, sep) === user && decoded.slice(sep + 1) === pass;
}

function requireBasicAuth(response) {
  response.writeHead(401, {
    'WWW-Authenticate': 'Basic realm="TradeJournal"',
    'Content-Type': 'application/json; charset=utf-8'
  });
  response.end(JSON.stringify({ error: 'UNAUTHORIZED' }));
}

const languageNames = { fa: 'Persian (Farsi)', ar: 'Arabic', en: 'English', es: 'Spanish' };

// Multi-provider gateway (A1). `openai` remains the default for every existing endpoint -
// the three browser AI clients (pattern-registry-ai.js, strategy-education-ai.js,
// mental-health-ai.js) never send a `provider` field, so they keep hitting OpenAI exactly
// as before. Only the new dock/gateway routes let the client pick a different provider.
const providerEnvKey = { openai: 'OPENAI_API_KEY', anthropic: 'ANTHROPIC_API_KEY', kimi: 'KIMI_API_KEY', deepseek: 'DEEPSEEK_API_KEY' };
const providerEnvModel = { openai: 'OPENAI_MODEL', anthropic: 'ANTHROPIC_MODEL', kimi: 'KIMI_MODEL', deepseek: 'DEEPSEEK_MODEL' };
const providerDefaultModel = { openai: 'gpt-5.6', anthropic: 'claude-sonnet-4-5', kimi: 'moonshot-v1-8k', deepseek: 'deepseek-chat' };

function resolveProviderName(provider) {
  return Object.prototype.hasOwnProperty.call(providerEnvKey, provider) ? provider : 'openai';
}

// Bridge to the admin panel's server-side AI keys (server/admin/) WITHOUT giving this
// deliberately DB-free gateway a direct Postgres dependency: a small internal HTTP call to
// the Community API's own /internal/admin-ai-keys route (protected by a shared secret, not
// user auth), cached in memory for 60s. On any failure (Community API not running, network
// error, etc.) this soft-fails to the last-known-good cache (or an empty result on first
// failure) - an admin-configured key simply isn't seen until the Community API is reachable
// again, but the per-request override and .env fallback tiers below keep working regardless.
let adminKeyCache = { data: null, fetchedAt: 0 };
const ADMIN_KEY_CACHE_TTL_MS = 60000;
async function adminKeys() {
  if (Date.now() - adminKeyCache.fetchedAt < ADMIN_KEY_CACHE_TTL_MS) return adminKeyCache.data || {};
  try {
    const url = (process.env.COMMUNITY_API_URL || 'http://127.0.0.1:8788') + '/internal/admin-ai-keys';
    const headers = process.env.INTERNAL_API_SECRET ? { 'x-internal-secret': process.env.INTERNAL_API_SECRET } : {};
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(3000) });
    adminKeyCache = { data: response.ok ? await response.json() : null, fetchedAt: Date.now() };
  } catch (_) {
    adminKeyCache = { data: adminKeyCache.data, fetchedAt: Date.now() };
  }
  return adminKeyCache.data || {};
}

function json(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Cache-Control': 'no-store'
  });
  response.end(JSON.stringify(body));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBodyBytes) {
        reject(new Error('REQUEST_TOO_LARGE'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch { reject(new Error('INVALID_JSON')); }
    });
    request.on('error', reject);
  });
}

function outputText(result) {
  if (typeof result.output_text === 'string') return result.output_text;
  for (const item of result.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === 'string') return content.text;
    }
  }
  throw new Error('EMPTY_MODEL_RESPONSE');
}

function imageContent(images) {
  return (Array.isArray(images) ? images : [])
    .filter((value) => typeof value === 'string' && value.startsWith('data:image/'))
    .slice(0, 6)
    .map((imageUrl) => ({ type: 'input_image', image_url: imageUrl, detail: 'high' }));
}

function assertRequiredKeys(data, schema) {
  const required = (schema && schema.required) || [];
  for (const key of required) {
    if (!(key in data)) throw new Error('SCHEMA_VALIDATION_FAILED');
  }
}

function patternContext(body) {
  return JSON.stringify({
    name: String(body.name || ''),
    description: String(body.description || ''),
    completionThreshold: Number(body.completionThreshold || 70),
    stages: Array.isArray(body.stages) ? body.stages : []
  });
}

function strategyEducationContext(body) {
  const position = body.positionManagement || {};
  const risk = body.riskManagement || {};
  const framework = body.overallFramework || {};
  return JSON.stringify({
    positionManagement: {
      entryRules: String(position.entryRules || ''),
      stopLossRules: String(position.stopLossRules || ''),
      exitTargetRules: String(position.exitTargetRules || ''),
      positionSizingRules: String(position.positionSizingRules || ''),
      freeNotes: String(position.freeNotes || ''),
      attachmentNotes: (position.attachments || []).map((file) => ({ fileName: file.fileName, note: file.note }))
    },
    riskManagement: {
      maxRiskPerTradePercent: risk.maxRiskPerTradePercent ?? null,
      dailyDrawdownLimitPercent: risk.dailyDrawdownLimitPercent ?? null,
      totalDrawdownLimitPercent: risk.totalDrawdownLimitPercent ?? null,
      maxConcurrentTrades: risk.maxConcurrentTrades ?? null,
      maxProfitCapPerTrade: risk.maxProfitCapPerTrade ?? null,
      freeNotes: String(risk.freeNotes || ''),
      attachmentNotes: (risk.attachments || []).map((file) => ({ fileName: file.fileName, note: file.note }))
    },
    overallFramework: {
      description: String(framework.description || ''),
      attachmentNotes: (framework.attachments || []).map((file) => ({ fileName: file.fileName, note: file.note }))
    }
  });
}

function strategyAttachmentContent(attachments) {
  return (Array.isArray(attachments) ? attachments : []).slice(0, 15).flatMap((file) => {
    const category = String(file.category || '');
    const note = String(file.note || '');
    const label = { type: 'input_text', text: `Reference file category: ${category}; filename: ${String(file.fileName || '')}; note: ${note}` };
    const dataUrl = typeof file.dataUrl === 'string' ? file.dataUrl : '';
    if (dataUrl.startsWith('data:image/')) return [label, { type: 'input_image', image_url: dataUrl, detail: 'high' }];
    if (dataUrl.startsWith('data:application/pdf')) return [label, { type: 'input_file', filename: String(file.fileName || 'reference.pdf'), file_data: dataUrl }];
    return [label];
  });
}

// --- Per-provider callers. Each returns { data, usage } where `data` is the
// schema-conformant parsed object and `usage` is { promptTokens, completionTokens, totalTokens }
// (fields left null when a provider doesn't report them - never estimated/fabricated). ---

async function callOpenAI(payload, apiKey, model) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(Object.assign({}, payload, { model })),
      signal: controller.signal
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error?.message || `OPENAI_${response.status}`);
    const data = JSON.parse(outputText(result));
    const usage = result.usage ? {
      promptTokens: result.usage.input_tokens ?? null,
      completionTokens: result.usage.output_tokens ?? null,
      totalTokens: result.usage.total_tokens ?? null
    } : { promptTokens: null, completionTokens: null, totalTokens: null };
    return { data, usage };
  } finally {
    clearTimeout(timer);
  }
}

// Anthropic has no strict-JSON-schema response mode on the general endpoint, so structured
// output is obtained via forced tool-use: one tool built from the same schema, tool_choice
// pinned to it. The tool_use block's `input` is already parsed JSON. Required-key validation
// is still run as a safety net since tool-use is reliable but not byte-identical-strict.
async function callAnthropic(payload, apiKey, model) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  try {
    const systemItem = payload.input.find((item) => item.role === 'system');
    const systemText = systemItem ? systemItem.content.map((part) => part.text || '').join('\n') : '';
    const messages = payload.input.filter((item) => item.role !== 'system').map((item) => ({
      role: item.role,
      content: item.content.map((part) => {
        if (part.type === 'input_text') return { type: 'text', text: part.text };
        if (part.type === 'input_image') {
          const match = /^data:([^;]+);base64,(.+)$/.exec(part.image_url || '');
          if (!match) return { type: 'text', text: '[image omitted]' };
          return { type: 'image', source: { type: 'base64', media_type: match[1], data: match[2] } };
        }
        return { type: 'text', text: '' };
      })
    }));
    const schema = payload.text.format.schema;
    const toolName = payload.text.format.name;
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        system: systemText,
        messages,
        tools: [{ name: toolName, description: 'Return the structured result.', input_schema: schema }],
        tool_choice: { type: 'tool', name: toolName }
      }),
      signal: controller.signal
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error?.message || `ANTHROPIC_${response.status}`);
    const toolUse = (result.content || []).find((block) => block.type === 'tool_use');
    if (!toolUse) throw new Error('EMPTY_MODEL_RESPONSE');
    const data = toolUse.input || {};
    assertRequiredKeys(data, schema);
    const usage = result.usage ? {
      promptTokens: result.usage.input_tokens ?? null,
      completionTokens: result.usage.output_tokens ?? null,
      totalTokens: (typeof result.usage.input_tokens === 'number' && typeof result.usage.output_tokens === 'number')
        ? result.usage.input_tokens + result.usage.output_tokens : null
    } : { promptTokens: null, completionTokens: null, totalTokens: null };
    return { data, usage };
  } finally {
    clearTimeout(timer);
  }
}

const compatibleBaseUrl = { kimi: 'https://api.moonshot.cn/v1/chat/completions', deepseek: 'https://api.deepseek.com/chat/completions' };

// Kimi and DeepSeek are OpenAI-compatible chat-completions APIs. Neither offers strict
// JSON-schema enforcement (only response_format:{type:'json_object'}, a valid-JSON guarantee,
// not a schema-conformance one) - compensated by instructing the required keys in-prompt and
// validating after parse. Kimi's vision-capable models accept image_url parts; DeepSeek's
// chat model has no vision support, so images are dropped with an honest in-text note rather
// than silently ignored.
async function callOpenAICompatible(provider, payload, apiKey, model) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  try {
    const schema = payload.text.format.schema;
    const requiredKeys = schema.required || [];
    const supportsVision = provider === 'kimi';
    const lastIndex = payload.input.length - 1;
    const messages = payload.input.map((item, index) => {
      const textParts = [];
      const imageParts = [];
      item.content.forEach((part) => {
        if (part.type === 'input_text') textParts.push(part.text);
        else if (part.type === 'input_image' && supportsVision) imageParts.push({ type: 'image_url', image_url: { url: part.image_url } });
      });
      const droppedHere = !supportsVision ? item.content.filter((part) => part.type === 'input_image').length : 0;
      let text = textParts.join('\n');
      if (index === lastIndex) {
        text += `\n\nRespond with a single JSON object containing exactly these keys: ${requiredKeys.join(', ')}. Output only JSON, no explanation.`;
        if (droppedHere > 0) text += `\n\n(${droppedHere} image(s) were attached but are not supported by this provider.)`;
      }
      if (imageParts.length) return { role: item.role, content: [{ type: 'text', text }, ...imageParts] };
      return { role: item.role, content: text };
    });
    const response = await fetch(compatibleBaseUrl[provider], {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, response_format: { type: 'json_object' } }),
      signal: controller.signal
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error?.message || `${provider.toUpperCase()}_${response.status}`);
    const content = result.choices?.[0]?.message?.content;
    if (!content) throw new Error('EMPTY_MODEL_RESPONSE');
    const data = JSON.parse(content);
    assertRequiredKeys(data, schema);
    const usage = result.usage ? {
      promptTokens: result.usage.prompt_tokens ?? null,
      completionTokens: result.usage.completion_tokens ?? null,
      totalTokens: result.usage.total_tokens ?? null
    } : { promptTokens: null, completionTokens: null, totalTokens: null };
    return { data, usage };
  } finally {
    clearTimeout(timer);
  }
}

// The single entry point every handler below calls instead of callOpenAI directly.
// Resolves provider -> API key (client override for this call only, else an admin-configured
// key from the Community API if one has been set, else server env default) -> model (client
// override, else provider env default, else hardcoded default), dispatches to the matching
// per-provider caller, and returns a normalized envelope.
async function callProvider(providerInput, apiKeyOverride, modelOverride, payload) {
  const provider = resolveProviderName(providerInput);
  let key = typeof apiKeyOverride === 'string' && apiKeyOverride.trim() ? apiKeyOverride.trim() : '';
  if (!key) {
    const configured = await adminKeys();
    key = (configured && configured[provider]) || '';
  }
  if (!key) key = process.env[providerEnvKey[provider]] || '';
  if (!key) throw new Error(providerEnvKey[provider] + '_MISSING');
  const model = (typeof modelOverride === 'string' && modelOverride.trim())
    ? modelOverride.trim()
    : (process.env[providerEnvModel[provider]] || providerDefaultModel[provider]);
  const outcome = provider === 'openai' ? await callOpenAI(payload, key, model)
    : provider === 'anthropic' ? await callAnthropic(payload, key, model)
    : await callOpenAICompatible(provider, payload, key, model);
  return { data: outcome.data, usage: outcome.usage, provider, model };
}

const stageFormat = {
  type: 'json_schema',
  name: 'pattern_stage_result',
  strict: true,
  schema: {
    type: 'object', additionalProperties: false,
    properties: { stages: { type: 'array', minItems: 1, maxItems: 12, items: { type: 'string' } } },
    required: ['stages']
  }
};

const chatFormat = {
  type: 'json_schema',
  name: 'pattern_training_chat',
  strict: true,
  schema: {
    type: 'object', additionalProperties: false,
    properties: {
      reply: { type: 'string' },
      suggestedStages: { type: 'array', maxItems: 12, items: { type: 'string' } }
    },
    required: ['reply', 'suggestedStages']
  }
};

const strategySummaryProperties = {
  positionManagement: { type: 'string' },
  riskManagement: { type: 'string' },
  overallFramework: { type: 'string' }
};

const strategySummaryFormat = {
  type: 'json_schema',
  name: 'strategy_education_summary',
  strict: true,
  schema: {
    type: 'object', additionalProperties: false,
    properties: { summary: { type: 'object', additionalProperties: false, properties: strategySummaryProperties, required: ['positionManagement', 'riskManagement', 'overallFramework'] } },
    required: ['summary']
  }
};

const strategyChatFormat = {
  type: 'json_schema',
  name: 'strategy_education_chat',
  strict: true,
  schema: {
    type: 'object', additionalProperties: false,
    properties: {
      reply: { type: 'string' },
      summary: { type: 'object', additionalProperties: false, properties: strategySummaryProperties, required: ['positionManagement', 'riskManagement', 'overallFramework'] },
      suggestions: {
        type: 'array', maxItems: 12,
        items: {
          type: 'object', additionalProperties: false,
          properties: {
            path: { type: 'string', enum: ['positionManagement.entryRules', 'positionManagement.stopLossRules', 'positionManagement.exitTargetRules', 'positionManagement.positionSizingRules', 'positionManagement.freeNotes', 'riskManagement.maxRiskPerTradePercent', 'riskManagement.dailyDrawdownLimitPercent', 'riskManagement.totalDrawdownLimitPercent', 'riskManagement.maxConcurrentTrades', 'riskManagement.maxProfitCapPerTrade', 'riskManagement.freeNotes', 'overallFramework.description'] },
            value: { type: 'string' },
            mode: { type: 'string', enum: ['append', 'replace'] }
          },
          required: ['path', 'value', 'mode']
        }
      }
    },
    required: ['reply', 'summary', 'suggestions']
  }
};

const strategyFromEventFormat = {
  type: 'json_schema',
  name: 'strategy_from_event',
  strict: true,
  schema: {
    type: 'object', additionalProperties: false,
    properties: {
      name: { type: 'string' },
      overallFramework: { type: 'string' },
      entryRules: { type: 'string' },
      stopLossRules: { type: 'string' },
      exitTargetRules: { type: 'string' },
      validationPlan: { type: 'string' },
      predictedOutcome: { type: 'string' }
    },
    required: ['name', 'overallFramework', 'entryRules', 'stopLossRules', 'exitTargetRules', 'validationPlan', 'predictedOutcome']
  }
};

const psychologyFormat = {
  type: 'json_schema',
  name: 'trade_psychology_analysis',
  strict: true,
  schema: {
    type: 'object', additionalProperties: false,
    properties: {
      summary: { type: 'string' },
      insights: {
        type: 'array', maxItems: 8,
        items: {
          type: 'object', additionalProperties: false,
          properties: {
            title: { type: 'string' }, evidence: { type: 'string' },
            recommendation: { type: 'string' }, confidence: { type: 'number', minimum: 0, maximum: 1 }
          },
          required: ['title', 'evidence', 'recommendation', 'confidence']
        }
      },
      correlations: {
        type: 'array', maxItems: 12,
        items: {
          type: 'object', additionalProperties: false,
          properties: { factor: { type: 'string' }, outcome: { type: 'string' }, observation: { type: 'string' } },
          required: ['factor', 'outcome', 'observation']
        }
      },
      triggers: {
        type: 'array', maxItems: 6,
        items: {
          type: 'object', additionalProperties: false,
          properties: {
            type: { type: 'string', enum: ['time_of_day', 'day_of_week', 'gap_since_last_trade', 'entry_mode', 'emotion_repeat'] },
            condition: { type: 'string' }, observation: { type: 'string' }, confidence: { type: 'number', minimum: 0, maximum: 1 }
          },
          required: ['type', 'condition', 'observation', 'confidence']
        }
      },
      sampleSize: { type: 'integer', minimum: 0 }
    },
    required: ['summary', 'insights', 'correlations', 'triggers', 'sampleSize']
  }
};

const mentalHealthPaths = [
  'baseline.initialStressLevel', 'baseline.initialEmotionalRegulation', 'baseline.tradingExperienceYears', 'baseline.selfReportedWeaknesses',
  'cognitiveProfile.draftThoughtRecord.automaticThought', 'cognitiveProfile.draftThoughtRecord.emotion', 'cognitiveProfile.draftThoughtRecord.evidenceFor', 'cognitiveProfile.draftThoughtRecord.evidenceAgainst', 'cognitiveProfile.draftThoughtRecord.balancedThought',
  'triggerProfile.draftTrigger.description', 'triggerProfile.draftTrigger.triggerType', 'triggerProfile.draftTrigger.recommendedAction',
  // v2 intake fields (Therapist-Model Intake) - same draft-then-approve mechanism, just a wider allowlist.
  'intake.demographics.maritalStatus', 'intake.demographics.primaryOccupation', 'intake.demographics.isFullTimeTrader', 'intake.demographics.age', 'intake.demographics.gender',
  'intake.financialContext.capitalType', 'intake.financialContext.capitalAllocationPercent', 'intake.financialContext.borrowedMoneyForTrading',
  'intake.tradingHistory.yearsTrading', 'intake.tradingHistory.marketsTraded',
  'intake.motivationForTrading', 'intake.firstBigLossReaction',
  'intake.transparencyMatrix.profitKnownToFamily', 'intake.transparencyMatrix.lossKnownToFamily', 'intake.transparencyMatrix.capitalKnownToFamily', 'intake.transparencyMatrix.tradingActivityKnownToFamily',
  'psychologicalProfile.scenarioAssessment.draftResponse.choice', 'psychologicalProfile.scenarioAssessment.draftResponse.sliderValue', 'psychologicalProfile.scenarioAssessment.draftResponse.freeText'
];

const mentalHealthChatFormat = {
  type: 'json_schema', name: 'mental_health_chat', strict: true,
  schema: {
    type: 'object', additionalProperties: false,
    properties: {
      reply: { type: 'string' },
      distressFlag: { type: 'boolean' },
      suggestions: {
        type: 'array', maxItems: 8,
        items: {
          type: 'object', additionalProperties: false,
          properties: {
            path: { type: 'string', enum: mentalHealthPaths },
            value: { type: 'string' },
            section: { type: 'string' },
            mode: { type: 'string', enum: ['append', 'replace'] }
          },
          required: ['path', 'value', 'section', 'mode']
        }
      }
    },
    required: ['reply', 'distressFlag', 'suggestions']
  }
};

const educationCardFormat = {
  type: 'json_schema', name: 'mental_health_education_card', strict: true,
  schema: {
    type: 'object', additionalProperties: false,
    properties: {
      title: { type: 'string' },
      explanation: { type: 'string' },
      whyItMattersForYou: { type: 'string' },
      practicalSteps: { type: 'array', maxItems: 6, items: { type: 'string' } },
      imagePrompt: { type: 'string' }
    },
    required: ['title', 'explanation', 'whyItMattersForYou', 'practicalSteps', 'imagePrompt']
  }
};

const tradeAnalysisFormat = {
  type: 'json_schema', name: 'trade_chart_analysis', strict: true,
  schema: {
    type: 'object', additionalProperties: false,
    properties: {
      summary: { type: 'string' },
      observations: { type: 'array', maxItems: 8, items: { type: 'string' } },
      warnings: { type: 'array', maxItems: 6, items: { type: 'string' } }
    },
    required: ['summary', 'observations', 'warnings']
  }
};

// A1: provider-agnostic general chat for the global dock (A3/A6, therapist-mode OFF).
// When an open registered process is supplied, the suggestions.path enum is built
// dynamically from that process's own allowlist - same mechanism as mentalHealthPaths
// above, just client-supplied, consistent with this app's local-first trust model.
function dockChatFormatFor(activeProcess) {
  const properties = { reply: { type: 'string' } };
  const required = ['reply'];
  if (activeProcess) {
    properties.suggestions = {
      type: 'array', maxItems: 8,
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          path: { type: 'string', enum: activeProcess.allowlist },
          value: { type: 'string' },
          mode: { type: 'string', enum: ['append', 'replace'] }
        },
        required: ['path', 'value', 'mode']
      }
    };
    required.push('suggestions');
  }
  return { type: 'json_schema', name: 'global_dock_chat', strict: true, schema: { type: 'object', additionalProperties: false, properties, required } };
}

// A2: trivial round-trip used by Settings' "Test connection" button.
const testConnectionFormat = {
  type: 'json_schema', name: 'ai_test_connection', strict: true,
  schema: { type: 'object', additionalProperties: false, properties: { ok: { type: 'boolean' } }, required: ['ok'] }
};

// A7: screenshot -> calculator-input field extraction. Deliberately not a reuse of
// analyzeTrade's schema below - that one narrates an EXISTING trade's screenshots for
// commentary, this one extracts numeric fields for a trade that doesn't exist yet.
const tradeFieldsExtractionFormat = {
  type: 'json_schema', name: 'trade_fields_extraction', strict: true,
  schema: {
    type: 'object', additionalProperties: false,
    properties: {
      direction: { type: ['string', 'null'], enum: ['long', 'short', null] },
      entryPrice: { type: ['number', 'null'] },
      stopLoss: { type: ['number', 'null'] },
      takeProfits: { type: 'array', maxItems: 5, items: { type: 'object', additionalProperties: false, properties: { price: { type: 'number' } }, required: ['price'] } },
      leverage: { type: ['number', 'null'] },
      confidence: { type: 'number', minimum: 0, maximum: 1 }
    },
    required: ['direction', 'entryPrice', 'stopLoss', 'takeProfits', 'leverage', 'confidence']
  }
};

async function generateStages(body) {
  const language = languageNames[body.language] || languageNames.en;
  const { data: result, usage, provider, model } = await callProvider(body.provider, body.apiKey, body.model, {
    input: [
      {
        role: 'system',
        content: [{ type: 'input_text', text: `You are a market-pattern analyst. Respond only in ${language}. Analyze the described pattern and its reference images. Extract the movement direction (bullish/bearish), formation sequence, bullish/bearish differences, and decisive validation points. Return an ordered list of short stages, one clear sentence per stage. Do not give trading or financial advice.` }]
      },
      {
        role: 'user',
        content: [
          { type: 'input_text', text: `Pattern context:\n${patternContext(body)}\nAnalyze the reference screenshots together with this context.` },
          ...imageContent(body.images)
        ]
      }
    ],
    text: { format: stageFormat }
  });
  return { stages: result.stages || [], provider, model, usage };
}

async function trainingChat(body) {
  const language = languageNames[body.language] || languageNames.en;
  const history = (Array.isArray(body.chatHistory) ? body.chatHistory : []).slice(-20).map((message) => ({
    role: message.role === 'assistant' ? 'assistant' : 'user',
    content: [{ type: 'input_text', text: String(message.content || '') }]
  }));
  const { data: result, usage, provider, model } = await callProvider(body.provider, body.apiKey, body.model, {
    input: [
      {
        role: 'system',
        content: [{ type: 'input_text', text: `You are an educational assistant helping the user refine one market-pattern definition. Keep all answers tied to the supplied pattern, stages and reference screenshots. Reply in ${language}; if the user's latest message is clearly in another language, reply in that language. When the conversation establishes an improved ordered definition, return it in suggestedStages; otherwise return an empty array. Do not provide personalized financial advice.` }]
      },
      ...history,
      {
        role: 'user',
        content: [
          { type: 'input_text', text: `${String(body.message || '').trim()}\n\nCurrent pattern context:\n${patternContext(body)}` },
          ...imageContent(body.images)
        ]
      }
    ],
    text: { format: chatFormat }
  });
  return { reply: result.reply || '', suggestedStages: result.suggestedStages || [], provider, model, usage };
}

async function summarizeStrategyEducation(body) {
  const language = languageNames[body.language] || languageNames.en;
  const { data: result, usage, provider, model } = await callProvider(body.provider, body.apiKey, body.model, {
    input: [
      {
        role: 'system',
        content: [{ type: 'input_text', text: `You summarize a user's trading-strategy education record. Respond only in ${language}. Keep three layers strictly separate: position execution/management, risk and capital limits, and the overall narrative framework. Never mix these rules with market pattern-recognition rules. Summarize only supplied information, identify empty areas without inventing rules, and do not provide personalized financial advice.` }]
      },
      {
        role: 'user',
        content: [
          { type: 'input_text', text: `Current strategy-education record:\n${strategyEducationContext(body)}` },
          ...strategyAttachmentContent(body.attachments)
        ]
      }
    ],
    text: { format: strategySummaryFormat }
  });
  return { summary: result.summary, provider, model, usage };
}

async function strategyEducationChat(body) {
  const language = languageNames[body.language] || languageNames.en;
  const history = (Array.isArray(body.chatHistory) ? body.chatHistory : []).slice(-24).map((message) => ({
    role: message.role === 'assistant' ? 'assistant' : 'user',
    content: [{ type: 'input_text', text: String(message.content || '') }]
  }));
  const { data: result, usage, provider, model } = await callProvider(body.provider, body.apiKey, body.model, {
    input: [
      {
        role: 'system',
        content: [{ type: 'input_text', text: `You are an educational assistant that learns a user's trading execution and risk framework. Reply in ${language}, or the language of the latest message if clearly different. Keep position management, risk/capital management, and overall framework separate from price-pattern recognition. Extract zero or more precise field suggestions. For numeric fields, return only the exact number as the value string. For text fields, return a complete proposed field value: merge with existing content by default; use mode "replace" only when the user clearly corrects/replaces a rule. Return separate suggestions for separate fields. Suggestions are previews and must never be described as already applied. Summarize the current record in the three summary fields. Do not provide personalized financial advice.` }]
      },
      ...history,
      {
        role: 'user',
        content: [
          { type: 'input_text', text: `${String(body.message || '').trim()}\n\nCurrent strategy-education record:\n${strategyEducationContext(body)}` },
          ...strategyAttachmentContent(body.attachments)
        ]
      }
    ],
    text: { format: strategyChatFormat }
  });
  return { reply: result.reply || '', summary: result.summary, suggestions: result.suggestions || [], provider, model, usage };
}

async function strategyFromEvent(body) {
  const language = languageNames[body.language] || languageNames.en;
  const { data: result, usage, provider, model } = await callProvider(body.provider, body.apiKey, body.model, {
    input: [
      {
        role: 'system',
        content: [{ type: 'input_text', text: `You help a trader turn one observed market event into a testable strategy hypothesis. Respond only in ${language}. Produce a concise strategy name, an overall hypothesis, cautious initial entry/stop/exit rules only when supported by the event, a validation plan explaining how repeated future observations can confirm or invalidate the hypothesis, and the predicted outcome. Treat this as an unconfirmed educational draft, not financial advice.` }]
      },
      {
        role: 'user',
        content: [
          { type: 'input_text', text: `Observed event:\n${String(body.narrative || '').trim()}` },
          ...imageContent(body.images)
        ]
      }
    ],
    text: { format: strategyFromEventFormat }
  });
  return { proposal: result, provider, model, usage };
}

async function psychologyAnalysis(body) {
  const language = languageNames[body.language] || languageNames.en;
  const trades = (Array.isArray(body.trades) ? body.trades : []).filter((trade) => trade && trade.status === 'closed').slice(-500).map((trade) => ({
    id: trade.id, outcome: trade.outcome, pnl: trade.pnl, pnlPercent: trade.pnlPercent,
    direction: trade.direction, session: trade.session, primaryTimeframe: trade.primaryTimeframe,
    conceptTags: trade.conceptTags || [], linkedPatternIds: trade.linkedPatternIds || [], linkedStrategyId: trade.linkedStrategyId || null,
    entryMode: trade.entryMode, emotionLog: (trade.emotionLog || []).map((entry) => ({
      stage: entry.stage, dominantEmotions: entry.dominantEmotions || [], stressLevel: entry.stressLevel,
      focusQuality: entry.focusQuality, planCommitment: entry.planCommitment,
      wouldTakeIfNotForced: entry.wouldTakeIfNotForced, note: entry.note || '',
      emotionTags: (entry.emotionDetails || []).flatMap((detail) => detail.tags || [])
    }))
  }));
  if (!trades.length) throw new Error('NO_CLOSED_TRADES');
  const { data: result, usage, provider, model } = await callProvider(body.provider, body.apiKey, body.model, {
    input: [
      {
        role: 'system',
        content: [{ type: 'input_text', text: `You are a trading-journal psychology analyst. Respond only in ${language}. Analyze behavioral associations in the supplied closed-trade records, especially stress, focus, plan commitment, repeated emotions, and the user's own self-written emotionTags (short reasons/causes they attached to a logged emotion, e.g. "fear of loss") against actual outcomes. Distinguish correlation from causation, state when the sample is small, never invent statistics, and provide educational process-improvement observations rather than financial advice. Additionally, look for recurring behavioral triggers tied to time of day, day of week, the gap since the previous trade, entry mode, a repeated emotion, or a repeated emotionTag; return each as a trigger only when the pattern is genuinely supported by the data, and return an empty triggers array rather than inventing one when nothing reliable stands out.` }]
      },
      { role: 'user', content: [{ type: 'input_text', text: `Closed trade records:\n${JSON.stringify(trades)}` }] }
    ],
    text: { format: psychologyFormat }
  });
  return { ...result, sampleSize: trades.length, provider, model, usage };
}

function mentalHealthContext(body) {
  const context = body.context || {};
  return JSON.stringify({
    baselineCompleted: !!context.baselineCompleted,
    baselineSummary: context.baselineSummary || {},
    activeBiases: context.activeBiases || [],
    recentTriggers: context.recentTriggers || [],
    draftThoughtRecord: context.draftThoughtRecord || {},
    draftTrigger: context.draftTrigger || {},
    intakeCompleted: !!context.intakeCompleted,
    intakeSummary: context.intakeSummary || {},
    draftScenarioResponse: context.draftScenarioResponse || {}
  });
}

async function mentalHealthChat(body) {
  const language = languageNames[body.language] || languageNames.en;
  const history = (Array.isArray(body.chatHistory) ? body.chatHistory : []).slice(-24).map((message) => ({
    role: message.role === 'assistant' ? 'assistant' : 'user',
    content: [{ type: 'input_text', text: String(message.content || '') }]
  }));
  const { data: result, usage, provider, model } = await callProvider(body.provider, body.apiKey, body.model, {
    input: [
      {
        role: 'system',
        content: [{ type: 'input_text', text: `You are a supportive assistant inside a trading journal's self-reflection tool. Respond only in ${language}. This is not therapy and you are not a clinician: never diagnose, never use clinical or medical labels, never claim therapeutic authority. Describe only observable trading behavior in plain, non-pathologizing language. If the user's message suggests they may be in serious distress (hopelessness, self-harm, feeling unable to cope, catastrophic language), set distressFlag to true, keep your reply brief and caring, and gently suggest they consider reaching out to a qualified mental-health professional or a local support line instead of continuing with ordinary coaching. You can also help fill the intake questionnaire (demographics, financial context, trading history, motivation, transparency with family) and the five behavioral scenario prompts conversationally when the user asks - financial-context questions (capital type, borrowed money) are sensitive, so ask them neutrally and never imply the user must answer to keep using the app. You may propose field suggestions, but only for the exact known field paths supplied; never invent a path, and never claim a suggestion has already been saved - the user must approve it before it applies.` }]
      },
      ...history,
      { role: 'user', content: [{ type: 'input_text', text: `${String(body.message || '').trim()}\n\nKnown field paths you may target: ${JSON.stringify(mentalHealthPaths)}\n\nCurrent context:\n${mentalHealthContext(body)}` }] }
    ],
    text: { format: mentalHealthChatFormat }
  });
  return { reply: result.reply || '', distressFlag: !!result.distressFlag, suggestions: result.suggestions || [], provider, model, usage };
}

async function mentalHealthEducationCard(body) {
  const language = languageNames[body.language] || languageNames.en;
  const { data: result, usage, provider, model } = await callProvider(body.provider, body.apiKey, body.model, {
    input: [
      {
        role: 'system',
        content: [{ type: 'input_text', text: `You write short, calm educational cards inside a trading journal's self-reflection tool about one recurring trading behavior pattern. Respond only in ${language}. Never diagnose, never use clinical or medical language, never claim therapeutic authority - describe only observable trading behavior, plainly and kindly. Use the user's own supplied numbers in "whyItMattersForYou" so it reads as personal, not generic; never invent statistics beyond what is supplied. practicalSteps must be small, concrete actions doable before the trader's next trade. imagePrompt must describe a calm, abstract, encouraging visual (soft shapes, color, light) - never anything clinical, distressing, or literal.` }]
      },
      { role: 'user', content: [{ type: 'input_text', text: `Pattern: ${String(body.biasType || '')}\nUser's own evidence: ${JSON.stringify(body.evidence || {})}` }] }
    ],
    text: { format: educationCardFormat }
  });
  return { ...result, provider, model, usage };
}

async function analyzeTrade(body) {
  const language = languageNames[body.language] || languageNames.en;
  const trade = body.trade || {};
  const context = {
    direction: trade.direction, entryPrice: trade.entryPrice, stopLoss: trade.stopLoss,
    takeProfits: trade.takeProfits || [], riskPercent: trade.riskPercent, rr: trade.rr,
    primaryTimeframe: trade.primaryTimeframe, timeframeTrends: trade.timeframeTrends || [],
    conceptTags: trade.conceptTags || [], linkedPatternIds: trade.linkedPatternIds || [], linkedStrategyId: trade.linkedStrategyId || null, chartNote: trade.chartNote || ''
  };
  const { data: result, usage, provider, model } = await callProvider(body.provider, body.apiKey, body.model, {
    input: [
      { role: 'system', content: [{ type: 'input_text', text: `You are a trading-journal chart reviewer. Respond only in ${language}. Describe only what is visible or supplied, separate observations from uncertainties, and do not give personalized financial advice or invent prices.` }] },
      { role: 'user', content: [{ type: 'input_text', text: `Trade context:\n${JSON.stringify(context)}` }, ...imageContent(body.images)] }
    ],
    text: { format: tradeAnalysisFormat }
  });
  return { ...result, provider, model, usage };
}

async function dockChat(body) {
  const language = languageNames[body.language] || languageNames.en;
  const history = (Array.isArray(body.chatHistory) ? body.chatHistory : []).slice(-24).map((message) => ({
    role: message.role === 'assistant' ? 'assistant' : 'user',
    content: [{ type: 'input_text', text: String(message.content || '') }]
  }));
  const activeProcess = body.activeProcess && Array.isArray(body.activeProcess.allowlist) && body.activeProcess.allowlist.length ? body.activeProcess : null;
  const systemText = activeProcess
    ? `You are a general-purpose assistant embedded in a local trading-journal app. Respond only in ${language}. The user currently has an open form ("${activeProcess.id}") you can help fill in conversationally. You may propose field suggestions, but only for the exact known field paths supplied; never invent a path, and never claim a suggestion has already been saved - the user must approve it before it applies. If the message is unrelated to that form, reply normally with an empty suggestions array.`
    : `You are a general-purpose assistant embedded in a local trading-journal app. Respond only in ${language}. Keep answers concise and helpful. Do not give personalized financial advice.`;
  const userText = `${String(body.message || '').trim()}${activeProcess ? `\n\nKnown field paths you may target: ${JSON.stringify(activeProcess.allowlist)}` : ''}`;
  const { data: result, usage, provider, model } = await callProvider(body.provider, body.apiKey, body.model, {
    input: [
      { role: 'system', content: [{ type: 'input_text', text: systemText }] },
      ...history,
      { role: 'user', content: [{ type: 'input_text', text: userText }] }
    ],
    text: { format: dockChatFormatFor(activeProcess) }
  });
  return { reply: result.reply || '', suggestions: result.suggestions || [], provider, model, usage };
}

async function testConnection(body) {
  const { data: result, usage, provider, model } = await callProvider(body.provider, body.apiKey, body.model, {
    input: [
      { role: 'system', content: [{ type: 'input_text', text: 'Reply with a JSON object where ok is true. Nothing else.' }] },
      { role: 'user', content: [{ type: 'input_text', text: 'ping' }] }
    ],
    text: { format: testConnectionFormat }
  });
  return { ok: !!result.ok, provider, model, usage };
}

async function extractTradeFields(body) {
  const language = languageNames[body.language] || languageNames.en;
  const { data: result, usage, provider, model } = await callProvider(body.provider, body.apiKey, body.model, {
    input: [
      { role: 'system', content: [{ type: 'input_text', text: `You read a trading-chart screenshot and extract numeric setup fields for a trade that has not been logged yet. Respond only in ${language}. Only report a field if it is clearly visible or stated on the chart; leave it null otherwise - never invent a price. confidence reflects your overall certainty in the extracted fields as a whole (0-1).` }] },
      { role: 'user', content: [{ type: 'input_text', text: 'Extract the trade setup from this chart.' }, ...imageContent(body.images)] }
    ],
    text: { format: tradeFieldsExtractionFormat }
  });
  return {
    direction: result.direction ?? null, entryPrice: result.entryPrice ?? null, stopLoss: result.stopLoss ?? null,
    takeProfits: result.takeProfits || [], leverage: result.leverage ?? null,
    confidence: typeof result.confidence === 'number' ? result.confidence : null,
    provider, model, usage
  };
}

const server = http.createServer(async (request, response) => {
  if (request.method === 'OPTIONS') return json(response, 204, {});
  if (request.method === 'GET' && request.url === '/health') {
    return json(response, 200, {
      ok: true,
      model: process.env.OPENAI_MODEL || providerDefaultModel.openai,
      configured: Boolean(process.env.OPENAI_API_KEY)
    });
  }
  if (!checkBasicAuth(request)) return requireBasicAuth(response);
  if (request.method !== 'POST') return json(response, 404, { error: 'NOT_FOUND' });

  try {
    const body = await readBody(request);
    if (request.url === '/api/patterns/generate-stages') return json(response, 200, await generateStages(body));
    if (request.url === '/api/patterns/chat') return json(response, 200, await trainingChat(body));
    if (request.url === '/api/strategy-education/summarize') return json(response, 200, await summarizeStrategyEducation(body));
    if (request.url === '/api/strategy-education/chat') return json(response, 200, await strategyEducationChat(body));
    if (request.url === '/api/strategy-education/from-event') return json(response, 200, await strategyFromEvent(body));
    if (request.url === '/api/trades/analyze') return json(response, 200, await analyzeTrade(body));
    if (request.url === '/api/trades/psychology-analysis') return json(response, 200, await psychologyAnalysis(body));
    if (request.url === '/api/trades/extract-fields') return json(response, 200, await extractTradeFields(body));
    if (request.url === '/api/mental-health/chat') return json(response, 200, await mentalHealthChat(body));
    if (request.url === '/api/mental-health/education-card') return json(response, 200, await mentalHealthEducationCard(body));
    if (request.url === '/api/ai/chat') return json(response, 200, await dockChat(body));
    if (request.url === '/api/ai/test-connection') return json(response, 200, await testConnection(body));
    return json(response, 404, { error: 'NOT_FOUND' });
  } catch (error) {
    const status = error.message === 'REQUEST_TOO_LARGE' ? 413
      : error.message === 'INVALID_JSON' ? 400
      : /_API_KEY_MISSING$/.test(error.message || '') ? 503
      : 500;
    return json(response, status, { error: error.message || 'PATTERN_AI_FAILED' });
  }
});

server.listen(port, host, () => {
  console.log(`Pattern AI server: http://${host}:${port}`);
});

export default server;
export { callProvider, callOpenAI, callAnthropic, callOpenAICompatible };
