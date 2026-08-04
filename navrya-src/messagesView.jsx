import React from 'react';
import { Panel } from '../public/pages/shared/navrya/components/core/Panel.jsx';
import { Button } from '../public/pages/shared/navrya/components/forms/Button.jsx';
import { ChatThread } from '../public/pages/shared/navrya/components/feedback/ChatThread.jsx';
import { ReportButton } from './reportFlow.jsx';

function ThreadRow({ thread, i18n }) {
  return (
    <Panel
      as="button" type="button" variant={thread.unreadCount ? 'active' : 'base'} radius={12}
      onClick={() => { location.hash = '#community/messages/' + encodeURIComponent(thread.id); }}
      style={{ textAlign: 'start', cursor: 'pointer', padding: 14, display: 'flex', flexDirection: 'column', gap: 6, width: '100%', font: 'inherit', color: 'inherit' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
        <strong style={{ font: 'var(--type-body)', color: 'var(--parchment)' }}>{thread.counterparty ? thread.counterparty.displayName : '—'}</strong>
        {thread.unreadCount ? (
          <span style={{ minWidth: 20, height: 20, borderRadius: 10, background: 'var(--char-accent)', color: 'var(--ink-950)', display: 'grid', placeItems: 'center', font: 'var(--type-caption)', fontWeight: 700, padding: '0 6px' }}>{thread.unreadCount}</span>
        ) : null}
      </div>
      {thread.listingTitle && <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{thread.listingTitle}</span>}
      {thread.lastMessage && <span style={{ font: 'var(--type-body)', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{thread.lastMessage.content}</span>}
    </Panel>
  );
}

export function MessagesList({ i18n }) {
  const [threads, setThreads] = React.useState(null);
  React.useEffect(() => { window.TradeJournalCommunityStore.listThreads().then(setThreads); }, []);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h2 style={{ margin: 0, font: 'var(--type-display-md)', fontSize: 20, color: 'var(--parchment)' }}>{i18n.t('messagesTitle')}</h2>
      {threads === null ? null : !threads.length ? (
        <Panel variant="base" radius={12} style={{ padding: 16 }}><span style={{ font: 'var(--type-body)', color: 'var(--text-muted)' }}>{i18n.t('messagesEmpty')}</span></Panel>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {threads.map((t) => <ThreadRow key={t.id} thread={t} i18n={i18n} />)}
        </div>
      )}
    </div>
  );
}

export function MessagesThread({ i18n, threadId }) {
  const [data, setData] = React.useState(null);
  const [reload, setReload] = React.useState(0);
  React.useEffect(() => { setData(null); window.TradeJournalCommunityStore.getThread(threadId).then(setData); }, [threadId, reload]);
  const rtl = i18n.direction() === 'rtl';

  if (!data) return null;
  const switcher = window.TradeJournalDevUserSwitcher;
  const messages = data.messages.map((m) => ({ id: m.id, text: m.content, mine: !!(switcher && switcher.currentUserId() === m.senderId) }));
  function send(text) { window.TradeJournalCommunityStore.sendMessage(threadId, text).then(() => setReload((r) => r + 1)); }

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} style={{ direction: rtl ? 'rtl' : 'ltr', display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 640 }}>
      <Button variant="ghost" icon={rtl ? 'arrow-right' : 'arrow-left'} onClick={() => { location.hash = '#community/messages'; }} style={{ alignSelf: 'flex-start' }}>{i18n.t('back')}</Button>
      <Panel variant="base" radius={12} style={{ padding: 16 }}>
        <ChatThread
          messages={messages} onSend={send} placeholder={i18n.t('threadPlaceholder')} sendLabel={i18n.t('threadSend')}
          renderActions={(m) => (!m.mine ? <ReportButton targetType="message" targetId={m.id} i18n={i18n} /> : null)}
        />
      </Panel>
    </div>
  );
}

export function MessagesView({ i18n, threadId }) {
  return threadId ? <MessagesThread i18n={i18n} threadId={threadId} /> : <MessagesList i18n={i18n} />;
}
