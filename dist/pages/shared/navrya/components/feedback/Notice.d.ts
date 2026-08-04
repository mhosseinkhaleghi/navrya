import * as React from 'react';
export interface NoticeProps extends React.HTMLAttributes<HTMLElement> {
  tone?: 'info' | 'accent' | 'warning' | 'danger';
  icon?: string;
  children?: React.ReactNode;
}
export declare function Notice(props: NoticeProps): JSX.Element;
