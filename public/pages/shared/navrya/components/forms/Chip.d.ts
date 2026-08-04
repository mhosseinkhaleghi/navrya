import * as React from 'react';
export interface ChipProps extends React.HTMLAttributes<HTMLElement> {
  tone?: 'accent' | 'neutral' | 'success' | 'danger';
  /** Adds the leading dot so state is not colour alone. */
  dot?: boolean;
  children?: React.ReactNode;
}
export declare function Chip(props: ChipProps): JSX.Element;
