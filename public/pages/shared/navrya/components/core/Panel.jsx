import React from 'react';

// Mixed against --ink-950/--ink-900 (near-hueless black), never --surface-card/--surface-raised
// (colors.css's "shared" tokens both carry a faint cool cyan-green bias - R noticeably lower
// than G/B). Mixing a warm hue like commander's red or sage's purple into that cool base at a
// low percentage muddies toward brown/olive instead of reading as a clean dark character color;
// it only ever looked right for hunter because green and cyan are hue-adjacent. Mixing into
// true black at a stronger ratio reads as "this character's color, just dark" for every hue,
// matching the reference look Sessions' own cards already had for hunter.
const FRAMES = {
  base: { border: '1px solid var(--border-gold)', background: 'color-mix(in srgb, var(--char-atmosphere) 42%, var(--ink-950))' },
  raised: { border: '1px solid var(--border-hairline)', background: 'color-mix(in srgb, var(--char-atmosphere) 30%, var(--ink-900))', boxShadow: 'var(--shadow-raised)' },
  prestige: { border: '1px solid var(--border-gold-strong)', background: 'color-mix(in srgb, var(--char-atmosphere) 42%, var(--ink-950))', boxShadow: 'var(--shadow-panel)' },
  active: { border: '1px solid color-mix(in srgb, var(--char-accent) 90%, transparent)', background: 'var(--char-active-surface)', boxShadow: 'var(--glow-active)' },
  quiet: { border: '1px solid transparent', background: 'transparent' }
};

const CORNERS = [
  ['top', 'left'], ['top', 'right'], ['bottom', 'left'], ['bottom', 'right']
];

// BUG FIX: children render inside Panel's own internal `<div style={{position:'relative'}}>`
// wrapper (below), one level deeper than the outer Tag `style` prop reaches - a caller passing
// display:'flex'/'grid' plus gap/alignItems etc, expecting to lay out ITS children, silently had
// no effect at all (children fell back to plain block stacking with no gap), since flex/grid only
// ever affects DIRECT children. Found via real browser testing on the Accounts screen's totals
// bar (six stat tiles rendered as a tall vertical stack instead of one row) - the exact same
// mistaken pattern (`<Panel style={{display:'flex',...}}>`) turned out to be repeated at over a
// dozen call sites across this codebase, all equally broken. Rather than hunt down and patch each
// one (with the real risk of missing some), these layout-affecting properties are now routed to
// the inner wrapper that actually contains the children, while everything else (border,
// background, boxShadow, color...) stays on the outer Tag exactly as before. This is purely
// additive: nothing could have been correctly relying on a flex/grid declaration silently having
// no effect, so this only ever turns already-broken layouts into working ones.
const CHILD_LAYOUT_KEYS = [
  'display', 'flexDirection', 'flexWrap', 'alignItems', 'justifyContent', 'alignContent',
  'gap', 'rowGap', 'columnGap', 'gridTemplateColumns', 'gridTemplateRows', 'gridAutoFlow',
  'gridAutoColumns', 'gridAutoRows', 'placeItems', 'placeContent'
];
function splitPanelStyle(style) {
  if (!style) return { frameStyle: undefined, layoutStyle: undefined };
  const frameStyle = {}, layoutStyle = {};
  Object.keys(style).forEach((key) => {
    if (CHILD_LAYOUT_KEYS.indexOf(key) > -1) layoutStyle[key] = style[key];
    else frameStyle[key] = style[key];
  });
  return { frameStyle, layoutStyle };
}

function Ornament({ v, h, size, inset, color }) {
  const s = {
    position: 'absolute', width: size, height: size, pointerEvents: 'none',
    [v]: inset, [h]: inset,
    [`border${v === 'top' ? 'Top' : 'Bottom'}`]: '1px solid ' + color,
    [`border${h === 'left' ? 'Left' : 'Right'}`]: '1px solid ' + color
  };
  return <span aria-hidden="true" style={s}></span>;
}

/* Ornamented frame used by every NAVRYA module. Ornament defines hierarchy — never decorative noise. */
export function Panel({
  variant = 'base', radius = 12, ornament = false, ornamentSize = 12, ornamentInset = 4,
  texture = false, textureOpacity = 0.06, glow = false, padding, as: Tag = 'div',
  style, children, ...rest
}) {
  const frame = FRAMES[variant] || FRAMES.base;
  const ornColor = variant === 'active' ? 'var(--char-accent)' : 'var(--border-gold)';
  const { frameStyle, layoutStyle } = splitPanelStyle(style);
  return (
    <Tag
      style={{
        position: 'relative', borderRadius: radius, padding, overflow: 'hidden',
        ...frame,
        boxShadow: glow ? [frame.boxShadow, 'var(--glow-soft)'].filter(Boolean).join(', ') : frame.boxShadow,
        ...frameStyle
      }}
      {...rest}
    >
      {texture && (
        <span aria-hidden="true" style={{
          position: 'absolute', inset: 0, backgroundImage: 'var(--char-texture)', backgroundSize: 'cover',
          backgroundPosition: 'center', opacity: textureOpacity, pointerEvents: 'none'
        }}></span>
      )}
      {ornament && CORNERS.map(([v, h]) => (
        <Ornament key={v + h} v={v} h={h} size={ornamentSize} inset={ornamentInset} color={ornColor} />
      ))}
      <div style={{ position: 'relative', ...layoutStyle }}>{children}</div>
    </Tag>
  );
}
