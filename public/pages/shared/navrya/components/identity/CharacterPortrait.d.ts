import * as React from 'react';
export interface CharacterPortraitProps extends React.HTMLAttributes<HTMLElement> {
  /** Character skin. Drives every --char-* token. */
  character?: 'hunter' | 'commander' | 'engineer' | 'master';
  /** Outer frame size. 220 desktop · 176 laptop. */
  size?: number;
  /** Custom portrait image. Defaults to the character portrait asset. */
  src?: string;
  alt?: string;
  editable?: boolean;
  onEdit?: () => void;
}
export declare function CharacterPortrait(props: CharacterPortraitProps): JSX.Element;
