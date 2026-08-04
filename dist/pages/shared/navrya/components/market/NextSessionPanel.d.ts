import * as React from 'react';
export interface NextSessionPanelProps extends React.HTMLAttributes<HTMLElement> {
  city?: string;
  /** HH:MM:SS. Ticks once per second when live. */
  startsIn?: string;
  live?: boolean;
  width?: number;
}
export declare function NextSessionPanel(props: NextSessionPanelProps): JSX.Element;
