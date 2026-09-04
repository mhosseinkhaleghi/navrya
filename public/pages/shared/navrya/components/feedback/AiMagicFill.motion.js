import React from 'react';

/* Journey H1 (2026-09-05 revision - "type, don't glow"): a plain soft glow reads as "something
   changed here" but never as "an agent is doing this, live" - the user's own explicit ask was to
   replace the two-state fields' glow with a genuine visible reveal, and to make the choice/button
   fields visually read as PRESSED (not just outlined), so a hands-free Voice fill is legible the
   same way a real click/keystroke would be.

   Two independent visual languages now share this one stylesheet:
   - "press" (unchanged selector, [data-nv-magic-fill="active"] > *): every choice/toggle/slider/
     select/tile field (no known text value to reveal - see AiMagicFill.jsx's own value-prop
     branch) gets a real button-press illusion - a brief scale-down-then-settle plus the existing
     accent ring - so a TileGrid tile, a Long/Short pill, a switch, all visibly read as "an agent
     just pressed this," not merely highlighted.
   - "type" (.nv-magic-type-overlay, new): a free-text field (AiMagicFill given a real `value`)
     gets a transient overlay box - sized to the exact footprint of the real field via the
     position:relative wrapper AiMagicFill.jsx renders around it - that reveals the just-applied
     text character-by-character with a blinking caret, then fades to let the real, already-correct
     field show through underneath. The reveal's own per-character timing is plain JS (setTimeout)
     in AiMagicFill.jsx, not CSS - CSS here only styles the box, the fade, and the caret blink.

   Both keep the original rule: respect prefers-reduced-motion by neutralizing the animation/reveal
   itself, never by going silent - a static highlight (press) or the instantly-shown full text
   (type, handled in JS) still communicates "this field was just set" (brief section 17). */
const AI_MAGIC_FILL_CSS = `
@keyframes nv-magic-fill-press{
  0%{transform:scale(1);box-shadow:0 0 0 0 color-mix(in srgb, var(--char-accent) 55%, transparent),0 0 0 1px color-mix(in srgb, var(--char-accent) 75%, transparent) inset}
  28%{transform:scale(.955);box-shadow:0 0 0 3px color-mix(in srgb, var(--char-accent) 45%, transparent),0 0 0 2px var(--char-accent) inset}
  62%{transform:scale(1.018);box-shadow:0 0 16px 2px color-mix(in srgb, var(--char-accent) 40%, transparent),0 0 0 1px var(--char-accent) inset}
  100%{transform:scale(1);box-shadow:0 0 0 0 transparent,0 0 0 0 transparent inset}
}
[data-nv-magic-fill="active"]{position:relative}
[data-nv-magic-fill="active"] > *{animation:nv-magic-fill-press var(--dur-magic-fill,620ms) var(--ease-out,cubic-bezier(.22,.61,.36,1)) 1;border-radius:inherit;transform-origin:center}
@media (prefers-reduced-motion:reduce){
  [data-nv-magic-fill="active"] > *{animation:none!important;box-shadow:0 0 0 1px var(--char-accent) inset!important}
}
@keyframes nv-magic-type-caret{0%,49%{opacity:1}50%,100%{opacity:0}}
.nv-magic-type-overlay{
  position:absolute;inset:0;z-index:2;display:flex;align-items:center;
  border-radius:inherit;box-sizing:border-box;padding:0 12px;overflow:hidden;
  background:color-mix(in srgb, var(--char-accent) 10%, var(--ink-950) 90%);
  border:1px solid var(--char-accent);color:var(--text-primary);font:inherit;
  white-space:pre-wrap;word-break:break-word;
  opacity:1;transition:opacity 160ms var(--ease-out,ease);pointer-events:none
}
.nv-magic-type-overlay[data-nv-magic-fading="true"]{opacity:0}
.nv-magic-type-caret{display:inline-block;margin-inline-start:1px;animation:nv-magic-type-caret 900ms steps(1) infinite}
@media (prefers-reduced-motion:reduce){
  .nv-magic-type-overlay{transition:none}
  .nv-magic-type-caret{animation:none;opacity:1}
}
`;

export function useAiMagicFillMotion() {
  React.useEffect(() => {
    if (typeof document === 'undefined' || document.getElementById('nv-magic-fill-motion')) return;
    const el = document.createElement('style');
    el.id = 'nv-magic-fill-motion';
    el.textContent = AI_MAGIC_FILL_CSS;
    document.head.appendChild(el);
  }, []);
}
