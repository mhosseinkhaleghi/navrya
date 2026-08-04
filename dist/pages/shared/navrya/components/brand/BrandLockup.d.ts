import * as React from 'react';
export declare const EDITION_LABEL: Record<string, string>;
export interface BrandLockupProps extends React.HTMLAttributes<HTMLElement> {
  /** Character skin. Drives every --char-* token. */
  character?: 'hunter' | 'commander' | 'engineer' | 'master';
  orientation?: 'vertical' | 'horizontal';
  /** Mark width in px. */
  markSize?: number;
  wordmarkSize?: number;
  showEdition?: boolean;
  /** Override the edition line, e.g. "HUNTER EDITION". */
  edition?: string;
}
export declare function BrandLockup(props: BrandLockupProps): JSX.Element;
