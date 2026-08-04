import * as React from 'react';
export declare const SESSION_FILTERS: string[];
export declare const SESSION_SORTS: string[];
/**
 * The Session Library ledger — heading, command toolbar, session cards and empty state.
 */
export interface SessionLibraryProps extends React.HTMLAttributes<HTMLElement> {
  title?: string;
  subtitle?: string;
  /** SessionCard props, one per saved session. Empty renders the empty state. */
  sessions?: Array<Record<string, unknown>>;
  /** Edition badge passed down to every card, e.g. "Hunter edition". */
  edition?: string;
  /** Fires when the New session dialog is confirmed, with the dialog's values. The CTA itself only opens the dialog. */
  onNewSession?: (values: Record<string, string>) => void;
}
export declare function SessionLibrary(props: SessionLibraryProps): JSX.Element;
