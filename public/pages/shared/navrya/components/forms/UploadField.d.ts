import * as React from 'react';
export interface UploadFieldProps extends React.HTMLAttributes<HTMLElement> {
  label?: string;
  formats?: string;
  /** Replaces the formats line once a file is chosen. */
  filename?: string;
  onSelect?: () => void;
  height?: number;
  disabled?: boolean;
}
export declare function UploadField(props: UploadFieldProps): JSX.Element;
