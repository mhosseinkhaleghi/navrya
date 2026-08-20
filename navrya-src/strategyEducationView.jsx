import React from 'react';
import { createRoot } from 'react-dom/client';
import { Panel } from '../public/pages/shared/navrya/components/core/Panel.jsx';
import { Chip } from '../public/pages/shared/navrya/components/forms/Chip.jsx';
import { Button } from '../public/pages/shared/navrya/components/forms/Button.jsx';
import { TextField } from '../public/pages/shared/navrya/components/forms/TextField.jsx';
import { Select } from '../public/pages/shared/navrya/components/forms/Select.jsx';
import { Toggle } from '../public/pages/shared/navrya/components/forms/Toggle.jsx';
import { ChatThread } from '../public/pages/shared/navrya/components/feedback/ChatThread.jsx';
import { Modal } from '../public/pages/shared/navrya/components/feedback/Modal.jsx';
import { MetricTile } from '../public/pages/shared/navrya/components/metrics/MetricTile.jsx';
import { Icon } from '../public/pages/shared/navrya/components/core/Icon.jsx';
import { StrategyModuleTabs } from './strategyModuleTabs.jsx';
import { showToast } from './toast.js';
import { currentNavryaCharacter } from './currentCharacter.js';

function navigateList() { window.TradeJournalStrategyEducation.openList(); }
function navigateDetail(id, tab) { window.TradeJournalStrategyEducation.openDetail(id, tab); }
function navigateStrategies() { history.replaceState(null, '', '#strategies'); if (window.TradeJournalPanelLayer) window.TradeJournalPanelLayer.render('strategies'); }

function iconButtonStyle() {
  return { width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border-hairline)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', display: 'grid', placeItems: 'center', flex: 'none' };
}
function fieldLabelNode(text) {
  return <span style={{ display: 'block', marginBottom: 7, font: 'var(--type-body)', fontSize: 12, color: 'var(--text-primary)' }}>{text}</span>;
}
function sectionTitleNode(text) {
  return <h3 style={{ margin: 0, font: 'var(--type-body)', fontWeight: 700, color: 'var(--parchment)' }}>{text}</h3>;
}
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
function formatDate(value, i18n) {
  try { return new Intl.DateTimeFormat(i18n.language(), { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(value)); } catch (_) { return '—'; }
}

// Wraps a DOM node built by an existing legacy function (the detection funnel canvas) - same
// technique psychologyView.jsx's/patternRegistryView.jsx's LegacyNode uses.
function LegacyNode({ build, watch }) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!ref.current) return;
    const node = build();
    ref.current.replaceChildren();
    if (node) { ref.current.append(node); if (window.TradeJournalIcons) window.TradeJournalIcons.schedule(ref.current); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, watch);
  return <div ref={ref} />;
}

function StrategyRow({ strategy, i18n, onChanged }) {
  const store = window.TradeJournalStrategyEducationStore;
  const stats = store.detectionStats(strategy);
  function toggleActive(v) { onChanged(store.setActive(strategy.id, v)); }
  function remove() {
    if (!window.confirm(i18n.t('deleteStrategyTitle') + '\n\n' + i18n.t('deleteStrategyBody'))) return;
    store.remove(strategy.id).then(() => onChanged(null));
  }
  return (
    <Panel variant="base" radius={12} style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <button
        type="button" onClick={() => navigateDetail(strategy.id, 'details')}
        style={{ flex: 1, minWidth: 180, display: 'flex', flexDirection: 'column', gap: 4, background: 'transparent', border: 0, textAlign: 'start', cursor: 'pointer', color: 'inherit', font: 'inherit', padding: 0 }}
      >
        <strong dir="auto" style={{ font: 'var(--type-body)', color: 'var(--parchment)' }}>{strategy.name || i18n.t('newStrategy')}</strong>
        <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{i18n.t(strategy.origin === 'ai_from_event' ? 'originAi' : 'originManual') + ' · ' + formatDate(strategy.updatedAt, i18n)}</span>
      </button>
      <Chip>{i18n.t('detections') + ': ' + i18n.number(stats.total)}</Chip>
      <Chip>{i18n.t('confirmationRate') + ': ' + (stats.confirmationRate === null ? '—' : i18n.number(stats.confirmationRate) + '%')}</Chip>
      <Toggle checked={strategy.active} onChange={toggleActive} />
      <button type="button" onClick={() => navigateDetail(strategy.id, 'details')} title={i18n.t('openStrategy')} style={iconButtonStyle()}><Icon name="arrow-up-right" size={16} /></button>
      <button type="button" onClick={remove} title={i18n.t('deleteStrategy')} style={iconButtonStyle()}><Icon name="trash-2" size={16} /></button>
    </Panel>
  );
}

function EventStrategyModal({ i18n, onClose }) {
  const [narrative, setNarrative] = React.useState('');
  const [images, setImages] = React.useState([]);
  const [analyzing, setAnalyzing] = React.useState(false);
  const [proposal, setProposal] = React.useState(null);
  const blobIdsRef = React.useRef([]);

  async function cleanup() {
    if (window.TradeJournalImageStore) for (const id of blobIdsRef.current) await window.TradeJournalImageStore.deleteImage(id);
    onClose();
  }

  async function analyze() {
    const text = narrative.trim();
    if (!text) return;
    setAnalyzing(true);
    const ai = window.TradeJournalStrategyEducationAI;
    const store = window.TradeJournalStrategyEducationStore;
    const dataUrls = [];
    for (const file of images) {
      if (!/^image\//.test(file.type) || file.size > 15 * 1024 * 1024) continue;
      if (window.TradeJournalImageStore) {
        const id = store.uid('strategy-event-image');
        try { await window.TradeJournalImageStore.saveImage(id, file); blobIdsRef.current.push(id); } catch (_) { /* fall through to inline data URL */ }
      }
      dataUrls.push(await fileToDataUrl(file));
    }
    try {
      const result = await ai.proposeFromEvent(text, dataUrls);
      if (result.local) showToast(i18n.t('aiUnavailable'), 'warning');
      setProposal(result.proposal);
    } finally {
      setAnalyzing(false);
    }
  }

  async function save() {
    const store = window.TradeJournalStrategyEducationStore;
    const strategy = store.create({
      name: proposal.name, active: true, origin: 'ai_from_event',
      overallFramework: { description: proposal.overallFramework + '\n\n' + proposal.validationPlan, attachments: [] },
      positionManagement: { entryRules: proposal.entryRules, stopLossRules: proposal.stopLossRules, exitTargetRules: proposal.exitTargetRules, positionSizingRules: '', freeNotes: '', attachments: [] },
      detectionEvents: [{ source: { type: 'manual' }, predictedOutcome: proposal.predictedOutcome, status: 'pending', detectedAt: store.now() }]
    });
    showToast(i18n.t('strategySaved'), 'success');
    await cleanup();
    navigateDetail(strategy.id, 'details');
  }

  return (
    <Modal title={i18n.t('eventChatTitle')} icon="sparkles" onClose={cleanup}>
      {!proposal ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {fieldLabelNode(i18n.t('eventPrompt'))}
            <textarea
              value={narrative} onChange={(e) => setNarrative(e.target.value)} dir="auto" rows={6}
              style={{ resize: 'vertical', borderRadius: 8, padding: '10px 12px', background: 'rgba(3,8,7,.55)', border: '1px solid var(--border-gold)', color: 'var(--text-primary)', font: 'var(--type-body)', outline: 'none' }}
            />
          </label>
          <div>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 8, border: '1px dashed var(--border-gold)', cursor: 'pointer', color: 'var(--text-muted)', font: 'var(--type-caption)' }}>
              <Icon name="image" size={16} />{i18n.t('eventUpload')}
              <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={(e) => { setImages((prev) => [...prev, ...Array.from(e.target.files || [])]); e.target.value = ''; }} />
            </label>
            {images.length > 0 && <span style={{ marginInlineStart: 10, font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{images.length}</span>}
          </div>
          <Button variant="primary" icon="sparkles" onClick={analyze} disabled={analyzing || !narrative.trim()} style={{ alignSelf: 'flex-start' }}>{i18n.t('analyzeEvent')}</Button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h3 style={{ margin: 0, color: 'var(--parchment)' }}>{proposal.name}</h3>
          <p style={{ margin: 0, color: 'var(--text-primary)' }}>{proposal.overallFramework}</p>
          <strong style={{ color: 'var(--parchment)' }}>{i18n.t('validationPlan')}</strong>
          <p style={{ margin: 0, color: 'var(--text-primary)' }}>{proposal.validationPlan}</p>
          <strong style={{ color: 'var(--parchment)' }}>{i18n.t('predictedOutcome')}</strong>
          <p style={{ margin: 0, color: 'var(--text-primary)' }}>{proposal.predictedOutcome}</p>
          <div style={{ display: 'flex', gap: 10 }}>
            <Button variant="secondary" icon="x" onClick={() => setProposal(null)}>{i18n.t('rejectDraft')}</Button>
            <Button variant="primary" icon="save" onClick={save}>{i18n.t('saveDraftStrategy')}</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function StrategyList({ i18n }) {
  const [, forceTick] = React.useReducer((x) => x + 1, 0);
  const store = window.TradeJournalStrategyEducationStore;
  const strategies = store.listSync();
  const [eventModalOpen, setEventModalOpen] = React.useState(false);

  function createNew() {
    const strategy = store.create({ name: i18n.t('newStrategy'), active: true, origin: 'manual' });
    navigateDetail(strategy.id, 'details');
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: '0 0 4px', font: 'var(--type-display-md)', fontSize: 22, color: 'var(--parchment)' }}>{i18n.t('strategiesTitle')}</h2>
          <p style={{ margin: 0, font: 'var(--type-body)', color: 'var(--text-muted)' }}>{i18n.t('strategiesSubtitle')}</p>
        </div>
        <Button variant="ghost" icon="arrow-left" onClick={navigateStrategies}>{i18n.t('back')}</Button>
      </div>
      <StrategyModuleTabs active="education" />
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Button variant="secondary" icon="sparkles" onClick={() => setEventModalOpen(true)}>{i18n.t('fromEvent')}</Button>
        <Button variant="primary" icon="plus" onClick={createNew}>{i18n.t('newStrategy')}</Button>
      </div>
      {!strategies.length ? (
        <Panel variant="base" radius={12} style={{ padding: 24, textAlign: 'center' }}><span style={{ font: 'var(--type-body)', color: 'var(--text-muted)' }}>{i18n.t('noStrategies')}</span></Panel>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {strategies.map((s) => <StrategyRow key={s.id} strategy={s} i18n={i18n} onChanged={forceTick} />)}
        </div>
      )}
      {eventModalOpen && <EventStrategyModal i18n={i18n} onClose={() => setEventModalOpen(false)} />}
    </div>
  );
}

function pendingSuggestions(strategy, path) {
  const out = [];
  (strategy.chatHistory || []).forEach((message) => { (message.suggestions || []).forEach((item) => { if (item.path === path && item.status === 'pending') out.push(item); }); });
  return out;
}

function ProposalCard({ i18n, strategy, item, onApplied }) {
  const store = window.TradeJournalStrategyEducationStore;
  function act(status) { onApplied(store.applySuggestion(strategy, item, status)); }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, borderRadius: 8, border: '1px solid var(--border-gold)', background: 'rgba(11,16,22,.5)' }}>
      <strong style={{ font: 'var(--type-caption)', color: 'var(--char-accent)' }}>{i18n.t('proposedUpdate')}</strong>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div><small style={{ color: 'var(--text-muted)' }}>{i18n.t('currentValue')}</small><p style={{ margin: 0, color: 'var(--text-primary)' }}>{String(store.getPath(strategy, item.path) || '—')}</p></div>
        <div><small style={{ color: 'var(--text-muted)' }}>{i18n.t('proposedValue')}</small><p style={{ margin: 0, color: 'var(--text-primary)' }}>{String(item.value == null ? '—' : item.value)}</p></div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Button variant="secondary" size="sm" icon="x" onClick={() => act('rejected')}>{i18n.t('reject')}</Button>
        <Button variant="primary" size="sm" icon="check" onClick={() => act('applied')}>{i18n.t('apply')}</Button>
      </div>
    </div>
  );
}

function FieldWithProposals({ strategy, path, i18n, label, type, placeholder, rows, suffix, onChange, onApplied }) {
  const store = window.TradeJournalStrategyEducationStore;
  const value = store.getPath(strategy, path);
  const pending = pendingSuggestions(strategy, path);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {type === 'number' ? (
        <div>
          {fieldLabelNode(label)}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="number" value={value == null ? '' : value} onChange={(e) => onChange(e.target.value)}
              style={{ height: 44, boxSizing: 'border-box', padding: '0 14px', borderRadius: 8, width: '100%', background: 'rgba(3,8,7,.55)', color: 'var(--text-primary)', font: 'var(--type-body)', border: '1px solid var(--border-gold)', outline: 'none' }}
            />
            {suffix && <span style={{ color: 'var(--text-muted)', font: 'var(--type-caption)', flex: 'none' }}>{suffix}</span>}
          </div>
        </div>
      ) : type === 'textarea' ? (
        <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {fieldLabelNode(label)}
          <textarea
            value={value || ''} dir="auto" placeholder={placeholder} rows={rows || 4} onChange={(e) => onChange(e.target.value)}
            style={{ resize: 'vertical', borderRadius: 8, padding: '10px 12px', background: 'rgba(3,8,7,.55)', border: '1px solid var(--border-gold)', color: 'var(--text-primary)', font: 'var(--type-body)', outline: 'none' }}
          />
        </label>
      ) : (
        <TextField label={label} value={value || ''} placeholder={placeholder} dir="auto" onChange={onChange} />
      )}
      {pending.map((item) => <ProposalCard key={item.id} i18n={i18n} strategy={strategy} item={item} onApplied={onApplied} />)}
    </div>
  );
}

function AttachmentCard({ item, i18n, store, onRemove, onNote }) {
  const [url, setUrl] = React.useState(null);
  const [note, setNote] = React.useState(item.note || '');
  const isImage = /^image\//.test(item.mimeType);
  React.useEffect(() => { let alive = true; store.attachmentUrl(item).then((u) => { if (alive) setUrl(u); }); return () => { alive = false; }; }, [item.id]);
  return (
    <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border-hairline)', background: 'var(--ink-950)', display: 'flex', flexDirection: 'column' }}>
      {isImage ? (
        url && <img src={url} alt={item.fileName} style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover' }} />
      ) : (
        <button type="button" onClick={() => url && window.open(url, '_blank', 'noopener')} style={{ height: 80, display: 'grid', placeItems: 'center', background: 'transparent', border: 0, color: 'var(--char-accent)', cursor: url ? 'pointer' : 'default' }}>
          <Icon name="file-text" size={28} />
        </button>
      )}
      <div style={{ padding: '6px 9px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <strong style={{ font: 'var(--type-caption)', color: 'var(--parchment)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.fileName}</strong>
        <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{Math.max(1, Math.round(item.size / 1024)) + ' KB'}</span>
      </div>
      <input
        type="text" value={note} dir="auto" placeholder={i18n.t('fileNote')}
        onChange={(e) => { setNote(e.target.value); onNote(e.target.value); }}
        style={{ width: '100%', boxSizing: 'border-box', border: 0, borderTop: '1px solid var(--border-hairline)', padding: '6px 9px', background: 'transparent', color: 'var(--text-muted)', font: 'var(--type-caption)', outline: 'none' }}
      />
      <button type="button" onClick={onRemove} title={i18n.t('remove')} style={{ position: 'absolute', top: 6, insetInlineEnd: 6, width: 24, height: 24, borderRadius: 6, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,16,.82)', color: 'var(--parchment)', cursor: 'pointer', display: 'grid', placeItems: 'center' }}><Icon name="trash-2" size={12} /></button>
    </div>
  );
}

function AttachmentSection({ strategy, category, i18n, onChanged }) {
  const store = window.TradeJournalStrategyEducationStore;
  const section = strategy[category];

  async function addFiles(files) {
    try { onChanged(await store.addAttachments(strategy.id, category, files)); }
    catch (error) { showToast(i18n.t(error.message === 'INVALID_FILE_TYPE' ? 'invalidFile' : error.message === 'FILE_TOO_LARGE' ? 'fileTooLarge' : 'uploadError'), 'danger'); }
  }
  async function removeFile(id) { onChanged(await store.removeAttachment(strategy.id, category, id)); }
  function noteChanged(item, note) { item.note = note; store.save(strategy); }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h4 style={{ margin: 0, font: 'var(--type-body)', color: 'var(--parchment)' }}>{i18n.t('attachments')}</h4>
        <small style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{i18n.t('filesCount', { count: i18n.number(section.attachments.length) })}</small>
      </div>
      <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 16, borderRadius: 10, border: '1px dashed var(--border-gold)', cursor: 'pointer', color: 'var(--text-muted)' }}>
        <input type="file" multiple accept="image/*,.pdf,.txt,.doc,.docx" style={{ display: 'none' }} onChange={(e) => { const files = Array.from(e.target.files || []); e.target.value = ''; if (files.length) addFiles(files); }} />
        <Icon name="file-up" size={20} />
        <b style={{ font: 'var(--type-body)', color: 'var(--parchment)' }}>{i18n.t('uploadTitle')}</b>
        <small style={{ font: 'var(--type-caption)' }}>{i18n.t('uploadHint')}</small>
      </label>
      {section.attachments.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
          {section.attachments.map((item) => (
            <AttachmentCard key={item.id} item={item} i18n={i18n} store={store} onRemove={() => removeFile(item.id)} onNote={(note) => noteChanged(item, note)} />
          ))}
        </div>
      )}
    </div>
  );
}

function DetailsView({ strategy, i18n, setStrategy }) {
  const store = window.TradeJournalStrategyEducationStore;
  const saveTimer = React.useRef(null);
  const [status, setStatus] = React.useState(i18n.t('lastUpdated') + ' · ' + formatDate(strategy.updatedAt, i18n));

  function saveSoon() {
    setStatus(i18n.t('saving'));
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => { const updated = store.save(strategy); setStrategy(updated); setStatus(i18n.t('autoSaved')); }, 1100);
  }
  function setPath(path, value) { store.setPath(strategy, path, value); setStrategy({ ...strategy }); saveSoon(); }
  function setName(v) { strategy.name = v; setStrategy({ ...strategy }); saveSoon(); }
  function setActiveFlag(v) { strategy.active = v; setStrategy({ ...strategy }); saveSoon(); }
  function onApplied(updated) { setStrategy(updated); }
  function onAttachmentsChanged(updated) { setStrategy(updated); }

  function saveNow() {
    const updated = store.save(strategy);
    setStrategy(updated);
    showToast(i18n.t('saved'), 'success');
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Panel variant="base" radius={12} style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <TextField label={i18n.t('strategyName')} value={strategy.name} dir="auto" onChange={setName} style={{ flex: 1, minWidth: 200 }} />
          <Toggle checked={strategy.active} onChange={setActiveFlag} label={i18n.t('active')} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <Chip>{i18n.t(strategy.origin === 'ai_from_event' ? 'originAi' : 'originManual')}</Chip>
          <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{status}</span>
        </div>
      </Panel>

      <Panel variant="base" radius={12} style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>{sectionTitleNode(i18n.t('positionManagement'))}<p style={{ margin: '4px 0 0', font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{i18n.t('positionSubtitle')}</p></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
          <FieldWithProposals strategy={strategy} path="positionManagement.entryRules" i18n={i18n} label={i18n.t('entryRules')} type="textarea" placeholder={i18n.t('entryPlaceholder')} onChange={(v) => setPath('positionManagement.entryRules', v)} onApplied={onApplied} />
          <FieldWithProposals strategy={strategy} path="positionManagement.stopLossRules" i18n={i18n} label={i18n.t('stopLossRules')} type="textarea" placeholder={i18n.t('stopPlaceholder')} onChange={(v) => setPath('positionManagement.stopLossRules', v)} onApplied={onApplied} />
          <FieldWithProposals strategy={strategy} path="positionManagement.exitTargetRules" i18n={i18n} label={i18n.t('exitTargetRules')} type="textarea" placeholder={i18n.t('exitPlaceholder')} onChange={(v) => setPath('positionManagement.exitTargetRules', v)} onApplied={onApplied} />
          <FieldWithProposals strategy={strategy} path="positionManagement.positionSizingRules" i18n={i18n} label={i18n.t('positionSizingRules')} type="textarea" placeholder={i18n.t('sizingPlaceholder')} onChange={(v) => setPath('positionManagement.positionSizingRules', v)} onApplied={onApplied} />
        </div>
        <FieldWithProposals strategy={strategy} path="positionManagement.freeNotes" i18n={i18n} label={i18n.t('freeNotes')} type="textarea" placeholder={i18n.t('notesPlaceholder')} onChange={(v) => setPath('positionManagement.freeNotes', v)} onApplied={onApplied} />
        <AttachmentSection strategy={strategy} category="positionManagement" i18n={i18n} onChanged={onAttachmentsChanged} />
      </Panel>

      <Panel variant="base" radius={12} style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>{sectionTitleNode(i18n.t('riskManagement'))}<p style={{ margin: '4px 0 0', font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{i18n.t('riskSubtitle')}</p></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
          <FieldWithProposals strategy={strategy} path="riskManagement.maxRiskPerTradePercent" i18n={i18n} label={i18n.t('maxRiskPerTradePercent')} type="number" suffix={i18n.t('percent')} onChange={(v) => setPath('riskManagement.maxRiskPerTradePercent', v)} onApplied={onApplied} />
          <FieldWithProposals strategy={strategy} path="riskManagement.dailyDrawdownLimitPercent" i18n={i18n} label={i18n.t('dailyDrawdownLimitPercent')} type="number" suffix={i18n.t('percent')} onChange={(v) => setPath('riskManagement.dailyDrawdownLimitPercent', v)} onApplied={onApplied} />
          <FieldWithProposals strategy={strategy} path="riskManagement.totalDrawdownLimitPercent" i18n={i18n} label={i18n.t('totalDrawdownLimitPercent')} type="number" suffix={i18n.t('percent')} onChange={(v) => setPath('riskManagement.totalDrawdownLimitPercent', v)} onApplied={onApplied} />
          <FieldWithProposals strategy={strategy} path="riskManagement.maxConcurrentTrades" i18n={i18n} label={i18n.t('maxConcurrentTrades')} type="number" suffix={i18n.t('trades')} onChange={(v) => setPath('riskManagement.maxConcurrentTrades', v)} onApplied={onApplied} />
          <FieldWithProposals strategy={strategy} path="riskManagement.maxProfitCapPerTrade" i18n={i18n} label={i18n.t('maxProfitCapPerTrade')} type="number" suffix={i18n.t('percent')} onChange={(v) => setPath('riskManagement.maxProfitCapPerTrade', v)} onApplied={onApplied} />
        </div>
        <FieldWithProposals strategy={strategy} path="riskManagement.freeNotes" i18n={i18n} label={i18n.t('freeNotes')} type="textarea" placeholder={i18n.t('notesPlaceholder')} onChange={(v) => setPath('riskManagement.freeNotes', v)} onApplied={onApplied} />
        <AttachmentSection strategy={strategy} category="riskManagement" i18n={i18n} onChanged={onAttachmentsChanged} />
      </Panel>

      <Panel variant="base" radius={12} style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>{sectionTitleNode(i18n.t('overallFramework'))}<p style={{ margin: '4px 0 0', font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{i18n.t('frameworkSubtitle')}</p></div>
        <FieldWithProposals strategy={strategy} path="overallFramework.description" i18n={i18n} label={i18n.t('frameworkDescription')} type="textarea" rows={7} placeholder={i18n.t('frameworkPlaceholder')} onChange={(v) => setPath('overallFramework.description', v)} onApplied={onApplied} />
        <AttachmentSection strategy={strategy} category="overallFramework" i18n={i18n} onChanged={onAttachmentsChanged} />
      </Panel>

      <Button variant="primary" icon="save" onClick={saveNow} style={{ alignSelf: 'flex-start' }}>{i18n.t('saveChanges')}</Button>
    </div>
  );
}

function summaryBlocks(strategy, i18n) {
  const summary = strategy.aiUnderstandingSummary || {};
  return ['positionManagement', 'riskManagement', 'overallFramework'].map((key) => ({ key, title: i18n.t(key), text: summary[key] || '—' }));
}

function StrategyChat({ strategy, i18n, setStrategy }) {
  const ai = window.TradeJournalStrategyEducationAI;
  const store = window.TradeJournalStrategyEducationStore;
  const [sending, setSending] = React.useState(false);
  const messages = (strategy.chatHistory || []).map((m) => ({
    id: m.id, text: m.content, mine: m.role === 'user', author: m.role === 'user' ? i18n.t('user') : i18n.t('assistant'),
    suggestions: (m.suggestions || []).filter((s) => s.status === 'pending')
  }));

  async function send(text) {
    let updated = store.addMessage(strategy, 'user', text);
    setStrategy(updated);
    setSending(true);
    try {
      const result = await ai.chat(updated, text);
      updated = store.addMessage(updated, 'assistant', result.reply, result.suggestions);
      if (result.summary) updated = store.saveSummary(updated, result.summary);
      if (result.local) showToast(i18n.t('aiUnavailable'), 'warning');
      setStrategy(updated);
    } catch (_) {
      showToast(i18n.t('aiError'), 'danger');
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
        {summaryBlocks(strategy, i18n).map((s) => (
          <Panel key={s.key} variant="base" radius={10} style={{ padding: 12 }}>
            <strong style={{ display: 'block', marginBottom: 4, color: 'var(--parchment)' }}>{s.title}</strong>
            <p style={{ margin: 0, font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{s.text}</p>
          </Panel>
        ))}
      </div>
      {!messages.length && <p style={{ margin: 0, textAlign: 'center', font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{i18n.t('chatWelcome')}</p>}
      <ChatThread
        messages={messages} onSend={send} placeholder={i18n.t('chatPlaceholder')} sendLabel={i18n.t('send')}
        renderExtra={(m) => (m.suggestions && m.suggestions.length ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            {m.suggestions.map((item) => <ProposalCard key={item.id} i18n={i18n} strategy={strategy} item={item} onApplied={setStrategy} />)}
          </div>
        ) : null)}
      />
      {sending && <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{i18n.t('loading')}</span>}
    </div>
  );
}

function DetectionModal({ i18n, strategy, onClose, onAdded }) {
  const store = window.TradeJournalStrategyEducationStore;
  const [outcome, setOutcome] = React.useState('');
  const [sourceType, setSourceType] = React.useState('manual');
  const [sourceId, setSourceId] = React.useState('');
  function save() {
    const source = { type: sourceType };
    if (sourceType === 'session') source.sessionId = sourceId || undefined;
    if (sourceType === 'trade') source.tradeId = sourceId || undefined;
    store.addDetectionEvent(strategy.id, { source, predictedOutcome: outcome, status: 'pending' });
    onAdded(store.find(strategy.id));
    onClose();
  }
  return (
    <Modal
      title={i18n.t('detectionEvent')} icon="scan-search" onClose={onClose}
      footer={(<><Button variant="secondary" onClick={onClose}>{i18n.t('cancel')}</Button><Button variant="primary" onClick={save} style={{ marginInlineStart: 'auto' }}>{i18n.t('addDetection')}</Button></>)}
    >
      <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {fieldLabelNode(i18n.t('eventOutcome'))}
        <textarea value={outcome} onChange={(e) => setOutcome(e.target.value)} dir="auto" rows={3} style={{ resize: 'vertical', borderRadius: 8, padding: '10px 12px', background: 'rgba(3,8,7,.55)', border: '1px solid var(--border-gold)', color: 'var(--text-primary)', font: 'var(--type-body)', outline: 'none' }} />
      </label>
      <div>{fieldLabelNode(i18n.t('sourceId'))}<Select value={sourceType} options={['manual', 'session', 'trade'].map((v) => ({ value: v, label: i18n.t(v) }))} onChange={setSourceType} /></div>
      {sourceType !== 'manual' && <TextField label={i18n.t('sourceId')} value={sourceId} onChange={setSourceId} />}
    </Modal>
  );
}

function DetectionEvents({ strategy, i18n, setStrategy }) {
  const store = window.TradeJournalStrategyEducationStore;
  const [filter, setFilter] = React.useState('');
  const [modalOpen, setModalOpen] = React.useState(false);
  const events = strategy.detectionEvents.filter((item) => !filter || item.status === filter);

  function setStatus(eventId, status) {
    store.updateDetectionEvent(strategy.id, eventId, { status });
    setStrategy(store.find(strategy.id));
  }
  function openSource(event) {
    if (event.source.type === 'trade' && event.source.tradeId && window.TradeJournalTradeUI) window.TradeJournalTradeUI.viewTrade(event.source.tradeId);
    else if (event.source.sessionId && window.TradeJournalWorkspace) window.TradeJournalWorkspace.open(event.source.sessionId);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        {sectionTitleNode(i18n.t('detections'))}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Select
            value={filter} width={160}
            options={[{ value: '', label: i18n.t('eventStatus') }, { value: 'pending', label: i18n.t('pending') }, { value: 'confirmed', label: i18n.t('confirmed') }, { value: 'invalidated', label: i18n.t('invalidated') }]}
            onChange={setFilter}
          />
          <Button variant="primary" size="sm" icon="plus" onClick={() => setModalOpen(true)}>{i18n.t('addDetection')}</Button>
        </div>
      </div>
      {!events.length ? (
        <span style={{ font: 'var(--type-body)', color: 'var(--text-muted)' }}>{i18n.t('noEvents')}</span>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {events.map((event) => (
            <Panel key={event.id} variant="base" radius={10} style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{formatDate(event.detectedAt, i18n)}</span>
              <Button variant="ghost" size="sm" onClick={() => openSource(event)}>{i18n.t(event.source.type)}</Button>
              <span style={{ flex: 1, minWidth: 120, font: 'var(--type-body)', color: 'var(--text-primary)' }}>{event.predictedOutcome}</span>
              <Select
                value={event.status} width={140}
                options={['pending', 'confirmed', 'invalidated'].map((v) => ({ value: v, label: i18n.t(v) }))}
                onChange={(v) => setStatus(event.id, v)}
              />
            </Panel>
          ))}
        </div>
      )}
      {modalOpen && <DetectionModal i18n={i18n} strategy={strategy} onClose={() => setModalOpen(false)} onAdded={setStrategy} />}
    </div>
  );
}

function StrategyReport({ strategy, i18n, setStrategy }) {
  const store = window.TradeJournalStrategyEducationStore;
  const [staleHours, setStaleHours] = React.useState(72);
  const stats = store.detectionStats(strategy, staleHours);
  const tradeStore = window.TradeJournalTradeStore;
  const trades = tradeStore ? tradeStore.listSync().filter((t) => t.linkedStrategyId === strategy.id) : [];
  const strategyModule = window.TradeJournalStrategyEducation;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        <MetricTile icon="radar" label={i18n.t('detectedTotal')} value={i18n.number(stats.total)} />
        <MetricTile icon="badge-check" label={i18n.t('confirmedDetections')} value={i18n.number(stats.confirmed)} />
        <MetricTile icon="circle-x" label={i18n.t('unresolvedDetections')} value={i18n.number(stats.unresolved)} />
        <MetricTile icon="percent" label={i18n.t('confirmationRate')} value={stats.confirmationRate === null ? '—' : i18n.number(stats.confirmationRate) + '%'} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <TextField label={i18n.t('staleThreshold')} type="number" value={String(staleHours)} onChange={(v) => setStaleHours(Math.max(1, Number(v) || 72))} style={{ maxWidth: 220 }} />
      </div>
      {strategyModule && strategyModule.drawFunnel && (
        <Panel variant="base" radius={12} style={{ padding: 16 }}>
          <LegacyNode watch={[stats.total, stats.confirmed]} build={() => {
            const wrap = document.createElement('div');
            const canvas = document.createElement('canvas');
            canvas.width = 720; canvas.height = 180;
            wrap.append(canvas);
            window.setTimeout(() => strategyModule.drawFunnel(canvas, stats), 0);
            return wrap;
          }} />
        </Panel>
      )}
      <Panel variant="base" radius={12} style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {sectionTitleNode(i18n.t('linkedTrades'))}
        {!trades.length ? (
          <span style={{ font: 'var(--type-body)', color: 'var(--text-muted)' }}>{i18n.t('reportNoTrades')}</span>
        ) : trades.map((trade) => (
          <button
            key={trade.id} type="button" onClick={() => { if (window.TradeJournalTradeUI) window.TradeJournalTradeUI.viewTrade(trade.id); }}
            style={{ display: 'flex', gap: 12, alignItems: 'center', background: 'transparent', border: 0, borderTop: '1px solid var(--border-hairline)', padding: '8px 0', cursor: 'pointer', color: 'inherit', font: 'inherit', textAlign: 'start' }}
          >
            <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{formatDate(trade.createdAt, i18n)}</span>
            <strong style={{ color: 'var(--parchment)' }}>{i18n.t(trade.direction)}</strong>
            <span style={{ color: 'var(--text-muted)' }}>{i18n.t(trade.status === 'open' ? 'active' : trade.status)}</span>
            <span style={{ marginInlineStart: 'auto', color: 'var(--text-primary)' }}>{trade.pnl == null ? '—' : (window.TradeJournalTradeI18n ? window.TradeJournalTradeI18n.money(trade.pnl) : trade.pnl)}</span>
          </button>
        ))}
      </Panel>
      <DetectionEvents strategy={strategy} i18n={i18n} setStrategy={setStrategy} />
    </div>
  );
}

function StrategySharing({ strategy, i18n, setStrategy }) {
  const store = window.TradeJournalStrategyEducationStore;
  const [status, setStatus] = React.useState(null);
  const marketplace = window.TradeJournalMarketplace;
  const communityStore = window.TradeJournalCommunityStore;

  function refreshStatus() {
    if (!marketplace) { setStatus({ available: false }); return; }
    marketplace.findListingBySource(strategy.id).then((listing) => setStatus({ available: true, listing }));
  }
  React.useEffect(refreshStatus, [strategy.id]);

  function evidenceSnapshot() {
    const stats = store.detectionStats(strategy);
    return { successRatePercent: stats.confirmationRate, sampleSize: stats.total, evidenceAsOf: new Date().toISOString() };
  }
  function fullSummary() {
    return {
      name: strategy.name,
      positionManagement: { entryRules: strategy.positionManagement.entryRules, stopLossRules: strategy.positionManagement.stopLossRules, exitTargetRules: strategy.positionManagement.exitTargetRules, positionSizingRules: strategy.positionManagement.positionSizingRules },
      riskManagement: { maxRiskPerTradePercent: strategy.riskManagement.maxRiskPerTradePercent, dailyDrawdownLimitPercent: strategy.riskManagement.dailyDrawdownLimitPercent, totalDrawdownLimitPercent: strategy.riskManagement.totalDrawdownLimitPercent, maxConcurrentTrades: strategy.riskManagement.maxConcurrentTrades, maxProfitCapPerTrade: strategy.riskManagement.maxProfitCapPerTrade },
      overallFramework: { description: strategy.overallFramework.description }
    };
  }
  function buildContent(previewCount) {
    const full = fullSummary();
    const chunks = [['overallFramework', full.overallFramework], ['positionManagement', full.positionManagement], ['riskManagement', full.riskManagement]];
    const preview = { name: full.name };
    chunks.slice(0, previewCount).forEach(([key, value]) => { preview[key] = value; });
    return { previewContent: preview, fullContent: full };
  }
  function openFlow(existingListing) {
    if (!marketplace) return;
    marketplace.openPublishFlow({ type: 'strategy', sourceId: strategy.id, suggestedTitle: strategy.name, evidence: evidenceSnapshot(), maxPreviewItems: 3, buildContent, existingListing: existingListing || null, onPublished: refreshStatus });
  }

  // Journey F, F27-31: real window hook exposing this real openFlow() (with its own real
  // evidence/buildContent closures - never reconstructable from chat) to marketplace.publish,
  // mirroring every other TradeJournalNavryaXxxHub in this codebase. Refs kept current every
  // render since this effect only re-runs on [strategy.id].
  const openFlowRef = React.useRef(openFlow);
  openFlowRef.current = openFlow;
  const statusRef = React.useRef(status);
  statusRef.current = status;
  React.useEffect(() => {
    window.TradeJournalNavryaStrategySharingHub = {
      openFlow: () => openFlowRef.current(statusRef.current && statusRef.current.listing),
      hasListing: () => !!(statusRef.current && statusRef.current.listing)
    };
    return () => { delete window.TradeJournalNavryaStrategySharingHub; };
  }, [strategy.id]);

  function onToggle(checked) {
    strategy.isPublic = checked;
    const updated = store.save(strategy, { keepSummary: true });
    setStrategy(updated);
    if (checked) openFlow();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 640 }}>
      <Panel variant="base" radius={12} style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Toggle checked={!!strategy.isPublic} onChange={onToggle} label={i18n.t('publicStrategy')} />
        {!status ? null : !status.available ? (
          <span style={{ font: 'var(--type-body)', color: 'var(--text-muted)' }}>{i18n.t('comingSoon')}</span>
        ) : !status.listing ? (
          <span style={{ font: 'var(--type-body)', color: 'var(--text-muted)' }}>{i18n.t('notListedYet')}</span>
        ) : (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <Chip tone="accent">{i18n.t('listedBadge')}</Chip>
            <Button variant="secondary" size="sm" onClick={() => openFlow(status.listing)}>{i18n.t('editListing')}</Button>
            <Button
              variant="secondary" size="sm"
              onClick={() => { communityStore.updateListing(status.listing.id, evidenceSnapshot()).then(() => { showToast(i18n.t('saved'), 'success'); refreshStatus(); }); }}
            >{i18n.t('refreshEvidence')}</Button>
          </div>
        )}
      </Panel>
    </div>
  );
}

const DETAIL_TABS = [['details', 'detailsTab', 'sliders-horizontal'], ['chat', 'chatTab', 'message-circle'], ['report', 'reportTab', 'chart-no-axes-combined'], ['sharing', 'sharingTab', 'share-2']];

function StrategyDetail({ i18n, strategyId, tab }) {
  const store = window.TradeJournalStrategyEducationStore;
  const [strategy, setStrategy] = React.useState(() => store.find(strategyId));
  React.useEffect(() => { setStrategy(store.find(strategyId)); }, [strategyId]);
  React.useEffect(() => { if (strategy === null) navigateList(); }, [strategy]);
  const rtl = i18n.direction() === 'rtl';
  if (!strategy) return null;

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} style={{ direction: rtl ? 'rtl' : 'ltr', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 dir="auto" style={{ margin: '0 0 4px', font: 'var(--type-display-md)', fontSize: 22, color: 'var(--parchment)' }}>{strategy.name || i18n.t('newStrategy')}</h2>
          <p style={{ margin: 0, font: 'var(--type-body)', color: 'var(--text-muted)' }}>{i18n.t('strategiesSubtitle')}</p>
        </div>
        <Button variant="ghost" icon={rtl ? 'arrow-right' : 'arrow-left'} onClick={navigateList}>{i18n.t('back')}</Button>
      </div>
      <StrategyModuleTabs active="education" />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {DETAIL_TABS.map(([id, key, icon]) => (
          <Button key={id} variant={tab === id ? 'primary' : 'ghost'} icon={icon} onClick={() => navigateDetail(strategyId, id)}>{i18n.t(key)}</Button>
        ))}
      </div>
      {tab === 'chat' ? <StrategyChat strategy={strategy} i18n={i18n} setStrategy={setStrategy} /> :
        tab === 'report' ? <StrategyReport strategy={strategy} i18n={i18n} setStrategy={setStrategy} /> :
        tab === 'sharing' ? <StrategySharing strategy={strategy} i18n={i18n} setStrategy={setStrategy} /> :
        <DetailsView strategy={strategy} i18n={i18n} setStrategy={setStrategy} />}
    </div>
  );
}

function StrategyEducationRoot({ mode, strategyId, tab }) {
  const i18n = window.TradeJournalStrategyEducationI18n;
  return mode === 'detail' ? <StrategyDetail i18n={i18n} strategyId={strategyId} tab={tab} /> : <StrategyList i18n={i18n} />;
}

// strategy-education.js's renderList()/renderDetail() defer to this hook when present - same
// real strategy-education-store.js reads/writes and strategy-education-ai.js calls throughout,
// only the DOM building changes.
export function renderStrategyEducation(mode, strategyId, tab) {
  const container = document.createElement('div');
  container.className = 'panel-page strategy-education-page';
  container.dataset.character = currentNavryaCharacter();
  createRoot(container).render(<StrategyEducationRoot mode={mode} strategyId={strategyId} tab={tab} />);
  return container;
}
