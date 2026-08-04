import * as React from 'react';
export interface ButtonProps extends React.HTMLAttributes<HTMLElement> {
  /** primary is the single module CTA; secondary is the default toolbar control. */
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  /** md = 44px toolbar control, sm = 36px card action. */
  size?: 'md' | 'sm';
  /** Leading icon slug. */
  icon?: string;
  /** Trailing icon slug. */
  iconAfter?: string;
  disabled?: boolean;
  fullWidth?: boolean;
  children?: React.ReactNode;
}
export declare function Button(props: ButtonProps): JSX.Element;
