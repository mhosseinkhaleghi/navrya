import React from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../core/Icon.jsx';
import { assetUrl } from '../core/AssetBase.jsx';

/* Account menu that opens beside the sidebar, bottom-aligned to it, with a notch pointing at
   the profile card. Rendered into document.body (the sidebar clips its own overflow), so it
   re-applies data-character/dir itself. On phones (<=720px) CSS turns it into a bottom sheet. */

const GAP = 12;
const EDGE = 12;
const WIDTH = 326;
const MOBILE_QUERY = '(max-width: 720px)';

function fill(template, values) {
  return String(template || '').replace(/\{(\w+)\}/g, (match, key) => (values[key] !== undefined ? String(values[key]) : match));
}

function isMobile() {
  return typeof window !== 'undefined' && window.matchMedia && window.matchMedia(MOBILE_QUERY).matches;
}

function NotificationBody({ body }) {
  if (!body) return null;
  if (!body.ltr) return body.text;
  const parts = String(body.text).split('{xp}');
  return <React.Fragment>{parts[0]}<bdi dir="ltr">{body.ltr}</bdi>{parts.slice(1).join('{xp}')}</React.Fragment>;
}

const FILTERS = ['all', 'support', 'community', 'account'];

export function AccountMenu({ open, focus = 'profile', character = 'hunter', rtl = false, profile, containerRef, anchorRef, ignoreRef, onClose }) {
  const wrapRef = React.useRef(null);
  const dialogRef = React.useRef(null);
  const headingRef = React.useRef(null);
  const [placement, setPlacement] = React.useState(null);
  const [filter, setFilter] = React.useState('all');
  const [logoutState, setLogoutState] = React.useState('idle'); // idle | busy | error
  const [maxHeight, setMaxHeight] = React.useState(() => (typeof window === 'undefined' ? 800 : Math.max(260, Math.min(800, window.innerHeight - EDGE * 2))));

  React.useEffect(() => { if (open) { setFilter('all'); setLogoutState('idle'); } else { setPlacement(null); } }, [open]);

  const place = React.useCallback(() => {
    const wrap = wrapRef.current;
    const container = containerRef && containerRef.current;
    if (!wrap || !container) return;
    const viewportHeight = window.innerHeight;
    const nextMax = Math.max(260, Math.min(800, viewportHeight - EDGE * 2));
    if (nextMax !== maxHeight) setMaxHeight(nextMax);
    if (isMobile()) {
      setPlacement((prev) => (prev && prev.mobile ? prev : { mobile: true }));
      return;
    }
    const box = container.getBoundingClientRect();
    const height = Math.min(wrap.offsetHeight, nextMax);
    let top = box.bottom - 10 - height;
    top = Math.max(EDGE, Math.min(top, viewportHeight - EDGE - height));
    const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
    let side;
    if (rtl) {
      const right = Math.min(viewportWidth - box.left + GAP, viewportWidth - WIDTH - 8);
      side = { right: Math.max(8, right) };
    } else {
      side = { left: Math.max(8, Math.min(box.right + GAP, viewportWidth - WIDTH - 8)) };
    }
    const anchor = (anchorRef && anchorRef.current) || container;
    const anchorBox = anchor.getBoundingClientRect();
    const notchTop = Math.round(anchorBox.top + anchorBox.height / 2 - top - 7);
    const showNotch = notchTop > 14 && notchTop < height - 28;
    const next = { top: Math.round(top), ...side, notchTop, showNotch };
    setPlacement((prev) => {
      if (prev && !prev.mobile && prev.top === next.top && prev.left === next.left && prev.right === next.right && prev.notchTop === next.notchTop && prev.showNotch === next.showNotch) return prev;
      return next;
    });
  }, [containerRef, anchorRef, rtl, maxHeight]);

  React.useLayoutEffect(() => { if (open) place(); });

  React.useEffect(() => {
    if (!open) return undefined;
    const onScroll = () => place();
    window.addEventListener('resize', onScroll);
    window.addEventListener('scroll', onScroll, true);
    let observer = null;
    if (typeof ResizeObserver !== 'undefined' && wrapRef.current) {
      observer = new ResizeObserver(() => place());
      observer.observe(wrapRef.current);
    }
    return () => {
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('scroll', onScroll, true);
      if (observer) observer.disconnect();
    };
  }, [open, place]);

  React.useEffect(() => {
    if (!open) return undefined;
    function onKeyDown(event) {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      onClose('escape');
    }
    function onPointerDown(event) {
      const target = event.target;
      if (wrapRef.current && wrapRef.current.contains(target)) return;
      if (ignoreRef && ignoreRef.current && ignoreRef.current.contains(target)) return;
      onClose('outside');
    }
    function onHashChange() { onClose('navigate'); }
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('mousedown', onPointerDown, true);
    document.addEventListener('touchstart', onPointerDown, true);
    window.addEventListener('hashchange', onHashChange);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('mousedown', onPointerDown, true);
      document.removeEventListener('touchstart', onPointerDown, true);
      window.removeEventListener('hashchange', onHashChange);
    };
  }, [open, onClose, ignoreRef]);

  // Move focus into the menu once it is placed; the notifications entry point lands on that section.
  const placed = Boolean(placement);
  React.useEffect(() => {
    if (!open || !placed) return;
    const target = focus === 'notifications' ? headingRef.current : dialogRef.current;
    if (target) target.focus({ preventScroll: true });
    if (focus === 'notifications' && headingRef.current && headingRef.current.scrollIntoView) headingRef.current.scrollIntoView({ block: 'nearest' });
  }, [open, placed, focus]);

  if (!open || typeof document === 'undefined') return null;

  const labels = profile.labels;
  const notifications = profile.notifications || { items: [], counts: {}, unreadTotal: 0 };
  const items = filter === 'all' ? notifications.items : notifications.items.filter((item) => item.group === filter);
  const chevron = rtl ? 'chevron-left' : 'chevron-right';
  const filterLabel = { all: labels.filterAll, support: labels.filterSupport, community: labels.filterCommunity, account: labels.filterAccount };

  function act(handler) {
    return () => {
      onClose('action');
      if (handler) handler();
    };
  }

  function logout() {
    setLogoutState('busy');
    Promise.resolve().then(() => profile.logout()).catch(() => setLogoutState('error'));
  }

  const wrapStyle = placement && !placement.mobile
    ? { top: placement.top, left: placement.left, right: placement.right }
    : undefined;

  return createPortal(
    <div data-character={character} dir={rtl ? 'rtl' : 'ltr'} style={{ direction: rtl ? 'rtl' : 'ltr' }}>
      {placement && placement.mobile ? <button type="button" className="nv-am-scrim" aria-label={labels.close} onClick={() => onClose('outside')}></button> : null}
      <div ref={wrapRef} className={'nv-am-wrap' + (placement ? ' nv-am-wrap--placed' : '')} style={wrapStyle}>
        <div
          ref={dialogRef} className="nv-am" role="dialog" aria-modal="false" aria-label={labels.accountMenu} tabIndex={-1}
          style={{ '--nv-am-max-h': maxHeight + 'px' }}
        >
          <div className="nv-am__head">
            <img className="nv-am__atmo" src={assetUrl('assets/textures/atmosphere-' + character + '.webp')} alt="" aria-hidden="true" />
            <img className="nv-am__crest" src={assetUrl('assets/crests/crest-' + character + '.webp')} alt="" aria-hidden="true" />
            <span className="nv-ring" style={{ '--nv-ring-p': profile.progress + '%' }}>
              <img className="nv-ring__face" src={profile.avatarUrl || assetUrl('assets/portraits/portrait-' + character + '.webp')} alt={labels.avatarAlt} draggable="false" />
              <span className="nv-ring__lv" aria-label={fill(labels.levelN, { level: profile.level })}>{profile.level}</span>
            </span>
            <span className="nv-am__htext">
              <span className="nv-am__name">{profile.name || '—'}</span>
              {profile.email ? (
                <span className="nv-am__mail">
                  <span>{profile.email}</span>
                  {profile.emailVerified ? <Icon name="badge-check" size={13} title={labels.emailVerified} /> : null}
                </span>
              ) : null}
              <span className="nv-am__role">{profile.roleLine}</span>
            </span>
            <button type="button" className="nv-ghost-ic" onClick={act(profile.onEditProfile)} aria-label={labels.editProfile} title={labels.editProfile}>
              <Icon name="pencil" size={15} />
            </button>
          </div>

          <div className="nv-am__level">
            <div className="nv-am__lrow">
              <span className="nv-am__lv">{fill(labels.levelN, { level: profile.level })}</span>
              <span className="nv-am__xp">{profile.xpNext === null || profile.xpNext === undefined ? profile.xp + ' XP' : profile.xp + ' / ' + profile.xpNext + ' XP'}</span>
            </div>
            <div className="nv-am__bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={profile.progress} aria-label={fill(labels.levelN, { level: profile.level })}>
              <span style={{ width: profile.progress + '%' }}></span>
            </div>
            <div className="nv-am__lrow nv-am__lrow--sm">
              <span>{profile.xpNext === null || profile.xpNext === undefined ? labels.maxLevel : fill(labels.xpToLevel, { xp: profile.xpToNext, level: profile.level + 1 })}</span>
              <button type="button" className="nv-lnk" onClick={act(profile.onLevelPath)}>{labels.levelPath}</button>
            </div>
          </div>

          <div className="nv-am__stats">
            <div className="nv-am__st">
              <Icon name="zap" size={15} />
              <span className="nv-am__sv">{profile.streak === null || profile.streak === undefined ? '—' : fill(labels.streakDays, { count: profile.streak })}</span>
              <span className="nv-am__sl">{labels.streak}</span>
            </div>
            <div className="nv-am__st">
              <Icon name="trophy" size={15} />
              <span className="nv-am__sv" dir="ltr">{profile.achievementsTotal ? profile.achievementsDone + '/' + profile.achievementsTotal : '—'}</span>
              <span className="nv-am__sl">{labels.achievements}</span>
            </div>
            <div className="nv-am__st">
              <Icon name="wallet" size={15} />
              <span className="nv-am__sv" dir="ltr">{profile.walletLabel || '—'}</span>
              <span className="nv-am__sl">{labels.credit}</span>
            </div>
          </div>

          <div className="nv-am__sec">
            <span ref={headingRef} className="nv-am__sh" tabIndex={-1}>{labels.notifications}</span>
            {notifications.unreadTotal > 0 ? <span className="nv-pill">{fill(labels.newCount, { count: notifications.unreadTotal })}</span> : null}
            <button type="button" className="nv-lnk-btn" onClick={profile.onMarkAllRead} disabled={!notifications.unreadTotal}>
              <Icon name="check-check" size={14} />{labels.markAllRead}
            </button>
          </div>
          <div className="nv-chips" role="tablist" aria-label={labels.notifications}>
            {FILTERS.map((key) => {
              const count = key === 'all' ? 0 : (notifications.counts[key] || 0);
              return (
                <button key={key} type="button" role="tab" aria-selected={filter === key} className={'nv-chip' + (filter === key ? ' nv-chip--on' : '')} onClick={() => setFilter(key)}>
                  {filterLabel[key]}{count > 0 ? <span>{count > 99 ? '99+' : count}</span> : null}
                </button>
              );
            })}
          </div>
          <div className="nv-am__list" role="tabpanel">
            {items.length ? items.map((item) => (
              <button key={item.id} type="button" className={'nv-am__ni' + (item.unread ? '' : ' nv-am__ni--read')} onClick={act(() => profile.onNotification(item))}>
                <span className={'nv-tile nv-tile--' + item.tone} aria-hidden="true"><Icon name={item.icon} size={15} /></span>
                <span className="nv-am__ntext">
                  <span className="nv-am__nt">{item.title}</span>
                  <span className="nv-am__ns"><NotificationBody body={item.body} /></span>
                  {item.time ? <span className="nv-am__ntime">{item.time}</span> : null}
                </span>
                {item.unread ? <span className="nv-udot" role="img" aria-label={labels.unread}></span> : null}
              </button>
            )) : <div className="nv-am__empty">{labels.noNotifications}</div>}
          </div>

          <div className="nv-am__menu">
            <button type="button" className="nv-mi" onClick={act(profile.onMyProfile)}>
              <Icon name="user-round" size={17} /><span>{labels.myProfile}</span><Icon name={chevron} size={15} className="nv-mi__trail" />
            </button>
            <button type="button" className="nv-mi" onClick={act(profile.onSubscription)}>
              <Icon name="crown" size={17} /><span>{labels.subscriptionWallet}</span>
              {profile.planChip ? <span className="nv-plan nv-mi__trail">{profile.planChip}</span> : null}
            </button>
          </div>
          <div className="nv-am__foot">
            {logoutState === 'error' ? (
              <div className="nv-am__err" role="alert"><Icon name="triangle-alert" size={15} /><span>{labels.logoutFailed}</span></div>
            ) : null}
            <button type="button" className="nv-mi nv-mi--danger" onClick={logout} disabled={logoutState === 'busy'}>
              <Icon name="logout" size={17} />
              <span>{logoutState === 'busy' ? labels.loggingOut : logoutState === 'error' ? labels.retryLogout : labels.logoutAccount}</span>
            </button>
          </div>
        </div>
        {placement && !placement.mobile && placement.showNotch ? <span className="nv-am__notch" style={{ top: placement.notchTop }} aria-hidden="true"></span> : null}
      </div>
    </div>,
    document.body
  );
}
