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
  React.useEffect(() => {
    const bus = typeof window !== 'undefined' ? window.TradeJournalAIFieldFillBus : null;
    if (!bus || !processId || !path) return undefined;
    let timer = null;
    const off = bus.on(processId, path, () => {
      setJustFilled(true);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setJustFilled(false), FILL_WINDOW_MS);
    });
    return () => { off(); if (timer) clearTimeout(timer); };
  }, [processId, path]);
  return justFilled;
}
