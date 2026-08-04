import * as React from 'react';
export interface NavRowProps extends React.HTMLAttributes<HTMLElement> {
  icon?: string;
  label?: string;
  active?: boolean;
  disabled?: boolean;
  collapsed?: boolean;
  /** Trims the connecting rail line at the ends of the list. */
  first?: boolean;
  last?: boolean;
  activeLabel?: string;
  badge?: boolean;
  onClick?: () => void;
}
export declare function NavRow(props: NavRowProps): JSX.Element;
