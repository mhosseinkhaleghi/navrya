import React from 'react';

// Journey H1: the integration seam every AI-fillable field wraps with. Subscribes to
// TradeJournalAIFieldFillBus (public/pages/shared/ai-field-fill-bus.js - a plain-script module,
// loaded before React) for exactly the (processId, path) pair this one field owns, and returns a
// boolean that flips true for one short animation window each time Voice actually applies a value
// here, then auto-clears. Purely a presentation signal - this hook never reads or writes the field
// value itself, so it can never fork from React's own controlled state (the value keeps coming
// from whatever real useState/prop the caller already has).
//
// FILL_WINDOW_MS matches AiMagicFill.motion.js's own --dur-magic-fill animation duration (620ms) -
// kept in sync deliberately rather than reading the CSS custom property back, since this hook has
// no DOM node of its own to read it from before the field it targets has even rendered.
const FILL_WINDOW_MS = 650;

export function useAiFieldFill(processId, path) {
  const [justFilled, setJustFilled] = React.useState(false);
  // Slice V1 (visual step/AiMagicFill), audit item 5: the bus subscription closure below only
  // ever closes over `justFilled` as it was when the effect FIRST ran ([processId, path] deps,
  // never re-created on every render) - this ref is the only way it can read the truly-current
  // value at the moment a new bus event actually arrives.
  const justFilledRef = React.useRef(false);
  React.useEffect(() => { justFilledRef.current = justFilled; }, [justFilled]);
  React.useEffect(() => {
    const bus = typeof window !== 'undefined' ? window.TradeJournalAIFieldFillBus : null;
    if (!bus || !processId || !path) return undefined;
    let timer = null;
    let retrigger = null;
    const off = bus.on(processId, path, () => {
      if (timer) clearTimeout(timer);
      if (retrigger) clearTimeout(retrigger);
      if (justFilledRef.current) {
        // A genuinely NEW fill (the bus's own per-emit eventId, unused here directly, is what
        // guarantees this callback fires per-event rather than being deduped) arrived while a
        // previous pulse's animation window was still active. A plain setJustFilled(true) here
        // would be a no-op re-render (React bails on an unchanged boolean) - a consumer keying
        // off a real false->true transition (AiMagicFill's own typewriter reveal) would never see
        // this second, corrected fill at all. Force one real transition instead: drop to false
        // for a single tick, then true again - the boolean contract itself never changes, only
        // this internal retrigger path, added specifically for the already-active case.
        setJustFilled(false);
        retrigger = setTimeout(() => setJustFilled(true), 0);
      } else {
        setJustFilled(true);
      }
      timer = setTimeout(() => setJustFilled(false), FILL_WINDOW_MS);
    });
    return () => { off(); if (timer) clearTimeout(timer); if (retrigger) clearTimeout(retrigger); };
  }, [processId, path]);
  return justFilled;
}
