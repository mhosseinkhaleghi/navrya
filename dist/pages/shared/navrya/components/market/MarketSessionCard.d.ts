import * as React from 'react';
export declare const MARKETS: Record<string, { city: string; hours: string; landmark: string }>;
export interface MarketSessionCardProps extends React.HTMLAttributes<HTMLElement> {
  /** Session city. */
  market?: 'london' | 'new-york' | 'tokyo' | 'sydney';
  /** Open is a gold frame + accent highlight + green dot; every state keeps the same 64px box. */
  state?: 'default' | 'hover' | 'open' | 'next' | 'closed' | 'disabled';
  /** Replaces the hours line, e.g. "STARTS IN 01:35:40". */
  countdown?: string;
  minWidth?: number;
  /** Card height. Matches the 64px metric tile in the header rail. */
  height?: number | string;
}
export declare function MarketSessionCard(props: MarketSessionCardProps): JSX.Element;
