import * as React from 'react';
export interface XPProgressProps extends React.HTMLAttributes<HTMLElement> {
  value?: number;
  max?: number;
  label?: string;
  showPercent?: boolean;
  /** Track height. 8px default. */
  height?: number;
}
export declare function XPProgress(props: XPProgressProps): JSX.Element;
