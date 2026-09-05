import React from 'react';
import { Panel } from '../public/pages/shared/navrya/components/core/Panel.jsx';
import { Icon } from '../public/pages/shared/navrya/components/core/Icon.jsx';
import { Button } from '../public/pages/shared/navrya/components/forms/Button.jsx';
import { Chip } from '../public/pages/shared/navrya/components/forms/Chip.jsx';
import { Notice } from '../public/pages/shared/navrya/components/feedback/Notice.jsx';

// The THERAPIST tab (Therapist.dc.html / TherapistFill.dc.html on the approved canvas).
//
// This screen builds nothing new on the storage side: mental-health-store.js already models the
// whole mechanism. A conversation turn is a MentalHealthChatMessage; anything the assistant reads
// out of what you said is a MentalHealthSuggestion carrying {path, section, value, mode, status},
// and applySuggestion() is what actually writes it into the profile at that path. Everything here
// is the missing surface for a contract the codebase already had.
//
// The one rule the design insists on, and the reason the queue exists at all: nothing reaches the
// profile without the trader saying yes to that specific field.

function SectionLabel({ children, style }) {
  return <span style={{ font: 'var(--type-section-label)', letterSpacing: 'var(--tracking-label)', color: 'var(--text-muted)', textTransform: 'uppercase', ...style }}>{children}</span>;
}
function Caption({ children, style, className }) {
  return <span className={className} style={{ font: 'var(--type-caption)', color: 'var(--text-dim)', letterSpacing: '.04em', ...style }}>{children}</span>;
}

// A suggestion points at a dotted path in the profile. Traders should never be shown
// `intake.financialContext.borrowedMoneyForTrading` - this maps the paths this screen can produce
// onto their real labels, and falls back to the raw path rather than inventing a friendly name
// for something it does not recognise.
function pathLabel(i18n, path) {
  const key = 'therapistPath_' + String(path || '').replace(/\./g, '_');
  const label = i18n.t(key);
  return label === key ? path : label;
}

function sectionLabel(i18n, section) {
  const key = 'therapistSection_' + String(section || 'other');
  const label = i18n.t(key);
  return label === key ? section : label;
}

function statusTone(status) {
  return status === 'applied' ? 'success' : status === 'rejected' ? 'neutral' : 'warning';
}

export function TherapistTab({ i18n, mhStore, profile, onChanged }) {
  const [view, setView] = React.useState('pending');
  const viewRef = React.useRef(view);
  viewRef.current = view;

  const messages = profile.chatHistory || [];
  // Suggestions live inside the messages that produced them; the queue is the flattened view,
  // newest first, because that is the order a trader reviews them in.
  const all = [];
  messages.forEach((m) => (m.suggestions || []).forEach((s) => all.push({ ...s, messageId: m.id, at: m.createdAt })));
  all.reverse();

  const counts = { pending: 0, applied: 0, rejected: 0 };
  all.forEach((s) => { const k = s.status || 'pending'; if (counts[k] != null) counts[k] += 1; });
  const queue = all.filter((s) => (s.status || 'pending') === view);

  function decide(suggestion, status) {
    mhStore.applySuggestion(mhStore.load(), suggestion, status);
    if (onChanged) onChanged();
  }
  function decideAll(status) {
    let record = mhStore.load();
    all.filter((s) => (s.status || 'pending') === 'pending').forEach((s) => { record = mhStore.applySuggestion(record, s, status); });
    if (onChanged) onChanged();
  }

  // This tab deliberately exposes only its real queue filter. Applying or rejecting a therapist
  // suggestion remains the existing explicit per-suggestion human decision; a voice command must
  // not bypass that consent boundary by inventing a bulk-approval path.
  React.useEffect(() => {
    const registry = window.TradeJournalAIProcessRegistry;
    if (!registry) return undefined;
    let mounted = true;
    registry.register('psychology-therapist-review', {
      actionId: 'psychology.therapist.review',
      allowlist: ['queueView'],
      isOpen: () => mounted,
      activeStep: () => viewRef.current,
      validateValue: (path, value) => path !== 'queueView' || ['pending', 'applied', 'rejected'].indexOf(value) !== -1,
      applyValue: (path, value) => { if (path === 'queueView') setView(value); }
    });
    return () => { mounted = false; };
  }, []);

  // Whether the dock starts in therapist mode - the same ai-settings-store.js flag
  // chatDockView.jsx seeds its own toggle from, read defensively since the psychology page can
  // render before the AI bundle has loaded on a slow connection.
  const aiSettings = window.TradeJournalAISettingsStore;
  const dockOn = !!(aiSettings && aiSettings.settings && aiSettings.settings().therapistModeDefault);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* The boundary comes first, every time - before the feature, not in a footnote. */}
      <Notice tone="warning" icon="honour">{i18n.t('therapistBoundary')}</Notice>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        {/* how it works */}
        <Panel variant="prestige" ornament texture padding="18px 20px 20px" style={{ flex: '1 1 360px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ width: 38, height: 38, flex: 'none', borderRadius: 999, border: '1px solid color-mix(in srgb, var(--char-accent) 50%, transparent)', background: 'var(--char-active-surface)', display: 'grid', placeItems: 'center', color: 'var(--char-accent)' }}>
                <Icon name="psychology" size={20} />
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1, minWidth: 0 }}>
                <span style={{ font: 'var(--type-display-md)', color: 'var(--text-primary)', letterSpacing: 'var(--tracking-display)' }}>{i18n.t('therapistTitle')}</span>
                <Caption>{i18n.t('therapistSubtitle')}</Caption>
              </div>
            </div>

            <span style={{ font: 'var(--type-body)', color: 'var(--text-muted)', textWrap: 'pretty' }}>{i18n.t('therapistHowBody')}</span>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {['therapistStep1', 'therapistStep2', 'therapistStep3'].map((key, i) => (
                <div key={key} style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
                  <span className="navrya-tabular" style={{
                    width: 22, height: 22, flex: 'none', borderRadius: 999, display: 'grid', placeItems: 'center',
                    border: '1px solid color-mix(in srgb, var(--char-accent) 45%, transparent)', background: 'rgba(3,8,7,.55)',
                    font: '600 11px/1 var(--font-display)', color: 'var(--char-accent)'
                  }}>{i18n.number(i + 1)}</span>
                  <Caption style={{ flex: 1, lineHeight: '18px' }}>{i18n.t(key)}</Caption>
                </div>
              ))}
            </div>

            <div style={{ height: 1, background: 'var(--border-hairline)' }}></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <Chip tone={dockOn ? 'accent' : 'neutral'} dot={dockOn}>{i18n.t(dockOn ? 'therapistDockOn' : 'therapistDockOff')}</Chip>
              <Caption style={{ flex: 1, minWidth: 140 }}>{i18n.t('therapistDockHint')}</Caption>
            </div>
          </div>
        </Panel>

        {/* the review queue */}
        <Panel variant="base" ornament padding="18px 20px 20px" style={{ flex: '1 1 460px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <SectionLabel>{i18n.t('therapistQueue')}</SectionLabel>
              {counts.pending > 0 && <Chip tone="warning" dot>{i18n.t('therapistPendingChip', { count: i18n.number(counts.pending) })}</Chip>}
            </div>

            <div style={{ display: 'flex', gap: 7 }}>
              {['pending', 'applied', 'rejected'].map((k) => (
                <button
                  key={k} type="button" onClick={() => setView(k)}
                  style={{ padding: 0, border: 0, background: 'transparent', cursor: 'pointer', font: 'inherit', flex: 1 }}
                >
                  <Chip tone={view === k ? 'accent' : 'neutral'} style={{ width: '100%', justifyContent: 'center' }}>
                    {i18n.t('therapistStatus_' + k)} <span className="navrya-tabular">{i18n.number(counts[k])}</span>
                  </Chip>
                </button>
              ))}
            </div>

            {queue.length === 0 && (
              <Caption style={{ lineHeight: '18px' }}>
                {all.length === 0 ? i18n.t('therapistQueueEmptyEver') : i18n.t('therapistQueueEmpty_' + view)}
              </Caption>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {queue.map((s) => {
                const pending = (s.status || 'pending') === 'pending';
                return (
                  <div key={s.id} style={{
                    display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 15px', borderRadius: 8,
                    border: '1px solid ' + (pending ? 'rgba(255,176,32,.35)' : s.status === 'applied' ? 'rgba(46,204,113,.3)' : 'var(--border-hairline)'),
                    background: pending ? 'rgba(255,176,32,.05)' : s.status === 'applied' ? 'rgba(46,204,113,.05)' : 'rgba(11,16,22,.4)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                      <span style={{ flex: 1, minWidth: 0, font: 'var(--type-body)', fontSize: 12, color: 'var(--text-primary)' }}>{pathLabel(i18n, s.path)}</span>
                      <Chip tone="neutral" style={{ height: 20, fontSize: 10, flex: 'none' }}>{i18n.t('therapistMode_' + (s.mode || 'replace'))}</Chip>
                      {s.section && <Chip tone="neutral" style={{ height: 20, fontSize: 10, flex: 'none' }}>{sectionLabel(i18n, s.section)}</Chip>}
                    </div>

                    <span style={{ font: 'var(--type-body)', color: 'var(--text-muted)', textWrap: 'pretty' }}>
                      {typeof s.value === 'boolean' ? i18n.t(s.value ? 'yes' : 'no') : String(s.value == null ? '—' : s.value)}
                    </span>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <Caption style={{ flex: 1, minWidth: 100, fontFamily: 'var(--font-display)', fontSize: 10, color: 'var(--text-disabled)' }}>{s.path}</Caption>
                      {pending ? (
                        <React.Fragment>
                          <Button variant="ghost" size="sm" onClick={() => decide(s, 'rejected')}>{i18n.t('therapistReject')}</Button>
                          <Button variant="primary" size="sm" icon="check" onClick={() => decide(s, 'applied')}>{i18n.t('therapistApply')}</Button>
                        </React.Fragment>
                      ) : <Chip tone={statusTone(s.status)} style={{ flex: 'none' }}>{i18n.t('therapistStatus_' + s.status)}</Chip>}
                    </div>
                  </div>
                );
              })}
            </div>

            {counts.pending > 0 && (
              <React.Fragment>
                <div style={{ height: 1, background: 'var(--border-hairline)' }}></div>
                <div style={{ display: 'flex', gap: 9 }}>
                  <Button variant="secondary" size="sm" style={{ flex: 1 }} onClick={() => decideAll('rejected')}>{i18n.t('therapistRejectAll')}</Button>
                  <Button variant="primary" size="sm" icon="check" style={{ flex: 1 }} onClick={() => decideAll('applied')}>{i18n.t('therapistApplyAll')}</Button>
                </div>
              </React.Fragment>
            )}
          </div>
        </Panel>
      </div>

      {/* the conversation itself */}
      <Panel variant="base" ornament padding="18px 20px 20px">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <SectionLabel>{i18n.t('therapistHistory')}</SectionLabel>
            <Chip tone="neutral">{i18n.t('therapistTurns', { count: i18n.number(messages.length) })}</Chip>
            <Caption style={{ marginInlineStart: 'auto' }}>{i18n.t('therapistHistoryHint')}</Caption>
          </div>

          {messages.length === 0 ? (
            <Caption style={{ lineHeight: '18px' }}>{i18n.t('therapistHistoryEmpty')}</Caption>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
              {messages.slice(-12).map((m) => {
                const mine = m.role === 'user';
                return (
                  <div key={m.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11, flexDirection: mine ? 'row-reverse' : 'row' }}>
                      <span style={{
                        width: 28, height: 28, flex: 'none', borderRadius: 999, display: 'grid', placeItems: 'center',
                        border: '1px solid ' + (mine ? 'var(--border-hairline)' : 'color-mix(in srgb, var(--char-accent) 50%, transparent)'),
                        background: mine ? 'rgba(3,8,7,.6)' : 'var(--char-active-surface)',
                        color: mine ? 'var(--text-muted)' : 'var(--char-accent)'
                      }}><Icon name={mine ? 'sessions' : 'psychology'} size={15} /></span>
                      <div style={{
                        maxWidth: '78%', padding: '13px 15px', borderRadius: mine ? '12px 4px 12px 12px' : '4px 12px 12px 12px',
                        border: '1px solid ' + (mine ? 'var(--border-hairline)' : 'color-mix(in srgb, var(--char-accent) 32%, transparent)'),
                        background: mine ? 'rgba(11,16,22,.5)' : 'color-mix(in srgb, var(--char-active-surface) 55%, transparent)'
                      }}>
                        <span style={{ display: 'block', font: 'var(--type-body)', color: mine ? 'var(--text-muted)' : 'var(--text-primary)', textWrap: 'pretty' }}>{m.content}</span>
                      </div>
                    </div>
                    {(m.suggestions || []).length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginInlineStart: 39 }}>
                        {m.suggestions.map((s) => (
                          <Chip key={s.id} tone={statusTone(s.status)}>{pathLabel(i18n, s.path)}</Chip>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}
