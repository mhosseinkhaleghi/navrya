// Human receipt lines for what an AI turn actually applied (ChatDock capsule redesign, artbook
// plate IV "action receipt"). chatDockView.jsx used to hand ChatResponsePopover the workflow's
// raw `known` map as "path: value" strings, so a navigation showed up as "DOMAINID dashboard".
// This turns the same real data into what the user recognizes:
// - navigate-to's `domainId` becomes that page's own sidebar label (the same NAVRYA_STRINGS nav
//   keys the sidebar renders), with no label prefix;
// - a form field gets its real rendered label from the process registry's interview metadata
//   (the same label Voice asks with - docs/ai/form-interview-contract.md);
// - a field with no real label shows its value alone rather than an internal path (the path only
//   as a last resort, when the value itself has no text form - an applied field is never hidden);
// - booleans show the label with a check or a dash instead of "true"/"false".
// Pure: every lookup is injected, so tests/chatdock-capsule.test.mjs can drive it as plain data.

// The English/Spanish character titles are stored in capitals ("THE MARKET ENGINEER") for the
// dashboard's display lettering; in the dock the companion's name reads as a name
// ("The Market Engineer"). Persian/Arabic titles have no case and pass through unchanged.
export function companionDisplayName(title) {
  const text = String(title || '');
  if (!/[A-Z]/.test(text) || text !== text.toUpperCase()) return text;
  return text.toLowerCase().replace(/(^|[\s'-])([a-zà-ÿ])/g, (m, sep, ch) => sep + ch.toUpperCase());
}

// ai-knowledge-registry.js domain id (character-app.jsx's NAVIGATE_TARGETS) -> NAVRYA_STRINGS key.
export const NAV_LABEL_KEYS = {
  dashboard: 'navDashboard', sessions: 'navSessions', accounts: 'navAccounts', strategies: 'navStrategies',
  patterns: 'navStrategies', psychology: 'navPsychology', settings: 'navSettings', 'ai-assistant': 'navAiAssistant',
  community: 'navCommunity', support: 'navSupport'
};

function display(value) {
  if (Array.isArray(value)) return value.map(display).join(', ');
  if (value && typeof value === 'object') return '';
  return String(value);
}

// opts: { navLabel(key) -> string|null, wentTo(pageLabel) -> string (optional sentence), fieldLabel(processId, path) -> string|null }
export function receiptEntry(processId, path, value, opts) {
  const o = opts || {};
  if (path === 'domainId') {
    const key = NAV_LABEL_KEYS[String(value)];
    const label = key && typeof o.navLabel === 'function' ? o.navLabel(key) : null;
    // The receipt reads as what happened ("Went to Dashboard") when the caller supplies the sentence.
    if (label && typeof o.wentTo === 'function') return o.wentTo(label);
    return label || display(value);
  }
  const label = typeof o.fieldLabel === 'function' ? o.fieldLabel(processId, path) : null;
  if (typeof value === 'boolean') return label ? label + ': ' + (value ? '✓' : '—') : (value ? '✓' : '—');
  const text = display(value);
  // Never hidden: an applied field always leaves a receipt, even one whose value has no text form.
  if (!text) return label || path;
  return label ? label + ': ' + text : text;
}

export function workflowReceipts(workflow, opts) {
  if (!workflow || !workflow.known) return [];
  return Object.keys(workflow.known).map((path) => receiptEntry(workflow.processId, path, workflow.known[path], opts));
}
