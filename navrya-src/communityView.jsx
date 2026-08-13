import React from 'react';
import { createRoot } from 'react-dom/client';
import { Panel } from '../public/pages/shared/navrya/components/core/Panel.jsx';
import { Button } from '../public/pages/shared/navrya/components/forms/Button.jsx';
import { Icon } from '../public/pages/shared/navrya/components/core/Icon.jsx';
import { Chip } from '../public/pages/shared/navrya/components/forms/Chip.jsx';
import { Modal } from '../public/pages/shared/navrya/components/feedback/Modal.jsx';
import { MetricTile } from '../public/pages/shared/navrya/components/metrics/MetricTile.jsx';
import { XPProgress } from '../public/pages/shared/navrya/components/identity/XPProgress.jsx';
import { RANK_TITLE } from '../public/pages/shared/navrya/components/identity/RankCrest.jsx';
import { assetUrl } from '../public/pages/shared/navrya/components/core/AssetBase.jsx';
import { ReportButton } from './reportFlow.jsx';
import { showToast } from './toast.js';
import { MarketplaceView } from './marketplaceView.jsx';
import { MessagesView } from './messagesView.jsx';
import { currentNavryaCharacter } from './currentCharacter.js';
import { Avatar, currentUserId } from './communityAvatar.jsx';
import * as sessionsAdapter from './sessionsAdapter.js';

const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // mirrors community-ui.js's existing client-side cap

// panel-system.js's own app character id (hunter/commander/engineer/sage) - what sessionsAdapter
// and store.js key their localStorage sessions by. Different from currentNavryaCharacter(),
// which is the design-system skin id derived from this (see currentCharacter.js).
function appCharacter() {
  const layer = window.TradeJournalPanelLayer;
  return (layer && layer.character) || 'hunter';
}

// Real data only, exactly mirroring character-app.jsx's HeaderApp/useMetrics: same profile store,
// same XP rules, same session/trade/psychology globals - Community mounts as its own React root
// so it re-fetches, but never re-derives, this data.
function useOwnProfileSummary() {
  const [profile, setProfile] = React.useState(null);
  const [streak, setStreak] = React.useState(null);
  React.useEffect(() => {
    const store = window.TradeJournalAccountProfileStore;
    if (store) store.getProfile().then(setProfile).catch(() => {});
  }, []);
  React.useEffect(() => {
    const tradeStore = window.TradeJournalTradeStore;
    const psychologyStore = window.TradeJournalPsychologyStore;
    if (!tradeStore || !psychologyStore) return;
    setStreak(psychologyStore.disciplineStreak(tradeStore.listSync()));
  }, []);
  const scenarios = React.useMemo(() => {
    const character = appCharacter();
    const sessions = sessionsAdapter.sanitizeSessions(character, sessionsAdapter.readSessions(character));
    return sessions.reduce((sum, s) => sum + sessionsAdapter.scenarioCount(s), 0);
  }, []);
  const rules = window.TradeJournalProfileXPRules;
  const level = profile && rules ? rules.levelForXp(profile.xpTotal) : undefined;
  const xpMax = profile && rules ? (rules.xpForNextLevel(profile.xpTotal) ?? profile.xpTotal) : undefined;
  return { profile, level, xpMax, scenarios, streak };
}

function YourProfileCard({ i18n }) {
  const [collapsed, setCollapsed] = React.useState(false);
  const { profile, level, xpMax, scenarios, streak } = useOwnProfileSummary();
  const character = currentNavryaCharacter();
  const rankInfo = RANK_TITLE[character] || RANK_TITLE.hunter;
  if (!profile) return null;
  return (
    <Panel variant="base" radius={12} style={{ position: 'sticky', top: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderBottom: collapsed ? 0 : '1px solid var(--border-hairline)' }}>
        <span style={{ font: 'var(--type-section-label)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{i18n.t('yourProfileLabel')}</span>
        <button
          type="button" onClick={() => setCollapsed((c) => !c)} aria-label={i18n.t(collapsed ? 'profileExpandAction' : 'profileCollapseAction')}
          style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border-gold)', background: 'rgba(11,20,21,.72)', color: 'var(--char-accent)', display: 'grid', placeItems: 'center', cursor: 'pointer' }}
        ><Icon name={collapsed ? 'maximize-2' : 'minimize-2'} size={16} /></button>
      </div>
      {collapsed ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 16 }}>
          <img src={assetUrl('assets/portraits/portrait-' + character + '.webp')} alt="" style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', objectPosition: 'center 30%', border: '1px solid var(--border-gold)' }} />
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <strong style={{ font: 'var(--type-username)', color: 'var(--parchment)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile.displayName}</strong>
            <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{'@' + profile.id}</span>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
            <img
              src={assetUrl('assets/portraits/portrait-' + character + '.webp')} alt=""
              style={{ width: 124, height: 124, borderRadius: '50%', objectFit: 'cover', objectPosition: 'center 30%', border: '2px solid var(--char-accent)', boxShadow: 'var(--glow-active)' }}
            />
            <div>
              <strong style={{ display: 'block', font: 'var(--type-username)', fontSize: 16, color: 'var(--parchment)' }}>{profile.displayName}</strong>
              <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{'@' + profile.id}</span>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 12, borderTop: '1px solid var(--divider-gold)' }}>
            <div>
              <div style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{i18n.t('levelLabel')}</div>
              <div className="navrya-tabular" style={{ font: 'var(--type-level)', fontSize: 34, color: 'var(--char-accent)' }}>{level != null ? i18n.number(level) : '—'}</div>
            </div>
            <div style={{ textAlign: 'end' }}>
              <div style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{i18n.t('rankLabel')}</div>
              <div style={{ font: 'var(--type-username)', color: 'var(--char-accent)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{rankInfo.rank}</div>
              <div style={{ font: 'var(--type-caption)', letterSpacing: '.12em', color: 'var(--char-accent)', opacity: .85 }}>{rankInfo.tier}</div>
            </div>
          </div>
          {level != null && <XPProgress value={profile.xpTotal} max={xpMax} showPercent />}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <MetricTile icon="honour" label={i18n.t('honourLabel')} value="—" />
            <MetricTile icon="scenarios" label={i18n.t('scenariosLabel')} value={i18n.number(scenarios)} />
            <MetricTile icon="execution" label={i18n.t('executionLabel')} value="—" />
            <MetricTile icon="streak" label={i18n.t('streakLabel')} value={streak === null ? '—' : i18n.number(streak)} />
          </div>
        </div>
      )}
    </Panel>
  );
}

// A post author's expandable profile strip. LEVEL comes from the real users.xp_total column
// (public for any user), but RANK is keyed on a NAVRYA character skin the users API never
// exposes for anyone but the viewer - so rank only resolves for the viewer's own posts and
// honestly dashes out otherwise, rather than guessing a skin.
function AuthorProfileStrip({ i18n, author, isSelf }) {
  const rules = window.TradeJournalProfileXPRules;
  const xpTotal = (author && author.xpTotal) || 0;
  const level = author && rules ? rules.levelForXp(xpTotal) : undefined;
  const xpMax = author && rules ? (rules.xpForNextLevel(xpTotal) ?? xpTotal) : undefined;
  const character = isSelf ? currentNavryaCharacter() : null;
  const rankInfo = character ? (RANK_TITLE[character] || RANK_TITLE.hunter) : null;
  return (
    <div style={{ margin: '0 18px 14px', padding: 16, borderRadius: 12, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.45)', display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
      <Avatar user={author} size={76} />
      <div>
        <div style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{i18n.t('levelLabel')}</div>
        <div className="navrya-tabular" style={{ font: 'var(--type-level)', fontSize: 34, color: 'var(--char-accent)' }}>{level != null ? i18n.number(level) : '—'}</div>
      </div>
      <div>
        <div style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{i18n.t('rankLabel')}</div>
        <div style={{ font: 'var(--type-username)', color: 'var(--char-accent)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{rankInfo ? rankInfo.rank : '—'}</div>
      </div>
      <div style={{ flex: 1, minWidth: 160 }}>{level != null && <XPProgress value={xpTotal} max={xpMax} />}</div>
    </div>
  );
}

function LikesDialog({ i18n, postId, onClose }) {
  const [likers, setLikers] = React.useState(null);
  React.useEffect(() => { window.TradeJournalCommunityStore.listLikers(postId).then(setLikers); }, [postId]);
  return (
    <Modal title={i18n.t('likesDialogTitle')} icon="heart" onClose={onClose}>
      {(likers || []).map((like) => (
        <div key={like.id} style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 10, borderBottom: '1px solid var(--border-hairline)' }}>
          <Avatar user={like.author} size={40} />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <strong style={{ font: 'var(--type-body)', color: 'var(--parchment)' }}>{like.author ? like.author.displayName : '—'}</strong>
            <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{like.author ? '@' + like.author.id : ''}</span>
          </div>
          <Icon name="heart" size={16} style={{ marginInlineStart: 'auto', color: 'var(--char-accent)' }} />
        </div>
      ))}
    </Modal>
  );
}

function NewPostDialog({ i18n, onClose, onPosted }) {
  const [text, setText] = React.useState('');
  const [pending, setPending] = React.useState([]);
  const [posting, setPosting] = React.useState(false);
  const [profile, setProfile] = React.useState(null);
  const fileRef = React.useRef(null);
  React.useEffect(() => {
    const store = window.TradeJournalAccountProfileStore;
    if (store) store.getProfile().then(setProfile).catch(() => {});
  }, []);

  function attach(file) {
    if (pending.length >= 4 || !/^image\//.test(file.type) || file.size > MAX_IMAGE_BYTES) return;
    const reader = new FileReader();
    reader.onload = () => setPending((p) => [...p, { id: Date.now() + '-' + p.length, url: String(reader.result || '') }]);
    reader.readAsDataURL(file);
  }
  function removeAttachment(index) { setPending((p) => p.filter((_, i) => i !== index)); }
  function submit() {
    const content = text.trim();
    if (!content && !pending.length) return;
    setPosting(true);
    window.TradeJournalCommunityStore.createPost({ content, images: pending.map((p) => p.url) })
      .then(() => { onPosted(); onClose(); })
      .catch((error) => { showToast((error && error.code) || 'FAILED', 'danger'); setPosting(false); });
  }

  return (
    <Modal
      title={i18n.t('newPostTitle')} icon="edit" onClose={onClose} width={720}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>{i18n.t('cancel')}</Button>
          <Button variant="primary" icon="send" onClick={submit} disabled={posting} style={{ marginInlineStart: 'auto' }}>{i18n.t('feedPost')}</Button>
        </>
      )}
    >
      {profile && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Avatar user={profile} size={40} />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <strong style={{ font: 'var(--type-username)', color: 'var(--parchment)' }}>{profile.displayName}</strong>
            <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{'@' + profile.id}</span>
          </div>
        </div>
      )}
      <textarea
        value={text} onChange={(e) => setText(e.target.value)} rows={6} dir="auto"
        placeholder={i18n.t('feedComposerPlaceholder')}
        style={{ resize: 'vertical', borderRadius: 8, padding: 14, background: 'rgba(3,8,7,.55)', border: '1px solid var(--border-gold)', color: 'var(--text-primary)', font: 'var(--type-body)', fontSize: 15, lineHeight: '26px', outline: 'none' }}
      />
      {pending.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {pending.map((p, i) => (
            <div key={p.id} style={{ position: 'relative', width: 64, height: 64, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border-hairline)' }}>
              <img src={p.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <button
                type="button" onClick={() => removeAttachment(i)} aria-label="Remove"
                style={{ position: 'absolute', top: 2, insetInlineEnd: 2, width: 18, height: 18, borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'rgba(3,8,7,.86)', border: 0, color: '#fff', cursor: 'pointer' }}
              ><Icon name="close" size={11} /></button>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const file = e.target.files && e.target.files[0]; e.target.value = ''; if (file) attach(file); }} />
        <Button variant="secondary" icon="image" onClick={() => fileRef.current && fileRef.current.click()}>{i18n.t('feedAttachImage')}</Button>
        {pending.length > 0 && <Chip tone="accent">{i18n.t('imageAttachedLabel', { n: i18n.number(pending.length) })}</Chip>}
      </div>
    </Modal>
  );
}

function CommentsPanel({ i18n, post }) {
  const [comments, setComments] = React.useState(null);
  const [draft, setDraft] = React.useState('');
  function load() { window.TradeJournalCommunityStore.listComments(post.id).then(setComments); }
  React.useEffect(() => { load(); }, [post.id]);
  function send() {
    const value = draft.trim();
    if (!value) return;
    window.TradeJournalCommunityStore.createComment(post.id, value).then(() => { setDraft(''); load(); });
  }
  return (
    <div style={{ borderTop: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.35)', padding: '14px 18px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {comments === null ? null : !comments.length ? (
        <span style={{ font: 'var(--type-body)', fontSize: 13, color: 'var(--text-muted)' }}>{i18n.t('commentsEmpty')}</span>
      ) : comments.map((c) => (
        <div key={c.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <Avatar user={c.author} size={32} />
          <div style={{ flex: 1, padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-hairline)', background: 'var(--surface-card)' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
              <strong style={{ font: 'var(--type-body)', fontWeight: 600, color: 'var(--parchment)' }}>{c.author ? c.author.displayName : '—'}</strong>
              <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{i18n.date(c.createdAt)}</span>
              <ReportButton targetType="comment" targetId={c.id} i18n={i18n} style={{ marginInlineStart: 'auto' }} />
            </div>
            <p dir="auto" style={{ margin: '4px 0 0', font: 'var(--type-body)', color: 'var(--text-primary)' }}>{c.content}</p>
          </div>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="text" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={i18n.t('commentPlaceholder')} dir="auto"
          style={{ flex: 1, height: 44, boxSizing: 'border-box', padding: '0 14px', borderRadius: 8, background: 'rgba(3,8,7,.55)', border: '1px solid var(--border-gold)', color: 'var(--text-primary)', font: 'var(--type-body)', outline: 'none' }}
        />
        <Button variant="primary" icon="send" onClick={send}>{i18n.t('commentSend')}</Button>
      </div>
    </div>
  );
}

function PillButton({ active, onClick, children, style }) {
  return (
    <button
      type="button" onClick={onClick}
      style={{
        height: 36, padding: '0 14px', borderRadius: 8, display: 'inline-flex', alignItems: 'center', gap: 9,
        border: '1px solid ' + (active ? 'var(--char-accent)' : 'var(--border-gold)'),
        background: active ? 'var(--char-active-surface)' : 'rgba(11,20,21,.72)',
        color: active ? 'var(--char-accent)' : 'var(--text-muted)', cursor: 'pointer', font: 'var(--type-body)', fontSize: 13, ...style
      }}
    >{children}</button>
  );
}

function PostCard({ i18n, post }) {
  const [profileOpen, setProfileOpen] = React.useState(false);
  const [commentsOpen, setCommentsOpen] = React.useState(false);
  const [likesOpen, setLikesOpen] = React.useState(false);
  const [likeCount, setLikeCount] = React.useState(post.likeCount || 0);
  const [likedByMe, setLikedByMe] = React.useState(!!post.likedByMe);
  const [firstLiker, setFirstLiker] = React.useState(post.firstLiker || null);
  const isSelf = !!(post.author && currentUserId() === post.author.id);
  const images = post.images || [];

  function toggleLike() {
    const nextLiked = !likedByMe;
    setLikedByMe(nextLiked);
    setLikeCount((c) => c + (nextLiked ? 1 : -1));
    if (nextLiked && !firstLiker) window.TradeJournalCommunityStore.getUser(currentUserId()).then(setFirstLiker).catch(() => {});
    // Dropping the last like clears firstLiker too - otherwise a later like from a different
    // user would keep showing the previous (now gone) liker's name until the next full refetch.
    else if (!nextLiked && likeCount <= 1) setFirstLiker(null);
    window.TradeJournalCommunityStore.toggleLike(post.id).catch(() => { setLikedByMe(!nextLiked); setLikeCount((c) => c + (nextLiked ? -1 : 1)); });
  }

  return (
    <Panel variant="base" radius={12} style={{ overflow: 'hidden', boxShadow: 'var(--shadow-panel)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 18px' }}>
        <Avatar user={post.author} size={44} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <strong style={{ font: 'var(--type-username)', color: 'var(--parchment)' }}>{post.author ? post.author.displayName : '—'}</strong>
            <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{post.author ? '@' + post.author.id : ''}</span>
          </div>
          <div style={{ font: 'var(--type-caption)', letterSpacing: '.06em', color: 'var(--text-muted)' }}>{i18n.date(post.createdAt)}</div>
        </div>
        <button
          type="button" onClick={() => setProfileOpen((o) => !o)}
          style={{ height: 32, padding: '0 12px', borderRadius: 8, border: '1px solid var(--border-gold)', background: 'rgba(11,20,21,.72)', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', font: 'var(--type-caption)' }}
        >{i18n.t(profileOpen ? 'profileHideAction' : 'profileShowAction')}<Icon name={profileOpen ? 'chevron-up' : 'chevron-down'} size={14} /></button>
        <ReportButton targetType="post" targetId={post.id} i18n={i18n} />
      </div>
      {profileOpen && <AuthorProfileStrip i18n={i18n} author={post.author} isSelf={isSelf} />}
      {post.content && <p dir="auto" style={{ margin: '0 18px 14px', font: 'var(--type-body)', fontSize: 15, lineHeight: '26px', color: 'var(--text-primary)' }}>{post.content}</p>}
      {images.length === 1 ? (
        <div style={{ margin: '0 18px 14px', borderRadius: 8, border: '1px solid var(--border-hairline)', overflow: 'hidden' }}>
          <img src={images[0]} alt="" style={{ width: '100%', height: 380, objectFit: 'cover', objectPosition: 'top center', display: 'block' }} />
        </div>
      ) : images.length > 1 ? (
        <div style={{ margin: '0 18px 14px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {images.map((src, i) => <img key={i} src={src} alt="" style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border-hairline)' }} />)}
        </div>
      ) : null}
      {likeCount > 0 && (
        <button
          type="button" onClick={() => setLikesOpen(true)}
          style={{ margin: '0 18px 14px', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.45)', display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: 'var(--text-primary)', font: 'var(--type-body)', fontSize: 13 }}
        ><Avatar user={firstLiker} size={22} />{i18n.t('likedByLabel', { name: firstLiker ? firstLiker.displayName : '—' })}</button>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 18px', borderTop: '1px solid var(--border-hairline)' }}>
        <PillButton active={likedByMe} onClick={toggleLike}><Icon name="heart" size={17} />{i18n.number(likeCount)}</PillButton>
        <PillButton active={false} onClick={() => setCommentsOpen((o) => !o)}><Icon name="message-circle" size={17} />{i18n.number(post.commentCount)}</PillButton>
        <span style={{ marginInlineStart: 'auto', font: 'var(--type-caption)', letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
          {i18n.t('commentsCountLabel', { n: i18n.number(post.commentCount) })}
        </span>
      </div>
      {commentsOpen && <CommentsPanel i18n={i18n} post={post} />}
      {likesOpen && <LikesDialog i18n={i18n} postId={post.id} onClose={() => setLikesOpen(false)} />}
    </Panel>
  );
}

function FeedView({ i18n, newPostOpen, onNewPostOpenChange }) {
  const [posts, setPosts] = React.useState(null);
  function load() { window.TradeJournalCommunityStore.listPosts({ limit: 20 }).then((data) => setPosts(data.posts)); }
  React.useEffect(() => {
    load();
    const timer = window.setInterval(load, 25000); // light polling only while the feed tab is mounted, mirrors community-ui.js
    return () => window.clearInterval(timer);
  }, []);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 16, alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Panel variant="base" radius={12} style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <Avatar user={{ id: currentUserId() }} size={44} />
          <button
            type="button" onClick={() => onNewPostOpenChange(true)}
            style={{ flex: 1, height: 44, borderRadius: 8, background: 'rgba(3,8,7,.55)', border: '1px solid var(--border-gold)', color: 'var(--text-muted)', textAlign: 'start', padding: '0 14px', cursor: 'pointer', font: 'var(--type-body)' }}
          >{i18n.t('feedComposerPlaceholder')}</button>
          <button
            type="button" onClick={() => onNewPostOpenChange(true)} aria-label={i18n.t('newPostAction')}
            style={{ width: 44, height: 44, borderRadius: 8, background: 'var(--char-accent)', color: 'var(--ink-950)', border: 0, display: 'grid', placeItems: 'center', cursor: 'pointer' }}
          ><Icon name="plus" size={20} /></button>
        </Panel>
        {posts === null ? null : !posts.length ? (
          <Panel variant="base" radius={12} style={{ padding: 16 }}><span style={{ font: 'var(--type-body)', color: 'var(--text-muted)' }}>{i18n.t('feedEmpty')}</span></Panel>
        ) : posts.map((post) => <PostCard key={post.id} i18n={i18n} post={post} />)}
      </div>
      <YourProfileCard i18n={i18n} />
      {newPostOpen && <NewPostDialog i18n={i18n} onClose={() => onNewPostOpenChange(false)} onPosted={load} />}
    </div>
  );
}

const TABS = [['feed', 'tabFeed', 'rss'], ['marketplace', 'tabMarketplace', 'store'], ['messages', 'tabMessages', 'mail']];

function CommunityShell({ i18n, tab, itemId }) {
  const rtl = i18n.direction() === 'rtl';
  const [newPostOpen, setNewPostOpen] = React.useState(false);
  const [newMessageOpen, setNewMessageOpen] = React.useState(false);
  return (
    <div dir={rtl ? 'rtl' : 'ltr'} style={{ direction: rtl ? 'rtl' : 'ltr', display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
      <div>
        <h1 style={{ margin: '0 0 4px', font: 'var(--type-display-lg)', fontSize: 22, lineHeight: '28px', letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--parchment)' }}>{i18n.t('communityTitle')}</h1>
        <p style={{ margin: 0, font: 'var(--type-body)', color: 'var(--text-muted)', maxWidth: 660 }}>{i18n.t('communityHint')}</p>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, borderBottom: '1px solid var(--border-hairline)', paddingBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8, padding: 5, borderRadius: 12, border: '1px solid var(--border-gold)', background: 'rgba(11,20,21,.72)' }}>
          {TABS.map(([id, key, icon]) => {
            const active = id === tab;
            return (
              <button
                key={id} type="button" onClick={() => { location.hash = '#community/' + id; }}
                style={{
                  height: 40, padding: '0 18px', borderRadius: 8, display: 'inline-flex', alignItems: 'center', gap: 9,
                  border: '1px solid ' + (active ? 'var(--char-accent)' : 'transparent'),
                  background: active ? 'var(--char-accent)' : 'transparent',
                  color: active ? 'var(--ink-950)' : 'var(--text-muted)', fontWeight: active ? 600 : 500,
                  font: 'var(--type-body)', fontSize: 13, cursor: 'pointer'
                }}
              ><Icon name={icon} size={18} />{i18n.t(key)}</button>
            );
          })}
        </div>
        {tab === 'feed' && <Button variant="primary" icon="plus" onClick={() => setNewPostOpen(true)}>{i18n.t('newPostAction')}</Button>}
        {tab === 'messages' && <Button variant="primary" icon="plus" onClick={() => setNewMessageOpen(true)}>{i18n.t('newMessageAction')}</Button>}
      </div>
      {tab === 'marketplace' ? <MarketplaceView i18n={i18n} itemId={itemId} /> :
        tab === 'messages' ? <MessagesView i18n={i18n} threadId={itemId} newMessageOpen={newMessageOpen} onNewMessageOpenChange={setNewMessageOpen} /> :
        <FeedView i18n={i18n} newPostOpen={newPostOpen} onNewPostOpenChange={setNewPostOpen} />}
    </div>
  );
}

// community-ui.js's renderPage(tab, itemId) defers to this hook when present - same real
// community-store.js reads/writes throughout (feed/marketplace/messages), only the DOM
// building changes. marketplace-ui.js/messages-ui.js stay as the fallback path.
export function renderCommunity(tab, itemId) {
  const i18n = window.TradeJournalCommunityI18n;
  const container = document.createElement('div');
  container.className = 'panel-page tj-community-page';
  container.dataset.character = currentNavryaCharacter();
  createRoot(container).render(<CommunityShell i18n={i18n} tab={tab} itemId={itemId} />);
  return container;
}
