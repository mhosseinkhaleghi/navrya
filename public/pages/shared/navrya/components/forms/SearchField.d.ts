import * as React from 'react';
export interface SearchFieldProps extends React.HTMLAttributes<HTMLElement> {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}
export declare function SearchField(props: SearchFieldProps): JSX.Element;
