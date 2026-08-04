import * as React from 'react';
export interface MetricTileProps extends React.HTMLAttributes<HTMLElement> {
  /** Icon slug: honour · scenarios · execution · streak. */
  icon?: string;
  label?: string;
  value?: string | number;
  minWidth?: number;
}
export declare function MetricTile(props: MetricTileProps): JSX.Element;
