import * as React from 'react';
export interface CollapseControlProps extends React.HTMLAttributes<HTMLElement> {
  collapsed?: boolean;
  onToggle?: () => void;
  label?: string;
}
export declare function CollapseControl(props: CollapseControlProps): JSX.Element;
