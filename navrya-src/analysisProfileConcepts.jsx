import React from 'react';
import { Panel } from '../public/pages/shared/navrya/components/core/Panel.jsx';
import { Icon } from '../public/pages/shared/navrya/components/core/Icon.jsx';
import { Button } from '../public/pages/shared/navrya/components/forms/Button.jsx';
import { AiErrorNotice } from './analysisProfileAiStatus.jsx';
import { toAiError } from './analysisProfileAiErrors.js';
import { trt, trDigits } from './analysisProfileTrainingCopy.js';

// The Analysis Profile "Concepts" tab (ARCHITECTURE.md §7.25): the list/table of specific, checkable
// concepts the engine should look for when it reads a chart under this profile - "Elliott impulse
// count", "swept liquidity levels" - that the trader curates by hand, seeds for free from their
// style's built-in reference list, or grows with AI suggestions.
//
// Every way of ADDING concepts (manual, starter, an accepted AI suggestion) goes through the store's
// one applyLearning() funnel - exactly one profile save and one learning-ledger event per action, so
// the Memory tab's history is a complete record. Routine edits (priority, enabled, rename, delete)
// are plain profile updates, not "teaching", so they deliberately do not write history rows.
//
// `mandatory` is the concept priority that the Session AI Analysis prompt treats as a real
// "address this every time" instruction (server/pattern-ai-server.mjs's
// buildSessionAnalysisSystemPrompt) - see analysis-profile-normalize.mjs's header for why this is
// separate from AI freedom/strictness, which stays a per-analysis-request choice.

function store() { return window.TradeJournalAnalysisProfileStore; }
function aiClient() { return window.TradeJournalAnalysisProfileAI; }
function styleRegistry() { return window.TradeJournalAnalysisStyleRegistry; }

const PRIORITY_RANK = { mandatory: 0, preferred: 1, reference: 2 };
const PRIORITY_KEY = { mandatory: 'priorityMandatory', preferred: 'priorityPreferred', reference: 'priorityReference' };
const ORIGIN_KEY = { user: 'originUser', ai: 'originAi', source: 'originSource', chat: 'originChat', starter: 'originStarter' };
const COLUMNS = 'minmax(0,2.6fr) 128px 92px 64px 74px';

const inputStyle = {
  boxSizing: 'border-box', height: 38, padding: '0 12px', borderRadius: 8, border: '1px solid var(--border-hairline)',
  background: 'rgba(11,20,21,.6)', color: 'var(--text-primary)', font: 'inherit', fontSize: 12.5, outline: 'none', minWidth: 0
};
const selectStyle = { ...inputStyle, height: 32, fontSize: 11.5, padding: '0 8px' };

function capitalize(text) { return text ? text.charAt(0).toUpperCase() + text.slice(1) : text; }

// Concepts the built-in style registry already names for this profile's styles (coreConcepts is
// English-only registry metadata), minus anything the trader already has - deduplicated by the
// store's own folded-title key so "Momentum" and "momentum" are never both offered.
function starterCandidates(profile, lang) {
  const styles = styleRegistry();
  const helpers = store() && store().helpers;
  if (!styles || !helpers) return [];
  const have = {};
  profile.concepts.forEach((c) => { have[helpers.foldFocusName(c.title)] = true; });
  const seen = {};
  const out = [];
  [profile.primaryStyleId].concat(profile.secondaryStyleIds || []).forEach((id) => {
    const style = styles.get(id);
    if (!style) return;
    const styleName = style.name[lang] || style.name.en;
    (style.coreConcepts || []).forEach((raw) => {
      const title = capitalize(String(raw).trim());
      const key = helpers.foldFocusName(title);
      if (!key || have[key] || seen[key]) return;
      seen[key] = true;
      out.push({ title, styleName });
    });
  });
  return out;
}

// Where a concept came from - a real audit trail (the trader wrote it, the AI proposed it and they
// approved it, it is built in from the style registry, ...), never decoration.
function OriginBadge({ lang, origin }) {
  const tone = origin === 'ai' ? 'var(--gold-warm)' : origin === 'user' ? 'var(--char-accent)' : 'var(--text-dim)';
  return <span style={{ fontSize: 10.5, padding: '2px 8px', borderRadius: 999, border: '1px solid currentColor', color: tone }}>{trt(lang, ORIGIN_KEY[origin] || 'originUser')}</span>;
}

export function ConceptsTab({ profile, lang }) {
  const profiles = store();
  const helpers = profiles && profiles.helpers;
  const limit = helpers ? helpers.LIMITS.conceptMax : 120;
  const [sort, setSort] = React.useState('priority');
  const [addOpen, setAddOpen] = React.useState(false);
  const [newTitle, setNewTitle] = React.useState('');
  const [newDescription, setNewDescription] = React.useState('');
  const [newPriority, setNewPriority] = React.useState('preferred');
  const [formError, setFormError] = React.useState('');
  const [editingId, setEditingId] = React.useState(null);
  const [editTitle, setEditTitle] = React.useState('');
  const [editDescription, setEditDescription] = React.useState('');
  const [editError, setEditError] = React.useState('');
  const [suggestions, setSuggestions] = React.useState([]);
  const [suggestLoading, setSuggestLoading] = React.useState(false);
  const [suggestError, setSuggestError] = React.useState(null); // { code, status? } of the last failed suggestion request

  const concepts = profile.concepts;
  const mandatoryCount = concepts.filter((c) => c.priority === 'mandatory').length;
  const capacity = Math.max(0, limit - concepts.length);
  const starters = starterCandidates(profile, lang);

  const sorted = concepts.slice().sort((a, b) => {
    if (sort === 'alpha') return a.title.localeCompare(b.title, lang);
    if (sort === 'newest') return new Date(b.createdAt) - new Date(a.createdAt);
    return (PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]) || a.title.localeCompare(b.title, lang);
  });

  function titleTaken(title, exceptId) {
    const key = helpers.foldFocusName(title);
    return concepts.some((c) => c.id !== exceptId && helpers.foldFocusName(c.title) === key);
  }
  function updateConcepts(mapper) { profiles.update(profile.id, { concepts: mapper(profile.concepts) }); }

  function submitNew() {
    if (!profiles || !helpers) return;
    const title = newTitle.trim();
    if (!title) return;
    if (capacity <= 0) { setFormError(trt(lang, 'conceptLimit', { n: trDigits(lang, limit) })); return; }
    if (titleTaken(title, null)) { setFormError(trt(lang, 'conceptDuplicate')); return; }
    profiles.applyLearning(profile.id, {
      conceptsToAdd: [{ title, description: newDescription, priority: newPriority, origin: 'user' }],
      eventKind: 'concept_added', eventTitle: title
    });
    setNewTitle(''); setNewDescription(''); setNewPriority('preferred'); setFormError('');
  }

  function addStarters() {
    if (!profiles || !starters.length || capacity <= 0) return;
    const chosen = starters.slice(0, capacity);
    profiles.applyLearning(profile.id, {
      conceptsToAdd: chosen.map((c) => ({ title: c.title, description: trt(lang, 'starterDescription', { style: c.styleName }), priority: 'reference', origin: 'starter' })),
      eventKind: 'starter_concepts_added', eventTitle: chosen.map((c) => c.title).join(', ').slice(0, 200)
    });
  }

  function startEdit(concept) { setEditingId(concept.id); setEditTitle(concept.title); setEditDescription(concept.description); setEditError(''); }
  function saveEdit(concept) {
    const title = editTitle.trim();
    if (!title) return;
    // A rename that collides with another concept must be refused here: the store's normalize()
    // would otherwise silently DROP one of the two duplicates on save.
    if (titleTaken(title, concept.id)) { setEditError(trt(lang, 'conceptDuplicate')); return; }
    updateConcepts((list) => list.map((c) => (c.id === concept.id ? { ...c, title, description: editDescription } : c)));
    setEditingId(null);
  }
  function patchConcept(concept, patch) { updateConcepts((list) => list.map((c) => (c.id === concept.id ? { ...c, ...patch } : c))); }
  function removeConcept(concept) {
    if (!window.confirm(trt(lang, 'deleteConceptConfirm'))) return;
    updateConcepts((list) => list.filter((c) => c.id !== concept.id));
  }

  async function suggest() {
    const client = aiClient();
    if (!client || !profiles || suggestLoading) return;
    setSuggestLoading(true); setSuggestError(null);
    try {
      const result = await client.suggestConcepts({
        primaryStyleId: profile.primaryStyleId, secondaryStyleIds: profile.secondaryStyleIds, customMethodNotes: profile.customMethodNotes, language: lang,
        alreadySelected: concepts.map((c) => c.title), alreadySuggested: suggestions.map((s) => s.name)
      });
      // Tokens are spent the moment the call returns, accepted or not - so the history records them now.
      profiles.recordEvent(profile.id, {
        kind: 'ai_suggested_concepts', title: result.suggestions.map((s) => s.name).join(', ').slice(0, 200),
        understandingVersion: profile.understanding.version, tokenUsage: result.usage || null
      }).catch(() => {});
      setSuggestions((prev) => prev.concat(result.suggestions.map((s) => ({ name: s.name, description: s.description, priority: s.priority || 'preferred', selected: false }))));
    } catch (caught) {
      setSuggestError(toAiError(caught));
    } finally {
      setSuggestLoading(false);
    }
  }
  function patchSuggestion(name, patch) { setSuggestions((prev) => prev.map((s) => (s.name === name ? { ...s, ...patch } : s))); }
  const chosen = suggestions.filter((s) => s.selected);
  function addChosen() {
    if (!profiles || !chosen.length || capacity <= 0) return;
    const taking = chosen.slice(0, capacity);
    // ONE applyLearning() for the whole accepted batch - never one save per concept.
    profiles.applyLearning(profile.id, {
      conceptsToAdd: taking.map((s) => ({ title: s.name, description: s.description, priority: s.priority, origin: 'ai' })),
      eventKind: 'concepts_ai_accepted', eventTitle: taking.map((s) => s.name).join(', ').slice(0, 200)
    });
    const takenNames = {};
    taking.forEach((s) => { takenNames[s.name] = true; });
    setSuggestions((prev) => prev.filter((s) => !takenNames[s.name]));
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.9, color: 'var(--text-muted)', maxWidth: 760 }}>{trt(lang, 'conceptsSubtitle')}</p>
        <span style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>{trt(lang, 'conceptsCount', { n: trDigits(lang, concepts.length), m: trDigits(lang, mandatoryCount) })} · {trt(lang, 'priorityHelp')}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Button variant="primary" size="sm" icon="plus" onClick={() => setAddOpen((v) => !v)}>{trt(lang, 'addConcept')}</Button>
        <Button variant="secondary" size="sm" icon="list" disabled={!starters.length || capacity <= 0} onClick={addStarters}>{trt(lang, 'starterBtn', { n: trDigits(lang, Math.min(starters.length, capacity)) })}</Button>
        <Button variant="secondary" size="sm" icon="sparkle" loading={suggestLoading} disabled={suggestLoading} onClick={suggest}>{suggestLoading ? trt(lang, 'suggestLoading') : trt(lang, 'suggestBtn')}</Button>
        <span style={{ marginInlineStart: 'auto', display: 'flex', gap: 6 }}>
          {[['priority', 'sortPriority'], ['newest', 'sortNewest'], ['alpha', 'sortAlpha']].map(([id, key]) => (
            <button key={id} type="button" onClick={() => setSort(id)} style={{
              height: 30, padding: '0 11px', borderRadius: 7, cursor: 'pointer', font: 'inherit', fontSize: 11,
              border: '1px solid ' + (sort === id ? 'var(--char-accent)' : 'var(--border-hairline)'),
              background: sort === id ? 'var(--char-active-surface)' : 'transparent', color: sort === id ? 'var(--char-accent)' : 'var(--text-muted)'
            }}>{trt(lang, key)}</button>
          ))}
        </span>
      </div>
      <span style={{ fontSize: 10.5, color: 'var(--text-dim)', marginTop: -8 }}>
        {starters.length ? trt(lang, 'starterHint') : trt(lang, 'starterNone')} · {trt(lang, 'suggestHint')}
      </span>

      {addOpen && (
        <Panel padding="14px 16px">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input type="text" value={newTitle} onChange={(e) => { setNewTitle(e.target.value); setFormError(''); }} dir="auto" placeholder={trt(lang, 'addConceptTitlePlaceholder')}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitNew(); } }} style={{ ...inputStyle, flex: '2 1 220px' }} />
              <input type="text" value={newDescription} onChange={(e) => setNewDescription(e.target.value)} dir="auto" placeholder={trt(lang, 'addConceptDescPlaceholder')}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitNew(); } }} style={{ ...inputStyle, flex: '2 1 220px' }} />
              <select value={newPriority} onChange={(e) => setNewPriority(e.target.value)} style={{ ...inputStyle, flex: '0 0 130px' }}>
                {Object.keys(PRIORITY_KEY).map((p) => <option key={p} value={p}>{trt(lang, PRIORITY_KEY[p])}</option>)}
              </select>
              <Button variant="primary" size="sm" icon="check" disabled={!newTitle.trim()} onClick={submitNew}>{trt(lang, 'addConceptSubmit')}</Button>
            </div>
            {formError && <span style={{ fontSize: 11.5, color: 'var(--danger)' }}>{formError}</span>}
          </div>
        </Panel>
      )}

      {(suggestError || suggestions.length > 0) && (
        <Panel padding="14px 16px">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <AiErrorNotice lang={lang} error={suggestError} onRetry={suggest} busy={suggestLoading} />
            {suggestions.map((s) => (
              <div key={s.name} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 11px', borderRadius: 10, border: '1px dashed ' + (s.selected ? 'var(--char-accent)' : 'var(--divider-gold)'), background: s.selected ? 'var(--char-active-surface)' : 'rgba(183,138,74,.05)' }}>
                <input type="checkbox" checked={s.selected} onChange={(e) => patchSuggestion(s.name, { selected: e.target.checked })} style={{ accentColor: 'var(--char-accent)', marginTop: 3 }} />
                <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, flex: 1 }}>
                  <span dir="auto" style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-primary)' }}><span style={{ fontSize: 9.5, marginInlineEnd: 6, padding: '1px 5px', borderRadius: 5, background: 'rgba(3,8,7,.5)', color: 'var(--gold-warm)' }}>{trt(lang, 'originAi')}</span>{s.name}</span>
                  {s.description && <span dir="auto" style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>{s.description}</span>}
                </span>
                <select value={s.priority} onChange={(e) => patchSuggestion(s.name, { priority: e.target.value })} style={selectStyle}>
                  {Object.keys(PRIORITY_KEY).map((p) => <option key={p} value={p}>{trt(lang, PRIORITY_KEY[p])}</option>)}
                </select>
              </div>
            ))}
            {suggestions.length > 0 && (
              <div style={{ display: 'flex', gap: 8 }}>
                <Button variant="primary" size="sm" icon="check" disabled={!chosen.length || capacity <= 0} onClick={addChosen}>{trt(lang, 'suggestAddSelected', { n: trDigits(lang, chosen.length) })}</Button>
                <Button variant="ghost" size="sm" icon="close" onClick={() => { setSuggestions([]); setSuggestError(null); }}>{trt(lang, 'suggestDismiss')}</Button>
              </div>
            )}
          </div>
        </Panel>
      )}

      {!concepts.length ? (
        <Panel variant="quiet" padding="34px 20px">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--parchment)' }}>{trt(lang, 'emptyConcepts')}</span>
            <span style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>{trt(lang, 'emptyConceptsBody')}</span>
          </div>
        </Panel>
      ) : (
        <Panel variant="base" padding={0}>
          <div style={{ overflowX: 'auto' }}>
            <div role="table" style={{ minWidth: 640 }}>
              <div role="row" style={{ display: 'grid', gridTemplateColumns: COLUMNS, gap: 0, background: 'rgba(3,8,7,.35)', borderBottom: '1px solid var(--border-hairline)' }}>
                {['colConcept', 'colPriority', 'colOrigin', 'colEnabled', ''].map((key, i) => (
                  <span key={i} role="columnheader" style={{ padding: '9px 14px', fontSize: 10.5, letterSpacing: '.07em', color: 'var(--text-dim)' }}>{key ? trt(lang, key) : ''}</span>
                ))}
              </div>
              {sorted.map((concept) => (
                <div key={concept.id} role="row" style={{ display: 'grid', gridTemplateColumns: COLUMNS, alignItems: 'center', borderBottom: '1px solid var(--border-hairline)', opacity: concept.enabled ? 1 : 0.55 }}>
                  <span role="cell" style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                    {editingId === concept.id ? (
                      <React.Fragment>
                        <input type="text" value={editTitle} onChange={(e) => { setEditTitle(e.target.value); setEditError(''); }} dir="auto" style={inputStyle} />
                        <input type="text" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} dir="auto" placeholder={trt(lang, 'addConceptDescPlaceholder')} style={inputStyle} />
                        {editError && <span style={{ fontSize: 11, color: 'var(--danger)' }}>{editError}</span>}
                        <span style={{ display: 'flex', gap: 6 }}>
                          <Button variant="primary" size="sm" icon="check" disabled={!editTitle.trim()} onClick={() => saveEdit(concept)}>{trt(lang, 'saveConcept')}</Button>
                          <Button variant="ghost" size="sm" icon="close" onClick={() => setEditingId(null)}>{trt(lang, 'cancel')}</Button>
                        </span>
                      </React.Fragment>
                    ) : (
                      <React.Fragment>
                        <span dir="auto" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{concept.title}</span>
                        {concept.description && <span dir="auto" style={{ fontSize: 11.5, color: 'var(--text-dim)' }}>{concept.description}</span>}
                      </React.Fragment>
                    )}
                  </span>
                  <span role="cell" style={{ padding: '10px 14px' }}>
                    <select value={concept.priority} onChange={(e) => patchConcept(concept, { priority: e.target.value })} aria-label={trt(lang, 'colPriority')} style={selectStyle}>
                      {Object.keys(PRIORITY_KEY).map((p) => <option key={p} value={p}>{trt(lang, PRIORITY_KEY[p])}</option>)}
                    </select>
                  </span>
                  <span role="cell" style={{ padding: '10px 14px' }}><OriginBadge lang={lang} origin={concept.origin} /></span>
                  <span role="cell" style={{ padding: '10px 14px' }}>
                    <input type="checkbox" checked={concept.enabled} onChange={(e) => patchConcept(concept, { enabled: e.target.checked })} title={concept.enabled ? trt(lang, 'enabledOn') : trt(lang, 'enabledOff')} aria-label={trt(lang, 'colEnabled')} style={{ accentColor: 'var(--char-accent)', width: 16, height: 16, cursor: 'pointer' }} />
                  </span>
                  <span role="cell" style={{ padding: '6px 8px', display: 'flex', gap: 2 }}>
                    <button type="button" onClick={() => startEdit(concept)} title={trt(lang, 'editConcept')} aria-label={trt(lang, 'editConcept')} style={{ width: 30, height: 30, display: 'grid', placeItems: 'center', borderRadius: 6, cursor: 'pointer', border: '1px solid transparent', background: 'transparent', color: 'var(--text-muted)' }}><Icon name="edit" size={14} /></button>
                    <button type="button" onClick={() => removeConcept(concept)} title={trt(lang, 'deleteConcept')} aria-label={trt(lang, 'deleteConcept')} style={{ width: 30, height: 30, display: 'grid', placeItems: 'center', borderRadius: 6, cursor: 'pointer', border: '1px solid transparent', background: 'transparent', color: 'var(--text-muted)' }}><Icon name="trash" size={14} /></button>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Panel>
      )}
    </div>
  );
}
