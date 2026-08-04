import * as React from 'react';
export interface LevelBadgeProps extends React.HTMLAttributes<HTMLElement> {
  level?: number;
  label?: string;
  /** Module width. 104px in the header. */
  width?: number;
}
export declare function LevelBadge(props: LevelBadgeProps): JSX.Element;
