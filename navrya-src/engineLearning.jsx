import React from 'react';
import { Panel } from '../public/pages/shared/navrya/components/core/Panel.jsx';
import { Icon } from '../public/pages/shared/navrya/components/core/Icon.jsx';
import { Button } from '../public/pages/shared/navrya/components/forms/Button.jsx';
import { AiErrorNotice } from './analysisProfileAiStatus.jsx';
import { LearningActivity, useTeachJob } from './analysisProfileTeachActivity.jsx';
import {
  applyTeachJob, dismissTeachJob, isUnderstandingStale, jobTokens, retryTeachJob, startTeachJob, subscribeTeachJobs, updateTeachReview
} from './analysisProfileTeachJobs.js';
import { trt, trDigits } from './analysisProfileTrainingCopy.js';

// "Teach the engine" - the Analysis Profile engine-memory learning loop's UI (ARCHITECTURE.md
// §7.25). A trader writes a note (or a correction); ONE billed AI call
// (POST /api/analysis-profiles/ingest, via window.TradeJournalAnalysisProfileAI.ingestLearning) turns it
// into a PROPOSAL - a rewritten compact understanding plus specific concepts - which is shown for
// explicit review and only then applied through TradeJournalAnalysisProfileStore.applyLearning()
// (exactly one save, one ledger event). Nothing here ever mutates the profile without that approval.
//
// The call itself is NOT owned by this component. It runs as a teaching JOB in analysisProfileTeachJobs.js
// (a module-level map), so it keeps going - and its proposal is kept - when the trader switches tab or leaves
// the profile; this panel is only a view over the job for its key, restored whenever it mounts again. The
// header bar (analysisProfileTeachActivity.jsx) and a toast tell the trader where the result is waiting.
//
// Honesty rules this component follows:
//  - The three "steps" (read / extract concepts / update understanding) DESCRIBE what the engine does
//    inside one model call; there is no real per-step progress to report, so while the call is in
//    flight all three show as "in progress", and only when it returns do they show real results
//    (how many concepts were actually found, whether an understanding change was actually proposed,
//    the real tokens used) - never a fake progress bar. The animation next to them says "in flight" and
//    shows the real elapsed time; it counts towards nothing.
//  - Tokens are recorded in the learning history the moment the AI call returns (a discarded proposal
//    still cost tokens), not only when something is applied.
//  - "Save without teaching" is a plain diary note: zero tokens, no concept/understanding change.
//
// `preset` (Knowledge / Preview tabs): teach from a recorded SOURCE, or correct a sample, instead of typed text.
// { title, text, loadAttachment?, onClose?, jobKey?, tab?, sourceId? } - `text` is the source's bounded digest,
// and for a stored PDF `loadAttachment()` fetches the file only when the teaching starts (nothing is downloaded
// or billed before that). The propose -> review -> apply flow is exactly the same one; only the material and the
// ledger kind ('source') differ, and `onTaught(version)` tells the caller that something was really applied so
// the source can be marked taught.

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

// The key of the job this panel shows: an explicit one from the caller, else one per preset title; typed notes share one.
export function teachJobKeyFor(preset) { return preset ? (preset.jobKey || 'preset:' + String(preset.title || '')) : 'note'; }

export function EngineLearningPanel({ lang, profile, onChanged, preset, onTaught }) {
  const jobKey = teachJobKeyFor(preset);
  const job = useTeachJob(profile.id, jobKey);
  const [text, setText] = React.useState(() => (job && job.request.rawText) || '');
  const [kind, setKind] = React.useState(() => (!preset && job && job.request.kind) || 'note');
  const [notice, setNotice] = React.useState('');
  const noticeTimer = React.useRef(null);
  const changedRef = React.useRef(onChanged);
  changedRef.current = onChanged;
  React.useEffect(() => () => { if (noticeTimer.current) window.clearTimeout(noticeTimer.current); }, []);
  // The learning history changes when tokens are recorded or a proposal is applied - possibly while this panel was elsewhere.
  React.useEffect(() => subscribeTeachJobs((changedJob, change) => {
    if (change === 'ledger' && changedJob && changedJob.profileId === profile.id && changedRef.current) changedRef.current();
  }), [profile.id]);

  function flash(message) {
    setNotice(message);
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(''), 3200);
  }

  // idle | working | review - a failed job reads as idle with its error shown, so the trader can fix the input and try again.
  const phase = job && job.phase !== 'failed' ? job.phase : 'idle';
  const proposal = job ? job.proposal : null;
  const review = job ? job.review : null;
  const error = job && job.phase === 'failed' ? job.error : null;
  const currentUnderstanding = profile.understanding ? profile.understanding.summary : '';
  const trimmed = text.trim();
  // preset.editable (the Preview tab's "Correct this"): the preset supplies FIXED context (the
  // illustrative sample being corrected) but the trader must still type what is actually wrong with
  // it - a correction with no correction text would just resend the sample verbatim and teach
  // nothing. The Knowledge tab's source teaching has no such second input: preset.text alone (the
  // source's own digest) is the whole material.
  const requiresTypedText = !preset || preset.editable;
  const material = preset ? (preset.editable ? String(preset.text || '').trim() + (trimmed ? '\n\nTrader\'s correction: ' + trimmed : '') : String(preset.text || '').trim()) : trimmed;
  const label = preset ? String(preset.title || '').trim() : trimmed;
  // The Knowledge tab teaches from a source (the default); the Preview tab's "Correct this" reuses
  // this same panel but needs the ingest system prompt's distinct correction framing ("the teaching
  // material wins over the current understanding"), so it passes preset.kind explicitly.
  const teachKind = preset ? (preset.kind || 'source') : kind;

  // Starts (or restarts, after a failure) the job. The request runs in the job store, not here - see the header comment.
  function teach() {
    if ((requiresTypedText && !trimmed) || phase === 'working') return;
    setNotice('');
    startTeachJob({
      profile, lang, key: jobKey, kind: teachKind, tab: preset ? (preset.tab || 'preview') : 'memory', sourceId: preset ? preset.sourceId : null,
      title: label, label, material, loadAttachment: preset ? preset.loadAttachment : undefined, rawText: trimmed, context: preset ? String(preset.text || '') : ''
    });
  }

  // Retry after a failure re-sends exactly the request that failed (a source's digest, a stored PDF, the typed text) against the profile as it is now.
  function retry() { retryTeachJob(profile.id, jobKey, profile); }

  // The only writer, and only from this click: the reviewed proposal goes through the job store's single applyLearning() call.
  function apply() {
    const outcome = applyTeachJob(profile.id, jobKey);
    if (!outcome) return;
    setText('');
    if (outcome.saved) {
      flash(trt(lang, 'applied', { n: trDigits(lang, outcome.saved.understanding.version) }));
      if (preset && onTaught) onTaught(outcome.saved.understanding.version);
    }
  }

  function discard() { dismissTeachJob(profile.id, jobKey); }

  function saveNote() {
    const profiles = window.TradeJournalAnalysisProfileStore;
    if (!profiles || !trimmed) return;
    profiles.recordNote(profile.id, trimmed).then(() => { if (onChanged) onChanged(); });
    setText('');
    flash(trt(lang, 'noteSaved'));
  }

  const used = jobTokens(job);
  const accepted = review ? review.accepted : [];
  const priorities = review ? review.priorities : [];
  const understandingText = review ? review.understandingText : '';
  const applyUnderstanding = review ? review.applyUnderstanding : false;
  const acceptedCount = accepted.filter(Boolean).length + (applyUnderstanding && understandingText.trim() ? 1 : 0);
  const understandingChanged = Boolean(understandingText.trim()) && understandingText.trim() !== currentUnderstanding;
  const stale = isUnderstandingStale(job, profile);
  const edit = (patch) => updateTeachReview(profile.id, jobKey, patch);

  return (
    <Panel padding="18px 20px" data-teach-panel={jobKey}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: 'var(--parchment)' }}>
          <span style={{ color: 'var(--char-accent)' }}><Icon name="sparkle" size={17} /></span>{trt(lang, 'teachTitle')}
        </span>

        {phase === 'idle' && preset && (
          <React.Fragment>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.4)' }}>
              <span dir="auto" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{trt(lang, preset.headingKey || 'sourceTeaching', { title: label })}</span>
              {preset.loadAttachment && <span style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>{trt(lang, 'sourcePdfHint')}</span>}
            </div>
            {preset.editable && (
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} dir="auto" maxLength={2000}
                placeholder={trt(lang, 'correctPlaceholder')} style={{ ...fieldStyle, resize: 'vertical' }} />
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <Button variant="primary" size="sm" icon="sparkle" disabled={requiresTypedText && !trimmed} onClick={teach}>
                {trt(lang, preset.editable ? 'correctSubmitBtn' : 'teachBtn')}
              </Button>
              {preset.onClose && <Button variant="ghost" size="sm" icon="close" onClick={preset.onClose}>{trt(lang, preset.editable ? 'correctCancelBtn' : 'closePanel')}</Button>}
            </div>
            <span style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>{trt(lang, 'sourceTeachHint')}</span>
          </React.Fragment>
        )}

        {phase === 'idle' && !preset && (
          <React.Fragment>
            <div style={{ display: 'flex', gap: 6 }}>
              {[['note', 'teachKindNote'], ['correction', 'teachKindCorrection']].map(([id, key]) => (
                <button key={id} type="button" onClick={() => setKind(id)} style={{
                  height: 32, padding: '0 14px', borderRadius: 999, cursor: 'pointer', font: 'inherit', fontSize: 12,
                  border: '1px solid ' + (kind === id ? 'var(--char-accent)' : 'var(--border-hairline)'),
                  background: kind === id ? 'var(--char-active-surface)' : 'transparent', color: kind === id ? 'var(--char-accent)' : 'var(--text-muted)'
                }}>{trt(lang, key)}</button>
              ))}
            </div>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} dir="auto" maxLength={8000}
              placeholder={trt(lang, 'teachPlaceholder')} style={{ ...fieldStyle, resize: 'vertical' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <Button variant="primary" size="sm" icon="sparkle" disabled={!trimmed} onClick={teach}>{trt(lang, 'teachBtn')}</Button>
              <Button variant="ghost" size="sm" icon="check" disabled={!trimmed} onClick={saveNote}>{trt(lang, 'saveNoteBtn')}</Button>
            </div>
            <span style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>{trt(lang, 'teachHint')}</span>
          </React.Fragment>
        )}

        <div aria-live="polite" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {phase === 'working' && job && (
            <div data-teach-working="true" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.4)' }}>
              <LearningActivity lang={lang} job={job} />
              <StepRow working label={trt(lang, 'stepRead')} />
              <StepRow working label={trt(lang, 'stepExtract')} />
              <StepRow working label={trt(lang, 'stepUpdate')} />
            </div>
          )}
          <AiErrorNotice lang={lang} error={error} onRetry={retry} busy={phase === 'working'} />
          {notice && <span style={{ fontSize: 12, color: 'var(--success)' }}>{notice}</span>}
        </div>

        {phase === 'review' && proposal && review && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.4)' }}>
              <StepRow done label={trt(lang, 'resultRead')} />
              <StepRow done label={proposal.conceptsProposed.length ? trt(lang, 'resultConcepts', { n: trDigits(lang, proposal.conceptsProposed.length) }) : trt(lang, 'resultConceptsNone')} />
              <StepRow done label={trt(lang, understandingChanged ? 'resultUnderstandingChanged' : 'resultUnderstandingSame')} />
              {used > 0 && <span style={{ fontSize: 11, color: 'var(--text-dim)', paddingInlineStart: 29 }}>{trt(lang, 'tokensUsed', { n: trDigits(lang, used.toLocaleString('en-US')) })}</span>}
            </div>

            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--parchment)' }}>{trt(lang, 'reviewTitle')}</span>

            {understandingChanged && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 12, borderRadius: 10, border: '1px solid var(--divider-gold)', background: 'rgba(183,138,74,.06)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--gold-warm)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={applyUnderstanding} onChange={(e) => edit({ applyUnderstanding: e.target.checked })} style={{ accentColor: 'var(--char-accent)' }} />
                  {trt(lang, 'applyUnderstanding')}
                </label>
                {stale && <span role="alert" data-teach-stale="true" style={{ fontSize: 11.5, lineHeight: 1.8, color: 'var(--warning)' }}>{trt(lang, 'learnStale')}</span>}
                <span style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>{trt(lang, 'proposedUnderstanding')}</span>
                <textarea value={understandingText} onChange={(e) => edit({ understandingText: e.target.value })} rows={4} dir="auto" maxLength={4000} style={{ ...fieldStyle, resize: 'vertical' }} />
              </div>
            )}

            {proposal.conceptsProposed.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {proposal.conceptsProposed.map((concept, index) => (
                  <div key={concept.title} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderRadius: 10, border: '1px solid ' + (accepted[index] ? 'var(--char-accent)' : 'var(--border-hairline)'), background: accepted[index] ? 'var(--char-active-surface)' : 'transparent' }}>
                    <input type="checkbox" checked={Boolean(accepted[index])} onChange={(e) => edit({ accepted: accepted.map((v, i) => (i === index ? e.target.checked : v)) })} style={{ accentColor: 'var(--char-accent)', marginTop: 3 }} />
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, flex: 1 }}>
                      <span dir="auto" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{concept.title}</span>
                      {concept.description && <span dir="auto" style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>{concept.description}</span>}
                    </span>
                    <select value={priorities[index] || concept.priority} onChange={(e) => edit({ priorities: priorities.map((v, i) => (i === index ? e.target.value : v)) })}
                      style={{ height: 30, borderRadius: 6, border: '1px solid var(--border-hairline)', background: 'rgba(11,20,21,.6)', color: 'var(--text-primary)', font: 'inherit', fontSize: 11.5 }}>
                      <option value="mandatory">{trt(lang, 'priorityMandatory')}</option>
                      <option value="preferred">{trt(lang, 'priorityPreferred')}</option>
                      <option value="reference">{trt(lang, 'priorityReference')}</option>
                    </select>
                  </div>
                ))}
              </div>
            ) : (
              !understandingChanged && <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{trt(lang, 'reviewNothing')}</span>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="primary" size="sm" icon="check" disabled={acceptedCount === 0} onClick={apply}>{trt(lang, 'applyBtn', { n: trDigits(lang, acceptedCount) })}</Button>
              <Button variant="ghost" size="sm" icon="close" onClick={discard}>{trt(lang, 'discardBtn')}</Button>
              {preset && preset.onClose && <Button variant="ghost" size="sm" onClick={preset.onClose}>{trt(lang, 'learnLaterBtn')}</Button>}
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}
