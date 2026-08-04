import * as React from 'react';
export interface TextFieldProps extends React.HTMLAttributes<HTMLElement> {
  label?: string;
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  type?: string;
  /** 'rtl' for Jalali dates and Persian / Arabic input. */
  dir?: string;
  disabled?: boolean;
  hint?: string;
}
export declare function TextField(props: TextFieldProps): JSX.Element;
