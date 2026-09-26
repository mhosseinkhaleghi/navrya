import React from 'react';
import { TICK, GRABBER } from './dockDesign.js';

/* The design's capsule furniture (plate III): a grabber pill and two corner ticks at the top edge of a
   card. Decorative - the top edge is what tells the eye where the assistant's card begins. */
export function CapsuleTop() {
  return (
    <React.Fragment>
      <span aria-hidden="true" style={{ position: 'absolute', top: 6, left: '50%', width: 36, height: 4, marginLeft: -18, borderRadius: 4, background: GRABBER, pointerEvents: 'none' }} />
      <span aria-hidden="true" style={{ position: 'absolute', top: 9, insetInlineEnd: 9, width: 9, height: 9, pointerEvents: 'none', borderTop: '1px solid ' + TICK, borderInlineEnd: '1px solid ' + TICK }} />
      <span aria-hidden="true" style={{ position: 'absolute', top: 9, insetInlineStart: 9, width: 9, height: 9, pointerEvents: 'none', borderTop: '1px solid ' + TICK, borderInlineStart: '1px solid ' + TICK }} />
    </React.Fragment>
  );
}
