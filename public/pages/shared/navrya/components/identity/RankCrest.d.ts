import * as React from 'react';
export declare const RANK_TITLE: Record<string, { rank: string; tier: string }>;
export interface RankCrestProps extends React.HTMLAttributes<HTMLElement> {
  /** Character skin. Drives every --char-* token. */
  character?: 'hunter' | 'commander' | 'engineer' | 'master';
  /** Rank name, e.g. "EMERALD HUNTER". */
  rank?: string;
  /** Roman tier numeral. */
  tier?: string;
  size?: number;
  layout?: 'row' | 'column';
  label?: string;
}
export declare function RankCrest(props: RankCrestProps): JSX.Element;
