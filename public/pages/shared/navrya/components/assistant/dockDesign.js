/* The ChatDock design spec as values (artbook plate III "one body, four shapes" and the voice-in-forms
   plates XIV-XVIII). One place for the numbers every dock surface shares - the card recipe (edge,
   gradient, shadow, grabber, corner ticks), the ink colours, the field recipe - so a surface can never
   drift from the design by a hand-typed literal.

   The design draws in the Master's purple; every accent value here is derived from the active
   character's --char-accent (and --char-accent-soft / --char-on-accent, tokens/characters.css), so
   Hunter / Commander / Engineer get the same composition in their own colour. Alpha steps use
   color-mix(... transparent), which is exactly rgba(<accent>, alpha). */

// Surfaces (design hex, character-independent).
export var STAGE = '#07090D';
export var INK = '#0B0E14';
export var INK_DEEP = '#0A0D12';
export var FIELD = '#0A0E13';
export var DIALOG = '#0B1016';

// Text.
export var TEXT = '#F4EAD7';
export var TEXT_SOFT = '#EDE4D3';
export var TEXT_RECEIPT = '#E9DFC9';
export var MUTED = '#ACA994';
export var DIM = '#9A968A';
export var TIME = '#8F8B80';

// Metal and edges.
export var GOLD = '#D6AF6B';
export var EDGE = 'rgba(183,138,74,.45)';
export var EDGE_WELD = 'rgba(183,138,74,.55)';
export var EDGE_JOINT = 'rgba(214,175,107,.35)';
export var TICK = 'rgba(214,175,107,.55)';
export var DIVIDER = 'rgba(244,234,215,.07)';
export var HAIRLINE = 'rgba(244,234,215,.10)';
export var HAIRLINE_STRONG = 'rgba(244,234,215,.14)';
export var GRABBER = 'rgba(244,234,215,.16)';

export var GREEN = '#2ECC71';
export var DANGER = '#FF6B63';
export var DANGER_EDGE = 'rgba(255,56,48,.5)';

export var RADIUS_CARD = 20;
export var RADIUS_WELD = 18;

export function accent(pct) { return 'color-mix(in srgb,var(--char-accent) ' + pct + '%,transparent)'; }
export function gold(pct) { return 'color-mix(in srgb,' + GOLD + ' ' + pct + '%,transparent)'; }

/* The card body: the character's tint fades in from the top, over the design's own dark stage colour
   so the card stays opaque (page content never shows through a reply). 38% for the capsule / peek /
   scroll, 60% (and a touch more tint) for the voice bar that welds to a dialog. */
export function cardBackground(kind) {
  return kind === 'weld'
    ? 'linear-gradient(180deg,' + accent(13) + ' 0%,' + INK + ' 60%,' + INK_DEEP + ' 100%),' + STAGE
    : 'linear-gradient(180deg,' + accent(11) + ' 0%,' + INK + ' 38%,' + INK_DEEP + ' 100%),' + STAGE;
}

export function cardShadow(kind) {
  return kind === 'weld'
    ? '0 26px 60px rgba(0,0,0,.6),0 0 40px ' + accent(12)
    : '0 26px 64px rgba(0,0,0,.6),0 0 40px ' + accent(10) + ',inset 0 1px 0 rgba(244,234,215,.06)';
}

// A card that another card sits flush on (the reply above the composer): squared where they meet.
export function cardRadius(joinedTop, joinedBottom) {
  var top = joinedTop ? 0 : RADIUS_CARD;
  var bottom = joinedBottom ? 0 : RADIUS_CARD;
  return top + 'px ' + top + 'px ' + bottom + 'px ' + bottom + 'px';
}

/* The field recipe of plates XIV-XVIII: a 40px (46px in the rules plate) control with a 1px edge, and
   the four voice states drawn on it. The states are drawn by AiMagicFill's overlay on the REAL field
   (components/feedback/AiMagicFill.jsx) - these are the shared numbers. */
export var FIELD_STATE = {
  idle: { border: '1px solid rgba(183,138,74,.4)', background: FIELD },
  asking: { border: '1.5px solid var(--char-accent)', background: FIELD, boxShadow: '0 0 0 4px ' + accent(16) },
  hearing: { border: '1.5px solid var(--char-accent)', background: FIELD, boxShadow: '0 0 0 4px ' + accent(16) },
  filled: { border: '1px solid ' + accent(45), background: accent(6) },
  pending: { border: '1.5px dashed ' + GOLD, background: 'rgba(214,175,107,.05)' }
};

// The little pill on a field / in a header: 22px, accent tint, accent-soft text.
export function pillStyle(tone) {
  var base = {
    display: 'inline-flex', alignItems: 'center', gap: 4, height: 22, padding: '0 8px', borderRadius: 999,
    fontSize: 11, flex: 'none', whiteSpace: 'nowrap'
  };
  if (tone === 'neutral') return Object.assign(base, { background: 'rgba(244,234,215,.07)', color: MUTED });
  if (tone === 'gold') return Object.assign(base, { background: 'rgba(214,175,107,.14)', color: GOLD });
  if (tone === 'success') return Object.assign(base, { background: 'rgba(46,204,113,.10)', color: GREEN });
  return Object.assign(base, { background: accent(16), color: 'var(--char-accent-soft)' });
}

// A quick-choice pill (the assistant's options): 32px in the peek, 34px in the voice bar.
export function choiceStyle(height) {
  return {
    height: height || 32, padding: '0 14px', borderRadius: 999, border: '1px solid ' + accent(45), background: accent(10),
    color: 'var(--char-accent-soft)', fontSize: 12.5, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap'
  };
}
