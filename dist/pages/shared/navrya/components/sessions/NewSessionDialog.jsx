import React from 'react';
import { Modal } from '../feedback/Modal.jsx';
import { Notice } from '../feedback/Notice.jsx';
import { Button } from '../forms/Button.jsx';
import { Select } from '../forms/Select.jsx';
import { TextField } from '../forms/TextField.jsx';
import { UploadField } from '../forms/UploadField.jsx';

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
  graceMinutes: 'Update grace period (minutes)'
};

/* New-session dialog — optional chart uploads, session settings, one primary action. */
export function NewSessionDialog({
  open = true, eyebrow, onClose, onCreate, labels,
  defaults = { city: 'London', timeframe: '5m', gregorian: '08/01/2026', jalali: '۱۴۰۵/۰۵/۱۰', loop: '30 min', grace: '5' },
  style, ...rest
}) {
  const t = { ...DEFAULT_LABELS, ...labels };
  const [city, setCity] = React.useState(defaults.city);
  const [timeframe, setTimeframe] = React.useState(defaults.timeframe);
  const [gregorian, setGregorian] = React.useState(defaults.gregorian);
  const [jalali, setJalali] = React.useState(defaults.jalali);
  const [loop, setLoop] = React.useState(defaults.loop);
  const [grace, setGrace] = React.useState(defaults.grace);
  // Keyed by UPLOAD_SLOTS timeframe - {file, previewUrl}. previewUrl is an object URL for the
  // in-dialog preview only; the real persisted image is handled by the caller (onCreate), which
  // reads .file back out and stores it via TradeJournalImageStore, mirroring how every other
  // chart upload in this app already persists images.
  const [uploads, setUploads] = React.useState({});

  React.useEffect(() => () => {
    Object.values(uploads).forEach((u) => { if (u && u.previewUrl) URL.revokeObjectURL(u.previewUrl); });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
            onClick={() => onCreate && onCreate({
              city, timeframe, gregorian, jalali, loop, grace,
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
        <label style={{ display: 'flex', flexDirection: 'column', gap: 7, minWidth: 0 }}>
          <FieldLabel>{t.tradingSession}</FieldLabel>
          <Select value={city} onChange={setCity} options={SESSION_CITIES} width="100%" />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 7, minWidth: 0 }}>
          <FieldLabel>{t.primaryTimeframe}</FieldLabel>
          <Select value={timeframe} onChange={setTimeframe} options={TIMEFRAMES} width="100%" />
        </label>
        <TextField label={t.gregorianDate} value={gregorian} onChange={setGregorian} />
        <TextField label={t.jalaliDate} value={jalali} onChange={setJalali} dir="rtl" />
        <label style={{ display: 'flex', flexDirection: 'column', gap: 7, minWidth: 0 }}>
          <FieldLabel>{t.loopInterval}</FieldLabel>
          <Select value={loop} onChange={setLoop} options={LOOP_INTERVALS} width="100%" />
        </label>
        <TextField label={t.graceMinutes} value={grace} onChange={setGrace} type="number" />
      </div>
    </Modal>
  );
}
