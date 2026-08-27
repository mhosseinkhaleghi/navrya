import React from 'react';

/* Journey H1: the one shared "AI just filled this" visual language - a soft luminous glow/pulse
   using each character's own --char-accent token (the same accent already used throughout
   strategiesHubView.jsx/tradeLogModal.jsx/mentalHealthIntakeModal.jsx for selection/active state),
   so a Voice-filled field reads as "this app, doing something premium," never a generic browser
   highlight. Injected once under a stable id, same convention as components/assistant/motion.js's
   own useAssistantMotion() (keyframes are the one thing inline styles cannot express).

   Respects prefers-reduced-motion by neutralizing the animation itself in CSS (not a JS
   matchMedia check) - the instant, static outline that remains still communicates "this field was
   just set," per the rule that success must never be signaled by motion alone (brief section 17). */
const AI_MAGIC_FILL_CSS = `
@keyframes nv-magic-fill-pulse{
  0%{box-shadow:0 0 0 0 color-mix(in srgb, var(--char-accent) 55%, transparent),0 0 0 1px color-mix(in srgb, var(--char-accent) 75%, transparent) inset}
  35%{box-shadow:0 0 18px 3px color-mix(in srgb, var(--char-accent) 45%, transparent),0 0 0 1px var(--char-accent) inset}
  100%{box-shadow:0 0 0 0 transparent,0 0 0 1px transparent inset}
}
[data-nv-magic-fill="active"]{position:relative}
[data-nv-magic-fill="active"] > *{animation:nv-magic-fill-pulse var(--dur-magic-fill,620ms) var(--ease-out,cubic-bezier(.22,.61,.36,1)) 1;border-radius:inherit}
@media (prefers-reduced-motion:reduce){
  [data-nv-magic-fill="active"] > *{animation:none!important;box-shadow:0 0 0 1px var(--char-accent) inset!important}
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
