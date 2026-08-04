import React from 'react';

export const CHARACTER_TITLE = {
  hunter: 'THE HUNTER', commander: 'THE COMMANDER',
  engineer: 'THE MARKET ENGINEER', master: 'THE MARKET MASTER'
};

/* Character title, username line and quote — the identity block of the header. `onClick`
   (optional) makes the name/handle line the entry point into Account Profile - the
   equivalent of the old static #userChip button, which no longer exists once this header
   became a React root; account-profile-ui.js's populateUserChip() still runs as a harmless
   no-op fallback for any page that hasn't mounted this header. */
export function CharacterIdentity({
  character = 'hunter', title, name = 'RAYAN LAND', handle = '@rayanland', quote,
  titleSize = 34, onClick, style, ...rest
}) {
  const nameLine = (
    <div style={{ font: 'var(--type-username)', color: 'var(--text-primary)', letterSpacing: '.04em' }}>
      {name}<span style={{ color: 'var(--text-muted)', padding: '0 6px' }}>·</span>
      <span style={{ color: 'var(--text-muted)' }}>{handle}</span>
    </div>
  );
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, ...style }} {...rest}>
      <h1 style={{
        margin: 0, font: 'var(--type-character-title)', fontSize: titleSize,
        lineHeight: (titleSize * 1.235) + 'px', letterSpacing: '.04em', color: 'var(--char-accent)',
        whiteSpace: 'nowrap'
      }}>{title || CHARACTER_TITLE[character]}</h1>
      {onClick ? (
        <button
          type="button" id="userChip" onClick={onClick}
          style={{ all: 'unset', cursor: 'pointer', display: 'block' }}
        >{nameLine}</button>
      ) : nameLine}
      {quote && (
        <p style={{ margin: 0, font: 'var(--type-quote-sm)', color: 'var(--text-dim)' }}>
          &ldquo;{quote}&rdquo;
        </p>
      )}
    </div>
  );
}
