import * as React from 'react';
export declare const NAVRYA_ICONS: Record<string, string>;
export interface IconProps extends React.HTMLAttributes<HTMLElement> {
  /** NAVRYA icon slug (see NAVRYA_ICONS) or a Lucide name. */
  name: string;
  /** 16 · 20 · 24 · 32 · 48. Optical size is 20 on a 24 grid. */
  size?: number;
  strokeWidth?: number;
  /** Accessible name. Omit for decorative icons. */
  title?: string;
}
export declare function Icon(props: IconProps): JSX.Element;
