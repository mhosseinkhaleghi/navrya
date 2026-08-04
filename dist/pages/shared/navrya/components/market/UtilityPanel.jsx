import React from 'react';
import { Icon } from '../core/Icon.jsx';
import { Panel } from '../core/Panel.jsx';
import { Select } from '../forms/Select.jsx';

export const LANGUAGES = [
  { value: 'EN', label: 'English', native: 'EN' },
  { value: 'FA', label: '\u0641\u0627\u0631\u0633\u06cc', native: 'FA' },
  { value: 'AR', label: '\u0627\u0644\u0639\u0631\u0628\u064a\u0629', native: 'AR' },
  { value: 'ES', label: 'Espa\u00f1ol', native: 'ES' }
];

/* Utility panel — 344×96. Date, language selector, settings, app uptime. */
export function UtilityPanel({
  date = '2026-07-30', language = 'EN', languages = LANGUAGES, onLanguageChange,
  uptime = '12:48:36', uptimeLabel = 'APP UPTIME', width = 344, onSettings, style, ...rest
}) {
  const [lang, setLang] = React.useState(language);
  React.useEffect(() => setLang(language), [language]);
  const cell = {
    height: 36, display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px',
    color: 'var(--text-primary)', font: 'var(--type-body)'
  };
  return (
    <Panel variant="base" radius={6} style={{ width, background: 'rgba(11,16,22,.55)', overflow: 'visible', ...style }} {...rest}>
      <div style={{ display: 'flex', alignItems: 'center', height: 52, padding: '0 6px', overflow: 'visible' }}>
        <div style={{ ...cell, flex: 1 }}>
          <span style={{ color: 'var(--gold-warm)' }}><Icon name="calendar" size={18} /></span>
          <span className="navrya-tabular" style={{ letterSpacing: '.06em' }}>{date}</span>
        </div>
        <span aria-hidden="true" style={{ width: 1, height: 28, background: 'var(--divider-gold)' }}></span>
        <Select
          value={lang} options={languages} icon="globe" width={138}
          onChange={(v) => { setLang(v); if (onLanguageChange) onLanguageChange(v); }}
          style={{ margin: '0 4px' }}
        />
        <span aria-hidden="true" style={{ width: 1, height: 28, background: 'var(--divider-gold)' }}></span>
        <button
          type="button" onClick={onSettings} aria-label="Settings"
          style={{ ...cell, width: 44, justifyContent: 'center', background: 'none', border: 0, cursor: 'pointer', color: 'var(--gold-warm)' }}
        >
          <Icon name="settings" size={20} />
        </button>
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, height: 30,
        borderTop: '1px solid var(--border-hairline)'
      }}>
        <span style={{ font: 'var(--type-caption)', letterSpacing: 'var(--tracking-label)', color: 'var(--text-muted)' }}>{uptimeLabel}</span>
        <span className="navrya-tabular" style={{ font: 'var(--type-caption)', fontSize: 12, color: 'var(--parchment)', letterSpacing: '.08em' }}>{uptime}</span>
      </div>
    </Panel>
  );
}
