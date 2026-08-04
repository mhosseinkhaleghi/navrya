import React from 'react';
import { Icon } from '../core/Icon.jsx';

/* Dashed upload dropzone — accent icon tile, label, accepted formats. A real <input type="file">
   wrapped in a <label> (the standard idiomatic pattern for a styled file picker) - onSelect(file)
   fires with the actual selected File so the caller can persist/preview it; this previously
   rendered as a plain <button> with no input at all, so clicking it did nothing. */
export function UploadField({
  label = 'Upload chart image', formats = 'PNG, JPG or WebP', filename, onSelect,
  height = 148, disabled = false, style, ...rest
}) {
  const [over, setOver] = React.useState(false);
  return (
    <label
      onMouseEnter={() => setOver(true)} onMouseLeave={() => setOver(false)}
      style={{
        height, boxSizing: 'border-box', width: '100%', padding: 16, borderRadius: 10,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10,
        background: over ? 'rgba(244,234,215,.04)' : 'rgba(3,8,7,.45)',
        border: '1px dashed ' + (over ? 'var(--char-accent)' : 'var(--border-gold)'),
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? .38 : 1,
        transition: 'background var(--dur-hover) var(--ease-out), border-color var(--dur-hover) var(--ease-out)',
        ...style
      }}
      {...rest}
    >
      <input
        type="file" accept="image/*" disabled={disabled} style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files && e.target.files[0];
          e.target.value = '';
          if (file && onSelect) onSelect(file);
        }}
      />
      <span style={{
        width: 30, height: 30, borderRadius: 7, display: 'grid', placeItems: 'center',
        color: 'var(--char-accent)', background: 'rgba(3,8,7,.7)',
        border: '1px solid color-mix(in srgb, var(--char-accent) 60%, transparent)'
      }}><Icon name="upload" size={16} /></span>
      <span style={{ font: 'var(--type-body)', fontWeight: 600, color: 'var(--parchment)' }}>{label}</span>
      <span style={{ font: 'var(--type-caption)', color: 'var(--text-muted)' }}>{filename || formats}</span>
    </label>
  );
}
