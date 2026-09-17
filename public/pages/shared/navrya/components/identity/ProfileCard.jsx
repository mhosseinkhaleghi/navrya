import React from 'react';
import { Icon } from '../core/Icon.jsx';
import { assetUrl } from '../core/AssetBase.jsx';

/* Sidebar profile block. Styles live in navrya/profile-card.css (imported by styles.css).
   `profile` is assembled from real account data by navrya-src/sidebarProfile.js - see that file
   for where every field comes from. */

const CORNERS = ['tl', 'tr', 'bl', 'br'];
export function Ornaments() {
  return CORNERS.map((corner) => <span key={corner} className={'nv-orn nv-orn--' + corner} aria-hidden="true"></span>);
}

function fill(template, values) {
  return String(template || '').replace(/\{(\w+)\}/g, (match, key) => (values[key] !== undefined ? String(values[key]) : match));
}

/* Character portrait when the user has no uploaded photo. The portrait art is a circle with
   transparent corners, so it is scaled up slightly to fill the octagon. */
export function OctAvatar({ character, avatarUrl, level, alt, levelLabel, small = false }) {
  const portrait = !avatarUrl;
  const src = avatarUrl || assetUrl('assets/portraits/portrait-' + character + '.webp');
  return (
    <span className={'nv-oct' + (small ? ' nv-oct--sm' : '')}>
      <span className="nv-oct__frame">
        <span className="nv-oct__clip">
          <img className={'nv-oct__face' + (portrait ? ' nv-oct__face--portrait' : '')} src={src} alt={alt || ''} draggable="false" />
        </span>
      </span>
      {level ? <span className="nv-medal" aria-label={levelLabel}><span>{level}</span></span> : null}
    </span>
  );
}

export function LevelSegments({ level = 1, count = 7, progress = 0, mini = false }) {
  const cells = [];
  for (let i = 1; i <= count; i += 1) {
    let cls = 'nv-seg';
    if (i < level) cls += ' nv-seg--done';
    else if (i === level) cls += level >= count && progress >= 100 ? ' nv-seg--done' : ' nv-seg--cur';
    cells.push(<span key={i} className={cls} style={i === level ? { '--nv-seg-p': Math.max(0, Math.min(100, progress)) + '%' } : undefined}></span>);
  }
  return <span className={'nv-segs' + (mini ? ' nv-segs--mini' : '')} aria-hidden="true">{cells}</span>;
}

function XpLine({ xp, next }) {
  return <span className="nv-num nv-muted" dir="ltr">{next === null || next === undefined ? xp + ' XP' : xp + ' / ' + next + ' XP'}</span>;
}

export function ProfileCard({ character = 'hunter', profile, menu = null, onOpenMenu, identityRef, bellRef }) {
  const labels = profile.labels;
  const [logoutState, setLogoutState] = React.useState(null); // null | 'ask' | 'busy' | 'error'
  const cancelRef = React.useRef(null);
  const logoutRef = React.useRef(null);
  const wasAsking = React.useRef(false);

  React.useEffect(() => {
    if (logoutState === 'ask' || logoutState === 'error') {
      wasAsking.current = true;
      if (cancelRef.current) cancelRef.current.focus();
    } else if (logoutState === null && wasAsking.current) {
      wasAsking.current = false;
      if (logoutRef.current) logoutRef.current.focus();
    }
  }, [logoutState]);

  function confirmLogout() {
    setLogoutState('busy');
    Promise.resolve().then(() => profile.logout()).catch(() => setLogoutState('error'));
  }

  const levelLabel = fill(labels.levelN, { level: profile.level });
  const celebrate = profile.celebrate;
  const goal = profile.goal;

  return (
    <div className={'nv-pc' + (celebrate ? ' nv-pc--celebrate' : '') + (menu === 'profile' ? ' nv-pc--open' : '')}>
      <img className="nv-pc__atmo" src={assetUrl('assets/textures/atmosphere-' + character + '.webp')} alt="" aria-hidden="true" />
      <img className="nv-pc__crest" src={assetUrl('assets/crests/crest-' + character + '.webp')} alt="" aria-hidden="true" />
      <Ornaments />
      <button
        ref={identityRef} type="button" className="nv-pc__identity" onClick={() => onOpenMenu && onOpenMenu('profile')}
        aria-haspopup="dialog" aria-expanded={menu !== null} aria-label={labels.openMenu + (profile.name ? ' - ' + profile.name : '')}
      >
        <span className="nv-pc__top">
          <OctAvatar character={character} avatarUrl={profile.avatarUrl} level={profile.level} alt={labels.avatarAlt} levelLabel={levelLabel} />
          <span className="nv-pc__id">
            <span className="nv-pc__name">{profile.name || '—'}</span>
            <span className="nv-pc__title">{profile.title}</span>
            <span className="nv-pc__chips">
              {profile.planChip ? <span className="nv-plan">{profile.planChip}</span> : null}
              {profile.streak !== null && profile.streak !== undefined ? (
                <span className="nv-chip-s" aria-label={fill(labels.streakAria, { count: profile.streak })}><Icon name="zap" size={11} /><span>{profile.streak}</span></span>
              ) : null}
              {profile.achievementsTotal ? (
                <span className="nv-chip-s" aria-label={fill(labels.achievementsAria, { done: profile.achievementsDone, total: profile.achievementsTotal })}>
                  <Icon name="trophy" size={11} /><span dir="ltr">{profile.achievementsDone + '/' + profile.achievementsTotal}</span>
                </span>
              ) : null}
            </span>
          </span>
        </span>
        <span className="nv-pc__ladder">
          <span className="nv-pc__lrow">
            <span>{levelLabel} <span className="nv-muted">{fill(labels.ofN, { count: profile.levelCount })}</span></span>
            <XpLine xp={profile.xp} next={profile.xpNext} />
          </span>
          <LevelSegments level={profile.level} count={profile.levelCount} progress={profile.progress} />
        </span>
      </button>

      {celebrate ? (
        <button type="button" className="nv-pc__goal nv-pc__goal--won" onClick={profile.onGoal}>
          <span className="nv-pc__spark"><Icon name="sparkles" size={22} /></span>
          <span className="nv-pc__gtext"><span className="nv-pc__gcap">{labels.achievementUnlocked}</span><span className="nv-pc__gname">{celebrate.name}</span></span>
          {celebrate.chip ? <span className="nv-xp-chip nv-xp-chip--solid">{celebrate.chip}</span> : null}
        </button>
      ) : (
        <button type="button" className="nv-pc__goal" onClick={profile.onGoal}>
          <img className="nv-pc__chest" src={assetUrl('assets/icons/reward-chest-' + character + '.webp')} alt="" aria-hidden="true" />
          <span className="nv-pc__gtext"><span className="nv-pc__gcap">{labels.nextGoal}</span><span className="nv-pc__gname">{goal ? goal.name : '—'}</span></span>
          {goal && goal.chip ? <span className="nv-xp-chip">{goal.chip}</span> : null}
        </button>
      )}

      {logoutState ? (
        <div className="nv-pc__confirm" role="alertdialog" aria-live="polite" aria-label={labels.logoutAsk}
          onKeyDown={(event) => { if (event.key === 'Escape' && logoutState !== 'busy') { event.stopPropagation(); setLogoutState(null); } }}>
          <span className={'nv-pc__confirm-text' + (logoutState === 'error' ? ' nv-pc__confirm-text--error' : '')}>
            {logoutState === 'error' ? labels.logoutFailedShort : logoutState === 'busy' ? labels.loggingOut : labels.logoutAsk}
          </span>
          <button type="button" className="nv-btn-danger" onClick={confirmLogout} disabled={logoutState === 'busy'}>
            {logoutState === 'error' ? labels.retry : labels.logoutConfirm}
          </button>
          <button ref={cancelRef} type="button" className="nv-btn-ghost" onClick={() => setLogoutState(null)} disabled={logoutState === 'busy'}>{labels.cancel}</button>
        </div>
      ) : (
        <div className="nv-pc__actions">
          <button
            ref={bellRef} type="button" className={'nv-pc__act' + (menu === 'notifications' ? ' nv-pc__act--on' : '')}
            onClick={() => onOpenMenu && onOpenMenu('notifications')} aria-haspopup="dialog" aria-expanded={menu === 'notifications'}
            aria-label={fill(labels.notificationsAria, { count: profile.unreadTotal || 0 })}
          >
            <span className="nv-pc__icw"><Icon name="bell" size={18} />{profile.unreadTotal > 0 ? <span className="nv-badge">{profile.unreadTotal > 99 ? '99+' : profile.unreadTotal}</span> : null}</span>
            <span className="nv-pc__al">{labels.alerts || labels.notifications}</span>
          </button>
          <button type="button" className="nv-pc__act" onClick={profile.onProfile}>
            <Icon name="user-round" size={18} /><span className="nv-pc__al">{labels.profile}</span>
          </button>
          <button type="button" className="nv-pc__act" onClick={profile.onWallet} aria-label={profile.walletLabel ? fill(labels.walletAria, { amount: profile.walletLabel }) : labels.credit}>
            <Icon name="wallet" size={18} /><span className="nv-pc__al nv-pc__al--num">{profile.walletLabel || '—'}</span>
          </button>
          <button ref={logoutRef} type="button" className="nv-pc__act nv-pc__act--out" onClick={() => setLogoutState('ask')}>
            <Icon name="logout" size={18} /><span className="nv-pc__al">{labels.logout}</span>
          </button>
        </div>
      )}
    </div>
  );
}

/* 72px collapsed-rail version: octagon avatar, mini level ladder and the bell. */
export function ProfileRail({ character = 'hunter', profile, menu = null, onOpenMenu, identityRef, bellRef }) {
  const labels = profile.labels;
  return (
    <React.Fragment>
      <button
        ref={identityRef} type="button" className="nv-oct-btn" onClick={() => onOpenMenu && onOpenMenu('profile')}
        aria-haspopup="dialog" aria-expanded={menu !== null} aria-label={labels.openMenu + (profile.name ? ' - ' + profile.name : '')}
        title={profile.name || undefined}
      >
        <OctAvatar character={character} avatarUrl={profile.avatarUrl} level={profile.level} small alt={labels.avatarAlt} levelLabel={fill(labels.levelN, { level: profile.level })} />
      </button>
      <LevelSegments level={profile.level} count={profile.levelCount} progress={profile.progress} mini />
      <button
        ref={bellRef} type="button" className={'nv-rail-bell' + (menu === 'notifications' ? ' nv-rail-bell--on' : '')}
        onClick={() => onOpenMenu && onOpenMenu('notifications')} aria-haspopup="dialog" aria-expanded={menu === 'notifications'}
        aria-label={fill(labels.notificationsAria, { count: profile.unreadTotal || 0 })} title={labels.notifications}
      >
        <Icon name="bell" size={19} />
        {profile.unreadTotal > 0 ? <span className="nv-badge">{profile.unreadTotal > 99 ? '99+' : profile.unreadTotal}</span> : null}
      </button>
    </React.Fragment>
  );
}
