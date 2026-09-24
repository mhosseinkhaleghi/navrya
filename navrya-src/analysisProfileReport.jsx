import React from 'react';
import { Panel } from '../public/pages/shared/navrya/components/core/Panel.jsx';
import { Icon } from '../public/pages/shared/navrya/components/core/Icon.jsx';
import { Button } from '../public/pages/shared/navrya/components/forms/Button.jsx';
import { Chip } from '../public/pages/shared/navrya/components/forms/Chip.jsx';
import { digits, percentSign, donutChart, trendSvg, funnelSvg, rDistSvg, heatCellEl, barFillEl, movingAverage, KpiTile } from './reportCharts.jsx';
import { trt } from './analysisProfileTrainingCopy.js';
import { buildMaturity } from './analysisProfileMaturity.js';

// The Analysis Profile "Report" tab and the Overview usage summary (ARCHITECTURE.md §7.25, Phase 5). Every number here is
// computed by the pure, tested window.TradeJournalAnalysisProfileUsage.compute() from REAL records - the server-authoritative runs
// (GET /api/sync/analysis-profiles/:id/usage), the trader's own sessions and trades, and the profile's learning ledger. This file
// only draws them, with the same chart helpers the Patterns report uses (reportCharts.jsx). A figure with nothing behind it is
// shown as "—" or as an honest empty state, never as a placeholder zero, and the banner says where tracking began: analyses run
// before attribution existed carry no profile id and are not counted.
//
// The Engine usage panel breaks the same runs down per provider + model (runs, run types, scenarios attributed by exact analysisId,
// accuracy only once some of an engine's scenarios are resolved - a run is never presented as a success). The Learning and knowledge
// panel (analysisProfileMaturity.js) describes what the profile has been taught, from the same canonical profile, ledger and source
// state the Memory tab reads; it is counts and a milestone checklist, not a score.

const WEEKDAY_KEYS = ['rptWd0', 'rptWd1', 'rptWd2', 'rptWd3', 'rptWd4', 'rptWd5', 'rptWd6'];
const SESSION_KEYS = { London: 'rptSessionLondon', 'New York': 'rptSessionNewYork', Tokyo: 'rptSessionTokyo', Sydney: 'rptSessionSydney' };
const STAGE_KEYS = { scenarios: 'rptStageScenarios', resolved: 'rptStageResolved', confirmed: 'rptStageConfirmed' };
const LOCALES = { fa: 'fa-IR', ar: 'ar-EG', en: 'en-GB', es: 'es-ES' };

function usageModule() { return window.TradeJournalAnalysisProfileUsage; }
function profileStore() { return window.TradeJournalAnalysisProfileStore; }
function readSessions() {
  const workspace = window.TradeJournalWorkspace;
  return workspace && typeof workspace.list === 'function' ? workspace.list() : [];
}
function readTrades() {
  const trades = window.TradeJournalTradeStore;
  return trades && typeof trades.listSync === 'function' ? trades.listSync() : [];
}
function viewerTimeZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (_) { return 'UTC'; }
}
function dayLabel(lang, iso, timeZone) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString(LOCALES[lang] || 'en-GB', { year: 'numeric', month: 'short', day: 'numeric', timeZone }); }
  catch (_) { return String(iso); }
}
function pctText(lang, n) { return n == null ? '—' : digits(lang, n) + percentSign(lang); }

// The two data steps behind the hook, kept as plain functions so they can be tested without a renderer.
// loadProfileUsage waits for the profile's own write to land (the store's getUsage does), then reads the server-authoritative runs and -
// unless `withEvents` is false - the learning ledger (settled first, so a lesson taught a moment ago is already in it) for the token total.
export function loadProfileUsage(store, profileId, withEvents) {
  if (!store) return Promise.reject(new Error('ANALYSIS_PROFILE_STORE_UNAVAILABLE'));
  const events = withEvents ? store.settleEvents().then(() => store.listEvents(profileId)) : Promise.resolve([]);
  return Promise.all([store.getUsage(profileId), events]).then(([analyses, list]) => ({ analyses, events: list }));
}
// The knowledge sources, for the maturity panel only. null when they cannot be read ("not recorded" - never an invented empty list).
export function loadProfileSources(store, profileId) {
  if (!store || typeof store.listSources !== 'function') return Promise.resolve(null);
  return Promise.resolve(store.listSources(profileId)).then((list) => (Array.isArray(list) ? list : null), () => null);
}
// buildProfileReport hands the loaded runs plus the trader's own sessions and trades to the pure module. null when the module is missing or throws.
export function buildProfileReport(usage, input) {
  if (!usage) return null;
  try { return usage.compute(input); } catch (_) { return null; }
}

// status: 'loading' | 'ready' | 'error'. The report is null until ready, and 'ready' with no report becomes 'error'.
export function useProfileUsage(profile, options) {
  const withEvents = !options || options.events !== false;
  const [state, setState] = React.useState({ status: 'loading', analyses: [], events: [], sources: null });
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    let alive = true;
    setState({ status: 'loading', analyses: [], events: [], sources: null });
    Promise.all([loadProfileUsage(profileStore(), profile.id, withEvents), withEvents ? loadProfileSources(profileStore(), profile.id) : Promise.resolve(null)])
      .then(([loaded, sources]) => { if (alive) setState({ status: 'ready', analyses: loaded.analyses, events: loaded.events, sources }); })
      .catch(() => { if (alive) setState({ status: 'error', analyses: [], events: [], sources: null }); });
    return () => { alive = false; };
  }, [profile.id, withEvents, attempt]);

  const concepts = profile.concepts;
  const report = React.useMemo(() => {
    if (state.status !== 'ready') return null;
    return buildProfileReport(usageModule(), {
      profileId: profile.id, analyses: state.analyses, sessions: readSessions(), trades: readTrades(),
      events: state.events, concepts, timeZone: viewerTimeZone(), now: Date.now()
    });
  }, [state, profile.id, concepts]);

  // What has been taught, next to what was measured. Only the full Report (which reads the ledger) shows it.
  const maturity = React.useMemo(() => (report && withEvents ? buildMaturity({ profile, sources: state.sources, events: state.events, report }) : null), [report, profile, state, withEvents]);

  const reload = React.useCallback(() => setAttempt((n) => n + 1), []);
  return { status: state.status === 'ready' && !report ? 'error' : state.status, report, maturity, reload };
}

function Muted({ children }) { return <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{children}</span>; }
function PanelTitle({ children, aside }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--parchment)' }}>{children}</span>
      {aside ? <span style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>{aside}</span> : null}
    </div>
  );
}
function Legend({ tone, label, value }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)' }}><span style={{ width: 8, height: 8, borderRadius: 2, background: tone, display: 'block' }}></span>{label}</span>
      <span className="navrya-tabular" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{value}</span>
    </span>
  );
}
function BarRow({ label, valueText, pct, hint, tone }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <span dir="auto" style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        <span className="navrya-tabular" style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{valueText}</span>
      </span>
      <span style={{ display: 'block', height: 9, borderRadius: 5, background: 'rgba(244,234,215,.06)', overflow: 'hidden' }}>{barFillEl(pct, tone || 'accent')}</span>
      {hint ? <span style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>{hint}</span> : null}
    </div>
  );
}

function KpiRow({ report, lang }) {
  const { scenarios, adherence, trades, tokens } = report;
  return (
    <React.Fragment>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(178px,1fr))', gap: 12 }}>
        <KpiTile icon="ScanSearch" label={trt(lang, 'rptKpiAnalyses')} value={digits(lang, report.analyses.total)} />
        <KpiTile icon="scenarios" label={trt(lang, 'rptKpiScenarios')} value={digits(lang, scenarios.added)} note={scenarios.open ? trt(lang, 'rptNoteOpen', { n: digits(lang, scenarios.open) }) : undefined} />
        <KpiTile icon="CircleCheck" label={trt(lang, 'rptKpiAccuracy')} value={pctText(lang, scenarios.accuracy)} note={scenarios.resolved ? trt(lang, 'rptNoteResolved', { n: digits(lang, scenarios.resolved) }) : undefined} />
        <KpiTile icon="ListChecks" label={trt(lang, 'rptKpiAdherence')} value={pctText(lang, adherence.appliedRate)} note={adherence.checkedRate != null ? trt(lang, 'rptNoteChecked', { n: digits(lang, adherence.checkedRate) }) : undefined} />
        <KpiTile icon="Trophy" label={trt(lang, 'rptKpiWinRate')} value={pctText(lang, trades.winRate)} note={trades.closed ? trt(lang, 'rptNoteClosed', { n: digits(lang, trades.closed) }) : undefined} />
        <KpiTile icon="Scale" label={trt(lang, 'rptKpiAvgR')} value={trades.avgR == null ? '—' : digits(lang, trades.avgR)} />
        <KpiTile icon="sparkle" label={trt(lang, 'rptKpiTokens')} value={digits(lang, tokens.total.toLocaleString('en-US'))} note={tokens.aiEvents ? trt(lang, 'rptNoteAiEvents', { n: digits(lang, tokens.aiEvents) }) : undefined} />
      </div>
      {scenarios.smallSample && <span style={{ fontSize: 11.5, color: 'var(--warning)' }}>{trt(lang, 'rptSmallSampleNote', { n: digits(lang, scenarios.smallSampleThreshold) })}</span>}
    </React.Fragment>
  );
}

// scenarios -> resolved -> confirmed: each stage is a subset of the previous one, so the shape is a real funnel (analyses is a KPI tile
// instead - one analysis can add several scenarios, so it does not nest). funnelSvg always puts the first stage on the right; in a
// left-to-right language the drawing is mirrored so it lines up with the labels underneath.
function FunnelPanel({ report, lang, chartKey }) {
  const rtl = lang === 'fa' || lang === 'ar';
  const stages = report.funnel.filter((f) => STAGE_KEYS[f.key]).map((f) => ({ label: trt(lang, STAGE_KEYS[f.key]), v: f.v }));
  return (
    <Panel variant="base" ornament padding="18px 20px 20px">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <PanelTitle>{trt(lang, 'rptFunnelTitle')}</PanelTitle>
        {stages[0].v > 0 ? (
          <React.Fragment>
            <div style={{ width: '100%', transform: rtl ? 'none' : 'scaleX(-1)' }}>{funnelSvg(stages, chartKey)}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(' + stages.length + ',1fr)', gap: 12 }}>
              {stages.map((stage, i) => (
                <div key={stage.label} style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center', textAlign: 'center', paddingTop: 12, borderTop: '1px solid var(--border-hairline)' }}>
                  <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{stage.label}</span>
                  <span className="navrya-tabular" style={{ fontSize: 22, fontWeight: 700, color: 'var(--parchment)' }}>{digits(lang, stage.v)}</span>
                  <span style={{ fontSize: 11, color: i === 0 ? 'var(--text-dim)' : 'var(--warning)' }}>
                    {i === 0 ? trt(lang, 'rptFunnelStart') : trt(lang, 'rptFunnelDrop', { n: digits(lang, stages[i - 1].v ? Math.max(0, Math.round((1 - stage.v / stages[i - 1].v) * 100)) : 0) })}
                  </span>
                </div>
              ))}
            </div>
          </React.Fragment>
        ) : <Muted>{trt(lang, 'rptNone')}</Muted>}
      </div>
    </Panel>
  );
}

function TrendAndOutcome({ report, lang, chartKey }) {
  const { scenarios } = report;
  const hasWeeks = report.weeklyResolved.some((n) => n > 0);
  const avgLine = movingAverage(report.accuracyTrend, 3);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'stretch' }}>
      <Panel variant="base" padding="18px 20px 16px" fill data-report-panel="trend" style={{ flex: '2.1 1 380px', minWidth: 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, height: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--parchment)' }}>{trt(lang, 'rptTrendTitle')}</span>
            {hasWeeks && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 11, color: 'var(--text-dim)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 2, background: 'var(--char-accent)', display: 'block' }}></span>{trt(lang, 'rptLegendAccuracy')}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 2, background: 'var(--gold-antique)', display: 'block' }}></span>{trt(lang, 'rptLegendAverage')}</span>
              </span>
            )}
          </div>
          {hasWeeks ? (
            <React.Fragment>
              <div style={{ position: 'relative', height: 210 }}>
                <div style={{ position: 'absolute', inset: 0 }}>{trendSvg(report.accuracyTrend, avgLine, chartKey)}</div>
              </div>
              <span style={{ fontSize: 11, lineHeight: 1.8, color: 'var(--text-dim)' }}>{trt(lang, 'rptTrendNote')}</span>
            </React.Fragment>
          ) : <Muted>{trt(lang, 'rptNone')}</Muted>}
        </div>
      </Panel>
      <Panel variant="base" padding="18px 20px" fill data-report-panel="outcome" style={{ flex: '1 1 240px', minWidth: 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--parchment)', alignSelf: 'flex-start' }}>{trt(lang, 'rptOutcomeTitle')}</span>
          <span style={{ display: 'block' }}>{donutChart(scenarios.accuracy, 132, trt(lang, 'rptOutcomeConfirmed'), lang)}</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9, width: '100%' }}>
            <Legend tone="var(--char-accent)" label={trt(lang, 'rptOutcomeConfirmed')} value={digits(lang, scenarios.confirmed)} />
            <Legend tone="var(--danger)" label={trt(lang, 'rptOutcomeInvalidated')} value={digits(lang, scenarios.invalidated)} />
            <Legend tone="var(--warning)" label={trt(lang, 'rptOutcomeOpen')} value={digits(lang, scenarios.open)} />
          </div>
        </div>
      </Panel>
    </div>
  );
}

// One bar per mandatory concept the trader still has, from the server-rebuilt coverage of every run. A concept that was deleted after
// some runs is left out of the bars (its title no longer exists to show); the overall figure above still includes those runs.
function ConceptPanel({ report, profile, lang }) {
  const titles = {};
  (profile.concepts || []).forEach((c) => { titles[c.id] = c.title; });
  const rows = report.adherence.perConcept.filter((row) => titles[row.conceptId]);
  return (
    <Panel variant="base" padding="18px 20px 20px" fill data-report-panel="concepts">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 15, height: '100%' }}>
        <PanelTitle>{trt(lang, 'rptConceptsTitle')}</PanelTitle>
        {rows.length ? (
          <React.Fragment>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {rows.map((row) => (
                <BarRow key={row.conceptId} label={titles[row.conceptId]} valueText={pctText(lang, row.appliedRate)} pct={row.appliedRate || 0}
                  hint={trt(lang, 'rptConceptRuns', { a: digits(lang, row.applied), t: digits(lang, row.total) }) + (row.unaddressed ? ' · ' + trt(lang, 'rptNoteChecked', { n: digits(lang, row.checkedRate) }) : '')} />
              ))}
            </div>
            <span style={{ fontSize: 11, lineHeight: 1.8, color: 'var(--text-dim)' }}>{trt(lang, 'rptConceptsNote')}</span>
          </React.Fragment>
        ) : <Muted>{trt(lang, 'rptConceptsEmpty')}</Muted>}
      </div>
    </Panel>
  );
}

function rLabel(r) { return r === 0 ? '0' : (r > 0 ? '+' : '-') + Math.abs(r) + 'R'; }

function RDistPanel({ report, lang }) {
  const dist = report.trades.rDistribution;
  return (
    <Panel variant="base" padding="18px 20px 20px" data-report-panel="rdist">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
        <PanelTitle aside={dist.counted ? digits(lang, report.trades.avgR) + 'R · ' + trt(lang, 'rptNoteClosed', { n: digits(lang, dist.counted) }) : null}>{trt(lang, 'rptRDistTitle')}</PanelTitle>
        {dist.counted ? (
          <React.Fragment>
            <div style={{ width: '100%' }}>{rDistSvg(dist.buckets)}</div>
            <div style={{ display: 'flex', gap: 3, direction: 'ltr' }}>
              {dist.buckets.map((b) => <span key={b.r} style={{ flex: 1, textAlign: 'center', fontSize: 9.5, whiteSpace: 'nowrap', color: 'var(--text-disabled)' }}>{Number.isInteger(b.r) ? rLabel(b.r) : ''}</span>)}
            </div>
          </React.Fragment>
        ) : <Muted>{trt(lang, 'rptRDistEmpty')}</Muted>}
      </div>
    </Panel>
  );
}

function HeatPanel({ report, lang }) {
  const heat = report.heatmap;
  return (
    <Panel variant="base" padding="18px 20px 20px" fill data-report-panel="heat">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 15, height: '100%' }}>
        <PanelTitle>{trt(lang, 'rptHeatTitle')}</PanelTitle>
        {heat.placed ? (
          <React.Fragment>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(56px,88px) repeat(7,minmax(0,1fr))', gap: 6, alignItems: 'center' }}>
              <span></span>
              {heat.weekdays.map((_, i) => <span key={i} style={{ fontSize: 10.5, color: 'var(--text-dim)', textAlign: 'center' }}>{trt(lang, WEEKDAY_KEYS[i])}</span>)}
              {heat.sessions.map((session, ri) => (
                <React.Fragment key={session}>
                  <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{trt(lang, SESSION_KEYS[session])}</span>
                  {heat.table[ri].map((v, ci) => <span key={ci} style={{ display: 'block' }}>{heatCellEl(v, lang, heat.max)}</span>)}
                </React.Fragment>
              ))}
            </div>
            <span style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 10.5, color: 'var(--text-dim)' }}>
              {trt(lang, 'rptHeatLow')}<span style={{ flex: 1, height: 6, borderRadius: 3, background: 'linear-gradient(to left,rgba(244,234,215,.06),var(--char-accent))', display: 'block' }}></span>{trt(lang, 'rptHeatHigh')}
            </span>
            <span style={{ fontSize: 11, lineHeight: 1.8, color: 'var(--text-dim)' }}>{trt(lang, 'rptHeatNote')}</span>
          </React.Fragment>
        ) : <Muted>{trt(lang, 'rptNone')}</Muted>}
        {heat.unplaced > 0 && <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{trt(lang, 'rptHeatUnplaced', { n: digits(lang, heat.unplaced) })}</span>}
      </div>
    </Panel>
  );
}

function TopList({ title, rows, lang }) {
  const top = rows.length ? rows[0].count : 1;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--parchment)' }}>{title}</span>
      {rows.length ? rows.map((row) => <BarRow key={row.key} label={row.key} valueText={digits(lang, row.count)} pct={Math.round((row.count / top) * 100)} tone="gold" />) : <Muted>{trt(lang, 'rptNone')}</Muted>}
    </div>
  );
}


// ---- engine usage ---------------------------------------------------------------------------------------------------

// Run types, in the order they are drawn. Colours only separate the segments; every count is also written out next to its label.
const ENGINE_TYPES = [
  ['initial', 'rptEngineTypeInitial', 'var(--char-accent)'], ['update', 'rptEngineTypeUpdate', 'var(--gold-antique)'],
  ['scenario_evaluation', 'rptEngineTypeEval', 'var(--text-muted)'], ['other', 'rptEngineTypeOther', 'var(--text-disabled)']
];

// The provider's display name from the same catalog the AI settings use; the raw recorded id when it is not in it. Display only.
function providerName(provider) {
  if (!provider) return null;
  try {
    const settings = window.TradeJournalAISettingsStore;
    const catalog = settings && typeof settings.providerCatalog === 'function' ? settings.providerCatalog() || [] : [];
    const entry = catalog.find((item) => item && item.id === String(provider).toLowerCase());
    if (entry && entry.label) return String(entry.label);
  } catch (_) { /* the catalog only improves the label */ }
  return provider;
}

// A proportional bar. It is decoration for the numbers beside it (the legend below carries every value), so it is hidden from assistive tech.
function StackBar({ parts }) {
  const shown = parts.filter((p) => p.value > 0);
  return (
    <span aria-hidden="true" style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: 'rgba(244,234,215,.06)', gap: shown.length > 1 ? 2 : 0 }}>
      {shown.map((p) => <span key={p.key} style={{ flex: p.value, minWidth: 3, background: p.tone }}></span>)}
    </span>
  );
}
function DotList({ parts, lang }) {
  return (
    <span style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', fontSize: 11.5 }}>
      {parts.map((p) => (
        <span key={p.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)' }}>
          <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 2, background: p.tone, display: 'block' }}></span>
          {p.label}<span className="navrya-tabular" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{digits(lang, p.value)}</span>
        </span>
      ))}
    </span>
  );
}

// One engine = one provider + model pair as recorded on the runs. "Runs" is usage; "Accuracy" is a different fact that exists only
// once some of THIS engine's scenarios were confirmed or invalidated - an engine that merely ran shows no accuracy at all.
function EngineCard({ engine, lang, timeZone, threshold }) {
  const sc = engine.scenarios;
  const provider = providerName(engine.provider);
  const typeParts = ENGINE_TYPES.map(([key, copy, tone]) => ({ key, label: trt(lang, copy), value: engine.byType[key], tone })).filter((p) => p.value > 0);
  const outcomeParts = [
    { key: 'confirmed', label: trt(lang, 'rptOutcomeConfirmed'), value: sc.confirmed, tone: 'var(--char-accent)' },
    { key: 'invalidated', label: trt(lang, 'rptOutcomeInvalidated'), value: sc.invalidated, tone: 'var(--danger)' },
    { key: 'open', label: trt(lang, 'rptOutcomeOpen'), value: sc.open, tone: 'var(--warning)' }
  ];
  return (
    <li style={{ listStyle: 'none', display: 'flex', minWidth: 0 }}>
      <Panel variant="base" padding="14px 16px" fill style={{ flex: 1, minWidth: 0 }} data-engine-card="true" data-engine-key={engine.key}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--parchment)', overflowWrap: 'anywhere' }}>
              {engine.model ? <bdi dir="ltr">{engine.model}</bdi> : trt(lang, 'rptNotRecorded')}
            </span>
            <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{provider ? <bdi dir="ltr">{provider}</bdi> : trt(lang, 'rptNotRecorded')}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <span className="navrya-tabular" style={{ fontSize: 26, fontWeight: 700, color: 'var(--parchment)', lineHeight: 1 }}>{digits(lang, engine.runs)}</span>
              <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{trt(lang, 'rptEngineRuns')}</span>
              {engine.runShare != null && <span style={{ fontSize: 11, color: 'var(--text-dim)', marginInlineStart: 'auto' }}>{trt(lang, 'rptEngineShare', { n: digits(lang, engine.runShare) })}</span>}
            </span>
            <span aria-hidden="true" style={{ display: 'block', height: 6, borderRadius: 3, background: 'rgba(244,234,215,.06)', overflow: 'hidden' }}>{barFillEl(engine.runShare || 0, 'gold')}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>{trt(lang, 'rptEngineTypesLabel')}</span>
            <StackBar parts={typeParts} />
            <DotList parts={typeParts} lang={lang} />
          </div>
          <div data-engine-scenarios="true" style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBlockStart: 'auto', paddingBlockStart: 12, borderBlockStart: '1px solid var(--border-hairline)' }}>
            <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, fontSize: 12 }}>
              <span style={{ color: 'var(--text-muted)' }}>{trt(lang, 'rptEngineScenarios')}</span>
              <span className="navrya-tabular" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{digits(lang, sc.added)}</span>
            </span>
            {sc.added > 0 ? (
              <React.Fragment><StackBar parts={outcomeParts} /><DotList parts={outcomeParts.filter((p) => p.value > 0)} lang={lang} /></React.Fragment>
            ) : <Muted>{trt(lang, 'rptEngineNoScenarios')}</Muted>}
            <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, fontSize: 12 }}>
              <span style={{ color: 'var(--text-muted)' }}>{trt(lang, 'rptEngineAccuracy')}</span>
              {sc.accuracy == null
                ? <span data-engine-accuracy="none" style={{ fontSize: 11.5, color: 'var(--text-dim)', textAlign: 'end' }}>{trt(lang, 'rptEngineNoResolved')}</span>
                : <span data-engine-accuracy={sc.accuracy} style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
                  <span className="navrya-tabular" style={{ fontSize: 15, fontWeight: 700, color: 'var(--parchment)' }}>{pctText(lang, sc.accuracy)}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{trt(lang, 'rptNoteResolved', { n: digits(lang, sc.resolved) })}</span>
                </span>}
            </span>
            {sc.smallSample && <span style={{ fontSize: 11, color: 'var(--warning)' }}>{trt(lang, 'rptSmallSampleNote', { n: digits(lang, threshold) })}</span>}
            {engine.lastRunAt && <span style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>{trt(lang, 'rptEngineLastRun', { date: dayLabel(lang, engine.lastRunAt, timeZone) })}</span>}
          </div>
        </div>
      </Panel>
    </li>
  );
}

function EnginePanel({ report, lang }) {
  const { list, unmatchedScenarios } = report.engines;
  return (
    <Panel variant="base" ornament padding="18px 20px 20px" data-report-panel="engines">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <PanelTitle aside={trt(lang, 'rptEngineAside', { n: digits(lang, list.length), runs: digits(lang, report.analyses.total) })}>{trt(lang, 'rptEngineTitle')}</PanelTitle>
        <ul style={{ margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,270px),1fr))', gap: 12, alignItems: 'stretch' }}>
          {list.map((engine) => <EngineCard key={engine.key} engine={engine} lang={lang} timeZone={report.timeZone} threshold={report.scenarios.smallSampleThreshold} />)}
        </ul>
        <span style={{ fontSize: 11, lineHeight: 1.8, color: 'var(--text-dim)' }}>{trt(lang, 'rptEngineNote')}</span>
        {unmatchedScenarios > 0 && <span role="note" data-engine-unmatched={unmatchedScenarios} style={{ fontSize: 11, lineHeight: 1.8, color: 'var(--warning)' }}>{trt(lang, 'rptEngineUnmatched', { n: digits(lang, unmatchedScenarios) })}</span>}
      </div>
    </Panel>
  );
}

// ---- learning and knowledge ---------------------------------------------------------------------------------------------

const MILESTONE_COPY = {
  concepts: 'rptMsConcepts', mandatory: 'rptMsMandatory', understanding: 'rptMsUnderstanding', source: 'rptMsSource',
  lesson: 'rptMsLesson', analysis: 'rptMsAnalysis', coverage: 'rptMsCoverage', resolved: 'rptMsResolved'
};
const ORIGIN_COPY = [['user', 'rptMatOriginUser'], ['ai', 'rptMatOriginAi'], ['source', 'rptMatOriginSource'], ['chat', 'rptMatOriginChat']];

function StatBlock({ label, value, sub, stat }) {
  return (
    <div data-maturity-stat={stat} style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <span style={{ fontSize: 10.5, letterSpacing: '.07em', color: 'var(--text-muted)' }}>{label}</span>
      <span className="navrya-tabular" style={{ fontSize: 15, fontWeight: 600, color: 'var(--parchment)' }}>{value}</span>
      {sub ? <span style={{ fontSize: 11, lineHeight: 1.6, color: 'var(--text-dim)' }}>{sub}</span> : null}
    </div>
  );
}
function MilestoneMark({ done }) {
  if (done === true) return <span style={{ color: 'var(--char-accent)', display: 'grid', placeItems: 'center' }}><Icon name="CircleCheck" size={16} /></span>;
  return <span aria-hidden="true" style={{ width: 13, height: 13, margin: 1.5, borderRadius: '50%', boxSizing: 'border-box', display: 'block', border: '1.5px ' + (done === null ? 'dashed' : 'solid') + ' var(--text-disabled)' }}></span>;
}

// What the profile has been taught, as counts and a checklist. There is no score: a made-up weighting would look like a measurement.
// A figure that could not be read says "not recorded"; a milestone that could not be checked is neither reached nor missed.
function MaturityPanel({ maturity, lang, timeZone }) {
  const { concepts, understanding, sources, lessons, milestones } = maturity;
  const none = trt(lang, 'rptNotRecorded');
  const joined = (parts) => parts.filter(Boolean).join(' · ');
  const conceptSub = joined([
    concepts.mandatory ? trt(lang, 'rptMatMandatory') + ' ' + digits(lang, concepts.mandatory) : null,
    concepts.preferred ? trt(lang, 'rptMatPreferred') + ' ' + digits(lang, concepts.preferred) : null,
    concepts.reference ? trt(lang, 'rptMatReference') + ' ' + digits(lang, concepts.reference) : null
  ]);
  const sourceSub = sources.available ? joined([
    sources.awaiting ? trt(lang, 'rptMatSourcesWaiting', { n: digits(lang, sources.awaiting) }) : null,
    sources.failed ? trt(lang, 'rptMatSourcesFailed', { n: digits(lang, sources.failed) }) : null
  ]) : null;
  const origins = ORIGIN_COPY.filter(([key]) => concepts.byOrigin[key] > 0);
  return (
    <Panel variant="base" padding="18px 20px 20px" fill data-report-panel="maturity">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
        <PanelTitle aside={maturity.untaught ? null : trt(lang, 'rptMatAside', { reached: digits(lang, maturity.reached), of: digits(lang, maturity.of) })}>{trt(lang, 'rptMatTitle')}</PanelTitle>
        {maturity.untaught ? <Muted>{trt(lang, 'rptMatEmpty')}</Muted> : (
          <React.Fragment>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,150px),1fr))', gap: '14px 18px' }}>
              <StatBlock stat="concepts" label={trt(lang, 'rptMatConcepts')} value={digits(lang, concepts.enabled)} sub={conceptSub} />
              <StatBlock stat="understanding" label={trt(lang, 'rptMatUnderstanding')}
                value={understanding.has ? trt(lang, 'rptMatUnderstandingV', { n: digits(lang, understanding.version) }) : trt(lang, 'rptMatUnderstandingNone')}
                sub={understanding.has && understanding.updatedAt ? dayLabel(lang, understanding.updatedAt, timeZone) : null} />
              <StatBlock stat="sources" label={trt(lang, 'rptMatSources')}
                value={sources.available ? trt(lang, 'rptMatSourcesValue', { taught: digits(lang, sources.taught), total: digits(lang, sources.total) }) : none} sub={sourceSub} />
              <StatBlock stat="lessons" label={trt(lang, 'rptMatLessons')}
                value={lessons.available ? trt(lang, 'rptMatLessonsValue', { taught: digits(lang, lessons.taught), ai: digits(lang, lessons.aiAssisted) }) : none}
                sub={lessons.available && lessons.lastAt ? trt(lang, 'rptMatLastLearned', { date: dayLabel(lang, lessons.lastAt, timeZone) }) : null} />
            </div>
            {origins.length > 0 && (
              <div data-maturity-origins="true" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--parchment)' }}>{trt(lang, 'rptMatOriginTitle')}</span>
                {origins.map(([key, copy]) => (
                  <BarRow key={key} label={trt(lang, copy)} valueText={digits(lang, concepts.byOrigin[key])} pct={Math.round((concepts.byOrigin[key] / concepts.enabled) * 100)} />
                ))}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--parchment)' }}>{trt(lang, 'rptMatMilestones')}</span>
              <ul data-maturity-milestones="true" style={{ margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
                {milestones.map((m) => (
                  <li key={m.key} data-milestone={m.key} data-milestone-state={m.done === true ? 'reached' : m.done === false ? 'missing' : 'unknown'} style={{ listStyle: 'none', display: 'flex', alignItems: 'center', gap: 9, fontSize: 12 }}>
                    <MilestoneMark done={m.done} />
                    <span style={{ flex: 1, minWidth: 0, color: m.done === true ? 'var(--text-primary)' : 'var(--text-muted)' }}>{trt(lang, MILESTONE_COPY[m.key])}</span>
                    <span style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>{m.done === true ? trt(lang, 'rptMsDone') : m.done === false ? trt(lang, 'rptMsTodo') : none}</span>
                  </li>
                ))}
              </ul>
              {maturity.unknown > 0 && <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{trt(lang, 'rptMatUnknown', { n: digits(lang, maturity.unknown) })}</span>}
            </div>
            <span style={{ fontSize: 11, lineHeight: 1.8, color: 'var(--text-dim)', marginBlockStart: 'auto' }}>{trt(lang, 'rptMatNote')}</span>
          </React.Fragment>
        )}
      </div>
    </Panel>
  );
}

function MarketsPanel({ report, lang }) {
  return (
    <Panel variant="base" padding="18px 20px 20px" fill data-report-panel="markets">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        <TopList title={trt(lang, 'rptMarketsTitle')} rows={report.topInstruments} lang={lang} />
        <TopList title={trt(lang, 'rptTimeframesTitle')} rows={report.topTimeframes} lang={lang} />
      </div>
    </Panel>
  );
}

// Two panels side by side when there is room, stacked when there is not; both take the height of the taller one.
const PAIR_GRID = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,380px),1fr))', gap: 14, alignItems: 'stretch' };

// The drawn report for an already-computed `report` (see analysis-profile-usage.js for its shape) - no loading, no fetching.
// `maturity` (analysisProfileMaturity.js) is optional: without it the learning panel is simply not drawn.
export function ProfileReportView({ report, profile, lang, maturity }) {
  const chartKey = String(profile.id).replace(/[^A-Za-z0-9_-]/g, '');
  if (report.empty) {
    return (
      <Panel padding="22px 24px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--parchment)' }}>{trt(lang, 'rptEmptyTitle')}</span>
          <span style={{ fontSize: 12.5, lineHeight: 1.9, color: 'var(--text-muted)' }}>{trt(lang, 'rptEmptyBody')}</span>
        </div>
      </Panel>
    );
  }
  return (
    <div data-profile-report="true" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <span style={{ fontSize: 11.5, lineHeight: 1.8, color: 'var(--text-dim)' }}>{trt(lang, 'rptTrackingSince', { date: dayLabel(lang, report.trackingSince, report.timeZone) })}</span>
      <KpiRow report={report} lang={lang} />
      <EnginePanel report={report} lang={lang} />
      <FunnelPanel report={report} lang={lang} chartKey={chartKey} />
      <TrendAndOutcome report={report} lang={lang} chartKey={chartKey} />
      <div style={PAIR_GRID}>
        <ConceptPanel report={report} profile={profile} lang={lang} />
        {maturity && <MaturityPanel maturity={maturity} lang={lang} timeZone={report.timeZone} />}
      </div>
      <div style={PAIR_GRID}>
        <HeatPanel report={report} lang={lang} />
        <MarketsPanel report={report} lang={lang} />
      </div>
      <RDistPanel report={report} lang={lang} />
    </div>
  );
}

export function ProfileReport({ profile, lang }) {
  const { status, report, maturity, reload } = useProfileUsage(profile);
  if (status === 'loading') return <Panel padding="18px 20px"><Muted>{trt(lang, 'rptLoading')}</Muted></Panel>;
  if (status === 'error') {
    return (
      <Panel padding="18px 20px">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Muted>{trt(lang, 'rptLoadFailed')}</Muted>
          <Button variant="secondary" size="sm" onClick={reload}>{trt(lang, 'rptRetry')}</Button>
        </div>
      </Panel>
    );
  }
  return <ProfileReportView report={report} profile={profile} lang={lang} maturity={maturity} />;
}

// The Overview's usage line: how many analyses ran under this profile and since when, with a way into the full report.
export function UsageSummary({ profile, lang, onOpenReport }) {
  const { status, report } = useProfileUsage(profile, { events: false });
  let text = null;
  if (status === 'loading') text = trt(lang, 'rptLoading');
  else if (status === 'error') text = trt(lang, 'rptOverviewFailed');
  else if (report.empty) text = trt(lang, 'rptOverviewNone');
  else text = trt(lang, 'rptOverviewSummary', { n: digits(lang, report.analyses.total), date: dayLabel(lang, report.trackingSince, report.timeZone) });
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <Muted>{text}</Muted>
      {status === 'ready' && !report.empty && <Button variant="ghost" size="sm" onClick={onOpenReport}>{trt(lang, 'rptOverviewSeeReport')}</Button>}
    </div>
  );
}
