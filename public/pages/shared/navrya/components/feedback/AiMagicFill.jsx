import React from 'react';
import { useAiMagicFillMotion } from './AiMagicFill.motion.js';

// Journey H1: wraps ONE real field's existing markup with the shared "AI just filled this"
// visual treatment. `display:contents` means this wrapper renders no box of its own - it never
// affects a parent flex/grid layout (this codebase's fields sit inside flex/grid parents
// everywhere) - the glow/pulse styling (AiMagicFill.motion.js) targets the wrapper's own direct
// child instead, via `[data-nv-magic-fill="active"] > *`. Expects exactly one child element.
//
// `active` is normally the boolean useAiFieldFill(processId, path) already returns - passed in
// rather than computed here so a caller with an unusual field shape (e.g. a value spread across
// two DOM nodes) can still drive the same shared animation from its own logic.
export function AiMagicFill({ active, children }) {
  useAiMagicFillMotion();
  return (
    <span data-nv-magic-fill={active ? 'active' : undefined} style={{ display: 'contents' }}>
      {children}
    </span>
  );
}
