import * as React from 'react';
export declare const CHARACTER_TITLE: Record<string, string>;
export interface CharacterIdentityProps extends React.HTMLAttributes<HTMLElement> {
  /** Character skin. Drives every --char-* token. */
  character?: 'hunter' | 'commander' | 'engineer' | 'master';
  /** Overrides the character title, e.g. "THE HUNTER". */
  title?: string;
  name?: string;
  handle?: string;
  quote?: string;
  titleSize?: number;
}
export declare function CharacterIdentity(props: CharacterIdentityProps): JSX.Element;
