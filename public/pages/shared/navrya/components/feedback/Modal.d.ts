import * as React from 'react';
export interface ModalProps extends React.HTMLAttributes<HTMLElement> {
  open?: boolean;
  title?: string;
  /** Icon slug for the 34px accent tile beside the title. */
  icon?: string;
  /** Optional uppercase strip above the header: { left, right }. */
  eyebrow?: { left: string; right: string };
  onClose?: () => void;
  footer?: React.ReactNode;
  width?: number;
  children?: React.ReactNode;
}
export declare function Modal(props: ModalProps): JSX.Element;
