import React from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../public/pages/shared/navrya/components/core/Icon.jsx';
import { Button } from '../public/pages/shared/navrya/components/forms/Button.jsx';
import { Chip } from '../public/pages/shared/navrya/components/forms/Chip.jsx';
import { Notice } from '../public/pages/shared/navrya/components/feedback/Notice.jsx';
import { Modal } from '../public/pages/shared/navrya/components/feedback/Modal.jsx';
import { currentNavryaCharacter } from './currentCharacter.js';
import {
  CALM_PREF_KEY, TECHNIQUES, techniqueById, PHASE_LABEL_KEY, INWARD, PHASE_EASE,
  cycleSeconds, locate, phaseBoundaries, normalizeCalmPrefs
} from './calmRoomBreath.js';
import { CalmAudio } from './calmRoomAudio.js';
import { listTracks, addTracks, trackBlob, removeTrack } from './calmRoomMusic.js';

// ============================================================================
// CALM ROOM - the popup, its live breathing pacer, the breathing-types tab, the breath sound and
// the trader's own music, plus the board card that opens it (Dashboard, Session workspace,
// Psychology). Built from the approved design canvas (code-codex/peace: Main, Mobile, Types,
// Phases, Panels). The popup is the shared Modal shell - opaque neutral ink, gold frame - and every
// accent comes from the active character's tokens.
//
// Motion: every continuous movement (the disc, glow, light streaks, cycle ring, orbit dot, step
// fill) is a CSS animation. React re-renders only when a phase or a whole second changes, so the
// breath stays smooth. The clock (useBreathClock) is the single source of phase timing; the
// animations restart in step with it because each phase change swaps the animation name.
// ============================================================================

const STAGE = 372;

const ACCENT = 'var(--char-accent)';
const SOFT = 'var(--char-accent-soft, var(--char-accent))';
const ON_ACCENT = 'var(--char-on-accent, var(--ink-950))';
const HAIRLINE = 'var(--border-hairline)';
const LINE = 'rgba(244,234,215,.10)';
const DECK = 'var(--surface-780)';
const TEXT = 'var(--text-primary)';
const MUTED = 'var(--text-muted)';
const DIM = 'var(--text-dim)';
const QUIET = '#8F8B80';
const PATTERN_INK = '#D8CFBD';
const WELL = 'rgba(3,8,7,.35)';

function accent(pct) { return 'color-mix(in srgb, var(--char-accent) ' + pct + '%, transparent)'; }
function soft(pct) { return 'color-mix(in srgb, ' + SOFT + ' ' + pct + '%, transparent)'; }
function font(weight, size, lineHeight) { return weight + ' ' + size + 'px/' + lineHeight + ' var(--font-ui)'; }

const CALM_CSS = `
@keyframes navrya-calm-disc-in{from{transform:scale(.62)}to{transform:scale(1)}}
@keyframes navrya-calm-disc-inpart{from{transform:scale(.62)}to{transform:scale(.86)}}
@keyframes navrya-calm-disc-top{from{transform:scale(.86)}to{transform:scale(1)}}
@keyframes navrya-calm-disc-out{from{transform:scale(1)}to{transform:scale(.62)}}
@keyframes navrya-calm-disc-full{0%,100%{transform:scale(1)}50%{transform:scale(1.014)}}
@keyframes navrya-calm-disc-empty{from,to{transform:scale(.62)}}
@keyframes navrya-calm-glow-in{from{opacity:.2;transform:scale(.8)}to{opacity:.85;transform:scale(1.05)}}
@keyframes navrya-calm-glow-inpart{from{opacity:.2;transform:scale(.8)}to{opacity:.62;transform:scale(.97)}}
@keyframes navrya-calm-glow-top{from{opacity:.62;transform:scale(.97)}to{opacity:.85;transform:scale(1.05)}}
@keyframes navrya-calm-glow-out{from{opacity:.85;transform:scale(1.05)}to{opacity:.2;transform:scale(.8)}}
@keyframes navrya-calm-glow-full{0%,100%{opacity:.85;transform:scale(1.05)}50%{opacity:1;transform:scale(1.08)}}
@keyframes navrya-calm-glow-empty{from,to{opacity:.2;transform:scale(.8)}}
@keyframes navrya-calm-word-a{0%{opacity:0;transform:translateY(5px)}22%{opacity:1;transform:none}84%{opacity:1}100%{opacity:.2}}
@keyframes navrya-calm-word-b{0%{opacity:0;transform:translateY(5px)}22%{opacity:1;transform:none}84%{opacity:1}100%{opacity:.2}}
@keyframes navrya-calm-fill-a{from{width:0}to{width:100%}}
@keyframes navrya-calm-fill-b{from{width:0}to{width:100%}}
@keyframes navrya-calm-ring{0%{stroke-dashoffset:100;opacity:1}97%{opacity:1}100%{stroke-dashoffset:0;opacity:.25}}
@keyframes navrya-calm-orbit{from{transform:rotate(0)}to{transform:rotate(360deg)}}
@keyframes navrya-calm-streak-in{0%{transform:translateY(-190px);opacity:0}32%{opacity:.7}78%{opacity:.45}100%{transform:translateY(-134px);opacity:0}}
@keyframes navrya-calm-streak-out{0%{transform:translateY(-146px);opacity:0}24%{opacity:.55}100%{transform:translateY(-192px);opacity:0}}
.navrya-calm-hit{cursor:pointer;transition:filter 160ms ease,background-color 160ms ease,border-color 160ms ease,color 160ms ease}
.navrya-calm-hit:hover:not(:disabled){filter:brightness(1.12)}
.navrya-calm-quiet:hover:not(:disabled){background:rgba(244,234,215,.05)!important;color:var(--text-primary)!important}
.navrya-calm-hit:focus-visible,.navrya-calm-range:focus-visible,.navrya-calm-file:focus-within{outline:2px solid var(--char-accent);outline-offset:2px}
.navrya-calm-range{margin:0;height:18px;cursor:pointer;accent-color:var(--char-accent)}
.navrya-calm-input::placeholder{color:var(--text-disabled)}
@media (prefers-reduced-motion:reduce){.navrya-calm-streak{animation:none!important;opacity:0!important}}
`;

function CalmStyles() {
  return <style>{CALM_CSS}</style>;
}

// ---------------------------------------------------------------------------
// small shared helpers
// ---------------------------------------------------------------------------

function hash(i) { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
function pt(c, r, deg) { const a = deg * Math.PI / 180; return [c + r * Math.sin(a), c - r * Math.cos(a)]; }

function streakSet(dir) {
  return Array.from({ length: 28 }, (_, i) => {
    const dur = dir === 'in' ? 3.4 + 1.4 * hash(i + 3) : 4.2 + 1.6 * hash(i + 9);
    return {
      deg: i * 360 / 28 + (hash(i) - 0.5) * 8,
      len: 20 + 22 * hash(i + 17),
      anim: (dir === 'in' ? 'navrya-calm-streak-in ' : 'navrya-calm-streak-out ') + dur.toFixed(2) + 's '
        + (dir === 'in' ? 'cubic-bezier(.45,.05,.55,.95) ' : 'cubic-bezier(.2,.6,.35,1) ') + (-hash(i + 29) * dur).toFixed(2) + 's infinite'
    };
  });
}
const STREAKS_IN = streakSet('in');
const STREAKS_OUT = streakSet('out');

function phaseWord(i18n, kind) { return i18n.t(PHASE_LABEL_KEY[kind]); }
function techText(i18n, tech, part) { return i18n.t('calmTech' + tech.key + part); }
function patternText(i18n, tech) {
  const list = tech.phases.map(([kind, sec]) => phaseWord(i18n, kind) + ' ' + i18n.number(sec)).join(i18n.t('calmPatternJoin'));
  return i18n.t('calmPatternSeconds', { list });
}
function clock2(i18n, seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const pad = { minimumIntegerDigits: 2, useGrouping: false };
  return i18n.number(Math.floor(s / 60), pad) + ':' + i18n.number(s % 60, pad);
}
function clockShort(i18n, seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  return i18n.number(Math.floor(s / 60), { useGrouping: false }) + ':' + i18n.number(s % 60, { minimumIntegerDigits: 2, useGrouping: false });
}

function prefsApi() { return typeof window !== 'undefined' ? window.TradeJournalUserPreferences : null; }
export function readCalmPrefs() {
  const api = prefsApi();
  return normalizeCalmPrefs(api ? api.getPref(CALM_PREF_KEY, null) : null);
}
function writeCalmPrefs(prefs) {
  const api = prefsApi();
  if (api) api.setPref(CALM_PREF_KEY, normalizeCalmPrefs(prefs));
}

function useViewportWidth() {
  const read = () => (typeof window !== 'undefined' && window.innerWidth) || 1280;
  const [width, setWidth] = React.useState(read);
  React.useEffect(() => {
    const on = () => setWidth(read());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return width;
}

// ---------------------------------------------------------------------------
// the breath clock
// ---------------------------------------------------------------------------

// One clock per pacer. Restarts from the first inhale when the technique or `resetKey` changes;
// `onPhase(phase, secondsLeft)` fires at the start of every phase (the breath sound hangs off it).
export function useBreathClock(tech, resetKey, running, onPhase) {
  const [state, setState] = React.useState(() => ({ phase: 0, cycle: 0, counter: 1, left: locate(tech, 0).left }));
  const live = React.useRef({ elapsed: 0, key: 0, counter: 1, left: 0 });
  const runRef = React.useRef(running);
  runRef.current = running;
  const phaseRef = React.useRef(onPhase);
  phaseRef.current = onPhase;
  const techRef = React.useRef(tech);
  techRef.current = tech;

  React.useEffect(() => {
    const r = live.current;
    const first = locate(tech, 0);
    r.elapsed = 0; r.key = 0; r.counter += 1; r.left = first.left;
    setState({ phase: 0, cycle: 0, counter: r.counter, left: first.left });
    if (phaseRef.current && runRef.current) phaseRef.current(tech.phases[0], tech.phases[0][1]);
    if (typeof requestAnimationFrame !== 'function') return undefined;
    let last = performance.now();
    let raf = 0;
    const loop = (now) => {
      const dt = Math.max(0, now - last);
      last = now;
      if (runRef.current) r.elapsed += dt;
      const at = locate(tech, r.elapsed / 1000);
      const key = at.cycle * 16 + at.idx;
      if (key !== r.key) {
        r.key = key; r.counter += 1; r.left = at.left;
        setState({ phase: at.idx, cycle: at.cycle, counter: r.counter, left: at.left });
        if (phaseRef.current && runRef.current) phaseRef.current(tech.phases[at.idx], at.remaining);
      } else if (at.left !== r.left) {
        r.left = at.left;
        setState((s) => ({ ...s, left: at.left }));
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [tech.id, resetKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const peek = React.useCallback(() => {
    const t = techRef.current;
    const at = locate(t, live.current.elapsed / 1000);
    return { phase: t.phases[at.idx], remaining: at.remaining };
  }, []);
  return { ...state, peek };
}

// ---------------------------------------------------------------------------
// the stage: music ring, light streaks, glow, cycle ring, orbit dot, disc, phase word
// ---------------------------------------------------------------------------

// Drawn at 372px and scaled, so the popup (372), the phone (≈300) and the board card (220) are
// literally the same picture; strokes and type are counter-scaled to the design's sizes.
export function CalmStage({ i18n, size = STAGE, tech, clock, running = true, spectrum = null, bars = 72, notch = 'var(--ink-900)' }) {
  const f = size / STAGE;
  const idx = Math.min(clock.phase, tech.phases.length - 1);
  const [kind, seconds] = tech.phases[idx];
  const play = running ? 'running' : 'paused';
  const cycle = cycleSeconds(tech);
  const ab = clock.counter % 2 ? 'a' : 'b';
  const big = size >= STAGE; const mid = size >= 290; const small = size < 200;
  const wordPx = big ? 32 : mid ? 28 : small ? 14 : 22;
  const remainPx = mid ? 11 : 10;
  const ringPx = big ? 2 : mid ? 1.8 : 1.6;
  const tickPx = big ? 5 : 4;
  const blurPx = big ? 30 : mid ? 24 : 20;
  const dotPx = big ? 8 : 7;
  const inward = !!INWARD[kind];
  const outward = kind === 'out';

  const ring = [];
  for (let i = 0; i < bars; i += 1) {
    const v = spectrum ? spectrum[Math.floor(i * spectrum.length / bars)] || 0 : 0;
    const len = 2 + v * 12;
    ring.push({ deg: i * 360 / bars, len, op: 0.16 + v * 0.7, lit: v > 0.02 });
  }
  const notches = phaseBoundaries(tech).map((deg) => [pt(186, 112, deg), pt(186, 124, deg)]);

  return (
    <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: STAGE, height: STAGE, transform: 'scale(' + f + ')', transformOrigin: '0 0' }}>
        <div aria-hidden="true">
          {ring.map((b, i) => (
            <span key={i} style={{
              position: 'absolute', left: 186, top: 186, width: 2 / f, height: b.len, borderRadius: 2, display: 'block',
              background: b.lit ? ACCENT : 'rgba(244,234,215,.9)', opacity: b.op, transformOrigin: '0 0',
              transform: 'rotate(' + b.deg + 'deg) translate(' + (-1 / f) + 'px, ' + (-(170 + b.len)) + 'px)',
              transition: 'height 140ms linear, opacity 140ms linear, transform 140ms linear'
            }}></span>
          ))}
        </div>
        {[['in', STREAKS_IN, running && inward], ['out', STREAKS_OUT, running && outward]].map(([dir, list, on]) => (
          <div key={dir} aria-hidden="true" style={{ position: 'absolute', inset: 0, opacity: on ? 1 : 0, transition: 'opacity 1600ms cubic-bezier(.4,0,.2,1)' }}>
            {list.map((k, i) => (
              <span key={i} style={{ position: 'absolute', left: 186, top: 186, width: 0, height: 0, display: 'block', transform: 'rotate(' + k.deg + 'deg)' }}>
                <span className="navrya-calm-streak" style={{
                  position: 'absolute', left: -0.75 / f, top: 0, width: 1.5 / f, height: k.len, borderRadius: 2, display: 'block', opacity: 0,
                  background: 'linear-gradient(' + (dir === 'in' ? 180 : 0) + 'deg, rgba(0,0,0,0), ' + soft(dir === 'in' ? 95 : 85) + ')',
                  animation: k.anim
                }}></span>
              </span>
            ))}
          </div>
        ))}
        <span aria-hidden="true" style={{
          position: 'absolute', left: 56, top: 56, width: 260, height: 260, borderRadius: '50%', display: 'block',
          background: 'radial-gradient(circle, ' + accent(30) + ', rgba(7,11,15,0) 66%)', opacity: 0.2, transform: 'scale(.8)',
          animation: 'navrya-calm-glow-' + kind + ' ' + seconds + 's ' + PHASE_EASE[kind] + ' 0s 1 normal both ' + play
        }}></span>
        <svg width={STAGE} height={STAGE} viewBox={'0 0 ' + STAGE + ' ' + STAGE} style={{ position: 'absolute', left: 0, top: 0, display: 'block' }} aria-hidden="true">
          <circle cx="186" cy="186" r="118" fill="none" stroke={accent(16)} strokeWidth={ringPx / f}></circle>
          <g transform="rotate(-90 186 186)">
            <circle
              cx="186" cy="186" r="118" fill="none" stroke={ACCENT} strokeWidth={ringPx / f} strokeLinecap="round"
              pathLength="100" strokeDasharray="100 100" strokeDashoffset="100"
              style={{ animation: 'navrya-calm-ring ' + cycle + 's linear 0s infinite normal both ' + play }}
            ></circle>
          </g>
          {notches.map(([a, b], i) => (
            <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={notch} strokeWidth={tickPx / f}></line>
          ))}
        </svg>
        <div aria-hidden="true" style={{ position: 'absolute', inset: 0, animation: 'navrya-calm-orbit ' + cycle + 's linear 0s infinite normal none ' + play }}>
          <span style={{
            position: 'absolute', left: 186 - dotPx / f / 2, top: 68 - dotPx / f / 2, width: dotPx / f, height: dotPx / f,
            borderRadius: '50%', display: 'block', background: SOFT, boxShadow: '0 0 ' + (12 / f) + 'px ' + accent(60)
          }}></span>
        </div>
        <span aria-hidden="true" style={{
          position: 'absolute', left: 82, top: 82, width: 208, height: 208, boxSizing: 'border-box', borderRadius: '50%', display: 'block',
          border: (1.5 / f) + 'px solid ' + ACCENT,
          background: 'radial-gradient(circle at 50% 42%, ' + accent(20) + ', rgba(7,11,15,.94) 72%)',
          boxShadow: '0 0 ' + (blurPx / f) + 'px ' + accent(24) + ', inset 0 0 ' + (26 / f) + 'px ' + accent(12),
          transform: 'scale(.62)',
          animation: 'navrya-calm-disc-' + kind + ' ' + seconds + 's ' + PHASE_EASE[kind] + ' 0s 1 normal both ' + play
        }}></span>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 / f, pointerEvents: 'none' }}>
          <span aria-live="polite" style={{
            font: font(600, wordPx / f, 1.15), color: SOFT,
            animation: 'navrya-calm-word-' + ab + ' ' + seconds + 's ease-out 0s 1 normal both ' + play
          }}>{phaseWord(i18n, kind)}</span>
          {!small && (
            <span style={{ font: font(500, remainPx / f, (14 / f) + 'px'), color: QUIET }}>
              {i18n.t('calmSeconds', { value: i18n.number(clock.left) })}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// The phase stepper - also the pattern (the old "4 · 2 · 6" chip read as 20/60 in Persian digits).
function Stepper({ i18n, tech, clock, running, variant }) {
  const panel = variant === 'panel';
  const phone = variant === 'phone';
  const play = running ? 'running' : 'paused';
  const ab = clock.counter % 2 ? 'a' : 'b';
  return (
    <div style={{ display: 'flex', gap: panel ? 5 : 6, width: '100%' }}>
      {tech.phases.map(([kind, sec], k) => {
        const active = k === clock.phase;
        const done = k < clock.phase;
        return (
          <div key={k} style={{
            position: 'relative', overflow: 'hidden', boxSizing: 'border-box', minWidth: 0,
            height: panel ? 30 : phone ? 40 : 38, padding: panel ? '0 7px' : '0 10px', borderRadius: panel ? 7 : 8,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: panel ? 3 : phone ? 4 : 6,
            flex: sec + ' 1 0px', border: '1px solid ' + (active ? accent(60) : HAIRLINE), background: active ? accent(9) : WELL,
            transition: 'border-color 900ms ease, background-color 900ms ease'
          }}>
            <span style={{ font: panel ? font(600, 11, '14px') : phone ? font(600, 13, '18px') : font(600, 12, '16px'), whiteSpace: 'nowrap', color: active ? SOFT : done ? TEXT : MUTED, transition: 'color 900ms ease' }}>
              {phaseWord(i18n, kind)}
            </span>
            <span style={{ font: font(500, 10, '13px'), whiteSpace: 'nowrap', color: active ? soft(85) : QUIET }}>
              {panel ? i18n.number(sec) : i18n.t('calmSecShort', { value: i18n.number(sec) })}
            </span>
            <span style={{
              position: 'absolute', insetInlineStart: 0, bottom: 0, height: 2, width: done ? '100%' : '0%', display: 'block',
              background: active ? ACCENT : accent(40),
              animation: active ? 'navrya-calm-fill-' + ab + ' ' + sec + 's linear 0s 1 normal both ' + play : 'none'
            }}></span>
          </div>
        );
      })}
    </div>
  );
}

function TechLine({ i18n, tech }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span style={{ font: font(600, 12, '18px'), color: TEXT }}>{techText(i18n, tech, 'Name')}</span>
      <span style={{ font: font(500, 11, '18px'), color: QUIET }}>{techText(i18n, tech, 'Hint')}</span>
    </div>
  );
}

function PatternBar({ tech }) {
  const color = (kind) => (INWARD[kind] ? ACCENT : kind === 'out' ? soft(70) : kind === 'full' ? accent(30) : 'rgba(244,234,215,.14)');
  return (
    <span style={{ display: 'flex', gap: 3, width: '100%', height: 5 }}>
      {tech.phases.map(([kind, sec], i) => (
        <span key={i} style={{ flex: sec + ' 1 0px', borderRadius: 3, display: 'block', background: color(kind) }}></span>
      ))}
    </span>
  );
}

// The "breathing types" tab: one card per technique; picking one restarts the pacer on it.
export function TypesList({ i18n, activeId, onPick }) {
  return TECHNIQUES.map((tech) => {
    const on = tech.id === activeId;
    return (
      <button
        key={tech.id} type="button" className="navrya-calm-hit" aria-pressed={on} onClick={() => onPick(tech.id)}
        style={{
          width: '100%', textAlign: 'start', boxSizing: 'border-box', padding: '12px 14px', borderRadius: 10, flex: 'none',
          border: '1px solid ' + (on ? accent(60) : HAIRLINE), background: on ? accent(7) : DECK,
          display: 'flex', flexDirection: 'column', gap: 7, color: TEXT, font: 'inherit'
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
          <span style={{ font: font(600, 14, '20px'), color: on ? SOFT : TEXT }}>{techText(i18n, tech, 'Name')}</span>
          <span style={{ padding: '1px 8px', borderRadius: 999, border: '1px solid rgba(214,175,107,.45)', font: font(500, 10, '15px'), color: 'var(--gold-warm)', whiteSpace: 'nowrap' }}>{techText(i18n, tech, 'Tag')}</span>
          <span style={{ flex: 1 }}></span>
          <span style={{ font: font(500, 11, '14px'), color: on ? ACCENT : MUTED, whiteSpace: 'nowrap' }}>{i18n.t(on ? 'calmTechActive' : 'calmTechStart')}</span>
        </span>
        <PatternBar tech={tech} />
        <span style={{ font: font(500, 11, '15px'), color: PATTERN_INK }}>{patternText(i18n, tech)}</span>
        <span style={{ font: font(500, 12, '19px'), color: DIM }}>{techText(i18n, tech, 'Use')}</span>
        <span style={{ font: font(500, 11, '15px'), color: QUIET }}>{techText(i18n, tech, 'Rounds')}</span>
        {tech.caution && <span style={{ font: font(500, 11, '15px'), color: 'var(--warning)' }}>{techText(i18n, tech, 'Caution')}</span>}
      </button>
    );
  });
}

function Tabs({ i18n, tab, onTab, tall }) {
  const tabStyle = (on) => ({
    height: tall ? 32 : 28, padding: '0 12px', borderRadius: 7, border: 0, background: on ? accent(16) : 'transparent',
    color: on ? SOFT : MUTED, font: font(600, 12, '16px')
  });
  return (
    <div role="tablist" aria-label={i18n.t('moodCalmTitle')} style={{ display: 'flex', gap: 2, padding: 2, borderRadius: 9, border: '1px solid ' + LINE, background: 'rgba(3,8,7,.45)', flex: 'none' }}>
      <button type="button" role="tab" aria-selected={tab === 'practice'} className="navrya-calm-hit" onClick={() => onTab('practice')} style={tabStyle(tab === 'practice')}>{i18n.t('calmTabPractice')}</button>
      <button type="button" role="tab" aria-selected={tab === 'types'} className="navrya-calm-hit" onClick={() => onTab('types')} style={tabStyle(tab === 'types')}>{i18n.t('calmTabTypes')}</button>
    </div>
  );
}

function SectionLabel({ children }) {
  return <span style={{ font: font(700, 11, '14px'), letterSpacing: '.08em', color: MUTED }}>{children}</span>;
}

// ---------------------------------------------------------------------------
// the popup
// ---------------------------------------------------------------------------

export function CalmRoom({ i18n, psych, profile, trades, reason, onClose }) {
  const t = (key, vars) => i18n.t(key, vars);
  const rtl = i18n.direction ? i18n.direction() === 'rtl' : true;
  const vw = useViewportWidth();
  const narrow = vw <= 900;
  const stageSize = narrow ? Math.max(220, Math.min(300, vw - 90)) : STAGE;

  const [prefs, setPrefs] = React.useState(readCalmPrefs);
  const prefsRef = React.useRef(prefs);
  prefsRef.current = prefs;
  const tech = techniqueById(prefs.technique);
  const [gen, setGen] = React.useState(0);
  const [running, setRunning] = React.useState(true);
  const runningRef = React.useRef(true);
  runningRef.current = running;
  const [tab, setTab] = React.useState('practice');
  const [breathDone, setBreathDone] = React.useState(false);
  const [why, setWhy] = React.useState('');
  const [focus, setFocus] = React.useState(false);

  const settings = psych.settings();
  const totalSeconds = Math.max(60, (settings.postTradeReflection.cooldownMinutes || 15) * 60);
  const [seconds, setSeconds] = React.useState(totalSeconds);
  React.useEffect(() => {
    const id = setInterval(() => setSeconds((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, []);

  // sound + music
  const [tracks, setTracks] = React.useState([]);
  const [cur, setCur] = React.useState(null);
  const [playing, setPlaying] = React.useState(false);
  const [pos, setPos] = React.useState(0);
  const [dur, setDur] = React.useState(0);
  const [spectrum, setSpectrum] = React.useState(null);
  const [showList, setShowList] = React.useState(false);
  const [showVolume, setShowVolume] = React.useState(false);
  const [musicNote, setMusicNote] = React.useState('');
  const tracksRef = React.useRef(tracks);
  tracksRef.current = tracks;
  const curRef = React.useRef(cur);
  curRef.current = cur;
  const engineRef = React.useRef(null);
  const nextRef = React.useRef(() => {});
  if (!engineRef.current) {
    engineRef.current = new CalmAudio({
      breathVolume: prefs.breathVolume,
      musicVolume: prefs.musicVolume,
      onMusic: (event) => {
        if (event.type === 'duration') setDur(event.value);
        else if (event.type === 'playing') setPlaying(true);
        else if (event.type === 'paused') setPlaying(false);
        else if (event.type === 'ended') nextRef.current();
      }
    });
  }
  const engine = engineRef.current;

  const onPhase = React.useCallback((phase, remaining) => {
    engine.breathe(phase[0], remaining, false);
  }, [engine]);
  const clock = useBreathClock(tech, gen, running, onPhase);

  React.useEffect(() => { if (clock.cycle >= 1) setBreathDone(true); }, [clock.cycle]);

  // Saved preferences (technique, sound, volumes, last song) follow the trader across devices;
  // the volume sliders are debounced so a drag is one write.
  const firstSave = React.useRef(true);
  React.useEffect(() => {
    if (firstSave.current) { firstSave.current = false; return undefined; }
    const id = setTimeout(() => writeCalmPrefs(prefs), 400);
    return () => clearTimeout(id);
  }, [prefs]);
  const patchPrefs = (patch) => setPrefs((p) => ({ ...p, ...patch }));

  React.useEffect(() => {
    let alive = true;
    listTracks().then((list) => {
      if (!alive) return;
      setTracks(list);
      const saved = list.find((x) => x.id === prefsRef.current.trackId);
      setCur(saved ? saved.id : (list[0] ? list[0].id : null));
    });
    return () => { alive = false; engine.dispose(); };
  }, [engine]);

  React.useEffect(() => {
    if (!playing) { setSpectrum(null); return undefined; }
    const id = setInterval(() => { setSpectrum(engine.spectrum(72)); setPos(engine.position()); }, 90);
    return () => clearInterval(id);
  }, [playing, engine]);

  // A saved "sound on" can only start after a gesture inside the room (browser autoplay rules).
  const wake = () => {
    if (!prefsRef.current.breathSound || engine.breathOn) return;
    engine.resume();
    engine.setBreathOn(true);
    if (runningRef.current) { const now = clock.peek(); engine.breathe(now.phase[0], now.remaining, true); }
  };

  const toggleBreath = () => {
    const on = !prefs.breathSound;
    patchPrefs({ breathSound: on });
    engine.resume();
    engine.setBreathOn(on);
    if (on && running) { const now = clock.peek(); engine.breathe(now.phase[0], now.remaining, true); }
  };
  const togglePacer = () => {
    const next = !running;
    setRunning(next);
    if (!next) engine.hush();
    else if (prefs.breathSound) { const now = clock.peek(); engine.breathe(now.phase[0], now.remaining, true); }
  };
  const pickTech = (id) => {
    engine.hush();
    patchPrefs({ technique: id });
    setGen((g) => g + 1);
    setTab('practice');
  };

  const loadTrack = (id, autoplay) => {
    setCur(id); setPos(0); setDur(0);
    patchPrefs({ trackId: id });
    trackBlob(id).then((blob) => engine.load(blob, autoplay));
  };
  const step = (delta, autoplay) => {
    const list = tracksRef.current;
    if (!list.length) return;
    const at = Math.max(0, list.findIndex((x) => x.id === curRef.current));
    loadTrack(list[(at + delta + list.length) % list.length].id, autoplay);
  };
  nextRef.current = () => step(1, true);
  const togglePlay = () => {
    if (!tracks.length) return;
    if (!engine.hasTrack()) { loadTrack(cur || tracks[0].id, true); return; }
    if (playing) engine.pause(); else engine.play();
  };
  const onFiles = (e) => {
    const input = e.target;
    const files = Array.from((input && input.files) || []);
    if (input) input.value = '';
    if (!files.length) return;
    addTracks(files).then(({ added, tooBig }) => {
      setMusicNote(tooBig ? t('calmMusicTooBig') : '');
      if (!added.length) return;
      const wasEmpty = !tracksRef.current.length;
      setTracks((list) => list.concat(added));
      setShowList(true);
      if (wasEmpty || !engine.hasTrack()) loadTrack(added[0].id, true);
    });
  };
  const dropTrack = (id) => {
    removeTrack(id);
    const rest = tracks.filter((x) => x.id !== id);
    setTracks(rest);
    if (id === cur) {
      engine.load(null, false);
      setPlaying(false); setPos(0); setDur(0);
      setCur(rest[0] ? rest[0].id : null);
      patchPrefs({ trackId: rest[0] ? rest[0].id : null });
    }
  };
  const setBreathVolume = (value) => { engine.setBreathVolume(value); patchPrefs({ breathVolume: value }); };
  const setMusicVolume = (value) => { engine.setMusicVolume(value); patchPrefs({ musicVolume: value }); };

  // exit gate
  const timerDone = seconds === 0;
  const whyLength = why.trim().length;
  const reasonGiven = whyLength >= 10;
  const canLeave = timerDone && reasonGiven && breathDone;
  const gates = [
    [breathDone, t('calmGateCycle')],
    [timerDone, timerDone ? t('calmGateTimerDone') : t('moodGateTimer', { value: clock2(i18n, seconds) })],
    [reasonGiven, t('moodGateReason')]
  ];

  const worst = psych.worstRevengeTrade(trades || []);
  const reflections = (profile.continuousTracking && profile.continuousTracking.postTradeReflections) || [];
  const worstReflection = worst ? reflections.find((r) => r.tradeId === worst.tradeId) : null;
  // A real count of how often the revenge cool-down has actually armed, from
  // postTradeReflection.revengeCheck - never a fabricated completion rate.
  const cooldownFires = reflections.filter((r) => r.revengeCheck && r.revengeCheck.cooldownTimerStartedAt).length;

  const current = tracks.find((x) => x.id === cur) || null;
  const curIndex = current ? tracks.indexOf(current) : -1;

  const pacerHeader = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Tabs i18n={i18n} tab={tab} onTab={setTab} tall={narrow} />
      <span style={{ font: font(500, 11, '14px'), color: QUIET, whiteSpace: 'nowrap' }}>{t('calmCycle', { value: i18n.number(clock.cycle + 1) })}</span>
      <span style={{ flex: 1 }}></span>
      {narrow ? (
        <button type="button" className="navrya-calm-hit navrya-calm-quiet" onClick={togglePacer} aria-label={t(running ? 'calmPause' : 'calmResume')} style={{ width: 36, height: 36, borderRadius: 8, display: 'grid', placeItems: 'center', padding: 0, border: '1px solid ' + LINE, background: 'transparent', color: MUTED }}>
          <Icon name={running ? 'pause' : 'play'} size={13} fill="currentColor" />
        </button>
      ) : (
        <React.Fragment>
          <button type="button" className="navrya-calm-hit navrya-calm-quiet" onClick={togglePacer} style={{ height: 30, padding: '0 10px', display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 8, border: '1px solid ' + LINE, background: 'transparent', color: MUTED, font: font(500, 12, '16px') }}>
            <Icon name={running ? 'pause' : 'play'} size={12} fill="currentColor" />
            {t(running ? 'calmPause' : 'calmResume')}
          </button>
          <button type="button" className="navrya-calm-hit navrya-calm-quiet" onClick={() => setBreathDone(true)} disabled={breathDone} style={{ height: 30, padding: '0 8px', borderRadius: 8, border: '1px solid transparent', background: 'transparent', color: breathDone ? ACCENT : MUTED, font: font(500, 12, '16px'), cursor: breathDone ? 'default' : 'pointer' }}>
            {t(breathDone ? 'moodBreathDone' : 'moodBreathSkip')}
          </button>
        </React.Fragment>
      )}
    </div>
  );

  const breathColumn = (
    <div style={{
      position: 'relative', display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0,
      paddingInlineEnd: narrow ? 0 : 22, borderInlineEnd: narrow ? 'none' : '1px solid ' + HAIRLINE
    }}>
      {pacerHeader}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <CalmStage key={tech.id + ':' + gen} i18n={i18n} size={stageSize} tech={tech} clock={clock} running={running} spectrum={spectrum} bars={narrow ? 64 : 72} />
      </div>
      <Stepper i18n={i18n} tech={tech} clock={clock} running={running} variant={narrow ? 'phone' : 'room'} />
      <TechLine i18n={i18n} tech={tech} />
      {tab === 'types' && (
        <div role="tabpanel" aria-label={t('calmTabTypes')} className="navrya-scroll" style={{
          position: 'absolute', left: 0, right: 0, top: narrow ? 50 : 46, bottom: 0, marginInlineEnd: narrow ? 0 : 22,
          overflowY: 'auto', background: 'var(--ink-900)', display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 4
        }}>
          <TypesList i18n={i18n} activeId={tech.id} onPick={pickTech} />
        </div>
      )}
    </div>
  );

  const exitColumn = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
      {worst ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '15px 16px', borderRadius: 10, border: '1px solid rgba(255,56,48,.45)', background: 'rgba(255,56,48,.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <SectionLabel>{t('moodCalmDeterrentTitle')}</SectionLabel>
            <span style={{ marginInlineStart: 'auto', font: font(500, 11, '14px'), color: DIM }}>{i18n.date(worst.closedAt)}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ font: font(500, 11, '14px'), color: DIM }}>{t('moodCalmLoss')}</span>
              <span className="navrya-tabular" style={{ font: font(600, 20, '24px'), color: 'var(--danger)' }}>{i18n.money(worst.pnl)}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ font: font(500, 11, '14px'), color: DIM }}>{t('moodCalmGapLabel')}</span>
              <span className="navrya-tabular" style={{ font: font(600, 20, '24px'), color: TEXT }}>{t('moodCalmGapMinutes', { value: i18n.number(worst.minutesSinceLoss) })}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ font: font(500, 11, '14px'), color: DIM }}>{t('moodCalmSizeLabel')}</span>
              <span className="navrya-tabular" style={{ font: font(600, 20, '24px'), color: worst.sizeRatio != null ? 'var(--warning)' : 'var(--text-disabled)' }}>
                {worst.sizeRatio != null ? t('moodCalmSizeRatio', { value: i18n.number(worst.sizeRatio) }) : '—'}
              </span>
            </div>
          </div>
          {worstReflection && worstReflection.sentenceOfTheDay && (
            <span style={{ font: 'italic 400 14px/22px var(--font-quote, Georgia, serif)', color: 'var(--parchment)', borderInlineStart: '2px solid rgba(255,56,48,.5)', paddingInlineStart: 12 }}>
              «{worstReflection.sentenceOfTheDay}»
            </span>
          )}
        </div>
      ) : (
        <Notice tone="accent" icon="honour">{t('moodNoRevengeYet')}</Notice>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <SectionLabel>{t('moodExitGate')}</SectionLabel>
        <p style={{ margin: 0, font: font(500, 12, '18px'), color: DIM }}>{t('moodExitGateBody')}</p>
        <label htmlFor="navrya-calm-why" style={{ font: font(600, 13, '18px'), color: TEXT }}>{t('moodExitReason')}</label>
        <input
          id="navrya-calm-why" className="navrya-calm-input" type="text" value={why} placeholder={t('moodExitReasonPlaceholder')}
          onChange={(e) => setWhy(e.target.value)} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
          style={{
            height: 44, boxSizing: 'border-box', padding: '0 14px', borderRadius: 8, width: '100%', background: 'rgba(3,8,7,.55)',
            color: TEXT, font: font(500, 13, '18px'), outline: 'none', border: '1px solid ' + (focus ? ACCENT : 'var(--border-gold)'),
            transition: 'border-color var(--dur-hover) var(--ease-out)'
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ flex: 1, font: font(500, 11, '14px'), color: DIM }}>{t(reasonGiven ? 'calmWhyKept' : 'moodExitReasonHint')}</span>
          <span style={{ font: font(500, 11, '14px'), color: reasonGiven ? ACCENT : QUIET }}>{t('calmWhyCount', { count: i18n.number(Math.min(whyLength, 999)), min: i18n.number(10) })}</span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {gates.map(([ok, label]) => (
          <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              width: 20, height: 20, flex: 'none', boxSizing: 'border-box', borderRadius: 6, display: 'grid', placeItems: 'center',
              border: '1px solid ' + (ok ? accent(60) : 'rgba(244,234,215,.18)'), background: ok ? ACCENT : 'transparent', color: ON_ACCENT,
              transition: 'background-color 600ms ease, border-color 600ms ease'
            }}>{ok && <Icon name="check" size={13} strokeWidth={3} />}</span>
            <span style={{ flex: 1, font: font(500, 12, '16px'), color: ok ? TEXT : DIM }}>{label}</span>
          </span>
        ))}
      </div>

      <div style={{ height: 1, background: HAIRLINE }}></div>
      <Button variant="primary" fullWidth disabled={!canLeave} icon={canLeave ? undefined : 'lock'} onClick={onClose}>{t('moodCalmLeave')}</Button>
      <span style={{ textAlign: 'center', font: font(500, 11, '14px'), color: DIM }}>{t(canLeave ? 'calmLeaveReady' : 'moodCalmLeaveHint')}</span>
    </div>
  );

  const iconTile = (name, size) => (
    <span style={{ width: size, height: size, flex: 'none', boxSizing: 'border-box', borderRadius: 8, display: 'grid', placeItems: 'center', color: ACCENT, background: 'rgba(3,8,7,.7)', border: '1px solid ' + accent(45) }}>
      <Icon name={name} size={18} />
    </span>
  );
  const artTile = (size) => (
    <span aria-hidden="true" style={{
      width: size, height: size, flex: 'none', boxSizing: 'border-box', borderRadius: 8, display: 'flex', alignItems: playing ? 'flex-end' : 'center',
      justifyContent: 'center', gap: 3, padding: size > 36 ? '10px 9px' : '9px 8px', color: ACCENT,
      background: 'linear-gradient(160deg, ' + accent(30) + ', rgba(3,8,7,.9))', border: '1px solid ' + accent(45)
    }}>
      {playing
        ? [2, 7, 12, 17].map((bin) => (
          <span key={bin} style={{ width: 3, borderRadius: 2, display: 'block', background: SOFT, height: 4 + ((spectrum && spectrum[bin]) || 0.3) * 14, transition: 'height 140ms linear' }}></span>
        ))
        : <Icon name="music" size={17} />}
    </span>
  );
  const volumeRange = (value, onChange, label, style) => (
    <input className="navrya-calm-range" type="range" min="0" max="1" step="0.01" value={value} aria-label={label} onChange={(e) => onChange(Number(e.target.value))} style={style} />
  );
  const breathSwitch = (
    <button
      type="button" role="switch" aria-checked={prefs.breathSound} aria-label={t('calmBreathSound')} className="navrya-calm-hit" onClick={toggleBreath}
      style={{
        width: 42, height: 24, flex: 'none', boxSizing: 'border-box', padding: 2, borderRadius: 999, display: 'flex', alignItems: 'center',
        justifyContent: prefs.breathSound ? 'flex-end' : 'flex-start',
        border: '1px solid ' + (prefs.breathSound ? ACCENT : 'rgba(244,234,215,.16)'), background: prefs.breathSound ? ACCENT : LINE
      }}
    >
      <span style={{ width: 18, height: 18, borderRadius: 999, display: 'block', background: prefs.breathSound ? ON_ACCENT : MUTED }}></span>
    </button>
  );
  const addLabel = (compact) => (
    <label className="navrya-calm-hit navrya-calm-file" aria-label={compact ? t('calmMusicAdd') : undefined} style={{
      position: 'relative', height: compact ? 44 : 36, width: compact ? 44 : undefined, padding: compact ? 0 : '0 12px', flex: 'none', boxSizing: 'border-box',
      borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, overflow: 'hidden',
      border: '1px solid var(--border-gold)', background: 'rgba(11,20,21,.72)', color: TEXT, font: font(500, 12, '16px')
    }}>
      <Icon name="plus" size={compact ? 16 : 14} />
      {!compact && t('calmMusicAdd')}
      <input type="file" accept="audio/*" multiple onChange={onFiles} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', fontSize: 0 }} />
    </label>
  );
  const navButton = (name, label, onClick, size) => (
    <button type="button" className="navrya-calm-hit navrya-calm-quiet" onClick={onClick} aria-label={label} disabled={tracks.length < 2} style={{
      width: size, height: size, borderRadius: 8, display: 'grid', placeItems: 'center', padding: 0, border: '1px solid transparent',
      background: 'transparent', color: MUTED, opacity: tracks.length > 1 ? 1 : 0.38
    }}><Icon name={name} size={size > 40 ? 16 : 15} fill="currentColor" /></button>
  );
  const playButton = (size) => (
    <button type="button" className="navrya-calm-hit" onClick={togglePlay} disabled={!tracks.length} aria-label={t(playing ? 'calmMusicPause' : 'calmMusicPlay')} style={{
      width: size, height: size, borderRadius: 999, display: 'grid', placeItems: 'center', padding: 0, border: '1px solid ' + ACCENT,
      background: ACCENT, color: ON_ACCENT, opacity: tracks.length ? 1 : 0.38
    }}><Icon name={playing ? 'pause' : 'play'} size={size > 40 ? 17 : 15} fill="currentColor" /></button>
  );
  const seekRow = (
    <div dir="ltr" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ width: 34, font: font(500, 11, '14px'), color: MUTED }}>{clockShort(i18n, pos)}</span>
      <input className="navrya-calm-range" type="range" min="0" max={dur ? dur.toFixed(1) : 1} step="0.1" value={Math.min(pos, dur || 1)} disabled={!dur}
        aria-label={t('calmMusicSeek')} onChange={(e) => { const v = Number(e.target.value); engine.seek(v); setPos(v); }} style={{ flex: 1 }} />
      <span style={{ width: 34, textAlign: 'right', font: font(500, 11, '14px'), color: MUTED }}>{clockShort(i18n, dur)}</span>
      {!narrow && (
        <React.Fragment>
          <span style={{ width: 1, height: 16, background: LINE }}></span>
          <span style={{ display: 'flex', color: QUIET }}><Icon name="volume-2" size={16} /></span>
          {volumeRange(prefs.musicVolume, setMusicVolume, t('calmMusicVolume'), { width: 96 })}
        </React.Fragment>
      )}
    </div>
  );
  const trackTitle = current ? current.name : t('calmMusicNone');
  const trackCaption = current
    ? t(playing ? 'calmMusicPlaying' : 'calmMusicStopped') + ' · ' + t('calmMusicTrackOf', { current: i18n.number(curIndex + 1), total: i18n.number(tracks.length) })
    : t('calmMusicInvite');
  const titleBlock = (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ font: font(600, 13, '18px'), color: TEXT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{trackTitle}</span>
      <span style={{ font: font(500, 11, '15px'), color: DIM, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{trackCaption}</span>
    </div>
  );
  const listToggle = (size) => (
    <button type="button" className="navrya-calm-hit navrya-calm-quiet" onClick={() => setShowList((v) => !v)} aria-label={t('calmMusicList')} aria-expanded={showList} style={{
      height: size, minWidth: size, padding: size > 40 ? 0 : '0 10px', flex: 'none', borderRadius: 8, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
      border: '1px solid ' + (showList ? accent(50) : LINE), background: 'transparent', color: MUTED, font: font(500, 12, '16px')
    }}>
      <Icon name="list-music" size={size > 40 ? 16 : 15} />
      {size <= 40 && i18n.number(tracks.length)}
    </button>
  );

  const breathBlock = (
    <div style={{
      flex: narrow ? 'none' : '0 0 322px', boxSizing: 'border-box', padding: narrow ? 14 : '14px 16px', display: 'flex', flexDirection: 'column', gap: 12,
      borderInlineEnd: narrow ? 'none' : '1px solid ' + HAIRLINE, borderBottom: narrow ? '1px solid ' + HAIRLINE : 'none'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {iconTile('wind', 36)}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ font: font(600, 13, '18px'), color: TEXT }}>{t('calmBreathSound')}</span>
          <span style={{ font: font(500, 11, '15px'), color: DIM }}>{t(prefs.breathSound ? 'calmBreathSoundOn' : 'calmBreathSoundOff')}</span>
        </div>
        {breathSwitch}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: QUIET }}>
        <Icon name="volume-1" size={16} />
        {volumeRange(prefs.breathVolume, setBreathVolume, t('calmBreathVolume'), { flex: 1 })}
        <span style={{ width: 34, font: font(500, 11, '14px'), color: MUTED }}>{t('calmPercent', { value: i18n.number(Math.round(prefs.breathVolume * 100)) })}</span>
      </div>
    </div>
  );

  const musicBlock = narrow ? (
    <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {artTile(40)}
        {titleBlock}
        {addLabel(true)}
      </div>
      {seekRow}
      <div dir="ltr" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
        {listToggle(44)}
        {navButton('skip-back', t('calmMusicPrev'), () => step(-1, playing), 44)}
        {playButton(52)}
        {navButton('skip-forward', t('calmMusicNext'), () => step(1, playing), 44)}
        <button type="button" className="navrya-calm-hit navrya-calm-quiet" onClick={() => setShowVolume((v) => !v)} aria-label={t('calmMusicVolume')} aria-expanded={showVolume} style={{
          width: 44, height: 44, borderRadius: 8, display: 'grid', placeItems: 'center', padding: 0, border: '1px solid ' + (showVolume ? accent(50) : LINE), background: 'transparent', color: MUTED
        }}><Icon name="volume-2" size={16} /></button>
      </div>
      {showVolume && (
        <div dir="ltr" style={{ display: 'flex', alignItems: 'center', gap: 10, color: QUIET }}>
          <Icon name="volume-2" size={16} />
          {volumeRange(prefs.musicVolume, setMusicVolume, t('calmMusicVolume'), { flex: 1 })}
        </div>
      )}
    </div>
  ) : (
    <div style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {artTile(36)}
        {titleBlock}
        <div dir="ltr" style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 'none' }}>
          {navButton('skip-back', t('calmMusicPrev'), () => step(-1, playing), 32)}
          {playButton(38)}
          {navButton('skip-forward', t('calmMusicNext'), () => step(1, playing), 32)}
        </div>
        {addLabel(false)}
        {listToggle(36)}
      </div>
      {seekRow}
    </div>
  );

  const soundDeck = (
    <section aria-label={t('calmSoundDeck')} style={{ display: narrow ? 'block' : 'flex', alignItems: 'stretch', border: '1px solid ' + HAIRLINE, borderRadius: 12, background: DECK, overflow: 'hidden' }}>
      {breathBlock}
      {musicBlock}
    </section>
  );

  const playlist = showList && (
    <div style={{ border: '1px solid ' + HAIRLINE, borderRadius: 12, background: DECK, padding: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
      {!tracks.length && <span style={{ padding: 10, font: font(500, 12, '18px'), color: DIM }}>{t('calmMusicEmpty')}</span>}
      {tracks.map((track, k) => {
        const on = track.id === cur;
        return (
          <div key={track.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', borderRadius: 8, background: on ? accent(10) : 'transparent' }}>
            <span style={{ width: 22, textAlign: 'center', font: font(500, 11, '14px'), color: on ? ACCENT : QUIET }}>{i18n.number(k + 1)}</span>
            <button type="button" className="navrya-calm-hit" onClick={() => loadTrack(track.id, true)} style={{
              flex: 1, minWidth: 0, textAlign: 'start', padding: '4px 0', border: 0, background: 'transparent', color: on ? SOFT : TEXT,
              font: font(500, 13, '18px'), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
            }}>{track.name}</button>
            <button type="button" className="navrya-calm-hit navrya-calm-quiet" onClick={() => dropTrack(track.id)} aria-label={t('calmMusicRemove')} style={{
              width: 28, height: 28, borderRadius: 6, display: 'grid', placeItems: 'center', padding: 0, border: '1px solid transparent', background: 'transparent', color: QUIET
            }}><Icon name="close" size={14} /></button>
          </div>
        );
      })}
      {musicNote && <span style={{ padding: '4px 10px 0', font: font(500, 11, '14px'), color: 'var(--warning)' }}>{musicNote}</span>}
      <span style={{ padding: '4px 10px 6px', font: font(500, 11, '14px'), color: QUIET }}>{t('calmMusicLocal')}</span>
    </div>
  );

  return createPortal(
    <div data-character={currentNavryaCharacter()} dir={rtl ? 'rtl' : 'ltr'}>
      <Modal
        open title={t('moodCalmTitle')} icon="honour" onClose={onClose} width={980} onPointerDownCapture={wake}
        footer={(
          <React.Fragment>
            <span style={{ flex: 1, font: font(500, 11, '14px'), color: DIM }}>{t('moodCalmAfter')}</span>
            {cooldownFires > 0 && <Chip tone="neutral">{t('moodCalmFiredCount', { count: i18n.number(cooldownFires) })}</Chip>}
          </React.Fragment>
        )}
      >
        <CalmStyles />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <p style={{ margin: 0, flex: '1 1 260px', font: font(500, 12, '18px'), color: DIM }}>{t('moodCalmSubtitle')}</p>
          {reason && <Chip tone="danger" dot>{reason}</Chip>}
        </div>
        {narrow ? (
          <React.Fragment>
            {breathColumn}
            {soundDeck}
            {playlist}
            {exitColumn}
          </React.Fragment>
        ) : (
          <React.Fragment>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.08fr) minmax(0, 1fr)', gap: 22, alignItems: 'stretch' }}>
              {breathColumn}
              {exitColumn}
            </div>
            {soundDeck}
            {playlist}
          </React.Fragment>
        )}
      </Modal>
    </div>,
    document.body
  );
}

// ---------------------------------------------------------------------------
// the board card (Dashboard, Session workspace, Psychology's Protective tab)
// ---------------------------------------------------------------------------

function StatusPill({ icon, on, children }) {
  return (
    <span style={{
      flex: 1, minWidth: 0, height: 30, boxSizing: 'border-box', padding: '0 9px', borderRadius: 999, display: 'inline-flex', alignItems: 'center', gap: 6,
      border: '1px solid ' + (on ? accent(50) : LINE), color: on ? SOFT : QUIET, font: font(500, 11, '14px'), whiteSpace: 'nowrap', overflow: 'hidden'
    }}>
      <Icon name={icon} size={13} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{children}</span>
    </span>
  );
}

// `titled` draws the card's own header (Psychology hosts it in a plain Panel); the board hosts
// already draw one. `onOpen` lets a host open its own CalmRoom (Psychology adds its reason chip).
export function CalmRoomPanel({ i18n, titled = false, onOpen, notch = 'var(--surface-800)' }) {
  const psych = window.TradeJournalPsychologyStore;
  const mhStore = window.TradeJournalMentalHealthStore;
  const collector = window.TradeJournalMentalHealthCollector;
  const tradeStore = window.TradeJournalTradeStore;
  const [open, setOpen] = React.useState(false);
  const [prefs, setPrefs] = React.useState(readCalmPrefs);
  const [music, setMusic] = React.useState({ count: 0, name: '' });
  React.useEffect(() => {
    if (open) return undefined;
    let alive = true;
    const next = readCalmPrefs();
    setPrefs(next);
    listTracks().then((list) => {
      if (!alive) return;
      const pick = list.find((x) => x.id === next.trackId) || list[0];
      setMusic({ count: list.length, name: pick ? pick.name : '' });
    });
    return () => { alive = false; };
  }, [open]);
  const tech = techniqueById(prefs.technique);
  const clock = useBreathClock(tech, 0, !open, null);
  if (!psych || !tradeStore) return null;
  const minutes = Math.max(1, (psych.settings().postTradeReflection.cooldownMinutes || 15));
  const openRoom = () => (onOpen ? onOpen() : setOpen(true));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, height: '100%' }}>
      <CalmStyles />
      {titled && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
          <span style={{ display: 'flex', color: ACCENT }}><Icon name="honour" size={17} /></span>
          <span style={{ font: font(700, 11, '14px'), letterSpacing: '.12em', color: TEXT }}>{i18n.t('psyCalmRoomTitle')}</span>
          <span style={{ font: font(500, 11, '14px'), color: MUTED }}>{i18n.t('calmPanelCooldown', { value: i18n.number(minutes) })}</span>
        </div>
      )}
      <CalmStage key={tech.id} i18n={i18n} size={220} tech={tech} clock={clock} running={!open} bars={60} notch={notch} />
      <Stepper i18n={i18n} tech={tech} clock={clock} running={!open} variant="panel" />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', flexWrap: 'wrap' }}>
        <span style={{ font: font(600, 12, '16px'), color: TEXT }}>{techText(i18n, tech, 'Name')}</span>
        <span style={{ padding: '1px 7px', borderRadius: 999, border: '1px solid rgba(214,175,107,.45)', font: font(500, 10, '14px'), color: 'var(--gold-warm)', whiteSpace: 'nowrap' }}>{techText(i18n, tech, 'Tag')}</span>
      </div>
      <div style={{ display: 'flex', gap: 6, width: '100%' }}>
        <StatusPill icon="wind" on={prefs.breathSound}>{i18n.t(prefs.breathSound ? 'calmPanelBreathOn' : 'calmPanelBreathOff')}</StatusPill>
        <StatusPill icon="music" on={music.count > 0}>{music.count > 0 ? music.name : i18n.t('calmPanelNoMusic')}</StatusPill>
      </div>
      <span style={{ flex: 1 }}></span>
      <Button variant="primary" icon="honour" fullWidth onClick={openRoom}>{i18n.t('calmPanelEnter')}</Button>
      {open && (
        <CalmRoom
          i18n={i18n} psych={psych} trades={tradeStore.listSync()}
          profile={collector ? collector.ensureFresh() : mhStore.load()}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}

// A small live pacer (Psychology's "preview the breath" toggle): the same stage, saved technique.
export function BreathPreview({ size = 110 }) {
  const i18n = window.TradeJournalTradeI18n;
  const tech = techniqueById(readCalmPrefs().technique);
  const clock = useBreathClock(tech, 0, true, null);
  if (!i18n) return null;
  return (
    <React.Fragment>
      <CalmStyles />
      <CalmStage key={tech.id} i18n={i18n} size={size} tech={tech} clock={clock} bars={48} notch="var(--surface-800)" />
    </React.Fragment>
  );
}
