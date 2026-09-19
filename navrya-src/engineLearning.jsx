import React from 'react';
import { Panel } from '../public/pages/shared/navrya/components/core/Panel.jsx';
import { Icon } from '../public/pages/shared/navrya/components/core/Icon.jsx';
import { Button } from '../public/pages/shared/navrya/components/forms/Button.jsx';
import { trt, trDigits } from './analysisProfileTrainingCopy.js';

// "Teach the engine" - the Analysis Profile engine-memory learning loop's UI (ARCHITECTURE.md
// §7.25). A trader writes a note (or a correction); ONE billed AI call (POST
// /api/analysis-profiles/ingest, via window.TradeJournalAnalysisProfileAI.ingestLearning) turns it
// into a PROPOSAL - a rewritten compact understanding plus specific concepts - which is shown for
// explicit review and only then applied through TradeJournalAnalysisProfileStore.applyLearning()
// (exactly one save, one ledger event). Nothing here ever mutates the profile without that approval.
//
// Honesty rules this component follows:
//  - The three "steps" (read / extract concepts / update understanding) DESCRIBE what the engine does
//    inside one model call; there is no real per-step progress to report, so while the call is in
//    flight all three show as "in progress", and only when it returns do they show real results
//    (how many concepts were actually found, whether an understanding change was actually proposed,
//    the real tokens used) - never an animated fake progress bar.
//  - Tokens are recorded in the learning history the moment the AI call returns (a discarded proposal
//    still cost tokens), not only when something is applied.
//  - "Save without teaching" is a plain diary note: zero tokens, no concept/understanding change.

function store() { return window.TradeJournalAnalysisProfileStore; }
function aiClient() { return window.TradeJournalAnalysisProfileAI; }

function totalTokens(usage) {
  if (!usage) return 0;
  return (Number(usage.promptTokens) || 0) + (Number(usage.completionTokens) || 0);
}

function StepRow({ done, working, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12.5, color: done ? 'var(--text-primary)' : 'var(--text-muted)' }}>
      <span style={{ display: 'grid', placeItems: 'center', width: 20, height: 20, borderRadius: '50%', flex: 'none', color: done ? 'var(--success)' : 'var(--char-accent)', border: '1px solid currentColor' }}>
        <Icon name={done ? 'check' : 'progress'} size={12} />
      </span>
      <span>{label}</span>
      {working && <span style={{ color: 'var(--text-dim)' }}>…</span>}
    </div>
  );
}

const fieldStyle = {
  boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-hairline)',
  background: 'rgba(3,8,7,.55)', color: 'var(--text-primary)', font: 'inherit', fontSize: 13, lineHeight: 1.8, outline: 'none', width: '100%'
};

export function EngineLearningPanel({ lang, profile, onChanged }) {
  const [text, setText] = React.useState('');
  const [kind, setKind] = React.useState('note');
  const [phase, setPhase] = React.useState('idle'); // idle | working | review
  const [proposal, setProposal] = React.useState(null);
  const [accepted, setAccepted] = React.useState([]);
  const [priorities, setPriorities] = React.useState([]);
  const [understandingText, setUnderstandingText] = React.useState('');
  const [applyUnderstanding, setApplyUnderstanding] = React.useState(false);
  const [error, setError] = React.useState('');
  const [notice, setNotice] = React.useState('');
  const noticeTimer = React.useRef(null);
  React.useEffect(() => () => { if (noticeTimer.current) window.clearTimeout(noticeTimer.current); }, []);

  function flash(message) {
    setNotice(message);
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(''), 3200);
  }
  function changed() { if (onChanged) onChanged(); }

  const currentUnderstanding = profile.understanding ? profile.understanding.summary : '';
  const trimmed = text.trim();

  async function teach() {
    const client = aiClient();
    const profiles = store();
    if (!client || !profiles || !trimmed || phase === 'working') return;
    setPhase('working'); setError(''); setNotice('');
    try {
      const result = await client.ingestLearning({
        kind, text: trimmed, language: lang, primaryStyleId: profile.primaryStyleId, secondaryStyleIds: profile.secondaryStyleIds,
        customMethodNotes: profile.customMethodNotes, currentUnderstanding, existingConceptTitles: profile.concepts.map((c) => c.title)
      });
      // The tokens are spent the moment the call returns, whether or not the trader applies the
      // result - so the history records them now, as their own honest event.
      profiles.recordEvent(profile.id, {
        kind: 'ai_analyzed_' + kind, title: trimmed.slice(0, 80), detail: trimmed,
        understandingVersion: profile.understanding.version, tokenUsage: result.usage || null
      }).catch(() => {});
      const proposedUnderstanding = result.updatedUnderstanding.trim();
      setProposal(result);
      setAccepted(result.conceptsProposed.map(() => true));
      setPriorities(result.conceptsProposed.map((c) => c.priority));
      setUnderstandingText(proposedUnderstanding);
      setApplyUnderstanding(Boolean(proposedUnderstanding) && proposedUnderstanding !== currentUnderstanding);
      setPhase('review');
      profiles.settleEvents().then(changed);
    } catch (caught) {
      setPhase('idle');
      setError(caught && caught.code === 'WALLET_INSUFFICIENT_BALANCE' ? trt(lang, 'aiErrorBalance') : trt(lang, 'aiErrorGeneric'));
    }
  }

  function apply() {
    const profiles = store();
    if (!profiles || !proposal) return;
    const conceptsToAdd = proposal.conceptsProposed
      .map((concept, index) => ({ concept, index }))
      .filter(({ index }) => accepted[index])
      .map(({ concept, index }) => ({ title: concept.title, description: concept.description, priority: priorities[index] || concept.priority, origin: 'ai' }));
    const understandingChange = applyUnderstanding && understandingText.trim() ? understandingText.trim() : undefined;
    if (!conceptsToAdd.length && !understandingChange) { discard(); return; }
    const saved = profiles.applyLearning(profile.id, {
      conceptsToAdd, understandingSummary: understandingChange,
      eventKind: kind === 'correction' ? 'taught_correction' : 'taught_note', eventTitle: trimmed.slice(0, 80), eventDetail: trimmed,
      tokenUsage: null // already recorded on the analysis event above - never counted twice
    });
    setPhase('idle'); setProposal(null); setText('');
    if (saved) flash(trt(lang, 'applied', { n: trDigits(lang, saved.understanding.version) }));
    profiles.settleEvents().then(changed);
  }

  function discard() { setPhase('idle'); setProposal(null); }

  function saveNote() {
    const profiles = store();
    if (!profiles || !trimmed) return;
    profiles.recordNote(profile.id, trimmed).then(() => { changed(); });
    setText('');
    flash(trt(lang, 'noteSaved'));
  }

  const used = proposal ? totalTokens(proposal.usage) : 0;
  const acceptedCount = accepted.filter(Boolean).length + (applyUnderstanding && understandingText.trim() ? 1 : 0);

  return (
    <Panel padding="18px 20px">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: 'var(--parchment)' }}>
          <span style={{ color: 'var(--char-accent)' }}><Icon name="sparkle" size={17} /></span>{trt(lang, 'teachTitle')}
        </span>

        {phase !== 'review' && (
          <React.Fragment>
            <div style={{ display: 'flex', gap: 6 }}>
              {[['note', 'teachKindNote'], ['correction', 'teachKindCorrection']].map(([id, key]) => (
                <button key={id} type="button" onClick={() => setKind(id)} disabled={phase === 'working'} style={{
                  height: 32, padding: '0 14px', borderRadius: 999, cursor: 'pointer', font: 'inherit', fontSize: 12,
                  border: '1px solid ' + (kind === id ? 'var(--char-accent)' : 'var(--border-hairline)'),
                  background: kind === id ? 'var(--char-active-surface)' : 'transparent', color: kind === id ? 'var(--char-accent)' : 'var(--text-muted)'
                }}>{trt(lang, key)}</button>
              ))}
            </div>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} dir="auto" disabled={phase === 'working'} maxLength={8000}
              placeholder={trt(lang, 'teachPlaceholder')} style={{ ...fieldStyle, resize: 'vertical' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <Button variant="primary" size="sm" icon="sparkle" loading={phase === 'working'} disabled={!trimmed || phase === 'working'} onClick={teach}>{trt(lang, 'teachBtn')}</Button>
              <Button variant="ghost" size="sm" icon="check" disabled={!trimmed || phase === 'working'} onClick={saveNote}>{trt(lang, 'saveNoteBtn')}</Button>
            </div>
            <span style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>{trt(lang, 'teachHint')}</span>
          </React.Fragment>
        )}

        <div aria-live="polite" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {phase === 'working' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.4)' }}>
              <span style={{ fontSize: 12, color: 'var(--char-accent)' }}>{trt(lang, 'workingLabel')}</span>
              <StepRow working label={trt(lang, 'stepRead')} />
              <StepRow working label={trt(lang, 'stepExtract')} />
              <StepRow working label={trt(lang, 'stepUpdate')} />
            </div>
          )}
          {error && <span style={{ fontSize: 12, color: 'var(--danger)' }}>{error}</span>}
          {notice && <span style={{ fontSize: 12, color: 'var(--success)' }}>{notice}</span>}
        </div>

        {phase === 'review' && proposal && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.4)' }}>
              <StepRow done label={trt(lang, 'resultRead')} />
              <StepRow done label={proposal.conceptsProposed.length ? trt(lang, 'resultConcepts', { n: trDigits(lang, proposal.conceptsProposed.length) }) : trt(lang, 'resultConceptsNone')} />
              <StepRow done label={trt(lang, understandingText.trim() && understandingText.trim() !== currentUnderstanding ? 'resultUnderstandingChanged' : 'resultUnderstandingSame')} />
              {used > 0 && <span style={{ fontSize: 11, color: 'var(--text-dim)', paddingInlineStart: 29 }}>{trt(lang, 'tokensUsed', { n: trDigits(lang, used.toLocaleString('en-US')) })}</span>}
            </div>

            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--parchment)' }}>{trt(lang, 'reviewTitle')}</span>

            {understandingText.trim() && understandingText.trim() !== currentUnderstanding && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 12, borderRadius: 10, border: '1px solid var(--divider-gold)', background: 'rgba(183,138,74,.06)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--gold-warm)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={applyUnderstanding} onChange={(e) => setApplyUnderstanding(e.target.checked)} style={{ accentColor: 'var(--char-accent)' }} />
                  {trt(lang, 'applyUnderstanding')}
                </label>
                <span style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>{trt(lang, 'proposedUnderstanding')}</span>
                <textarea value={understandingText} onChange={(e) => setUnderstandingText(e.target.value)} rows={4} dir="auto" maxLength={4000} style={{ ...fieldStyle, resize: 'vertical' }} />
              </div>
            )}

            {proposal.conceptsProposed.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {proposal.conceptsProposed.map((concept, index) => (
                  <div key={concept.title} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderRadius: 10, border: '1px solid ' + (accepted[index] ? 'var(--char-accent)' : 'var(--border-hairline)'), background: accepted[index] ? 'var(--char-active-surface)' : 'transparent' }}>
                    <input type="checkbox" checked={Boolean(accepted[index])} onChange={(e) => setAccepted((prev) => prev.map((v, i) => (i === index ? e.target.checked : v)))} style={{ accentColor: 'var(--char-accent)', marginTop: 3 }} />
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, flex: 1 }}>
                      <span dir="auto" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{concept.title}</span>
                      {concept.description && <span dir="auto" style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>{concept.description}</span>}
                    </span>
                    <select value={priorities[index] || concept.priority} onChange={(e) => setPriorities((prev) => prev.map((v, i) => (i === index ? e.target.value : v)))}
                      style={{ height: 30, borderRadius: 6, border: '1px solid var(--border-hairline)', background: 'rgba(11,20,21,.6)', color: 'var(--text-primary)', font: 'inherit', fontSize: 11.5 }}>
                      <option value="mandatory">{trt(lang, 'priorityMandatory')}</option>
                      <option value="preferred">{trt(lang, 'priorityPreferred')}</option>
                      <option value="reference">{trt(lang, 'priorityReference')}</option>
                    </select>
                  </div>
                ))}
              </div>
            ) : (
              !(understandingText.trim() && understandingText.trim() !== currentUnderstanding) && <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{trt(lang, 'reviewNothing')}</span>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="primary" size="sm" icon="check" disabled={acceptedCount === 0} onClick={apply}>{trt(lang, 'applyBtn', { n: trDigits(lang, acceptedCount) })}</Button>
              <Button variant="ghost" size="sm" icon="close" onClick={discard}>{trt(lang, 'discardBtn')}</Button>
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}
