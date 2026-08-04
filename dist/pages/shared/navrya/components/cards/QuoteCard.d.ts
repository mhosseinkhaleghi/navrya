import * as React from 'react';
export declare const CHARACTER_QUOTE: Record<string, string>;
export interface QuoteCardProps extends React.HTMLAttributes<HTMLElement> {
  /** Character skin. Drives every --char-* token. */
  character?: 'hunter' | 'commander' | 'engineer' | 'master';
  /** Overrides the character quote. Newlines are honoured. */
  quote?: string;
  height?: number;
}
export declare function QuoteCard(props: QuoteCardProps): JSX.Element;
