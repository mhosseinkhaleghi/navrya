import React from 'react';
import { useAssistantMotion } from './motion.js';
import { DockButton, Waveform } from './DockButton.jsx';
import { ModelSwitcher, ModelMascot } from './ModelSwitcher.jsx';

/* Bottom-centre command bar: add, one line of intent, mic, send. Always fixed to the viewport -
   this is the single global assistant entry point for every character dashboard, not a
   per-panel widget. `children` renders above the bar (the reply popover) so the whole thing
   pops as one composition. Tints itself off `--char-accent`/`--char-glow`, so it must be
   mounted under a `data-character="..."` ancestor (see chatDockView.jsx) to pick up that
   character's colour rather than the default gold. */
export function ChatDock({
  placeholder = 'Ask anything',
  listeningPlaceholder = 'Listening…',
  value, onValueChange, onSubmit, onAdd, addLabel, addActive,
  onNewChat, newChatLabel, onHistory, historyLabel, historyActive,
  onToggleTherapist, therapistActive, therapistLabel,
  listening = false, onMic, micLabel, stopListeningLabel,
  busy = false, width = 680, hint,
  models, model, onModelChange, mascot = true, children,
  dir = 'ltr',
  sendLabel = 'Send', voiceLabel = 'Voice mode',
  style, ...rest
}) {
  useAssistantMotion();
  const [focused, setFocused] = React.useState(false);
  const text = value || '';
  const ready = !!text.trim() && !busy;

  const submit = () => {
    if (!ready) return;
    if (onSubmit) onSubmit(text.trim());
  };

  const list = models && models.length ? models : null;
  const active = list ? (list.find((m) => m.id === model) || list[0]) : null;
  const withMascot = !!(active && mascot);

  return (
    <div
      data-navrya-assistant="dock" dir={dir}
      style={{
        position: 'fixed', left: 16, right: 16, bottom: 24, margin: '0 auto', zIndex: 70,
        maxWidth: width + (withMascot ? 66 : 0),
        display: 'flex', alignItems: 'flex-end', gap: 14, ...style
      }}
      {...rest}
    >
      {withMascot && <ModelMascot model={active} size={52} style={{ flex: 'none', paddingBottom: 2 }} />}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 12 }}>
        {children}
        <div
          data-navrya-chat-dock=""
          style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px 9px 12px', boxSizing: 'border-box',
          borderRadius: 'var(--radius-pill)',
          border: '1px solid ' + (focused ? 'var(--border-gold-strong)' : 'var(--border-gold)'),
          background: 'linear-gradient(180deg,color-mix(in srgb,var(--char-active-surface) 46%,rgba(17,27,28,.94)),color-mix(in srgb,var(--char-active-surface) 26%,rgba(7,11,15,.96)))',
          backdropFilter: 'blur(12px)',
          boxShadow: focused
            ? 'var(--shadow-panel),var(--glow-soft),var(--shadow-inset-hairline)'
            : 'var(--shadow-panel),var(--shadow-inset-hairline)',
          transition: 'border-color 200ms var(--ease-out),box-shadow 200ms var(--ease-out),background 200ms var(--ease-out)'
        }}>
          <DockButton icon="plus" label={addLabel} active={addActive} onClick={onAdd} />
          {onNewChat && <DockButton icon="square-pen" label={newChatLabel} onClick={onNewChat} />}
          {onHistory && <DockButton icon="history" label={historyLabel} active={historyActive} onClick={onHistory} />}
          {list && (
            <React.Fragment>
              <span aria-hidden="true" style={{ width: 1, height: 22, flex: 'none', background: 'var(--border-hairline)' }} />
              <ModelSwitcher models={list} value={active.id} onChange={onModelChange} />
              <span aria-hidden="true" style={{ width: 1, height: 22, flex: 'none', background: 'var(--border-hairline)' }} />
            </React.Fragment>
          )}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            {listening && <Waveform />}
            <input
              type="text" value={text} placeholder={listening ? listeningPlaceholder : placeholder}
              onChange={(e) => onValueChange && onValueChange(e.target.value)}
              onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } }}
              aria-label={placeholder} disabled={busy}
              style={{
                width: '100%', minWidth: 0, border: 0, background: 'transparent', padding: 0,
                font: 'var(--type-body)', color: 'var(--text-primary)', caretColor: 'var(--char-accent)'
              }}
            />
          </div>
          {hint && (
            <span style={{
              font: 'var(--type-caption)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase',
              color: 'var(--text-muted)', whiteSpace: 'nowrap', flex: 'none'
            }}>{hint}</span>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 'none' }}>
            {onToggleTherapist && (
              <DockButton icon="psychology" label={therapistLabel} active={therapistActive} onClick={onToggleTherapist} />
            )}
            {onMic && (
              <DockButton icon="mic" label={listening ? stopListeningLabel : micLabel} active={listening} onClick={onMic} />
            )}
            <DockButton
              icon={ready ? 'arrow-up' : 'waveform'} tone="primary" disabled={!ready}
              label={ready ? sendLabel : voiceLabel} onClick={submit}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
