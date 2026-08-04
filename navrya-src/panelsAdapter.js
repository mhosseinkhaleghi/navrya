// Ports panel-system.js's panel storage verbatim (same localStorage key format, same preset
// arrays) so switching Dashboard/Strategies/Settings to NAVRYA rendering doesn't lose or
// reshape a user's already-saved panel arrangement.
const PRESETS = {
  dashboard: [{ id: 'dashboard-overview', type: 'metric', span: 2 }, { id: 'dashboard-focus', type: 'focus', span: 1 }, { id: 'dashboard-watch', type: 'watch', span: 1 }, { id: 'dashboard-strategy', type: 'strategy', span: 2 }, { id: 'dashboard-ai', type: 'ai', span: 2 }],
  strategies: [{ id: 'strategy-pulse', type: 'strategy', span: 2 }, { id: 'strategy-quality', type: 'metric', span: 1 }, { id: 'strategy-note', type: 'notes', span: 1 }, { id: 'strategy-watch', type: 'watch', span: 2 }, { id: 'strategy-ai', type: 'ai', span: 2 }]
};

function storeKey(character, view) { return 'tradejournal:character-panels:' + character + ':' + view; }

export function loadPanels(character, view) {
  try {
    const saved = JSON.parse(localStorage.getItem(storeKey(character, view)));
    return Array.isArray(saved) ? saved : JSON.parse(JSON.stringify(PRESETS[view] || []));
  } catch (_) { return JSON.parse(JSON.stringify(PRESETS[view] || [])); }
}

export function savePanels(character, view, panels) {
  localStorage.setItem(storeKey(character, view), JSON.stringify(panels));
}

export function updatePanel(character, view, id, action) {
  const panels = loadPanels(character, view).map((panel) => {
    if (panel.id !== id) return panel;
    if (action === 'shrink') return { ...panel, span: Math.max(1, panel.span - 1) };
    if (action === 'expand') return { ...panel, span: Math.min(4, panel.span + 1) };
    if (action === 'toggle') return { ...panel, visible: panel.visible === false };
    return { ...panel, visible: false };
  });
  savePanels(character, view, panels);
  return panels;
}

export function addCustomPanel(character, view, prompt) {
  const panels = loadPanels(character, view);
  panels.push({
    id: 'custom-' + Date.now().toString(36),
    type: /strategy|استراتژی|استراتيجية/i.test(prompt) ? 'strategy' : 'notes',
    title: prompt.slice(0, 62),
    description: prompt,
    span: 1, visible: true, custom: true
  });
  savePanels(character, view, panels);
  return panels;
}
