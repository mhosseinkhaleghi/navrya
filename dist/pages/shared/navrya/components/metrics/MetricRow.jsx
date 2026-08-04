import React from 'react';
import { MetricTile } from './MetricTile.jsx';
import { Panel } from '../core/Panel.jsx';

export const DEFAULT_METRICS = [
  { icon: 'honour', label: 'HONOUR', value: '1,850' },
  { icon: 'scenarios', label: 'SCENARIOS', value: '42' },
  { icon: 'execution', label: 'EXECUTION', value: '68%' },
  { icon: 'streak', label: 'STREAK', value: '11 DAYS' }
];

/* Four equal metric tiles in one framed row, split by 1px antique-gold dividers at 28%. */
export function MetricRow({ metrics = DEFAULT_METRICS, style, ...rest }) {
  return (
    <Panel variant="base" radius={8} style={{ background: 'rgba(11,16,22,.6)', ...style }} {...rest}>
      <div style={{ display: 'flex', alignItems: 'stretch' }}>
        {metrics.map((m, i) => (
          <React.Fragment key={m.label}>
            {i > 0 && <span aria-hidden="true" style={{ width: 1, background: 'var(--divider-gold)', margin: '10px 0' }}></span>}
            <MetricTile {...m} />
          </React.Fragment>
        ))}
      </div>
    </Panel>
  );
}
