import React from 'react';
import { Button } from '../forms/Button.jsx';

/* Message-bubble thread + composer - used by Pattern Registry/Strategy Education chat and
   Community Messages. `messages`: [{id, author, text, mine, at}]. Purely presentational and
   controlled - the caller owns the real message list and send handler, same as every other
   NAVRYA form primitive in this app. `renderActions(message)` is an optional per-bubble side
   slot (e.g. Community Messages' report-abuse control on incoming messages); `renderExtra(message)`
   is an optional block rendered inside the bubble below the text (e.g. Pattern Registry/Strategy
   Education's "apply suggested stages" action on an assistant reply). Both omitted by every
   caller that doesn't need them, so existing chat usages are unaffected. */
export function ChatThread({ messages = [], onSend, renderActions, renderExtra, placeholder = 'Write a message...', sendLabel = 'Send', style, ...rest }) {
  const [draft, setDraft] = React.useState('');
  const listRef = React.useRef(null);
  React.useEffect(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; }, [messages.length]);

  function send() {
    const text = draft.trim();
    if (!text) return;
    if (onSend) onSend(text);
    setDraft('');
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, ...style }} {...rest}>
      <div ref={listRef} className="navrya-scroll" style={{
        display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 360, overflowY: 'auto',
        padding: 4
      }}>
        {messages.map((m) => (
          <div key={m.id} style={{ display: 'flex', alignItems: 'flex-end', gap: 6, justifyContent: m.mine ? 'flex-end' : 'flex-start' }}>
            {m.mine && renderActions && <span style={{ flex: 'none' }}>{renderActions(m)}</span>}
            <div style={{
              maxWidth: '78%', padding: '9px 13px', borderRadius: 12,
              background: m.mine ? 'color-mix(in srgb, var(--char-accent) 18%, var(--surface-card))' : 'var(--surface-card)',
              border: '1px solid ' + (m.mine ? 'color-mix(in srgb, var(--char-accent) 45%, transparent)' : 'var(--border-hairline)'),
              color: 'var(--text-primary)'
            }}>
              {m.author && <div style={{ font: 'var(--type-caption)', color: 'var(--char-accent)', marginBottom: 2 }}>{m.author}</div>}
              <div style={{ font: 'var(--type-body)', whiteSpace: 'pre-wrap' }}>{m.text}</div>
              {m.at && <div style={{ font: 'var(--type-caption)', color: 'var(--text-muted)', marginTop: 4 }}>{m.at}</div>}
              {renderExtra && renderExtra(m)}
            </div>
            {!m.mine && renderActions && <span style={{ flex: 'none' }}>{renderActions(m)}</span>}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <textarea
          value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={placeholder} rows={2}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          style={{
            flex: 1, minWidth: 0, resize: 'vertical', borderRadius: 8, padding: '9px 12px',
            background: 'rgba(11,20,21,.72)', border: '1px solid var(--border-gold)', color: 'var(--text-primary)',
            font: 'var(--type-body)', outline: 'none'
          }}
        />
        <Button variant="primary" onClick={send} style={{ alignSelf: 'flex-end' }}>{sendLabel}</Button>
      </div>
    </div>
  );
}
