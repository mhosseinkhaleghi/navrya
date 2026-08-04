import * as React from 'react';
export interface ViewToggleProps extends React.HTMLAttributes<HTMLElement> {
  value?: string;
  onChange?: (value: string) => void;
  /** Defaults to grid / list. */
  options?: Array<{ value: string; icon: string }>;
}
export declare function ViewToggle(props: ViewToggleProps): JSX.Element;
