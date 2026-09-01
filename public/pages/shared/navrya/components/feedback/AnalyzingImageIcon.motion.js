import React from 'react';

/* Reimplementation of loading-ui.com's "Analyzing image" component (referenced by the trader) -
   a dim base image glyph, an accent-coloured copy revealed by a left-to-right wipe, and a bright
   beam leading that wipe, all mirroring back and forth. The reference implementation uses
   framer-motion (a runtime this app deliberately has none of - see AiMagicFill.motion.js's own
   "keyframes are the one thing inline styles cannot express" convention); this is the same visual
   language rebuilt in pure CSS keyframes on var(--char-accent), for AnalyzingImageIcon.jsx.
   Same idempotent "inject once" convention as every other *.motion.js file in this folder. */
const ANALYZING_IMAGE_CSS = `
@keyframes nv-analyzing-wipe{
  0%{clip-path:inset(0 100% 0 0)}
  45%{clip-path:inset(0 0% 0 0)}
  55%{clip-path:inset(0 0% 0 0)}
  100%{clip-path:inset(0 100% 0 0)}
}
@keyframes nv-analyzing-beam{
  0%{transform:translateX(-60%);opacity:0}
  8%{opacity:1}
  45%{transform:translateX(340%);opacity:1}
  55%{transform:translateX(340%);opacity:1}
  63%{opacity:0}
  100%{transform:translateX(-60%);opacity:0}
}
[data-nv-analyzing-mask]{animation:nv-analyzing-wipe 2.2s var(--ease-out,cubic-bezier(.22,.61,.36,1)) infinite}
[data-nv-analyzing-beam]{animation:nv-analyzing-beam 2.2s var(--ease-out,cubic-bezier(.22,.61,.36,1)) infinite;box-shadow:0 0 5px 1px color-mix(in srgb, var(--char-accent) 70%, transparent)}
@media (prefers-reduced-motion:reduce){
  [data-nv-analyzing-mask],[data-nv-analyzing-beam]{animation:none!important}
  [data-nv-analyzing-mask]{clip-path:inset(0 0 0 0)!important;opacity:.7}
  [data-nv-analyzing-beam]{display:none!important}
}
`;

export function useAnalyzingImageMotion() {
  React.useEffect(() => {
    if (typeof document === 'undefined' || document.getElementById('nv-analyzing-image-motion')) return;
    const el = document.createElement('style');
    el.id = 'nv-analyzing-image-motion';
    el.textContent = ANALYZING_IMAGE_CSS;
    document.head.appendChild(el);
  }, []);
}
