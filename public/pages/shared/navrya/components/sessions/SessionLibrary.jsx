import React from 'react';
import { Button } from '../forms/Button.jsx';
import { Select } from '../forms/Select.jsx';
import { SearchField } from '../forms/SearchField.jsx';
import { ViewToggle } from '../forms/ViewToggle.jsx';
import { SessionEmptyState } from './SessionEmptyState.jsx';
import { SessionCard } from './SessionCard.jsx';
import { NewSessionDialog } from './NewSessionDialog.jsx';

export const SESSION_FILTERS = ['All sessions', 'London', 'New York', 'Tokyo', 'Sydney'];
export const SESSION_SORTS = ['Newest', 'Oldest', 'Most entries'];
export const ALL_INSTRUMENTS = 'All instruments';

/* The Session Library ledger module — heading + CTA, command toolbar, session field. */
export function SessionLibrary({
  title = 'Session Library',
  subtitle = 'Log your trades, follow your risk, and find your best hunts.',
  newSessionLabel = 'New session', emptyStateProps, newSessionDialogProps,
  sessions = [], edition, onNewSession, style, ...rest
}) {
  const [filter, setFilter] = React.useState(SESSION_FILTERS[0]);
  const [instrumentFilter, setInstrumentFilter] = React.useState(ALL_INSTRUMENTS);
  const [sort, setSort] = React.useState(SESSION_SORTS[0]);
  const [query, setQuery] = React.useState('');
  const [view, setView] = React.useState('grid');
  const [dialog, setDialog] = React.useState(false);

  // Instrument Catalog domain: populated from the catalog itself plus any instrument already
  // assigned to a real session, so a code the user added but hasn't used in a session yet still
  // appears - a legacy/unclassified session (instrument '—') is filtered out by any real choice,
  // never lumped in as if it matched every instrument.
  const instrumentOptions = React.useMemo(() => {
    const catalogStore = window.TradeJournalInstrumentCatalogStore;
    const catalogCodes = catalogStore ? catalogStore.listSync().map((item) => item.code) : [];
    const sessionCodes = sessions.map((s) => s.instrument).filter((code) => code && code !== '—');
    return [ALL_INSTRUMENTS, ...Array.from(new Set([...catalogCodes, ...sessionCodes])).sort()];
  }, [sessions]);

  // Lets the AI Action Registry's session.create action open this dialog from outside this root
  // (its own open/known-field state is private useState, same as every other NAVRYA dialog) - the
  // same cross-root CustomEvent convention navrya-src/chatDockView.jsx already uses for
  // tradejournal:ai-settings-changed/tradejournal:ai-resume-conversation.
  React.useEffect(() => {
    function onAiOpenNewSession() { setDialog(true); }
    window.addEventListener('tradejournal:ai-open-new-session', onAiOpenNewSession);
    return () => window.removeEventListener('tradejournal:ai-open-new-session', onAiOpenNewSession);
  }, []);

  const visible = sessions
    .filter((s) => {
      const cityOk = filter === 'All sessions' || s.city === filter;
      const instrumentOk = instrumentFilter === ALL_INSTRUMENTS || s.instrument === instrumentFilter;
      const q = query.trim().toLowerCase();
      return cityOk && instrumentOk && (!q || (s.title || '').toLowerCase().includes(q));
    })
    .slice()
    .sort((a, b) => {
      if (sort === 'Oldest') return (a.sortTimestamp || 0) - (b.sortTimestamp || 0);
      if (sort === 'Most entries') return (b.sortEntryCount || 0) - (a.sortEntryCount || 0);
      return (b.sortTimestamp || 0) - (a.sortTimestamp || 0); // Newest first (default)
    });

  return (
    <section
      style={{
        boxSizing: 'border-box', padding: 20, borderRadius: 14,
        border: '1px solid var(--border-gold)', background: 'color-mix(in srgb, var(--char-atmosphere) 42%, var(--ink-950))',
        boxShadow: '0 18px 38px rgba(0,0,0,.34)',
        display: 'flex', flexDirection: 'column', gap: 16, ...style
      }}
      {...rest}
    >
      <div style={{ minHeight: 44, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h2 style={{ margin: 0, font: 'var(--type-body)', fontSize: 20, lineHeight: '25px', fontWeight: 600, color: 'var(--parchment)' }}>{title}</h2>
        <p style={{ margin: 0, font: 'var(--type-body)', fontSize: 12, lineHeight: '18px', color: 'var(--text-muted)' }}>{subtitle}</p>
      </div>

      <div style={{ display: 'flex', gap: 9, alignItems: 'center', flexWrap: 'wrap' }}>
        <Button variant="primary" icon="new-session" iconAfter="plus" onClick={() => setDialog(true)}>{newSessionLabel}</Button>
        <Select value={filter} onChange={setFilter} options={SESSION_FILTERS} icon="filter" width={190} />
        <Select value={instrumentFilter} onChange={setInstrumentFilter} options={instrumentOptions} icon="target" width={170} />
        <SearchField value={query} onChange={setQuery} style={{ flex: '1 1 220px', minWidth: 200 }} />
        <Select value={sort} onChange={setSort} options={SESSION_SORTS} icon="sort" width={180} />
        <ViewToggle value={view} onChange={setView} style={{ marginInlineStart: 'auto' }} />
      </div>

      {visible.length === 0 ? (
        <SessionEmptyState {...emptyStateProps} />
      ) : (
        <div style={{
          display: 'grid', gap: 16,
          gridTemplateColumns: view === 'grid' ? 'repeat(auto-fill, minmax(340px, 1fr))' : '1fr'
        }}>
          {visible.map((s, i) => {
            const { sortTimestamp, sortEntryCount, ...cardProps } = s;
            return <SessionCard key={s.id || i} edition={edition} {...cardProps} layout={view === 'grid' ? 'compact' : 'row'} />;
          })}
        </div>
      )}
      <NewSessionDialog
        open={dialog} onClose={() => setDialog(false)}
        onCreate={(values) => { setDialog(false); return onNewSession ? onNewSession(values) : undefined; }}
        {...newSessionDialogProps}
      />
    </section>
  );
}
