import http from 'node:http';

const port = Number(process.env.PATTERN_AI_PORT || 8787);
const model = process.env.OPENAI_MODEL || 'gpt-5.6';
const apiKey = process.env.OPENAI_API_KEY || '';
const maxBodyBytes = 100 * 1024 * 1024;

const languageNames = { fa: 'Persian (Farsi)', ar: 'Arabic', en: 'English', es: 'Spanish' };

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

async function callOpenAI(payload) {
  if (!apiKey) throw new Error('OPENAI_API_KEY_MISSING');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90000);
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error?.message || `OPENAI_${response.status}`);
    return JSON.parse(outputText(result));
  } finally {
    clearTimeout(timer);
  }
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
      sampleSize: { type: 'integer', minimum: 0 }
    },
    required: ['summary', 'insights', 'correlations', 'sampleSize']
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

async function generateStages(body) {
  const language = languageNames[body.language] || languageNames.en;
  const result = await callOpenAI({
    model,
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
  return { stages: result.stages || [], provider: 'openai', model };
}

async function trainingChat(body) {
  const language = languageNames[body.language] || languageNames.en;
  const history = (Array.isArray(body.chatHistory) ? body.chatHistory : []).slice(-20).map((message) => ({
    role: message.role === 'assistant' ? 'assistant' : 'user',
    content: [{ type: 'input_text', text: String(message.content || '') }]
  }));
  const result = await callOpenAI({
    model,
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
  return { reply: result.reply || '', suggestedStages: result.suggestedStages || [], provider: 'openai', model };
}

async function summarizeStrategyEducation(body) {
  const language = languageNames[body.language] || languageNames.en;
  const result = await callOpenAI({
    model,
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
  return { summary: result.summary, provider: 'openai', model };
}

async function strategyEducationChat(body) {
  const language = languageNames[body.language] || languageNames.en;
  const history = (Array.isArray(body.chatHistory) ? body.chatHistory : []).slice(-24).map((message) => ({
    role: message.role === 'assistant' ? 'assistant' : 'user',
    content: [{ type: 'input_text', text: String(message.content || '') }]
  }));
  const result = await callOpenAI({
    model,
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
  return { reply: result.reply || '', summary: result.summary, suggestions: result.suggestions || [], provider: 'openai', model };
}

async function strategyFromEvent(body) {
  const language = languageNames[body.language] || languageNames.en;
  const result = await callOpenAI({
    model,
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
  return { proposal: result, provider: 'openai', model };
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
      wouldTakeIfNotForced: entry.wouldTakeIfNotForced, note: entry.note || ''
    }))
  }));
  if (!trades.length) throw new Error('NO_CLOSED_TRADES');
  const result = await callOpenAI({
    model,
    input: [
      {
        role: 'system',
        content: [{ type: 'input_text', text: `You are a trading-journal psychology analyst. Respond only in ${language}. Analyze behavioral associations in the supplied closed-trade records, especially stress, focus, plan commitment and repeated emotions against actual outcomes. Distinguish correlation from causation, state when the sample is small, never invent statistics, and provide educational process-improvement observations rather than financial advice.` }]
      },
      { role: 'user', content: [{ type: 'input_text', text: `Closed trade records:\n${JSON.stringify(trades)}` }] }
    ],
    text: { format: psychologyFormat }
  });
  return { ...result, sampleSize: trades.length, provider: 'openai', model };
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
  const result = await callOpenAI({
    model,
    input: [
      { role: 'system', content: [{ type: 'input_text', text: `You are a trading-journal chart reviewer. Respond only in ${language}. Describe only what is visible or supplied, separate observations from uncertainties, and do not give personalized financial advice or invent prices.` }] },
      { role: 'user', content: [{ type: 'input_text', text: `Trade context:\n${JSON.stringify(context)}` }, ...imageContent(body.images)] }
    ],
    text: { format: tradeAnalysisFormat }
  });
  return { ...result, provider: 'openai', model };
}

const server = http.createServer(async (request, response) => {
  if (request.method === 'OPTIONS') return json(response, 204, {});
  if (request.method === 'GET' && request.url === '/health') return json(response, 200, { ok: true, model, configured: Boolean(apiKey) });
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
    return json(response, 404, { error: 'NOT_FOUND' });
  } catch (error) {
    const status = error.message === 'REQUEST_TOO_LARGE' ? 413 : error.message === 'INVALID_JSON' ? 400 : error.message === 'OPENAI_API_KEY_MISSING' ? 503 : 500;
    return json(response, status, { error: error.message || 'PATTERN_AI_FAILED' });
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Pattern AI server: http://127.0.0.1:${port}`);
});

export default server;
