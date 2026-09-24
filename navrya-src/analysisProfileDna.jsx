import React from 'react';
import { Panel } from '../public/pages/shared/navrya/components/core/Panel.jsx';
import { Icon } from '../public/pages/shared/navrya/components/core/Icon.jsx';
import { Chip } from '../public/pages/shared/navrya/components/forms/Chip.jsx';
import { focusNames, lensOfProfile } from './analysisProfileLens.js';
import { trt, trDigits } from './analysisProfileTrainingCopy.js';

// "Analysis DNA" (ARCHITECTURE.md §7.25): the one structured picture of a profile - lens, focus areas, and (for a saved
// profile) what the engine has learned - used by the wizard's live preview and the profile detail, built from the
// existing Panel / Chip / Icon primitives so there is no competing design system. It never shows a focus area that does
// not belong to the profile's lens as if it were part of it: those are reconciled through analysisProfileLens.js and, when
// a saved profile still carries some, listed apart under "Outside the current lens" with the reason.

const CONCEPT_CHIP_LIMIT = 8;
const UNDERSTANDING_EXCERPT = 170;

function registries() { return { styles: window.TradeJournalAnalysisStyleRegistry, focuses: window.TradeJournalAnalysisFocusRegistry }; }
function styleName(styles, id, lang) { const s = styles && styles.get(id); return s && s.name ? (s.name[lang] || s.name.en || id) : id; }

function Group({ title, icon, children }) {
  return (
    <section aria-label={title} style={{ display: 'flex', flexDirection: 'column', gap: 9, minWidth: 0 }}>
      <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 7, fontSize: 10.5, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>
        <span style={{ color: 'var(--char-accent)', display: 'inline-flex' }}><Icon name={icon} size={13} /></span>{title}
      </h4>
      {children}
    </section>
  );
}
function Row({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>{label}</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>{children}</div>
    </div>
  );
}
function Muted({ children }) { return <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{children}</span>; }

// profile: { name?, primaryStyleId, secondaryStyleIds, focusIds, customFocuses, concepts?, understanding? }. `concepts` present
// (even empty) means "a saved profile": the Learned group is shown. `showName` puts the profile's name in the header.
export function AnalysisDna({ lang, profile, showName }) {
  const p = profile || {};
  const reg = registries();
  const lens = lensOfProfile(reg, p);
  const hasPrimary = Boolean(p.primaryStyleId && reg.styles && reg.styles.get(p.primaryStyleId));
  const focusList = lens.focusIds.map((id) => reg.focuses && reg.focuses.get(id)).filter(Boolean);
  const custom = Array.isArray(p.customFocuses) ? p.customFocuses : [];
  const showLearned = Array.isArray(p.concepts);
  const enabled = showLearned ? p.concepts.filter((c) => c && c.enabled) : [];
  const ordered = enabled.slice().sort((a, b) => (a.priority === 'mandatory' ? 0 : 1) - (b.priority === 'mandatory' ? 0 : 1));
  const mandatory = enabled.filter((c) => c.priority === 'mandatory').length;
  const understanding = p.understanding && p.understanding.summary ? p.understanding : null;

  return (
    <Panel variant="prestige" padding="18px 20px" data-analysis-dna="true">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={{ fontSize: 10.5, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--char-accent)' }}>{trt(lang, 'dnaTitle')}</span>
          {showName && <span dir="auto" style={{ fontSize: 22, fontWeight: 700, color: 'var(--parchment)', overflowWrap: 'anywhere' }}>{p.name || (hasPrimary ? styleName(reg.styles, p.primaryStyleId, lang) : '')}</span>}
        </div>

        {!hasPrimary ? (
          <Muted>{trt(lang, 'dnaNoLens')}</Muted>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '18px 24px', alignItems: 'start' }}>
            <Group title={trt(lang, 'dnaLensGroup')} icon="strategies">
              <Row label={trt(lang, 'dnaPrimaryLens')}><Chip tone="accent">{styleName(reg.styles, p.primaryStyleId, lang)}</Chip></Row>
              {lens.secondaryStyleIds.length > 0 && (
                <Row label={trt(lang, 'dnaSecondaryLens')}>{lens.secondaryStyleIds.map((id) => <Chip key={id} tone="neutral">{styleName(reg.styles, id, lang)}</Chip>)}</Row>
              )}
            </Group>

            <Group title={trt(lang, 'dnaFocusGroup')} icon="scenarios">
              {focusList.length === 0 && custom.length === 0 ? <Muted>{trt(lang, 'dnaNoFocus')}</Muted> : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {focusList.map((f) => <Chip key={f.id} tone="neutral">{f.name[lang] || f.name.en}</Chip>)}
                  {custom.map((f) => <Chip key={f.id} tone="accent">{f.name}</Chip>)}
                </div>
              )}
            </Group>

            {showLearned && (
              <Group title={trt(lang, 'dnaLearnedGroup')} icon="sparkle">
                {enabled.length === 0 && !understanding ? <Muted>{trt(lang, 'dnaNoLearned')}</Muted> : (
                  <React.Fragment>
                    {enabled.length > 0 && (
                      <React.Fragment>
                        <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{trt(lang, 'conceptsCount', { n: trDigits(lang, enabled.length), m: trDigits(lang, mandatory) })}</span>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {ordered.slice(0, CONCEPT_CHIP_LIMIT).map((c) => <Chip key={c.id} tone={c.priority === 'mandatory' ? 'accent' : 'neutral'}>{c.title}</Chip>)}
                          {ordered.length > CONCEPT_CHIP_LIMIT && <Muted>{trt(lang, 'dnaMoreConcepts', { n: trDigits(lang, ordered.length - CONCEPT_CHIP_LIMIT) })}</Muted>}
                        </div>
                      </React.Fragment>
                    )}
                    {understanding && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>{trt(lang, 'understandingTitle')} · {trt(lang, 'understandingVersion', { n: trDigits(lang, understanding.version || 0) })}</span>
                        <p dir="auto" style={{ margin: 0, fontSize: 12, lineHeight: 1.8, color: 'var(--text-muted)' }}>
                          {understanding.summary.length > UNDERSTANDING_EXCERPT ? understanding.summary.slice(0, UNDERSTANDING_EXCERPT) + '…' : understanding.summary}
                        </p>
                      </div>
                    )}
                  </React.Fragment>
                )}
              </Group>
            )}
          </div>
        )}

        {lens.staleFocusIds.length > 0 && (
          <div role="note" data-dna-stale="true" style={{ display: 'flex', flexDirection: 'column', gap: 7, padding: '10px 12px', borderRadius: 10, border: '1px solid rgba(255,176,32,.45)', background: 'rgba(255,176,32,.07)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5, fontWeight: 600, color: 'var(--warning)' }}>
              <Icon name="triangle-alert" size={14} />{trt(lang, 'dnaStaleFocus')}
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {focusNames(reg.focuses, lens.staleFocusIds, lang).map((name, index) => <Chip key={lens.staleFocusIds[index]} tone="warning">{name}</Chip>)}
            </div>
            <span style={{ fontSize: 11, lineHeight: 1.7, color: 'var(--text-dim)' }}>{trt(lang, 'dnaStaleHint')}</span>
          </div>
        )}
      </div>
    </Panel>
  );
}

// What a lens change just did to the selection, in words: the focus areas that no longer fit and were removed, and/or the primary
// lens being taken out of the complementary lenses. `removedFocusIds` come from analysisProfileLens.applyLensChange();
// `mode` 'stale' is the same list read from an already-saved profile (nothing removed yet - it is removed when saved).
export function LensNotice({ lang, removedFocusIds, secondaryRemoved, mode }) {
  const focuses = window.TradeJournalAnalysisFocusRegistry;
  const ids = Array.isArray(removedFocusIds) ? removedFocusIds : [];
  if (!ids.length && !secondaryRemoved) return null;
  const names = focusNames(focuses, ids, lang).join(lang === 'fa' || lang === 'ar' ? '، ' : ', ');
  return (
    <div role="status" data-lens-notice={mode === 'stale' ? 'stale' : 'removed'} style={{
      display: 'flex', flexDirection: 'column', gap: 4, padding: '9px 12px', borderRadius: 10,
      border: '1px solid rgba(255,176,32,.45)', background: 'rgba(255,176,32,.07)', fontSize: 12, lineHeight: 1.8, color: 'var(--text-primary)'
    }}>
      {ids.length > 0 && <span dir="auto">{trt(lang, mode === 'stale' ? 'lensStaleOnOpen' : 'lensRemovedFocuses', { n: trDigits(lang, ids.length), names })}</span>}
      {secondaryRemoved && <span dir="auto">{trt(lang, 'lensRemovedSecondary')}</span>}
    </div>
  );
}
