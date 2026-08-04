import * as React from 'react';
export declare const TIMEFRAMES: string[];
export declare const SESSION_CITIES: string[];
export declare const LOOP_INTERVALS: string[];
export declare const UPLOAD_SLOTS: string[];
export interface NewSessionDialogProps extends React.HTMLAttributes<HTMLElement> {
  open?: boolean;
  /** Uppercase strip above the header, e.g. { left: '01 HUNTER', right: 'HUNT SESSION' }. */
  eyebrow?: { left: string; right: string };
  onClose?: () => void;
  onCreate?: (values: Record<string, string>) => void;
  defaults?: Record<string, string>;
}
export declare function NewSessionDialog(props: NewSessionDialogProps): JSX.Element;
