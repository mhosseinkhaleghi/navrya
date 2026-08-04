import React from 'react';
import { Button } from '../forms/Button.jsx';
import { Icon } from '../core/Icon.jsx';

/* Text composer with an optional attachment thumbnail row - used by Community's feed post box.
   Fully controlled: the caller owns the draft text/attachments and the post handler, matching
   how community-store.js already handles the real upload/post flow. */
export function Composer({
  value = '', onChange, attachments = [], onAttach, onRemoveAttachment,
  placeholder = "What's on your mind?", postLabel = 'Post', attachLabel = 'Attach image',
  onSubmit, disabled = false, style, ...rest
}) {
  const fileRef = React.useRef(null);
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 10, padding: 16, borderRadius: 12,
      border: '1px solid var(--border-gold)', background: 'var(--surface-card)', ...style
    }} {...rest}>
      <textarea
        value={value} onChange={(e) => onChange && onChange(e.target.value)} placeholder={placeholder} rows={3}
        style={{
          resize: 'vertical', borderRadius: 8, padding: '10px 12px', background: 'rgba(11,20,21,.55)',
          border: '1px solid var(--border-hairline)', color: 'var(--text-primary)', font: 'var(--type-body)', outline: 'none'
        }}
      />
      {attachments.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {attachments.map((a, i) => (
            <div key={a.id || i} style={{ position: 'relative', width: 64, height: 64, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border-hairline)' }}>
              <img src={a.previewUrl || a.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              {onRemoveAttachment && (
                <button
                  type="button" onClick={() => onRemoveAttachment(i)} aria-label="Remove"
                  style={{
                    position: 'absolute', top: 2, insetInlineEnd: 2, width: 18, height: 18, borderRadius: '50%',
                    display: 'grid', placeItems: 'center', background: 'rgba(3,8,7,.86)', border: 0, color: '#fff', cursor: 'pointer'
                  }}
                ><Icon name="close" size={11} /></button>
              )}
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
          onChange={(e) => { const file = e.target.files && e.target.files[0]; e.target.value = ''; if (file && onAttach) onAttach(file); }}
        />
        <Button variant="ghost" icon="image" onClick={() => fileRef.current && fileRef.current.click()}>{attachLabel}</Button>
        <Button variant="primary" onClick={onSubmit} disabled={disabled} style={{ marginInlineStart: 'auto' }}>{postLabel}</Button>
      </div>
    </div>
  );
}
