import React from 'react';
import { Panel } from '../public/pages/shared/navrya/components/core/Panel.jsx';
import { Icon } from '../public/pages/shared/navrya/components/core/Icon.jsx';
import { Button } from '../public/pages/shared/navrya/components/forms/Button.jsx';
import { EngineLearningPanel } from './engineLearning.jsx';
import { MemorySyncPanel, useMemoryProjection } from './analysisProfileMemorySync.jsx';
import { MemoryGraphPanel, MemoryGraphWorkspace } from './analysisProfileBrain.jsx';
import { trt, trDigits, trDate } from './analysisProfileTrainingCopy.js';

// The Analysis Profile "Memory" tab (ARCHITECTURE.md §7.25): what the engine currently understands
// about how this trader reads a chart under this profile (editable by hand), the "teach the engine"
// panel, and the REAL learning history - every row is a genuine append-only ledger event fetched
// from GET /api/sync/analysis-profiles/:id/events (lazily, only when this tab opens), never a
// reconstructed or invented timeline. The token total is a real sum over the recorded events.

function store() { return window.TradeJournalAnalysisProfileStore; }

const EVENT_LABELS = {
  concept_added: 'evtConceptAdded', starter_concepts_added: 'evtStarter', concepts_ai_accepted: 'evtAiAccepted',
  ai_suggested_concepts: 'evtAiSuggested', ai_analyzed_note: 'evtAiAnalyzed', ai_analyzed_correction: 'evtAiAnalyzed',
  ai_analyzed_source: 'evtAiAnalyzed', taught_source: 'evtTaughtSource',
  taught_note: 'evtTaughtNote', taught_correction: 'evtTaughtCorrection', understanding_edited: 'evtUnderstandingEdited', note: 'evtNote'
};
function eventIcon(kind) {
  if (/^ai_/.test(kind)) return 'sparkle';
  if (/^taught_/.test(kind)) return 'check';
  if (kind === 'understanding_edited') return 'edit';
  if (kind === 'note') return 'quote';
  return 'plus';
}
function eventTokens(event) {
  const usage = event && event.tokenUsage;
  return usage ? (Number(usage.promptTokens) || 0) + (Number(usage.completionTokens) || 0) : 0;
}

function EventRow({ event, lang }) {
  const tokens = eventTokens(event);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '11px 0', borderBottom: '1px solid var(--border-hairline)' }}>
      <span style={{ flex: 'none', width: 28, height: 28, borderRadius: 8, display: 'grid', placeItems: 'center', color: 'var(--char-accent)', border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.5)' }}>
        <Icon name={eventIcon(event.kind)} size={14} />
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, flex: 1 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>{trt(lang, EVENT_LABELS[event.kind] || 'evtOther')}</span>
          {event.understandingVersion != null && (
            <span style={{ fontSize: 10.5, padding: '1px 7px', borderRadius: 5, border: '1px solid var(--border-hairline)', color: 'var(--text-dim)' }}>{trt(lang, 'understandingVersion', { n: trDigits(lang, event.understandingVersion) })}</span>
          )}
          {tokens > 0 && (
            <span style={{ fontSize: 10.5, padding: '1px 7px', borderRadius: 5, border: '1px solid var(--divider-gold)', color: 'var(--gold-warm)' }}>{trDigits(lang, tokens.toLocaleString('en-US'))} {trt(lang, 'tokens')}</span>
          )}
        </span>
        {event.title && <span dir="auto" style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{event.title}</span>}
      </span>
      <span style={{ flex: 'none', fontSize: 10.5, color: 'var(--text-dim)' }}>{trDate(lang, event.createdAt)}</span>
    </div>
  );
}

export function MemoryTab({ profile, lang, onManageConcepts }) {
  const profiles = store();
  const [events, setEvents] = React.useState([]);
  const [loaded, setLoaded] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState('');
  // The 3D workspace is a separate surface, opened deliberately - never mounted with the tab, so
  // the WebGL context and the vendored engine only ever exist once the trader asks for them.
  const [graphOpen, setGraphOpen] = React.useState(false);
  // AI proposals open in the teaching panel below (not accepted yet) - reported up so the sync status can list them as awaiting review.
  const [reviewing, setReviewing] = React.useState(0);
  // The graph and the sync status are ONE projection (analysisProfileMemorySync.jsx): a derived view of the saved profile, the engine context,
  // the ledger and the sources. It never writes and never calls AI; the picture shows the last SYNCED memory, and says when it is stale.
  const memory = useMemoryProjection(profile, lang, { reviewingCount: reviewing });
  const textId = 'nv-memory-text-' + String(profile.id).replace(/[^A-Za-z0-9_-]/g, '');
  const aliveRef = React.useRef(true);
  React.useEffect(() => { aliveRef.current = true; return () => { aliveRef.current = false; }; }, []);

  const reload = React.useCallback(() => {
    if (!profiles) return Promise.resolve();
    return profiles.listEvents(profile.id).then((list) => { if (aliveRef.current) { setEvents(list); setLoaded(true); } });
  }, [profiles, profile.id]);

  // Re-read the ledger whenever the profile's learned state changes from ANY tab (a concept added on
  // the Concepts tab, an accepted suggestion, ...) - but only after the in-flight ledger write for
  // that change has actually landed, otherwise the new row would be missing until the next visit.
  React.useEffect(() => {
    if (!profiles) return;
    profiles.settleEvents().then(reload);
  }, [profiles, reload, profile.understanding.version, profile.concepts.length]);

  const understanding = profile.understanding;
  function startEdit() { setDraft(understanding.summary); setEditing(true); }
  function saveUnderstanding() {
    if (!profiles) return;
    const text = draft.trim();
    if (text !== understanding.summary) {
      if (text) {
        profiles.applyLearning(profile.id, { understandingSummary: text, eventKind: 'understanding_edited', eventTitle: text.slice(0, 80) });
      } else {
        // Clearing the understanding is a deliberate reset - applyLearning() ignores an empty
        // proposal on purpose (an AI/teach flow must never wipe it), so a manual clear goes direct.
        profiles.update(profile.id, { understanding: { summary: '', version: understanding.version + 1, updatedAt: new Date().toISOString() } });
        profiles.recordEvent(profile.id, { kind: 'understanding_edited', title: '', understandingVersion: understanding.version + 1 }).catch(() => {});
      }
    }
    setEditing(false);
    profiles.settleEvents().then(reload);
  }

  const tokenTotal = events.reduce((sum, event) => sum + eventTokens(event), 0);
  const aiCount = events.filter((event) => eventTokens(event) > 0).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.9, color: 'var(--text-muted)', maxWidth: 760 }}>{trt(lang, 'memorySubtitle')}</p>

      {/* The band: the memory graph in two of five columns, what the engine understands in the
          other three. Both stack below 1120px - see navrya/memory-graph.css. */}
      <div className="nv-memory-band">
        <div className="nv-memory-graph">
          <MemoryGraphPanel profile={profile} lang={lang} onOpen={() => setGraphOpen(true)} graph={memory.projection.graph} describedBy={textId} />
        </div>
        <div className="nv-memory-understanding">
      <Panel padding="18px 20px" style={{ height: '100%' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--parchment)' }}>{trt(lang, 'understandingTitle')}</span>
            {understanding.version > 0 && (
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, color: 'var(--char-accent)', border: '1px solid var(--char-accent)', background: 'var(--char-active-surface)' }}>{trt(lang, 'understandingVersion', { n: trDigits(lang, understanding.version) })}</span>
            )}
            {understanding.updatedAt && <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{trt(lang, 'understandingUpdated', { date: trDate(lang, understanding.updatedAt) })}</span>}
            {!editing && <span style={{ marginInlineStart: 'auto' }}><Button variant="ghost" size="sm" icon="edit" onClick={startEdit}>{trt(lang, 'editUnderstanding')}</Button></span>}
          </div>
          {editing ? (
            <React.Fragment>
              <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={6} dir="auto" maxLength={4000}
                style={{ boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border-gold)', background: 'rgba(3,8,7,.55)', color: 'var(--text-primary)', font: 'inherit', fontSize: 13, lineHeight: 1.9, resize: 'vertical', outline: 'none', width: '100%' }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="primary" size="sm" icon="check" onClick={saveUnderstanding}>{trt(lang, 'saveUnderstanding')}</Button>
                <Button variant="ghost" size="sm" icon="close" onClick={() => setEditing(false)}>{trt(lang, 'cancel')}</Button>
              </div>
            </React.Fragment>
          ) : (
            <p dir="auto" style={{ margin: 0, fontSize: 13, lineHeight: 2, color: understanding.summary ? 'var(--text-primary)' : 'var(--text-dim)', whiteSpace: 'pre-wrap' }}>
              {understanding.summary || trt(lang, 'understandingEmpty')}
            </p>
          )}
        </div>
      </Panel>
        </div>
      </div>

      <MemorySyncPanel lang={lang} memory={memory} textId={textId} />

      <EngineLearningPanel lang={lang} profile={profile} onChanged={reload} onReviewChange={setReviewing} />

      <Panel padding="18px 20px">
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap', paddingBottom: 6 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--parchment)' }}>{trt(lang, 'historyTitle')}</span>
            {loaded && events.length > 0 && (
              <span style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 11, color: 'var(--text-dim)' }}>
                <span>{trt(lang, 'historyEvents', { n: trDigits(lang, events.length) })}</span>
                {aiCount > 0 && <span>{trt(lang, 'historyAi', { n: trDigits(lang, aiCount) })}</span>}
                <span>{trt(lang, 'historyTokens', { n: trDigits(lang, tokenTotal.toLocaleString('en-US')) })}</span>
              </span>
            )}
          </div>
          {loaded && events.length === 0 && <span style={{ fontSize: 12, color: 'var(--text-dim)', padding: '12px 0' }}>{trt(lang, 'historyEmpty')}</span>}
          {events.map((event) => <EventRow key={event.id} event={event} lang={lang} />)}
        </div>
      </Panel>

      {graphOpen && (
        <MemoryGraphWorkspace
          profile={profile} lang={lang} graph={memory.projection.graph}
          onClose={() => setGraphOpen(false)}
          // Editing a concept belongs to the Concepts tab and its existing applyLearning()/update()
          // paths; the graph never grows a second form for the same records.
          onManageConcepts={() => { if (onManageConcepts) onManageConcepts(); }}
        />
      )}
    </div>
  );
}
