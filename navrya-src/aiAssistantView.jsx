import React from 'react';
import { createRoot } from 'react-dom/client';
import { Panel } from '../public/pages/shared/navrya/components/core/Panel.jsx';
import { Icon } from '../public/pages/shared/navrya/components/core/Icon.jsx';
import { Select } from '../public/pages/shared/navrya/components/forms/Select.jsx';
import { TextField } from '../public/pages/shared/navrya/components/forms/TextField.jsx';
import { Button } from '../public/pages/shared/navrya/components/forms/Button.jsx';
import { Chip } from '../public/pages/shared/navrya/components/forms/Chip.jsx';
import { Notice } from '../public/pages/shared/navrya/components/feedback/Notice.jsx';
import { MetricTile } from '../public/pages/shared/navrya/components/metrics/MetricTile.jsx';
import { Toggle } from '../public/pages/shared/navrya/components/forms/Toggle.jsx';
import { ModelGlyph } from '../public/pages/shared/navrya/components/assistant/ModelSwitcher.jsx';
import { memorySnapshot, clearChatHistory, providerLabel } from './aiSettingsAdapter.js';
import { currentNavryaCharacter } from './currentCharacter.js';
// Panel Builder moved here from Settings (it's an AI capability, not a setting) - reuses the
// exact same real board record/APIs Settings' own ManagePanelsSection and the real Dashboard
// already read/write, never a second board representation.
import { SPANS, loadBoard, saveBoard, catalogForLang, resolveCustomEntry, addCustomPanel } from './dashboardView.jsx';

function fmtUsd(microUsd) { return '$' + ((Number(microUsd) || 0) / 1000000).toFixed(4); }

function compact(n) {
  const v = Number(n || 0);
  if (v >= 1000000) return (v / 1000000).toFixed(2) + 'M';
  if (v >= 1000) return Math.round(v / 1000) + 'K';
  return String(v);
}

function glyphModel(entry) { return entry ? { id: entry.id, trait: entry.trait, knockout: entry.knockout } : null; }

// The two toggles this screen uses (VOICE MODE, REMEMBER) are a bespoke 46x26 shape the design
// hands over as raw markup, not the app's generic 42x24 Toggle - recreated verbatim rather than
// re-skinning the shared component, per the handoff's "nothing here should be re-styled by eye".
function BigToggle({ checked, onChange, ariaLabel }) {
  return (
    <button
      type="button" onClick={() => onChange(!checked)} aria-label={ariaLabel} aria-pressed={checked}
      style={{
        width: 46, height: 26, flex: 'none', boxSizing: 'border-box', borderRadius: 999,
        border: '1px solid ' + (checked ? 'color-mix(in srgb, var(--char-accent) 70%, transparent)' : 'var(--border-gold)'),
        background: checked ? 'var(--char-active-surface)' : 'rgba(3,8,7,.55)',
        display: 'flex', alignItems: 'center', justifyContent: checked ? 'flex-end' : 'flex-start',
        padding: 2, cursor: 'pointer', transition: 'background var(--dur-hover) var(--ease-out), border-color var(--dur-hover) var(--ease-out)'
      }}
    >
      <span style={{ width: 20, height: 20, borderRadius: 999, background: checked ? 'var(--char-accent)' : 'var(--text-disabled)', display: 'block' }}></span>
    </button>
  );
}

function EngineTabStrip({ catalog, model, aiTab, usageMonthByProvider, onSelectEngine, onSelectKeys, i18n }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 8, border: '1px solid var(--border-gold)', borderRadius: 12, background: 'var(--surface-card)', boxShadow: 'var(--shadow-panel)' }}>
      {catalog.map((entry) => {
        // Stays highlighted even while the PERSONAL KEY tab is open (the handoff's own
        // requirement: "always clear which engine the key belongs to") - only aiTab itself
        // decides which panel renders below, not which engine tab looks selected.
        const selected = entry.id === model;
        const month = (usageMonthByProvider[entry.id] && usageMonthByProvider[entry.id].totalTokens) || 0;
        return (
          <button
            key={entry.id} type="button" onClick={() => onSelectEngine(entry.id)}
            style={{
              boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 10, height: 52, padding: '0 16px',
              borderRadius: 8, cursor: 'pointer', font: 'var(--type-body)', letterSpacing: '.06em', textTransform: 'uppercase',
              border: selected ? '2px solid var(--char-accent)' : '1px solid transparent',
              background: selected ? 'var(--char-active-surface)' : 'transparent',
              boxShadow: selected ? 'var(--glow-active)' : 'none',
              color: selected ? 'var(--char-accent)' : 'var(--text-muted)',
              transition: 'background var(--dur-hover) var(--ease-out), border-color var(--dur-hover) var(--ease-out), color var(--dur-hover) var(--ease-out)'
            }}
          >
            <ModelGlyph model={glyphModel(entry)} size={20} animate={selected} muted={!selected} />
            {providerLabel(i18n, entry.id)}
            <span className="navrya-tabular" style={{ font: 'var(--type-caption)', letterSpacing: '.06em', color: selected ? 'var(--text-muted)' : 'var(--text-dim)', opacity: selected ? 1 : 0.72 }}>
              {compact(month) + ' / MO'}
            </span>
          </button>
        );
      })}
      <span aria-hidden="true" style={{ width: 1, height: 28, background: 'var(--divider-gold)', marginInlineStart: 'auto' }}></span>
      <button
        type="button" onClick={onSelectKeys}
        style={{
          boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 10, height: 52, padding: '0 18px',
          borderRadius: 8, cursor: 'pointer', font: 'var(--type-body)', letterSpacing: '.06em', textTransform: 'uppercase',
          border: aiTab === 'keys' ? '2px solid var(--char-accent)' : '1px solid var(--border-gold)',
          background: aiTab === 'keys' ? 'var(--char-active-surface)' : 'rgba(11,20,21,.72)',
          boxShadow: aiTab === 'keys' ? 'var(--glow-active)' : 'none',
          color: aiTab === 'keys' ? 'var(--char-accent)' : 'var(--text-muted)',
          transition: 'background var(--dur-hover) var(--ease-out), border-color var(--dur-hover) var(--ease-out), color var(--dur-hover) var(--ease-out)'
        }}
      >
        <Icon name="key" size={18} />
        {i18n.t('aiAsstPersonalKeyTab')}
      </button>
    </div>
  );
}

function fmtChatDate(i18n, value) {
  try { return new Intl.DateTimeFormat(i18n.locale(), { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(value)); }
  catch (_) { return ''; }
}

// `chat` is the lightweight list summary (id/title/messageCount/tokens/updatedAt - no message
// bodies); `detail` is the full { messages: [{role,content}] } record, fetched lazily by the
// parent only once this row is expanded (avoids an N-conversation fetch just to render the list).
function ChatRow({ chat, engineGlyph, expanded, detail, onToggle, onDelete, onContinue, i18n }) {
  return (
    <div style={{ border: '1px solid var(--border-hairline)', borderRadius: 8, background: 'rgba(11,20,21,.55)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        <span style={{ width: 34, height: 34, flex: 'none', borderRadius: 999, border: '1px solid var(--border-gold)', background: 'rgba(3,8,7,.55)', display: 'grid', placeItems: 'center' }}>
          <ModelGlyph model={engineGlyph} size={16} />
        </span>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
          <span style={{ font: 'var(--type-username)', color: 'var(--text-primary)' }}>{chat.title}</span>
          <span className="navrya-tabular" style={{ font: 'var(--type-caption)', letterSpacing: 'var(--tracking-label)', color: 'var(--text-dim)', textTransform: 'uppercase' }}>
            {i18n.t('aiAsstMessagesTokensMeta', { date: fmtChatDate(i18n, chat.updatedAt), messages: chat.messageCount, tokens: i18n.number(chat.tokens || 0) })}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
          <Button variant="primary" size="sm" icon="square-pen" onClick={onContinue}>{i18n.t('aiAsstContinueInDock')}</Button>
          <Button variant="secondary" size="sm" onClick={onToggle}>{expanded ? i18n.t('aiAsstClose') : i18n.t('aiAsstOpen')}</Button>
          <Button variant="danger" size="sm" icon="trash" onClick={onDelete}></Button>
        </div>
      </div>
      {expanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--border-hairline)', paddingTop: 12 }}>
          {!detail ? (
            <span style={{ font: 'var(--type-body)', color: 'var(--text-muted)' }}>{i18n.t('aiDockHistoryLoading')}</span>
          ) : (detail.messages || []).map((line, i) => (
            <div key={i} style={{ display: 'flex', gap: 14 }}>
              <span style={{ width: 76, flex: 'none', font: 'var(--type-caption)', letterSpacing: 'var(--tracking-label)', color: 'var(--char-accent)', textTransform: 'uppercase' }}>
                {line.role === 'user' ? i18n.t('aiDockYou') : i18n.t('aiDockAssistant')}
              </span>
              <span style={{ flex: 1, font: 'var(--type-body)', color: 'var(--text-primary)', textWrap: 'pretty' }}>{line.content}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Top-level page tabs (Dashboard/Engines/Persona/Panel Builder/Costs/Memory/Activity). Separate
// from the Engines tab's OWN internal engine/keys sub-tab (EngineTabStrip above), which is
// unaffected by this.
// ============================================================================
const TOP_TABS = [
  { id: 'dashboard', icon: 'dashboard', key: 'aiTabDashboard' },
  { id: 'engines', icon: 'ai-assistant', key: 'aiTabEngines' },
  { id: 'persona', icon: 'sparkle', key: 'aiTabPersona' },
  { id: 'panelbuilder', icon: 'report', key: 'aiTabPanelBuilder' },
  { id: 'costs', icon: 'wallet', key: 'aiTabCosts' },
  { id: 'memory', icon: 'psychology', key: 'aiTabMemory' },
  { id: 'activity', icon: 'streak', key: 'aiTabActivity' }
];
function TopTabs({ active, onSelect, i18n }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: 5, borderRadius: 12, border: '1px solid var(--border-gold)', background: 'rgba(3,8,7,.62)', alignSelf: 'flex-start', flexWrap: 'wrap' }}>
      {TOP_TABS.map((tab) => {
        const on = active === tab.id;
        return (
          <button
            key={tab.id} type="button" onClick={() => onSelect(tab.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, height: 40, padding: '0 15px', borderRadius: 8,
              font: 'var(--type-body)', color: on ? 'var(--text-primary)' : 'var(--text-muted)', cursor: 'pointer',
              border: '1px solid ' + (on ? 'color-mix(in srgb, var(--char-accent) 60%, transparent)' : 'transparent'),
              background: on ? 'var(--char-active-surface)' : 'transparent',
              boxShadow: on ? 'var(--glow-active)' : 'none', whiteSpace: 'nowrap'
            }}
          >
            <Icon name={tab.icon} size={16} />
            {i18n.t(tab.key)}
          </button>
        );
      })}
    </div>
  );
}

// ============================================================================
// Dashboard tab - quick access + real summary numbers. No fabricated data: every figure here is
// already computed by the parent from real stores (usage/chats/catalog); the wallet balance and
// runway are their own real fetches (/api/sync/wallet, /api/users/me/ai-usage-by-model?days=30).
// ============================================================================
// Shared "coming soon" pill (design's `.soonbadge` - dashed gold-warm border, never Chip's solid
// neutral tone) and the header/footer note box (`.needs`) every not-yet-real card ends with -
// reused across Dashboard/Persona/Memory/Activity.
function SoonBadge({ i18n }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', height: 22, padding: '0 9px', borderRadius: 5, fontSize: 10, lineHeight: '14px', letterSpacing: '.06em', color: 'var(--gold-warm)', border: '1px dashed rgba(214,175,107,.5)', background: 'rgba(214,175,107,.08)', flex: 'none' }}>
      {i18n.t('aiComingSoon')}
    </span>
  );
}
function NeedsNote({ i18n, textKey }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: '10px 12px', borderRadius: 8, border: '1px solid rgba(214,175,107,.24)', background: 'rgba(214,175,107,.05)' }}>
      <Icon name="triangle-alert" size={14} style={{ color: 'var(--gold-warm)', marginTop: 2, flex: 'none' }} />
      <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{i18n.t(textKey)}</span>
    </div>
  );
}
// The `.ph` header bar every design panel uses: leading accent icon, `.ph-t` title, flex spacer,
// optional trailing content (a chip, a soon-badge, a caption).
function PanelHeader({ icon, iconColor = 'var(--char-accent)', title, trailing }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px', borderBottom: '1px solid var(--border-hairline)' }}>
      <Icon name={icon} size={20} style={{ color: iconColor, flex: 'none' }} />
      <span style={{ font: '700 11px/14px var(--font-ui)', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-primary)' }}>{title}</span>
      <span style={{ flex: 1 }} />
      {trailing}
    </div>
  );
}
function GoLink({ i18n, textKey, onClick }) {
  return (
    <button type="button" onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'transparent', border: 0, padding: 0, cursor: 'pointer', color: 'var(--char-accent)', font: '500 11px/14px var(--font-ui)', letterSpacing: '.06em' }}>
      {i18n.t(textKey)}
      <Icon name="chevron-left" size={14} />
    </button>
  );
}

function DashQuickCard({ i18n, icon, titleKey, hintKey, goKey, onGo, soon, trailingChip, children }) {
  const badgeStyle = soon
    ? { border: '1px dashed rgba(214,175,107,.4)', background: 'rgba(214,175,107,.08)', color: 'var(--gold-warm)' }
    : { border: '1px solid var(--divider-gold)', background: 'var(--char-active-surface)', color: 'var(--char-accent)' };
  return (
    <Panel variant="base" padding="16px 18px" style={{ display: 'flex', flexDirection: 'column', gap: 13, cursor: 'pointer' }} onClick={onGo}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <span style={{ width: 36, height: 36, borderRadius: 9, display: 'grid', placeItems: 'center', flex: 'none', ...badgeStyle }}><Icon name={icon} size={20} /></span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
          <span style={{ fontWeight: 600, fontSize: 15, lineHeight: '22px', color: 'var(--text-primary)' }}>{i18n.t(titleKey)}</span>
          <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{i18n.t(hintKey)}</span>
        </span>
        {trailingChip}
        {soon && <SoonBadge i18n={i18n} />}
      </div>
      {children}
      {goKey && <GoLink i18n={i18n} textKey={goKey} onClick={(e) => { e.stopPropagation(); onGo(); }} />}
    </Panel>
  );
}

function DashboardTab({ i18n, catalog, model, usageMonth, usageToday, realCostByModel, chats, memory, memoryRows, character, engGlyph, walletBalanceUsd, walletRunwayDays, onSelectEngine, onGoTab, onNewChat, onContinueChat }) {
  const monthTokens = Object.values(usageMonth.byProvider || {}).reduce((sum, p) => sum + (p.totalTokens || 0), 0);
  const avgTokens = chats.length ? Math.round(chats.reduce((sum, c) => sum + (c.tokens || 0), 0) / chats.length) : 0;
  const monthCostUsd = (realCostByModel || []).reduce((sum, r) => sum + (Number(r.retailChargeMicroUsd) || 0), 0) / 1000000;
  const aiSettingsForKeys = window.TradeJournalAISettingsStore;
  const board = React.useMemo(() => loadBoard(character), [character]);
  const personaStore = window.TradeJournalAICompanionProfile;
  const persona = React.useMemo(() => (personaStore ? { tone: personaStore.toneDimensions(), preset: personaStore.personaPreset() } : null), [personaStore]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Panel variant="prestige" ornament padding={0}>
        <div style={{ display: 'flex', alignItems: 'stretch', flexWrap: 'wrap' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0,1fr))', flex: '1 1 480px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '20px 18px' }}>
              <Icon name="calendar" size={24} style={{ color: 'var(--char-accent)' }} />
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><span style={{ font: 'var(--type-metric-label)', letterSpacing: 'var(--tracking-label)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{i18n.t('aiAsstThisMonth')}</span><span className="navrya-tabular" style={{ fontWeight: 600, fontSize: 22, lineHeight: '26px', color: 'var(--parchment)' }}>{i18n.number(monthTokens)}</span></span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '20px 18px', borderInlineStart: '1px solid var(--border-hairline)' }}>
              <Icon name="streak" size={24} style={{ color: 'var(--char-accent)' }} />
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><span style={{ font: 'var(--type-metric-label)', letterSpacing: 'var(--tracking-label)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{i18n.t('aiAsstToday')}</span><span className="navrya-tabular" style={{ fontWeight: 600, fontSize: 22, lineHeight: '26px', color: 'var(--parchment)' }}>{i18n.number((usageToday && usageToday.totalTokens) || 0)}</span></span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '20px 18px', borderInlineStart: '1px solid var(--border-hairline)' }}>
              <Icon name="coins" size={24} style={{ color: 'var(--char-accent)' }} />
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><span style={{ font: 'var(--type-metric-label)', letterSpacing: 'var(--tracking-label)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{i18n.t('aiDashCostsHint')}</span><span className="navrya-tabular" style={{ fontWeight: 600, fontSize: 22, lineHeight: '26px', color: 'var(--parchment)' }}>{'$' + monthCostUsd.toFixed(4)}</span></span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '20px 18px', borderInlineStart: '1px solid var(--border-hairline)' }}>
              <Icon name="message-circle" size={24} style={{ color: 'var(--char-accent)' }} />
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><span style={{ font: 'var(--type-metric-label)', letterSpacing: 'var(--tracking-label)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{i18n.t('aiAsstChatHistory')}</span><span className="navrya-tabular" style={{ fontWeight: 600, fontSize: 22, lineHeight: '26px', color: 'var(--parchment)' }}>{i18n.number(chats.length)}</span></span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '20px 18px', borderInlineStart: '1px solid var(--border-hairline)' }}>
              <Icon name="target" size={24} style={{ color: 'var(--char-accent)' }} />
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><span style={{ font: 'var(--type-metric-label)', letterSpacing: 'var(--tracking-label)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{i18n.t('aiAsstAvgPerChat')}</span><span className="navrya-tabular" style={{ fontWeight: 600, fontSize: 22, lineHeight: '26px', color: 'var(--parchment)' }}>{i18n.number(avgTokens)}</span></span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', borderInlineStart: '1px solid var(--divider-gold)', background: 'rgba(3,8,7,.42)', flex: 'none', width: 296 }}>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
              <span style={{ font: 'var(--type-metric-label)', letterSpacing: 'var(--tracking-label)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{i18n.t('aiDashWalletLabel')}</span>
              <span className="navrya-tabular" style={{ fontWeight: 600, fontSize: 22, lineHeight: '26px', color: 'var(--success)' }}>{walletBalanceUsd == null ? '—' : '$' + walletBalanceUsd.toFixed(2)}</span>
              {walletRunwayDays != null && <span style={{ font: 'var(--type-caption)', color: 'var(--text-dim)' }}>{i18n.t('aiDashWalletRunway', { days: i18n.number(walletRunwayDays) })}</span>}
            </span>
            <Button variant="secondary" size="sm" icon="plus" onClick={() => { location.hash = '#account/profile/subscriptions'; }}>{i18n.t('aiDashTopUp')}</Button>
          </div>
        </div>
      </Panel>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,7fr) minmax(0,5fr)', gap: 16, alignItems: 'start' }}>
        <Panel variant="base" padding={0}>
          <PanelHeader icon="grid" title={i18n.t('aiTabEngines')} trailing={<span style={{ font: 'var(--type-caption)', color: 'var(--text-dim)' }}>{i18n.t('aiDashEnginesHint')}</span>} />
          <div style={{ padding: '16px 20px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 12 }}>
              {catalog.map((entry) => {
                const on = entry.id === model;
                const monthP = (usageMonth.byProvider[entry.id] && usageMonth.byProvider[entry.id].totalTokens) || 0;
                const modelRow = (realCostByModel || []).find((r) => r.provider === entry.id);
                const configured = aiSettingsForKeys ? !!aiSettingsForKeys.getKey(entry.id) : false;
                const off = !on && !configured;
                return (
                  <Panel
                    key={entry.id} as="button" type="button" onClick={() => onSelectEngine(entry.id)}
                    variant={on ? 'active' : 'raised'} ornament={on} padding={14}
                    style={{ textAlign: 'start', cursor: 'pointer', opacity: off ? .62 : 1 }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                          <span style={{ width: 40, height: 40, borderRadius: 10, display: 'grid', placeItems: 'center', flex: 'none', border: '1px solid ' + (on ? 'var(--char-accent)' : 'var(--border-gold)'), background: on ? 'var(--char-active-surface)' : 'rgba(3,8,7,.6)', color: on ? 'var(--char-accent)' : 'var(--text-muted)' }}>
                            <ModelGlyph model={glyphModel(entry)} size={21} muted={!on} />
                          </span>
                          <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                            <span style={{ fontWeight: 600, fontSize: 15, lineHeight: '22px', color: 'var(--text-primary)' }}>{providerLabel(i18n, entry.id)}</span>
                            <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{entry.id}</span>
                          </span>
                        </span>
                        {on ? <Chip tone="accent" dot>{i18n.t('aiAsstActive')}</Chip> : <Chip tone="neutral">{i18n.t('aiAsstSelect')}</Chip>}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                        <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}><span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{i18n.t('aiAsstThisMonth')}</span><span className="navrya-tabular" style={{ fontWeight: 600, fontSize: 17, lineHeight: '22px', color: 'var(--parchment)' }}>{i18n.number(monthP)}</span></span>
                        <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}><span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{i18n.t('aiAsstRealCostTitle')}</span><span className="navrya-tabular" style={{ fontWeight: 600, fontSize: 17, lineHeight: '22px', color: 'var(--parchment)' }}>{modelRow ? fmtUsd(modelRow.retailChargeMicroUsd) : '$0.0000'}</span></span>
                        <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}><span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{i18n.t('aiAsstModelLabel')}</span><span style={{ font: 'var(--type-body)', color: 'var(--text-primary)' }}>{(modelRow && modelRow.model) || (entry.models && entry.models[0]) || '—'}</span></span>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {configured
                          ? <Chip tone="gold"><Icon name="key" size={12} />{i18n.t('aiAsstStored')}</Chip>
                          : on ? <Chip tone="neutral"><Icon name="key" size={12} />{i18n.t('aiAsstPlatformKey')}</Chip>
                          : <Chip tone="warning"><Icon name="key" size={12} />{i18n.t('aiAsstNotSet')}</Chip>}
                        {entry.supportsVoice
                          ? <Chip tone="success"><Icon name="mic" size={12} />{i18n.t('aiAsstVoiceMode')}</Chip>
                          : <span style={{ opacity: .6, display: 'inline-flex', alignItems: 'center', gap: 6, font: 'var(--type-caption)', color: 'var(--text-muted)' }}><Icon name="mic" size={12} />{i18n.t('aiAsstVoiceTextOnly')}</span>}
                      </div>
                    </div>
                  </Panel>
                );
              })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <GoLink i18n={i18n} textKey="aiDashEnginesManageAll" onClick={() => onGoTab('engines')} />
            </div>
          </div>
        </Panel>

        <Panel variant="base" padding={0}>
          <PanelHeader icon="message-circle" title={i18n.t('aiAsstChatHistory')} trailing={<Chip tone="neutral">{providerLabel(i18n, model)}</Chip>} />
          <div style={{ padding: '16px 20px 20px', display: 'flex', flexDirection: 'column', gap: 9, flex: 1 }}>
            <Button variant="primary" icon="plus" style={{ height: 40 }} onClick={onNewChat}>{i18n.t('aiAsstNewConversation')}</Button>
            {chats.length ? (
              <div className="navrya-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 280, overflowY: 'auto', paddingInlineEnd: 4 }}>
                {chats.slice(0, 5).map((chat) => (
                  <div key={chat.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.45)' }}>
                    <span style={{ width: 30, height: 30, borderRadius: 8, display: 'grid', placeItems: 'center', flex: 'none', border: '1px solid var(--divider-gold)', color: 'var(--char-accent)' }}><Icon name="message-circle" size={16} /></span>
                    <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <span style={{ font: 'var(--type-body)', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{chat.title}</span>
                      <span className="navrya-tabular" style={{ font: 'var(--type-caption)', color: 'var(--text-dim)' }}>{i18n.t('aiAsstMessagesTokensMeta', { date: fmtChatDate(i18n, chat.updatedAt), messages: chat.messageCount, tokens: i18n.number(chat.tokens || 0) })}</span>
                    </span>
                    <button type="button" onClick={() => onContinueChat(chat)} style={{ height: 30, display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px', borderRadius: 6, border: '1px solid transparent', background: 'rgba(244,234,215,.04)', color: 'var(--text-primary)', cursor: 'pointer', font: 'var(--type-caption)' }}><Icon name="edit" size={14} />{i18n.t('aiAsstContinueInDock')}</button>
                  </div>
                ))}
              </div>
            ) : (
              <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{i18n.t('aiAsstNoConversationsYet')}</span>
            )}
            <span style={{ flex: 1 }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingTop: 3 }}>
              <span style={{ font: 'var(--type-caption)', color: 'var(--text-dim)' }}>{i18n.t('aiAsstKeptForOnly', { engine: providerLabel(i18n, model) })}</span>
              <GoLink i18n={i18n} textKey="aiDashAllConversations" onClick={() => onGoTab('engines')} />
            </div>
          </div>
        </Panel>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 16 }}>
        <DashQuickCard i18n={i18n} icon="sparkle" titleKey="aiTabPersona" hintKey="aiDashPersonaHint" goKey="aiDashPersonaGo" onGo={() => onGoTab('persona')}
          trailingChip={persona && persona.preset ? <Chip tone="accent">{i18n.t('aiPersonaPreset' + persona.preset.charAt(0).toUpperCase() + persona.preset.slice(1) + 'Name')}</Chip> : undefined}
        >
          {persona && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {[['aiPersonaDimExplicitness', persona.tone.explicitness], ['aiPersonaDimDetail', persona.tone.detail], ['aiPersonaDimInitiative', 50]].map(([labelKey, pct]) => (
                <span key={labelKey} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <span style={{ width: 52, flex: 'none', font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{i18n.t(labelKey)}</span>
                  <span style={{ flex: 1, height: 6, borderRadius: 3, background: 'rgba(244,234,215,.07)', overflow: 'hidden', display: 'block' }}><span style={{ display: 'block', height: '100%', borderRadius: 3, width: pct + '%', background: 'var(--char-accent)' }} /></span>
                </span>
              ))}
            </div>
          )}
        </DashQuickCard>
        <DashQuickCard i18n={i18n} icon="wallet" titleKey="aiTabCosts" hintKey="aiDashCostsHint" goKey="aiDashCostsGo" onGo={() => onGoTab('costs')}>
          <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
            <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{i18n.t('aiDashCostsHint')}</span>
            <span className="navrya-tabular" style={{ fontWeight: 600, fontSize: 17, lineHeight: '22px', color: 'var(--parchment)' }}>{'$' + monthCostUsd.toFixed(4)}</span>
          </span>
        </DashQuickCard>
        <DashQuickCard i18n={i18n} icon="psychology" titleKey="aiTabMemory" hintKey="aiDashMemoryHint" goKey="aiDashMemoryGo" onGo={() => onGoTab('memory')}>
          {memoryRows && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {memoryRows.map((row) => {
                const pct = Math.min(100, row.count);
                return (
                  <span key={row.id} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <span style={{ width: 62, flex: 'none', font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{row.label}</span>
                    <span style={{ flex: 1, height: 6, borderRadius: 3, background: 'rgba(244,234,215,.07)', overflow: 'hidden', display: 'block' }}><span style={{ display: 'block', height: '100%', borderRadius: 3, width: pct + '%', background: 'var(--char-accent)' }} /></span>
                    <span className="navrya-tabular" style={{ width: 28, flex: 'none', textAlign: 'end', font: 'var(--type-caption)', color: 'var(--text-dim)' }}>{i18n.number(row.count)}</span>
                  </span>
                );
              })}
            </div>
          )}
        </DashQuickCard>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 16 }}>
        <DashQuickCard i18n={i18n} icon="layout-template" titleKey="aiTabPanelBuilder" hintKey="aiDashPanelHint" goKey="aiDashPanelGo" onGo={() => onGoTab('panelbuilder')}
          trailingChip={<Chip tone="accent">{i18n.t('aiDashPanelCount', { n: i18n.number(board.board.length) })}</Chip>}
        >
          <div style={{ display: 'flex', gap: 9 }}>
            {board.board.slice(0, 3).map((id) => (
              <span key={id} style={{ height: 44, flex: 1, borderRadius: 6, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.5)', display: 'flex', alignItems: 'center', gap: 7, padding: '0 9px', minWidth: 0 }}>
                <Icon name="report" size={16} style={{ color: 'var(--char-accent)', flex: 'none' }} />
                <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{id}</span>
              </span>
            ))}
          </div>
        </DashQuickCard>
        <DashQuickCard i18n={i18n} icon="streak" titleKey="aiTabActivity" hintKey="aiDashActivityHint" goKey={null} onGo={() => onGoTab('activity')} soon>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 9 }}>
            {['aiActivitySoonAnalyses', 'aiActivitySoonCharts', 'aiActivitySoonVoice', 'aiActivitySoonLeaderboard'].map((k, i) => (
              <span key={k} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{i18n.t(k)}</span>
                <span style={{ display: 'block', height: 9, borderRadius: 4, background: 'rgba(244,234,215,.06)', width: [64, 48, 72, 40][i] + '%' }} />
              </span>
            ))}
          </div>
        </DashQuickCard>
      </div>
    </div>
  );
}

// ============================================================================
// Persona tab - presets, six tone dimensions (five new + initiative, which writes through the
// EXISTING preferences.initiativePreference field), a free-text style prompt, and pinned facts.
// Everything here is real: it persists to ai-companion-profile.js's companion-state document and
// is actually threaded into the dock's system prompt server-side (pattern-ai-server.mjs's
// buildPersonaStyleText()) - "Try it" below is a genuine /api/ai/chat call, not a mock.
// ============================================================================
const PERSONA_PRESETS = [
  { id: 'coach', nameKey: 'aiPersonaPresetCoachName', descKey: 'aiPersonaPresetCoachDesc', icon: 'target', tone: { explicitness: 88, detail: 40, warmth: 20, initiative: 72, humor: 15, jargon: 30 } },
  { id: 'analyst', nameKey: 'aiPersonaPresetAnalystName', descKey: 'aiPersonaPresetAnalystDesc', icon: 'report', tone: { explicitness: 70, detail: 48, warmth: 12, initiative: 34, humor: 8, jargon: 55 } },
  { id: 'calm', nameKey: 'aiPersonaPresetCalmName', descKey: 'aiPersonaPresetCalmDesc', icon: 'shield', tone: { explicitness: 24, detail: 62, warmth: 82, initiative: 46, humor: 40, jargon: 20 } },
  { id: 'prof', nameKey: 'aiPersonaPresetProfName', descKey: 'aiPersonaPresetProfDesc', icon: 'book', tone: { explicitness: 46, detail: 95, warmth: 44, initiative: 58, humor: 22, jargon: 88 } }
];
// Order matches the design exactly: explicitness, detail, warmth, INITIATIVE, humor, jargon.
// initiative renders as a normal continuous rail like every other dimension - it is only bucketed
// to the real 'low'/'normal'/'high' preferences.initiativePreference field on save().
const PERSONA_DIMENSIONS = [
  { key: 'explicitness', nameKey: 'aiPersonaDimExplicitness', loKey: 'aiPersonaDimExplicitnessLo', hiKey: 'aiPersonaDimExplicitnessHi' },
  { key: 'detail', nameKey: 'aiPersonaDimDetail', loKey: 'aiPersonaDimDetailLo', hiKey: 'aiPersonaDimDetailHi' },
  { key: 'warmth', nameKey: 'aiPersonaDimWarmth', loKey: 'aiPersonaDimWarmthLo', hiKey: 'aiPersonaDimWarmthHi' },
  { key: 'initiative', nameKey: 'aiPersonaDimInitiative', loKey: 'aiPersonaDimInitiativeLo', hiKey: 'aiPersonaDimInitiativeHi' },
  { key: 'humor', nameKey: 'aiPersonaDimHumor', loKey: 'aiPersonaDimHumorLo', hiKey: 'aiPersonaDimHumorHi' },
  { key: 'jargon', nameKey: 'aiPersonaDimJargon', loKey: 'aiPersonaDimJargonLo', hiKey: 'aiPersonaDimJargonHi' }
];
function bucketInitiative(v) { return v <= 34 ? 'low' : v >= 66 ? 'high' : 'normal'; }
function initiativeFromBucket(b) { return b === 'low' ? 20 : b === 'high' ? 80 : 50; }

// The design's custom rail+thumb slider (never a native OS control, which can't produce this
// track height/thumb ring/fill direction consistently across browsers). A fully transparent real
// <input type="range"> sits on top for drag/keyboard/a11y; the rail below it is the visual layer
// only. `right:` is intentionally a physical (not logical) property - the design's own `.rail b`
// anchors to the physical right edge, matching this RTL-authored page's fill direction exactly.
function RailSlider({ value, onChange }) {
  return (
    <div style={{ position: 'relative', height: 14 }}>
      <div style={{ position: 'absolute', top: '50%', marginTop: -4, left: 0, right: 0, height: 8, borderRadius: 4, background: 'rgba(244,234,215,.07)' }} />
      <div style={{ position: 'absolute', top: '50%', marginTop: -4, right: 0, height: 8, borderRadius: 4, background: 'var(--char-accent)', width: value + '%', transition: 'width .28s cubic-bezier(.2,.7,.3,1)' }} />
      <div style={{ position: 'absolute', top: '50%', width: 14, height: 14, marginTop: -7, marginRight: -7, right: value + '%', borderRadius: '50%', background: 'var(--parchment)', border: '2px solid var(--char-accent)', boxShadow: '0 2px 6px rgba(0,0,0,.5)', transition: 'right .28s cubic-bezier(.2,.7,.3,1)' }} />
      <input
        type="range" min={0} max={100} value={value} onChange={(e) => onChange(Number(e.target.value))}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', margin: 0, opacity: 0, cursor: 'pointer' }}
      />
    </div>
  );
}

function PinnedFactsCard({ i18n }) {
  const store = window.TradeJournalAICompanionProfile;
  const [facts, setFacts] = React.useState(() => (store ? store.pinnedFacts() : []));
  const [draft, setDraft] = React.useState('');
  function add() {
    const text = draft.trim();
    if (!text || !store) return;
    setFacts(store.addPinnedFact(text).pinnedFacts);
    setDraft('');
  }
  function remove(index) {
    if (!store) return;
    setFacts(store.removePinnedFact(index).pinnedFacts);
  }
  return (
    <Panel variant="prestige" ornament padding="18px 20px 20px">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ font: 'var(--type-section-label)', letterSpacing: 'var(--tracking-label)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{i18n.t('aiPinnedTitle')}</span>
          <Chip tone="accent">{i18n.t('aiPinnedCounter', { n: i18n.number(facts.length), max: i18n.number(10) })}</Chip>
        </div>
        <p style={{ margin: 0, font: 'var(--type-caption)', color: 'var(--text-muted)', textWrap: 'pretty' }}>{i18n.t('aiPinnedHint')}</p>
        {facts.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {facts.map((f, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 12px', borderRadius: 8, border: '1px solid color-mix(in srgb, var(--char-accent) 45%, transparent)', background: 'var(--char-active-surface)' }}>
                <Icon name="pin" size={14} style={{ color: 'var(--char-accent)', marginTop: 2, flex: 'none' }} />
                <span style={{ flex: 1, font: 'var(--type-body)', color: 'var(--text-primary)' }}>{f}</span>
                <Button variant="ghost" size="sm" icon="trash" onClick={() => remove(i)}></Button>
              </div>
            ))}
          </div>
        ) : (
          <span style={{ font: 'var(--type-caption)', color: 'var(--text-dim)' }}>{i18n.t('aiPinnedEmpty')}</span>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}><TextField value={draft} onChange={setDraft} placeholder={i18n.t('aiPinnedPlaceholder')} /></div>
          <Button variant="secondary" icon="plus" onClick={add} disabled={!draft.trim() || facts.length >= 10}>{i18n.t('aiPinnedAdd')}</Button>
        </div>
      </div>
    </Panel>
  );
}

function PersonaTab({ i18n, onGoTab }) {
  const store = window.TradeJournalAICompanionProfile;
  const aiSettings = window.TradeJournalAISettingsStore;
  const configured = aiSettings ? !!aiSettings.getKey(aiSettings.activeProvider()) : false;
  const [, forceRerender] = React.useReducer((x) => x + 1, 0);
  const [tone, setTone] = React.useState(() => {
    const base = store ? store.toneDimensions() : { explicitness: 50, detail: 50, warmth: 50, humor: 50, jargon: 50 };
    return Object.assign({ initiative: initiativeFromBucket(store ? store.initiativePreference() : 'normal') }, base);
  });
  const [customText, setCustomText] = React.useState(() => (store ? store.customInstructions() : ''));
  const [presetId, setPresetId] = React.useState(() => (store ? store.personaPreset() : null));
  const [savedFlash, setSavedFlash] = React.useState(false);
  const [preview, setPreview] = React.useState(null);
  const [previewBusy, setPreviewBusy] = React.useState(false);
  const flashTimer = React.useRef(null);
  React.useEffect(() => () => clearTimeout(flashTimer.current), []);

  function applyPreset(preset) {
    setPresetId(preset.id);
    setTone((prev) => Object.assign({}, prev, preset.tone));
  }
  function updateDim(key, value) { setPresetId(null); setTone((prev) => Object.assign({}, prev, { [key]: value })); }
  function save() {
    if (!store) return;
    store.setPersonaPreset(presetId);
    PERSONA_DIMENSIONS.filter((d) => d.key !== 'initiative').forEach((d) => store.setToneDimension(d.key, tone[d.key]));
    store.setPreference('initiativePreference', bucketInitiative(tone.initiative));
    store.setCustomInstructions(customText);
    setSavedFlash(true);
    clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setSavedFlash(false), 2200);
    forceRerender();
  }
  async function tryIt() {
    if (!window.TradeJournalChatDockCore || !configured) return;
    save();
    setPreviewBusy(true);
    setPreview(null);
    try {
      const result = await window.TradeJournalChatDockCore.sendChat({ text: i18n.t('aiPersonaPreviewSampleQ') });
      setPreview({ reply: (result && result.reply) || '' });
    } catch (_) {
      setPreview({ error: true });
    } finally {
      setPreviewBusy(false);
    }
  }

  const activePreset = PERSONA_PRESETS.find((p) => p.id === presetId);
  const untouched = store && !store.personaStylePackage() && !customText.trim();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {untouched && <Notice tone="neutral" icon="sparkle">{i18n.t('aiPersonaUntouchedNote')}</Notice>}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="primary" icon="check" onClick={save}>{savedFlash ? i18n.t('aiPersonaSaved') : i18n.t('aiPersonaSave')}</Button>
      </div>

      <Panel variant="base" padding={0}>
        <PanelHeader icon="sparkle" title={i18n.t('aiPersonaPresetsTitle')} trailing={<span style={{ font: 'var(--type-caption)', color: 'var(--text-dim)' }}>{i18n.t('aiPersonaPresetsHint')}</span>} />
        <div style={{ padding: '16px 20px 20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
            {PERSONA_PRESETS.map((preset) => {
              const on = presetId === preset.id;
              return (
                <button
                  key={preset.id} type="button" onClick={() => applyPreset(preset)}
                  style={{
                    textAlign: 'start', display: 'flex', flexDirection: 'column', gap: 9, padding: 15, borderRadius: 11, cursor: 'pointer',
                    border: '1px solid ' + (on ? 'color-mix(in srgb, var(--char-accent) 90%, transparent)' : 'var(--border-hairline)'),
                    background: on ? 'var(--char-active-surface)' : 'color-mix(in srgb, var(--char-atmosphere) 30%, var(--ink-900))',
                    boxShadow: on ? 'var(--glow-active)' : 'var(--shadow-raised)'
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 34, height: 34, borderRadius: 9, display: 'grid', placeItems: 'center', flex: 'none', border: '1px solid ' + (on ? 'var(--char-accent)' : 'var(--divider-gold)'), background: on ? 'rgba(3,8,7,.5)' : 'rgba(3,8,7,.55)', color: on ? 'var(--char-accent)' : 'var(--text-muted)' }}>
                      <Icon name={preset.icon} size={18} />
                    </span>
                    <span style={{ fontWeight: 600, fontSize: 15, lineHeight: '22px', color: 'var(--text-primary)' }}>{i18n.t(preset.nameKey)}</span>
                  </span>
                  <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)', textWrap: 'pretty' }}>{i18n.t(preset.descKey)}</span>
                </button>
              );
            })}
          </div>
        </div>
      </Panel>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,7fr) minmax(0,5fr)', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Panel variant="base" padding={0}>
            <PanelHeader icon="target" title={i18n.t('aiPersonaDimsTitle')} />
            <div style={{ padding: '16px 20px 20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', rowGap: 20, columnGap: 26 }}>
                {PERSONA_DIMENSIONS.map((dim) => (
                  <div key={dim.key} style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                      <span style={{ font: 'var(--type-body)', color: 'var(--text-primary)' }}>{i18n.t(dim.nameKey)}</span>
                      <span className="navrya-tabular" style={{ font: 'var(--type-caption)', color: 'var(--text-dim)' }}>{i18n.t('aiPersonaPercentValue', { n: i18n.number(tone[dim.key]) })}</span>
                    </div>
                    <RailSlider value={tone[dim.key] ?? 50} onChange={(v) => updateDim(dim.key, v)} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', font: 'var(--type-caption)', color: 'var(--text-disabled)' }}>
                      <span>{i18n.t(dim.loKey)}</span><span>{i18n.t(dim.hiKey)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Panel>

          <Panel variant="base" padding={0}>
            <PanelHeader icon="edit" title={i18n.t('aiPersonaCustomTitle')} trailing={<span style={{ font: 'var(--type-caption)', color: 'var(--text-dim)' }}>{i18n.t('aiPersonaCustomHint')}</span>} />
            <div style={{ padding: '16px 20px 20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 296px', gap: 14 }}>
                <div style={{ display: 'flex', flexDirection: 'column', borderRadius: 11, border: '1px solid var(--border-gold)', background: 'rgba(3,8,7,.55)', overflow: 'hidden' }}>
                  <textarea
                    rows={4} value={customText} maxLength={600}
                    onChange={(e) => { setPresetId(null); setCustomText(e.target.value); }}
                    placeholder={i18n.t('aiPersonaCustomPlaceholder')}
                    style={{ resize: 'vertical', boxSizing: 'border-box', padding: 15, border: 0, background: 'transparent', color: 'var(--text-primary)', font: 'var(--type-body)', outline: 'none' }}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', padding: '10px 12px', borderTop: '1px solid var(--border-hairline)', background: 'rgba(11,20,21,.5)' }}>
                    <span style={{ font: 'var(--type-caption)', color: 'var(--text-dim)' }}>{i18n.t('aiPersonaCustomCounter', { n: i18n.number(customText.length), max: i18n.number(600) })}</span>
                    <span style={{ flex: 1 }} />
                    <Button variant="ghost" size="sm" icon="flask-conical" style={{ height: 30, padding: '0 10px' }} disabled={previewBusy} onClick={configured ? tryIt : () => onGoTab('engines')}>{i18n.t('aiPersonaCustomTry')}</Button>
                  </div>
                </div>
                <Panel variant="raised" padding={13} style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Icon name="lock" size={16} style={{ color: 'var(--gold-warm)' }} />
                    <span style={{ font: 'var(--type-section-label)', letterSpacing: 'var(--tracking-label)', color: 'var(--gold-warm)', textTransform: 'uppercase' }}>{i18n.t('aiPersonaRulesTitle')}</span>
                  </div>
                  {['aiPersonaRule1', 'aiPersonaRule2', 'aiPersonaRule3', 'aiPersonaRule4'].map((k) => (
                    <div key={k} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <Icon name="check" size={14} style={{ color: 'var(--gold-warm)', marginTop: 2, flex: 'none' }} />
                      <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{i18n.t(k)}</span>
                    </div>
                  ))}
                </Panel>
              </div>
            </div>
          </Panel>

          <Panel variant="base" padding={0}>
            <PanelHeader icon="shield" title={i18n.t('aiPersonaScopeTitle')} />
            <div style={{ padding: '16px 20px 20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 11 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.45)' }}>
                  <span style={{ width: 16, height: 16, borderRadius: 999, border: '1px solid var(--char-accent)', display: 'grid', placeItems: 'center', flex: 'none' }}><span style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--char-accent)' }}></span></span>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ font: 'var(--type-body)', color: 'var(--text-primary)' }}>{i18n.t('aiPersonaScopeAllTitle')}</span>
                    <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{i18n.t('aiPersonaScopeAllDesc')}</span>
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.45)' }}>
                  <span style={{ width: 16, height: 16, borderRadius: 999, border: '1px solid var(--divider-gold)', flex: 'none' }}></span>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ font: 'var(--type-body)', color: 'var(--text-primary)' }}>{i18n.t('aiPersonaScopeCharTitle')}</span>
                    <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{i18n.t('aiPersonaScopeCharDesc')}</span>
                  </span>
                </div>
              </div>
            </div>
          </Panel>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Panel variant="prestige" ornament texture padding={0}>
            <PanelHeader icon="eye" title={i18n.t('aiPersonaPreviewTitle')} trailing={activePreset && <Chip tone="accent">{i18n.t(activePreset.nameKey)}</Chip>} />
            <div style={{ padding: '16px 20px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <span style={{ font: 'var(--type-caption)', color: 'var(--text-dim)' }}>{i18n.t('aiPersonaPreviewHint')}</span>
              <div style={{ borderRadius: 11, padding: '13px 15px', border: '1px solid var(--border-hairline)', background: 'rgba(244,234,215,.05)', font: 'var(--type-body)', color: 'var(--text-primary)' }}>{i18n.t('aiPersonaPreviewSampleQ')}</div>
              {previewBusy ? (
                <div style={{ borderRadius: 11, padding: '13px 15px', border: '1px solid color-mix(in srgb, var(--char-accent) 45%, transparent)', background: 'var(--char-active-surface)', font: 'var(--type-body)', color: 'var(--text-muted)' }}>{i18n.t('aiPersonaTrying')}</div>
              ) : preview ? (
                <div style={{ borderRadius: 11, padding: '13px 15px', border: '1px solid color-mix(in srgb, var(--char-accent) 45%, transparent)', background: 'var(--char-active-surface)', font: 'var(--type-body)', color: 'var(--text-primary)', textWrap: 'pretty' }}>{preview.error ? i18n.t('aiPersonaTryErr') : preview.reply}</div>
              ) : null}
              <div style={{ height: 1, background: 'var(--border-hairline)' }} />
              <div style={{ display: 'flex', gap: 9 }}>
                {/* Real TTS playback for this preview reply needs the same voice pipeline
                    Voice Mode uses (ai-voice-playback-controller.js's createPlaybackController(),
                    a stateful audio-element lifecycle, not a one-shot call) - wiring that up is
                    out of scope for this pass, so the button stays visible (matches the design)
                    but genuinely disabled rather than silently doing nothing on click. */}
                <Button variant="secondary" icon="mic" style={{ flex: 1 }} disabled title={i18n.t('aiPersonaListenByVoiceSoon')}>{i18n.t('aiPersonaListenByVoice')}</Button>
                <Button variant={configured ? 'primary' : 'secondary'} icon={configured ? 'flask-conical' : 'lock'} style={{ flex: 1 }} disabled={previewBusy} onClick={configured ? tryIt : () => onGoTab('engines')}>
                  {configured ? i18n.t('aiPersonaTryIt') : i18n.t('aiPersonaTryNotConfigured')}
                </Button>
              </div>
            </div>
          </Panel>

          <PinnedFactsCard i18n={i18n} />

          <Panel variant="soon" padding={0}>
            <PanelHeader icon="mic" iconColor="var(--gold-warm)" title={i18n.t('aiPersonaVoiceTitle')} trailing={<SoonBadge i18n={i18n} />} />
            <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p style={{ margin: 0, font: 'var(--type-caption)', color: 'var(--text-muted)', textWrap: 'pretty' }}>{i18n.t('aiPersonaVoiceBody')}</p>
              {[['activity', 'aiPersonaVoiceSpeed', 50], ['sparkle', 'aiPersonaVoiceWarmth', 62], ['streak', 'aiPersonaVoiceEmotion', 35]].map(([icon, labelKey, fill]) => (
                <div key={labelKey} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '11px 13px', borderRadius: 9, border: '1px dashed rgba(214,175,107,.3)', background: 'rgba(3,8,7,.4)', opacity: .75 }}>
                  <Icon name={icon} size={16} style={{ color: 'var(--gold-warm)', flex: 'none' }} />
                  <span style={{ flex: 1, font: 'var(--type-body)', color: 'var(--text-primary)' }}>{i18n.t(labelKey)}</span>
                  <span style={{ width: 120, height: 6, borderRadius: 3, background: 'rgba(244,234,215,.07)', overflow: 'hidden', display: 'block', flex: 'none' }}><span style={{ display: 'block', height: '100%', borderRadius: 3, width: fill + '%', background: 'var(--gold-warm)' }} /></span>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Panel Builder tab - moved here from Settings (dashboardView.jsx's addCustomPanel()/loadBoard()/
// saveBoard() etc. are the same real board APIs Settings' own ManagePanelsSection used).
// ============================================================================
function ManagePanelsCard({ i18n, character }) {
  const [state, setState] = React.useState(() => loadBoard(character));
  const [dragId, setDragId] = React.useState(null);
  const CAT = React.useMemo(() => catalogForLang(i18n.language()), [i18n]);
  React.useEffect(() => { saveBoard(character, state); }, [character, state]);

  function entryOf(id) { return CAT[id] || resolveCustomEntry(id, state.custom); }
  function setSpan(id, dir) {
    const cur = state.spans[id] || (entryOf(id) ? entryOf(id).span : 4);
    const i = SPANS.indexOf(cur);
    const next = SPANS[Math.min(SPANS.length - 1, Math.max(0, i + dir))];
    setState((s) => ({ ...s, spans: { ...s.spans, [id]: next } }));
  }
  function toggleHidden(id) { setState((s) => ({ ...s, hidden: { ...s.hidden, [id]: !s.hidden[id] } })); }
  function removePanel(id) { setState((s) => ({ ...s, board: s.board.filter((x) => x !== id) })); }
  function reorder(targetId) {
    if (!dragId || dragId === targetId) return;
    setState((s) => {
      const board = s.board.filter((x) => x !== dragId);
      board.splice(board.indexOf(targetId), 0, dragId);
      return { ...s, board };
    });
    setDragId(null);
  }

  return (
    <Panel variant="base" padding={0}>
      <PanelHeader icon="layout-template" title={i18n.t('managePanelsTitle')} trailing={<Chip tone="neutral">{i18n.number(state.board.length)}</Chip>} />
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {!state.board.length ? (
          <span style={{ font: 'var(--type-body)', color: 'var(--text-muted)' }}>{i18n.t('noPanelsYet')}</span>
        ) : (
          state.board.map((id) => {
            const entry = entryOf(id);
            if (!entry) return null;
            const on = !state.hidden[id];
            const span = state.spans[id] || entry.span;
            return (
              <div
                key={id} draggable onDragStart={() => setDragId(id)} onDragOver={(e) => e.preventDefault()} onDrop={() => reorder(id)}
                style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '12px 13px', borderRadius: 10, border: '1px solid ' + (on ? 'var(--border-hairline)' : 'var(--divider-gold)'), background: 'rgba(3,8,7,.45)' }}
              >
                <span style={{ display: 'flex', color: 'var(--text-muted)', cursor: 'grab' }} title={i18n.t('dragToReorder')}><Icon name="grip-vertical" size={16} /></span>
                <span style={{ width: 56, height: 40, flex: 'none', borderRadius: 7, border: '1px solid var(--divider-gold)', background: 'rgba(3,8,7,.6)', display: 'grid', placeItems: 'center', color: 'var(--char-accent)' }}><Icon name={entry.icon} size={16} /></span>
                <span dir="auto" style={{ font: 'var(--type-body)', color: on ? 'var(--text-primary)' : 'var(--text-disabled)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.title}</span>
                <button type="button" onClick={() => setSpan(id, -1)} aria-label={i18n.t('narrowPanel')} disabled={span <= SPANS[0]} style={{ width: 30, height: 30, display: 'grid', placeItems: 'center', borderRadius: 6, cursor: 'pointer', border: '1px solid var(--divider-gold)', background: 'rgba(11,20,21,.6)', color: 'var(--text-muted)', opacity: span <= SPANS[0] ? .4 : 1 }}><Icon name="minus" size={14} /></button>
                <span className="navrya-tabular" dir="ltr" style={{ font: 'var(--type-caption)', color: 'var(--text-muted)', minWidth: 36, textAlign: 'center' }}>{span + '/12'}</span>
                <button type="button" onClick={() => setSpan(id, 1)} aria-label={i18n.t('widenPanel')} disabled={span >= 12} style={{ width: 30, height: 30, display: 'grid', placeItems: 'center', borderRadius: 6, cursor: 'pointer', border: '1px solid var(--divider-gold)', background: 'rgba(11,20,21,.6)', color: 'var(--text-muted)', opacity: span >= 12 ? .4 : 1 }}><Icon name="plus" size={14} /></button>
                <Toggle checked={on} onChange={() => toggleHidden(id)} aria-label={i18n.t('toggleShowHide')} />
                <button type="button" aria-label={i18n.t('editPanel')} style={{ width: 30, height: 30, display: 'grid', placeItems: 'center', borderRadius: 6, cursor: 'pointer', border: '1px solid var(--divider-gold)', background: 'rgba(11,20,21,.6)', color: 'var(--text-muted)' }}><Icon name="edit" size={14} /></button>
                <button type="button" onClick={() => removePanel(id)} aria-label={i18n.t('removePanel')} title={i18n.t('removePanel')} style={{ width: 30, height: 30, display: 'grid', placeItems: 'center', borderRadius: 6, cursor: 'pointer', border: '1px solid var(--divider-gold)', background: 'rgba(11,20,21,.6)', color: 'var(--text-muted)' }}>
                  <Icon name="trash" size={14} />
                </button>
              </div>
            );
          })
        )}
        {!!state.board.length && (
          <React.Fragment>
            <div style={{ height: 1, background: 'var(--border-hairline)' }} />
            <GoLink i18n={i18n} textKey="goToDashboard" onClick={() => { location.hash = '#dashboard'; }} />
          </React.Fragment>
        )}
      </div>
    </Panel>
  );
}

// A draft's visual preview: no real chart data exists yet for a free-text AI description, so a
// deterministic hash of the draft id picks plausible bar heights - a real thumbnail structure
// (matching the design), never fabricated numeric content.
function draftBarHeights(id) {
  let seed = 0;
  for (let i = 0; i < id.length; i++) seed = (seed * 31 + id.charCodeAt(i)) % 97;
  return [0, 1, 2, 3, 4, 5].map((i) => 28 + ((seed * (i + 3)) % 60));
}

function PanelBuilderTab({ i18n, character }) {
  const [prompt, setPrompt] = React.useState('');
  const [drafts, setDrafts] = React.useState([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const aiSettings = window.TradeJournalAISettingsStore;
  const configured = aiSettings ? !!aiSettings.getKey(aiSettings.activeProvider()) : false;

  const mountedRef = React.useRef(true);
  React.useEffect(() => {
    mountedRef.current = true;
    const registry = window.TradeJournalAIProcessRegistry;
    if (!registry) return undefined;
    registry.register('ai-assistant-panel-builder', {
      allowlist: ['prompt'],
      isOpen: () => mountedRef.current,
      applyValue: (path, value) => { if (path === 'prompt') setPrompt(String(value ?? '')); }
    });
    return () => { mountedRef.current = false; };
  }, []);

  async function generate() {
    const text = prompt.trim();
    if (!text || busy) return;
    setError('');
    if (!window.TradeJournalChatDockCore || !configured) { setError(i18n.t('aiNotConfigured')); return; }
    setBusy(true);
    try {
      const result = await window.TradeJournalChatDockCore.sendChat({
        text: 'Draft one dashboard panel idea for a trading journal app from this request, in ' + i18n.language() + '. Reply with 1-2 plain sentences describing what the panel would show - no markdown, no preamble. Request: ' + text
      });
      const desc = result && result.reply ? result.reply.trim() : i18n.t('draftedNote');
      setDrafts((list) => list.concat([{ id: 'draft-' + Date.now(), title: text.slice(0, 42), desc }]));
      setPrompt('');
    } catch (_) {
      setError(i18n.t('aiBuilderErrorGeneric'));
    } finally {
      setBusy(false);
    }
  }

  const quickPrompts = ['quickPromptRevenge', 'quickPromptRiskUsed', 'quickPromptEmotionHeatmap', 'quickPromptMissedPatterns'].map((k) => i18n.t(k));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px 15px', borderRadius: 10, border: '1px solid color-mix(in srgb, var(--char-accent) 40%, transparent)', background: 'var(--char-active-surface)' }}>
        <Icon name="layout-template" style={{ color: 'var(--char-accent)', flex: 'none' }} />
        <span style={{ flex: 1, font: 'var(--type-body)', color: 'var(--text-primary)' }}>{i18n.t('aiPanelMovedNotice')}</span>
        <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{i18n.t('perGenerationCost')}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,7fr) minmax(0,5fr)', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Panel variant="prestige" ornament padding={0}>
            <PanelHeader icon="sparkle" title={i18n.t('aiBuilderTitle')} />
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 13 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {quickPrompts.map((label) => (
                  <button key={label} type="button" onClick={() => setPrompt(label)} style={{ padding: '7px 12px', borderRadius: 6, cursor: 'pointer', border: '1px dashed var(--divider-gold)', background: 'rgba(3,8,7,.5)', color: 'var(--text-muted)', font: 'var(--type-caption)' }}>{label}</button>
                ))}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', borderRadius: 11, border: '1px solid var(--border-gold)', background: 'rgba(3,8,7,.55)', overflow: 'hidden' }}>
                <textarea
                  rows={4} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={i18n.t('aiBuilderPromptPlaceholder')}
                  style={{ resize: 'vertical', boxSizing: 'border-box', padding: 15, border: 0, background: 'transparent', color: 'var(--text-primary)', font: 'var(--type-body)', outline: 'none' }}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderTop: '1px solid var(--border-hairline)', background: 'rgba(11,20,21,.5)' }}>
                  <span style={{ font: 'var(--type-caption)', color: error ? 'var(--danger)' : 'var(--text-muted)' }}>{error || (busy ? i18n.t('hintBusy') : prompt ? i18n.t('hintTyped') : i18n.t('installsOnBoard', { character: character.charAt(0).toUpperCase() + character.slice(1) }))}</span>
                  <span style={{ flex: 1 }} />
                  <Button variant="ghost" icon="mic" size="sm" style={{ height: 32, padding: '0 11px' }}>{i18n.t('speakIt')}</Button>
                  <Button variant="primary" icon="sparkle" size="sm" style={{ height: 32, padding: '0 13px' }} disabled={!prompt.trim() || busy} onClick={generate}>{i18n.t('generatePanel')}</Button>
                </div>
              </div>
            </div>
          </Panel>

          {!!drafts.length && (
            <Panel variant="base" padding={0}>
              <PanelHeader icon="flask-conical" title={i18n.t('draftsLabel')} trailing={<Chip tone="accent">{i18n.t('draftsCount', { count: i18n.number(drafts.length) })}</Chip>} />
              <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {drafts.map((d) => {
                  const bars = draftBarHeights(d.id);
                  return (
                    <Panel key={d.id} variant="raised" style={{ display: 'flex', alignItems: 'stretch', gap: 14 }} padding={14}>
                      <div style={{ width: 212, flex: 'none', borderRadius: 9, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.6)', padding: 11, display: 'flex', flexDirection: 'column', gap: 9 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 7, font: '700 9px/12px var(--font-ui)', letterSpacing: '.1em', color: 'var(--text-muted)' }}><Icon name="report" size={14} />{i18n.t('draftPreviewLabel')}</span>
                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 44 }}>
                          {bars.map((h, i) => <span key={i} style={{ flex: 1, borderRadius: '2px 2px 0 0', background: 'var(--char-accent)', opacity: .85, height: h + '%', display: 'block' }} />)}
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, minWidth: 0 }}>
                        <span dir="auto" style={{ fontWeight: 600, fontSize: 15, lineHeight: '22px', color: 'var(--text-primary)' }}>{d.title}</span>
                        <span dir="auto" style={{ font: 'var(--type-body)', color: 'var(--text-muted)', textWrap: 'pretty' }}>{d.desc}</span>
                        <span style={{ flex: 1 }} />
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                          <Button variant="primary" size="sm" icon="plus" style={{ height: 32 }} onClick={() => { addCustomPanel(character, d.title, d.desc); setDrafts((list) => list.filter((x) => x.id !== d.id)); }}>{i18n.t('addToBoard')}</Button>
                          <Button variant="ghost" size="sm" icon="edit" style={{ height: 32 }}>{i18n.t('editDraftText')}</Button>
                          <span style={{ flex: 1 }} />
                          <Button variant="danger" size="sm" icon="trash" style={{ height: 32, width: 32, padding: 0 }} aria-label={i18n.t('discardDraft')} onClick={() => setDrafts((list) => list.filter((x) => x.id !== d.id))} />
                        </div>
                      </div>
                    </Panel>
                  );
                })}
              </div>
            </Panel>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <ManagePanelsCard i18n={i18n} character={character} />
          <Panel variant="soon" padding={0}>
            <PanelHeader icon="eye" iconColor="var(--gold-warm)" title={i18n.t('aiPanelLivePreviewTitle')} trailing={<SoonBadge i18n={i18n} />} />
            <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 11 }}>
              <p style={{ margin: 0, font: 'var(--type-caption)', color: 'var(--text-muted)', textWrap: 'pretty' }}>{i18n.t('aiPanelLivePreviewBody')}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[88, 64, 41].map((w, i) => <span key={i} style={{ display: 'block', height: 9, borderRadius: 4, background: 'rgba(244,234,215,.06)', width: w + '%' }} />)}
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Costs & Usage tab - the daily-by-engine chart is a real fetch (/api/users/me/usage-by-day);
// the real-cost-by-model cards and monthly caps reuse the exact same data the Engines tab's own
// sidebar already shows, just given a full page.
// ============================================================================
// Fixed brand-identity colors per engine (validated for CVD-safe categorical use) - never the
// per-character theme accent, so a series keeps its own identity across every character skin.
// gemini added after the original 4-color set shipped (ai-settings-store.js's PROVIDER_CATALOG
// gained a real 'gemini' entry with kimi hidden by default) - without its own slot it fell back
// to the theme accent, which for several characters IS blue and read as a duplicate of openai's
// dot in the Costs legend. Re-validated via the dataviz skill's validate_palette.js against the
// real display order (kimi hidden in the common case) - all checks pass on adjacent pairs.
// Falls back to the theme accent only for a provider id this map doesn't know about yet.
const PROVIDER_COLOR = { openai: '#2E7FD4', anthropic: '#A9761F', gemini: '#D45590', kimi: '#A356D6', deepseek: '#1E9256' };
function providerColor(id) { return PROVIDER_COLOR[id] || 'var(--char-accent)'; }

function CostsTab({ i18n, catalog, usageStore, settingsStore, realCostByModel }) {
  const DAYS = 30;
  const [byDay, setByDay] = React.useState(null);
  const [, forceRerenderCosts] = React.useReducer((x) => x + 1, 0);
  React.useEffect(() => {
    fetch('/api/users/me/usage-by-day?days=' + DAYS).then((r) => r.json()).then((d) => setByDay(d.byDay || [])).catch(() => setByDay([]));
  }, []);

  const usageMonth = usageStore ? usageStore.thisMonth() : { byProvider: {} };
  const settings = settingsStore.settings();

  const chart = React.useMemo(() => {
    if (!byDay) return null;
    const dayKeys = [];
    for (let i = DAYS - 1; i >= 0; i--) dayKeys.push(new Date(Date.now() - i * 86400000).toISOString().slice(0, 10));
    const byProviderByDay = {};
    byDay.forEach((row) => {
      const key = String(row.day || '').slice(0, 10);
      byProviderByDay[row.provider] = byProviderByDay[row.provider] || {};
      byProviderByDay[row.provider][key] = (byProviderByDay[row.provider][key] || 0) + (row.totalTokens || 0);
    });
    const providers = catalog.map((p) => p.id);
    const totals = dayKeys.map((key) => providers.reduce((sum, p) => sum + ((byProviderByDay[p] && byProviderByDay[p][key]) || 0), 0));
    const providerTotals = {};
    providers.forEach((p) => { providerTotals[p] = Object.values(byProviderByDay[p] || {}).reduce((a, b) => a + b, 0); });
    const max = Math.max(1, ...totals);
    const grandTotal = totals.reduce((a, b) => a + b, 0);
    return {
      dayKeys, totals, max, grandTotal, providerTotals, byProviderByDay,
      avgPerDay: Math.round(grandTotal / DAYS), peak: Math.max(0, ...totals),
      zeroDays: totals.filter((t) => t === 0).length
    };
  }, [byDay, catalog]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Panel variant="prestige" ornament padding={0}>
        <PanelHeader icon="report" title={i18n.t('aiCostsChartTitle')} trailing={<span style={{ font: 'var(--type-caption)', color: 'var(--text-dim)' }}>{i18n.t('aiCostsChartRange', { days: i18n.number(DAYS) })}</span>} />
        <div style={{ padding: '16px 20px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
            {catalog.map((p) => (
              <span key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 7, font: 'var(--type-caption)', color: 'var(--text-muted)' }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: providerColor(p.id), display: 'block' }}></span>
                {providerLabel(i18n, p.id)} — {i18n.number((chart && chart.providerTotals[p.id]) || 0)} {i18n.t('aiCostsTokensUnit')}
              </span>
            ))}
          </div>
          {!chart || !chart.grandTotal ? (
            <span style={{ padding: '32px 0', textAlign: 'center', font: 'var(--type-body)', color: 'var(--text-muted)' }}>{i18n.t('aiCostsChartEmpty')}</span>
          ) : (
            <div style={{ position: 'relative', paddingTop: 24, paddingLeft: 44 }}>
              {[0, .25, .5, .75].map((frac) => (
                <div key={frac} style={{ position: 'absolute', left: 44, right: 0, top: 24 + frac * 180, height: 1, background: 'rgba(244,234,215,.06)' }}>
                  <span style={{ position: 'absolute', left: -40, top: -7, width: 34, textAlign: 'right', font: '400 10px/13px var(--font-ui)', color: 'var(--text-disabled)' }}>{compact(Math.round(chart.max * (1 - frac)))}</span>
                </div>
              ))}
              <div dir="ltr" style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 180 }}>
                {chart.dayKeys.map((day, i) => {
                  const isLast = i === chart.dayKeys.length - 1;
                  return (
                    <div key={day} style={{ flex: 1, display: 'flex', flexDirection: 'column-reverse', gap: 2, position: 'relative', height: '100%' }}>
                      {isLast && chart.totals[i] > 0 && (
                        <span style={{ position: 'absolute', bottom: 'calc(100% + 4px)', left: '50%', transform: 'translateX(-50%)', whiteSpace: 'nowrap', font: '500 10px/13px var(--font-ui)', color: 'var(--text-primary)', background: 'rgba(3,8,7,.9)', border: '1px solid var(--border-hairline)', borderRadius: 5, padding: '2px 6px' }}>{i18n.number(chart.totals[i])}</span>
                      )}
                      {catalog.map((p) => {
                        const v = (chart.byProviderByDay[p.id] && chart.byProviderByDay[p.id][day]) || 0;
                        if (!v) return null;
                        return <span key={p.id} title={providerLabel(i18n, p.id) + ' ' + day + ': ' + v} style={{ display: 'block', height: Math.max(1, Math.round((v / chart.max) * 180)), background: providerColor(p.id), borderRadius: chart.totals[i] === v ? '3px 3px 0 0' : 0 }} />;
                      })}
                    </div>
                  );
                })}
              </div>
              <div dir="ltr" style={{ display: 'flex', gap: 3, paddingTop: 8 }}>
                {chart.dayKeys.map((day, i) => (
                  <span key={day} style={{ flex: 1, textAlign: 'center', font: '400 10px/13px var(--font-ui)', color: 'var(--text-dim)' }}>
                    {i === chart.dayKeys.length - 1 ? i18n.t('aiCostsToday') : ((i + 1) % 5 === 0 ? i18n.number(i + 1) : '')}
                  </span>
                ))}
              </div>
            </div>
          )}
          {!!(chart && chart.grandTotal) && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 14 }}>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}><span style={{ font: 'var(--type-metric-label)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{i18n.t('aiCostsChartTotal', { days: i18n.number(DAYS) })}</span><span className="navrya-tabular" style={{ fontWeight: 600, fontSize: 22, lineHeight: '26px', color: 'var(--parchment)' }}>{i18n.number(chart.grandTotal)}</span></span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}><span style={{ font: 'var(--type-metric-label)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{i18n.t('aiCostsChartAvgDay')}</span><span className="navrya-tabular" style={{ fontWeight: 600, fontSize: 22, lineHeight: '26px', color: 'var(--parchment)' }}>{i18n.number(chart.avgPerDay)}</span></span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}><span style={{ font: 'var(--type-metric-label)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{i18n.t('aiCostsChartPeakDay')}</span><span className="navrya-tabular" style={{ fontWeight: 600, fontSize: 22, lineHeight: '26px', color: 'var(--parchment)' }}>{i18n.number(chart.peak)}</span></span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}><span style={{ font: 'var(--type-metric-label)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{i18n.t('aiCostsChartZeroDays')}</span><span className="navrya-tabular" style={{ fontWeight: 600, fontSize: 22, lineHeight: '26px', color: 'var(--parchment)' }}>{i18n.number(chart.zeroDays)}</span></span>
            </div>
          )}
        </div>
      </Panel>

      <Panel variant="base" padding={0}>
        <PanelHeader icon="coins" title={i18n.t('aiAsstRealCostTitle')} trailing={<span style={{ font: 'var(--type-caption)', color: 'var(--text-dim)' }}>{i18n.t('aiAsstRealCostHint')}</span>} />
        <div style={{ padding: '16px 20px 20px' }}>
          {!realCostByModel || !realCostByModel.length ? (
            <span style={{ font: 'var(--type-body)', color: 'var(--text-muted)' }}>{i18n.t('aiAsstRealCostEmpty')}</span>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              {realCostByModel.map((row) => (
                <Panel key={row.provider + '/' + row.model} variant="raised" padding="12px 13px" style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: providerColor(row.provider), display: 'block', flex: 'none' }}></span>
                    <span style={{ font: 'var(--type-body)', color: 'var(--text-primary)' }}>{row.provider + ' / ' + (row.model || '—')}</span>
                  </span>
                  <div dir="ltr" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}><span className="cap" style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{i18n.t('aiAsstRealCostTokens')}</span><span className="navrya-tabular" style={{ font: 'var(--type-body)', color: 'var(--text-primary)' }}>{i18n.number(row.totalTokens)}</span></span>
                    <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}><span className="cap" style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{i18n.t('aiAsstRealCostCalls')}</span><span className="navrya-tabular" style={{ font: 'var(--type-body)', color: 'var(--text-primary)' }}>{i18n.number(row.calls)}</span></span>
                    <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}><span className="cap" style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{i18n.t('aiAsstRealCostProviderCost')}</span><span className="navrya-tabular" style={{ font: 'var(--type-body)', color: 'var(--text-primary)' }}>{fmtUsd(row.providerCostMicroUsd)}</span></span>
                    <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}><span className="cap" style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{i18n.t('aiAsstRealCostCharged')}</span><span className="navrya-tabular" style={{ font: 'var(--type-body)', color: 'var(--char-accent)' }}>{fmtUsd(row.retailChargeMicroUsd)}</span></span>
                  </div>
                </Panel>
              ))}
            </div>
          )}
        </div>
      </Panel>

      <Panel variant="base" padding={0}>
        <PanelHeader icon="target" title={i18n.t('aiCostsCapTitle')} trailing={<span style={{ font: 'var(--type-caption)', color: 'var(--text-dim)' }}>{i18n.t('aiCostsCapHint')}</span>} />
        <div style={{ padding: '16px 20px 20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 10 }}>
            {catalog.map((p) => {
              const monthTokens = (usageMonth.byProvider[p.id] && usageMonth.byProvider[p.id].totalTokens) || 0;
              const budget = settings.budgetByProvider[p.id];
              const pct = budget ? Math.min(100, Math.round((monthTokens / budget) * 100)) : 0;
              return (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '11px 13px', borderRadius: 9, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.45)', opacity: budget ? 1 : .62 }}>
                  <span style={{ width: 104, flex: 'none', display: 'flex', alignItems: 'center', gap: 8, font: 'var(--type-body)', color: 'var(--text-primary)' }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: providerColor(p.id), display: 'block', flex: 'none' }}></span>
                    {providerLabel(i18n, p.id)}
                  </span>
                  <span style={{ flex: 1, height: 6, borderRadius: 3, background: 'rgba(244,234,215,.07)', overflow: 'hidden', display: 'block' }}>
                    <span style={{ display: 'block', height: '100%', borderRadius: 3, width: pct + '%', background: providerColor(p.id) }}></span>
                  </span>
                  <span className="navrya-tabular" style={{ font: 'var(--type-caption)', color: 'var(--text-dim)', minWidth: 96, textAlign: 'end' }}>{budget ? i18n.number(monthTokens) + ' / ' + i18n.number(budget) : i18n.t('aiCostsCapUnsetShort')}</span>
                  <input
                    type="number" min={0} step={1000} className="navrya-tabular" defaultValue={budget || ''} placeholder={i18n.t('aiCostsCapUnsetShort')}
                    onBlur={(e) => { settingsStore.setBudget(p.id, e.target.value ? String(Math.max(0, Number(e.target.value))) : ''); forceRerenderCosts(); }}
                    style={{ height: 32, width: 130, borderRadius: 7, border: '1px solid var(--border-gold)', background: 'rgba(3,8,7,.6)', padding: '0 10px', font: '400 11px/16px var(--font-ui)', color: 'var(--text-muted)', flex: 'none' }}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </Panel>
    </div>
  );
}

// ============================================================================
// Memory tab - real bucket sizes + clear (reused from the Engines tab's existing memory section),
// pinned facts (shared with Persona), and real per-domain privacy toggles that actually gate
// ai-user-memory.js's getRelevant*() functions.
// ============================================================================
function MemoryTab({ i18n, memory, memoryRows, onClearBucket, onExport }) {
  const store = window.TradeJournalAICompanionProfile;
  const [prefs, setPrefs] = React.useState(() => (store ? store.dataAccessPrefs() : {}));
  function togglePref(key) { if (store) setPrefs(store.setDataAccessPref(key, prefs[key] === false).dataAccessPrefs); }
  const PRIVACY_ROWS = [
    { key: 'tradesSessions', labelKey: 'aiMemoryPrivacyTrades', hintKey: 'aiMemoryPrivacyTradesHint' },
    { key: 'patternsStrategies', labelKey: 'aiMemoryPrivacyPatterns', hintKey: 'aiMemoryPrivacyPatternsHint' },
    { key: 'mentalHealth', labelKey: 'aiMemoryPrivacyMentalHealth', hintKey: 'aiMemoryPrivacyMentalHealthHint' },
    { key: 'accounts', labelKey: 'aiMemoryPrivacyAccounts', hintKey: 'aiMemoryPrivacyAccountsHint' }
  ];
  // Design's `.buck` row (Memory.dc.html) badges each bucket with its own glyph - target/book/shield,
  // matching patterns/strategies/mentalHealth. No fake fullness bar though: unlike the design mock's
  // illustrative 64%/41%/47% fills, these are real counts with no natural cap to visualize honestly.
  const BUCKET_ICON = { patterns: 'target', strategies: 'book', mentalHealth: 'shield' };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,5fr) minmax(0,7fr)', gap: 16, alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Panel variant="base" padding={0}>
          <PanelHeader icon="psychology" title={i18n.t('aiMemoryBucketsTitle')} />
          <div style={{ padding: '16px 20px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {memoryRows.map((row) => (
                <div key={row.id} style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '11px 13px', border: '1px solid var(--border-hairline)', borderRadius: 10, background: 'rgba(3,8,7,.45)' }}>
                  <span style={{ width: 34, height: 34, borderRadius: 8, display: 'grid', placeItems: 'center', flex: 'none', border: '1px solid var(--divider-gold)', background: 'var(--char-active-surface)', color: 'var(--char-accent)' }}><Icon name={BUCKET_ICON[row.id]} size={16} /></span>
                  <span style={{ font: 'var(--type-body)', color: 'var(--text-primary)', flex: 1 }}>{row.label}</span>
                  <span className="navrya-tabular" style={{ font: 'var(--type-body)', color: 'var(--char-accent)' }}>{i18n.number(row.count)}</span>
                  <Button variant="ghost" size="sm" icon="trash" onClick={() => onClearBucket(row.id)}>{i18n.t('aiAsstClear')}</Button>
                </div>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '11px 13px', border: '1px solid var(--border-hairline)', borderRadius: 10, background: 'rgba(3,8,7,.45)' }}>
                <span style={{ width: 34, height: 34, borderRadius: 8, display: 'grid', placeItems: 'center', flex: 'none', border: '1px solid var(--divider-gold)', background: 'var(--char-active-surface)', color: 'var(--char-accent)' }}><Icon name="report" size={16} /></span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
                  <span style={{ font: 'var(--type-body)', color: 'var(--text-primary)' }}>{i18n.t('aiMemoryLiveLabel')}</span>
                  <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{i18n.t('aiMemoryLiveNote')}</span>
                </span>
                <Chip tone="success"><Icon name="check" size={12} />{i18n.t('aiMemoryLiveShort')}</Chip>
              </div>
            </div>
            <span style={{ font: 'var(--type-caption)', color: 'var(--text-dim)', textWrap: 'pretty' }}>{i18n.t('aiMemoryFootnote')}</span>
            <Button variant="secondary" icon="download" fullWidth onClick={onExport}>{i18n.t('aiMemoryExport')}</Button>
          </div>
        </Panel>

        <Panel variant="base" padding={0}>
          <PanelHeader icon="lock" title={i18n.t('aiMemoryPrivacyTitle')} />
          <div style={{ padding: '16px 20px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {PRIVACY_ROWS.map((row) => (
              <div key={row.key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 13px', borderRadius: 9, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.45)' }}>
                <Toggle checked={prefs[row.key] !== false} onChange={() => togglePref(row.key)} aria-label={i18n.t(row.labelKey)} />
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
                  <span style={{ font: 'var(--type-body)', color: 'var(--text-primary)' }}>{i18n.t(row.labelKey)}</span>
                  <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{i18n.t(row.hintKey)}</span>
                </span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <PinnedFactsCard i18n={i18n} />

        <Panel variant="soon" padding={0}>
          <PanelHeader icon="sparkle" iconColor="var(--gold-warm)" title={i18n.t('aiMemoryFactsComingTitle')} trailing={<SoonBadge i18n={i18n} />} />
          <div style={{ padding: '16px 18px' }}>
            <p style={{ margin: 0, font: 'var(--type-caption)', color: 'var(--text-muted)', textWrap: 'pretty' }}>{i18n.t('aiMemoryFactsComingBody')}</p>
          </div>
        </Panel>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 16 }}>
          <Panel variant="soon" padding={0}>
            <PanelHeader icon="clock" iconColor="var(--gold-warm)" title={i18n.t('aiMemoryExpiryComingTitle')} trailing={<SoonBadge i18n={i18n} />} />
            <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 11 }}>
              <p style={{ margin: 0, font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{i18n.t('aiMemoryExpiryComingBody')}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {[74, 48].map((w, i) => <span key={i} style={{ display: 'block', height: 9, borderRadius: 4, background: 'rgba(244,234,215,.06)', width: w + '%' }} />)}
              </div>
            </div>
          </Panel>
          <Panel variant="soon" padding={0}>
            <PanelHeader icon="message-circle" iconColor="var(--gold-warm)" title={i18n.t('aiMemorySearchComingTitle')} trailing={<SoonBadge i18n={i18n} />} />
            <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 11 }}>
              <p style={{ margin: 0, font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{i18n.t('aiMemorySearchComingBody')}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {[66, 52].map((w, i) => <span key={i} style={{ display: 'block', height: 9, borderRadius: 4, background: 'rgba(244,234,215,.06)', width: w + '%' }} />)}
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Activity tab - real numbers (conversations/messages/tokens, already computed by the parent from
// real stores) up top; everything below needs server-side tracking that doesn't exist yet, so it
// is honestly marked Coming soon rather than showing an invented number.
// ============================================================================
// A deterministic (never Math.random - stable across re-renders) placeholder fill for a
// structural visualization with no real data source yet - the Activity tab's heatmap/gauge cells.
function pseudoFill(seed) { return 0.15 + (Math.abs(Math.sin(seed * 12.9898) * 43758.5453) % 1) * 0.8; }

function ActivityTab({ i18n, chats, usageMonth, avgTokens }) {
  const messages = chats.reduce((sum, c) => sum + (c.messageCount || 0), 0);
  const monthTokens = Object.values(usageMonth.byProvider || {}).reduce((sum, p) => sum + (p.totalTokens || 0), 0);
  const SOON_CARDS = [
    {
      icon: 'flask-conical', titleKey: 'aiActivitySoonAnalyses', noteKey: 'aiActivitySoonAnalysesNote',
      rows: [['aiActivityAnalysisSession', 78], ['aiActivityAnalysisTrade', 62], ['aiActivityAnalysisPattern', 44], ['aiActivityAnalysisStrategy', 33], ['aiActivityAnalysisPsychology', 21]]
    },
    { icon: 'report', titleKey: 'aiActivitySoonCharts', noteKey: 'aiActivitySoonChartsNote', donut: 62 },
    { icon: 'mic', titleKey: 'aiActivitySoonVoice', noteKey: 'aiActivitySoonVoiceNote', gauge: true }
  ];
  const LEADER_ROWS = [
    { id: 'openai', label: 'ChatGPT' }, { id: 'anthropic', label: 'Claude' },
    { id: 'kimi', label: 'Kimi' }, { id: 'deepseek', label: 'DeepSeek' }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Panel variant="prestige" ornament padding={0}>
        <PanelHeader icon="check" title={i18n.t('aiActivityRealTitle')} trailing={<span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{i18n.t('aiActivityRealSourceCaption')}</span>} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
          <div style={{ padding: '19px 18px' }}><MetricTile icon="message-circle" label={i18n.t('aiActivityConversationsLabel')} value={i18n.number(chats.length)} /></div>
          <div style={{ padding: '19px 18px', borderInlineStart: '1px solid var(--border-hairline)' }}><MetricTile icon="edit" label={i18n.t('aiActivityMessagesLabel')} value={i18n.number(messages)} /></div>
          <div style={{ padding: '19px 18px', borderInlineStart: '1px solid var(--border-hairline)' }}><MetricTile icon="streak" label={i18n.t('aiActivityTokensLabel')} value={i18n.number(monthTokens)} /></div>
          <div style={{ padding: '19px 18px', borderInlineStart: '1px solid var(--border-hairline)' }}><MetricTile icon="execution" label={i18n.t('aiAsstAvgPerChat')} value={i18n.number(avgTokens)} /></div>
        </div>
      </Panel>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 16 }}>
        {SOON_CARDS.map((card) => (
          <Panel key={card.titleKey} variant="soon" padding={0}>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 34, height: 34, borderRadius: 8, display: 'grid', placeItems: 'center', flex: 'none', border: '1px dashed rgba(214,175,107,.4)', background: 'rgba(214,175,107,.07)', color: 'var(--gold-warm)' }}><Icon name={card.icon} size={16} /></span>
                <span style={{ fontWeight: 600, fontSize: 15, lineHeight: '22px', color: 'var(--text-primary)', flex: 1 }}>{i18n.t(card.titleKey)}</span>
                <SoonBadge i18n={i18n} />
              </div>
              {card.rows && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                  {card.rows.map(([labelKey, w]) => (
                    <div key={labelKey} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ width: 112, flex: 'none', font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{i18n.t(labelKey)}</span>
                      <span style={{ flex: 1, height: 10, borderRadius: 5, background: 'rgba(244,234,215,.05)', overflow: 'hidden', display: 'block' }}><span style={{ display: 'block', height: '100%', borderRadius: 5, width: w + '%', background: 'rgba(214,175,107,.22)' }} /></span>
                      <span style={{ width: 20, flex: 'none', textAlign: 'end', font: 'var(--type-caption)', color: 'var(--text-disabled)' }}>—</span>
                    </div>
                  ))}
                </div>
              )}
              {card.donut != null && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <span style={{ width: 78, height: 78, borderRadius: '50%', flex: 'none', display: 'grid', placeItems: 'center', background: `conic-gradient(rgba(214,175,107,.24) 0 ${card.donut}%, rgba(244,234,215,.05) ${card.donut}% 100%)` }}>
                    <span style={{ width: 58, height: 58, borderRadius: '50%', background: 'rgba(3,8,7,.92)', display: 'grid', placeItems: 'center', fontWeight: 600, fontSize: 15, lineHeight: '20px', color: 'var(--text-disabled)' }}>—</span>
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7, flex: 1 }}>
                    {[88, 62, 45].map((w, i) => <span key={i} style={{ display: 'block', height: 9, borderRadius: 4, background: 'rgba(244,234,215,.06)', width: w + '%' }} />)}
                  </div>
                </div>
              )}
              {card.gauge && (
                <React.Fragment>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 64 }}>
                    {Array.from({ length: 12 }, (_, i) => pseudoFill(i + 1)).map((h, i) => <span key={i} style={{ flex: 1, borderRadius: '3px 3px 0 0', background: 'rgba(214,175,107,.2)', height: Math.round(h * 100) + '%', display: 'block' }} />)}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 11 }}>
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><span style={{ font: 'var(--type-metric-label)', color: 'var(--text-muted)' }}>{i18n.t('aiActivityListenMinutes')}</span><span style={{ fontWeight: 600, fontSize: 17, color: 'var(--text-disabled)' }}>—</span></span>
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}><span style={{ font: 'var(--type-metric-label)', color: 'var(--text-muted)' }}>{i18n.t('aiActivitySpeakMinutes')}</span><span style={{ fontWeight: 600, fontSize: 17, color: 'var(--text-disabled)' }}>—</span></span>
                  </div>
                </React.Fragment>
              )}
              <NeedsNote i18n={i18n} textKey={card.noteKey} />
            </div>
          </Panel>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 16 }}>
        <Panel variant="soon" padding={0}>
          <PanelHeader icon="clock" iconColor="var(--gold-warm)" title={i18n.t('aiActivitySoonHeatmap')} trailing={<SoonBadge i18n={i18n} />} />
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 11 }}>
            <div style={{ display: 'flex', gap: 7 }}>
              <div style={{ width: 34, flex: 'none', display: 'flex', flexDirection: 'column', gap: 3 }}>
                {['daySat', 'daySun', 'dayMon', 'dayTue', 'dayWed', 'dayThu', 'dayFri'].map((k) => (
                  <span key={k} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', font: '400 10px/13px var(--font-ui)', color: 'var(--text-disabled)' }}>{i18n.t(k)}</span>
                ))}
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
                {Array.from({ length: 7 }, (_, row) => (
                  <div key={row} style={{ display: 'grid', gridTemplateColumns: 'repeat(24, 1fr)', gap: 3 }}>
                    {Array.from({ length: 24 }, (_, col) => <span key={col} style={{ aspectRatio: '1', borderRadius: 2, background: 'var(--gold-warm)', opacity: pseudoFill(row * 24 + col), display: 'block' }} />)}
                  </div>
                ))}
                <div dir="ltr" style={{ display: 'grid', gridTemplateColumns: 'repeat(24, 1fr)', gap: 3, paddingTop: 5 }}>
                  {Array.from({ length: 24 }, (_, col) => <span key={col} style={{ font: '400 9px/12px var(--font-ui)', color: 'var(--text-disabled)', textAlign: 'center' }}>{col % 2 === 0 ? i18n.number(col) : ''}</span>)}
                </div>
              </div>
            </div>
            <NeedsNote i18n={i18n} textKey="aiActivitySoonHeatmapNote" />
          </div>
        </Panel>
        <Panel variant="soon" padding={0}>
          <PanelHeader icon="target" iconColor="var(--gold-warm)" title={i18n.t('aiActivitySoonLeaderboard')} trailing={<SoonBadge i18n={i18n} />} />
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'right', padding: '0 0 9px', font: '400 10px/14px var(--font-ui)', letterSpacing: '.06em', color: 'var(--text-disabled)', borderBottom: '1px solid var(--border-hairline)' }}>{i18n.t('aiActivityLeaderEngine')}</th>
                    <th style={{ textAlign: 'center', padding: '0 0 9px', font: '400 10px/14px var(--font-ui)', letterSpacing: '.06em', color: 'var(--text-disabled)', borderBottom: '1px solid var(--border-hairline)' }}>{i18n.t('aiActivityLeaderHelpful')}</th>
                    <th style={{ textAlign: 'center', padding: '0 0 9px', font: '400 10px/14px var(--font-ui)', letterSpacing: '.06em', color: 'var(--text-disabled)', borderBottom: '1px solid var(--border-hairline)' }}>{i18n.t('aiActivityLeaderRight')}</th>
                    <th style={{ textAlign: 'left', padding: '0 0 9px', font: '400 10px/14px var(--font-ui)', letterSpacing: '.06em', color: 'var(--text-disabled)', borderBottom: '1px solid var(--border-hairline)' }}>{i18n.t('aiActivityLeaderSample')}</th>
                  </tr>
                </thead>
                <tbody>
                  {LEADER_ROWS.map((row, i) => (
                    <tr key={row.id}>
                      <td style={{ padding: '11px 0', borderBottom: i === LEADER_ROWS.length - 1 ? 0 : '1px solid var(--border-hairline)' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8, font: 'var(--type-body)', color: 'var(--text-muted)' }}><span style={{ width: 9, height: 9, borderRadius: 3, background: providerColor(row.id), display: 'block', flex: 'none' }} />{row.label}</span>
                      </td>
                      <td style={{ padding: '11px 0', textAlign: 'center', font: 'var(--type-body)', color: 'var(--text-muted)', borderBottom: i === LEADER_ROWS.length - 1 ? 0 : '1px solid var(--border-hairline)' }}>—</td>
                      <td style={{ padding: '11px 0', textAlign: 'center', font: 'var(--type-body)', color: 'var(--text-muted)', borderBottom: i === LEADER_ROWS.length - 1 ? 0 : '1px solid var(--border-hairline)' }}>—</td>
                      <td style={{ padding: '11px 0', textAlign: 'left', font: 'var(--type-body)', color: 'var(--text-muted)', borderBottom: i === LEADER_ROWS.length - 1 ? 0 : '1px solid var(--border-hairline)' }}>—</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <NeedsNote i18n={i18n} textKey="aiActivitySoonLeaderboardNote" />
          </div>
        </Panel>
      </div>

      <Panel variant="soon" padding={0}>
        <PanelHeader icon="book" iconColor="var(--gold-warm)" title={i18n.t('aiActivitySoonTraining')} trailing={<SoonBadge i18n={i18n} />} />
        <div style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: '18px 32px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)', textWrap: 'pretty' }}>{i18n.t('aiActivityTrainingIntro')}</span>
            {[['aiActivityTrainingLondon', 84], ['aiActivityTrainingHns', 67], ['aiActivityTrainingReversion', 38], ['aiActivityTrainingNyGap', 19]].map(([labelKey, w]) => (
              <div key={labelKey} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 112, flex: 'none', font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{i18n.t(labelKey)}</span>
                <span style={{ flex: 1, height: 10, borderRadius: 5, background: 'rgba(244,234,215,.05)', overflow: 'hidden', display: 'block' }}><span style={{ display: 'block', height: '100%', borderRadius: 5, width: w + '%', background: 'rgba(214,175,107,.22)' }} /></span>
                <span style={{ width: 20, flex: 'none', textAlign: 'end', font: 'var(--type-caption)', color: 'var(--text-disabled)' }}>—</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)', textWrap: 'pretty' }}>{i18n.t('aiActivityTrainingGapsIntro')}</span>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11, padding: '11px 13px', borderRadius: 9, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.45)' }}>
              <Icon name="triangle-alert" size={16} style={{ color: 'var(--gold-warm)', marginTop: 1, flex: 'none' }} />
              <span style={{ font: 'var(--type-body)', color: 'var(--text-muted)' }}>{i18n.t('aiActivityTrainingGap1')}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11, padding: '11px 13px', borderRadius: 9, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,7,.45)' }}>
              <Icon name="triangle-alert" size={16} style={{ color: 'var(--gold-warm)', marginTop: 1, flex: 'none' }} />
              <span style={{ font: 'var(--type-body)', color: 'var(--text-muted)' }}>{i18n.t('aiActivityTrainingGap2')}</span>
            </div>
            <NeedsNote i18n={i18n} textKey="aiActivitySoonTrainingNote" />
          </div>
        </div>
      </Panel>
    </div>
  );
}

function AiAssistantView({ i18n, settingsStore, usageStore, chatHistoryStore }) {
  const [model, setModel] = React.useState(() => settingsStore.activeProvider());
  const catalog = React.useMemo(() => settingsStore.visibleProviderCatalog(model), [model, settingsStore]);
  // Top-level page tab (dashboard/engines/persona/panelbuilder/costs/memory/activity) - separate
  // from `aiTab` below, which is the Engines tab's OWN internal engine/keys sub-tab and is
  // completely unaffected by this addition.
  const [topTab, setTopTab] = React.useState('dashboard');
  const [aiTab, setAiTab] = React.useState('engine');
  const [openChatId, setOpenChatId] = React.useState(null);
  const [openChatDetail, setOpenChatDetail] = React.useState(null);
  const [chats, setChats] = React.useState([]);
  const [chatsLoading, setChatsLoading] = React.useState(false);
  const [, forceRerender] = React.useReducer((x) => x + 1, 0);
  const [revealByProvider, setRevealByProvider] = React.useState({});
  const [keyStatusByProvider, setKeyStatusByProvider] = React.useState({});
  const [keyMessageByProvider, setKeyMessageByProvider] = React.useState({});
  const [savedAtByProvider, setSavedAtByProvider] = React.useState({});
  const testTimer = React.useRef(null);
  const clearMessageTimer = React.useRef(null);
  // Real, gateway-settled per-model cost (task D.1) - a server fetch, never the local
  // usageStore's own client-reported token counts above (that store stays exactly as-is, per
  // task C.2's "preserve the existing client usage UI's immediate local feedback").
  const [realCostByModel, setRealCostByModel] = React.useState(null);
  React.useEffect(() => {
    fetch('/api/users/me/ai-usage-by-model').then((r) => r.json()).then((d) => setRealCostByModel(d.byModel || [])).catch(() => setRealCostByModel([]));
  }, []);

  // Dashboard tab's wallet card: the real balance (/api/sync/wallet, same endpoint
  // accountProfileView.jsx's own wallet UI already reads) plus a runway estimate computed from
  // real last-30-day retail charges (a SEPARATE, days-scoped fetch - never repurposing
  // realCostByModel above, which stays lifetime-scoped for the Engines tab exactly as before).
  // null runway (not 0) when there's no recent spend to extrapolate from.
  const [walletBalanceUsd, setWalletBalanceUsd] = React.useState(null);
  const [walletRunwayDays, setWalletRunwayDays] = React.useState(null);
  React.useEffect(() => {
    Promise.all([
      fetch('/api/sync/wallet').then((r) => r.json()).catch(() => null),
      fetch('/api/users/me/ai-usage-by-model?days=30').then((r) => r.json()).catch(() => null)
    ]).then(([wallet, recent]) => {
      const balanceUsd = wallet ? (Number(wallet.totalBalanceMicroUsd) || 0) / 1000000 : null;
      setWalletBalanceUsd(balanceUsd);
      const rows = (recent && recent.byModel) || [];
      const totalMicroUsd = rows.reduce((sum, row) => sum + (Number(row.retailChargeMicroUsd) || 0), 0);
      const avgDailyUsd = totalMicroUsd / 1000000 / 30;
      setWalletRunwayDays(balanceUsd != null && avgDailyUsd > 0 ? Math.round(balanceUsd / avgDailyUsd) : null);
    });
  }, []);

  // Real-money subscription rollout: the CURRENT plan's feature flags (byok/premiumModels),
  // reusing the exact same two endpoints SubscriptionTab already calls (accountProfileView.jsx) -
  // never a third/parallel entitlements fetch. `planFeatures` defaults to an all-false shape so a
  // slow/failed fetch fails CLOSED (locked), never open, on both gates below.
  const [planFeatures, setPlanFeatures] = React.useState({ byok: false, premiumModels: false });
  // 'model' | 'byok' | null - which lock the user just bumped into, so the inline notice below
  // shows the right copy; null hides it entirely.
  const [upgradeNotice, setUpgradeNotice] = React.useState(null);
  React.useEffect(() => {
    Promise.all([
      fetch('/api/sync/subscriptions').then((r) => r.json()),
      fetch('/api/sync/subscriptions/catalog').then((r) => r.json())
    ]).then(([sub, cat]) => {
      const plan = cat.plans && cat.plans[sub.plan];
      if (plan) setPlanFeatures({ byok: !!plan.features.byok, premiumModels: !!plan.features.premiumModels });
    }).catch(() => {});
  }, []);

  // Every field this screen reads (key, model choice, voice, remember, budget) lives in
  // ai-settings-store.js, not component state - both stores dispatch a change event on every
  // write (including our own), so this listener is the single re-render trigger for the whole
  // screen. It also keeps the tab strip pointed at whatever engine the ChatDock is on, since
  // that is a separate React root (README: "one selection, two surfaces").
  React.useEffect(() => {
    function onSettingsChanged(event) {
      const next = (event.detail && event.detail.provider) || settingsStore.activeProvider();
      setModel(next);
      forceRerender();
    }
    window.addEventListener('tradejournal:ai-settings-changed', onSettingsChanged);
    return () => window.removeEventListener('tradejournal:ai-settings-changed', onSettingsChanged);
  }, []);

  // AI process registry (A4) - mountedRef template, whole-page scope (this screen has no
  // per-tab remount the way Account Profile's tabs do - 'engine'/'keys' is local aiTab state,
  // not a mount signal).
  // Journey F, F36: modelRef keeps applyValue reading the CURRENT active provider (this effect's
  // deps [] only run once at mount) - 'model' below validates against THAT provider's own real
  // models list, never a fixed one captured at mount. 'apiKey'/'persistApiKey'/'budget' are
  // deliberately never wired into applyValue at all - not merely left off the allowlist, since a
  // future allowlist edit here must not accidentally reopen that seam. Every applied value here
  // is already a complete, immediate persist (saveSettings()/setVoice() write straight through,
  // same as Trading Defaults/Region & language) - no separate Save step exists on this screen.
  const modelRef = React.useRef(model);
  modelRef.current = model;
  const engineMountedRef = React.useRef(true);
  React.useEffect(() => {
    engineMountedRef.current = true;
    const registry = window.TradeJournalAIProcessRegistry;
    if (!registry) return undefined;
    registry.register('ai-assistant-engine', {
      allowlist: ['provider', 'model', 'voice'],
      isOpen: () => engineMountedRef.current,
      applyValue: (path, value) => {
        if (path === 'provider') {
          if (catalog.some((p) => p.id === value)) selectEngine(value);
          return;
        }
        if (path === 'model') {
          const current = catalog.find((p) => p.id === modelRef.current);
          if (current && current.models.indexOf(value) > -1) settingsStore.saveSettings({ modelByProvider: { [modelRef.current]: value } });
          return;
        }
        if (path === 'voice') {
          const v = value === true || value === 'true';
          if (value === true || value === false || value === 'true' || value === 'false') settingsStore.setVoice(modelRef.current, v);
        }
      }
    });
    return () => { engineMountedRef.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Conversations are real and server-backed now (ai-chat-history-store.js) - fetched per engine,
  // refreshed whenever the model changes AND on the dock's own
  // tradejournal:ai-chat-history-changed event (a message sent from the dock, or a delete/rename
  // here, must both refresh this same list).
  const refreshChats = React.useCallback(() => {
    if (!chatHistoryStore) return;
    setChatsLoading(true);
    chatHistoryStore.listFor(model)
      .then((list) => setChats(list))
      .catch(() => setChats([]))
      .finally(() => setChatsLoading(false));
  }, [model, chatHistoryStore]);

  React.useEffect(() => { refreshChats(); }, [refreshChats]);

  React.useEffect(() => {
    function onChanged() { forceRerender(); refreshChats(); }
    window.addEventListener('tradejournal:ai-chat-history-changed', onChanged);
    return () => window.removeEventListener('tradejournal:ai-chat-history-changed', onChanged);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshChats]);

  React.useEffect(() => () => { clearTimeout(testTimer.current); clearTimeout(clearMessageTimer.current); }, []);

  const rtl = i18n.direction() === 'rtl';
  const character = currentNavryaCharacter();
  const settings = settingsStore.settings();
  const entry = catalog.find((p) => p.id === model) || catalog[0];
  const engLabel = providerLabel(i18n, model);
  const engGlyph = glyphModel(entry);

  const usageToday = usageStore ? usageStore.today() : { byProvider: {} };
  const usageMonth = usageStore ? usageStore.thisMonth() : { byProvider: {} };
  const usageLifetime = usageStore ? usageStore.lifetime() : { byProvider: {} };
  const todayTokens = (usageToday.byProvider[model] && usageToday.byProvider[model].totalTokens) || 0;
  const monthTokens = (usageMonth.byProvider[model] && usageMonth.byProvider[model].totalTokens) || 0;
  const lifeTokens = (usageLifetime.byProvider[model] && usageLifetime.byProvider[model].totalTokens) || 0;
  const budget = settings.budgetByProvider[model];
  const budgetPct = budget ? Math.min(100, Math.round((monthTokens / budget) * 100)) : 0;

  const avgTokens = chats.length ? Math.round(chats.reduce((sum, c) => sum + (c.tokens || 0), 0) / chats.length) : 0;

  const key = settingsStore.getKey(model);
  const voice = !!settings.voiceByProvider[model];
  const reveal = !!revealByProvider[model];
  const keyStatus = keyStatusByProvider[model];
  const keyMessage = keyMessageByProvider[model];
  const savedAt = savedAtByProvider[model];

  // Recomputed on every render (cheap: a handful of localStorage-backed store reads) rather than
  // memoized - memoizing it would need its own invalidation signal for clearMemoryBucket()'s
  // writes, and forceRerender() already gives every write in this screen a fresh render for free.
  const memory = memorySnapshot();

  function selectEngine(nextId) {
    setModel(nextId);
    setAiTab('engine');
    setOpenChatId(null);
    settingsStore.saveSettings({ provider: nextId });
  }
  // Dashboard tab's own engine cards need to both pick the engine AND actually switch to the
  // Engines tab so the user sees the result - selectEngine() alone only sets the internal
  // engine/keys sub-tab, which is invisible while topTab isn't 'engines'.
  function selectEngineFromDashboard(nextId) { selectEngine(nextId); setTopTab('engines'); }
  function selectKeysTab() { setAiTab('keys'); }

  function setKeyMessageFor(id, value) {
    setKeyMessageByProvider((prev) => ({ ...prev, [id]: value }));
    clearTimeout(clearMessageTimer.current);
    if (value) clearMessageTimer.current = window.setTimeout(() => setKeyMessageByProvider((prev) => ({ ...prev, [id]: null })), 3000);
  }

  async function testConnection() {
    const providerAtStart = model;
    setKeyStatusByProvider((prev) => ({ ...prev, [providerAtStart]: 'testing' }));
    try {
      const response = await fetch('/api/ai/test-connection', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: providerAtStart, apiKey: settingsStore.getKey(providerAtStart), model: settingsStore.settings().modelByProvider[providerAtStart] })
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || 'FAILED');
      setKeyStatusByProvider((prev) => ({ ...prev, [providerAtStart]: 'verified' }));
      setKeyMessageFor(providerAtStart, { ok: true, text: i18n.t('aiTestConnectionOk') });
    } catch (_) {
      setKeyStatusByProvider((prev) => ({ ...prev, [providerAtStart]: null }));
      setKeyMessageFor(providerAtStart, { ok: false, text: i18n.t('aiTestConnectionFailed') });
    }
  }

  function onKeyChange(value) {
    settingsStore.setKey(model, value);
    setKeyStatusByProvider((prev) => ({ ...prev, [model]: null }));
  }

  function saveKey() {
    const stamp = new Date();
    const value = stamp.toISOString().slice(0, 10) + ' · ' + stamp.toTimeString().slice(0, 5);
    setSavedAtByProvider((prev) => ({ ...prev, [model]: value }));
  }

  // No empty draft row is created here anymore - the dock itself creates the real conversation
  // record on its first successful reply (chat-dock-core.js). This just tells the dock (a
  // separate React root) to reset to a fresh thread on whichever engine is selected, the same
  // cross-root-sync convention tradejournal:ai-settings-changed already establishes.
  function newChat() {
    window.dispatchEvent(new CustomEvent('tradejournal:ai-resume-conversation', { detail: { id: null, provider: model } }));
  }
  function continueInDock(chat) {
    window.dispatchEvent(new CustomEvent('tradejournal:ai-resume-conversation', { detail: { id: chat.id, provider: model } }));
  }
  function toggleChat(chat) {
    if (openChatId === chat.id) { setOpenChatId(null); setOpenChatDetail(null); return; }
    setOpenChatId(chat.id);
    setOpenChatDetail(null);
    if (chatHistoryStore) {
      chatHistoryStore.get(chat.id).then((record) => setOpenChatDetail(record)).catch(() => setOpenChatDetail({ messages: [] }));
    }
  }
  function deleteChat(chat) {
    if (!chatHistoryStore) return;
    chatHistoryStore.remove(chat.id).then(() => { if (openChatId === chat.id) { setOpenChatId(null); setOpenChatDetail(null); } });
  }
  function clearMemoryBucket(kind) {
    if (!window.confirm(i18n.t('aiMemoryClearConfirm'))) return;
    clearChatHistory(kind);
    forceRerender();
  }
  function exportMemory() {
    const blob = new Blob([JSON.stringify(memory, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'ai-memory-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.append(a); a.click(); a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const memoryRows = [
    { id: 'patterns', label: i18n.t('aiMemoryPatterns'), count: memory.patterns.reduce((n, p) => n + p.chatHistory.length, 0) },
    { id: 'strategies', label: i18n.t('aiMemoryStrategies'), count: memory.strategies.reduce((n, s) => n + s.chatHistory.length, 0) },
    { id: 'mentalHealth', label: i18n.t('aiMemoryMentalHealth'), count: memory.mentalHealth ? memory.mentalHealth.chatHistory.length : 0 }
  ];

  const HEADER_COPY = {
    dashboard: ['aiDashTitle', 'aiDashSubtitle'], engines: ['aiAsstTitle', 'aiAsstSubtitle'],
    persona: ['aiPersonaTitle', 'aiPersonaSubtitle'], panelbuilder: ['aiTabPanelBuilder', 'aiPanelPageSubtitle'],
    costs: ['aiTabCosts', 'aiCostsSubtitle'], memory: ['aiMemoryTitle', 'aiMemorySubtitle'], activity: ['aiActivityTitle', 'aiActivitySubtitle']
  };
  const [headerTitleKey, headerSubtitleKey] = HEADER_COPY[topTab] || HEADER_COPY.dashboard;

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} style={{ direction: rtl ? 'rtl' : 'ltr', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 32, padding: '0 2px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ font: 'var(--type-display-lg)', color: 'var(--text-primary)', letterSpacing: 'var(--tracking-display)', textTransform: 'uppercase' }}>{i18n.t(headerTitleKey)}</div>
          <p style={{ margin: 0, maxWidth: 660, font: 'var(--type-body)', color: 'var(--text-muted)', textWrap: 'pretty' }}>{i18n.t(headerSubtitleKey)}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 'none' }}>
          <Chip tone="accent" dot>{i18n.t('aiAsstActiveInDock')}</Chip>
          <Chip tone="neutral">{engLabel}</Chip>
        </div>
      </div>

      <TopTabs active={topTab} onSelect={setTopTab} i18n={i18n} />

      {topTab === 'dashboard' && (
        <DashboardTab
          i18n={i18n} catalog={catalog} model={model} usageMonth={usageMonth} usageToday={usageToday} realCostByModel={realCostByModel}
          chats={chats} memory={memory} memoryRows={memoryRows} character={character} engGlyph={engGlyph}
          walletBalanceUsd={walletBalanceUsd} walletRunwayDays={walletRunwayDays}
          onSelectEngine={selectEngineFromDashboard} onGoTab={setTopTab} onNewChat={newChat} onContinueChat={continueInDock}
        />
      )}

      {topTab === 'engines' && (
        <React.Fragment>
      <EngineTabStrip
        catalog={catalog} model={model} aiTab={aiTab} usageMonthByProvider={usageMonth.byProvider}
        onSelectEngine={selectEngine} onSelectKeys={selectKeysTab} i18n={i18n}
      />

      {aiTab === 'engine' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {!!upgradeNotice && (
            <Notice tone="accent" icon="crown">
              {i18n.t(upgradeNotice === 'model' ? 'aiAsstPremiumModelLockedNotice' : 'aiAsstByokLockedNotice')}{' '}
              <a href="#account/profile/subscriptions" onClick={() => setUpgradeNotice(null)} style={{ color: 'var(--char-accent)', textDecoration: 'underline', cursor: 'pointer' }}>
                {i18n.t('aiAsstOpenSubscription')}
              </a>
            </Notice>
          )}
          <Panel variant="prestige" ornament texture padding="18px 20px">
            <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
              <span style={{ width: 64, height: 64, flex: 'none', borderRadius: 999, border: '1px solid var(--border-gold)', background: 'linear-gradient(180deg,rgba(17,27,28,.94),rgba(7,11,15,.96))', boxShadow: 'var(--shadow-raised)', display: 'grid', placeItems: 'center' }}>
                <ModelGlyph model={engGlyph} size={30} animate />
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 220 }}>
                <span style={{ font: 'var(--type-caption)', letterSpacing: 'var(--tracking-label)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{i18n.t('aiAsstEngineLabel')}</span>
                <span style={{ font: 'var(--type-display-md)', color: 'var(--text-primary)', letterSpacing: 'var(--tracking-display)' }}>{engLabel}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                <span style={{ font: 'var(--type-body)', fontSize: 12, color: 'var(--text-primary)' }}>{i18n.t('aiAsstModelLabel')}</span>
                <Select
                  value={settings.modelByProvider[model]}
                  options={(entry ? entry.models : []).map((m) => {
                    // modelLabels/modelTiers are optional per-model presentation metadata on the
                    // SAME canonical catalog entry (ai-settings-store.js) - a model with neither
                    // (every legacy id: gpt-5.6, gpt-4.1, gpt-4o, and every non-OpenAI model)
                    // falls back to the raw id exactly as before this composition existed. The
                    // tier phrase itself is real, localized UI copy (ai-i18n.js
                    // aiAsstModelTier<Tier>) - never a hardcoded dollar figure, since retail
                    // pricing/markup stay admin-controlled (server/commercial/wallet-service.mjs).
                    const label = (entry && entry.modelLabels && entry.modelLabels[m]) || m;
                    const tier = entry && entry.modelTiers && entry.modelTiers[m];
                    const tierKey = tier && 'aiAsstModelTier' + tier.charAt(0).toUpperCase() + tier.slice(1);
                    const tierText = tierKey ? i18n.t(tierKey) : '';
                    const isPremiumLocked = entry && entry.premiumModels && entry.premiumModels.indexOf(m) > -1 && !planFeatures.premiumModels;
                    const suffix = isPremiumLocked ? i18n.t('aiAsstModelNeedsSubscription') : tierText;
                    return { value: m, label: suffix ? label + ' — ' + suffix : label };
                  })}
                  onChange={(v) => {
                    const isPremiumLocked = entry && entry.premiumModels && entry.premiumModels.indexOf(v) > -1 && !planFeatures.premiumModels;
                    if (isPremiumLocked) { setUpgradeNotice('model'); return; }
                    settingsStore.saveSettings({ modelByProvider: { [model]: v } });
                  }}
                  icon="sparkle" width={340}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginInlineStart: 8 }}>
                <span style={{ font: 'var(--type-caption)', letterSpacing: 'var(--tracking-label)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{i18n.t('aiAsstPersonalKeyLabel')}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {key ? <Chip tone="success" dot>{i18n.t('aiAsstLinked')}</Chip> : <Chip tone="neutral" dot>{i18n.t('aiAsstNotSet')}</Chip>}
                  <Button variant="ghost" size="sm" icon="key" onClick={selectKeysTab}>{i18n.t('aiAsstEditKey')}</Button>
                </div>
              </div>
              <div style={{ marginInlineStart: 'auto', display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, textAlign: rtl ? 'left' : 'right' }}>
                  <span style={{ font: 'var(--type-caption)', letterSpacing: 'var(--tracking-label)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{i18n.t('aiAsstVoiceMode')}</span>
                  <span style={{ font: 'var(--type-caption)', color: 'var(--text-dim)' }}>{voice ? i18n.t('aiAsstVoiceHandledBy', { model: settings.modelByProvider[model] }) : i18n.t('aiAsstVoiceTextOnly')}</span>
                </div>
                <BigToggle checked={voice} onChange={(v) => settingsStore.setVoice(model, v)} ariaLabel={i18n.t('aiAsstVoiceMode')} />
              </div>
            </div>
          </Panel>

          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
            <Panel variant="base" ornament padding="18px 20px 20px" style={{ flex: '1 1 560px', minWidth: 0 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <span style={{ font: 'var(--type-section-label)', letterSpacing: 'var(--tracking-label)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{i18n.t('aiAsstChatHistory')}</span>
                  <Chip tone="neutral">{i18n.t(chats.length === 1 ? 'aiAsstConversationsOne' : 'aiAsstConversationsMany', { n: chats.length })}</Chip>
                  <span style={{ font: 'var(--type-caption)', color: 'var(--text-dim)', letterSpacing: '.04em' }}>{i18n.t('aiAsstKeptForOnly', { engine: engLabel })}</span>
                  <div style={{ marginInlineStart: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Button variant="ghost" size="sm" icon="trash" onClick={() => { if (window.confirm(i18n.t('aiChatHistoryClearConfirm'))) chatHistoryStore.clear(model).then(refreshChats); }}>{i18n.t('aiAsstClear')}</Button>
                    <Button variant="primary" icon="plus" onClick={newChat}>{i18n.t('aiAsstNewConversation')}</Button>
                  </div>
                </div>
                {chatsLoading && !chats.length ? (
                  <div style={{ padding: 32, textAlign: 'center', font: 'var(--type-body)', color: 'var(--text-muted)' }}>{i18n.t('aiDockHistoryLoading')}</div>
                ) : chats.length > 0 ? (
                  <div className="navrya-scroll" style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 470, overflowY: 'auto', paddingInlineEnd: 6 }}>
                    {chats.map((chat) => (
                      <ChatRow
                        key={chat.id} chat={chat} engineGlyph={engGlyph} expanded={openChatId === chat.id}
                        detail={openChatId === chat.id ? openChatDetail : null}
                        onToggle={() => toggleChat(chat)}
                        onDelete={() => deleteChat(chat)}
                        onContinue={() => continueInDock(chat)}
                        i18n={i18n}
                      />
                    ))}
                  </div>
                ) : (
                  <div style={{ border: '1px dashed var(--border-gold)', borderRadius: 8, minHeight: 300, display: 'grid', placeItems: 'center', textAlign: 'center', padding: 32 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, maxWidth: 420 }}>
                      <span style={{ width: 52, height: 52, borderRadius: 999, border: '1px solid var(--border-gold)', background: 'rgba(3,8,7,.55)', display: 'grid', placeItems: 'center' }}>
                        <ModelGlyph model={engGlyph} size={22} muted />
                      </span>
                      <span style={{ font: 'var(--type-display-md)', color: 'var(--text-primary)', letterSpacing: 'var(--tracking-display)' }}>{i18n.t('aiAsstNoConversationsYet')}</span>
                      <p style={{ margin: 0, font: 'var(--type-body)', color: 'var(--text-muted)', textWrap: 'pretty' }}>{i18n.t('aiAsstEmptyHelper', { engine: engLabel })}</p>
                    </div>
                  </div>
                )}
              </div>
            </Panel>

            <div style={{ width: 392, flex: 'none', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Panel variant="base" ornament padding="18px 20px 20px">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ font: 'var(--type-section-label)', letterSpacing: 'var(--tracking-label)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{i18n.t('aiAsstTokenUsage')}</span>
                    <span style={{ marginInlineStart: 'auto', font: 'var(--type-caption)', letterSpacing: 'var(--tracking-label)', color: 'var(--text-dim)', textTransform: 'uppercase' }}>{engLabel}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: 'var(--divider-gold)', border: '1px solid var(--divider-gold)', borderRadius: 8, overflow: 'hidden' }}>
                    <div style={{ background: 'var(--surface-card)', padding: '6px 0' }}><MetricTile icon="streak" label={i18n.t('aiAsstToday')} value={i18n.number(todayTokens)} /></div>
                    <div style={{ background: 'var(--surface-card)', padding: '6px 0' }}><MetricTile icon="calendar" label={i18n.t('aiAsstThisMonth')} value={i18n.number(monthTokens)} /></div>
                    <div style={{ background: 'var(--surface-card)', padding: '6px 0' }}><MetricTile icon="scenarios" label={i18n.t('aiAsstLifetime')} value={compact(lifeTokens)} /></div>
                    <div style={{ background: 'var(--surface-card)', padding: '6px 0' }}><MetricTile icon="execution" label={i18n.t('aiAsstAvgPerChat')} value={i18n.number(avgTokens)} /></div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                      <span style={{ font: 'var(--type-caption)', letterSpacing: 'var(--tracking-label)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{i18n.t('aiAsstMonthlyBudget')}</span>
                      <span className="navrya-tabular" style={{ marginInlineStart: 'auto', font: 'var(--type-body)', color: 'var(--text-primary)' }}>{budget ? i18n.number(monthTokens) + ' / ' + i18n.number(budget) : i18n.t('aiAsstBudgetUsed', { value: i18n.number(monthTokens) })}</span>
                      <span className="navrya-tabular" style={{ font: 'var(--type-caption)', color: 'var(--char-accent)' }}>{budget ? budgetPct + '%' : '—'}</span>
                    </div>
                    <div style={{ height: 8, borderRadius: 999, background: 'rgba(3,8,7,.65)', border: '1px solid var(--border-hairline)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: 999, background: 'linear-gradient(90deg,color-mix(in srgb, var(--char-accent) 55%, transparent),var(--char-accent))', transition: 'width var(--dur-progress) var(--ease-out)', width: (budget ? budgetPct : 0) + '%' }}></div>
                    </div>
                    <TextField
                      label={i18n.t('aiAsstBudgetFieldLabel')} value={budget ? String(budget) : ''}
                      onChange={(v) => settingsStore.setBudget(model, String(v).replace(/[^0-9]/g, ''))}
                      placeholder={i18n.t('aiAsstBudgetPlaceholder')}
                      hint={budget ? i18n.t('aiAsstBudgetHintSet') : i18n.t('aiAsstBudgetHintUnset')}
                    />
                  </div>
                </div>
              </Panel>

              <Panel variant="base" ornament padding="18px 20px 20px">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ font: 'var(--type-section-label)', letterSpacing: 'var(--tracking-label)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{i18n.t('aiAsstRealCostTitle')}</span>
                    <span style={{ font: 'var(--type-caption)', color: 'var(--text-dim)' }}>{i18n.t('aiAsstRealCostHint')}</span>
                  </div>
                  {!realCostByModel || !realCostByModel.length ? (
                    <span style={{ font: 'var(--type-body)', color: 'var(--text-muted)' }}>{i18n.t('aiAsstRealCostEmpty')}</span>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {realCostByModel.map((row) => (
                        <div key={row.provider + '/' + row.model} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '10px 12px', border: '1px solid var(--border-hairline)', borderRadius: 8, background: 'rgba(11,20,21,.55)' }}>
                          <span style={{ font: 'var(--type-body)', color: 'var(--text-primary)' }}>{row.provider + ' / ' + (row.model || '—')}</span>
                          <div dir="ltr" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, font: 'var(--type-caption)', color: 'var(--text-muted)' }}>
                            <span>{i18n.t('aiAsstRealCostCalls')}: {i18n.number(row.calls)}</span>
                            <span>{i18n.t('aiAsstRealCostTokens')}: {i18n.number(row.totalTokens)}</span>
                            <span>{i18n.t('aiAsstRealCostProviderCost')}: {fmtUsd(row.providerCostMicroUsd)}</span>
                            <span style={{ color: 'var(--char-accent)' }}>{i18n.t('aiAsstRealCostCharged')}: {fmtUsd(row.retailChargeMicroUsd)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Panel>

              <Panel variant="base" ornament padding="18px 20px 20px">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <span style={{ font: 'var(--type-section-label)', letterSpacing: 'var(--tracking-label)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{i18n.t('aiAsstAssistantMemory')}</span>
                    <span style={{ font: 'var(--type-caption)', color: 'var(--text-dim)' }}>{i18n.t('aiAsstMemoryNote')}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {memoryRows.map((row) => (
                      <div key={row.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', border: '1px solid var(--border-hairline)', borderRadius: 8, background: 'rgba(11,20,21,.55)' }}>
                        <span style={{ font: 'var(--type-body)', color: 'var(--text-primary)', flex: 1 }}>{row.label}</span>
                        <span className="navrya-tabular" style={{ font: 'var(--type-body)', color: 'var(--char-accent)' }}>{i18n.number(row.count)}</span>
                        <Button variant="ghost" size="sm" icon="trash" onClick={() => clearMemoryBucket(row.id)}>{i18n.t('aiAsstClear')}</Button>
                      </div>
                    ))}
                  </div>
                  <Button variant="secondary" icon="download" fullWidth onClick={exportMemory}>{i18n.t('aiMemoryExport')}</Button>
                </div>
              </Panel>
            </div>
          </div>
        </div>
      )}

      {aiTab === 'keys' && !planFeatures.byok && (
        // "Do NOT delete the section - lock it with an upgrade message" (task requirement): the
        // BYOK tab itself stays reachable (EngineTabStrip's own tab strip is unaffected) but its
        // content is replaced entirely by this locked state, never a disabled-but-visible form
        // (a locked TextField would still let a determined user paste/submit via devtools; not
        // rendering the real inputs at all is the only real lock).
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 860 }}>
          <Panel variant="base" padding="28px 24px" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, textAlign: 'center' }}>
            <Icon name="lock" size={28} />
            <span style={{ font: 'var(--type-display-md)', color: 'var(--text-primary)' }}>{i18n.t('aiAsstByokLockedTitle')}</span>
            <p style={{ margin: 0, font: 'var(--type-body)', color: 'var(--text-muted)', maxWidth: 480 }}>{i18n.t('aiAsstByokLockedBody')}</p>
            <Button variant="primary" icon="crown" onClick={() => { location.hash = '#account/profile/subscriptions'; }}>{i18n.t('aiAsstOpenSubscription')}</Button>
          </Panel>
        </div>
      )}

      {aiTab === 'keys' && planFeatures.byok && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 860 }}>
          <Notice tone="accent" icon="key">{i18n.t('aiAsstKeyNotice')}</Notice>
          <Panel variant="base" padding="16px 20px 18px">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                <span style={{ width: 40, height: 40, flex: 'none', borderRadius: 999, border: '1px solid var(--border-gold)', background: 'rgba(3,8,7,.55)', display: 'grid', placeItems: 'center' }}>
                  <ModelGlyph model={engGlyph} size={20} />
                </span>
                <span style={{ font: 'var(--type-display-md)', color: 'var(--text-primary)', letterSpacing: 'var(--tracking-display)' }}>{engLabel}</span>
                <span style={{ font: 'var(--type-caption)', letterSpacing: 'var(--tracking-label)', color: 'var(--text-dim)', textTransform: 'uppercase' }}>{entry ? entry.endpoint : ''}</span>
                <span style={{ marginInlineStart: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
                  {keyStatus === 'verified' && <Chip tone="success" dot>{i18n.t('aiAsstVerified')}</Chip>}
                  {keyStatus === 'testing' && <Chip tone="accent" dot>{i18n.t('aiAsstTesting')}</Chip>}
                  {!keyStatus && key && <Chip tone="neutral" dot>{i18n.t('aiAsstStored')}</Chip>}
                  {!keyStatus && !key && <Chip tone="neutral" dot>{i18n.t('aiAsstNotSet')}</Chip>}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                  <TextField
                    label={i18n.t('aiAsstYourKeyLabel', { engine: engLabel })} type={reveal ? 'text' : 'password'} dir="ltr"
                    value={key} onChange={onKeyChange}
                    placeholder={i18n.t('aiAsstKeyPlaceholder', { engine: engLabel })}
                    hint={i18n.t('aiAsstKeyHint', { engine: engLabel })}
                  />
                </div>
                <Button variant="ghost" icon={reveal ? 'eye-off' : 'eye'} onClick={() => setRevealByProvider((prev) => ({ ...prev, [model]: !reveal }))}>
                  {reveal ? i18n.t('aiAsstHide') : i18n.t('aiAsstShow')}
                </Button>
                <Button variant="secondary" icon="sparkle" onClick={testConnection} disabled={keyStatus === 'testing'}>{i18n.t('aiTestConnection')}</Button>
              </div>
              {keyMessage && <span style={{ font: 'var(--type-caption)', color: keyMessage.ok ? 'var(--success)' : 'var(--danger)' }}>{keyMessage.text}</span>}
            </div>
          </Panel>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '0 2px', flexWrap: 'wrap' }}>
            <span style={{ flex: 1, font: 'var(--type-caption)', color: 'var(--text-dim)' }}>{savedAt ? i18n.t('aiAsstLastSaved', { value: savedAt }) : i18n.t('aiAsstNeverSaved')}</span>
            <Button variant="primary" icon="check" onClick={saveKey}>{i18n.t('aiAsstSaveKey')}</Button>
          </div>
        </div>
      )}
        </React.Fragment>
      )}

      {topTab === 'persona' && <PersonaTab i18n={i18n} onGoTab={setTopTab} />}
      {topTab === 'panelbuilder' && <PanelBuilderTab i18n={i18n} character={character} />}
      {topTab === 'costs' && <CostsTab i18n={i18n} catalog={catalog} usageStore={usageStore} settingsStore={settingsStore} realCostByModel={realCostByModel} />}
      {topTab === 'memory' && <MemoryTab i18n={i18n} memory={memory} memoryRows={memoryRows} onClearBucket={clearMemoryBucket} onExport={exportMemory} />}
      {topTab === 'activity' && <ActivityTab i18n={i18n} chats={chats} usageMonth={usageMonth} avgTokens={avgTokens} />}
    </div>
  );
}

export function renderAiAssistant() {
  const i18n = window.TradeJournalAII18n;
  const settingsStore = window.TradeJournalAISettingsStore;
  const usageStore = window.TradeJournalAIUsage;
  const chatHistoryStore = window.TradeJournalAiChatHistoryStore;
  const container = document.createElement('div');
  container.className = 'panel-page';
  container.dataset.character = currentNavryaCharacter();
  createRoot(container).render(<AiAssistantView i18n={i18n} settingsStore={settingsStore} usageStore={usageStore} chatHistoryStore={chatHistoryStore} />);
  return container;
}
