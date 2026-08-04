import * as React from 'react';
export interface BrandStripProps extends React.HTMLAttributes<HTMLElement> {
  /** Character skin. Drives every --char-* token. */
  character?: 'hunter' | 'commander' | 'engineer' | 'master';
  /** Strip height. 92px in the compact sidebar. */
  height?: number;
  collapsed?: boolean;
  showInsignia?: boolean;
}
export declare function BrandStrip(props: BrandStripProps): JSX.Element;
