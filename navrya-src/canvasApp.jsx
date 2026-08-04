import React from 'react';
import { createRoot } from 'react-dom/client';
import { Panel } from '../public/pages/shared/navrya/components/core/Panel.jsx';
import { ListRow } from '../public/pages/shared/navrya/components/core/ListRow.jsx';
import { Button } from '../public/pages/shared/navrya/components/forms/Button.jsx';
import { TextField } from '../public/pages/shared/navrya/components/forms/TextField.jsx';
import { Notice } from '../public/pages/shared/navrya/components/feedback/Notice.jsx';
import { MetricTile } from '../public/pages/shared/navrya/components/metrics/MetricTile.jsx';
import { ProgressRing } from '../public/pages/shared/navrya/components/metrics/ProgressRing.jsx';
import { Icon } from '../public/pages/shared/navrya/components/core/Icon.jsx';
import * as panelsAdapter from './panelsAdapter.js';
import { stringsFor, isRtl } from './i18n.js';
import { currentNavryaCharacter } from './currentCharacter.js';

// Real numbers only where a real source exists; every other widget type shows an honest
// "insufficient data" card instead of the old fabricated percentages/prices, per this app's
// established standard (Pattern/Strategy reports, trade psychology, Admin financial tab).
function useTradeAnalytics() {
  const [analytics, setAnalytics] = React.useState(null);
  React.useEffect(() => {
    const store = window.TradeJournalTradeStore;
    if (store) setAnalytics(store.analytics());
  }, []);
  return analytics;
}

function useActiveStrategies() {
  const [rows, setRows] = React.useState(null);
  React.useEffect(() => {
    const store = window.TradeJournalStrategyEducationStore;
    if (!store) return;
    setRows(store.listActive().map((strategy) => ({ id: strategy.id, title: strategy.name || strategy.title || strategy.id, stats: store.detectionStats(strategy) })));
  }, []);
  return rows;
}

function InsufficientDataPanel({ title, message }) {
  return (
    <Panel variant="base" radius={12} style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ font: 'var(--type-caption)', letterSpacing: 'var(--tracking-label)', color: 'var(--text-muted)' }}>{title}</span>
      <span style={{ font: 'var(--type-body)', color: 'var(--text-muted)' }}>{message}</span>
    </Panel>
  );
}

function PanelCard({ panel, t, actions, children }) {
  return (
    <Panel variant="base" radius={12} style={{ gridColumn: 'span ' + Math.max(1, Math.min(4, panel.span || 1)), padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <span style={{ font: 'var(--type-body)', fontWeight: 600, color: 'var(--parchment)' }}>{panel.title || t[panel.type] || t.overview}</span>
        <div style={{ display: 'flex', gap: 4 }}>{actions}</div>
      </div>
      {children}
    </Panel>
  );
}

function CardActionButton({ icon, label, onClick, disabled }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={label} aria-label={label} style={{
      width: 26, height: 26, borderRadius: 6, border: '1px solid var(--border-hairline)', background: 'transparent',
      color: 'var(--text-muted)', cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? .4 : 1, display: 'grid', placeItems: 'center'
    }}><Icon name={icon} size={14} /></button>
  );
}

function PanelBody({ panel, t, analytics, strategies }) {
  if (panel.type === 'open-trades') {
    const ref = React.useRef(null);
    React.useEffect(() => {
      if (ref.current && window.TradeJournalOpenPositionsModule) {
        ref.current.replaceChildren(window.TradeJournalOpenPositionsModule.render({ compact: true, location: 'panel' }));
      }
    }, []);
    return <div ref={ref} />;
  }
  if (panel.custom) return <p style={{ margin: 0, font: 'var(--type-body)', color: 'var(--text-muted)' }}>{panel.description}</p>;
  if (panel.type === 'metric') {
    if (!analytics) return <InsufficientDataPanel title={t.overview} message={t.insufficientData} />;
    return (
      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        <MetricTile icon="scenarios" label={t.totalTrades} value={String(analytics.total)} />
        <MetricTile icon="execution" label={t.wins} value={analytics.funnel.closed ? String(analytics.funnel.wins) + '/' + String(analytics.funnel.closed) : '—'} />
      </div>
    );
  }
  if (panel.type === 'strategy') {
    if (!strategies || !strategies.length) return <InsufficientDataPanel title={t.strategy} message={t.insufficientData} />;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {strategies.slice(0, 4).map((s) => (
          <ListRow key={s.id} title={s.title} value={s.stats.confirmationRate === null ? '—' : s.stats.confirmationRate + '%'} progress={s.stats.confirmationRate} />
        ))}
      </div>
    );
  }
  if (panel.type === 'focus') return <ProgressRing value={null} label={t.focus} emptyLabel={t.noData} />;
  if (panel.type === 'watch' || panel.type === 'notes' || panel.type === 'ai') {
    return <InsufficientDataPanel title={t[panel.type]} message={t.insufficientData} />;
  }
  return <InsufficientDataPanel title={t.overview} message={t.insufficientData} />;
}

function CanvasView({ view, character }) {
  const [tick, setTick] = React.useState(0);
  const lang = document.documentElement.lang || 'fa';
  const t = stringsFor(lang);
  const rtl = isRtl(lang);
  const analytics = useTradeAnalytics();
  const strategies = useActiveStrategies();
  const panels = panelsAdapter.loadPanels(character, view).filter((p) => p.visible !== false);

  function act(id, action) { panelsAdapter.updatePanel(character, view, id, action); setTick((x) => x + 1); }

  function goToSettings() { const layer = window.TradeJournalPanelLayer; if (layer) layer.render('settings'); }
  function openPatternRegistry() { if (window.TradeJournalPatternRegistry) window.TradeJournalPatternRegistry.open(); }

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} style={{ direction: rtl ? 'rtl' : 'ltr', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h2 style={{ margin: '0 0 4px', font: 'var(--type-display-md)', fontSize: 22, color: 'var(--parchment)' }}>{t[view === 'strategies' ? 'navStrategies' : 'navDashboard']}</h2>
        <p style={{ margin: 0, font: 'var(--type-body)', color: 'var(--text-muted)' }}>{t.canvasHint}</p>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {view === 'strategies' && <Button variant="primary" icon="strategies" onClick={openPatternRegistry}>{t.patternRegistry}</Button>}
        <Button variant="secondary" icon="plus" onClick={goToSettings}>{t.addPanel}</Button>
        <Button variant="ghost" icon="settings" onClick={goToSettings}>{t.manage}</Button>
      </div>
      {!panels.length ? (
        <InsufficientDataPanel title={t[view === 'strategies' ? 'navStrategies' : 'navDashboard']} message={t.noPanels} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
          {panels.map((panel) => (
            <PanelCard
              key={panel.id} panel={panel} t={t}
              actions={[
                <CardActionButton key="s" icon="minus" label={t.hide} onClick={() => act(panel.id, 'shrink')} disabled={panel.span <= 1} />,
                <CardActionButton key="e" icon="plus" label={t.show} onClick={() => act(panel.id, 'expand')} disabled={panel.span >= 4} />,
                <CardActionButton key="h" icon="close" label={t.hide} onClick={() => act(panel.id, 'hide')} />
              ]}
            >
              <PanelBody panel={panel} t={t} analytics={analytics} strategies={strategies} />
            </PanelCard>
          ))}
        </div>
      )}
    </div>
  );
}

function SettingsView({ character }) {
  const [managedView, setManagedView] = React.useState('dashboard');
  const [tick, setTick] = React.useState(0);
  const [prompt, setPrompt] = React.useState('');
  const lang = document.documentElement.lang || 'fa';
  const t = stringsFor(lang);
  const rtl = isRtl(lang);
  const panels = panelsAdapter.loadPanels(character, managedView);

  function act(id, action) { panelsAdapter.updatePanel(character, managedView, id, action); setTick((x) => x + 1); }
  function create() {
    if (!prompt.trim()) return;
    panelsAdapter.addCustomPanel(character, managedView, prompt.trim());
    setPrompt('');
    setTick((x) => x + 1);
  }

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} style={{ direction: rtl ? 'rtl' : 'ltr', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h2 style={{ margin: 0, font: 'var(--type-display-md)', fontSize: 22, color: 'var(--parchment)' }}>{t.navSettings}</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        <Panel variant="base" radius={12} style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h3 style={{ margin: 0, font: 'var(--type-body)', fontWeight: 700, color: 'var(--parchment)' }}>{t.manage}</h3>
          <div style={{ display: 'flex', gap: 6 }}>
            {['dashboard', 'sessions', 'strategies'].map((v) => (
              <Button key={v} variant={v === managedView ? 'primary' : 'ghost'} size="sm" onClick={() => setManagedView(v)}>{t['nav' + v.charAt(0).toUpperCase() + v.slice(1)] || v}</Button>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {panels.map((panel) => (
              <ListRow
                key={panel.id} title={panel.title || t[panel.type] || t.overview} value={panel.span + '/4'}
                actions={[
                  <CardActionButton key="s" icon="minus" label={t.hide} onClick={() => act(panel.id, 'shrink')} disabled={panel.span <= 1} />,
                  <CardActionButton key="e" icon="plus" label={t.show} onClick={() => act(panel.id, 'expand')} disabled={panel.span >= 4} />,
                  <CardActionButton key="t" icon={panel.visible === false ? 'expand' : 'close'} label={panel.visible === false ? t.show : t.hide} onClick={() => act(panel.id, 'toggle')} />
                ]}
              />
            ))}
          </div>
        </Panel>
        <Panel variant="base" radius={12} style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h3 style={{ margin: 0, font: 'var(--type-body)', fontWeight: 700, color: 'var(--parchment)' }}>{t.aiPanelBuilder}</h3>
          <Notice icon="status">{t.secure}</Notice>
          <textarea
            value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={t.prompt} rows={4}
            style={{ resize: 'vertical', borderRadius: 8, padding: '10px 12px', background: 'rgba(11,20,21,.55)', border: '1px solid var(--border-hairline)', color: 'var(--text-primary)', font: 'var(--type-body)', outline: 'none' }}
          />
          <Button variant="primary" onClick={create}>{t.build}</Button>
        </Panel>
        <Panel variant="base" radius={12} style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h3 style={{ margin: 0, font: 'var(--type-body)', fontWeight: 700, color: 'var(--parchment)' }}>{t.characterTheme}</h3>
          <p style={{ margin: 0, font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{t.characterThemeHint}</p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {['Hunter', 'Engineer', 'Commander', 'Market Sage'].map((name) => (
              <span key={name} style={{ padding: '4px 10px', borderRadius: 999, border: '1px solid var(--border-gold)', font: 'var(--type-caption)', color: 'var(--text-primary)' }}>{name}</span>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

class DebugBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return <pre style={{ color: '#fbb', background: '#200', padding: 16, whiteSpace: 'pre-wrap' }}>{'[navrya canvas] ' + (this.state.error.stack || this.state.error.message)}</pre>;
    }
    return this.props.children;
  }
}

export function renderCanvas(character, view) {
  const container = document.createElement('div');
  // panel-system.css hides any direct child of .content that lacks this class while
  // .content.panel-mode is active (display:none !important) - the same class
  // makeCanvas()/makeSettings() and every workspace page already use.
  container.className = 'panel-page';
  // This container is a sibling of the data-character-tagged Sidebar/Header roots, not a
  // descendant of them, so it needs its own data-character for --char-accent etc. to resolve
  // to this character's palette instead of characters.css's neutral :root default.
  container.dataset.character = currentNavryaCharacter();
  createRoot(container).render(
    <DebugBoundary>
      {view === 'settings' ? <SettingsView character={character} /> : <CanvasView view={view} character={character} />}
    </DebugBoundary>
  );
  return container;
}
