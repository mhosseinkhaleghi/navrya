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
// No longer driving a <Select> (see the loop field below - it's a plain minutes number now, from
// 1 up) but kept exported since it documented the old fixed-label contract and nothing forbids a
// caller from still reading it.
export const LOOP_INTERVALS = ['15 min', '30 min', '1 hour', '4 hours'];
export const UPLOAD_SLOTS = ['5m', '1h', '4h', '1D'];

function FieldLabel({ children }) {
  return <span style={{ font: 'var(--type-body)', fontSize: 12, color: 'var(--text-primary)' }}>{children}</span>;
}

const DEFAULT_LABELS = {
  dialogTitle: 'New session', createWithoutChart: 'Create without chart', createSession: 'Create session', cancel: 'Cancel',
  uploadNotice: 'Chart uploads are optional. Add scenarios and notes after creation.',
  uploadChart: 'Upload chart image', tradingSession: 'Trading session', primaryTimeframe: 'Primary timeframe',
  gregorianDate: 'Gregorian date', jalaliDate: 'Jalali date', loopInterval: 'Loop / update interval (minutes)',
  graceMinutes: 'Update grace period (minutes)', sessionAccount: 'Account', sessionNoAccount: 'No account',
  instrument: 'Instrument',
  liveSessionWarning: 'You picked this trading session manually — live auto-detection is currently off for it.'
};

// Real market-session detection, in UTC - the same windows already documented in
// ARCHITECTURE.md's session-detection table and used by trade-store.js's own detectSession()/
// navrya-src/marketAdapter.js's currentOpenMarket(). Kept here as its own small, self-contained
// copy (matching the convention those two already established - each script/module scope keeps
// its own copy rather than one importing the other) instead of reaching into navrya-src, since
// this file is a reusable design-system component and must not depend on app-level modules.
// London/New York's overlap (13:00-16:00) keeps that established priority (London wins, checked
// first, exactly like the other two copies); Sydney/Tokyo's overlap (00:00-07:00) resolves to
// Tokyo - the later-opened of the two - since Tokyo is checked before the Sydney fallback.
function liveTradingSession(now) {
  const hour = now.getUTCHours() + now.getUTCMinutes() / 60;
  const inRange = (start, end) => (start < end ? (hour >= start && hour < end) : (hour >= start || hour < end));
  if (inRange(7, 16)) return 'London';
  if (inRange(13, 22)) return 'New York';
  if (inRange(0, 9)) return 'Tokyo';
  return 'Sydney';
}

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
  // `city` is intentionally absent here - see the live-detection effect below, which picks the
  // real, currently-open market session as the default instead of a fixed guess. An explicit
  // defaults.city from a future caller still wins (checked first, same as every other field).
  defaults = { timeframe: '5m', gregorian: todayIso(), jalali: todayJalali(), loop: '5', grace: '5', accountId: '', instrument: '' },
  style, ...rest
}) {
  const t = { ...DEFAULT_LABELS, ...labels };
  // Defect: "New session" always opened defaulted to a fixed 'London', requiring a manual pick
  // every time even though the real, currently-open trading session is always knowable. `city`
  // now defaults to that live session, and re-syncs to whatever is live every time the dialog is
  // actually opened (`open` flips to true) - `liveCity` is the value it was last set from, so
  // comparing the two below can tell a fresh auto-pick apart from a deliberate manual change.
  const [city, setCity] = React.useState(() => defaults.city || liveTradingSession(new Date()));
  const [liveCity, setLiveCity] = React.useState(() => defaults.city || liveTradingSession(new Date()));
  React.useEffect(() => {
    if (!open) return;
    const detected = defaults.city || liveTradingSession(new Date());
    setLiveCity(detected);
    setCity(detected);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const [timeframe, setTimeframe] = React.useState(defaults.timeframe);
  // Only one calendar is ever shown (see the date field below) - the other still travels with
  // every session record exactly as before (sessionsAdapter.js/liveSessionView.jsx both read
  // either one), computed fresh rather than left editable behind a hidden, stale field.
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
  // Defect: the primary button always read "Create without chart", even right after a chart was
  // actually attached - misleading once at least one upload slot is filled.
  const hasUpload = Object.keys(uploads).length > 0;
  // Defect: both a Gregorian and a Jalali date field were always shown together. The app's
  // existing convention (session-system.js's dateFa(), used only when document.documentElement.lang
  // is 'fa') is that the calendar follows the language setting - matched here directly rather than
  // threading a new prop through, the same way every other navrya-src view file already reads this
  // live rather than caching it. Both calendars are still recorded on the session either way (see
  // the `gregorian`/`jalali` state comment above); only one is ever an editable field.
  const isFa = (typeof document !== 'undefined' && document.documentElement.lang) === 'fa';

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
            {hasUpload ? t.createSession : t.createWithoutChart}
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
            previewUrl={uploads[tf] && uploads[tf].previewUrl}
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
        {city !== liveCity && (
          <div style={{ gridColumn: '1 / -1' }}>
            <Notice tone="warning" icon="alert-triangle">{t.liveSessionWarning}</Notice>
          </div>
        )}
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
        {isFa ? (
          <TextField label={t.jalaliDate} value={jalali} onChange={setJalali} dir="rtl" />
        ) : (
          <TextField label={t.gregorianDate} value={gregorian} onChange={setGregorian} type="date" />
        )}
        <TextField label={t.loopInterval} value={loop} onChange={setLoop} type="number" min="1" />
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
