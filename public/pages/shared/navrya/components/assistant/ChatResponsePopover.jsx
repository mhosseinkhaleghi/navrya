import React from 'react';
import { Icon } from '../core/Icon.jsx';
import { useAssistantMotion } from './motion.js';
import { ModelGlyph } from './ModelSwitcher.jsx';
import { CompanionSigil, EngineChip } from './CompanionSigil.jsx';

/* Redesigned to match code-codex/چت داک جدید/NavryaChatDock.dc.html - a persistent, resizable
   reply panel (header with a real avatar/label/height-stage rail, a message-grid stream, a
   rule-engine banner, a small stat grid) replacing the previous plain "answer card" look. Every
   existing prop/behavior this component's callers (chatDockView.jsx) already depend on is
   unchanged - 'thinking'/'safety'/'review'/'answer' states, `messages` vs `lines`, suggestions,
   review fields/actions, onClose - this is a visual + structural redesign of the SAME contract,
   not a new component. See this file's own inline comments for the handful of deliberate, honest
   adaptations from the mock (no fabricated "SEEN" read-receipt, no "save to journal" - no real
   journal concept exists to wire it to; Copy/Regenerate ARE wired for real).

   Companion capsule redesign (artbook plates III-V): the same contract again, restyled -
   - the header is the companion (the character's portrait and name) with the engine as a small
     label, instead of "<ENGINE> · CHAT", a stage code (TALL/FOLDED) and a stage rail;
   - assistant turns carry the character's portrait, user turns a character-tinted bubble;
   - applied workflow fields show as receipt chips, not an uppercase stat grid of raw paths;
   - copy / regenerate / feedback are one quiet icon row; the two "it was wrong" choices sit in a
     small menu behind one button instead of five equal-weight pills;
   - `joined` squares the bottom corners so the panel sits flush on the ChatDock row. */

// One ceiling for the thread, content-sized below it (a short reply stays short). This replaces
// the COMPACT/TALL/FULL stage tiers - still viewport-relative, still inside the 60vh body wrapper
// below, so the original overflow fix holds; fold (the header chevron) still collapses to the header.
const THREAD_MAX_HEIGHT = 'min(44vh, 520px)';

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
    ? { border: '1px solid transparent', background: 'var(--char-accent)', color: 'var(--ink-950)', fontWeight: 600 }
    : { border: '1px solid var(--border-gold)', background: 'transparent', color: 'var(--text-muted)', fontWeight: 500 };
}

// `iconOnly` (companion capsule redesign): the compact 30px icon form the reply's own action row
// uses (copy / regenerate / feedback) - `label` becomes its accessible name and tooltip, and
// `active` marks an open menu trigger. Every existing caller keeps the labelled pill form.
function MiniButton({ kind, icon, children, onClick, iconOnly = false, label, active = false, ...rest }) {
  if (iconOnly) {
    return (
      <button
        type="button" onClick={onClick} aria-label={label} title={label} {...rest}
        style={{
          width: 30, height: 30, flex: 'none', display: 'grid', placeItems: 'center', padding: 0,
          borderRadius: 'var(--radius-8)', cursor: 'pointer',
          border: '1px solid ' + (active ? 'color-mix(in srgb,var(--char-accent) 50%,transparent)' : 'transparent'),
          background: active ? 'var(--char-active-surface)' : 'transparent',
          color: active ? 'var(--char-accent)' : 'var(--text-muted)',
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

/* Companion capsule redesign: what the turn actually applied, as one small receipt line each
   ("✓ Dashboard", "✓ Platform / broker MetaTrader 5") instead of the old uppercase stat grid that
   printed raw workflow paths like DOMAINID. The human wording comes from chatDockView.jsx
   (chatDockReceipts.js) - this only renders it. */
function ReceiptChip({ label, value }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 32, paddingInlineStart: 5, paddingInlineEnd: 12, paddingBlock: 3, boxSizing: 'border-box',
      borderRadius: 999, border: '1px solid rgba(183,138,74,.36)', background: 'rgba(183,138,74,.07)',
      font: 'var(--type-caption)', fontSize: 12.5, color: 'var(--text-primary)', maxWidth: '100%'
    }}>
      <span aria-hidden="true" style={{ width: 20, height: 20, flex: 'none', borderRadius: 999, display: 'grid', placeItems: 'center', background: 'rgba(46,204,113,.14)', color: 'var(--success)' }}>
        <Icon name="check" size={12} strokeWidth={2.6} />
      </span>
      {label && <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{label}</span>}
      <span dir="auto" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
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
   real `finding.ruleId` - see ai-proactive-engine.js's resolveConfirmation()) - never fabricated,
   unlike the mock's own static example. */
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
function latencyText(ms) {
  if (ms == null) return '';
  return (ms / 1000).toFixed(1);
}

function HeaderIconButton({ icon, label, onClick, children, dangerHover, size = 36 }) {
  const [hover, setHover] = React.useState(false);
  return (
    <button
      type="button" onClick={onClick} aria-label={label} title={label}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative', width: size, height: size, flex: 'none', borderRadius: 12, display: 'grid', placeItems: 'center',
        cursor: 'pointer', border: '1px solid ' + (hover ? (dangerHover ? 'color-mix(in srgb,var(--danger) 60%,transparent)' : 'var(--border-hairline)') : 'transparent'),
        background: hover ? 'rgba(244,234,215,.04)' : 'transparent', color: dangerHover && hover ? 'var(--danger)' : 'var(--text-muted)',
        transition: 'border-color 160ms var(--ease-out),color 160ms var(--ease-out),background 160ms var(--ease-out)'
      }}
    >
      {children || (icon && <Icon name={icon} size={16} />)}
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
      <MiniButton iconOnly icon="thumbs-down" label={label} active={open} aria-haspopup="menu" aria-expanded={open ? 'true' : 'false'} onClick={onToggle} />
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
  // Redesign additions - all optional so any other caller of this component keeps working
  // unchanged with none of them supplied.
  model, locale, todayLabel = 'Today', yesterdayLabel = 'Yesterday',
  sizeLabels = {}, messageActionLabels = {}, ruleApplied = false, ruleAppliedLabel, onRegenerate,
  // Voice Command Learning Profile addendum, section 8: a small, non-blocking, dismissible row -
  // `feedback` is null/undefined (renders nothing, byte-for-byte the prior behavior) or a plain
  // truthy marker (chatDockView.jsx computes it from ai-action-receipts.js's own
  // lastEligibleReceipt(), scoped to the current conversation/tab/receipt - see that file's own
  // comment) meaning "the turn that just landed has a real, trustworthy, not-yet-answered receipt
  // to give feedback on." Every one of the five handlers is optional; a caller that never passes
  // any of them (every existing one, before this addendum) sees this whole row never render.
  feedback = null, feedbackLabels = {},
  onFeedbackCorrect, onFeedbackWrongAction, onFeedbackWrongTarget, onFeedbackRemember, onFeedbackDismiss,
  // Companion capsule redesign: `companion` ({ name, portrait }) is the header/avatar identity,
  // `statusLabel` the header's one-line status when not thinking, `joined` the flush-on-the-row
  // shape. All optional - without them the header falls back to `title` and a plain sparkle.
  companion, statusLabel, joined = false,
  width = 680,
  style, ...rest
}) {
  useAssistantMotion();
  const [mounted, setMounted] = React.useState(open);
  const [leaving, setLeaving] = React.useState(false);
  // Found via real user report + screenshot: a genuinely long, richly-structured reply (the
  // exact kind the higher-verbosity system prompt now produces on purpose) could still make this
  // whole popover dominate a shorter viewport even after the earlier whitespace-rendering fix -
  // the text itself rendered correctly, but the BOX around it had no viewport-relative ceiling of
  // its own. `folded` (formerly `collapsed`) lets the user manually shrink it back to just the
  // header (still reachable to re-expand) without losing/closing the conversation - a real,
  // requested control, matching the design's own fold/chevron affordance. Deliberately local
  // state, not lifted to chatDockView.jsx: React reuses this same component instance across every
  // new message in one open conversation (no `key` prop forces a remount), so a manual fold
  // correctly persists turn to turn until the user explicitly unfolds it again, and just as
  // correctly resets for a genuinely new popover.
  const [folded, setFolded] = React.useState(false);
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

  function toggleFold() { setFolded((f) => !f); }
  const portrait = companion && companion.portrait;
  const companionName = (companion && companion.name) || title;
  const radius = 20;

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
  const showFeedback = !thinking && !safety && !review && effectiveMessages && lastMessage && lastMessage.role === 'assistant' && feedback;

  return (
    <div
      data-navrya-assistant="response" role="status" aria-live="polite"
      style={{
        width: '100%', maxWidth: width, boxSizing: 'border-box', overflow: 'hidden', position: 'relative',
        // Companion capsule redesign: an opaque body (page content never shows through a reply),
        // the character's tint only at the very top, and - when `joined` - no bottom corners or
        // bottom edge of its own, so it continues straight into the ChatDock row below it.
        borderRadius: joined ? `${radius}px ${radius}px 0 0` : radius,
        border: '1px solid var(--border-gold)', borderBottom: joined ? 0 : undefined,
        background: 'linear-gradient(180deg,color-mix(in srgb,var(--char-accent) 11%,#0B0E14) 0%,#0B0E14 38%,#0A0D12 100%)',
        boxShadow: joined ? '0 -12px 48px rgba(0,0,0,.45),0 0 40px var(--char-glow)' : '0 26px 64px rgba(0,0,0,.6),0 0 40px var(--char-glow)',
        animation: `${leaving ? 'navrya-pop-out 170ms var(--ease-standard)' : 'navrya-pop-in 260ms var(--ease-out)'} both`,
        transformOrigin: 'bottom center',
        ...style
      }}
      {...rest}
    >
      <span aria-hidden="true" style={{ position: 'absolute', top: 9, insetInlineEnd: 9, width: 9, height: 9, pointerEvents: 'none', borderTop: '1px solid rgba(214,175,107,.55)', borderInlineEnd: '1px solid rgba(214,175,107,.55)' }} />
      <span aria-hidden="true" style={{ position: 'absolute', top: 9, insetInlineStart: 9, width: 9, height: 9, pointerEvents: 'none', borderTop: '1px solid rgba(214,175,107,.55)', borderInlineStart: '1px solid rgba(214,175,107,.55)' }} />

      <header style={{
        position: 'relative', display: 'flex', alignItems: 'center', gap: 10,
        padding: '16px 12px 12px 12px', borderBottom: '1px solid var(--border-hairline)'
      }}>
        <CompanionSigil portrait={portrait} size={36} state={thinking ? 'thinking' : 'idle'} />
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <span style={{ font: 'var(--type-body)', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{companionName}</span>
            {model && <EngineChip model={model} glyph={<ModelGlyph model={model} size={13} />} />}
          </div>
          {(thinking ? thinkingLabel : statusLabel) && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, font: 'var(--type-caption)', fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              <span aria-hidden="true" style={{ width: 6, height: 6, flex: 'none', borderRadius: 999, background: thinking ? 'var(--gold-warm)' : 'var(--success)' }} />
              {thinking ? thinkingLabel + '…' : statusLabel}
            </span>
          )}
        </div>

        <HeaderIconButton onClick={toggleFold} label={folded ? sizeLabels.unfold : sizeLabels.fold}>
          <span aria-hidden="true" style={{ display: 'grid', placeItems: 'center', transition: 'transform 420ms cubic-bezier(.16,1,.3,1)', transform: 'rotate(' + (folded ? '180deg' : '0deg') + ')' }}>
            <Icon name="chevron-down" size={16} />
          </span>
        </HeaderIconButton>

        {onClose && <HeaderIconButton icon="x" label={sizeLabels.close} onClick={onClose} dangerHover />}
      </header>

      {/* fix/voice-mode-turn-ux (Part E req 10): the whole body - not merely the messages thread
          below - is its own viewport-constrained, scrollable region. Before this, a reply with
          many suggestions/meta chips/review fields but few or no `messages` had no bound of its own
          at all and could push the popover (and the header/close controls above it, which stay
          OUTSIDE this wrapper and therefore always stay reachable) off-screen on a short viewport. */}
      {!folded && <div className="navrya-scroll" style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '60vh', overflowY: 'auto', boxSizing: 'border-box' }}>
        {prompt && (thinking || !effectiveMessages) && (
          <div style={{
            font: 'var(--type-caption)', color: 'var(--text-muted)', paddingInlineStart: 10,
            borderInlineStart: '2px solid var(--divider-gold)', textWrap: 'pretty'
          }}>{prompt}</div>
        )}

        {thinking && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <CompanionSigil portrait={portrait} size={28} state="thinking" dot={false} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, font: 'var(--type-body)', fontSize: 14, color: 'var(--text-muted)' }}>
              <Dots /><span>{thinkingLabel}{'…'}</span>
            </div>
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

        {!thinking && !safety && !review && effectiveMessages && (
          <div
            ref={threadRef} className="navrya-scroll"
            // Found via a real user report + screenshot: a fixed 360px thread cap, plus this
            // header/padding's own real overhead, could still exceed roughly half the viewport
            // on a shorter window - never viewport-relative, so it didn't scale down. One
            // viewport-relative ceiling (THREAD_MAX_HEIGHT), still bounded by the 60vh outer
            // wrapper above, so it can never reopen the original overflow bug.
            style={{ display: 'flex', flexDirection: 'column', gap: 16, maxHeight: THREAD_MAX_HEIGHT, overflowY: 'auto', paddingInlineEnd: 4 }}
          >
            {effectiveMessages.map((m, i) => {
              const prev = i > 0 ? effectiveMessages[i - 1] : null;
              const divider = m.at && (!prev || !prev.at || !sameCalendarDay(m.at, prev.at)) ? dividerLabel(m.at, locale, todayLabel, yesterdayLabel) : null;
              const isUser = m.role === 'user';
              const time = clockText(m.at, locale);
              return (
                <React.Fragment key={i}>
                  {divider && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span aria-hidden="true" style={{ flex: 1, height: 1, background: 'var(--border-hairline)' }} />
                      <span style={{ font: 'var(--type-caption)', fontSize: 11, letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{divider}</span>
                      <span aria-hidden="true" style={{ flex: 1, height: 1, background: 'var(--border-hairline)' }} />
                    </div>
                  )}
                  {isUser ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, animation: i === effectiveMessages.length - 1 ? 'navrya-pop-in 300ms var(--ease-out) both' : 'none' }}>
                      <div dir="auto" style={{
                        maxWidth: 'min(80%,560px)', boxSizing: 'border-box', padding: '9px 14px', borderRadius: 16, borderEndEndRadius: 5,
                        border: '1px solid color-mix(in srgb,var(--char-accent) 28%,transparent)', background: 'color-mix(in srgb,var(--char-accent) 13%,transparent)',
                        font: 'var(--type-body)', fontSize: 13.5, lineHeight: '25px', color: 'var(--text-primary)', textWrap: 'pretty'
                      }}>{stripMarkdownTokens(m.content)}</div>
                      {time && <span style={{ font: 'var(--type-caption)', fontSize: 11, letterSpacing: '.06em', color: 'var(--text-dim)', paddingInlineEnd: 4 }}>{time}</span>}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                      <CompanionSigil portrait={portrait} size={28} dot={false} />
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <span style={{ font: 'var(--type-caption)', fontSize: 11.5, color: 'var(--text-muted)' }}>
                          {[companionName, time, m.latencyMs != null ? latencyText(m.latencyMs) + 's' : ''].filter(Boolean).join(' · ')}
                        </span>
                        <p dir="auto" style={{
                          margin: 0, font: 'var(--type-body)', fontSize: 14, lineHeight: '27px', color: 'var(--parchment)', textWrap: 'pretty', whiteSpace: 'pre-line',
                          animation: i === effectiveMessages.length - 1 ? 'navrya-line-in 320ms var(--ease-out) both' : 'none'
                        }}>{stripMarkdownTokens(m.content)}</p>
                      </div>
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        )}

        {!thinking && !safety && !review && meta.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {meta.map((m, i) => { const cell = metaToStat(m); return <ReceiptChip key={i} label={cell.label} value={cell.value} />; })}
          </div>
        )}

        {!thinking && !safety && !review && ruleApplied && ruleAppliedLabel && <RuleBanner text={ruleAppliedLabel} />}

        {/* One quiet row under the last reply: the feedback question and its choices at the start,
            copy / regenerate at the end.

            Voice Command Learning Profile addendum, section 8 (unchanged contract): the feedback
            choices never block typing/Voice, stay dismissible, and every one fires the SAME
            command-feedback path a spoken/typed phrase does (chatDockView.jsx wires each handler to
            submit() with the canonical phrase) - a convenience trigger, never a second, parallel
            learning mechanism. Correct and "do this next time" are one click each; the two
            "wrong" intents share one menu so the row no longer wraps into five equal pills. */}
        {!thinking && !safety && !review && effectiveMessages && lastMessage && lastMessage.role === 'assistant' && (messageActionLabels.copy || onRegenerate || feedback) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 2, minHeight: 30 }}>
            {showFeedback && (
              <ActionRow>
                <span style={{ font: 'var(--type-caption)', fontSize: 12, color: 'var(--text-dim)', flex: 'none', marginInlineEnd: 4 }}>{feedbackLabels.prompt}</span>
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
                      </React.Fragment>
                    )}
                  />
                )}
                {onFeedbackDismiss && <MiniButton iconOnly icon="x" label={feedbackLabels.dismiss} onClick={onFeedbackDismiss} />}
              </ActionRow>
            )}
            <span style={{ flex: 1 }} />
            {messageActionLabels.copy && <CopyButton iconOnly text={lastMessage.content} label={messageActionLabels.copy} copiedLabel={messageActionLabels.copied} />}
            {onRegenerate && lastUserMessage && <MiniButton iconOnly icon="rotate-cw" label={messageActionLabels.regenerate} onClick={() => onRegenerate(lastUserMessage.content)} />}
          </div>
        )}

        {!thinking && !safety && !review && suggestions.length > 0 && (
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
      </div>}
    </div>
  );
}

export { MiniButton, ActionRow };
