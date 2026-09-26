import React from 'react';

/* Where the ChatDock capsule currently sits, for the surfaces rendered inside it (ChatDock
   publishes it; ChatResponsePopover and VoiceConsole read it):
   - 'bottom': bottom-centre, no dialog open - the full capsule (artbook plates III/IV).
   - 'side':   a column on the inline-end side - beside an open dialog, or pinned there by the user
               (plate III "side"); also the voice sidecar of a long form (plate XVII).
   - 'under':  a dialog is open but the conversation cannot sit beside it - the capsule stays in the
               band the dialog's backdrop reserves below it, and a reply shows as a short "peek"
               (plate III 2') so nothing ever covers the dialog.
   - 'weld':   a voice session with a dialog open - the voice bar is attached to the dialog's bottom
               edge, the same width (plates XIV, XV, XVIII). */
export var DockLayoutContext = React.createContext('bottom');

// Height of the band a reply may use in the 'under' layout: what the dialog's backdrop reserves above
// the composer (dockSideLane.js: REPLY_ALLOWANCE_PX).
export var UNDER_DIALOG_ALLOWANCE_PX = 130;
