import * as React from 'react';
export declare const CHARACTER_REWARD: Record<string, string>;
export interface RewardCardProps extends React.HTMLAttributes<HTMLElement> {
  /** Character skin. Drives every --char-* token. */
  character?: 'hunter' | 'commander' | 'engineer' | 'master';
  reward?: string;
  xp?: string;
  /** 0–100. */
  progress?: number;
  height?: number;
  label?: string;
  onOpen?: () => void;
}
export declare function RewardCard(props: RewardCardProps): JSX.Element;
