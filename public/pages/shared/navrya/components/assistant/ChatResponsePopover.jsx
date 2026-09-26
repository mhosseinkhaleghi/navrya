import React from 'react';
import { Icon } from '../core/Icon.jsx';
import { useAssistantMotion } from './motion.js';
import { ModelGlyph } from './ModelSwitcher.jsx';
import { CompanionSigil, EngineChip } from './CompanionSigil.jsx';
import { DockMenu } from './DockMenu.jsx';
import { CapsuleTop } from './CapsuleTop.jsx';
import { DockLayoutContext } from './dockLayout.js';
import {
  accent, cardBackground, cardShadow, cardRadius, EDGE, TEXT, TEXT_SOFT, TEXT_RECEIPT, MUTED, DIM, TIME, GOLD, GREEN, DIVIDER,
  HAIRLINE_STRONG, pillStyle, choiceStyle
} from './dockDesign.js';

/* The conversation surface above the ChatDock composer (ChatDock capsule design, plate III shapes 2'
   and 3), in two shapes of the same card:

   - PEEK: a fresh reply in two lines with its receipt and quick choices, folded away by the dock
     after a few seconds of inattention (dockShape.js). Also what a reply looks like under an open
     dialog, where only a short band is free.
   - SCROLL ("the scroll"): the whole conversation, only when the user opens it: the companion's
     header (portrait, name, the engine as a chip that opens the engine menu, a status line, and
     history / pin to the side / collapse / close), then the messages - each assistant turn with its
     receipt (and an undo when the action can be undone) and, on the last one, the feedback row.

   Every existing prop/behavior this component's callers (chatDockView.jsx) depend on is unchanged -
   'thinking'/'safety'/'review'/'answer' states, `messages` vs `lines`, suggestions, review fields/
   actions, onClose - this is a visual + structural redesign of the SAME contract, not a new
   component. `joined` squares the bottom corners so the card sits flush on the ChatDock row. See the
   inline comments for the handful of deliberate, honest adaptations from the design (no fabricated
   "seen" receipts; Copy/Regenerate/Undo are wired for real, or not shown). */

// One ceiling for the thread, content-sized below it (a short reply stays short). The whole card
// (header + thread + composer) stays under 60% of the viewport height, the design's rule.
const THREAD_MAX_HEIGHT = 'calc(60vh - 150px)';

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
  return <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 2, flexWrap: 'wrap' }}>{children}</div>;
}

// Found via real testing (production repair follow-up): the richer, higher-verbosity system
// prompt (server/pattern-ai-server.mjs) reliably produces real '\n' paragraph/list breaks and
// occasional '**bold**'/leading '#' markdown - this app has no markdown renderer anywhere, and a
// bare <p> tag's default `white-space: normal` collapses every '\n' into a single space, so a
// genuinely well-structured reply rendered as one dense run-on sentence with stray asterisks and
// dashes crammed together. `whiteSpace: 'pre-line'` on the paragraph (below) is the other half of
// this fix - it makes '\n' a real line break again without needing a markdown parser; this
// function strips the handful of markdown TOKENS that would otherwise show up literally (a stray
// '**'/'__'/leading '#'), it does not attempt to parse markdown structure.
function stripMarkdownTokens(text) {
  return String(text || '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/^#{1,6}\s+/gm, '');
}

function actionButtonStyle(kind) {
  return kind === 'apply'
    ? { border: '1px solid transparent', background: 'var(--char-accent)', color: 'var(--char-on-accent)', fontWeight: 600 }
    : { border: '1px solid var(--border-gold)', background: 'transparent', color: 'var(--text-muted)', fontWeight: 500 };
}

// `iconOnly`: the compact 30px icon form the reply's own action row uses (copy / regenerate /
// feedback) - `label` becomes its accessible name and tooltip, and `active` marks an open menu
// trigger. Every existing caller keeps the labelled pill form.
function MiniButton({ kind, icon, children, onClick, iconOnly = false, label, active = false, ...rest }) {
  if (iconOnly) {
    return (
      <button
        type="button" onClick={onClick} aria-label={label} title={label} {...rest}
        style={{
          width: 30, height: 30, flex: 'none', display: 'grid', placeItems: 'center', padding: 0,
          borderRadius: 10, cursor: 'pointer',
          border: '1px solid ' + (active ? accent(50) : 'transparent'),
          background: active ? 'var(--char-active-surface)' : 'transparent',
          color: active ? 'var(--char-accent)' : MUTED,
          transition: 'color 160ms var(--ease-out),background 160ms var(--ease-out)'
        }}
      >
        {icon && <Icon name={icon} size={14} />}
      </button>
    );
  }
  return (
    <button
      type="button" onClick={onClick} {...rest}
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

/* Copy is wired for real (navigator.clipboard) - a design affordance this codebase's own "no
   decoy buttons" rule (see VoiceConsole.jsx's header comment) means it must actually do something,
   not just look clickable. Local, self-contained "Copied" flash - no store/prop plumbing needed
   for something this small. */
function CopyButton({ text, label, copiedLabel, iconOnly = false }) {
  const [copied, setCopied] = React.useState(false);
  const timerRef = React.useRef(null);
  React.useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);
  function onCopy() {
    if (!navigator.clipboard || !navigator.clipboard.writeText) return;
    navigator.clipboard.writeText(String(text || '')).then(() => {
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 1600);
    }).catch(() => {});
  }
  if (iconOnly) return <MiniButton iconOnly icon={copied ? 'check' : 'copy'} label={copied ? copiedLabel : label} onClick={onCopy} />;
  return <MiniButton kind="discard" icon={copied ? 'check' : 'copy'} onClick={onCopy}>{copied ? copiedLabel : label}</MiniButton>;
}

/* What the turn actually applied, as one small receipt line each ("✓ I went to Dashboard", "✓
   Platform / broker MetaTrader 5") instead of an uppercase stat grid of raw paths. The human wording
   comes from chatDockView.jsx (chatDockReceipts.js) - this only renders it. `undo` ({ label, run })
   adds the design's "Undo" beside the receipt, only when the action really can be undone. */
function ReceiptChip({ label, value, undo }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 34, paddingInlineStart: 4, paddingInlineEnd: 12, paddingBlock: 3, boxSizing: 'border-box',
      borderRadius: 999, border: '1px solid rgba(183,138,74,.36)', background: 'rgba(183,138,74,.07)',
      font: 'var(--type-caption)', fontSize: 12.5, color: TEXT_RECEIPT, maxWidth: '100%'
    }}>
      <span aria-hidden="true" style={{ width: 20, height: 20, flex: 'none', borderRadius: 999, display: 'grid', placeItems: 'center', background: 'rgba(46,204,113,.14)', color: GREEN }}>
        <Icon name="check" size={12} strokeWidth={2.4} />
      </span>
      {label && <span style={{ color: MUTED, whiteSpace: 'nowrap' }}>{label}</span>}
      <span dir="auto" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
      {undo && (
        <React.Fragment>
          <span aria-hidden="true" style={{ width: 1, height: 14, flex: 'none', background: HAIRLINE_STRONG }} />
          <button
            type="button" onClick={undo.run}
            style={{ height: 28, padding: '0 10px', borderRadius: 999, border: 0, background: 'transparent', color: GOLD, fontSize: 12, cursor: 'pointer', display: 'inline-flex', gap: 5, alignItems: 'center', flex: 'none' }}
          >
            <Icon name="undo-2" size={13} />{undo.label}
          </button>
        </React.Fragment>
      )}
    </span>
  );
}

// chatDockView.jsx's own `meta` shape has always been a flat array of "label: value" strings -
// or a bare "value" when there is no human label for it. Parsed back into {label, value}.
function metaToStat(entry) {
  const idx = String(entry).indexOf(': ');
  if (idx === -1) return { label: '', value: entry };
  return { label: entry.slice(0, idx), value: entry.slice(idx + 2) };
}

/* The rule-engine banner is only ever shown when chat-dock-core.js's sendChat() actually resolved
   a real Journey C proactive rule this turn (`result.kind === 'proactive-resolved'`, carrying a
   real `finding.ruleId` - see ai-proactive-engine.js's resolveConfirmation()) - never fabricated. */
function RuleBanner({ text }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 13px', borderRadius: 9, border: '1px dashed var(--divider-gold)', background: 'rgba(214,175,107,.05)' }}>
      <span style={{ flex: 'none', color: 'var(--gold-warm)', display: 'grid', placeItems: 'center' }}><Icon name="shield-check" size={15} /></span>
      <span style={{ font: 'var(--type-body)', fontSize: 13, lineHeight: '22px', color: 'var(--gold-warm)' }}>{text}</span>
    </div>
  );
}

function sameCalendarDay(a, b) {
  const da = new Date(a); const db = new Date(b);
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
}
function isYesterday(at) {
  const d = new Date(at); const y = new Date(); y.setDate(y.getDate() - 1);
  return sameCalendarDay(d, y);
}
// Real timestamps only - chatDockView.jsx stamps `at`/`latencyMs` when it appends a transcript
// entry (see its own comment); a conversation resumed from server history has no such stamps
// (ai-chat-history-store.js never persisted them), and this renders nothing rather than a
// fabricated time, matching this app's "insufficient data over a guessed number" convention.
function clockText(at, locale) {
  if (!at) return '';
  try { return new Date(at).toLocaleTimeString(locale || undefined, { hour: '2-digit', minute: '2-digit' }); } catch (_e) { return ''; }
}
function dividerLabel(at, locale, todayLabel, yesterdayLabel) {
  if (!at) return null;
  if (sameCalendarDay(at, Date.now())) return todayLabel;
  if (isYesterday(at)) return yesterdayLabel;
  try { return new Date(at).toLocaleDateString(locale || undefined); } catch (_e) { return null; }
}
function latencyText(ms, locale) {
  if (ms == null) return '';
  try { return (ms / 1000).toLocaleString(locale || undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }); } catch (_e) { return (ms / 1000).toFixed(1); }
}

function HeaderIconButton({ icon, label, onClick, children, dangerHover, size = 36, active = false }) {
  const [hover, setHover] = React.useState(false);
  return (
    <button
      type="button" onClick={onClick} aria-label={label} title={label}
      aria-pressed={active ? 'true' : undefined}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative', width: size, height: size, flex: 'none', borderRadius: size <= 34 ? 11 : 12, display: 'grid', placeItems: 'center',
        cursor: 'pointer', border: '1px solid ' + (active ? accent(50) : hover ? (dangerHover ? 'color-mix(in srgb,var(--danger) 60%,transparent)' : 'var(--border-hairline)') : 'transparent'),
        background: active ? 'var(--char-active-surface)' : hover ? 'rgba(244,234,215,.04)' : 'transparent',
        color: active ? 'var(--char-accent)' : dangerHover && hover ? 'var(--danger)' : MUTED,
        transition: 'border-color 160ms var(--ease-out),color 160ms var(--ease-out),background 160ms var(--ease-out)'
      }}
    >
      {children || (icon && <Icon name={icon} size={size <= 34 ? 15 : 16} />)}
    </button>
  );
}

/* "It was wrong" behind one button: a small menu with the two real, distinct wrong-feedback
   intents (wrong action / wrong target or value). Opens upward, inside the reply, and closes on
   pick, Escape or any outside press. */
function WrongFeedbackMenu({ open, onToggle, onClose, label, items }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!open) return undefined;
    function onDown(e) { if (ref.current && !ref.current.contains(e.target)) onClose(); }
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open, onClose]);
  return (
    <span ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <MiniButton iconOnly icon="x" label={label} active={open} aria-haspopup="menu" aria-expanded={open ? 'true' : 'false'} onClick={onToggle} />
      {open && (
        <span role="menu" style={{
          position: 'absolute', bottom: 'calc(100% + 6px)', insetInlineStart: 0, zIndex: 2, minWidth: 190,
          display: 'flex', flexDirection: 'column', gap: 4, padding: 6, boxSizing: 'border-box',
          borderRadius: 12, border: '1px solid var(--border-gold)', background: 'var(--overlay-500)', boxShadow: 'var(--shadow-panel)'
        }}>
          {items}
        </span>
      )}
    </span>
  );
}

/* Soft reply surface that rises above the ChatDock. Lines reveal in sequence so the answer
   reads as it lands rather than appearing as a wall. Beyond the plain answer/thinking states,
   `state` also covers 'safety' (mental-health's flagged-message gate) and 'review' (screenshot ->
   trade-field extraction) so every reply the old global-ai-dock produced still has a home here. */
export function ChatResponsePopover({
  open = false,
  state = 'answer',
  title = 'NAVRYA Assistant',
  prompt,
  lines = [],
  messages,
  userLabel = 'You',
  assistantLabel = 'Assistant',
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
  // Optional extras - all optional so any other caller of this component keeps working unchanged
  // with none of them supplied.
  model, locale, todayLabel = 'Today', yesterdayLabel = 'Yesterday',
  sizeLabels = {}, messageActionLabels = {}, ruleApplied = false, ruleAppliedLabel, onRegenerate,
  // Voice Command Learning Profile addendum, section 8: a small, non-blocking row - `feedback` is
  // null/undefined (renders nothing) or a plain truthy marker (chatDockView.jsx computes it from
  // ai-action-receipts.js's own lastEligibleReceipt(), scoped to the current conversation/tab/
  // receipt) meaning "the turn that just landed has a real, trustworthy, not-yet-answered receipt to
  // give feedback on." Every handler is optional; a caller that never passes any of them sees this
  // whole row never render.
  feedback = null, feedbackLabels = {},
  onFeedbackCorrect, onFeedbackWrongAction, onFeedbackWrongTarget, onFeedbackRemember, onFeedbackDismiss,
  // `companion` ({ name, portrait }) is the header/avatar identity, `statusLabel` the header's one-line
  // status when not thinking, `joined` the flush-on-the-row shape. `shape` is 'peek' or 'scroll'
  // (dockShape.js); the peek's expand / the scroll's fold / pin come from the dock.
  companion, statusLabel, joined = false,
  shape = 'scroll', onExpand, onFold, pinned = false, onPinToggle, pinLabel, unpinLabel, pinIcon = 'panel-right',
  onHistory, historyLabel,
  // The header's engine chip opens the engine menu ({ items, glyph, label }); the peek's "just now"
  // source line; quick choices for a question with options; the undo of the last action, if any.
  engineMenu = null, justNowLabel, choices = [], onChoice, undo = null, peekLabels = {},
  width = 600,
  style, ...rest
}) {
  useAssistantMotion();
  // Where the capsule sits (ChatDock) - 'under' means a dialog is open and there is only a short
  // band below it, so the reply is always the peek there.
  const dockLayout = React.useContext(DockLayoutContext);
  const [mounted, setMounted] = React.useState(open);
  const [leaving, setLeaving] = React.useState(false);
  const [wrongMenuOpen, setWrongMenuOpen] = React.useState(false);
  const threadRef = React.useRef(null);

  // A real, growing conversation (messages) auto-scrolls to its latest turn on every update -
  // the old single-answer `lines` shape never needed this since it only ever showed one exchange.
  React.useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [messages]);

  // A closed/answered feedback row must never come back with its "wrong" menu already open.
  React.useEffect(() => { if (!feedback) setWrongMenuOpen(false); }, [feedback]);

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

  const portrait = companion && companion.portrait;
  const companionName = (companion && companion.name) || title;

  // `lines` only ever carries at most one entry in practice (the screenshot-analysis error
  // fallback) - folded into the same real message-grid renderer as `messages` instead of a
  // second, parallel rendering path.
  const effectiveMessages = messages && messages.length
    ? messages
    : (lines && lines.length ? [{ role: 'assistant', content: lines.join('\n\n') }] : null);
  const lastUserMessage = effectiveMessages ? [...effectiveMessages].reverse().find((m) => m.role === 'user') : null;
  const lastMessage = effectiveMessages && effectiveMessages.length ? effectiveMessages[effectiveMessages.length - 1] : null;
  // The feedback choices only ever render for the LAST assistant message, only when `feedback` is
  // truthy, and never mid-thinking/safety/review.
  const settled = !thinking && !safety && !review;
  const showFeedback = settled && effectiveMessages && lastMessage && lastMessage.role === 'assistant' && feedback;
  const lastAssistant = effectiveMessages ? [...effectiveMessages].reverse().find((m) => m.role === 'assistant') : null;
  const receipts = settled ? meta.map(metaToStat) : [];

  const cardFrame = {
    width: '100%', maxWidth: width, boxSizing: 'border-box', overflow: 'hidden', position: 'relative',
    // An opaque body (page content never shows through a reply), the character's tint only at the very
    // top, and - when `joined` - no bottom corners or bottom edge of its own, so it continues straight
    // into the ChatDock row below it.
    borderRadius: cardRadius(false, joined), border: '1px solid ' + EDGE, borderBottom: joined ? 0 : undefined,
    background: cardBackground('card'),
    boxShadow: cardShadow('card'),
    animation: `${leaving ? 'navrya-dock-sink 180ms var(--ease-out)' : 'navrya-dock-rise var(--dur-expand) var(--ease-out)'} both`,
    transformOrigin: 'bottom center',
    ...style
  };

  // ---- PEEK ---------------------------------------------------------------------------------
  // The mental-health safety card and the screenshot review always keep the full card: those must
  // never be squeezed into a peek.
  if ((shape === 'peek' || dockLayout === 'under') && !safety && !review) {
    const lastReceipt = receipts.length ? receipts[receipts.length - 1] : null;
    return (
      <div data-navrya-assistant="response" data-navrya-response-variant="peek" role="status" aria-live="polite" style={cardFrame} {...rest}>
        <CapsuleTop />
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, padding: '18px 14px 12px 12px' }}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: DIM, minWidth: 0 }}>
              <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--char-accent)', flex: 'none' }} />
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {justNowLabel || companionName}{thinking && thinkingLabel ? ' · ' + thinkingLabel + '…' : ''}
              </span>
              {lastReceipt && (
                <span style={{ ...pillStyle('success'), gap: 4, height: 20, minWidth: 0, overflow: 'hidden' }}>
                  <Icon name="check" size={11} strokeWidth={2.4} />
                  <span dir="auto" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{lastReceipt.value}</span>
                </span>
              )}
            </div>
            {!thinking && lastAssistant && (
              <p dir="auto" style={{
                margin: 0, font: 'var(--type-body)', fontSize: 14, lineHeight: 1.85, color: TEXT_SOFT, whiteSpace: 'pre-line',
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden'
              }}>{stripMarkdownTokens(lastAssistant.content)}</p>
            )}
            {thinking && <Dots />}
            {!thinking && choices.length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {choices.map((c) => (
                  <button key={c.value != null ? String(c.value) : c.label} type="button" onClick={() => onChoice && onChoice(c)} style={choiceStyle(32)}>{c.label}</button>
                ))}
              </div>
            )}
          </div>
          {dockLayout !== 'under' && onExpand && <HeaderIconButton icon="chevron-up" label={peekLabels.expand || sizeLabels.unfold} onClick={onExpand} size={34} />}
          {onClose && <HeaderIconButton icon="x" label={peekLabels.close || sizeLabels.close} onClick={onClose} size={34} />}
        </div>
      </div>
    );
  }

  // ---- SCROLL -------------------------------------------------------------------------------
  const lastAssistantIndex = effectiveMessages ? effectiveMessages.reduce((found, m, i) => (m.role === 'assistant' ? i : found), -1) : -1;
  return (
    <div data-navrya-assistant="response" data-navrya-response-variant="scroll" role="status" aria-live="polite" style={cardFrame} {...rest}>
      <CapsuleTop />

      <header style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10, padding: '18px 12px 12px 12px' }}>
        <CompanionSigil portrait={portrait} size={36} state={thinking ? 'thinking' : 'idle'} />
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <span style={{ font: 'var(--type-body)', fontSize: 15, fontWeight: 700, color: TEXT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{companionName}</span>
            {model && (engineMenu && engineMenu.items && engineMenu.items.length
              ? <DockMenu variant="chip" placement="down" label={engineMenu.switchLabel || model.label} chipLabel={model.label} glyph={<ModelGlyph model={model} size={13} />} items={engineMenu.items} />
              : <EngineChip model={model} glyph={<ModelGlyph model={model} size={13} />} />)}
          </div>
          {(thinking ? thinkingLabel : statusLabel) && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, font: 'var(--type-caption)', fontSize: 12, color: MUTED, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              <span aria-hidden="true" style={{ width: 6, height: 6, flex: 'none', borderRadius: 999, background: thinking ? 'var(--gold-warm)' : GREEN }} />
              {thinking ? thinkingLabel + '…' : statusLabel}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {onHistory && <HeaderIconButton icon="history" label={historyLabel} onClick={onHistory} />}
          {onPinToggle && dockLayout !== 'under' && <HeaderIconButton icon={pinIcon} label={pinned ? unpinLabel : pinLabel} onClick={onPinToggle} active={pinned} />}
          {onFold && <HeaderIconButton icon="chevron-down" label={sizeLabels.fold} onClick={onFold} />}
          {onClose && <HeaderIconButton icon="x" label={sizeLabels.close} onClick={onClose} dangerHover />}
        </div>
      </header>
      <div aria-hidden="true" style={{ height: 1, background: DIVIDER, margin: '0 14px' }} />

      {/* The whole body - not merely the messages thread below - is its own viewport-constrained,
          scrollable region, so a reply with many suggestions/receipts/review fields but few or no
          `messages` can never push the header (which stays OUTSIDE this wrapper and therefore always
          stays reachable) off-screen on a short viewport. */}
      <div className="navrya-scroll" style={{ padding: '14px 16px 16px', display: 'flex', flexDirection: 'column', gap: 16, maxHeight: THREAD_MAX_HEIGHT, overflowY: 'auto', boxSizing: 'border-box', position: 'relative' }}>
        {prompt && (thinking || !effectiveMessages) && (
          <div style={{
            font: 'var(--type-caption)', color: 'var(--text-muted)', paddingInlineStart: 10,
            borderInlineStart: '2px solid var(--divider-gold)', textWrap: 'pretty'
          }}>{prompt}</div>
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

        {settled && effectiveMessages && (
          <div
            ref={threadRef} className="navrya-scroll"
            // One viewport-relative ceiling for the thread (THREAD_MAX_HEIGHT above bounds the whole
            // body too), so it can never reopen the original "reply covers the screen" overflow bug.
            style={{ display: 'flex', flexDirection: 'column', gap: 16, maxHeight: THREAD_MAX_HEIGHT, overflowY: 'auto', paddingInlineEnd: 4 }}
          >
            {effectiveMessages.map((m, i) => {
              const prev = i > 0 ? effectiveMessages[i - 1] : null;
              const divider = m.at && (!prev || !prev.at || !sameCalendarDay(m.at, prev.at)) ? dividerLabel(m.at, locale, todayLabel, yesterdayLabel) : null;
              const isUser = m.role === 'user';
              const time = clockText(m.at, locale);
              const isLastAssistant = i === lastAssistantIndex;
              return (
                <React.Fragment key={i}>
                  {divider && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 11, color: TIME }}>
                      <span aria-hidden="true" style={{ flex: 1, height: 1, background: DIVIDER }} />
                      {divider}
                      <span aria-hidden="true" style={{ flex: 1, height: 1, background: DIVIDER }} />
                    </div>
                  )}
                  {isUser ? (
                    <div style={{ alignSelf: 'flex-end', maxWidth: '80%', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, animation: i === effectiveMessages.length - 1 ? 'navrya-pop-in 300ms var(--ease-out) both' : 'none' }}>
                      <div dir="auto" style={{
                        boxSizing: 'border-box', padding: '9px 14px', borderRadius: 16, borderEndEndRadius: 5,
                        border: '1px solid ' + accent(28), background: accent(13),
                        font: 'var(--type-body)', fontSize: 13.5, lineHeight: 1.85, color: TEXT, textWrap: 'pretty'
                      }}>{stripMarkdownTokens(m.content)}</div>
                      {(time || m.via === 'voice') && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5, font: 'var(--type-caption)', fontSize: 11, color: TIME }}>
                          {m.via === 'voice' && <span aria-hidden="true" style={{ display: 'inline-flex', color: 'var(--char-accent-soft)' }}><Icon name="mic" size={11} /></span>}
                          {[m.via === 'voice' ? peekLabels.voice : '', time].filter(Boolean).join(' · ')}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <CompanionSigil portrait={portrait} size={28} dot={false} />
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
                        <span style={{ font: 'var(--type-caption)', fontSize: 11.5, color: DIM }}>
                          {[companionName, m.latencyMs != null ? latencyText(m.latencyMs, locale) + ' ' + (peekLabels.seconds || 's') : (time || '')].filter(Boolean).join(' · ')}
                        </span>
                        <p dir="auto" style={{
                          margin: 0, font: 'var(--type-body)', fontSize: 14, lineHeight: 1.95, color: TEXT_SOFT, textWrap: 'pretty', whiteSpace: 'pre-line',
                          animation: i === effectiveMessages.length - 1 ? 'navrya-line-in 320ms var(--ease-out) both' : 'none'
                        }}>{stripMarkdownTokens(m.content)}</p>
                        {isLastAssistant && receipts.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxWidth: '100%' }}>
                            {receipts.map((cell, k) => <ReceiptChip key={k} label={cell.label} value={cell.value} undo={k === receipts.length - 1 ? undo : null} />)}
                          </div>
                        )}
                        {isLastAssistant && ruleApplied && ruleAppliedLabel && <RuleBanner text={ruleAppliedLabel} />}
                        {/* One quiet row under the last reply: the feedback question and its choices at the
                            start, copy / regenerate at the end (the design's row).

                            Voice Command Learning Profile addendum, section 8 (unchanged contract): the
                            feedback choices never block typing/Voice, and every one fires the SAME
                            command-feedback path a spoken/typed phrase does (chatDockView.jsx wires each
                            handler to submit() with the canonical phrase) - a convenience trigger, never a
                            second, parallel learning mechanism. Correct and "do this next time" are one click
                            each; the two "wrong" intents share one menu behind the design's single "wrong"
                            button. */}
                        {isLastAssistant && (messageActionLabels.copy || onRegenerate || feedback) && (
                          <div style={{ position: 'relative', alignSelf: 'stretch', display: 'flex', alignItems: 'center', gap: 2, fontSize: 12, color: DIM, minHeight: 30 }}>
                            {showFeedback && (
                              <React.Fragment>
                                <span style={{ font: 'var(--type-caption)', fontSize: 12, color: DIM, flex: 'none', marginInlineEnd: 6 }}>{feedbackLabels.prompt}</span>
                                {onFeedbackCorrect && <MiniButton iconOnly icon="check" label={feedbackLabels.correct} onClick={onFeedbackCorrect} />}
                                {onFeedbackRemember && <MiniButton iconOnly icon="bookmark" label={feedbackLabels.rememberThis} onClick={onFeedbackRemember} />}
                                {(onFeedbackWrongAction || onFeedbackWrongTarget) && (
                                  <WrongFeedbackMenu
                                    open={wrongMenuOpen} onToggle={() => setWrongMenuOpen((v) => !v)} onClose={() => setWrongMenuOpen(false)}
                                    label={feedbackLabels.wrong || feedbackLabels.wrongAction}
                                    items={(
                                      <React.Fragment>
                                        {onFeedbackWrongAction && <MiniButton kind="discard" icon="close" role="menuitem" onClick={() => { setWrongMenuOpen(false); onFeedbackWrongAction(); }}>{feedbackLabels.wrongAction}</MiniButton>}
                                        {onFeedbackWrongTarget && <MiniButton kind="discard" icon="close" role="menuitem" onClick={() => { setWrongMenuOpen(false); onFeedbackWrongTarget(); }}>{feedbackLabels.wrongTarget}</MiniButton>}
                                        {onFeedbackDismiss && <MiniButton kind="discard" icon="minus" role="menuitem" onClick={() => { setWrongMenuOpen(false); onFeedbackDismiss(); }}>{feedbackLabels.dismiss}</MiniButton>}
                                      </React.Fragment>
                                    )}
                                  />
                                )}
                              </React.Fragment>
                            )}
                            <span style={{ flex: 1 }} />
                            {messageActionLabels.copy && <CopyButton iconOnly text={m.content} label={messageActionLabels.copy} copiedLabel={messageActionLabels.copied} />}
                            {onRegenerate && lastUserMessage && <MiniButton iconOnly icon="rotate-cw" label={messageActionLabels.regenerate} onClick={() => onRegenerate(lastUserMessage.content)} />}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        )}

        {thinking && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <CompanionSigil portrait={portrait} size={28} state="thinking" dot={false} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, font: 'var(--type-body)', fontSize: 14, color: 'var(--text-muted)' }}>
              <Dots /><span>{thinkingLabel}{'…'}</span>
            </div>
          </div>
        )}

        {settled && (!effectiveMessages || lastAssistantIndex === -1) && receipts.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {receipts.map((cell, k) => <ReceiptChip key={k} label={cell.label} value={cell.value} undo={k === receipts.length - 1 ? undo : null} />)}
          </div>
        )}

        {settled && suggestions.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {suggestions.map((s) => (
              <div key={s.id} style={{
                display: 'flex', flexDirection: 'column', gap: 6, padding: 10,
                borderRadius: 'var(--radius-8)', border: '1px solid rgba(244,234,215,.10)', background: 'rgba(244,234,215,.04)'
              }}>
                <small style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{s.label || s.path}</small>
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
