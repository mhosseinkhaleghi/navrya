import React from 'react';
import { createRoot } from 'react-dom/client';
import { Panel } from '../public/pages/shared/navrya/components/core/Panel.jsx';
import { Button } from '../public/pages/shared/navrya/components/forms/Button.jsx';
import { Icon } from '../public/pages/shared/navrya/components/core/Icon.jsx';
import { Composer } from '../public/pages/shared/navrya/components/cards/Composer.jsx';
import { ReportButton } from './reportFlow.jsx';
import { showToast } from './toast.js';
import { MarketplaceView } from './marketplaceView.jsx';
import { MessagesView } from './messagesView.jsx';
import { currentNavryaCharacter } from './currentCharacter.js';

const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // mirrors community-ui.js's existing client-side cap

function FeedComposer({ i18n, onPosted }) {
  const [text, setText] = React.useState('');
  const [pending, setPending] = React.useState([]);
  const [posting, setPosting] = React.useState(false);

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
      .then(() => { setText(''); setPending([]); if (onPosted) onPosted(); })
      .catch((error) => showToast((error && error.code) || 'FAILED', 'danger'))
      .finally(() => setPosting(false));
  }

  return (
    <Composer
      value={text} onChange={setText} attachments={pending.map((p) => ({ id: p.id, previewUrl: p.url }))}
      onAttach={attach} onRemoveAttachment={removeAttachment} onSubmit={submit} disabled={posting}
      placeholder={i18n.t('feedComposerPlaceholder')} postLabel={i18n.t('feedPost')} attachLabel={i18n.t('feedAttachImage')}
    />
  );
}

function CommentsSection({ i18n, post }) {
  const [open, setOpen] = React.useState(false);
  const [comments, setComments] = React.useState(null);
  const [draft, setDraft] = React.useState('');

  function load() { window.TradeJournalCommunityStore.listComments(post.id).then(setComments); }
  function toggle() { const next = !open; setOpen(next); if (next && comments === null) load(); }
  function send() {
    const value = draft.trim();
    if (!value) return;
    window.TradeJournalCommunityStore.createComment(post.id, value).then(() => { setDraft(''); load(); });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <button
        type="button" onClick={toggle}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, alignSelf: 'flex-start', background: 'transparent', border: 0, padding: 0, color: 'var(--text-muted)', cursor: 'pointer', font: 'var(--type-caption)' }}
      ><Icon name="message-circle" size={14} />{i18n.number(post.commentCount)}</button>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid var(--border-hairline)', paddingTop: 10 }}>
          {comments === null ? null : !comments.length ? (
            <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{i18n.t('commentsEmpty')}</span>
          ) : comments.map((c) => (
            <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
              <span style={{ font: 'var(--type-body)', color: 'var(--text-primary)' }}><strong style={{ color: 'var(--char-accent)' }}>{c.author ? c.author.displayName : '—'}</strong>{' ' + c.content}</span>
              <ReportButton targetType="comment" targetId={c.id} i18n={i18n} />
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={i18n.t('commentPlaceholder')}
              style={{ flex: 1, height: 40, boxSizing: 'border-box', padding: '0 12px', borderRadius: 8, background: 'rgba(3,8,7,.55)', border: '1px solid var(--border-gold)', color: 'var(--text-primary)', font: 'var(--type-body)', outline: 'none' }}
            />
            <Button variant="secondary" size="sm" onClick={send}>{i18n.t('commentSend')}</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function PostCard({ i18n, post }) {
  return (
    <Panel variant="base" radius={12} style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
          <strong style={{ font: 'var(--type-body)', color: 'var(--parchment)' }}>{post.author ? post.author.displayName : '—'}</strong>
          <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{i18n.date(post.createdAt)}</span>
        </div>
        <ReportButton targetType="post" targetId={post.id} i18n={i18n} />
      </div>
      {post.content && <p style={{ margin: 0, font: 'var(--type-body)', color: 'var(--text-primary)' }}>{post.content}</p>}
      {(post.images || []).length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {post.images.map((src, i) => <img key={i} src={src} alt="" style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border-hairline)' }} />)}
        </div>
      )}
      <CommentsSection i18n={i18n} post={post} />
    </Panel>
  );
}

function FeedView({ i18n }) {
  const [posts, setPosts] = React.useState(null);
  function load() { window.TradeJournalCommunityStore.listPosts({ limit: 20 }).then((data) => setPosts(data.posts)); }
  React.useEffect(() => {
    load();
    const timer = window.setInterval(load, 25000); // light polling only while the feed tab is mounted, mirrors community-ui.js
    return () => window.clearInterval(timer);
  }, []);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <FeedComposer i18n={i18n} onPosted={load} />
      {posts === null ? null : !posts.length ? (
        <Panel variant="base" radius={12} style={{ padding: 16 }}><span style={{ font: 'var(--type-body)', color: 'var(--text-muted)' }}>{i18n.t('feedEmpty')}</span></Panel>
      ) : posts.map((post) => <PostCard key={post.id} i18n={i18n} post={post} />)}
    </div>
  );
}

const TABS = [['feed', 'tabFeed', 'rss'], ['marketplace', 'tabMarketplace', 'store'], ['messages', 'tabMessages', 'mail']];

function CommunityShell({ i18n, tab, itemId }) {
  const rtl = i18n.direction() === 'rtl';
  return (
    <div dir={rtl ? 'rtl' : 'ltr'} style={{ direction: rtl ? 'rtl' : 'ltr', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h2 style={{ margin: '0 0 4px', font: 'var(--type-display-md)', fontSize: 22, color: 'var(--parchment)' }}>{i18n.t('communityTitle')}</h2>
        <p style={{ margin: 0, font: 'var(--type-body)', color: 'var(--text-muted)' }}>{i18n.t('communityHint')}</p>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {TABS.map(([id, key, icon]) => (
          <Button key={id} variant={id === tab ? 'primary' : 'ghost'} icon={icon} onClick={() => { location.hash = '#community/' + id; }}>{i18n.t(key)}</Button>
        ))}
      </div>
      {tab === 'marketplace' ? <MarketplaceView i18n={i18n} itemId={itemId} /> :
        tab === 'messages' ? <MessagesView i18n={i18n} threadId={itemId} /> :
        <FeedView i18n={i18n} />}
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
