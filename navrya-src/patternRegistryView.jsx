import React from 'react';
import { createRoot } from 'react-dom/client';
import { Panel } from '../public/pages/shared/navrya/components/core/Panel.jsx';
import { Chip } from '../public/pages/shared/navrya/components/forms/Chip.jsx';
import { Button } from '../public/pages/shared/navrya/components/forms/Button.jsx';
import { TextField } from '../public/pages/shared/navrya/components/forms/TextField.jsx';
import { SearchField } from '../public/pages/shared/navrya/components/forms/SearchField.jsx';
import { UploadField } from '../public/pages/shared/navrya/components/forms/UploadField.jsx';
import { ChatThread } from '../public/pages/shared/navrya/components/feedback/ChatThread.jsx';
import { Modal } from '../public/pages/shared/navrya/components/feedback/Modal.jsx';
import { Toggle } from '../public/pages/shared/navrya/components/forms/Toggle.jsx';
import { MetricTile } from '../public/pages/shared/navrya/components/metrics/MetricTile.jsx';
import { Icon } from '../public/pages/shared/navrya/components/core/Icon.jsx';
import { StrategyModuleTabs } from './strategyModuleTabs.jsx';
import { showToast } from './toast.js';
import { currentNavryaCharacter } from './currentCharacter.js';

function navigateList() { history.replaceState(null, '', '#strategies/patterns'); window.TradeJournalPatternRegistry.render(); }
function navigateProfile(id, tab) { history.replaceState(null, '', '#strategies/patterns/' + encodeURIComponent(id) + '/' + tab); window.TradeJournalPatternRegistry.render(); }
function navigateStrategies() { history.replaceState(null, '', '#strategies'); if (window.TradeJournalPanelLayer) window.TradeJournalPanelLayer.render('strategies'); }

function iconButtonStyle() {
  return { width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border-hairline)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', display: 'grid', placeItems: 'center', flex: 'none' };
}

// Wraps a DOM node built by an existing legacy function (the funnel/bar canvas cards from
// trade-reports.js's canvasCard()) - same technique psychologyView.jsx's LegacyNode uses. Keeps
// the real canvas-drawing code untouched; only the surrounding chrome is NAVRYA.
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

function useDebounce(fn, delay) {
  const timer = React.useRef(null);
  const fnRef = React.useRef(fn);
  fnRef.current = fn;
  return React.useCallback((...args) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => fnRef.current(...args), delay);
  }, [delay]);
}

function PatternRow({ pattern, i18n }) {
  return (
    <Panel variant="base" radius={12} style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
      <button
        type="button" onClick={() => navigateProfile(pattern.id, 'details')}
        style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 12, background: 'transparent', border: 0, textAlign: 'start', cursor: 'pointer', color: 'inherit', font: 'inherit', padding: 0 }}
      >
        <span style={{ color: 'var(--char-accent)', flex: 'none' }}><Icon name="target" size={20} /></span>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
          <strong dir="auto" style={{ font: 'var(--type-body)', color: 'var(--parchment)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pattern.name || i18n.t('unnamed')}</strong>
          <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Chip>{i18n.t('usage', { count: i18n.number(pattern.usageCount) })}</Chip>
            <Chip>{i18n.t('thresholdBadge', { count: i18n.number(pattern.completionThreshold) })}</Chip>
            <Chip>{i18n.t('images', { count: i18n.number(pattern.referenceScreenshots.length) })}</Chip>
            <Chip>{i18n.t('stages', { count: i18n.number(pattern.stages.length) })}</Chip>
          </span>
        </span>
      </button>
      <button type="button" onClick={() => navigateProfile(pattern.id, 'chat')} title={i18n.t('chat')} aria-label={i18n.t('chat')} style={iconButtonStyle()}><Icon name="message-circle" size={16} /></button>
    </Panel>
  );
}

function PatternList({ i18n }) {
  const [query, setQuery] = React.useState('');
  const patterns = window.TradeJournalPatternStore.listSync();
  const q = query.trim().toLocaleLowerCase(i18n.locale());
  const filtered = q ? patterns.filter((p) => p.name.toLocaleLowerCase(i18n.locale()).indexOf(q) > -1) : patterns;

  function addPattern() {
    const pattern = window.TradeJournalPatternStore.create();
    navigateProfile(pattern.id, 'details');
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: '0 0 4px', font: 'var(--type-display-md)', fontSize: 22, color: 'var(--parchment)' }}>{i18n.t('patterns')}</h2>
          <p style={{ margin: 0, font: 'var(--type-body)', color: 'var(--text-muted)' }}>{i18n.t('subtitle')}</p>
        </div>
        <Button variant="ghost" icon="arrow-left" onClick={navigateStrategies}>{i18n.t('back')}</Button>
      </div>
      <StrategyModuleTabs active="patterns" />
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Button variant="primary" icon="plus" onClick={addPattern}>{i18n.t('addPattern')}</Button>
        <SearchField value={query} onChange={setQuery} placeholder={i18n.t('search')} style={{ flex: 1, minWidth: 200 }} />
      </div>
      {!filtered.length ? (
        <Panel variant="base" radius={12} style={{ padding: 24, textAlign: 'center' }}>
          <span style={{ font: 'var(--type-body)', color: 'var(--text-muted)' }}>{i18n.t(q ? 'emptySearch' : 'empty')}</span>
        </Panel>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map((pattern) => <PatternRow key={pattern.id} pattern={pattern} i18n={i18n} />)}
        </div>
      )}
    </div>
  );
}

function ScreenshotThumb({ image, store, i18n, onRemove, onNote }) {
  const [url, setUrl] = React.useState(null);
  const [zoom, setZoom] = React.useState(false);
  const [note, setNote] = React.useState(image.note || '');
  React.useEffect(() => { let alive = true; store.screenshotUrl(image).then((u) => { if (alive) setUrl(u); }); return () => { alive = false; }; }, [image.id]);
  return (
    <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border-hairline)', background: 'var(--ink-950)' }}>
      {url && <img src={url} alt={image.fileName} onClick={() => setZoom(true)} style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover', cursor: 'zoom-in', display: 'block' }} />}
      <button type="button" onClick={onRemove} title={i18n.t('remove')} style={{ position: 'absolute', top: 6, insetInlineEnd: 6, width: 24, height: 24, borderRadius: 6, border: '1px solid var(--border-hairline)', background: 'rgba(3,8,16,.82)', color: 'var(--parchment)', cursor: 'pointer', display: 'grid', placeItems: 'center' }}><Icon name="close" size={12} /></button>
      <input
        type="text" value={note} dir="auto" placeholder={i18n.t('screenshotNote')}
        onChange={(e) => { setNote(e.target.value); onNote(e.target.value); }}
        style={{ width: '100%', boxSizing: 'border-box', border: 0, borderTop: '1px solid var(--border-hairline)', padding: '6px 9px', background: 'transparent', color: 'var(--text-muted)', font: 'var(--type-caption)', outline: 'none' }}
      />
      {zoom && url && (
        <Modal title={image.fileName || ''} onClose={() => setZoom(false)}>
          <img src={url} alt={image.fileName} style={{ width: '100%', borderRadius: 8 }} />
        </Modal>
      )}
    </div>
  );
}

function PatternEditor({ pattern, i18n, ai, onChat }) {
  const store = window.TradeJournalPatternStore;
  const [, forceTick] = React.useReducer((x) => x + 1, 0);
  const [status, setStatus] = React.useState('');
  const [generating, setGenerating] = React.useState(false);
  const draggedRef = React.useRef(null);
  const [newStageText, setNewStageText] = React.useState('');

  const saveSoon = useDebounce(() => { store.save(pattern); setStatus(i18n.t('autoSaved')); }, 1100);
  function touch() { forceTick(); saveSoon(); }

  React.useEffect(() => {
    const patternTypes = window.TradeJournalPatternTypes;
    const registry = window.TradeJournalAIProcessRegistry;
    if (!registry || !patternTypes) return;
    registry.register('pattern-editor-' + pattern.id, {
      allowlist: (patternTypes.patternStagePaths || []).slice(),
      isOpen: () => true,
      activeStep: () => 'details',
      applyValue: (path, value) => {
        if (path === 'name') pattern.name = value;
        else if (path === 'description') pattern.description = value;
        else return;
        touch();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pattern.id]);

  function setField(key, value) { pattern[key] = value; touch(); }

  function saveNow() {
    if (!pattern.name.trim()) { showToast(i18n.t('invalidName'), 'danger'); return; }
    store.save(pattern);
    showToast(i18n.t('saved'), 'success');
    forceTick();
  }

  function remove() {
    if (!window.confirm(i18n.t('deleteConfirmTitle') + '\n\n' + i18n.t('deleteConfirmBody'))) return;
    store.remove(pattern.id).then(() => navigateList());
  }

  async function generateWithAi() {
    setGenerating(true);
    try {
      if (!ai) throw new Error('AI_SERVICE_MISSING');
      const result = await ai.generateStages(pattern);
      if (!result.stages.length) throw new Error('NO_STAGES');
      pattern.stages = result.stages;
      store.save(pattern);
      showToast(result.local ? i18n.t('aiUnavailable') : i18n.t('saved'), result.local ? 'warning' : 'success');
      forceTick();
    } catch (_) {
      showToast(i18n.t('aiError'), 'danger');
    } finally {
      setGenerating(false);
    }
  }

  function addStage() {
    const value = newStageText.trim();
    if (!value) return;
    pattern.stages.push(store.createStage(value, pattern.stages.length + 1));
    store.save(pattern);
    setNewStageText('');
    forceTick();
  }
  function removeStage(id) {
    pattern.stages = pattern.stages.filter((s) => s.id !== id);
    pattern.stages.forEach((s, i) => { s.order = i + 1; });
    store.save(pattern);
    forceTick();
  }
  function moveStage(fromId, toId) {
    const from = pattern.stages.findIndex((s) => s.id === fromId);
    const to = pattern.stages.findIndex((s) => s.id === toId);
    if (from < 0 || to < 0 || from === to) return;
    const moved = pattern.stages.splice(from, 1)[0];
    pattern.stages.splice(to, 0, moved);
    pattern.stages.forEach((s, i) => { s.order = i + 1; });
    store.save(pattern);
    forceTick();
  }
  function editStageText(id, text) {
    const stage = pattern.stages.find((s) => s.id === id);
    if (stage) { stage.text = text; touch(); }
  }

  async function addScreenshots(files) {
    try { await store.addScreenshots(pattern.id, files); forceTick(); }
    catch (error) { showToast(i18n.t(error.message === 'INVALID_IMAGE_TYPE' ? 'imageTypeError' : error.message === 'IMAGE_TOO_LARGE' ? 'imageSizeError' : 'uploadError'), 'danger'); }
  }
  async function removeScreenshot(imageId) { await store.removeScreenshot(pattern.id, imageId); forceTick(); }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Panel variant="base" radius={12} style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <TextField label={i18n.t('patternName')} value={pattern.name} placeholder={i18n.t('patternNamePlaceholder')} dir="auto" onChange={(v) => setField('name', v)} />
        <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <span style={{ font: 'var(--type-body)', fontSize: 12, color: 'var(--text-primary)' }}>{i18n.t('description')}</span>
          <textarea
            value={pattern.description} placeholder={i18n.t('descriptionPlaceholder')} dir="auto" rows={4}
            onChange={(e) => setField('description', e.target.value)}
            style={{ resize: 'vertical', borderRadius: 8, padding: '10px 12px', background: 'rgba(3,8,7,.55)', border: '1px solid var(--border-gold)', color: 'var(--text-primary)', font: 'var(--type-body)', outline: 'none' }}
          />
          <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{i18n.t('descriptionHelp')}</span>
        </label>
        <TextField
          label={i18n.t('threshold')} type="number" value={String(pattern.completionThreshold)} hint={i18n.t('thresholdHelp')}
          onChange={(v) => setField('completionThreshold', Math.max(0, Math.min(100, Number(v) || 0)))}
        />
      </Panel>

      <Panel variant="base" radius={12} style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, font: 'var(--type-body)', fontWeight: 700, color: 'var(--parchment)' }}>{i18n.t('patternStages')}</h3>
          <small style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{i18n.t('reorderHint')}</small>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {pattern.stages.map((stage, index) => (
            <div
              key={stage.id} draggable
              onDragStart={() => { draggedRef.current = stage.id; }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => { moveStage(draggedRef.current, stage.id); draggedRef.current = null; }}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-hairline)', background: 'rgba(11,16,22,.4)' }}
            >
              <span style={{ color: 'var(--text-muted)', flex: 'none', cursor: 'grab' }}><Icon name="grip-vertical" size={16} /></span>
              <span className="navrya-tabular" style={{ color: 'var(--char-accent)', fontWeight: 700, flex: 'none', width: 20, textAlign: 'center' }}>{i18n.number(index + 1)}</span>
              <input
                type="text" value={stage.text} dir="auto" onChange={(e) => editStageText(stage.id, e.target.value)}
                style={{ flex: 1, minWidth: 0, height: 36, boxSizing: 'border-box', padding: '0 10px', borderRadius: 6, background: 'rgba(3,8,7,.5)', border: '1px solid var(--border-hairline)', color: 'var(--text-primary)', font: 'var(--type-body)', outline: 'none' }}
              />
              <button type="button" onClick={() => removeStage(stage.id)} title={i18n.t('remove')} style={iconButtonStyle()}><Icon name="trash-2" size={14} /></button>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text" value={newStageText} dir="auto" placeholder={i18n.t('newStage')}
            onChange={(e) => setNewStageText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addStage(); } }}
            style={{ flex: 1, height: 40, boxSizing: 'border-box', padding: '0 12px', borderRadius: 8, background: 'rgba(3,8,7,.55)', border: '1px solid var(--border-gold)', color: 'var(--text-primary)', font: 'var(--type-body)', outline: 'none' }}
          />
          <Button variant="secondary" icon="plus" onClick={addStage}>{i18n.t('addStage')}</Button>
        </div>
      </Panel>

      <Panel variant="base" radius={12} style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h3 style={{ margin: 0, font: 'var(--type-body)', fontWeight: 700, color: 'var(--parchment)' }}>{i18n.t('referenceImages')}</h3>
        <UploadField label={i18n.t('uploadTitle')} formats={i18n.t('uploadHint')} onSelect={(file) => addScreenshots([file])} />
        {pattern.referenceScreenshots.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
            {pattern.referenceScreenshots.map((image) => (
              <ScreenshotThumb key={image.id} image={image} store={store} i18n={i18n} onRemove={() => removeScreenshot(image.id)} onNote={(note) => { image.note = note; touch(); }} />
            ))}
          </div>
        )}
      </Panel>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <Button variant="secondary" icon="sparkles" onClick={generateWithAi} disabled={generating}>{generating ? i18n.t('generating') : i18n.t('writeWithAI')}</Button>
        <Button variant="secondary" icon="message-circle" onClick={onChat}>{i18n.t('chat')}</Button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <Button variant="danger" icon="trash-2" onClick={remove}>{i18n.t('deletePattern')}</Button>
        <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{status}</span>
        <Button variant="primary" icon="save" onClick={saveNow} style={{ marginInlineStart: 'auto' }}>{i18n.t('saveChanges')}</Button>
      </div>
    </div>
  );
}

function understandingSummary(pattern, i18n) {
  const parts = [];
  if (pattern.description.trim()) parts.push(pattern.description);
  if (pattern.stages.length) parts.push(pattern.stages.map((s, i) => (i + 1) + '. ' + s.text).join('\n'));
  return parts.length ? parts.join('\n\n') : i18n.t('noUnderstanding');
}

function PatternChat({ pattern, i18n, ai }) {
  const store = window.TradeJournalPatternStore;
  const [, forceTick] = React.useReducer((x) => x + 1, 0);
  const [sending, setSending] = React.useState(false);
  const messages = (pattern.chatHistory || []).map((m) => ({
    id: m.id, text: m.content, mine: m.role === 'user', author: m.role === 'user' ? i18n.t('user') : i18n.t('assistant'), suggestedStages: m.suggestedStages
  }));

  function applyStages(m) {
    pattern.stages = m.suggestedStages.map((stage, index) => ({ id: stage.id || store.createStage('', index + 1).id, order: index + 1, text: stage.text }));
    store.save(pattern);
    showToast(i18n.t('stagesApplied'), 'success');
    forceTick();
  }

  async function send(text) {
    pattern.chatHistory.push({ id: 'chat-' + Date.now().toString(36), role: 'user', content: text, createdAt: new Date().toISOString() });
    store.save(pattern);
    forceTick();
    setSending(true);
    try {
      if (!ai) throw new Error('AI_SERVICE_MISSING');
      const result = await ai.chat(pattern, text);
      const reply = { id: 'chat-' + Date.now().toString(36) + '-ai', role: 'assistant', content: result.reply, createdAt: new Date().toISOString() };
      if (result.suggestedStages && result.suggestedStages.length) reply.suggestedStages = result.suggestedStages;
      pattern.chatHistory.push(reply);
      store.save(pattern);
      if (result.local) showToast(i18n.t('aiUnavailable'), 'warning');
      forceTick();
    } catch (_) {
      showToast(i18n.t('aiError'), 'danger');
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Panel variant="base" radius={12} style={{ padding: 14 }}>
        <h4 style={{ margin: '0 0 6px', font: 'var(--type-body)', color: 'var(--parchment)' }}>{i18n.t('currentUnderstanding')}</h4>
        <p style={{ margin: 0, whiteSpace: 'pre-wrap', font: 'var(--type-body)', color: 'var(--text-primary)' }}>{understandingSummary(pattern, i18n)}</p>
      </Panel>
      {!messages.length && <p style={{ margin: 0, textAlign: 'center', font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{i18n.t('chatWelcome')}</p>}
      <ChatThread
        messages={messages} onSend={send} placeholder={i18n.t('chatPlaceholder')} sendLabel={i18n.t('send')}
        renderExtra={(m) => (m.suggestedStages && m.suggestedStages.length ? (
          <Button variant="secondary" size="sm" icon="wand-sparkles" onClick={() => applyStages(m)} style={{ marginTop: 8 }}>{i18n.t('applyStages')}</Button>
        ) : null)}
      />
      {sending && <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{i18n.t('loading')}</span>}
    </div>
  );
}

function PatternReport({ pattern, i18n }) {
  const store = window.TradeJournalPatternStore;
  const reports = window.TradeJournalTradeReports;
  const report = store.scenarioReport ? store.scenarioReport(pattern.id) : { hasData: false };
  const trades = reports && reports.patternSummary ? reports.patternSummary(pattern.id) : { hasData: false };
  const missing = i18n.t('insufficientData');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        <MetricTile icon="scan-search" label={i18n.t('detections')} value={report.hasData ? i18n.number(report.detectionCount) : missing} />
        <MetricTile icon="list-checks" label={i18n.t('averageCompletion')} value={report.hasData && report.averageCompletion !== null ? i18n.number(report.averageCompletion) + '%' : missing} />
        <MetricTile icon="badge-check" label={i18n.t('occurrenceRate')} value={report.hasData && report.occurrenceRate !== null ? i18n.number(report.occurrenceRate) + '%' : missing} />
        <MetricTile icon="candlestick-chart" label={i18n.t('linkedTrades')} value={trades.hasData ? i18n.number(trades.tradeCount) : missing} />
        <MetricTile icon="trophy" label={i18n.t('winRate')} value={trades.hasData && trades.winRate !== null ? i18n.number(trades.winRate) + '%' : missing} />
        <MetricTile icon="scale" label={i18n.t('averageRr')} value={trades.hasData && trades.averageRr !== null ? i18n.number(trades.averageRr) : missing} />
      </div>
      {reports && reports.canvasCard ? (
        <LegacyNode
          watch={[pattern.id]}
          build={() => {
            const funnel = report.hasData ? [
              { label: i18n.t('detected'), value: report.detectionCount },
              { label: i18n.t('stagesCompleted'), value: report.fullyCompletedCount },
              { label: i18n.t('occurred'), value: report.scenarios.filter((row) => row.occurred).length }
            ] : [];
            return reports.canvasCard(i18n.t('detectionFunnel'), 'funnel', funnel);
          }}
        />
      ) : (!report.hasData && (
        <Panel variant="base" radius={12} style={{ padding: 16 }}><span style={{ font: 'var(--type-body)', color: 'var(--text-muted)' }}>{missing}</span></Panel>
      ))}
    </div>
  );
}

function PatternSharing({ pattern, i18n }) {
  const store = window.TradeJournalPatternStore;
  const [isPublic, setIsPublic] = React.useState(!!pattern.isPublic);
  const [status, setStatus] = React.useState(null);
  const marketplace = window.TradeJournalMarketplace;
  const communityStore = window.TradeJournalCommunityStore;

  function evidenceSnapshot() {
    const report = store.scenarioReport(pattern.id);
    return { successRatePercent: report.hasData ? report.occurrenceRate : null, sampleSize: report.hasData ? report.detectionCount : 0, evidenceAsOf: new Date().toISOString() };
  }
  function buildContent(previewCount) {
    return {
      previewContent: { name: pattern.name, description: pattern.description, stages: pattern.stages.slice(0, previewCount) },
      fullContent: { name: pattern.name, description: pattern.description, stages: pattern.stages, completionThreshold: pattern.completionThreshold }
    };
  }
  function refreshStatus() {
    if (!marketplace) { setStatus({ available: false }); return; }
    marketplace.findListingBySource(pattern.id).then((listing) => setStatus({ available: true, listing }));
  }
  React.useEffect(refreshStatus, [pattern.id]);

  function openFlow(existingListing) {
    if (!marketplace) return;
    marketplace.openPublishFlow({
      type: 'pattern', sourceId: pattern.id, suggestedTitle: pattern.name, evidence: evidenceSnapshot(),
      maxPreviewItems: pattern.stages.length, buildContent, existingListing: existingListing || null, onPublished: refreshStatus
    });
  }

  function onToggle(checked) {
    setIsPublic(checked);
    pattern.isPublic = checked;
    store.save(pattern);
    showToast(i18n.t('saved'), 'success');
    if (checked) openFlow();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 640 }}>
      <Panel variant="base" radius={12} style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Toggle checked={isPublic} onChange={onToggle} label={i18n.t('publicPattern')} />
        {!status ? null : !status.available ? (
          <span style={{ font: 'var(--type-body)', color: 'var(--text-muted)' }}>{i18n.t('sharingSoon')}</span>
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

const PROFILE_TABS = [['details', 'details', 'sliders-horizontal'], ['chat', 'chat', 'message-circle'], ['report', 'report', 'chart-no-axes-combined'], ['sharing', 'sharing', 'share-2']];

function PatternProfile({ i18n, ai, patternId, tab }) {
  const store = window.TradeJournalPatternStore;
  const pattern = store.find(patternId);
  React.useEffect(() => { if (!pattern) navigateList(); }, [pattern]);
  const rtl = i18n.direction() === 'rtl';
  if (!pattern) return null;
  return (
    <div dir={rtl ? 'rtl' : 'ltr'} style={{ direction: rtl ? 'rtl' : 'ltr', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: 'var(--char-accent)' }}><Icon name="target" size={22} /></span>
          <div>
            <strong dir="auto" style={{ font: 'var(--type-body)', fontSize: 17, color: 'var(--parchment)' }}>{pattern.name || i18n.t('unnamed')}</strong>
            <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
              <Chip>{i18n.t('usage', { count: i18n.number(pattern.usageCount) })}</Chip>
              <Chip>{i18n.t('stages', { count: i18n.number(pattern.stages.length) })}</Chip>
            </div>
          </div>
        </div>
        <Button variant="ghost" icon={rtl ? 'arrow-right' : 'arrow-left'} onClick={navigateList}>{i18n.t('profileBack')}</Button>
      </div>
      <StrategyModuleTabs active="patterns" />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {PROFILE_TABS.map(([id, key, icon]) => (
          <Button key={id} variant={tab === id ? 'primary' : 'ghost'} icon={icon} onClick={() => navigateProfile(patternId, id)}>{i18n.t(key)}</Button>
        ))}
      </div>
      {tab === 'chat' ? <PatternChat pattern={pattern} i18n={i18n} ai={ai} /> :
        tab === 'report' ? <PatternReport pattern={pattern} i18n={i18n} /> :
        tab === 'sharing' ? <PatternSharing pattern={pattern} i18n={i18n} /> :
        <PatternEditor pattern={pattern} i18n={i18n} ai={ai} onChat={() => navigateProfile(patternId, 'chat')} />}
    </div>
  );
}

function PatternRegistryRoot({ mode, patternId, tab }) {
  const i18n = window.TradeJournalPatternI18n;
  const ai = window.TradeJournalPatternAI;
  return mode === 'profile' ? <PatternProfile i18n={i18n} ai={ai} patternId={patternId} tab={tab} /> : <PatternList i18n={i18n} />;
}

// pattern-registry.js's renderList()/renderProfile() defer to this hook when present - same
// real pattern-registry-store.js reads/writes and pattern-registry-ai.js calls throughout,
// only the DOM building changes.
export function renderPatternRegistry(mode, patternId, tab) {
  const container = document.createElement('div');
  container.className = 'panel-page pattern-registry-page';
  container.dataset.character = currentNavryaCharacter();
  createRoot(container).render(<PatternRegistryRoot mode={mode} patternId={patternId} tab={tab} />);
  return container;
}
