import React from 'react';

/* Shared motion sheet for the assistant surfaces (ChatDock, ChatResponsePopover, ModelMascot).
   Keyframes are the one thing inline styles cannot express, so they are injected once under a
   stable id the first time any assistant surface mounts. */
const ASSISTANT_MOTION_CSS = `
@keyframes navrya-pop-in{from{opacity:0;transform:translateY(14px) scale(.965)}to{opacity:1;transform:translateY(0) scale(1)}}
@keyframes navrya-pop-out{from{opacity:1;transform:translateY(0) scale(1)}to{opacity:0;transform:translateY(10px) scale(.98)}}
@keyframes navrya-line-in{from{opacity:0;transform:translateY(10px);filter:blur(3px)}to{opacity:1;transform:translateY(0);filter:blur(0)}}
@keyframes navrya-dot{0%,72%,100%{opacity:.22;transform:translateY(0)}36%{opacity:1;transform:translateY(-4px)}}
@keyframes navrya-bar{0%,100%{transform:scaleY(.28)}50%{transform:scaleY(1)}}
@keyframes navrya-halo{0%,100%{opacity:.30}50%{opacity:.75}}
@keyframes navrya-mascot-in{0%{opacity:0;transform:translateY(14px) scale(.55) rotate(-20deg)}55%{opacity:1;transform:translateY(-5px) scale(1.14) rotate(9deg)}100%{opacity:1;transform:translateY(0) scale(1) rotate(0)}}
@keyframes navrya-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}
@keyframes navrya-spin{to{transform:rotate(360deg)}}
@keyframes navrya-tilt{0%,100%{transform:rotate(-10deg)}50%{transform:rotate(10deg)}}
@keyframes navrya-dive{0%,100%{transform:translateY(-2px)}50%{transform:translateY(5px)}}
@keyframes navrya-wink{0%,84%,100%{transform:scaleY(1)}91%{transform:scaleY(.14)}}
@keyframes navrya-sweep-a{0%{transform:translateX(-110%);opacity:0}18%{opacity:1}100%{transform:translateX(110%);opacity:0}}
@keyframes navrya-sweep-b{0%{transform:translateX(-110%);opacity:0}18%{opacity:1}100%{transform:translateX(110%);opacity:0}}
@keyframes navrya-pulse-a{0%{transform:scale(.6);opacity:.55}100%{transform:scale(2.1);opacity:0}}
@keyframes navrya-pulse-b{0%{transform:scale(.6);opacity:.55}100%{transform:scale(2.1);opacity:0}}
@keyframes navrya-cap-pulse{0%,100%{opacity:.25;transform:scale(1)}50%{opacity:.9;transform:scale(1.06)}}
@keyframes navrya-cap-bar{0%,100%{transform:scaleY(.35)}50%{transform:scaleY(1)}}
@keyframes navrya-cap-caret{0%,49%{opacity:1}50%,100%{opacity:0}}
@keyframes navrya-cap-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
@keyframes navrya-seed-in{from{transform:translateY(14px)}to{transform:translateY(0)}}
/* The dock's own move between shapes (plate III: "220ms - --dur-expand - ease-out; only the height and the position
   move"): a slide, never a fade or a scale. */
@keyframes navrya-dock-rise{from{transform:translateY(14px)}to{transform:translateY(0)}}
@keyframes navrya-dock-sink{from{transform:translateY(0)}to{transform:translateY(14px)}}
[data-navrya-assistant] input::placeholder{color:#9A968A;opacity:1}
[data-navrya-assistant] input:focus{outline:none}
@media (prefers-reduced-motion:reduce){[data-navrya-assistant] *,[data-navrya-assistant]{animation:none!important;transition:none!important}}
`;

export function useAssistantMotion() {
  React.useEffect(() => {
    if (typeof document === 'undefined' || document.getElementById('navrya-assistant-motion')) return;
    const el = document.createElement('style');
    el.id = 'navrya-assistant-motion';
    el.textContent = ASSISTANT_MOTION_CSS;
    document.head.appendChild(el);
  }, []);
}

export const TRAIT_ANIM = {
  spin: 'navrya-spin 6000ms linear infinite',
  tilt: 'navrya-tilt 2600ms var(--ease-standard) infinite',
  dive: 'navrya-dive 2200ms var(--ease-standard) infinite',
  wink: 'navrya-wink 3400ms var(--ease-standard) infinite'
};
