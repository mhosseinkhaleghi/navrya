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
  return (
    <Tag
      style={{
        position: 'relative', borderRadius: radius, padding, overflow: 'hidden',
        ...frame,
        boxShadow: glow ? [frame.boxShadow, 'var(--glow-soft)'].filter(Boolean).join(', ') : frame.boxShadow,
        ...style
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
      <div style={{ position: 'relative' }}>{children}</div>
    </Tag>
  );
}
