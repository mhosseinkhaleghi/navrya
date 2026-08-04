import * as React from 'react';
export declare const CHARACTER_DATA: Record<string, { level: number; xp: number; xpMax: number; quote: string }>;
/**
 * The 1920×320 NAVRYA character header — one component, four identities.
 */
export interface CharacterHeaderProps extends React.HTMLAttributes<HTMLElement> {
  /** Character skin. Drives every --char-* token. */
  character?: 'hunter' | 'commander' | 'engineer' | 'master';
  name?: string;
  handle?: string;
  level?: number;
  xp?: number;
  xpMax?: number;
  quote?: string;
  metrics?: Array<{ icon?: string; label: string; value: string | number }>;
  date?: string;
  language?: string;
  uptime?: string;
  nextSession?: { city: string; startsIn: string };
  markets?: Array<{ market: string; state: string }>;
  onEditPortrait?: () => void;
}
export declare function CharacterHeader(props: CharacterHeaderProps): JSX.Element;
