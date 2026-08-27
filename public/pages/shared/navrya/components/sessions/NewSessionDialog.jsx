import React from 'react';
import { Modal } from '../feedback/Modal.jsx';
import { Notice } from '../feedback/Notice.jsx';
import { Button } from '../forms/Button.jsx';
import { Select } from '../forms/Select.jsx';
import { TextField } from '../forms/TextField.jsx';
import { UploadField } from '../forms/UploadField.jsx';
import { InstrumentPicker } from '../forms/InstrumentPicker.jsx';
import { AiMagicFill } from '../feedback/AiMagicFill.jsx';
import { useAiFieldFill } from '../../hooks/useAiFieldFill.js';

export const TIMEFRAMES = ['5m', '15m', '1h', '4h', '1D'];
export const SESSION_CITIES = ['London', 'New York', 'Tokyo', 'Sydney'];
export const LOOP_INTERVALS = ['15 min', '30 min', '1 hour', '4 hours'];
export const UPLOAD_SLOTS = ['5m', '1h', '4h', '1D'];

function FieldLabel({ children }) {
  return <span style={{ font: 'var(--type-body)', fontSize: 12, color: 'var(--text-primary)' }}>{children}</span>;
}

const DEFAULT_LABELS = {
  dialogTitle: 'New session', createWithoutChart: 'Create without chart', cancel: 'Cancel',
  uploadNotice: 'Chart uploads are optional. Add scenarios and notes after creation.',
  uploadChart: 'Upload chart image', tradingSession: 'Trading session', primaryTimeframe: 'Primary timeframe',
  gregorianDate: 'Gregorian date', jalaliDate: 'Jalali date', loopInterval: 'Loop / update interval',
  graceMinutes: 'Update grace period (minutes)', sessionAccount: 'Account', sessionNoAccount: 'No account',
  instrument: 'Instrument'
};

// HOTFIX: the two date defaults below used to be hardcoded, stale mock strings
// ('08/01/2026'/'۱۴۰۵/۰۵/۱۰') left over from an early design mockup - every session created
// without the user manually touching the date fields silently recorded that literal fake date,
// regardless of when it was actually created (a real data-integrity bug, not just cosmetic).
// '08/01/2026' also isn't ISO 'yyyy-MM-dd', so any later real <input type="date"> that received
// it as a value (liveSessionView.jsx's chart-entry modal, seeded from session.date) triggered a
// native browser format warning and silently failed to display it. Both are now computed fresh,
// for real, every time the dialog is used - see todayIso()/todayJalali() below.
function todayIso() { return new Date().toISOString().slice(0, 10); }
function todayJalali() { return new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }

/* New-session dialog — optional chart uploads, session settings, one primary action.
   `accountOptions`: [{value, label}] of the user's real ACTIVE accounts only (defect #3 - an
   archived account is never selectable here), supplied by the caller (character-app.jsx, reading
   window.TradeJournalAccountsStore.listActive()) - this component never invents account data of
   its own. Omitted/empty means "this user has no accounts yet", in which case the whole field is
   hidden rather than shown with a single fake "No account" option - defect #5 scoping is entirely
   opt-in and must never suggest there is something to pick when there is nothing real to pick. */
export function NewSessionDialog({
  open = true, eyebrow, onClose, onCreate, labels, accountOptions,
  defaults = { city: 'London', timeframe: '5m', gregorian: todayIso(), jalali: todayJalali(), loop: '30 min', grace: '5', accountId: '', instrument: '' },
  style, ...rest
}) {
  const t = { ...DEFAULT_LABELS, ...labels };
  const [city, setCity] = React.useState(defaults.city);
  const [timeframe, setTimeframe] = React.useState(defaults.timeframe);
  const [gregorian, setGregorian] = React.useState(defaults.gregorian);
  const [jalali, setJalali] = React.useState(defaults.jalali);
  const [loop, setLoop] = React.useState(defaults.loop);
  const [grace, setGrace] = React.useState(defaults.grace);
  const [accountId, setAccountId] = React.useState(defaults.accountId || '');
  // Instrument Catalog domain: mandatory - creating a session requires selecting or adding
  // exactly one real, cataloged instrument. Never defaulted/guessed.
  const [instrument, setInstrument] = React.useState(defaults.instrument || null);
  const hasAccounts = Array.isArray(accountOptions) && accountOptions.length > 0;
  // Keyed by UPLOAD_SLOTS timeframe - {file, previewUrl}. previewUrl is an object URL for the
  // in-dialog preview only; the real persisted image is handled by the caller (onCreate), which
  // reads .file back out and stores it via TradeJournalImageStore, mirroring how every other
  // chart upload in this app already persists images.
  const [uploads, setUploads] = React.useState({});

  // Journey H1: magic-fill animation for the three fields most commonly set by Voice.
  const cityFilled = useAiFieldFill('session-create', 'city');
  const timeframeFilled = useAiFieldFill('session-create', 'timeframe');
  const instrumentFilled = useAiFieldFill('session-create', 'instrument');

  React.useEffect(() => () => {
    Object.values(uploads).forEach((u) => { if (u && u.previewUrl) URL.revokeObjectURL(u.previewUrl); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // AI process registry (same convention every other NAVRYA modal uses, e.g.
  // navrya-src/logEmotionModal.jsx's own 'trade-emotion-log' registration): this dialog is always
  // mounted by SessionLibrary (only its visibility toggles via `open`), so registration itself
  // doesn't need to wait for the dialog to be shown - only isOpen() needs to track the live prop.
  // applyValue drives the exact same setters the fields below already use, so a value the AI
  // supplies updates the visible UI the same way typing into the field would. submit() calls the
  // exact same onCreate(...) the primary button's own onClick already calls (and returns its
  // result, typically a Promise resolving to the created session) - never a second, parallel
  // create path.
  const openRef = React.useRef(open);
  openRef.current = open;
  // mountedRef: found via real browser testing (Journey B) - "always mounted by SessionLibrary"
  // (this file's own comment above) holds only for as long as SessionLibrary itself stays
  // mounted. Navigating into a Live Session (openLiveSession(), right after this dialog's own
  // AI-driven submit()) unmounts SessionLibrary - and if that happens before the render carrying
  // this dialog's own onCreate()-queued setDialog(false)/open:false ever commits, openRef.current
  // (a plain render-body assignment, line above) freezes at its last-committed value (true)
  // forever, since nothing else ever runs another render to update it. There is no "unregister"
  // in TradeJournalAIProcessRegistry, so a stale isOpen():true here would then permanently block
  // ai-workflow-engine.js from ever discovering a new action for the rest of the page's lifetime -
  // affects a manually-created session exactly the same as an AI-created one, always did, just
  // never surfaced until Journey B tried a second chat-driven action from inside a session.
  // mountedRef's own cleanup function, unlike a render-body assignment, is *guaranteed* to run on
  // a real unmount regardless of whether a pending render ever committed first - the same
  // "mountedRef template" every other NAVRYA modal in this app already uses for exactly this
  // reason.
  const mountedRef = React.useRef(true);
  React.useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  React.useEffect(() => {
    const registry = window.TradeJournalAIProcessRegistry;
    if (!registry) return undefined;
    registry.register('session-create', {
      layer: 'foreground',
      allowlist: ['city', 'timeframe', 'gregorian', 'jalali', 'loop', 'grace', 'accountId', 'instrument'],
      isOpen: () => openRef.current && mountedRef.current,
      activeStep: () => 'form',
      applyValue: (path, value) => {
        if (path === 'city') setCity(String(value));
        else if (path === 'timeframe') setTimeframe(String(value));
        else if (path === 'gregorian') setGregorian(String(value));
        else if (path === 'jalali') setJalali(String(value));
        else if (path === 'loop') setLoop(String(value));
        else if (path === 'grace') setGrace(String(value));
        // Strict resolution only - the AI passes a real account id it already resolved by name
        // (never a raw typed name here); an id that isn't one of this user's real active
        // accounts is silently ignored rather than setting something unselectable.
        else if (path === 'accountId') { if (hasAccounts && accountOptions.some((o) => o.value === value)) setAccountId(String(value)); }
        // Same strict contract as accountId above - character-app.jsx's session.create action
        // resolves a spoken instrument name against the user's real catalog itself (never a raw
        // guess here); a value that fails that resolution stays unfilled rather than accepted.
        else if (path === 'instrument') { if (value) setInstrument(String(value)); }
      },
      submit: () => onCreate && onCreate({
        city, timeframe, gregorian, jalali, loop, grace, accountId: accountId || null, instrument,
        uploads: Object.entries(uploads).map(([slot, u]) => ({ timeframe: slot, file: u.file }))
      })
    });
  }, [city, timeframe, gregorian, jalali, loop, grace, accountId, instrument, hasAccounts, accountOptions, uploads, onCreate]);

  function selectFile(slot, file) {
    setUploads((prev) => {
      if (prev[slot] && prev[slot].previewUrl) URL.revokeObjectURL(prev[slot].previewUrl);
      return { ...prev, [slot]: { file, previewUrl: URL.createObjectURL(file) } };
    });
  }

  const grid = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 16 };

  return (
    <Modal
      open={open} title={t.dialogTitle} icon="new-session" eyebrow={eyebrow} onClose={onClose}
      style={style}
      footer={
        <React.Fragment>
          <Button
            variant="primary"
            disabled={!instrument}
            onClick={() => onCreate && onCreate({
              city, timeframe, gregorian, jalali, loop, grace, accountId: accountId || null, instrument,
              uploads: Object.entries(uploads).map(([slot, u]) => ({ timeframe: slot, file: u.file }))
            })}
          >
            {t.createWithoutChart}
          </Button>
          <Button variant="ghost" onClick={onClose}>{t.cancel}</Button>
        </React.Fragment>
      }
      {...rest}
    >
      <Notice icon="status">{t.uploadNotice}</Notice>
      <div style={grid}>
        {UPLOAD_SLOTS.map((tf) => (
          <UploadField
            key={tf} label={t.uploadChart + ' ' + tf}
            filename={uploads[tf] && uploads[tf].file.name}
            onSelect={(file) => selectFile(tf, file)}
          />
        ))}
      </div>
      <div style={grid}>
        <AiMagicFill active={cityFilled}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 7, minWidth: 0 }}>
            <FieldLabel>{t.tradingSession}</FieldLabel>
            <Select value={city} onChange={setCity} options={SESSION_CITIES} width="100%" />
          </label>
        </AiMagicFill>
        <AiMagicFill active={timeframeFilled}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 7, minWidth: 0 }}>
            <FieldLabel>{t.primaryTimeframe}</FieldLabel>
            <Select value={timeframe} onChange={setTimeframe} options={TIMEFRAMES} width="100%" />
          </label>
        </AiMagicFill>
        <AiMagicFill active={instrumentFilled}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 7, minWidth: 0 }}>
            <FieldLabel>{t.instrument} *</FieldLabel>
            <InstrumentPicker value={instrument} onChange={setInstrument} width="100%" />
          </label>
        </AiMagicFill>
        <TextField label={t.gregorianDate} value={gregorian} onChange={setGregorian} />
        <TextField label={t.jalaliDate} value={jalali} onChange={setJalali} dir="rtl" />
        <label style={{ display: 'flex', flexDirection: 'column', gap: 7, minWidth: 0 }}>
          <FieldLabel>{t.loopInterval}</FieldLabel>
          <Select value={loop} onChange={setLoop} options={LOOP_INTERVALS} width="100%" />
        </label>
        <TextField label={t.graceMinutes} value={grace} onChange={setGrace} type="number" />
        {hasAccounts ? (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 7, minWidth: 0 }}>
            <FieldLabel>{t.sessionAccount}</FieldLabel>
            <Select
              value={accountId}
              onChange={setAccountId}
              options={[{ value: '', label: t.sessionNoAccount }, ...accountOptions]}
              width="100%"
            />
          </label>
        ) : null}
      </div>
    </Modal>
  );
}
