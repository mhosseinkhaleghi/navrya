import React from 'react';
import { Icon } from '../core/Icon.jsx';
import { useAssistantMotion } from './motion.js';

function Dots() {
  return (
    <span aria-hidden="true" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      {[0, 1, 2].map((i) => (
        <span key={i} style={{
          width: 5, height: 5, borderRadius: '50%', background: 'var(--char-accent)',
          animation: `navrya-dot 1150ms var(--ease-standard) ${i * 140}ms infinite`
        }} />
      ))}
    </span>
  );
}

/* mental-health-safety.js's renderSafetyCard() returns a real DOM node (not JSX) - it is the
   one shared, tested safety-gate surface every chat/thought-record/intake entry point in this
   app already reuses, so it is embedded as-is here rather than re-implemented in JSX. */
function SafetyCardHost({ node }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const host = ref.current;
    if (!host || !node) return undefined;
    host.appendChild(node);
    return () => { if (host.contains(node)) host.removeChild(node); };
  }, [node]);
  return <div ref={ref} />;
}

function ActionRow({ children }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 2 }}>{children}</div>;
}

function actionButtonStyle(kind) {
  return kind === 'apply'
    ? { border: '1px solid transparent', background: 'var(--char-accent)', color: 'var(--ink-950)', fontWeight: 600 }
    : { border: '1px solid var(--border-gold)', background: 'transparent', color: 'var(--text-muted)', fontWeight: 500 };
}

function MiniButton({ kind, icon, children, onClick }) {
  return (
    <button
      type="button" onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, height: 30, padding: '0 12px',
        borderRadius: 'var(--radius-6)', font: 'var(--type-caption)', cursor: 'pointer',
        transition: 'filter 160ms var(--ease-out)', ...actionButtonStyle(kind)
      }}
    >
      {icon && <Icon name={icon} size={13} />}{children}
    </button>
  );
}

/* Soft reply surface that rises above the ChatDock. Lines reveal in sequence so the answer
   reads as it lands rather than appearing as a wall. Beyond the original design's plain
   answer/thinking states, `state` also covers 'safety' (mental-health's flagged-message gate)
   and 'review' (screenshot -> trade-field extraction) so every reply the old global-ai-dock
   produced still has a home here. */
export function ChatResponsePopover({
  open = false,
  state = 'answer',
  title = 'NAVRYA Assistant',
  prompt,
  lines = [],
  meta = [],
  thinkingLabel,
  safetyNode,
  suggestions = [],
  suggestionLabels,
  onApplySuggestion,
  onDiscardSuggestion,
  reviewFields = [],
  reviewEmptyLabel,
  reviewActions,
  onClose,
  width = 680,
  style, ...rest
}) {
  useAssistantMotion();
  const [mounted, setMounted] = React.useState(open);
  const [leaving, setLeaving] = React.useState(false);

  React.useEffect(() => {
    if (open) { setLeaving(false); setMounted(true); return undefined; }
    if (!mounted) return undefined;
    setLeaving(true);
    const t = setTimeout(() => { setMounted(false); setLeaving(false); }, 180);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!mounted) return null;
  const thinking = state === 'thinking';
  const safety = state === 'safety';
  const review = state === 'review';

  return (
    <div
      data-navrya-assistant="response" role="status" aria-live="polite"
      style={{
        width: '100%', maxWidth: width, boxSizing: 'border-box', overflow: 'hidden',
        borderRadius: 'var(--radius-14)', border: '1px solid rgba(244,234,215,.14)',
        background: 'linear-gradient(180deg,rgba(244,234,215,.10),rgba(244,234,215,.035))',
        backdropFilter: 'blur(26px) saturate(150%)', WebkitBackdropFilter: 'blur(26px) saturate(150%)',
        boxShadow: 'var(--shadow-panel),inset 0 1px 0 rgba(255,255,255,.16),inset 0 0 0 1px rgba(183,138,74,.18)',
        animation: `${leaving ? 'navrya-pop-out 170ms var(--ease-standard)' : 'navrya-pop-in 260ms var(--ease-out)'} both`,
        transformOrigin: 'bottom center',
        ...style
      }}
      {...rest}
    >
      <header style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px 11px 14px',
        borderBottom: '1px solid rgba(244,234,215,.10)'
      }}>
        <span style={{
          width: 26, height: 26, borderRadius: 'var(--radius-8)', display: 'grid', placeItems: 'center', flex: 'none',
          color: 'var(--char-accent)', background: 'var(--char-active-surface)',
          border: '1px solid color-mix(in srgb, var(--char-accent) 55%, transparent)',
          animation: thinking ? 'navrya-halo 1400ms var(--ease-standard) infinite' : 'none'
        }}><Icon name="sparkle" size={15} /></span>
        <span style={{
          flex: 1, minWidth: 0, font: 'var(--type-caption)', letterSpacing: 'var(--tracking-label)',
          textTransform: 'uppercase', color: 'var(--text-muted)', whiteSpace: 'nowrap',
          overflow: 'hidden', textOverflow: 'ellipsis'
        }}>{title}</span>
        {onClose && (
          <button
            type="button" onClick={onClose} aria-label="Dismiss reply"
            style={{
              width: 26, height: 26, borderRadius: 'var(--radius-6)', display: 'grid', placeItems: 'center', padding: 0,
              background: 'transparent', border: '1px solid transparent', color: 'var(--text-muted)', cursor: 'pointer'
            }}
          ><Icon name="close" size={14} /></button>
        )}
      </header>

      <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {prompt && (
          <div style={{
            font: 'var(--type-caption)', color: 'var(--text-muted)', paddingLeft: 10,
            borderLeft: '2px solid var(--divider-gold)', textWrap: 'pretty'
          }}>{prompt}</div>
        )}

        {thinking && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, font: 'var(--type-body)', color: 'var(--text-muted)' }}>
            <Dots /><span>{thinkingLabel}{'…'}</span>
          </div>
        )}

        {safety && <SafetyCardHost node={safetyNode} />}

        {review && (
          reviewFields.length
            ? (
              <React.Fragment>
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4, font: 'var(--type-body)' }}>
                  {reviewFields.map((f, i) => (
                    <li key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, color: 'var(--text-primary)' }}>
                      <span style={{ color: 'var(--text-muted)' }}>{f.label}</span><span>{f.value}</span>
                    </li>
                  ))}
                </ul>
                {reviewActions}
              </React.Fragment>
            )
            : <p style={{ margin: 0, font: 'var(--type-body)', color: 'var(--text-muted)' }}>{reviewEmptyLabel}</p>
        )}

        {!thinking && !safety && !review && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {lines.map((line, i) => (
              <p key={i} style={{
                margin: 0, font: 'var(--type-body)', color: i === 0 ? 'var(--text-primary)' : 'var(--text-muted)',
                textWrap: 'pretty',
                animation: `navrya-line-in 320ms var(--ease-out) ${90 + i * 70}ms both`
              }}>{line}</p>
            ))}
          </div>
        )}

        {!thinking && !safety && !review && meta.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {meta.map((m, i) => (
              <span key={i} style={{
                font: 'var(--type-caption)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase',
                color: 'var(--text-muted)', padding: '4px 9px', borderRadius: 'var(--radius-pill)',
                border: '1px solid rgba(244,234,215,.10)', background: 'rgba(244,234,215,.05)'
              }}>{m}</span>
            ))}
          </div>
        )}

        {!thinking && !safety && !review && suggestions.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {suggestions.map((s) => (
              <div key={s.id} style={{
                display: 'flex', flexDirection: 'column', gap: 6, padding: 10,
                borderRadius: 'var(--radius-8)', border: '1px solid rgba(244,234,215,.10)', background: 'rgba(244,234,215,.04)'
              }}>
                <small style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{s.path}</small>
                <span style={{ font: 'var(--type-body)', color: 'var(--text-primary)' }}>{String(s.value)}</span>
                <ActionRow>
                  <MiniButton kind="apply" icon="check" onClick={() => onApplySuggestion && onApplySuggestion(s)}>{suggestionLabels && suggestionLabels.apply}</MiniButton>
                  <MiniButton kind="discard" icon="close" onClick={() => onDiscardSuggestion && onDiscardSuggestion(s)}>{suggestionLabels && suggestionLabels.discard}</MiniButton>
                </ActionRow>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export { MiniButton, ActionRow };
