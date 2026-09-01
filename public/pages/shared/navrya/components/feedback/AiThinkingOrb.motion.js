import React from 'react';

/* Adaptive AI Session Analysis loading redesign (2026-09-01): the trader supplied a reference
   Lottie ("Abstract Loading" - five concentric rings of dots, each ring breathing/scaling on a
   staggered delay, forming a wave that pulses outward). This is a from-scratch CSS/SVG-free
   reimplementation of that same MOTION LANGUAGE (concentric rings, staggered per-dot breathing,
   a "wave passing through the ring" chase) - never a literal port, since this app has no Lottie
   runtime (deliberately - see AiMagicFill.motion.js's own "keyframes are the one thing inline
   styles cannot express" convention, the established alternative to pulling in an animation
   library). Recoloured to var(--char-accent) (the one accent this app's AI/loading language
   already uses everywhere else) rather than the reference file's own hardcoded red/purple, which
   exists nowhere else in NAVRYA's real palette.

   Same idempotent "inject once, keyframes only" convention as AiMagicFill.motion.js. */
const AI_THINKING_ORB_CSS = `
@keyframes nv-ai-orb-pulse{
  0%{transform:scale(.5);opacity:.28}
  45%{transform:scale(1);opacity:1;box-shadow:0 0 7px 1px color-mix(in srgb, var(--char-accent) 55%, transparent)}
  100%{transform:scale(.5);opacity:.28}
}
[data-nv-orb-dot]{
  animation-name:nv-ai-orb-pulse;
  animation-timing-function:var(--ease-out,cubic-bezier(.22,.61,.36,1));
  animation-iteration-count:infinite;
  border-radius:50%;background:var(--char-accent);display:block;width:100%;height:100%;
}
@media (prefers-reduced-motion:reduce){
  [data-nv-orb-dot]{animation:none!important;opacity:.85!important}
}
`;

export function useAiThinkingOrbMotion() {
  React.useEffect(() => {
    if (typeof document === 'undefined' || document.getElementById('nv-ai-orb-motion')) return;
    const el = document.createElement('style');
    el.id = 'nv-ai-orb-motion';
    el.textContent = AI_THINKING_ORB_CSS;
    document.head.appendChild(el);
  }, []);
}
