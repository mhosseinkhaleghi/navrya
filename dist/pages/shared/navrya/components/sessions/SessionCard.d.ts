import * as React from 'react';
export interface SessionCardProps extends React.HTMLAttributes<HTMLElement> {
  title?: string;
  /** Status chip label, e.g. ACTIVE. Pass '' to hide. */
  status?: string;
  city?: string;
  timeframe?: string;
  summary?: string;
  instrument?: string;
  lastUpdate?: string;
  /** Chart snapshot URL. Defaults to the supplied London snapshot. */
  thumbnail?: string;
  /** compact stacks chart over detail (grid view); row puts the chart beside a 366px panel. */
  layout?: 'row' | 'compact' | 'column';
  /** Edition badge overlaid on the chart, e.g. "Hunter edition". */
  edition?: string;
  /** Force the INSTRUMENT / LAST UPDATE block on or off. Defaults on for row, off for compact. */
  showDetail?: boolean;
  chartHeight?: number | string;
  onOpen?: () => void;
  onReport?: () => void;
  onRepeat?: () => void;
  onDelete?: () => void;
}
export declare function SessionCard(props: SessionCardProps): JSX.Element;
