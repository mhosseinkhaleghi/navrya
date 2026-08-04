import React from 'react';
import { createRoot } from 'react-dom/client';
import { Panel } from '../public/pages/shared/navrya/components/core/Panel.jsx';
import { Button } from '../public/pages/shared/navrya/components/forms/Button.jsx';
import { MetricTile } from '../public/pages/shared/navrya/components/metrics/MetricTile.jsx';
import { ListRow } from '../public/pages/shared/navrya/components/core/ListRow.jsx';
import { Modal } from '../public/pages/shared/navrya/components/feedback/Modal.jsx';
import { TextField } from '../public/pages/shared/navrya/components/forms/TextField.jsx';
import { Toggle } from '../public/pages/shared/navrya/components/forms/Toggle.jsx';
import { showToast } from './toast.js';
import { currentNavryaCharacter } from './currentCharacter.js';

// Wraps a DOM node built by an existing legacy function (chart cards, canvas drawing, the
// mental-health "profile"/"growth" sub-tabs) - same technique canvasApp.jsx's PanelBody already
// uses for TradeJournalOpenPositionsModule.render(). Keeps that code's real data/canvas-drawing
// logic completely untouched; only the surrounding chrome is NAVRYA.
function LegacyNode({ build, watch }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!ref.current) return;
    const node = build();
    ref.current.replaceChildren();
    if (node) {
      ref.current.append(node);
      if (window.TradeJournalIcons) window.TradeJournalIcons.schedule(ref.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, watch);
  return <div ref={ref} />;
}

function sectionTitle(text) {
  return <h3 style={{ margin: 0, font: 'var(--type-body)', fontWeight: 700, color: 'var(--parchment)' }}>{text}</h3>;
}

function OverviewTab({ i18n, psych, store }) {
  const psy = window.TradeJournalPsychology;
  const trades = store.listSync();
  const closed = trades.filter((t) => t.status === 'closed');
  const streak = psych.disciplineStreak(trades);
  const mirrorRows = psych.emotionalMirror(closed, 3).filter((r) => !r.insufficient).sort((a, b) => b.winRate - a.winRate);
  const best = mirrorRows[0];
  const worst = mirrorRows[mirrorRows.length - 1];
  const num = (v) => i18n.number(v, { maximumFractionDigits: 2 });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <MetricTile icon="streak" label={i18n.t('psyDisciplineStreakTitle')} value={i18n.t('psyDisciplineStreakDays', { count: i18n.number(streak) })} />
        <MetricTile icon="scenarios" label={i18n.t('totalTrades')} value={i18n.number(closed.length)} />
        {best && <MetricTile icon="trending-up" label={i18n.t(best.emotion)} value={num(best.winRate) + '%'} />}
        {worst && (!best || worst.emotion !== best.emotion) && <MetricTile icon="trending-down" label={i18n.t(worst.emotion)} value={num(worst.winRate) + '%'} />}
      </div>
      <LegacyNode watch={[trades.length]} build={() => psy.openTradeMoodCard()} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14 }}>
        <LegacyNode watch={[trades.length]} build={() => psy.emotionalMirrorCard(trades)} />
        <LegacyNode watch={[trades.length]} build={() => psy.disciplineCard(trades)} />
        <LegacyNode watch={[trades.length]} build={() => psy.tagMirrorCard(trades)} />
      </div>
    </div>
  );
}

function JourneysTab({ i18n, store }) {
  const trades = store.listSync().filter((t) => (t.emotionLog || []).length > 1);
  const [modalTrade, setModalTrade] = React.useState(null);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        {sectionTitle(i18n.t('psyJourneysTitle'))}
        <p style={{ margin: '4px 0 0', font: 'var(--type-body)', color: 'var(--text-muted)' }}>{i18n.t('psyJourneysSubtitle')}</p>
      </div>
      {!trades.length ? (
        <Panel variant="base" radius={12} style={{ padding: 16 }}><span style={{ font: 'var(--type-body)', color: 'var(--text-muted)' }}>{i18n.t('psyJourneysEmpty')}</span></Panel>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {trades.map((trade) => (
            <ListRow
              key={trade.id} onClick={() => setModalTrade(trade)}
              title={i18n.date(trade.createdAt) + ' · ' + i18n.t(trade.direction)}
              value={i18n.t('tradesCount', { count: i18n.number(trade.emotionLog.length) })}
            />
          ))}
        </div>
      )}
      {modalTrade && (
        <Modal title={i18n.t('psyJourneyChartTitle')} icon="route" onClose={() => setModalTrade(null)}>
          <LegacyNode watch={[modalTrade.id]} build={() => window.TradeJournalPsychology.renderJourneyChart(modalTrade)} />
        </Modal>
      )}
    </div>
  );
}

function InsightsTab({ i18n, store, reports }) {
  const [range, setRange] = React.useState('month');
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');
  const [running, setRunning] = React.useState(false);
  const [result, setResult] = React.useState(null);

  async function run() {
    const dates = reports.rangeDates({ range, from, to });
    const fromTime = dates.from ? new Date(dates.from).getTime() : -Infinity;
    const toTime = dates.to ? new Date(dates.to).getTime() + 86400000 : Infinity;
    const payload = store.psychologyDataset().filter((t) => t.emotionLog.length).filter((t) => {
      const time = new Date(t.closedAt || t.updatedAt).getTime();
      return time >= fromTime && time <= toTime;
    });
    if (!payload.length) { setResult('unavailable'); return; }
    setRunning(true);
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch('/api/trades/psychology-analysis', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: i18n.language(), trades: payload }), signal: controller.signal
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setResult(data);
    } catch (_) {
      setResult('unavailable');
    } finally {
      window.clearTimeout(timer);
      setRunning(false);
    }
  }

  const ranges = [['week', 'week'], ['month', 'month'], ['quarter', 'quarter'], ['all', 'allTime'], ['custom', 'custom']];
  const triggerCards = result && result !== 'unavailable' ? window.TradeJournalPsychology.buildTriggerCards(result) : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {ranges.map(([value, key]) => <Button key={value} variant={range === value ? 'primary' : 'ghost'} size="sm" onClick={() => setRange(value)}>{i18n.t(key)}</Button>)}
      </div>
      {range === 'custom' && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <TextField label={i18n.t('from')} type="date" value={from} onChange={setFrom} />
          <TextField label={i18n.t('to')} type="date" value={to} onChange={setTo} />
        </div>
      )}
      <Panel variant="base" radius={12} style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {sectionTitle(i18n.t('psyWeeklyNarrativeTitle'))}
        <Button variant="primary" icon="brain-circuit" onClick={run} disabled={running} style={{ alignSelf: 'flex-start' }}>{i18n.t('psyRunWeeklyAnalysis')}</Button>
        {result === 'unavailable' && <span style={{ font: 'var(--type-body)', color: 'var(--text-muted)' }}>{i18n.t('analysisUnavailable')}</span>}
        {result && result !== 'unavailable' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {result.summary && <p style={{ margin: 0, font: 'var(--type-body)', color: 'var(--text-primary)' }}>{result.summary}</p>}
            {(result.insights || []).map((x, i) => (
              <Panel key={i} variant="base" radius={10} style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <strong style={{ color: 'var(--parchment)' }}>{x.title}</strong>
                <p style={{ margin: 0, font: 'var(--type-body)', color: 'var(--text-primary)' }}>{x.evidence}</p>
                <p style={{ margin: 0, font: 'var(--type-body)', color: 'var(--text-muted)' }}>{x.recommendation}</p>
              </Panel>
            ))}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <h4 style={{ margin: 0, font: 'var(--type-body)', color: 'var(--parchment)' }}>{i18n.t('psyTriggersTitle')}</h4>
              {!triggerCards.length ? (
                <span style={{ font: 'var(--type-body)', color: 'var(--text-muted)' }}>{i18n.t('psyNoTrigger')}</span>
              ) : triggerCards.map((c, i) => (
                <Panel key={i} variant="base" radius={10} style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <strong style={{ color: 'var(--parchment)' }}>{c.title}</strong>
                  <p style={{ margin: 0, font: 'var(--type-body)', color: 'var(--text-primary)' }}>{c.body}</p>
                </Panel>
              ))}
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}

function SettingsTab({ i18n, psych }) {
  const current = React.useMemo(() => psych.settings(), []);
  const [breathing, setBreathing] = React.useState(() => ({ ...current.breathing }));
  const [reflection, setReflection] = React.useState(() => ({ ...current.postTradeReflection }));
  function save() {
    psych.saveSettings({ breathing, postTradeReflection: reflection });
    showToast(i18n.t('psyProtectiveSaved'), 'success');
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 560 }}>
      {sectionTitle(i18n.t('psySettingsTitle'))}
      <Panel variant="base" radius={12} style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h4 style={{ margin: 0, font: 'var(--type-body)', color: 'var(--parchment)' }}>{i18n.t('psyBreathingTitle')}</h4>
        <Toggle checked={breathing.enabled} onChange={(v) => setBreathing({ ...breathing, enabled: v })} label={i18n.t('psyBreathingToggle')} />
        <TextField label={i18n.t('psyStressThreshold')} type="number" value={String(breathing.stressThreshold)} onChange={(v) => setBreathing({ ...breathing, stressThreshold: Number(v) })} />
      </Panel>
      <Panel variant="base" radius={12} style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h4 style={{ margin: 0, font: 'var(--type-body)', color: 'var(--parchment)' }}>{i18n.t('psyPostTradeReflectionTitle')}</h4>
        <Toggle checked={reflection.enabled} onChange={(v) => setReflection({ ...reflection, enabled: v })} label={i18n.t('psyPostTradeReflectionToggle')} />
        <TextField label={i18n.t('psyCooldownMinutes')} type="number" value={String(reflection.cooldownMinutes)} onChange={(v) => setReflection({ ...reflection, cooldownMinutes: Number(v) })} />
      </Panel>
      <Button variant="primary" icon="save" onClick={save} style={{ alignSelf: 'flex-start' }}>{i18n.t('psySaveProtective')}</Button>
    </div>
  );
}

function PsychologyShell({ i18n, tab, onTabChange }) {
  const store = window.TradeJournalTradeStore;
  const psych = window.TradeJournalPsychologyStore;
  const reports = window.TradeJournalTradeReports;
  const mhUi = window.TradeJournalMentalHealthUI;
  const mhI18n = window.TradeJournalMentalHealthI18n;
  const [legacyTick, setLegacyTick] = React.useState(0);
  const rtl = i18n.direction() === 'rtl';

  const items = [
    ['overview', 'psyTabOverview', 'layout-dashboard'], ['journeys', 'psyTabJourneys', 'route'],
    ['insights', 'psyTabInsights', 'brain-circuit'], ['settings', 'psyTabSettings', 'shield']
  ];
  if (mhUi && mhI18n) items.push(['profile', null, 'user-round', 'mhProfileTab'], ['growth', null, 'sprout', 'mhGrowthTab']);

  function refreshLegacy() { setLegacyTick((x) => x + 1); }

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} style={{ direction: rtl ? 'rtl' : 'ltr', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h2 style={{ margin: '0 0 4px', font: 'var(--type-display-md)', fontSize: 22, color: 'var(--parchment)' }}>{i18n.t('psyNavTitle')}</h2>
        <p style={{ margin: 0, font: 'var(--type-body)', color: 'var(--text-muted)' }}>{i18n.t('psyNavSubtitle')}</p>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {items.map(([id, key, icon, mhKey]) => (
          <Button key={id} variant={tab === id ? 'primary' : 'ghost'} icon={icon} onClick={() => onTabChange(id)}>{key ? i18n.t(key) : mhI18n.t(mhKey)}</Button>
        ))}
      </div>
      {tab === 'overview' ? <OverviewTab i18n={i18n} psych={psych} store={store} /> :
        tab === 'journeys' ? <JourneysTab i18n={i18n} store={store} /> :
        tab === 'insights' ? <InsightsTab i18n={i18n} store={store} reports={reports} /> :
        tab === 'profile' && mhUi ? <LegacyNode watch={[legacyTick]} build={() => mhUi.renderProfileTab(refreshLegacy)} /> :
        tab === 'growth' && mhUi ? <LegacyNode watch={[legacyTick]} build={() => mhUi.renderGrowthTab(refreshLegacy)} /> :
        <SettingsTab i18n={i18n} psych={psych} />}
    </div>
  );
}

// psychology-ui.js's renderPage() defers to this hook when present - state.tab stays owned by
// psychology-ui.js's own controller (onTabChange calls back into it), only the DOM building
// changes. The mental-health "profile"/"growth" sub-tabs stay their existing legacy DOM
// (already re-skinned onto NAVRYA CSS vars), wrapped via LegacyNode rather than rebuilt.
export function renderPsychology(tab, onTabChange) {
  const i18n = window.TradeJournalTradeI18n;
  const container = document.createElement('div');
  container.className = 'panel-page psy-page';
  container.dataset.character = currentNavryaCharacter();
  createRoot(container).render(<PsychologyShell i18n={i18n} tab={tab} onTabChange={onTabChange} />);
  return container;
}
