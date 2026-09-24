import React from 'react';
import { Panel } from '../public/pages/shared/navrya/components/core/Panel.jsx';
import { Icon } from '../public/pages/shared/navrya/components/core/Icon.jsx';
import { Button } from '../public/pages/shared/navrya/components/forms/Button.jsx';
import { Chip } from '../public/pages/shared/navrya/components/forms/Chip.jsx';
import { AWAITING_REVIEW, buildMemoryProjection, compareProjection } from './analysisProfileMemoryProjection.js';
import { trt, trDate, trDigits } from './analysisProfileTrainingCopy.js';

// Memory Sync (ARCHITECTURE.md §7.25): the Memory tab's "Sync memory" action and its status, on top of the pure projection
// (analysisProfileMemoryProjection.js). It is a derived view - it reads the canonical profile, the context the Session prompt is built
// from, the learning ledger and the knowledge sources, and it WRITES NOTHING: no store call, no second persistence path, no AI request,
// no tokens. "Sync" only recomputes the view from what is saved; content becomes engine memory only through the existing
// applyLearning() funnel (or a manual edit), which changes the profile's revision - the synchronisation identity - and marks the view
// stale until the next sync includes it.

function store() { return window.TradeJournalAnalysisProfileStore; }
function analysisContext() { return window.TradeJournalAnalysisContext; }

// The canonical profile and its engine-visible context, read fresh (never from a prop that may be one render behind).
export function readLive(profileId, fallbackProfile) {
  const profiles = store();
  const profile = (profiles && typeof profiles.get === 'function' && profiles.get(profileId)) || fallbackProfile || null;
  const ctx = analysisContext();
  const context = ctx && profile ? ctx.getAnalysisContext(profile.id) : null;
  return { profile: profile ? JSON.parse(JSON.stringify(profile)) : null, context };
}

// A child-table read that failed is "not recorded" (null), never an invented empty list.
function safe(promise) { return Promise.resolve(promise).then((value) => (Array.isArray(value) ? value : null), () => null); }

// Everything one sync reads, and ONLY reads: the canonical profile + its engine context, then the ledger, the knowledge sources and the
// teaching chat (three GETs). No write, no AI route, no token - a sync that changed anything would not be a sync.
export async function loadSyncInputs(profileId) {
  const profiles = store();
  const fresh = readLive(profileId, null);
  if (!profiles) return { ...fresh, events: null, sources: null, messages: null };
  const [events, sources, messages] = await Promise.all([
    safe(typeof profiles.settleEvents === 'function' ? profiles.settleEvents().then(() => profiles.listEvents(profileId)) : null),
    safe(typeof profiles.listSources === 'function' ? profiles.listSources(profileId) : null),
    safe(typeof profiles.listMessages === 'function' ? profiles.listMessages(profileId) : null)
  ]);
  return { ...fresh, events, sources, messages };
}

export function useMemoryProjection(profile, lang, options) {
  const reviewingCount = (options && options.reviewingCount) || 0;
  const [inputs, setInputs] = React.useState(() => ({ ...readLive(profile.id, profile), events: null, sources: null, messages: null }));
  const [live, setLive] = React.useState(null);            // the live profile/context once an event says it changed
  const [syncing, setSyncing] = React.useState(false);
  const [syncedAt, setSyncedAt] = React.useState(() => Date.now());
  const aliveRef = React.useRef(true);
  const syncingRef = React.useRef(false);
  const idRef = React.useRef(profile.id);
  idRef.current = profile.id;
  React.useEffect(() => { aliveRef.current = true; return () => { aliveRef.current = false; }; }, []);

  const registries = { styles: window.TradeJournalAnalysisStyleRegistry, focuses: window.TradeJournalAnalysisFocusRegistry };
  const projection = React.useMemo(
    () => buildMemoryProjection({ ...inputs, reviewingCount, styles: registries.styles, focuses: registries.focuses, lang }),
    [inputs, reviewingCount, lang]
  );

  // The existing profile-changed event is what marks the projection stale: every edit, accepted chat proposal, accepted source teaching,
  // manual concept and manual understanding edit ends in a profile save, and the store announces each one with it.
  React.useEffect(() => {
    function onChanged() { setLive(readLive(idRef.current, null)); }
    window.addEventListener('tradejournal:analysis-profiles-changed', onChanged);
    return () => window.removeEventListener('tradejournal:analysis-profiles-changed', onChanged);
  }, []);

  const liveProjection = React.useMemo(() => {
    if (!live || !live.profile) return null;
    return buildMemoryProjection({ profile: live.profile, context: live.context, styles: registries.styles, focuses: registries.focuses, lang });
  }, [live, lang]);
  const comparison = React.useMemo(() => compareProjection(projection, liveProjection || projection), [projection, liveProjection]);

  const sync = React.useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      const id = idRef.current;
      const loaded = await loadSyncInputs(id);
      if (!aliveRef.current || idRef.current !== id) return;
      setInputs(loaded);
      setLive(null);
      setSyncedAt(Date.now());
    } finally {
      syncingRef.current = false;
      if (aliveRef.current) setSyncing(false);
    }
  }, []);

  // One sync on open (the ledger, the sources and the chat are read here, once) and again if the trader opens another profile.
  React.useEffect(() => { sync(); }, [profile.id, sync]);

  return { projection, comparison, status: comparison.status, syncing, sync, syncedAt, revision: projection.revision };
}

/* ------------------------------------------------------------------ view --- */

const KIND_ICON = { pdf: 'file-text', website: 'globe', youtube: 'youtube' };
const PENDING_LIMIT = 6;

function shortRevision(revision) { return String(revision || '').replace(/^sig:.*/, 'sig').slice(0, 8); }

function figure(lang, value) { return value == null ? trt(lang, 'memoryNotRecorded') : trDigits(lang, value); }

function Indicator({ icon, title, primary, secondary }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, minWidth: 0, padding: '9px 10px', borderRadius: 8, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.35)' }}>
      <span style={{ color: 'var(--char-accent)', display: 'inline-flex', marginTop: 1 }}><Icon name={icon} size={15} /></span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span style={{ fontSize: 10.5, letterSpacing: '.06em', color: 'var(--text-dim)' }}>{title}</span>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}>{primary}</span>
        {secondary && <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{secondary}</span>}
      </span>
    </div>
  );
}

function changeSummary(lang, comparison) {
  const { added, removed, changed } = comparison.changes;
  const parts = [];
  if (added.length) parts.push(trt(lang, 'memoryChangesAdded', { n: trDigits(lang, added.length) }));
  if (changed.length) parts.push(trt(lang, 'memoryChangesChanged', { n: trDigits(lang, changed.length) }));
  if (removed.length) parts.push(trt(lang, 'memoryChangesRemoved', { n: trDigits(lang, removed.length) }));
  return parts.length ? parts.join(' · ') : trt(lang, 'memoryChangesRevisionOnly');
}

function pendingTitle(lang, item) {
  if (item.open) return trt(lang, 'memoryOpenProposal', { n: trDigits(lang, item.count) });
  return item.title || trt(lang, 'graphUnnamed');
}

// The textual equivalent of the graph: the same memory as a plain list, for readers who cannot use the picture. Always in the page
// (a native <details>, keyboard-operable), and named by the graph preview through aria-describedby.
function MemoryTextEquivalent({ lang, memory, id }) {
  const { projection, comparison } = memory;
  const nodes = projection.graph.nodes;
  const labelOf = (node) => node.label || trt(lang, 'graphUnnamed');
  const flag = (node) => (comparison.nodeStatus[node.id] === 'stale' ? ' (' + trt(lang, 'memoryNodeChanged') + ')' : '');
  const lens = nodes.filter((n) => n.kind === 'primary-style' || n.kind === 'secondary-style');
  const focus = nodes.filter((n) => n.kind === 'focus' || n.kind === 'custom-focus');
  const concepts = nodes.filter((n) => n.kind === 'concept');
  const none = trt(lang, 'memoryTextNone');
  const rows = [
    [trt(lang, 'memoryTextLens'), lens.length ? lens.map((n) => labelOf(n) + flag(n)).join(', ') : none],
    [trt(lang, 'memoryTextFocus'), focus.length ? focus.map((n) => labelOf(n) + flag(n)).join(', ') : none],
    [trt(lang, 'memoryTextConcepts'), concepts.length ? concepts.map((n) => labelOf(n) + (n.priority === 'mandatory' ? ' *' : '') + flag(n)).join(', ') : none],
    [trt(lang, 'memoryTextUnderstanding'), projection.engine.understanding.has ? trt(lang, 'understandingVersion', { n: trDigits(lang, projection.engine.understanding.version) }) : none]
  ];
  return (
    <details id={id} style={{ fontSize: 12, color: 'var(--text-muted)' }}>
      <summary style={{ cursor: 'pointer', fontSize: 11.5, color: 'var(--char-accent)' }}>{trt(lang, 'memoryTextTitle')}</summary>
      <dl style={{ margin: '8px 0 0', display: 'grid', gridTemplateColumns: 'minmax(96px, max-content) 1fr', gap: '6px 12px' }}>
        {rows.map(([term, value]) => (
          <React.Fragment key={term}>
            <dt style={{ color: 'var(--text-dim)' }}>{term}</dt>
            <dd dir="auto" style={{ margin: 0, overflowWrap: 'anywhere' }}>{value}</dd>
          </React.Fragment>
        ))}
      </dl>
    </details>
  );
}

export function MemorySyncPanel({ lang, memory, textId }) {
  const { projection, comparison, status, syncing, sync, syncedAt } = memory;
  const stale = status === 'stale';
  const awaiting = projection.counts.awaitingTeaching + projection.counts.awaitingReview;
  const { sources, ledger } = projection;
  const shown = projection.pending.slice(0, PENDING_LIMIT);
  return (
    <Panel padding="16px 18px" data-memory-sync="true" data-sync-status={status}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: '16px 28px', alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--char-accent)', display: 'inline-flex' }}><Icon name="refresh-cw" size={15} /></span>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--parchment)' }}>{trt(lang, 'memorySyncTitle')}</span>
          <span role="status" style={{ marginInlineStart: 'auto', display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
            <Chip tone={stale ? 'warning' : 'success'} dot data-chip="sync-status">{trt(lang, stale ? 'memoryStatusStale' : 'memoryStatusCurrent')}</Chip>
            {awaiting > 0 && <Chip tone="gold" data-chip="pending-review">{trt(lang, 'memoryStatusPending', { n: trDigits(lang, awaiting) })}</Chip>}
          </span>
        </div>

        <div dir="ltr" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 10.5, color: 'var(--text-dim)' }}>
          <span data-revision={projection.revision}>{trt(lang, 'memoryRevision', { id: shortRevision(projection.revision) })}</span>
          <span dir="auto">{trt(lang, 'memorySyncedAt', { time: trDate(lang, new Date(syncedAt).toISOString()) })}</span>
        </div>

        {stale && (
          <div role="alert" data-memory-stale="true" style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: '9px 11px', borderRadius: 8, border: '1px solid rgba(255,176,32,.45)', background: 'rgba(255,176,32,.07)' }}>
            <span style={{ color: 'var(--warning)', display: 'inline-flex', marginTop: 1 }}><Icon name="triangle-alert" size={15} /></span>
            <span dir="auto" style={{ fontSize: 12, lineHeight: 1.8, color: 'var(--text-primary)' }}>{trt(lang, 'memoryStaleBanner', { changes: changeSummary(lang, comparison) })}</span>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Button variant={stale ? 'primary' : 'secondary'} size="sm" icon="refresh-cw" loading={syncing} disabled={syncing} onClick={sync}>
            {trt(lang, syncing ? 'memorySyncing' : 'memorySyncBtn')}
          </Button>
          <span style={{ fontSize: 10.5, lineHeight: 1.7, color: 'var(--text-dim)', flex: '1 1 180px' }}>{trt(lang, 'memorySyncNote')}</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
          <Indicator icon="globe" title={trt(lang, 'memorySourcesTitle')}
            primary={sources.available ? trt(lang, 'memorySourcesIndicator', { n: figure(lang, sources.total), m: figure(lang, sources.taught) }) : trt(lang, 'memoryNotRecorded')}
            secondary={sources.available && sources.awaiting > 0 ? trt(lang, 'memorySourcesAwaiting', { n: trDigits(lang, sources.awaiting) }) : null} />
          <Indicator icon="sparkle" title={trt(lang, 'memoryLessonsTitle')}
            primary={ledger.available ? trt(lang, 'memoryLessonsIndicator', { n: figure(lang, ledger.total), m: figure(lang, ledger.aiAssisted) }) : trt(lang, 'memoryNotRecorded')}
            secondary={ledger.available && ledger.lastAt ? trt(lang, 'graphLastLearned', { date: trDate(lang, ledger.lastAt) }) : null} />
        </div>

      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
        <section aria-label={trt(lang, 'memoryPendingTitle')} data-memory-pending="true" style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5, fontWeight: 600, color: 'var(--gold-warm)' }}>
            <Icon name="hourglass" size={13} />{trt(lang, 'memoryPendingTitle')}
          </span>
          {awaiting === 0 ? (
            <span style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>{trt(lang, 'memoryPendingNone')}</span>
          ) : (
            <React.Fragment>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {shown.map((item) => (
                  <li key={item.id} data-pending-kind={item.kind} data-pending-status={item.status} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px', borderRadius: 8, border: '1px dashed rgba(214,175,107,.42)', background: 'rgba(3,8,7,.35)', minWidth: 0 }}>
                    <span style={{ color: 'var(--gold-warm)', display: 'inline-flex', flex: 'none' }}><Icon name={item.kind === 'source' ? (KIND_ICON[item.sourceKind] || 'link') : item.kind === 'note' ? 'quote' : 'sparkle'} size={14} /></span>
                    <span dir="auto" style={{ fontSize: 12, color: 'var(--text-primary)', minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pendingTitle(lang, item)}</span>
                    <Chip tone="neutral">{trt(lang, item.status === AWAITING_REVIEW ? 'memoryAwaitingReview' : 'memoryAwaitingTeaching')}</Chip>
                  </li>
                ))}
              </ul>
              {projection.pending.length > shown.length && <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{trt(lang, 'memoryPendingMore', { n: trDigits(lang, projection.pending.length - shown.length) })}</span>}
              <span style={{ fontSize: 10.5, lineHeight: 1.7, color: 'var(--text-dim)' }}>{trt(lang, 'memoryPendingNote')}</span>
            </React.Fragment>
          )}
        </section>

        <MemoryTextEquivalent lang={lang} memory={memory} id={textId} />
      </div>
      </div>
    </Panel>
  );
}
