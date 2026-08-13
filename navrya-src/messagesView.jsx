import React from 'react';
import { Panel } from '../public/pages/shared/navrya/components/core/Panel.jsx';
import { Button } from '../public/pages/shared/navrya/components/forms/Button.jsx';
import { Icon } from '../public/pages/shared/navrya/components/core/Icon.jsx';
import { Chip } from '../public/pages/shared/navrya/components/forms/Chip.jsx';
import { Modal } from '../public/pages/shared/navrya/components/feedback/Modal.jsx';
import { ReportButton } from './reportFlow.jsx';
import { Avatar, currentUserId } from './communityAvatar.jsx';

// Recipient autocomplete for the "New message" dialog - real users only, never raw text. Not in
// the design prototype (its own "To" field is a plain uncontrolled input with no filtering at
// all - confirmed by reading the prototype source), built fresh against the real
// GET /api/users/search endpoint.
function RecipientPicker({ i18n, selected, onSelect }) {
  const [query, setQuery] = React.useState(selected ? selected.displayName : '');
  const [results, setResults] = React.useState([]);
  const [open, setOpen] = React.useState(false);
  const timerRef = React.useRef(null);

  function handleInput(text) {
    setQuery(text);
    onSelect(null);
    setOpen(true);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    const trimmed = text.trim();
    if (!trimmed) { setResults([]); return; }
    timerRef.current = window.setTimeout(() => { window.TradeJournalCommunityStore.searchUsers(trimmed).then(setResults); }, 200);
  }
  function pick(user) {
    onSelect(user);
    setQuery(user.displayName);
    setResults([]);
    setOpen(false);
  }

  return (
    <div style={{ position: 'relative' }}>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        <span style={{ font: 'var(--type-body)', fontSize: 12, color: 'var(--text-primary)' }}>{i18n.t('messageToLabel')}</span>
        <input
          type="text" value={query} dir="auto" placeholder={i18n.t('messageToPlaceholder')}
          onChange={(e) => handleInput(e.target.value)} onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          style={{ height: 44, boxSizing: 'border-box', padding: '0 14px', borderRadius: 8, background: 'rgba(3,8,7,.55)', border: '1px solid var(--border-gold)', color: 'var(--text-primary)', font: 'var(--type-body)', outline: 'none' }}
        />
      </label>
      {open && query.trim() && !selected && (
        <div style={{ position: 'absolute', insetInlineStart: 0, insetInlineEnd: 0, top: '100%', marginTop: 4, zIndex: 5, borderRadius: 8, border: '1px solid var(--border-gold)', background: 'var(--ink-900)', boxShadow: 'var(--shadow-raised)', maxHeight: 220, overflowY: 'auto' }}>
          {results.length ? results.map((user) => (
            <button
              key={user.id} type="button" onMouseDown={() => pick(user)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '10px 12px', background: 'transparent', border: 0, cursor: 'pointer', textAlign: 'start' }}
            >
              <Avatar user={user} size={28} />
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <strong style={{ font: 'var(--type-body)', fontSize: 13, color: 'var(--parchment)' }}>{user.displayName}</strong>
                <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{'@' + user.id}</span>
              </div>
            </button>
          )) : <div style={{ padding: '10px 12px', font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{i18n.t('recipientNoResults')}</div>}
        </div>
      )}
    </div>
  );
}

function NewMessageDialog({ i18n, onClose, onSent }) {
  const [recipient, setRecipient] = React.useState(null);
  const [text, setText] = React.useState('');
  const [sending, setSending] = React.useState(false);

  function send() {
    const value = text.trim();
    if (!recipient || !value) return;
    setSending(true);
    window.TradeJournalCommunityStore.openThreadWithUser(recipient.id)
      .then((thread) => window.TradeJournalCommunityStore.sendMessage(thread.id, value).then(() => thread))
      .then((thread) => { onSent(thread.id); onClose(); })
      .catch(() => setSending(false));
  }

  return (
    <Modal
      title={i18n.t('newMessageTitle')} icon="mail" onClose={onClose} width={620}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>{i18n.t('cancel')}</Button>
          <Button variant="primary" icon="send" onClick={send} disabled={sending || !recipient || !text.trim()} style={{ marginInlineStart: 'auto' }}>{i18n.t('threadSend')}</Button>
        </>
      )}
    >
      <RecipientPicker i18n={i18n} selected={recipient} onSelect={setRecipient} />
      <textarea
        value={text} onChange={(e) => setText(e.target.value)} rows={5} dir="auto"
        placeholder={i18n.t('threadPlaceholder')}
        style={{ resize: 'vertical', borderRadius: 8, padding: 14, background: 'rgba(3,8,7,.55)', border: '1px solid var(--border-gold)', color: 'var(--text-primary)', font: 'var(--type-body)', outline: 'none' }}
      />
    </Modal>
  );
}

function ConversationRow({ i18n, thread, active }) {
  return (
    <button
      type="button" onClick={() => { location.hash = '#community/messages/' + encodeURIComponent(thread.id); }}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '12px 14px', textAlign: 'start',
        background: active ? 'var(--char-active-surface)' : 'transparent', border: 0,
        borderInlineStart: '2px solid ' + (active ? 'var(--char-accent)' : 'transparent'),
        borderBottom: '1px solid var(--border-hairline)', cursor: 'pointer', font: 'inherit', color: 'inherit'
      }}
    >
      <Avatar user={thread.counterparty} size={40} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <strong style={{ font: 'var(--type-body)', fontWeight: 600, color: 'var(--parchment)' }}>{thread.counterparty ? thread.counterparty.displayName : '—'}</strong>
        {thread.lastMessage && <span dir="auto" style={{ font: 'var(--type-caption)', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{thread.lastMessage.content}</span>}
      </div>
      {thread.lastMessage && <span className="navrya-tabular" style={{ font: 'var(--type-caption)', color: 'var(--text-muted)', flex: 'none' }}>{i18n.time(thread.lastMessage.createdAt)}</span>}
    </button>
  );
}

function ConversationList({ i18n, threads, activeId }) {
  return (
    <Panel variant="base" radius={12} style={{ minHeight: 560, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 16px', borderBottom: '1px solid var(--border-hairline)' }}>
        <span style={{ font: 'var(--type-section-label)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{i18n.t('conversationsLabel')}</span>
        <Chip tone="accent">{i18n.number(threads.length)}</Chip>
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {!threads.length ? (
          <div style={{ padding: 16 }}><span style={{ font: 'var(--type-body)', color: 'var(--text-muted)' }}>{i18n.t('messagesEmpty')}</span></div>
        ) : threads.map((thread) => <ConversationRow key={thread.id} i18n={i18n} thread={thread} active={thread.id === activeId} />)}
      </div>
    </Panel>
  );
}

function ThreadEmptyState({ i18n, onNewMessage }) {
  return (
    <Panel variant="base" radius={12} style={{ minHeight: 560, display: 'grid', placeItems: 'center', padding: 40 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, maxWidth: 360, textAlign: 'center' }}>
        <Icon name="mail" size={32} style={{ color: 'var(--char-accent)' }} />
        <h2 style={{ margin: 0, font: 'var(--type-display-md)', fontSize: 18, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--parchment)' }}>{i18n.t('messagesEmptyTitle')}</h2>
        <p style={{ margin: 0, font: 'var(--type-body)', color: 'var(--text-muted)' }}>{i18n.t('messagesEmptyBody')}</p>
        <Button variant="primary" icon="plus" onClick={onNewMessage}>{i18n.t('newMessageAction')}</Button>
      </div>
    </Panel>
  );
}

function ThreadBubble({ i18n, message, mine }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start', gap: 4, maxWidth: '70%', alignSelf: mine ? 'flex-end' : 'flex-start' }}>
      <div
        dir="auto"
        style={{
          padding: '12px 14px', borderRadius: 8, font: 'var(--type-body)', color: mine ? 'var(--char-accent)' : 'var(--text-primary)',
          background: mine ? 'var(--char-active-surface)' : 'rgba(3,8,7,.45)',
          border: '1px solid ' + (mine ? 'color-mix(in srgb, var(--char-accent) 55%, transparent)' : 'var(--border-hairline)')
        }}
      >{message.content}</div>
      <span className="navrya-tabular" style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{i18n.time(message.createdAt)}</span>
    </div>
  );
}

function ThreadPanel({ i18n, threadId, reloadKey }) {
  const [data, setData] = React.useState(null);
  const [draft, setDraft] = React.useState('');
  const [reload, setReload] = React.useState(0);
  React.useEffect(() => { setData(null); window.TradeJournalCommunityStore.getThread(threadId).then(setData); }, [threadId, reloadKey, reload]);

  if (!data) return <Panel variant="base" radius={12} style={{ minHeight: 560 }} />;
  const { thread, messages } = data;
  function send() {
    const value = draft.trim();
    if (!value) return;
    window.TradeJournalCommunityStore.sendMessage(threadId, value).then(() => { setDraft(''); setReload((r) => r + 1); });
  }
  return (
    <Panel variant="base" radius={12} style={{ minHeight: 560, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: '1px solid var(--border-hairline)' }}>
        <Avatar user={thread.counterparty} size={40} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <strong style={{ display: 'block', font: 'var(--type-username)', color: 'var(--parchment)' }}>{thread.counterparty ? thread.counterparty.displayName : '—'}</strong>
          <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{thread.counterparty ? '@' + thread.counterparty.id : ''}</span>
        </div>
        {thread.listingTitle && <Chip tone="neutral">{thread.listingTitle}</Chip>}
      </div>
      <div className="navrya-scroll" style={{ flex: 1, maxHeight: 400, overflowY: 'auto', padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {messages.map((m) => (
          <div key={m.id} style={{ display: 'flex', flexDirection: 'column' }}>
            <ThreadBubble i18n={i18n} message={m} mine={m.senderId === currentUserId()} />
            {m.senderId !== currentUserId() && <ReportButton targetType="message" targetId={m.id} i18n={i18n} style={{ alignSelf: 'flex-start', marginTop: 4 }} />}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, padding: '14px 16px', borderTop: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.35)' }}>
        <input
          type="text" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={i18n.t('threadPlaceholder')} dir="auto"
          onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
          style={{ flex: 1, height: 44, boxSizing: 'border-box', padding: '0 14px', borderRadius: 8, background: 'rgba(3,8,7,.55)', border: '1px solid var(--border-gold)', color: 'var(--text-primary)', font: 'var(--type-body)', outline: 'none' }}
        />
        <Button variant="primary" icon="send" onClick={send}>{i18n.t('threadSend')}</Button>
      </div>
    </Panel>
  );
}

export function MessagesView({ i18n, threadId, newMessageOpen, onNewMessageOpenChange }) {
  const [threads, setThreads] = React.useState(null);
  const [reloadKey, setReloadKey] = React.useState(0);
  React.useEffect(() => { window.TradeJournalCommunityStore.listThreads().then(setThreads); }, [threadId, reloadKey]);
  const rtl = i18n.direction() === 'rtl';

  function openDialog() { onNewMessageOpenChange(true); }
  function closeDialog() { onNewMessageOpenChange(false); }
  function afterSent(newThreadId) { setReloadKey((k) => k + 1); location.hash = '#community/messages/' + encodeURIComponent(newThreadId); }

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} style={{ direction: rtl ? 'rtl' : 'ltr', display: 'grid', gridTemplateColumns: '320px minmax(0,1fr)', gap: 16 }}>
      <ConversationList i18n={i18n} threads={threads || []} activeId={threadId} />
      {threadId ? <ThreadPanel i18n={i18n} threadId={threadId} reloadKey={reloadKey} /> : <ThreadEmptyState i18n={i18n} onNewMessage={openDialog} />}
      {newMessageOpen && <NewMessageDialog i18n={i18n} onClose={closeDialog} onSent={afterSent} />}
    </div>
  );
}
