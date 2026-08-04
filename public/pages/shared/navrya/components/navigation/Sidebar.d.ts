import * as React from 'react';
export declare const SIDEBAR_ITEMS: Array<{ id: string; icon: string; label: string }>;
/**
 * Compact NAVRYA sidebar — brand strip, scrolling navigation, pinned quote, reward and collapse.
 */
export interface SidebarProps extends React.HTMLAttributes<HTMLElement> {
  /** Character skin. Drives every --char-* token. */
  character?: 'hunter' | 'commander' | 'engineer' | 'master';
  items?: Array<{ id: string; icon: string; label: string }>;
  activeId?: string;
  /** 256px expanded → 72px icon rail. */
  collapsed?: boolean;
  height?: number | string;
  quote?: string;
  reward?: string;
  rewardProgress?: number;
  onNavigate?: (id: string) => void;
  onToggle?: () => void;
}
export declare function Sidebar(props: SidebarProps): JSX.Element;
