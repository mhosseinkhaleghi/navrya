import React from 'react';
import { Icon } from '../core/Icon.jsx';
import { useAnalyzingImageMotion } from './AnalyzingImageIcon.motion.js';

/* Icon-scale "scanning" indicator for a button whose click just started a real, in-flight chart-
   image call (Draw scenario / Draw full analysis on chart / Start analysis) - reimplements
   loading-ui.com's "Analyzing image" component (the trader's own reference) on this app's shared
   Icon glyph instead of a bespoke SVG, so it sits on the same 24x24/2px-stroke grid as every other
   icon in the product. Purely decorative (aria-hidden) - the button's own label text is what
   actually communicates the loading state to a screen reader (see Button.jsx's `loading` prop). */
export function AnalyzingImageIcon({ size = 18 }) {
  useAnalyzingImageMotion();
  return (
    <span aria-hidden="true" style={{ position: 'relative', display: 'inline-flex', width: size, height: size, flex: 'none', overflow: 'hidden' }}>
      <Icon name="image" size={size} style={{ position: 'absolute', inset: 0, opacity: 0.35 }} />
      <span data-nv-analyzing-mask style={{ position: 'absolute', inset: 0, color: 'var(--char-accent)' }}>
        <Icon name="image" size={size} style={{ position: 'absolute', inset: 0 }} />
      </span>
      <span data-nv-analyzing-beam style={{ position: 'absolute', top: 0, bottom: 0, width: Math.max(2, Math.round(size * 0.16)), borderRadius: 999, background: 'var(--char-accent)' }} />
    </span>
  );
}
