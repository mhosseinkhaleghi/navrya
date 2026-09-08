// Prompt construction and reply parsing for AI-authored Analysis Workspace panels (Phase 2).
// Deliberately kept out of the React file: this is pure, synchronous string logic, so it can be
// unit-tested directly (tests/analysis-workspace-panel-builder.test.mjs) instead of only through
// static source assertions the way this project's .jsx has to be.
import { BRIDGE_VERSION, MAX_SOURCE_BYTES_HINT } from './analysisWorkspaceBridgeDoc.js';

// The one marker the model must emit instead of fabricating a panel it cannot honestly build.
// Checked before anything else in parseGeneration(), so a refusal can never be mistaken for
// widget source and installed on the trader's desk.
export const UNAVAILABLE_MARKER = 'NAVRYA_UNAVAILABLE:';

const LANG_NAME = { fa: 'Persian', ar: 'Arabic', en: 'English', es: 'Spanish' };

// The full contract handed to the model. Every constraint here is a real property of the runtime
// (see analysisWorkspacePanelRuntime.jsx), not a stylistic preference - the sandbox genuinely has
// no network, genuinely has no framework, and genuinely exposes only these five getters.
export function buildGenerationPrompt({ prompt, lang, previousSource }) {
  const language = LANG_NAME[lang] || 'English';
  const lines = [
    'You are generating ONE self-contained panel for a trading-journal "analysis workspace".',
    '',
    'OUTPUT: a single HTML fragment and nothing else - no markdown fences, no explanation, no',
    '<html>/<head>/<body> wrapper. It may contain <style> and <script> tags. Render your UI into',
    "document.getElementById('navrya-panel-root').",
    '',
    'RUNTIME (all of this is strictly enforced, not advice):',
    '- Your code runs inside a sandboxed iframe with NO network access whatsoever. fetch, XHR,',
    '  WebSocket, and every remote script/stylesheet/font/image are blocked by CSP. Never reference',
    '  a CDN, a URL, or any external resource.',
    '- No frameworks or libraries are available. Plain DOM APIs and inline CSS only.',
    '- The ONLY data source is the async `navrya` bridge (version ' + BRIDGE_VERSION + '), already defined:',
    '    navrya.getContext()   -> {instrument,timeframe,market,status,startedAt,elapsedMinutes,',
    '                              loopMinutes,language,direction,entryCount,scenarioCount,openPositionCount}',
    '    navrya.getEntries()   -> [{id,index,type,createdAt,timeframe,note,hasImage,scenarioCount}]',
    '    navrya.getScenarios() -> [{id,entryId,title,side,probability,occurred,patternTitle,completionPercent}]',
    '    navrya.getPositions() -> [{id,instrument,side,status,entry,stop,target}]',
    '    navrya.getChart()     -> {symbol,interval,embeddable:false}',
    '    navrya.onUpdate(fn)   -> fn runs again whenever the session data changes',
    '  Every one of these is READ-ONLY. There is no way to write, log, edit or delete anything.',
    '- There is NO price or candle data, NO computed indicator values, NO news feed, and NO access',
    '  to any other website or service. Those simply do not exist in this environment.',
    '- Theme with these CSS variables so the panel looks native: --char-accent, --text-primary,',
    '  --text-muted, --text-dim, --border-gold, --border-hairline, --success, --danger. Dark, compact,',
    '  12px base text. Respect the direction returned by getContext().direction.',
    '- Write all user-visible text in ' + language + '.',
    '- The entire fragment must stay under ' + MAX_SOURCE_BYTES_HINT + '.',
    '- Never invent or placeholder a number. When the bridge returns nothing, render an honest',
    '  empty state saying there is no data yet.',
    '',
    'HONESTY RULE: if the request fundamentally needs data this environment does not have - live',
    'prices, candles for indicator maths, news, an economic calendar, or another site\'s data - do',
    'NOT build a fake or mock version of it. Instead reply with exactly one line and nothing else:',
    UNAVAILABLE_MARKER + ' <one short sentence in ' + language + ' saying what is missing>'
  ];
  if (previousSource) {
    lines.push(
      '',
      'This is a REVISION of an existing panel. Keep everything the user did not ask to change,',
      'and return the complete updated fragment (not a diff). Current panel source:',
      '---',
      previousSource,
      '---'
    );
  }
  lines.push('', 'User request: ' + String(prompt || '').trim());
  return lines.join('\n');
}

// Strips the markdown fence a model adds even when told not to. Only touches a fence that wraps
// the WHOLE reply - never anything inside the fragment itself.
function stripFence(text) {
  const trimmed = String(text || '').trim();
  const fence = /^```[a-zA-Z]*\s*\n([\s\S]*?)\n?```$/.exec(trimmed);
  return fence ? fence[1].trim() : trimmed;
}

// Returns one of:
//   { ok: true, source }
//   { ok: false, reason: 'unavailable', message }  - the model honestly refused (see HONESTY RULE)
//   { ok: false, reason: 'empty' }                 - nothing usable came back
export function parseGeneration(reply) {
  // Fence first, marker second: a model told to answer with one bare line still fences it often
  // enough, and checking the marker on the raw text left the closing ``` glued to the end of the
  // reason shown to the trader.
  const text = stripFence(String(reply || '').trim());
  const at = text.indexOf(UNAVAILABLE_MARKER);
  if (at > -1) {
    return { ok: false, reason: 'unavailable', message: text.slice(at + UNAVAILABLE_MARKER.length).trim().slice(0, 300) };
  }
  const source = text;
  // A reply with no markup at all is prose, not a panel - treated as nothing usable rather than
  // injected into the sandbox as a bare paragraph.
  if (!source || !/<[a-zA-Z]/.test(source)) return { ok: false, reason: 'empty' };
  return { ok: true, source: source };
}

// A short, human title for the board/library, derived from the request itself - the model is never
// asked for a separate title round trip.
export function titleFromPrompt(prompt) {
  const text = String(prompt || '').trim().replace(/\s+/g, ' ');
  return text.length > 42 ? text.slice(0, 42).trim() + '…' : text;
}
