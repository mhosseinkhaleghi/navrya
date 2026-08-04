import React from 'react';
import { Button } from '../public/pages/shared/navrya/components/forms/Button.jsx';

// Same Patterns/Education switch as the legacy moduleTabs()/strategyTabs() helpers each module
// used to build separately - one NAVRYA version, reused by both.
export function StrategyModuleTabs({ active }) {
  const patternI18n = window.TradeJournalPatternI18n;
  const educationI18n = window.TradeJournalStrategyEducationI18n;
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <Button
        variant={active === 'patterns' ? 'primary' : 'ghost'} icon="target"
        onClick={() => { if (window.TradeJournalPatternRegistry) window.TradeJournalPatternRegistry.open(); }}
      >{patternI18n ? patternI18n.t('patternRegistry') : 'Pattern Registry'}</Button>
      <Button
        variant={active === 'education' ? 'primary' : 'ghost'} icon="graduation-cap"
        onClick={() => { if (window.TradeJournalStrategyEducation) window.TradeJournalStrategyEducation.open(); }}
      >{educationI18n ? educationI18n.t('education') : 'Strategy Education'}</Button>
    </div>
  );
}
