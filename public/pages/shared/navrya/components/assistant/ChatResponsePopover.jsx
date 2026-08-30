import React from 'react';
import { Icon } from '../core/Icon.jsx';
import { useAssistantMotion } from './motion.js';
import { ModelGlyph } from './ModelSwitcher.jsx';

/* Redesigned to match code-codex/چت داک جدید/NavryaChatDock.dc.html - a persistent, resizable
   reply panel (header with a real avatar/label/height-stage rail, a message-grid stream, a
   rule-engine banner, a small stat grid) replacing the previous plain "answer card" look. Every
   existing prop/behavior this component's callers (chatDockView.jsx) already depend on is
   unchanged - 'thinking'/'safety'/'review'/'answer' states, `messages` vs `lines`, suggestions,
   review fields/actions, onClose - this is a visual + structural redesign of the SAME contract,
   not a new component. See this file's own inline comments for the handful of deliberate, honest
   adaptations from the mock (no fabricated "SEEN" read-receipt, no "save to journal" - no real
   journal concept exists to wire it to; Copy/Regenerate ARE wired for real). */

// A `maxHeight` CAP, not a forced `height` - real user feedback on a real short reply: forcing the
// thread to always fill the current stage's full height left a tall block of empty dead space
// below a one-line answer, which read as "it just opens all the way regardless of the message."
// The box now sizes to its real content and only engages a stage's ceiling once content actually
// needs it - the stage buttons visibly matter for a long conversation, and correctly do nothing
// visible for a short one, which is the honest, correct behavior (an earlier pass tried forcing a
// real `height` instead specifically to make short-content growth visible, and that was the wrong
// tradeoff - reverted here). COMPACT is wrapped in `min(...)` as the one genuinely viewport-risky
// fixed-px value; TALL/FULL are already viewport-relative and therefore safe by construction on
// any real screen size - the same vh-based fix a real prior overflow bug report already
// established for this thread (see the outer 60vh body wrapper below, unchanged).
const STAGE_META = [
  { code: 'COMPACT', maxHeight: 'min(230px,40vh)' },
  { code: 'TALL', maxHeight: '38vh' },
  { code: 'FULL', maxHeight: '60vh' }
];

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

/* Copy is wired for real (navigator.clipboard) - a design affordance this codebase's own "no
   decoy buttons" rule (see VoiceConsole.jsx's header comment) means it must actually do something,
   not just look clickable. Local, self-contained "Copied" flash - no store/prop plumbing needed
   for something this small. */
function CopyButton({ text, label, copiedLabel }) {
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
  return <MiniButton kind="discard" icon={copied ? 'check' : 'copy'} onClick={onCopy}>{copied ? copiedLabel : label}</MiniButton>;
}

function StatCell({ label, value }) {
  return (
    <div style={{ padding: '11px 13px', display: 'flex', flexDirection: 'column', gap: 5, background: 'rgba(3,8,7,.55)' }}>
      {label && <span style={{ font: 'var(--type-caption)', fontSize: 10, letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{label}</span>}
      <span className="navrya-tabular" style={{ font: 'var(--type-countdown)', fontSize: 17, color: 'var(--text-primary)' }}>{value}</span>
    </div>
  );
}

// chatDockView.jsx's own `meta` shape has always been a flat array of "path: value" strings
// (Object.keys(workflow.known).map(...)) - real data, unchanged. This just parses it back into
// {label, value} for the new stat-grid look instead of the old pill-chip look.
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
      <span style={{ flex: 1 }} />
      <span style={{ font: 'var(--type-caption)', fontSize: 10, letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--text-muted)' }}>RULE ENGINE</span>
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

function HeaderIconButton({ icon, label, onClick, children, dangerHover, size = 34 }) {
  const [hover, setHover] = React.useState(false);
  return (
    <button
      type="button" onClick={onClick} aria-label={label} title={label}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative', width: size, height: size, flex: 'none', borderRadius: 10, display: 'grid', placeItems: 'center',
        cursor: 'pointer', border: '1px solid ' + (dangerHover && hover ? 'color-mix(in srgb,var(--danger) 60%,transparent)' : 'var(--border-hairline)'),
        background: 'transparent', color: dangerHover && hover ? 'var(--danger)' : 'var(--text-muted)',
        transition: 'border-color 160ms var(--ease-out),color 160ms var(--ease-out)'
      }}
    >
      {children || (icon && <Icon name={icon} size={15} />)}
    </button>
  );
}

/* Header stat rail + grow/shrink toggle - COMPACT/TALL/FULL step through STAGE_META's own
   maxHeight tiers (the message thread's own scroll region below); the toggle is a ping-pong (grows
   until FULL, then reverses to shrink back to COMPACT on further clicks, matching the design's own
   `go()`/`toggleSize()` state machine) rather than a simple two-state expand/collapse. `flip`
   alternates between two byte-identical keyframe names purely to force the sweep/pulse CSS
   animation to restart on every click (browsers don't restart an animation re-set to the same
   name) - the same trick the design's own dc.html source uses. */
function HeightStageRail({ stage, folded, onPick, labels }) {
  if (folded) return null;
  return (
    <div role="group" aria-label={labels.compact + ' / ' + labels.tall + ' / ' + labels.full} style={{ display: 'flex', alignItems: 'center', gap: 5, flex: 'none', padding: '0 4px' }}>
      {STAGE_META.map((s, i) => (
        <button
          key={s.code} type="button"
          aria-label={i === 0 ? labels.compact : i === 1 ? labels.tall : labels.full}
          onClick={() => onPick(i)}
          style={{
            height: 8, padding: 0, flex: 'none', borderRadius: 99, cursor: 'pointer',
            border: '1px solid var(--border-hairline)',
            background: i === stage ? 'var(--char-accent)' : (i < stage ? 'rgba(214,175,107,.35)' : 'transparent'),
            width: i === stage ? 26 : 16,
            transition: 'background 260ms var(--ease-out),border-color 260ms var(--ease-out),width 380ms cubic-bezier(.16,1,.3,1)'
          }}
        />
      ))}
    </div>
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
  // Height stage (design: COMPACT/TALL/FULL) - governs the message thread's own max-height below.
  // Starts at TALL (index 1), the same default the design ships with.
  const [stage, setStage] = React.useState(1);
  const [stageDir, setStageDir] = React.useState(1);
  const [flip, setFlip] = React.useState(false);
  const threadRef = React.useRef(null);

  // A real, growing conversation (messages) auto-scrolls to its latest turn on every update -
  // the old single-answer `lines` shape never needed this since it only ever showed one exchange.
  React.useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [messages]);

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

  function goStage(i) {
    const next = Math.min(2, Math.max(0, i));
    setStage(next);
    setFlip((f) => !f);
    setStageDir((d) => (next >= 2 ? -1 : next <= 0 ? 1 : d));
  }
  function toggleSize() {
    if (folded) { setFolded(false); setFlip((f) => !f); return; }
    let dir = stageDir;
    if (stage >= 2) dir = -1;
    if (stage <= 0) dir = 1;
    goStage(stage + dir);
  }
  function toggleFold() { setFolded((f) => !f); setFlip((f) => !f); }
  const shrinking = stage >= 2 || (stageDir === -1 && stage > 0);

  // `lines` only ever carries at most one entry in practice (the screenshot-analysis error
  // fallback) - folded into the same real message-grid renderer as `messages` instead of a
  // second, parallel rendering path.
  const effectiveMessages = messages && messages.length
    ? messages
    : (lines && lines.length ? [{ role: 'assistant', content: lines.join('\n\n') }] : null);
  const lastUserMessage = effectiveMessages ? [...effectiveMessages].reverse().find((m) => m.role === 'user') : null;
  const lastMessage = effectiveMessages && effectiveMessages.length ? effectiveMessages[effectiveMessages.length - 1] : null;

  return (
    <div
      data-navrya-assistant="response" role="status" aria-live="polite"
      style={{
        width: '100%', maxWidth: width, boxSizing: 'border-box', overflow: 'hidden', position: 'relative',
        borderRadius: 'var(--radius-14)', border: '1px solid var(--border-gold-strong)',
        background: 'linear-gradient(180deg,rgba(17,27,28,.97),rgba(7,11,15,.985))',
        boxShadow: 'var(--shadow-panel),var(--glow-soft)',
        animation: `${leaving ? 'navrya-pop-out 170ms var(--ease-standard)' : 'navrya-pop-in 260ms var(--ease-out)'} both`,
        transformOrigin: 'bottom center',
        ...style
      }}
      {...rest}
    >
      <span aria-hidden="true" style={{ position: 'absolute', top: 6, insetInlineEnd: 6, width: 14, height: 14, pointerEvents: 'none', borderTop: '1px solid color-mix(in srgb,var(--char-accent) 80%,transparent)', borderInlineEnd: '1px solid color-mix(in srgb,var(--char-accent) 80%,transparent)' }} />
      <span aria-hidden="true" style={{ position: 'absolute', top: 6, insetInlineStart: 6, width: 14, height: 14, pointerEvents: 'none', borderTop: '1px solid color-mix(in srgb,var(--char-accent) 80%,transparent)', borderInlineStart: '1px solid color-mix(in srgb,var(--char-accent) 80%,transparent)' }} />
      <span aria-hidden="true" style={{ position: 'absolute', bottom: 6, insetInlineEnd: 6, width: 14, height: 14, pointerEvents: 'none', borderBottom: '1px solid color-mix(in srgb,var(--char-accent) 80%,transparent)', borderInlineEnd: '1px solid color-mix(in srgb,var(--char-accent) 80%,transparent)' }} />
      <span aria-hidden="true" style={{ position: 'absolute', bottom: 6, insetInlineStart: 6, width: 14, height: 14, pointerEvents: 'none', borderBottom: '1px solid color-mix(in srgb,var(--char-accent) 80%,transparent)', borderInlineStart: '1px solid color-mix(in srgb,var(--char-accent) 80%,transparent)' }} />

      <header style={{
        position: 'relative', display: 'flex', alignItems: 'center', gap: 10,
        padding: '11px 12px 11px 14px', borderBottom: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.35)'
      }}>
        <span aria-hidden="true" style={{ position: 'absolute', top: 0, insetInlineStart: 0, insetInlineEnd: 0, height: 1, overflow: 'hidden' }}>
          <span style={{ display: 'block', width: '38%', height: 1, background: 'linear-gradient(90deg,transparent,var(--char-accent),transparent)', animation: (flip ? 'navrya-sweep-b' : 'navrya-sweep-a') + ' 760ms var(--ease-out) both' }} />
        </span>

        <span style={{ width: 28, height: 28, flex: 'none', borderRadius: 999, display: 'grid', placeItems: 'center', border: '1px solid var(--border-gold)', background: 'rgba(3,8,7,.6)', overflow: 'hidden' }}>
          {model ? <ModelGlyph model={model} size={15} /> : <Icon name="sparkle" size={13} style={{ color: 'var(--char-accent)' }} />}
        </span>
        <span style={{
          font: 'var(--type-caption)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--text-primary)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0
        }}>{model ? model.label + ' · CHAT' : title}</span>
        <span aria-hidden="true" style={{ width: 1, height: 18, background: 'var(--border-hairline)', flex: 'none' }} />
        <span style={{ font: 'var(--type-caption)', letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--text-muted)', flex: 'none' }}>
          {folded ? 'FOLDED' : STAGE_META[stage].code}
        </span>
        <span style={{ flex: 1, minWidth: 8 }} />

        <HeightStageRail stage={stage} folded={folded} onPick={goStage} labels={sizeLabels} />

        <HeaderIconButton onClick={toggleSize} label={shrinking ? sizeLabels.shrink : sizeLabels.grow}>
          <span aria-hidden="true" style={{ position: 'absolute', inset: -1, borderRadius: 11, border: '1px solid color-mix(in srgb,var(--char-accent) 55%,transparent)', animation: (flip ? 'navrya-pulse-b' : 'navrya-pulse-a') + ' 620ms var(--ease-out) both' }} />
          <span aria-hidden="true" style={{ position: 'relative', display: 'block', width: 16, height: 16, transition: 'transform 460ms cubic-bezier(.16,1,.3,1)', transform: 'rotate(' + (shrinking ? '180deg' : '0deg') + ')', color: 'var(--char-accent)' }}>
            <span style={{ position: 'absolute', top: 7, insetInlineStart: 0, width: 16, height: 2, borderRadius: 2, background: 'currentColor' }} />
            <span style={{
              position: 'absolute', top: 0, insetInlineStart: 7, width: 2, height: 16, borderRadius: 2, background: 'currentColor',
              transformOrigin: 'center', transition: 'transform 420ms cubic-bezier(.16,1,.3,1),opacity 260ms var(--ease-out)',
              transform: 'scaleY(' + (shrinking ? 0 : 1) + ')', opacity: shrinking ? 0 : 1
            }} />
          </span>
        </HeaderIconButton>

        <HeaderIconButton onClick={toggleFold} label={folded ? sizeLabels.unfold : sizeLabels.fold}>
          <span aria-hidden="true" style={{ display: 'grid', placeItems: 'center', transition: 'transform 420ms cubic-bezier(.16,1,.3,1)', transform: 'rotate(' + (folded ? '180deg' : '0deg') + ')' }}>
            <Icon name="chevron-down" size={16} />
          </span>
        </HeaderIconButton>

        {onClose && <HeaderIconButton icon="x" label={sizeLabels.close} onClick={onClose} dangerHover size={30} />}
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
          <div style={{ display: 'flex', gap: 12 }}>
            <span style={{ position: 'relative', width: 32, height: 32, flex: 'none', borderRadius: 999, display: 'grid', placeItems: 'center', border: '1px solid var(--border-gold)', background: 'rgba(3,8,7,.6)' }}>
              <span aria-hidden="true" style={{ position: 'absolute', inset: -3, borderRadius: 999, border: '1px solid color-mix(in srgb,var(--char-accent) 45%,transparent)', animation: 'navrya-halo 1400ms var(--ease-standard) infinite' }} />
              {model ? <ModelGlyph model={model} size={17} /> : <Icon name="sparkle" size={14} style={{ color: 'var(--char-accent)' }} />}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, font: 'var(--type-body)', color: 'var(--text-muted)', paddingTop: 5 }}>
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
            // on a shorter window - never viewport-relative, so it didn't scale down. The height-
            // stage tiers (STAGE_META, above) replace that one fixed number with three real,
            // user-controlled choices, still bounded by the 60vh outer wrapper above regardless of
            // stage, so FULL can never itself reopen the original overflow bug.
            style={{ display: 'flex', flexDirection: 'column', gap: 14, maxHeight: STAGE_META[stage].maxHeight, overflowY: 'auto', paddingInlineEnd: 4 }}
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
                        maxWidth: 'min(84%,560px)', boxSizing: 'border-box', padding: '11px 14px', borderRadius: 14, borderEndEndRadius: 4,
                        border: '1px solid var(--border-hairline)', background: 'rgba(244,234,215,.05)',
                        font: 'var(--type-body)', fontSize: 14, lineHeight: '25px', color: 'var(--text-primary)', textWrap: 'pretty'
                      }}>{stripMarkdownTokens(m.content)}</div>
                      {time && <span style={{ font: 'var(--type-caption)', fontSize: 11, letterSpacing: '.06em', color: 'var(--text-dim)', paddingInlineEnd: 4 }}>{time}</span>}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: 12 }}>
                      <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 30, height: 30, borderRadius: 999, display: 'grid', placeItems: 'center', border: '1px solid var(--border-gold)', background: 'rgba(3,8,7,.6)', overflow: 'hidden' }}>
                          {model ? <ModelGlyph model={model} size={16} /> : <Icon name="sparkle" size={13} style={{ color: 'var(--char-accent)' }} />}
                        </span>
                        {i < effectiveMessages.length - 1 && <span aria-hidden="true" style={{ flex: 1, width: 1, background: 'linear-gradient(180deg,var(--divider-gold),transparent)' }} />}
                      </div>
                      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          {model && <span style={{ font: 'var(--type-caption)', fontSize: 11, letterSpacing: 'var(--tracking-label)', textTransform: 'uppercase', color: 'var(--gold-warm)' }}>{model.label}</span>}
                          {(time || m.latencyMs != null) && model && <span aria-hidden="true" style={{ width: 1, height: 12, background: 'var(--border-hairline)' }} />}
                          {(time || m.latencyMs != null) && (
                            <span style={{ font: 'var(--type-caption)', fontSize: 11, letterSpacing: '.06em', color: 'var(--text-muted)' }}>
                              {time}{time && m.latencyMs != null ? ' · ' : ''}{m.latencyMs != null ? latencyText(m.latencyMs) + 's' : ''}
                            </span>
                          )}
                        </div>
                        <p dir="auto" style={{
                          margin: 0, font: 'var(--type-body)', fontSize: 14, lineHeight: '26px', color: 'var(--parchment)', textWrap: 'pretty', whiteSpace: 'pre-line',
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 1, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border-hairline)', background: 'var(--border-hairline)' }}>
            {meta.map((m, i) => { const cell = metaToStat(m); return <StatCell key={i} label={cell.label} value={cell.value} />; })}
          </div>
        )}

        {!thinking && !safety && !review && ruleApplied && ruleAppliedLabel && <RuleBanner text={ruleAppliedLabel} />}

        {!thinking && !safety && !review && effectiveMessages && lastMessage && lastMessage.role === 'assistant' && (messageActionLabels.copy || onRegenerate) && (
          <ActionRow>
            {messageActionLabels.copy && <CopyButton text={lastMessage.content} label={messageActionLabels.copy} copiedLabel={messageActionLabels.copied} />}
            {onRegenerate && lastUserMessage && <MiniButton kind="discard" icon="rotate-cw" onClick={() => onRegenerate(lastUserMessage.content)}>{messageActionLabels.regenerate}</MiniButton>}
          </ActionRow>
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
      </div>}
    </div>
  );
}

export { MiniButton, ActionRow };
