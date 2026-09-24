import React from 'react';
import { Panel } from '../public/pages/shared/navrya/components/core/Panel.jsx';
import { Icon } from '../public/pages/shared/navrya/components/core/Icon.jsx';
import { Button } from '../public/pages/shared/navrya/components/forms/Button.jsx';
import { AiErrorNotice } from './analysisProfileAiStatus.jsx';
import { toAiError } from './analysisProfileAiErrors.js';
import { trt, trDigits } from './analysisProfileTrainingCopy.js';

// The Analysis Profile "Chat" tab (ARCHITECTURE.md §7.25, Phase 4): teaching a profile through an
// ongoing conversation, exactly like Patterns/Strategies' own ChatTab (strategiesHubView.jsx) but
// backed by its own persisted history (analysis_profile_messages) and its own AI route
// (POST /api/analysis-profiles/chat). A turn (the trader's message + the engine's reply) is
// appended in ONE request, only after the billed call already succeeded - a failed call never
// stores half a turn. An assistant reply may carry proposals (a concept or a rewritten
// understanding); each is reviewed individually - Apply commits through the SAME
// store.applyLearning() funnel every other teaching path uses, Dismiss just marks it resolved.
// Tokens are recorded the moment the reply lands (a dismissed proposal still cost tokens), via one
// best-effort ledger event, exactly like the note-teaching flow.

function store() { return window.TradeJournalAnalysisProfileStore; }
function aiClient() { return window.TradeJournalAnalysisProfileAI; }
function analysisContext() { return window.TradeJournalAnalysisContext; }

function tokensOf(usage) { return usage ? (Number(usage.promptTokens) || 0) + (Number(usage.completionTokens) || 0) : 0; }

const fieldStyle = {
  boxSizing: 'border-box', padding: '11px 13px', borderRadius: 8, border: '1px solid var(--border-hairline)',
  background: 'rgba(3,8,7,.6)', color: 'var(--text-primary)', font: 'inherit', fontSize: 13, lineHeight: 1.8, outline: 'none'
};

function ProposalCard({ lang, proposal, onApply, onDismiss, busy }) {
  const resolved = proposal.status !== 'pending';
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderRadius: 10, border: '1px solid ' + (resolved ? 'var(--border-hairline)' : 'var(--divider-gold)'), background: resolved ? 'transparent' : 'rgba(183,138,74,.06)' }}>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, flex: 1 }}>
        {proposal.kind === 'concept' ? (
          <React.Fragment>
            <span dir="auto" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{proposal.title}</span>
            {proposal.description && <span dir="auto" style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>{proposal.description}</span>}
            <span style={{ fontSize: 10.5, color: 'var(--char-accent)' }}>{trt(lang, 'priority' + proposal.priority[0].toUpperCase() + proposal.priority.slice(1))}</span>
          </React.Fragment>
        ) : (
          <React.Fragment>
            <span style={{ fontSize: 10.5, color: 'var(--gold-warm)' }}>{trt(lang, 'proposalUnderstandingLabel')}</span>
            <span dir="auto" style={{ fontSize: 12.5, color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>{proposal.text}</span>
          </React.Fragment>
        )}
      </span>
      {resolved ? (
        <span style={{ fontSize: 11, color: proposal.status === 'applied' ? 'var(--success)' : 'var(--text-dim)', flex: 'none' }}>
          {trt(lang, proposal.status === 'applied' ? 'proposalApplied' : 'proposalDismissed')}
        </span>
      ) : (
        <span style={{ display: 'flex', gap: 6, flex: 'none' }}>
          <Button variant="primary" size="sm" icon="check" disabled={busy} onClick={onApply}>{trt(lang, 'proposalApplyBtn')}</Button>
          <Button variant="ghost" size="sm" icon="close" disabled={busy} onClick={onDismiss}>{trt(lang, 'proposalDismissBtn')}</Button>
        </span>
      )}
    </div>
  );
}

export function ChatTab({ profile, lang }) {
  const profiles = store();
  const [messages, setMessages] = React.useState([]);
  const [phase, setPhase] = React.useState('loading'); // loading | ready
  const [draft, setDraft] = React.useState('');
  const [sending, setSending] = React.useState(false);
  // { code, status? } of the last failed send (analysisProfileAiErrors.toAiError), or null; Retry re-runs send() with the draft the
  // trader already typed (a failed send never clears it), so the retried request is identical.
  const [error, setError] = React.useState(null);
  const [busyProposal, setBusyProposal] = React.useState(null);
  const [notice, setNotice] = React.useState('');
  const listRef = React.useRef(null);
  const aliveRef = React.useRef(true);
  React.useEffect(() => { aliveRef.current = true; return () => { aliveRef.current = false; }; }, []);

  const load = React.useCallback(() => {
    if (!profiles) return;
    profiles.listMessages(profile.id).then((list) => { if (aliveRef.current) { setMessages(list); setPhase('ready'); } }).catch(() => { if (aliveRef.current) setPhase('ready'); });
  }, [profiles, profile.id]);
  React.useEffect(() => { load(); }, [load]);
  React.useEffect(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; }, [messages.length, sending]);

  const trimmed = draft.trim();

  async function send() {
    const client = aiClient();
    const context = analysisContext();
    if (!client || !profiles || !trimmed || sending) return;
    setSending(true); setError(null);
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    try {
      const profileContext = context ? context.getAnalysisContext(profile.id) : null;
      const result = await client.chat({ message: trimmed, history, profileContext, language: lang });
      const saved = await profiles.appendMessages(profile.id, [
        { role: 'user', content: trimmed },
        { role: 'assistant', content: result.reply, proposals: result.proposals, tokenUsage: result.usage }
      ]);
      if (!aliveRef.current) return;
      setMessages((prev) => prev.concat(saved));
      setDraft('');
      // Tokens are spent the moment the reply lands, whether or not any proposal is ever applied -
      // the same honesty rule the note-teaching flow follows.
      const tokens = tokensOf(result.usage);
      if (tokens > 0) {
        profiles.recordEvent(profile.id, { kind: 'ai_analyzed_chat', title: trimmed.slice(0, 80), detail: trimmed, understandingVersion: profile.understanding.version, tokenUsage: result.usage }).catch(() => {});
      }
    } catch (caught) {
      if (aliveRef.current) setError(toAiError(caught));
    } finally { if (aliveRef.current) setSending(false); }
  }

  function resolveLocally(messageId, proposalId, status) {
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, proposals: m.proposals.map((p) => (p.id === proposalId ? { ...p, status } : p)) } : m)));
  }

  async function applyProposal(message, proposal) {
    if (!profiles || busyProposal) return;
    setBusyProposal(proposal.id);
    try {
      const patch = proposal.kind === 'concept'
        ? { conceptsToAdd: [{ title: proposal.title, description: proposal.description, priority: proposal.priority, origin: 'chat' }], eventKind: 'taught_chat', eventTitle: proposal.title, tokenUsage: null }
        : { understandingSummary: proposal.text, eventKind: 'taught_chat', eventTitle: proposal.text.slice(0, 80), tokenUsage: null };
      profiles.applyLearning(profile.id, patch);
      await profiles.resolveProposals(profile.id, message.id, { [proposal.id]: 'applied' });
      resolveLocally(message.id, proposal.id, 'applied');
    } catch (_) { /* the store already surfaced any real save failure via its own event system */ }
    finally { if (aliveRef.current) setBusyProposal(null); }
  }
  async function dismissProposal(message, proposal) {
    if (!profiles || busyProposal) return;
    setBusyProposal(proposal.id);
    try { await profiles.resolveProposals(profile.id, message.id, { [proposal.id]: 'dismissed' }); resolveLocally(message.id, proposal.id, 'dismissed'); }
    catch (_) { /* best-effort - see applyProposal's own note */ }
    finally { if (aliveRef.current) setBusyProposal(null); }
  }

  async function clearChat() {
    if (!profiles || !window.confirm(trt(lang, 'clearChatConfirm'))) return;
    await profiles.clearMessages(profile.id).catch(() => {});
    setMessages([]);
    setNotice(trt(lang, 'chatCleared'));
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.9, color: 'var(--text-muted)', maxWidth: 760 }}>{trt(lang, 'chatSubtitle')}</p>

      <Panel variant="base" padding={0}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--border-hairline)' }}>
            <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{notice || (messages.length ? '' : trt(lang, 'chatEmpty'))}</span>
            {messages.length > 0 && <span style={{ marginInlineStart: 'auto' }}><Button variant="ghost" size="sm" icon="trash" onClick={clearChat}>{trt(lang, 'clearChatBtn')}</Button></span>}
          </div>
          <div ref={listRef} className="navrya-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: 18, maxHeight: 460, overflowY: 'auto' }}>
            {phase === 'ready' && !messages.length && <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{trt(lang, 'chatEmpty')}</span>}
            {messages.map((message) => message.role === 'assistant' ? (
              <div key={message.id} style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: '84%' }}>
                <div style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
                  <span style={{ flex: 'none', width: 30, height: 30, borderRadius: 8, display: 'grid', placeItems: 'center', color: 'var(--char-accent)', border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.5)' }}><Icon name="sparkle" size={15} /></span>
                  {message.content && <span dir="auto" style={{ display: 'block', padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.5)', fontSize: 13, lineHeight: 2, color: 'var(--text-primary)' }}>{message.content}</span>}
                </div>
                {tokensOf(message.tokenUsage) > 0 && <span style={{ fontSize: 10.5, color: 'var(--text-dim)', paddingInlineStart: 41 }}>{trt(lang, 'chatTokensUsed', { n: trDigits(lang, tokensOf(message.tokenUsage).toLocaleString('en-US')) })}</span>}
                {message.proposals && message.proposals.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingInlineStart: 41 }}>
                    <span style={{ fontSize: 11, color: 'var(--gold-warm)' }}>{trt(lang, 'proposalsTitle')}</span>
                    {message.proposals.map((proposal) => (
                      <ProposalCard key={proposal.id} lang={lang} proposal={proposal} busy={busyProposal === proposal.id}
                        onApply={() => applyProposal(message, proposal)} onDismiss={() => dismissProposal(message, proposal)} />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div key={message.id} style={{ display: 'flex', maxWidth: '84%', marginInlineStart: 'auto' }}>
                <span dir="auto" style={{ display: 'block', padding: '12px 14px', borderRadius: 10, border: '1px solid color-mix(in srgb, var(--char-accent) 40%, transparent)', background: 'var(--char-active-surface)', fontSize: 13, lineHeight: 2, color: 'var(--text-primary)' }}>{message.content}</span>
              </div>
            ))}
            {sending && <span style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>{trt(lang, 'chatSending')}</span>}
            <AiErrorNotice lang={lang} error={error} onRetry={send} busy={sending} />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, padding: '14px 18px', borderTop: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.35)' }}>
            <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} dir="auto" disabled={sending} maxLength={4000}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={trt(lang, 'chatPlaceholder')} style={{ ...fieldStyle, flex: 1, minWidth: 0, resize: 'vertical' }} />
            <Button variant="primary" icon="arrow-up" loading={sending} disabled={!trimmed || sending} onClick={send}>{trt(lang, 'chatSend')}</Button>
          </div>
        </div>
      </Panel>
    </div>
  );
}
