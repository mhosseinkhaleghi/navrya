import * as React from 'react';
export interface SelectProps extends React.HTMLAttributes<HTMLElement> {
  value?: string;
  /** Strings, or { value, label, native } for the language selector. */
  options?: Array<string | { value: string; label: string; native?: string }>;
  onChange?: (value: string) => void;
  /** Leading icon slug. */
  icon?: string;
  width?: number | string;
  placeholder?: string;
  disabled?: boolean;
  align?: 'start' | 'center';
}
export declare function Select(props: SelectProps): JSX.Element;
