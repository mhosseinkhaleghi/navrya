import * as React from 'react';
export declare const DEFAULT_METRICS: Array<{ icon: string; label: string; value: string }>;
export interface MetricRowProps extends React.HTMLAttributes<HTMLElement> {
  metrics?: Array<{ icon?: string; label: string; value: string | number }>;
}
export declare function MetricRow(props: MetricRowProps): JSX.Element;
