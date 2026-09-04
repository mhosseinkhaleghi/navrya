import React from 'react';

// The two OVERVIEW figures from the approved canvas (Main.dc.html). Both replace a bar chart,
// and both replace it for the same reason: a bar per emotion, or a bar per week, answered
// "how big is each one" when the question a trader actually has is "how do these relate".
//
// Colour here is a STATUS palette (good / caution / costly), not a categorical one, so every
// mark also carries a shape and a direct label - the three status hues sit at ΔE 6 under
// protanopia, which is legible only with that second encoding present.

const TONE = { good: 'var(--success)', warn: 'var(--warning)', bad: 'var(--danger)' };

function band(pnl) {
  if (pnl == null) return 'warn';
  if (pnl > 8) return 'good';
  if (pnl < -8) return 'bad';
  return 'warn';
}

// ============================================================================
// EMOTION MAP - frequency against what the emotion actually costs
// ============================================================================
export function EmotionMap({ i18n, rows, width = 660, height = 360 }) {
  if (!rows.length) return null;

  const padS = 70, padE = 50, padT = 24, padB = 40;
  const plotW = width - padS - padE, plotH = height - padT - padB;

  const maxFreq = Math.max(...rows.map((r) => r.freq), 1);
  const pnls = rows.map((r) => r.pnl);
  const maxPnl = Math.max(...pnls, 1), minPnl = Math.min(...pnls, -1);
  const span = maxPnl - minPnl || 1;

  // RTL reading: the most frequent emotion sits at the start of the line (the right edge), so the
  // eye meets "what you feel most" first.
  const x = (freq) => padS + plotW - (freq / maxFreq) * plotW;
  const y = (pnl) => padT + ((maxPnl - pnl) / span) * plotH;
  const zeroY = y(0);
  const midX = x(maxFreq / 2);
  const maxN = Math.max(...rows.map((r) => r.n), 1);
  const radius = (n) => 6 + Math.round((n / maxN) * 5);

  return (
    <svg width="100%" viewBox={'0 0 ' + width + ' ' + height} style={{ display: 'block' }} role="img" aria-label={i18n.t('psyMapAria')}>
      <rect x={padS} y={padT} width={plotW / 2} height={Math.max(0, zeroY - padT)} fill="rgba(46,204,113,.05)"></rect>
      <rect x={padS} y={zeroY} width={plotW / 2} height={Math.max(0, padT + plotH - zeroY)} fill="rgba(255,56,48,.06)"></rect>

      <line x1={padS} y1={padT + plotH} x2={padS + plotW} y2={padT + plotH} stroke="rgba(244,234,215,.14)"></line>
      <line x1={padS + plotW} y1={padT} x2={padS + plotW} y2={padT + plotH} stroke="rgba(244,234,215,.14)"></line>
      <line x1={padS} y1={zeroY} x2={padS + plotW} y2={zeroY} stroke="rgba(244,234,215,.22)" strokeDasharray="5 5"></line>
      <line x1={midX} y1={padT} x2={midX} y2={padT + plotH} stroke="rgba(244,234,215,.1)" strokeDasharray="3 6"></line>

      <text x={padS + plotW + 8} y={zeroY + 4} fill="var(--text-dim)" style={{ font: '400 11px var(--font-ui)' }}>{i18n.number(0)}</text>
      <text x={padS + plotW + 8} y={padT + 10} fill="var(--text-dim)" style={{ font: '400 11px var(--font-ui)' }}>{i18n.money(maxPnl)}</text>
      <text x={padS + plotW + 8} y={padT + plotH} fill="var(--text-dim)" style={{ font: '400 11px var(--font-ui)' }}>{i18n.money(minPnl)}</text>

      <text x={padS + 14} y={padT + 20} fill="var(--success)" style={{ font: '500 11px var(--font-ui)' }}>{i18n.t('psyMapQuadrantGood')}</text>
      <text x={padS + 14} y={padT + plotH - 8} fill="var(--danger)" style={{ font: '500 11px var(--font-ui)' }}>{i18n.t('psyMapQuadrantBad')}</text>

      {rows.map((r) => {
        const cx = x(r.freq), cy = y(r.pnl), rr = radius(r.n), b = band(r.pnl), tone = TONE[b];
        const labelAbove = cy > padT + plotH / 2;
        return (
          <g key={r.emotion}>
            <circle cx={cx} cy={cy} r={rr + 6} fill={b === 'good' ? 'rgba(46,204,113,.18)' : b === 'bad' ? 'rgba(255,56,48,.16)' : 'rgba(255,176,32,.16)'}></circle>
            {b === 'good' && <circle cx={cx} cy={cy} r={rr} fill={tone} stroke="var(--ink-950)" strokeWidth="2"></circle>}
            {b === 'warn' && <circle cx={cx} cy={cy} r={rr - 1} fill="none" stroke={tone} strokeWidth="3"></circle>}
            {b === 'bad' && <rect x={cx - rr} y={cy - rr} width={rr * 2} height={rr * 2} fill={tone} stroke="var(--ink-950)" strokeWidth="2" transform={'rotate(45 ' + cx + ' ' + cy + ')'}></rect>}
            <text x={cx} y={labelAbove ? cy - rr - 20 : cy + rr + 20} textAnchor="middle" fill="var(--text-primary)" style={{ font: '500 13px var(--font-ui)' }}>{i18n.t(r.emotion)}</text>
            <text x={cx} y={labelAbove ? cy - rr - 6 : cy + rr + 34} textAnchor="middle" fill="var(--text-dim)" style={{ font: '400 11px var(--font-ui)' }}>
              {i18n.number(r.freq)}% · {i18n.money(r.pnl)} · {i18n.t('psyMapSamples', { count: i18n.number(r.n) })}
            </text>
          </g>
        );
      })}

      <text x={padS + plotW} y={height - 18} textAnchor="end" fill="var(--text-dim)" style={{ font: '400 11px var(--font-ui)' }}>{i18n.t('psyMapRare')}</text>
      <text x={padS} y={height - 18} fill="var(--text-dim)" style={{ font: '400 11px var(--font-ui)' }}>{i18n.t('psyMapOften')}</text>
      <text x={padS + plotW / 2} y={height - 3} textAnchor="middle" fill="var(--text-muted)" style={{ font: '500 11px var(--font-ui)' }}>{i18n.t('psyMapXAxis')}</text>
    </svg>
  );
}

// ============================================================================
// DISCIPLINE TREND - one line, with the weeks that have no trades left as real gaps
// ============================================================================
export function DisciplineTrend({ i18n, weeks, width = 660, height = 250 }) {
  const padS = 40, padE = 40, padT = 24, padB = 40;
  const plotW = width - padS - padE, plotH = height - padT - padB;
  const baseline = padT + plotH;
  const step = weeks.length > 1 ? plotW / (weeks.length - 1) : 0;

  // Oldest at the start of the line (right, under RTL), newest at the end - the same direction
  // the tab's own week labels already ran.
  const x = (i) => padS + plotW - i * step;
  const y = (score) => baseline - (score / 100) * plotH;

  // A null week is a gap in the line, never a zero - the convention disciplineWeekly() itself
  // documents. So the line is drawn as runs of consecutive scored weeks.
  const runs = [];
  let run = [];
  weeks.forEach((w, i) => {
    if (w.score == null) { if (run.length) runs.push(run); run = []; return; }
    run.push({ i, score: w.score });
  });
  if (run.length) runs.push(run);

  const scored = weeks.filter((w) => w.score != null);
  const newest = scored.length ? scored[scored.length - 1] : null;
  const newestIndex = newest ? weeks.lastIndexOf(newest) : -1;

  const line = (pts) => pts.map((p, k) => (k ? 'L' : 'M') + x(p.i) + ' ' + y(p.score)).join(' ');
  const area = (pts) => line(pts) + ' L' + x(pts[pts.length - 1].i) + ' ' + baseline + ' L' + x(pts[0].i) + ' ' + baseline + ' Z';

  return (
    <svg width="100%" viewBox={'0 0 ' + width + ' ' + height} style={{ display: 'block' }} role="img" aria-label={i18n.t('psyTrendAria')}>
      <defs>
        <linearGradient id="navryaDisciplineFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(102,201,78,.28)"></stop>
          <stop offset="100%" stopColor="rgba(102,201,78,0)"></stop>
        </linearGradient>
      </defs>

      <rect x={padS} y={y(90)} width={plotW} height={Math.max(0, y(70) - y(90))} fill="rgba(102,201,78,.05)"></rect>
      <text x={padS + 6} y={y(90) + 13} fill="var(--char-accent)" style={{ font: '500 10px var(--font-ui)' }}>{i18n.t('psyTrendHealthyBand')}</text>

      {[0, 30, 60, 90].map((v) => (
        <g key={v}>
          <line x1={padS} y1={y(v)} x2={padS + plotW} y2={y(v)} stroke={v === 0 ? 'rgba(244,234,215,.14)' : 'rgba(244,234,215,.05)'}></line>
          <text x={padS + plotW + 8} y={y(v) + 4} fill="var(--text-dim)" style={{ font: '400 11px var(--font-ui)' }}>{i18n.number(v)}</text>
        </g>
      ))}

      {runs.map((pts, k) => (
        <g key={k}>
          {pts.length > 1 && <path d={area(pts)} fill="url(#navryaDisciplineFill)"></path>}
          <path d={line(pts)} fill="none" stroke="var(--char-accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"></path>
        </g>
      ))}

      {weeks.map((w, i) => (w.score == null ? (
        <g key={'gap' + i}>
          <line x1={x(i)} y1={padT} x2={x(i)} y2={baseline} stroke="rgba(244,234,215,.18)" strokeDasharray="3 5"></line>
          <text x={x(i)} y={padT - 8} textAnchor="middle" fill="var(--text-disabled)" style={{ font: '400 10px var(--font-ui)' }}>{i18n.t('psyTrendNoTrades')}</text>
        </g>
      ) : (
        <circle key={'pt' + i} cx={x(i)} cy={y(w.score)} r={i === newestIndex ? 6 : 4}
          fill={i === newestIndex ? 'var(--char-light-glow, #8AF7B4)' : 'var(--ink-950)'}
          stroke={i === newestIndex ? 'var(--ink-950)' : 'var(--char-accent)'} strokeWidth="2"></circle>
      )))}

      {/* Selective direct labels only - the newest week, and nothing else. */}
      {newest && (
        <text x={x(newestIndex)} y={y(newest.score) - 14} textAnchor="middle" fill="var(--char-light-glow, #8AF7B4)" style={{ font: '500 12px var(--font-ui)' }}>
          {i18n.number(newest.score)}
        </text>
      )}

      <text x={padS + plotW} y={height - 14} textAnchor="middle" fill="var(--text-dim)" style={{ font: '400 10px var(--font-ui)' }}>{i18n.t('psyTrendOldest', { count: i18n.number(weeks.length) })}</text>
      <text x={padS} y={height - 14} textAnchor="middle" fill="var(--text-dim)" style={{ font: '400 10px var(--font-ui)' }}>{i18n.t('psyTrendNewest')}</text>
    </svg>
  );
}

// ============================================================================
// TRADE ARC - the stress curve of one trade, entry -> mid -> exit
// ============================================================================
export function TradeArc({ i18n, stages, width = 280, height = 150 }) {
  if (stages.length < 2) return null;
  const padS = 48, padE = 24, padT = 24, baseline = height - 24;
  const plotW = width - padS - padE;
  const step = plotW / (stages.length - 1);
  const x = (i) => width - padE - i * step;
  const y = (v) => baseline - (v / 10) * (baseline - padT);

  const pts = stages.map((s, i) => ({ x: x(i), y: y(s.value), label: s.label, value: s.value }));
  const path = pts.map((p, i) => (i ? 'L' : 'M') + p.x + ' ' + p.y).join(' ');
  const peak = Math.max(...stages.map((s) => s.value));
  const tone = peak >= 8 ? 'var(--danger)' : peak >= 6 ? 'var(--warning)' : 'var(--char-accent)';
  const fill = peak >= 8 ? 'rgba(255,56,48,.12)' : peak >= 6 ? 'rgba(255,176,32,.12)' : 'rgba(102,201,78,.12)';

  return (
    <svg width="100%" viewBox={'0 0 ' + width + ' ' + height} style={{ display: 'block' }} role="img" aria-label={i18n.t('psyArcAria')}>
      <rect x={padS - 8} y={padT} width={plotW + 16} height={Math.max(0, y(7) - padT)} fill="rgba(255,56,48,.05)"></rect>
      <line x1={padS - 8} y1={y(7)} x2={width - padE + 8} y2={y(7)} stroke="rgba(255,56,48,.25)" strokeDasharray="4 4"></line>
      <line x1={padS - 8} y1={baseline} x2={width - padE + 8} y2={baseline} stroke="rgba(244,234,215,.14)"></line>

      <path d={path + ' L' + pts[pts.length - 1].x + ' ' + baseline + ' L' + pts[0].x + ' ' + baseline + ' Z'} fill={fill}></path>
      <path d={path} fill="none" stroke={tone} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"></path>

      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="5.5" fill={tone} stroke="var(--ink-950)" strokeWidth="2"></circle>
          <text x={p.x} y={p.y - 13} textAnchor="middle" fill="var(--text-primary)" style={{ font: '500 12px var(--font-ui)' }}>{i18n.number(p.value)}</text>
          <text x={p.x} y={height - 6} textAnchor="middle" fill="var(--text-dim)" style={{ font: '400 11px var(--font-ui)' }}>{p.label}</text>
        </g>
      ))}
    </svg>
  );
}

// ============================================================================
// TILT METER - the live read, as a band rather than a score
// ============================================================================
const TILT_BANDS = [
  { id: 'calm', from: -90, to: -30, tone: 'var(--success)' },
  { id: 'watch', from: -22, to: 22, tone: 'var(--warning)' },
  { id: 'high', from: 30, to: 90, tone: 'var(--danger)' }
];

// Polar helper for the gauge arcs: angle 0 is straight up, negative is anticlockwise.
function polar(cx, cy, r, deg) {
  const rad = (deg - 90) * Math.PI / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}
function arcPath(cx, cy, r, from, to) {
  const [x1, y1] = polar(cx, cy, r, from), [x2, y2] = polar(cx, cy, r, to);
  return 'M' + x1 + ' ' + y1 + ' A' + r + ' ' + r + ' 0 0 1 ' + x2 + ' ' + y2;
}

export function TiltMeter({ i18n, reading, width = 200, height = 122 }) {
  const cx = width / 2, cy = 100, r = 82;
  const needleDeg = reading.level === 'high' ? 58 : reading.level === 'watch' ? 0 : -58;
  const tone = reading.level === 'high' ? 'var(--danger)' : reading.level === 'watch' ? 'var(--warning)' : 'var(--success)';

  return (
    <svg width="100%" viewBox={'0 0 ' + width + ' ' + height} style={{ display: 'block' }} role="img" aria-label={i18n.t('psyTilt_' + reading.level)}>
      <path d={arcPath(cx, cy, r, -90, 90)} fill="none" stroke="rgba(244,234,215,.08)" strokeWidth="13" strokeLinecap="round"></path>
      {TILT_BANDS.map((b) => (
        <path key={b.id} d={arcPath(cx, cy, r, b.from, b.to)} fill="none" stroke={b.tone} strokeWidth="13" strokeLinecap="round"></path>
      ))}
      <line
        x1={cx} y1={cy} x2={cx} y2={cy - 60} stroke="var(--text-primary)" strokeWidth="3" strokeLinecap="round"
        transform={'rotate(' + needleDeg + ' ' + cx + ' ' + cy + ')'}
      ></line>
      <circle cx={cx} cy={cy} r="7" fill="var(--ink-950)" stroke="var(--gold-warm)" strokeWidth="2"></circle>
      <text x={cx} y={height - 3} textAnchor="middle" fill={tone} style={{ font: '500 13px var(--font-ui)' }}>{i18n.t('psyTilt_' + reading.level)}</text>
    </svg>
  );
}

// ============================================================================
// SELF-RATING GAUGE - one of the three numbers a trader logs on every entry
// ============================================================================
export function RatingGauge({ i18n, value, tone, width = 84, height = 54 }) {
  const cx = width / 2, cy = 46, r = 34;
  const total = Math.PI * r;
  // A null value draws the track only. Filling it to a default would be the exact fabrication
  // selfRatings() returns null to avoid.
  const filled = value == null ? 0 : Math.max(0, Math.min(1, value / 10)) * total;
  return (
    <svg width={width} height={height} viewBox={'0 0 ' + width + ' ' + height} style={{ display: 'block', flex: 'none' }} aria-hidden="true">
      <path d={arcPath(cx, cy, r, -90, 90)} fill="none" stroke="rgba(244,234,215,.1)" strokeWidth="8" strokeLinecap="round"></path>
      {value != null && (
        <path d={arcPath(cx, cy, r, -90, 90)} fill="none" stroke={tone} strokeWidth="8" strokeLinecap="round" strokeDasharray={filled + ' ' + total}></path>
      )}
    </svg>
  );
}
