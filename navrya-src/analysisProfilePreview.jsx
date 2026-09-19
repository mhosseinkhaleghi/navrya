import React from 'react';
import { Panel } from '../public/pages/shared/navrya/components/core/Panel.jsx';
import { Icon } from '../public/pages/shared/navrya/components/core/Icon.jsx';
import { Button } from '../public/pages/shared/navrya/components/forms/Button.jsx';
import { EngineLearningPanel } from './engineLearning.jsx';
import { trt, trDigits } from './analysisProfileTrainingCopy.js';

// The Analysis Profile "Preview" tab (ARCHITECTURE.md §7.25, Phase 4) - two honestly separate halves:
//
//  1. Engine Brief (FREE, always shown): exactly what the shared brief
//     (server/ai/analysis-profile-brief.mjs) puts into every Session analysis prompt for this
//     profile - computed here, in the browser, by its own byte-identical twin
//     (public/pages/shared/analysis-profile-brief.js), so this never makes a network call and can
//     never be billed. What the trader SEES here is, by construction, what the model RECEIVES.
//  2. Sample analysis (BILLED, opt-in): one explicit click calls POST /api/analysis-profiles/preview
//     for a clearly-labelled ILLUSTRATIVE sample - never a real chart. Each observation has its own
//     "Correct this", which reuses the SAME propose/review/apply flow as the Knowledge tab's
//     teach-from-source (EngineLearningPanel with a `preset`, kind:'correction' so the ingest system
//     prompt's own correction framing applies), never a bespoke second review UI.

function briefTwin() { return window.TradeJournalAnalysisProfileBrief; }
function analysisContext() { return window.TradeJournalAnalysisContext; }
function aiClient() { return window.TradeJournalAnalysisProfileAI; }

function tokensOf(usage) { return usage ? (Number(usage.promptTokens) || 0) + (Number(usage.completionTokens) || 0) : 0; }

function BriefSection({ lines }) {
  return (
    <p dir="auto" style={{ margin: 0, fontSize: 12.5, lineHeight: 2, color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>{lines.join('\n')}</p>
  );
}

export function PreviewTab({ profile, lang }) {
  const context = analysisContext();
  const profileContext = React.useMemo(() => (context ? context.getAnalysisContext(profile.id) : null), [context, profile.id, profile.revision]);
  const brief = React.useMemo(() => {
    const twin = briefTwin();
    return twin ? twin.build(profileContext) : { sections: [], estimatedTokens: 0 };
  }, [profileContext]);

  const [phase, setPhase] = React.useState('idle'); // idle | working | ready
  const [observations, setObservations] = React.useState([]);
  const [usage, setUsage] = React.useState(null);
  const [error, setError] = React.useState('');
  const [correcting, setCorrecting] = React.useState(null); // the observation being corrected, or null

  async function generate() {
    const client = aiClient();
    if (!client || phase === 'working') return;
    setPhase('working'); setError('');
    try {
      const result = await client.preview({ profileContext, language: lang });
      setObservations(result.observations);
      setUsage(result.usage);
      setPhase('ready');
    } catch (caught) {
      setPhase(observations.length ? 'ready' : 'idle');
      setError(caught && caught.code === 'WALLET_INSUFFICIENT_BALANCE' ? trt(lang, 'chatErrorBalance') : trt(lang, 'chatErrorGeneric'));
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.9, color: 'var(--text-muted)', maxWidth: 760 }}>{trt(lang, 'previewSubtitle')}</p>

      <Panel padding="18px 20px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--parchment)' }}>{trt(lang, 'engineBriefTitle')}</span>
            <span style={{ fontSize: 10.5, padding: '2px 8px', borderRadius: 999, border: '1px solid var(--success)', color: 'var(--success)' }}>{trt(lang, 'engineBriefLive')}</span>
          </div>
          {brief.sections.length === 0 ? (
            <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{trt(lang, 'engineBriefEmpty')}</span>
          ) : (
            <React.Fragment>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {brief.sections.map((section) => <BriefSection key={section.id} lines={section.lines} />)}
              </div>
              <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{trt(lang, 'engineBriefTokenEstimate', { n: trDigits(lang, brief.estimatedTokens.toLocaleString('en-US')) })}</span>
            </React.Fragment>
          )}
        </div>
      </Panel>

      <Panel padding="18px 20px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--parchment)' }}>{trt(lang, 'sampleTitle')}</span>
          </div>
          <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{trt(lang, 'sampleSubtitle')}</span>
          <div>
            <Button variant="primary" size="sm" icon="sparkle" loading={phase === 'working'} disabled={phase === 'working' || brief.sections.length === 0} onClick={generate}>
              {trt(lang, phase === 'ready' ? 'sampleRegenerateBtn' : 'sampleBtn')}
            </Button>
          </div>
          {error && <span style={{ fontSize: 12, color: 'var(--danger)' }}>{error}</span>}
          {phase === 'ready' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {usage && tokensOf(usage) > 0 && <span style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>{trt(lang, 'chatTokensUsed', { n: trDigits(lang, tokensOf(usage).toLocaleString('en-US')) })}</span>}
              {!observations.length && <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{trt(lang, 'sampleEmpty')}</span>}
              {observations.map((observation, index) => (
                <div key={index} style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.4)' }}>
                  <span dir="auto" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{observation.title}</span>
                  <span dir="auto" style={{ fontSize: 12, lineHeight: 1.9, color: 'var(--text-muted)' }}>{observation.detail}</span>
                  <span><Button variant="ghost" size="sm" icon="edit" onClick={() => setCorrecting(correcting === index ? null : index)}>{trt(lang, 'correctThisBtn')}</Button></span>
                  {correcting === index && (
                    <EngineLearningPanel lang={lang} profile={profile}
                      preset={{
                        title: observation.title, kind: 'correction', headingKey: 'correctingLabel', editable: true,
                        text: `Sample observation "${observation.title}": ${observation.detail}`,
                        onClose: () => setCorrecting(null)
                      }}
                      onTaught={() => setCorrecting(null)} />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}
