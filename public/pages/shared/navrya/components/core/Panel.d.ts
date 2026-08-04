import * as React from 'react';
export interface PanelProps extends React.HTMLAttributes<HTMLElement> {
  /** Frame treatment. */
  variant?: 'base' | 'raised' | 'prestige' | 'active' | 'quiet';
  /** Corner radius in px. R4 · R8 · R12 · R14. */
  radius?: number;
  /** Render the four 12px corner ornaments. */
  ornament?: boolean;
  ornamentSize?: number;
  ornamentInset?: number;
  /** Overlay the character atmosphere texture at 4–8% opacity. */
  texture?: boolean;
  textureOpacity?: number;
  /** Add the soft accent glow. */
  glow?: boolean;
  padding?: number | string;
  as?: keyof JSX.IntrinsicElements;
  children?: React.ReactNode;
}
export declare function Panel(props: PanelProps): JSX.Element;
