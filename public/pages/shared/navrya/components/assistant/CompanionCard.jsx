import React from 'react';
import { Icon } from '../core/Icon.jsx';
import { ActionRow, MiniButton } from './ChatResponsePopover.jsx';

// Journey G (AI Companion & Journey Orchestration). A compact card in the same glass-card visual
// language ConversationHistoryDropdown/ChatResponsePopover already use (chatDockView.jsx) -
// deliberately NOT a second chat surface, a toast, or a modal: it renders inline, above the
// ChatDock's input bar, only while nothing else (a reply popover, the history dropdown, Therapist
// Mode, an active Voice session) is showing - see chatDockView.jsx's own gating. `card` is
// whatever window.TradeJournalAICompanionOrchestrator.currentCard() returned: either the one-time
// `kind:'welcome'` first-run card (§16) or a `kind:'step'` card reflecting the live
// ai-journey-engine.js nextBestStep() (§12/§17).
export function CompanionCard({ card, i18n, onContinue, onExplain, onLater, onSkip, onStart, onWhatIs, onWelcomeLater }) {
  if (!card) return null;
  // NAVRYA chat dock redesign: matches ChatResponsePopover.jsx's own new panel treatment (same
  // background/border/glow VoiceConsole.jsx already established) instead of the old translucent
  // frosted-glass card - both surfaces render into the same ChatDock `children` slot, so they must
  // read as one consistent family rather than two different visual styles.
  const wrapperStyle = {
    width: '100%', maxWidth: 360, boxSizing: 'border-box',
    borderRadius: 'var(--radius-14)', border: '1px solid var(--border-gold-strong)',
    background: 'linear-gradient(180deg,rgba(17,27,28,.97),rgba(7,11,15,.985))',
    boxShadow: 'var(--shadow-panel),var(--glow-soft)',
    padding: 14
  };
  const titleStyle = { font: 'var(--type-body-strong)', color: 'var(--text-primary)', marginBottom: 4 };
  const whyStyle = { font: 'var(--type-caption)', color: 'var(--text-muted)', marginBottom: 10 };
  const closeButtonStyle = {
    width: 24, height: 24, borderRadius: 'var(--radius-6)', display: 'grid', placeItems: 'center', padding: 0, flex: 'none',
    background: 'transparent', border: '1px solid transparent', color: 'var(--text-muted)', cursor: 'pointer'
  };

  // A standalone close (X), separate from the ActionRow's own labeled buttons - the same
  // "obvious, discoverable dismiss affordance" pattern ChatResponsePopover's own header close
  // button already establishes (top-right corner, icon-only, no label). Wired to the exact same
  // handler as the card's own "Later" button (onWelcomeLater/onLater), never a new mechanism -
  // dismissStep()'s own dedupeKey is stable per step (ai-journey-engine.js's dedupeKeyFor()), so
  // this genuinely stops the card from ever reappearing, not merely for the current session.
  // Found necessary via real user feedback: without a corner X, the only way to make the card go
  // away for good was to already know "Later" does that - not the standard, expected affordance.
  function closeButton(onClick, label) {
    return (
      <button type="button" onClick={onClick} aria-label={label} style={closeButtonStyle}>
        <Icon name="close" size={13} />
      </button>
    );
  }

  if (card.kind === 'welcome') {
    return (
      <div style={wrapperStyle} data-companion-card="welcome">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={titleStyle}>{card.title}</div>
            <div style={whyStyle}>{card.why}</div>
          </div>
          {closeButton(onWelcomeLater, card.laterLabel)}
        </div>
        <ActionRow>
          <MiniButton kind="apply" icon="sparkles" onClick={onStart}>{card.startLabel}</MiniButton>
          <MiniButton kind="neutral" icon="info" onClick={onWhatIs}>{card.whatIsLabel}</MiniButton>
          <MiniButton kind="discard" icon="clock" onClick={onWelcomeLater}>{card.laterLabel}</MiniButton>
        </ActionRow>
      </div>
    );
  }

  return (
    <div style={wrapperStyle} data-companion-card={card.id}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: 'var(--type-caption)', color: 'var(--text-dim)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.04em' }}>{i18n.t('companionWhyLabel')}</div>
          <div style={titleStyle}>{card.title}</div>
          <div style={whyStyle}>{card.why}</div>
        </div>
        {closeButton(onLater, i18n.t('companionLater'))}
      </div>
      <ActionRow>
        <MiniButton kind="apply" icon="arrow-right" onClick={onContinue}>{i18n.t('companionContinue')}</MiniButton>
        <MiniButton kind="neutral" icon="message-circle-question" onClick={onExplain}>{i18n.t('companionExplain')}</MiniButton>
        {card.optional && <MiniButton kind="discard" icon="close" onClick={onSkip}>{i18n.t('companionSkip')}</MiniButton>}
        <MiniButton kind="discard" icon="clock" onClick={onLater}>{i18n.t('companionLater')}</MiniButton>
      </ActionRow>
    </div>
  );
}
