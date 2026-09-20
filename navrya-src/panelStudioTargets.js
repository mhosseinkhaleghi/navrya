// The Vibe Coding Panel Studio's target-manifest registry - the one place that decides which
// application surfaces AI-generated code is allowed to touch. V1 enables exactly one target,
// `dashboard.panel`; everything else is deliberately absent rather than present-but-disabled by a
// mere boolean, so a future target (session.panel, report.widget, a reviewed UI-change proposal)
// can only go live by adding a real entry here with its own prompt builder, sandbox module, and
// apply adapter already implemented - never by flipping a flag alone.
//
// Plain, dependency-free ESM (no JSX), so both the client Studio UI and
// server/pattern-ai-server.mjs can import the exact same registry - the code-level twin of
// migration 076's `CHECK (target IN ('dashboard.panel'))`.
export const TARGETS = {
  'dashboard.panel': {
    id: 'dashboard.panel',
    enabled: true,
    labelKey: 'panelStudioTargetDashboardPanel',
    maxSourceBytes: 12 * 1024,
    maxPromptChars: 400,
    // The plug-in contract every target - enabled or not - must describe:
    //  - promptBuilderModule: the navrya-src module that builds THIS target's generation prompt
    //  - sandboxModule: the navrya-src module that renders THIS target's sandboxed preview
    //  - bridgeMethods: the read-only getter methods this target's sandbox exposes to generated code
    //  - applyAdapter: how a completed revision gets wired into the real application surface
    promptBuilderModule: 'dashboardPanelBuilder.js',
    sandboxModule: 'dashboardPanelSandbox.jsx',
    bridgeMethods: ['tradeSummary', 'openPositions', 'patternStats', 'psychologyMirror'],
    applyAdapter: 'dashboardView.addArtifactPanel'
  }
  // Future targets are added here as additional entries with enabled:false until their own
  // promptBuilderModule/sandboxModule/applyAdapter genuinely exist.
};

export function getTarget(id) {
  const entry = TARGETS[id];
  return entry && entry.enabled ? entry : null;
}

export function isSupportedTarget(id) {
  return !!getTarget(id);
}

export const ENABLED_TARGET_IDS = Object.keys(TARGETS).filter((id) => TARGETS[id].enabled);
