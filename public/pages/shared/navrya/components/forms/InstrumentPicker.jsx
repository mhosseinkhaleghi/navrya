import React from 'react';
import { Icon } from '../core/Icon.jsx';
import { Chip } from './Chip.jsx';

/* Instrument Catalog picker - closed-list select, with an explicit "type a new code, add it"
   affordance (the one creatable-combobox this app needs; every other picker here is a fixed
   option list). Self-contained like Select.jsx: reads window.TradeJournalInstrumentCatalogStore
   directly rather than requiring every caller to plumb the catalog list through as a prop.

   `value` is a single normalized code string (or null) in single mode, an array of codes in
   `multiple` mode. `onChange` receives the same shape back. Adding a new code calls the store's
   create(), which returns the real write Promise - this component awaits it (disabling the Add
   affordance meanwhile) before adding the code to `value`, since a brand-new session/trade/
   pattern requires the code to already exist in the catalog server-side. */
export function InstrumentPicker({
  value, onChange, multiple = false, placeholder = 'e.g. XAUUSD', disabled = false, width, style, labels
}) {
  const t = { addPrefix: 'Add', noMatches: 'No instruments yet - type one to add it', addFailed: 'Could not add this instrument', ...labels };
  const store = window.TradeJournalInstrumentCatalogStore;
  const types = window.TradeJournalInstrumentCatalogTypes;
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [adding, setAdding] = React.useState(false);
  const [error, setError] = React.useState('');
  const ref = React.useRef(null);
  const inputRef = React.useRef(null);

  const [catalog, setCatalog] = React.useState(() => (store ? store.listSync() : []));
  React.useEffect(() => {
    function refresh() { setCatalog(store ? store.listSync() : []); }
    window.addEventListener('tradejournal:replica-instrument-catalog-changed', refresh);
    return () => window.removeEventListener('tradejournal:replica-instrument-catalog-changed', refresh);
  }, [store]);

  React.useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setQuery(''); setError(''); } };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  React.useEffect(() => { if (open && inputRef.current) inputRef.current.focus(); }, [open]);

  const selected = multiple ? (Array.isArray(value) ? value.filter(Boolean) : []) : (value ? [value] : []);
  const queryUpper = query.trim().toUpperCase();
  const normalizedQuery = types ? types.normalizeCode(query) : null;
  const matches = catalog.filter((item) => (!queryUpper || item.code.indexOf(queryUpper) > -1) && selected.indexOf(item.code) === -1);
  const exactExists = normalizedQuery && catalog.some((item) => item.code === normalizedQuery);
  const canOfferAdd = Boolean(normalizedQuery) && !exactExists;

  function commitSingle(code) { onChange(code); setOpen(false); setQuery(''); setError(''); }
  function commitAdd(code) {
    if (multiple) { if (selected.indexOf(code) === -1) onChange([...selected, code]); setQuery(''); }
    else commitSingle(code);
  }
  function removeCode(code) {
    if (disabled) return;
    if (multiple) onChange(selected.filter((c) => c !== code));
    else onChange(null);
  }

  async function addNew() {
    if (!normalizedQuery || !store || adding) return;
    setAdding(true); setError('');
    try {
      const entry = await store.create(normalizedQuery);
      setCatalog(store.listSync());
      commitAdd(entry.code);
    } catch (_) {
      setError(t.addFailed);
    } finally {
      setAdding(false);
    }
  }

  const boxStyle = {
    position: 'relative', width, minHeight: 44, boxSizing: 'border-box', borderRadius: 8,
    border: '1px solid ' + (open ? 'var(--char-accent)' : 'var(--border-gold)'),
    background: 'rgba(11,20,21,.72)', padding: '6px 10px', display: 'flex', flexWrap: 'wrap',
    alignItems: 'center', gap: 6, cursor: disabled ? 'not-allowed' : 'text', opacity: disabled ? .38 : 1,
    ...style
  };

  return (
    <div ref={ref} style={boxStyle} onClick={() => { if (!disabled) setOpen(true); }}>
      {selected.map((code) => (
        <Chip key={code} tone="accent">
          {code}
          {!disabled && (
            <button
              type="button" aria-label={'Remove ' + code}
              onClick={(e) => { e.stopPropagation(); removeCode(code); }}
              style={{ display: 'flex', border: 0, background: 'transparent', color: 'inherit', cursor: 'pointer', padding: 0 }}
            ><Icon name="close" size={12} /></button>
          )}
        </Chip>
      ))}
      {(multiple || !selected.length) && !disabled && (open ? (
        <input
          ref={inputRef} value={query} placeholder={placeholder}
          onChange={(e) => setQuery(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => { if (e.key === 'Enter' && canOfferAdd) { e.preventDefault(); addNew(); } }}
          style={{
            flex: '1 1 80px', minWidth: 80, background: 'transparent', border: 0, outline: 'none',
            color: 'var(--text-primary)', font: 'var(--type-body)'
          }}
        />
      ) : (
        <span style={{ color: 'var(--text-muted)', font: 'var(--type-body)' }}>{selected.length ? '' : placeholder}</span>
      ))}
      {open && (
        <ul
          role="listbox" onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute', top: '100%', left: 0, marginTop: 4, minWidth: '100%', maxHeight: 220,
            overflowY: 'auto', zIndex: 40, margin: '4px 0 0', padding: 4, listStyle: 'none',
            borderRadius: 8, background: 'var(--overlay-500)', border: '1px solid var(--char-accent)',
            boxShadow: 'var(--shadow-panel)'
          }}
        >
          {matches.map((item) => (
            <li key={item.id}>
              <button
                type="button" role="option"
                onClick={() => commitAdd(item.code)}
                style={{
                  width: '100%', height: 36, padding: '0 12px', display: 'flex', alignItems: 'center',
                  gap: 8, borderRadius: 6, border: 0, cursor: 'pointer', textAlign: 'start',
                  background: 'transparent', color: 'var(--text-primary)', font: 'var(--type-body)'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(244,234,215,.06)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >{item.code}{item.displayName ? ' · ' + item.displayName : ''}</button>
            </li>
          ))}
          {!matches.length && !canOfferAdd && (
            <li style={{ padding: '8px 12px', color: 'var(--text-muted)', font: 'var(--type-caption)' }}>{t.noMatches}</li>
          )}
          {canOfferAdd && (
            <li>
              <button
                type="button" disabled={adding} onClick={addNew}
                style={{
                  width: '100%', height: 36, padding: '0 12px', display: 'flex', alignItems: 'center',
                  gap: 8, borderRadius: 6, border: 0, cursor: adding ? 'wait' : 'pointer', textAlign: 'start',
                  background: 'var(--char-active-surface)', color: 'var(--char-accent)', font: 'var(--type-body)', fontWeight: 600
                }}
              ><Icon name="plus" size={14} />{t.addPrefix} "{normalizedQuery}"</button>
            </li>
          )}
        </ul>
      )}
      {error && (
        <span style={{ position: 'absolute', top: '100%', left: 0, marginTop: 2, color: 'var(--danger)', font: 'var(--type-caption)' }}>{error}</span>
      )}
    </div>
  );
}
