import * as React from 'react';
export interface SessionEmptyStateProps extends React.HTMLAttributes<HTMLElement> {
  title?: string;
  helper?: string;
  /** Icon slug for the 60px message glyph. */
  icon?: string;
  /** Three decorative ghost-card labels. */
  hints?: string[];
  minHeight?: number;
}
export declare function SessionEmptyState(props: SessionEmptyStateProps): JSX.Element;
