import React from 'react';
import { createRoot } from 'react-dom/client';
import { Panel } from '../public/pages/shared/navrya/components/core/Panel.jsx';
import { Button } from '../public/pages/shared/navrya/components/forms/Button.jsx';
import { Icon } from '../public/pages/shared/navrya/components/core/Icon.jsx';
import { Chip } from '../public/pages/shared/navrya/components/forms/Chip.jsx';
import { Select } from '../public/pages/shared/navrya/components/forms/Select.jsx';
import { Modal } from '../public/pages/shared/navrya/components/feedback/Modal.jsx';
import { Notice } from '../public/pages/shared/navrya/components/feedback/Notice.jsx';
import { showToast } from './toast.js';
import { currentUserId } from './communityAvatar.jsx';
import { currentNavryaCharacter } from './currentCharacter.js';

const CATEGORIES = ['technical', 'billing', 'account', 'other'];
const STATUS_TONE = { open: 'warning', waiting_user: 'accent', resolved: 'success', closed: 'neutral' };
const STATUS_KEY = { open: 'statusOpen', waiting_user: 'statusWaitingUser', resolved: 'statusResolved', closed: 'statusClosed' };

function StatusChip({ i18n, status }) {
  return <Chip tone={STATUS_TONE[status] || 'neutral'} dot>{i18n.t(STATUS_KEY[status] || 'statusOpen')}</Chip>;
}

function NewTicketDialog({ i18n, onClose, onCreated }) {
  const [subject, setSubject] = React.useState('');
  const [category, setCategory] = React.useState('technical');
  const [message, setMessage] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);

  function submit() {
    const cleanSubject = subject.trim();
    const cleanMessage = message.trim();
    if (!cleanSubject) { showToast(i18n.t('subjectRequired'), 'danger'); return undefined; }
    if (!cleanMessage) { showToast(i18n.t('messageRequired'), 'danger'); return undefined; }
    setSubmitting(true);
    return window.TradeJournalSupportStore.createTicket({ subject: cleanSubject, category, message: cleanMessage })
      .then((ticket) => { onCreated(ticket.id); onClose(); return ticket; })
      .catch((error) => { showToast((error && error.code) || 'FAILED', 'danger'); setSubmitting(false); return undefined; });
  }

  return (
    <Modal
      title={i18n.t('newTicketAction')} icon="life-buoy" onClose={onClose} width={620}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose}>{i18n.t('cancel')}</Button>
          <Button variant="primary" icon="send" onClick={submit} disabled={submitting} style={{ marginInlineStart: 'auto' }}>{i18n.t('submitTicket')}</Button>
        </>
      )}
    >
      <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        <span style={{ font: 'var(--type-body)', fontSize: 12, color: 'var(--text-primary)' }}>{i18n.t('ticketSubjectLabel')}</span>
        <input
          type="text" value={subject} maxLength={160} dir="auto" placeholder={i18n.t('ticketSubjectPlaceholder')}
          onChange={(e) => setSubject(e.target.value)}
          style={{ height: 44, boxSizing: 'border-box', padding: '0 14px', borderRadius: 8, background: 'rgba(3,8,7,.55)', border: '1px solid var(--border-gold)', color: 'var(--text-primary)', font: 'var(--type-body)', outline: 'none' }}
        />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        <span style={{ font: 'var(--type-body)', fontSize: 12, color: 'var(--text-primary)' }}>{i18n.t('ticketCategoryLabel')}</span>
        <Select
          value={category} onChange={setCategory}
          options={CATEGORIES.map((c) => ({ value: c, label: i18n.t('category' + c.charAt(0).toUpperCase() + c.slice(1)) }))}
        />
      </label>
      <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        <span style={{ font: 'var(--type-body)', fontSize: 12, color: 'var(--text-primary)' }}>{i18n.t('ticketMessageLabel')}</span>
        <textarea
          value={message} maxLength={5000} onChange={(e) => setMessage(e.target.value)} rows={6} dir="auto"
          placeholder={i18n.t('ticketMessagePlaceholder')}
          style={{ resize: 'vertical', borderRadius: 8, padding: 14, background: 'rgba(3,8,7,.55)', border: '1px solid var(--border-gold)', color: 'var(--text-primary)', font: 'var(--type-body)', outline: 'none' }}
        />
      </label>
    </Modal>
  );
}

function TicketRow({ i18n, ticket, active }) {
  return (
    <button
      type="button" onClick={() => { location.hash = '#support/' + encodeURIComponent(ticket.id); }}
      style={{
        display: 'flex', flexDirection: 'column', gap: 6, width: '100%', padding: '12px 14px', textAlign: 'start',
        background: active ? 'var(--char-active-surface)' : 'transparent', border: 0,
        borderInlineStart: '2px solid ' + (active ? 'var(--char-accent)' : 'transparent'),
        borderBottom: '1px solid var(--border-hairline)', cursor: 'pointer', font: 'inherit', color: 'inherit'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {ticket.unread && <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--char-accent)', boxShadow: '0 0 6px var(--char-glow)', flex: 'none' }}></span>}
        <strong dir="auto" style={{ flex: 1, minWidth: 0, font: 'var(--type-body)', fontWeight: 600, color: 'var(--parchment)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ticket.subject}</strong>
        {ticket.unread && <span className="navrya-sr-only">{i18n.t('unreadLabel')}</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Chip tone="neutral">{i18n.t('category' + ticket.category.charAt(0).toUpperCase() + ticket.category.slice(1))}</Chip>
        <StatusChip i18n={i18n} status={ticket.status} />
        <span className="navrya-tabular" style={{ marginInlineStart: 'auto', font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{i18n.date(ticket.lastActivityAt)}</span>
      </div>
    </button>
  );
}

function TicketList({ i18n, tickets, activeId }) {
  return (
    <Panel variant="base" radius={12} style={{ minHeight: 560, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 16px', borderBottom: '1px solid var(--border-hairline)' }}>
        <span style={{ font: 'var(--type-section-label)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{i18n.t('ticketListLabel')}</span>
        <Chip tone="accent">{tickets.length}</Chip>
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {!tickets.length ? (
          <div style={{ padding: 16 }}><span style={{ font: 'var(--type-body)', color: 'var(--text-muted)' }}>{i18n.t('ticketsEmptyBody')}</span></div>
        ) : tickets.map((ticket) => <TicketRow key={ticket.id} i18n={i18n} ticket={ticket} active={ticket.id === activeId} />)}
      </div>
    </Panel>
  );
}

function TicketEmptyState({ i18n, onNewTicket }) {
  return (
    <Panel variant="base" radius={12} style={{ minHeight: 560, display: 'grid', placeItems: 'center', padding: 40 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, maxWidth: 360, textAlign: 'center' }}>
        <Icon name="life-buoy" size={32} style={{ color: 'var(--char-accent)' }} />
        <h2 style={{ margin: 0, font: 'var(--type-display-md)', fontSize: 18, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--parchment)' }}>{i18n.t('ticketsEmptyTitle')}</h2>
        <p style={{ margin: 0, font: 'var(--type-body)', color: 'var(--text-muted)' }}>{i18n.t('ticketsEmptyBody')}</p>
        <Button variant="primary" icon="plus" onClick={onNewTicket}>{i18n.t('newTicketAction')}</Button>
      </div>
    </Panel>
  );
}

function MessageBubble({ i18n, message, mine }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start', gap: 4, maxWidth: '78%', alignSelf: mine ? 'flex-end' : 'flex-start' }}>
      <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{mine ? i18n.t('youLabel') : (message.authorRole === 'staff' ? i18n.t('staffLabel') : message.authorName || '—')}</span>
      <div
        dir="auto"
        style={{
          padding: '12px 14px', borderRadius: 8, font: 'var(--type-body)', color: mine ? 'var(--char-accent)' : 'var(--text-primary)',
          background: mine ? 'var(--char-active-surface)' : 'rgba(3,8,7,.45)',
          border: '1px solid ' + (mine ? 'color-mix(in srgb, var(--char-accent) 55%, transparent)' : 'var(--border-hairline)')
        }}
      >{message.content}</div>
      <span className="navrya-tabular" style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{i18n.date(message.createdAt)}</span>
    </div>
  );
}

// Error/loading/permission-safe states: `state` is 'loading' | { error } | { ticket, messages }.
function TicketConversationPanel({ i18n, ticketId, reloadKey, onChanged }) {
  const [state, setState] = React.useState('loading');
  const [draft, setDraft] = React.useState('');
  const [sending, setSending] = React.useState(false);

  function load() {
    setState('loading');
    window.TradeJournalSupportStore.getTicket(ticketId)
      .then((data) => { setState(data); onChanged(); })
      .catch((error) => setState({ error }));
  }
  React.useEffect(() => { load(); }, [ticketId, reloadKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (state === 'loading') return <Panel variant="base" radius={12} style={{ minHeight: 560, display: 'grid', placeItems: 'center' }}><span style={{ font: 'var(--type-body)', color: 'var(--text-muted)' }}>{i18n.t('loading')}</span></Panel>;
  if (state.error) {
    const notFoundOrDenied = state.error.status === 404 || state.error.status === 403;
    return (
      <Panel variant="base" radius={12} style={{ minHeight: 560, display: 'grid', placeItems: 'center', padding: 40 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
          <p style={{ margin: 0, font: 'var(--type-body)', color: 'var(--text-muted)' }}>{notFoundOrDenied ? i18n.t('ticketsEmptyBody') : i18n.t('errorGeneric')}</p>
          {!notFoundOrDenied && <Button variant="secondary" onClick={load}>{i18n.t('retry')}</Button>}
        </div>
      </Panel>
    );
  }

  const { ticket, messages } = state;
  const canReply = ticket.status !== 'closed';

  function send() {
    const value = draft.trim();
    if (!value) return undefined;
    setSending(true);
    return window.TradeJournalSupportStore.replyToTicket(ticketId, value)
      .then(() => { setDraft(''); setSending(false); load(); })
      .catch((error) => { showToast((error && error.code) || 'FAILED', 'danger'); setSending(false); });
  }

  function close() {
    if (!window.confirm(i18n.t('closeTicketConfirm'))) return;
    window.TradeJournalSupportStore.closeTicket(ticketId).then(load).catch((error) => showToast((error && error.code) || 'FAILED', 'danger'));
  }

  return (
    <Panel variant="base" radius={12} style={{ minHeight: 560, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderBottom: '1px solid var(--border-hairline)', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <strong dir="auto" style={{ display: 'block', font: 'var(--type-username)', color: 'var(--parchment)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ticket.subject}</strong>
          <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{i18n.t('createdAtLabel', { date: i18n.date(ticket.createdAt) })}</span>
        </div>
        <Chip tone="neutral">{i18n.t('category' + ticket.category.charAt(0).toUpperCase() + ticket.category.slice(1))}</Chip>
        <StatusChip i18n={i18n} status={ticket.status} />
        {ticket.status !== 'closed' && <Button variant="ghost" icon="x-circle" onClick={close}>{i18n.t('closeTicketAction')}</Button>}
      </div>
      <div className="navrya-scroll" style={{ flex: 1, maxHeight: 400, overflowY: 'auto', padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {messages.map((m) => <MessageBubble key={m.id} i18n={i18n} message={m} mine={m.authorId === currentUserId()} />)}
      </div>
      {canReply ? (
        <div style={{ display: 'flex', gap: 10, padding: '14px 16px', borderTop: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.35)' }}>
          <input
            type="text" value={draft} maxLength={5000} onChange={(e) => setDraft(e.target.value)} placeholder={i18n.t('replyPlaceholder')} dir="auto"
            onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
            style={{ flex: 1, height: 44, boxSizing: 'border-box', padding: '0 14px', borderRadius: 8, background: 'rgba(3,8,7,.55)', border: '1px solid var(--border-gold)', color: 'var(--text-primary)', font: 'var(--type-body)', outline: 'none' }}
          />
          <Button variant="primary" icon="send" onClick={send} disabled={sending}>{i18n.t('replySend')}</Button>
        </div>
      ) : (
        <div style={{ padding: '14px 16px', borderTop: '1px solid var(--border-hairline)' }}>
          <Notice>{i18n.t('ticketClosedNotice')}</Notice>
        </div>
      )}
    </Panel>
  );
}

function SupportShell({ i18n, ticketId }) {
  const rtl = i18n.direction() === 'rtl';
  const [tickets, setTickets] = React.useState(null);
  const [ticketsError, setTicketsError] = React.useState(null);
  const [newTicketOpen, setNewTicketOpen] = React.useState(false);
  const [reloadKey, setReloadKey] = React.useState(0);

  function loadList() {
    window.TradeJournalSupportStore.listTickets().then((data) => { setTickets(data); setTicketsError(null); }).catch((error) => setTicketsError(error));
  }
  React.useEffect(() => { loadList(); }, [ticketId, reloadKey]); // eslint-disable-line react-hooks/exhaustive-deps

  function afterCreated(newId) { setReloadKey((k) => k + 1); location.hash = '#support/' + encodeURIComponent(newId); }
  function onConversationChanged() { loadList(); } // reply/close/open-mark-read all shift list order/unread state

  return (
    <div className="navrya-support-view" dir={rtl ? 'rtl' : 'ltr'} style={{ direction: rtl ? 'rtl' : 'ltr', display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: '0 0 4px', font: 'var(--type-display-lg)', fontSize: 22, lineHeight: '28px', letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--parchment)' }}>{i18n.t('supportTitle')}</h1>
          <p style={{ margin: 0, font: 'var(--type-body)', color: 'var(--text-muted)', maxWidth: 660 }}>{i18n.t('supportHint')}</p>
        </div>
        <Button variant="primary" icon="plus" onClick={() => setNewTicketOpen(true)}>{i18n.t('newTicketAction')}</Button>
      </div>
      {ticketsError ? (
        <Panel variant="base" radius={12} style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
          <span style={{ font: 'var(--type-body)', color: 'var(--text-muted)' }}>{i18n.t('errorGeneric')}</span>
          <Button variant="secondary" onClick={loadList}>{i18n.t('retry')}</Button>
        </Panel>
      ) : tickets === null ? (
        <Panel variant="base" radius={12} style={{ minHeight: 560, display: 'grid', placeItems: 'center' }}><span style={{ font: 'var(--type-body)', color: 'var(--text-muted)' }}>{i18n.t('loading')}</span></Panel>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '320px minmax(0,1fr)', gap: 16 }}>
          <TicketList i18n={i18n} tickets={tickets} activeId={ticketId} />
          {ticketId ? (
            <TicketConversationPanel i18n={i18n} ticketId={ticketId} reloadKey={reloadKey} onChanged={onConversationChanged} />
          ) : (
            <TicketEmptyState i18n={i18n} onNewTicket={() => setNewTicketOpen(true)} />
          )}
        </div>
      )}
      {newTicketOpen && <NewTicketDialog i18n={i18n} onClose={() => setNewTicketOpen(false)} onCreated={afterCreated} />}
    </div>
  );
}

// support-ui.js's renderPage(itemId) defers to this hook when present - real support-store.js
// reads/writes, only the DOM building changes (same "hook a legacy bridge defers to" convention
// as renderCommunity()).
export function renderSupport(itemId) {
  const i18n = window.TradeJournalSupportI18n;
  const container = document.createElement('div');
  container.className = 'panel-page tj-support-page';
  container.dataset.character = currentNavryaCharacter();
  createRoot(container).render(<SupportShell i18n={i18n} ticketId={itemId} />);
  return container;
}
