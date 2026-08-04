import * as React from 'react';
export interface UtilityPanelProps extends React.HTMLAttributes<HTMLElement> {
  /** ISO date string shown in the date control. */
  date?: string;
  language?: string;
  /** HH:MM:SS app uptime. */
  uptime?: string;
  width?: number;
  onSettings?: () => void;
}
export declare function UtilityPanel(props: UtilityPanelProps): JSX.Element;
