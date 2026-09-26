// The Calm Room's breathing model: the technique catalogue, the clock arithmetic and the saved
// preferences. Pure and DOM-free, so the popup, the board card and the tests share one source.
//
// A technique is a list of phases, each [kind, seconds]:
//   in     - inhale (the circle opens, light drifts in)
//   inpart - the first, fuller half of a double inhale (cyclic sighing)
//   top    - the short second inhale that tops the lungs up
//   full   - hold with full lungs (no light, the circle rests open)
//   out    - exhale (the circle closes, light drifts out)
//   empty  - hold with empty lungs
//
// Where the catalogue comes from: box / tactical 4-4-4-4 is Grossman & Christensen's combat tactical breathing (army, police) and
// the Navy SEAL "box" drill; cyclic sighing is Balban et al., Cell Reports Medicine 2023; 4-7-8 is
// Dr. Andrew Weil's; coherent breathing is ~5.5 breaths a minute (resonance / HRV research).

export const CALM_PREF_KEY = 'calmRoom';

export const TECHNIQUES = [
  { id: 'calm', key: 'Calm', phases: [['in', 4], ['full', 2], ['out', 6]] },
  { id: 'box', key: 'Box', phases: [['in', 4], ['full', 4], ['out', 4], ['empty', 4]] },
  { id: 'sigh', key: 'Sigh', phases: [['inpart', 3], ['top', 1], ['out', 7]] },
  { id: '478', key: '478', phases: [['in', 4], ['full', 7], ['out', 8]], caution: true },
  { id: 'coherent', key: 'Coherent', phases: [['in', 5.5], ['out', 5.5]] }
];

const BY_ID = TECHNIQUES.reduce((acc, tech) => { acc[tech.id] = tech; return acc; }, {});

export function techniqueById(id) {
  return BY_ID[id] || TECHNIQUES[0];
}

// i18n key of each phase's word inside the circle and on the stepper.
export const PHASE_LABEL_KEY = { in: 'calmPhaseIn', inpart: 'calmPhaseIn', top: 'calmPhaseTop', full: 'calmPhaseHold', out: 'calmPhaseOut', empty: 'calmPhaseHold' };

// Kinds during which light drifts toward the circle.
export const INWARD = { in: true, inpart: true, top: true };

// Easing per phase. Inhale is an even sine; the exhale starts quicker and then settles in a long,
// slowing tail; holds do not move.
export const PHASE_EASE = {
  in: 'cubic-bezier(.37,0,.63,1)',
  inpart: 'cubic-bezier(.37,0,.63,1)',
  top: 'cubic-bezier(.3,.5,.4,1)',
  full: 'ease-in-out',
  empty: 'linear',
  out: 'cubic-bezier(.22,.55,.36,1)'
};

export function cycleSeconds(tech) {
  return tech.phases.reduce((sum, phase) => sum + phase[1], 0);
}

// Where `seconds` of breathing falls in the technique: which phase, which cycle, how much of the
// phase remains, and the whole-second countdown shown under the word (a half-second phase such as
// 5.5 counts 5, 4, ... 1 rather than starting at 6).
export function locate(tech, seconds) {
  const length = cycleSeconds(tech);
  const safe = Math.max(0, Number(seconds) || 0);
  const cycle = Math.floor(safe / length);
  const within = safe - cycle * length;
  let acc = 0;
  for (let idx = 0; idx < tech.phases.length; idx += 1) {
    const duration = tech.phases[idx][1];
    if (within < acc + duration || idx === tech.phases.length - 1) {
      const remaining = Math.max(0, acc + duration - within);
      const left = duration % 1 ? Math.ceil(remaining - 0.5) : Math.ceil(remaining - 1e-6);
      return { idx, cycle, remaining, left: Math.max(1, left), progress: duration ? (within - acc) / duration : 0 };
    }
    acc += duration;
  }
  return { idx: 0, cycle, remaining: 0, left: 1, progress: 0 };
}

// Degrees (clockwise from 12 o'clock) where each phase starts on the cycle ring.
export function phaseBoundaries(tech) {
  const length = cycleSeconds(tech);
  let acc = 0;
  return tech.phases.map((phase) => {
    const deg = acc / length * 360;
    acc += phase[1];
    return deg;
  });
}

const DEFAULTS = { technique: 'calm', breathSound: false, breathVolume: 0.6, musicVolume: 0.6, trackId: null };

function unit(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : fallback;
}

export function normalizeCalmPrefs(raw) {
  const value = raw && typeof raw === 'object' ? raw : {};
  return {
    technique: BY_ID[value.technique] ? value.technique : DEFAULTS.technique,
    breathSound: value.breathSound === true,
    breathVolume: unit(value.breathVolume, DEFAULTS.breathVolume),
    musicVolume: unit(value.musicVolume, DEFAULTS.musicVolume),
    trackId: typeof value.trackId === 'string' && value.trackId.length <= 80 ? value.trackId : null
  };
}
