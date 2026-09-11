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
  /** Boolean active-state dot (CollapsedRail's own indicator) - unrelated to `count`. */
  badge?: boolean;
  /** Numeric unread badge. Hidden at 0/falsy, shown as "99+" above 99. */
  count?: number;
  /** Accessible text for the badge (e.g. "3 unread") - appended to the row's aria-label when `count` is shown. */
  countLabel?: string;
  onClick?: () => void;
}
export declare function NavRow(props: NavRowProps): JSX.Element;
