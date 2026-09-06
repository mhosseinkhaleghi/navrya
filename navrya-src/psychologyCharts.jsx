import React from 'react';

// The two OVERVIEW figures from the approved canvas (Main.dc.html). Both replace a bar chart,
// and both replace it for the same reason: a bar per emotion, or a bar per week, answered
// "how big is each one" when the question a trader actually has is "how do these relate".
//
// Colour here is a STATUS palette (good / caution / costly), not a categorical one, so every
// mark also carries a shape and a direct label - the three status hues sit at ΔE 6 under
// protanopia, which is legible only with that second encoding present.

const TONE = { good: 'var(--success)', warn: 'var(--warning)', bad: 'var(--danger)' };

// Root cause of the garbled/clipped/missing chart text a live fa-locale render surfaced
// (confirmed by isolated, minimal probes outside React entirely - a real Chromium bug,
// reproduced non-headless too, not a headless-only artifact and not this file's own earlier
// bugs): Chromium's native SVG <text> layout path mis-shapes and mis-positions Persian glyphs -
// digits and words alike, one character or several - independent of font-family and
// independent of the element's or an ancestor's `dir` (both confirmed tried and confirmed not
// sufficient alone). Wrapping the same real HTML text in <foreignObject> instead was ALSO
// confirmed unreliable here once nested inside this file's real, deeply-nested React tree
// (layout computed correctly - real, non-zero getClientRects() - but the composited frame a
// screenshot/paint captured still came back blank; a real HTML span outside the SVG entirely,
// same content/font, painted every time). Given that, no label in this file renders inside the
// SVG's own coordinate space at all any more: every chart returns a plain HTML wrapper
// (position:relative, aspect-ratio-locked to width:height so it still scales with its
// container exactly like the old width="100%" SVG did) holding the SVG (geometry only - path/
// circle/rect/line, nothing that shapes text) absolutely filling it, plus each label as an
// ordinary sibling <span>, percentage-positioned from the same x/y this file already computes
// in viewBox units. Font-size stays literal px (not percentage) - a deliberate, minor trade-off
// (label text does not scale with an unusually resized container) for guaranteed-correct glyph
// shaping, which is not a trade-off at all in the cases this was actually breaking.
const SVG_TEXT_FONT = 'Tahoma, Arial, sans-serif';
const SVG_DISPLAY_FONT = 'Tahoma, Arial, sans-serif';

// The wrapper every chart below returns instead of a bare <svg> - see the block comment above.
function ChartFrame({ width, height, children, ariaLabel }) {
  return (
    <div style={{ position: 'relative', width: '100%', aspectRatio: width + ' / ' + height }} role="img" aria-label={ariaLabel}>
      {children}
    </div>
  );
}

// The geometry-only SVG inside a ChartFrame - absolutely fills it, viewBox unchanged so every
// existing x/y computation in this file stays correct.
function ChartSvg({ width, height, children }) {
  return (
    <svg width="100%" height="100%" viewBox={'0 0 ' + width + ' ' + height} preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, display: 'block' }}>
      {children}
    </svg>
  );
}

// A chart label - a real HTML <span>, a sibling of the chart's <svg> inside the same
// ChartFrame, never SVG <text> or <foreignObject> (see the block comment above for why). x/y is
// the same anchor point native SVG <text> would have taken, in the chart's own viewBox units;
// anchor keeps <text>'s own start/middle/end vocabulary (mapped to a physical text-align, never
// a logical start/end CSS value, so it never re-flips under dir) and controls which edge of the
// box sits at x. viewW/viewH convert those units to the percentages an absolutely-positioned
// sibling needs. width only needs to be wide enough for the longest real content that lands
// here, in the same viewBox units as x/y - text never wraps.
function Label({ x, y, viewW, viewH, anchor = 'middle', color, weight = 400, size = 11, letterSpacing, width = 160, children }) {
  const h = Math.round(size * 1.7);
  const align = anchor === 'middle' ? 'center' : anchor === 'end' ? 'right' : 'left';
  const left = anchor === 'middle' ? x - width / 2 : anchor === 'end' ? x - width : x;
  const top = y - h * 0.82;
  return (
    <span
      dir="rtl"
      style={{
        position: 'absolute', left: (left / viewW * 100) + '%', top: (top / viewH * 100) + '%', width: (width / viewW * 100) + '%',
        font: weight + ' ' + size + 'px ' + SVG_TEXT_FONT, color, textAlign: align, whiteSpace: 'nowrap', lineHeight: h + 'px',
        letterSpacing, pointerEvents: 'none', overflow: 'visible'
      }}
    >{children}</span>
  );
}

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
  const L = (props) => <Label viewW={width} viewH={height} {...props} />;

  return (
    <ChartFrame width={width} height={height} ariaLabel={i18n.t('psyMapAria')}>
      <ChartSvg width={width} height={height}>
        <rect x={padS} y={padT} width={plotW / 2} height={Math.max(0, zeroY - padT)} fill="rgba(46,204,113,.05)"></rect>
        <rect x={padS} y={zeroY} width={plotW / 2} height={Math.max(0, padT + plotH - zeroY)} fill="rgba(255,56,48,.06)"></rect>

        <line x1={padS} y1={padT + plotH} x2={padS + plotW} y2={padT + plotH} stroke="rgba(244,234,215,.14)"></line>
        <line x1={padS + plotW} y1={padT} x2={padS + plotW} y2={padT + plotH} stroke="rgba(244,234,215,.14)"></line>
        <line x1={padS} y1={zeroY} x2={padS + plotW} y2={zeroY} stroke="rgba(244,234,215,.22)" strokeDasharray="5 5"></line>
        <line x1={midX} y1={padT} x2={midX} y2={padT + plotH} stroke="rgba(244,234,215,.1)" strokeDasharray="3 6"></line>

        {rows.map((r) => {
          const cx = x(r.freq), cy = y(r.pnl), rr = radius(r.n), b = band(r.pnl), tone = TONE[b];
          return (
            <g key={r.emotion}>
              <circle cx={cx} cy={cy} r={rr + 6} fill={b === 'good' ? 'rgba(46,204,113,.18)' : b === 'bad' ? 'rgba(255,56,48,.16)' : 'rgba(255,176,32,.16)'}></circle>
              {b === 'good' && <circle cx={cx} cy={cy} r={rr} fill={tone} stroke="var(--ink-950)" strokeWidth="2"></circle>}
              {b === 'warn' && <circle cx={cx} cy={cy} r={rr - 1} fill="none" stroke={tone} strokeWidth="3"></circle>}
              {b === 'bad' && <rect x={cx - rr} y={cy - rr} width={rr * 2} height={rr * 2} fill={tone} stroke="var(--ink-950)" strokeWidth="2" transform={'rotate(45 ' + cx + ' ' + cy + ')'}></rect>}
            </g>
          );
        })}
      </ChartSvg>

      {L({ x: padS + plotW + 8, y: zeroY + 4, anchor: 'start', color: 'var(--text-dim)', size: 11, children: i18n.number(0) })}
      {L({ x: padS + plotW + 8, y: padT + 10, anchor: 'start', color: 'var(--text-dim)', size: 11, children: i18n.money(maxPnl) })}
      {L({ x: padS + plotW + 8, y: padT + plotH, anchor: 'start', color: 'var(--text-dim)', size: 11, children: i18n.money(minPnl) })}

      {L({ x: padS + 14, y: padT + 20, anchor: 'start', color: 'var(--success)', weight: 500, size: 11, width: 220, children: i18n.t('psyMapQuadrantGood') })}
      {L({ x: padS + 14, y: padT + plotH - 8, anchor: 'start', color: 'var(--danger)', weight: 500, size: 11, width: 220, children: i18n.t('psyMapQuadrantBad') })}

      {rows.map((r) => {
        const cx = x(r.freq), cy = y(r.pnl), rr = radius(r.n), labelAbove = cy > padT + plotH / 2;
        return (
          <React.Fragment key={r.emotion}>
            {L({ x: cx, y: labelAbove ? cy - rr - 20 : cy + rr + 20, anchor: 'middle', color: 'var(--text-primary)', weight: 500, size: 13, children: i18n.t(r.emotion) })}
            {L({
              x: cx, y: labelAbove ? cy - rr - 6 : cy + rr + 34, anchor: 'middle', color: 'var(--text-dim)', size: 11, width: 220,
              children: i18n.number(r.freq) + '% · ' + i18n.money(r.pnl) + ' · ' + i18n.t('psyMapSamples', { count: i18n.number(r.n) })
            })}
          </React.Fragment>
        );
      })}

      {L({ x: padS + plotW, y: height - 18, anchor: 'end', color: 'var(--text-dim)', size: 11, children: i18n.t('psyMapRare') })}
      {L({ x: padS, y: height - 18, anchor: 'start', color: 'var(--text-dim)', size: 11, children: i18n.t('psyMapOften') })}
      {L({ x: padS + plotW / 2, y: height - 3, anchor: 'middle', color: 'var(--text-muted)', weight: 500, size: 11, width: 260, children: i18n.t('psyMapXAxis') })}
    </ChartFrame>
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

  // Consecutive gap weeks are drawn as ONE spanning region with ONE centered label - not one
  // dashed line + label per empty week, which floods the chart into unreadable overlapping text
  // the moment more than a couple of weeks in a row have no trades (a real, common case for a
  // lightly-traded account, and exactly the shape the approved design's own gap regions show:
  // one tinted span, one label, however many weeks wide).
  const gapRuns = [];
  let gap = [];
  weeks.forEach((w, i) => {
    if (w.score != null) { if (gap.length) gapRuns.push(gap); gap = []; return; }
    gap.push(i);
  });
  if (gap.length) gapRuns.push(gap);

  const scored = weeks.filter((w) => w.score != null);
  const newest = scored.length ? scored[scored.length - 1] : null;
  const newestIndex = newest ? weeks.lastIndexOf(newest) : -1;

  const line = (pts) => pts.map((p, k) => (k ? 'L' : 'M') + x(p.i) + ' ' + y(p.score)).join(' ');
  const area = (pts) => line(pts) + ' L' + x(pts[pts.length - 1].i) + ' ' + baseline + ' L' + x(pts[0].i) + ' ' + baseline + ' Z';
  const L = (props) => <Label viewW={width} viewH={height} {...props} />;

  return (
    <ChartFrame width={width} height={height} ariaLabel={i18n.t('psyTrendAria')}>
      <ChartSvg width={width} height={height}>
        <defs>
          <linearGradient id="navryaDisciplineFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(102,201,78,.28)"></stop>
            <stop offset="100%" stopColor="rgba(102,201,78,0)"></stop>
          </linearGradient>
        </defs>

        <rect x={padS} y={y(90)} width={plotW} height={Math.max(0, y(70) - y(90))} fill="rgba(102,201,78,.05)"></rect>

        {[0, 30, 60, 90].map((v) => (
          <line key={v} x1={padS} y1={y(v)} x2={padS + plotW} y2={y(v)} stroke={v === 0 ? 'rgba(244,234,215,.14)' : 'rgba(244,234,215,.05)'}></line>
        ))}

        {runs.map((pts, k) => (
          <g key={k}>
            {pts.length > 1 && <path d={area(pts)} fill="url(#navryaDisciplineFill)"></path>}
            <path d={line(pts)} fill="none" stroke="var(--char-accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"></path>
          </g>
        ))}

        {gapRuns.map((idxs) => {
          // Oldest-at-right layout (x decreases as i grows), so the run's right edge is x(min i).
          const left = x(Math.max(...idxs)) - step / 2, right = x(Math.min(...idxs)) + step / 2, mid = (left + right) / 2;
          return (
            <g key={'gap' + idxs[0]}>
              <rect x={left} y={padT} width={right - left} height={plotH} fill="rgba(244,234,215,.03)"></rect>
              <line x1={mid} y1={padT} x2={mid} y2={baseline} stroke="rgba(244,234,215,.18)" strokeDasharray="3 5"></line>
            </g>
          );
        })}
        {weeks.map((w, i) => (w.score == null ? null : (
          <circle key={'pt' + i} cx={x(i)} cy={y(w.score)} r={i === newestIndex ? 6 : 4}
            fill={i === newestIndex ? 'var(--char-light-glow, #8AF7B4)' : 'var(--ink-950)'}
            stroke={i === newestIndex ? 'var(--ink-950)' : 'var(--char-accent)'} strokeWidth="2"></circle>
        )))}
      </ChartSvg>

      {L({ x: padS + 6, y: y(90) + 13, anchor: 'start', color: 'var(--char-accent)', weight: 500, size: 10, width: 220, children: i18n.t('psyTrendHealthyBand') })}
      {[0, 30, 60, 90].map((v) => (
        <Label key={v} viewW={width} viewH={height} x={padS + plotW + 8} y={y(v) + 4} anchor="start" color="var(--text-dim)" size={11}>{i18n.number(v)}</Label>
      ))}

      {gapRuns.map((idxs) => {
        const left = x(Math.max(...idxs)) - step / 2, right = x(Math.min(...idxs)) + step / 2, mid = (left + right) / 2;
        return (
          <Label key={'gaplabel' + idxs[0]} viewW={width} viewH={height} x={mid} y={padT - 8} anchor="middle" color="var(--text-disabled)" size={10} width={110}>{i18n.t('psyTrendNoTrades')}</Label>
        );
      })}

      {/* Selective direct labels only - the newest week, and nothing else. */}
      {newest && L({ x: x(newestIndex), y: y(newest.score) - 14, anchor: 'middle', color: 'var(--char-light-glow, #8AF7B4)', weight: 500, size: 12, children: i18n.number(newest.score) })}

      {L({ x: padS + plotW, y: height - 14, anchor: 'middle', color: 'var(--text-dim)', size: 10, width: 130, children: i18n.t('psyTrendOldest', { count: i18n.number(weeks.length) }) })}
      {L({ x: padS, y: height - 14, anchor: 'middle', color: 'var(--text-dim)', size: 10, width: 130, children: i18n.t('psyTrendNewest') })}
    </ChartFrame>
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
  const L = (props) => <Label viewW={width} viewH={height} {...props} />;

  return (
    <ChartFrame width={width} height={height} ariaLabel={i18n.t('psyArcAria')}>
      <ChartSvg width={width} height={height}>
        <rect x={padS - 8} y={padT} width={plotW + 16} height={Math.max(0, y(7) - padT)} fill="rgba(255,56,48,.05)"></rect>
        <line x1={padS - 8} y1={y(7)} x2={width - padE + 8} y2={y(7)} stroke="rgba(255,56,48,.25)" strokeDasharray="4 4"></line>
        <line x1={padS - 8} y1={baseline} x2={width - padE + 8} y2={baseline} stroke="rgba(244,234,215,.14)"></line>

        <path d={path + ' L' + pts[pts.length - 1].x + ' ' + baseline + ' L' + pts[0].x + ' ' + baseline + ' Z'} fill={fill}></path>
        <path d={path} fill="none" stroke={tone} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"></path>

        {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="5.5" fill={tone} stroke="var(--ink-950)" strokeWidth="2"></circle>)}
      </ChartSvg>

      {pts.map((p, i) => (
        <React.Fragment key={i}>
          {L({ x: p.x, y: p.y - 13, anchor: 'middle', color: 'var(--text-primary)', weight: 500, size: 12, children: i18n.number(p.value) })}
          {L({ x: p.x, y: height - 6, anchor: 'middle', color: 'var(--text-dim)', size: 11, children: p.label })}
        </React.Fragment>
      ))}
    </ChartFrame>
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
    <ChartFrame width={width} height={height} ariaLabel={i18n.t('psyTilt_' + reading.level)}>
      <ChartSvg width={width} height={height}>
        <path d={arcPath(cx, cy, r, -90, 90)} fill="none" stroke="rgba(244,234,215,.08)" strokeWidth="13" strokeLinecap="round"></path>
        {TILT_BANDS.map((b) => (
          <path key={b.id} d={arcPath(cx, cy, r, b.from, b.to)} fill="none" stroke={b.tone} strokeWidth="13" strokeLinecap="round"></path>
        ))}
        <line
          x1={cx} y1={cy} x2={cx} y2={cy - 60} stroke="var(--text-primary)" strokeWidth="3" strokeLinecap="round"
          transform={'rotate(' + needleDeg + ' ' + cx + ' ' + cy + ')'}
        ></line>
        <circle cx={cx} cy={cy} r="7" fill="var(--ink-950)" stroke="var(--gold-warm)" strokeWidth="2"></circle>
      </ChartSvg>
      <Label viewW={width} viewH={height} x={cx} y={height - 3} anchor="middle" color={tone} weight={500} size={13} width={140}>{i18n.t('psyTilt_' + reading.level)}</Label>
    </ChartFrame>
  );
}

// ============================================================================
// READINESS DIAL - psych.readinessScore()'s 0-100 read as a full ring, OverviewTab only
// ============================================================================
const READINESS_KEYFRAMES = '@keyframes navrya-readiness-aura{0%,100%{opacity:.4;transform:scale(1)}50%{opacity:.92;transform:scale(1.07)}}'
  + '@media (prefers-reduced-motion: reduce){.navrya-readiness-aura{animation:none!important}}';

export function ReadinessDial({ i18n, score, ready, size = 132 }) {
  const cx = size / 2, cy = size / 2, r = size * 0.417, circumference = 2 * Math.PI * r;
  const tone = score == null ? 'var(--text-disabled)' : ready ? 'var(--char-accent)' : score >= 40 ? 'var(--warning)' : 'var(--danger)';
  const filled = score == null ? 0 : Math.max(0, Math.min(1, score / 100)) * circumference;
  return (
    <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
      <style>{READINESS_KEYFRAMES}</style>
      {score != null && (
        <span aria-hidden="true" style={{ position: 'absolute', inset: size * 0.06, borderRadius: 999, display: 'block', background: 'radial-gradient(circle,color-mix(in srgb, ' + tone + ' 34%, transparent),transparent 68%)', animation: 'navrya-readiness-aura 4.6s ease-in-out infinite' }} className="navrya-readiness-aura"></span>
      )}
      <svg width={size} height={size} viewBox={'0 0 ' + size + ' ' + size} style={{ position: 'relative', display: 'block' }} role="img" aria-label={i18n.t(score == null ? 'psyReadinessUnknown' : ready ? 'psyReadinessReady' : 'psyReadinessCaution')}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(244,234,215,.08)" strokeWidth={size * 0.076}></circle>
        {score != null && (
          <circle
            cx={cx} cy={cy} r={r} fill="none" stroke={tone} strokeWidth={size * 0.076} strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={circumference - filled} transform={'rotate(-90 ' + cx + ' ' + cy + ')'}
          ></circle>
        )}
      </svg>
      <Label viewW={size} viewH={size} x={cx} y={cy - size * 0.015} anchor="middle" color="var(--parchment)" weight={600} size={Math.round(size * 0.27)} width={size}>{score == null ? '—' : i18n.number(score)}</Label>
      <Label viewW={size} viewH={size} x={cx} y={cy + size * 0.15} anchor="middle" color="var(--text-muted)" weight={500} size={Math.round(size * 0.076)} letterSpacing=".14em" width={size}>
        {i18n.t(score == null ? 'psyReadinessUnknownShort' : ready ? 'psyReadinessReadyShort' : 'psyReadinessCautionShort')}
      </Label>
    </div>
  );
}

// ============================================================================
// EMOTIONAL MIRROR NOTICE - the single strongest paired reading (a real, computed
// best-frequency+profit vs worst-cost emotion), read off the same rows EmotionMap draws
// ============================================================================
export function emotionMirrorVerdict(rows) {
  if (rows.length < 2) return null;
  const mostCostly = rows.slice().sort((a, b) => a.pnl - b.pnl)[0];
  const best = rows.slice().sort((a, b) => (b.freq * Math.max(b.pnl, 0)) - (a.freq * Math.max(a.pnl, 0)))[0];
  if (mostCostly.pnl >= 0 || mostCostly.emotion === best.emotion) return null;
  return { costly: mostCostly, best };
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
