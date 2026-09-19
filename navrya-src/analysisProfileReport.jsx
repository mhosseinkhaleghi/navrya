import React from 'react';
import { Panel } from '../public/pages/shared/navrya/components/core/Panel.jsx';
import { Button } from '../public/pages/shared/navrya/components/forms/Button.jsx';
import { digits, percentSign, donutChart, trendSvg, funnelSvg, rDistSvg, heatCellEl, barFillEl, movingAverage, KpiTile } from './reportCharts.jsx';
import { trt } from './analysisProfileTrainingCopy.js';

// The Analysis Profile "Report" tab and the Overview usage summary (ARCHITECTURE.md §7.25, Phase 5). Every number here is
// computed by the pure, tested window.TradeJournalAnalysisProfileUsage.compute() from REAL records - the server-authoritative runs
// (GET /api/sync/analysis-profiles/:id/usage), the trader's own sessions and trades, and the profile's learning ledger. This file
// only draws them, with the same chart helpers the Patterns report uses (reportCharts.jsx). A figure with nothing behind it is
// shown as "—" or as an honest empty state, never as a placeholder zero, and the banner says where tracking began: analyses run
// before attribution existed carry no profile id and are not counted.

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
// buildProfileReport hands the loaded runs plus the trader's own sessions and trades to the pure module. null when the module is missing or throws.
export function buildProfileReport(usage, input) {
  if (!usage) return null;
  try { return usage.compute(input); } catch (_) { return null; }
}

// status: 'loading' | 'ready' | 'error'. The report is null until ready, and 'ready' with no report becomes 'error'.
export function useProfileUsage(profile, options) {
  const withEvents = !options || options.events !== false;
  const [state, setState] = React.useState({ status: 'loading', analyses: [], events: [] });
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    let alive = true;
    setState({ status: 'loading', analyses: [], events: [] });
    loadProfileUsage(profileStore(), profile.id, withEvents)
      .then((loaded) => { if (alive) setState({ status: 'ready', analyses: loaded.analyses, events: loaded.events }); })
      .catch(() => { if (alive) setState({ status: 'error', analyses: [], events: [] }); });
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

  const reload = React.useCallback(() => setAttempt((n) => n + 1), []);
  return { status: state.status === 'ready' && !report ? 'error' : state.status, report, reload };
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
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2.1fr) minmax(0,1fr)', gap: 14, alignItems: 'stretch' }}>
      <Panel variant="base" padding="18px 20px 16px">
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
      <Panel variant="base" padding="18px 20px">
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
    <Panel variant="base" padding="18px 20px 20px">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
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
    <Panel variant="base" padding="18px 20px 20px">
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
    <Panel variant="base" padding="18px 20px 20px">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
        <PanelTitle>{trt(lang, 'rptHeatTitle')}</PanelTitle>
        {heat.placed ? (
          <React.Fragment>
            <div style={{ display: 'grid', gridTemplateColumns: '88px repeat(7,1fr)', gap: 6, alignItems: 'center' }}>
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

// The drawn report for an already-computed `report` (see analysis-profile-usage.js for its shape) - no loading, no fetching.
export function ProfileReportView({ report, profile, lang }) {
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <span style={{ fontSize: 11.5, lineHeight: 1.8, color: 'var(--text-dim)' }}>{trt(lang, 'rptTrackingSince', { date: dayLabel(lang, report.trackingSince, report.timeZone) })}</span>
      <KpiRow report={report} lang={lang} />
      <FunnelPanel report={report} lang={lang} chartKey={chartKey} />
      <TrendAndOutcome report={report} lang={lang} chartKey={chartKey} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,380px),1fr))', gap: 14 }}>
        <ConceptPanel report={report} profile={profile} lang={lang} />
        <RDistPanel report={report} lang={lang} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,380px),1fr))', gap: 14, alignItems: 'start' }}>
        <HeatPanel report={report} lang={lang} />
        <Panel variant="base" padding="18px 20px 20px">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
            <TopList title={trt(lang, 'rptMarketsTitle')} rows={report.topInstruments} lang={lang} />
            <TopList title={trt(lang, 'rptTimeframesTitle')} rows={report.topTimeframes} lang={lang} />
          </div>
        </Panel>
      </div>
    </div>
  );
}

export function ProfileReport({ profile, lang }) {
  const { status, report, reload } = useProfileUsage(profile);
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
  return <ProfileReportView report={report} profile={profile} lang={lang} />;
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
