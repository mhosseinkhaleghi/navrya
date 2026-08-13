import React from 'react';
import { assetUrl } from '../public/pages/shared/navrya/components/core/AssetBase.jsx';
import { currentNavryaCharacter } from './currentCharacter.js';

// Shared by communityView/marketplaceView/messagesView - kept in its own module (rather than
// re-exported from communityView.jsx) so none of the three ever has to import from another and
// risk a circular dependency (communityView already imports both of the others directly).
export function currentUserId() {
  const switcher = window.TradeJournalDevUserSwitcher;
  return switcher ? switcher.currentUserId() : null;
}

// Small round avatar. A real uploaded avatarUrl wins; for the viewer's own posts/messages it
// falls back to their NAVRYA character portrait (the one skin the client can actually know);
// any other user with no avatarUrl falls back to an initial-letter placeholder rather than
// guessing a skin that was never given to the client.
export function Avatar({ user, size = 44 }) {
  const isSelf = !!(user && user.id && currentUserId() === user.id);
  const src = user && user.avatarUrl ? user.avatarUrl : isSelf ? assetUrl('assets/portraits/portrait-' + currentNavryaCharacter() + '.webp') : null;
  const style = {
    width: size, height: size, borderRadius: '50%', flex: 'none', objectFit: 'cover', objectPosition: 'center 30%',
    border: '1px solid var(--border-gold)'
  };
  if (src) return <img src={src} alt="" style={style} />;
  return (
    <div style={{ ...style, display: 'grid', placeItems: 'center', background: 'var(--raised-700)', color: 'var(--text-muted)', font: 'var(--type-username)', fontWeight: 600 }}>
      {(user && user.displayName ? user.displayName[0] : '?').toUpperCase()}
    </div>
  );
}
