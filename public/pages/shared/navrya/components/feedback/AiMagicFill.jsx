import React from 'react';
import { useAiMagicFillMotion } from './AiMagicFill.motion.js';

const TYPE_CHAR_MS = 22;
const TYPE_MAX_TOTAL_MS = 700;
const TYPE_MIN_CHAR_MS = 10;
const TYPE_HOLD_MS = 140;
const TYPE_FADE_MS = 160;

function prefersReducedMotion() {
  try { return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  catch (_) { return false; }
}

// Journey H1 (2026-09-05, "type, don't glow"): drives the character-by-character reveal for a
// free-text field's just-applied value. Fires only on a genuine false->true transition of `active`
// (the existing useAiFieldFill() pulse) - `active` re-affirming itself mid-pulse (the hook's own
// re-arm-the-window behavior) never restarts an already-running reveal, and a live `value` prop
// change mid-reveal is never read again until the next fresh activation. Per-character timing
// scales down for long text (capped at TYPE_MAX_TOTAL_MS total, floored at TYPE_MIN_CHAR_MS per
// character) so a whole paragraph field never drags the "fast but visible" reveal out past a
// fraction of a second. Presentation-only, same rule as the "press" path below - the real field
// this wraps already holds the correct, final value the entire time; a bug here can only ever look
// wrong, never apply a wrong value.
function useTypewriterReveal(active, value) {
  const [revealed, setRevealed] = React.useState(null); // null = overlay not shown
  const [fading, setFading] = React.useState(false);
  const timerRef = React.useRef(null);
  const wasActiveRef = React.useRef(false);

  React.useEffect(() => {
    const justTurnedActive = active && !wasActiveRef.current;
    wasActiveRef.current = active;
    if (!justTurnedActive) return undefined;
    if (timerRef.current) clearTimeout(timerRef.current);
    const text = value === undefined || value === null ? '' : String(value);
    if (!text) { setRevealed(null); return undefined; }
    setFading(false);

    if (prefersReducedMotion()) {
      // Never signal success by motion alone (brief section 17), but never force a stepped
      // reveal on a user who has asked the OS to reduce motion either - show the real, complete
      // text once, briefly, then fade to the real field underneath.
      setRevealed(text);
      timerRef.current = setTimeout(() => {
        setFading(true);
        timerRef.current = setTimeout(() => setRevealed(null), TYPE_FADE_MS);
      }, TYPE_HOLD_MS);
      return undefined;
    }

    setRevealed('');
    const perCharMs = Math.max(TYPE_MIN_CHAR_MS, Math.min(TYPE_CHAR_MS, TYPE_MAX_TOTAL_MS / text.length));
    let shown = 0;
    const tick = () => {
      shown += 1;
      setRevealed(text.slice(0, shown));
      if (shown < text.length) {
        timerRef.current = setTimeout(tick, perCharMs);
      } else {
        timerRef.current = setTimeout(() => {
          setFading(true);
          timerRef.current = setTimeout(() => setRevealed(null), TYPE_FADE_MS);
        }, TYPE_HOLD_MS);
      }
    };
    timerRef.current = setTimeout(tick, perCharMs);
    return undefined;
  }, [active, value]);

  React.useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return { revealed, fading };
}

// Journey H1: wraps ONE real field's existing markup with the shared "AI just filled this" visual
// treatment - two different treatments depending on what kind of field this is, chosen purely by
// whether a real `value` was given (never a caller-declared "kind" flag, so an existing call site
// that never passes `value` is completely unaffected):
//
// - No `value` (a choice/toggle/slider/select/tile - nothing sensible to "type out"): the original
//   `display:contents` wrapper - never affects a parent flex/grid layout - so the shared motion
//   sheet's "press" keyframe (AiMagicFill.motion.js) plays on the child directly, reading as a real
//   button press for a Voice-driven selection.
// - A real, non-empty `value` (a free-text/number field the user would otherwise have typed): a
//   position:relative box sized to `children`'s own rendered footprint, carrying a transient
//   overlay that reveals `value` character-by-character with a blinking caret, then fades to let
//   the real, already-correct field show through underneath. `value` is captured once, the instant
//   `active` turns true (see useTypewriterReveal above); the caller passes whatever value it
//   already holds in scope for that same field (e.g. `value={scenario.title}`) - this component
//   never reads process/path state of its own.
export function AiMagicFill({ active, value, children }) {
  useAiMagicFillMotion();
  const hasTextTarget = value !== undefined && value !== null && value !== '';
  const { revealed, fading } = useTypewriterReveal(!!active && hasTextTarget, value);

  if (hasTextTarget) {
    return (
      <span style={{ position: 'relative', display: 'block', width: '100%' }}>
        {children}
        {revealed !== null && (
          <span className="nv-magic-type-overlay" data-nv-magic-fading={fading ? 'true' : undefined} dir="auto">
            <span>{revealed}</span>
            <span className="nv-magic-type-caret">▌</span>
          </span>
        )}
      </span>
    );
  }

  return (
    <span data-nv-magic-fill={active ? 'active' : undefined} style={{ display: 'contents' }}>
      {children}
    </span>
  );
}
