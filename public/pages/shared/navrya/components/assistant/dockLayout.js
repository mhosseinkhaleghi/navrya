import React from 'react';

/* Where the ChatDock capsule currently sits, for the surfaces rendered inside it (ChatDock
   publishes it; ChatResponsePopover reads it):
   - 'bottom': bottom-centre, no dialog open - the full capsule (artbook plates III/IV).
   - 'side':   in the lane beside an open dialog (plate VII) - full capsule, narrow column.
   - 'under':  a dialog is open but no lane fits (smaller screens) - the capsule stays in the band
               the dialog's backdrop reserves below it, and a reply shows as a short "peek"
               (plate III 2') so nothing ever covers the dialog. */
export var DockLayoutContext = React.createContext('bottom');

// Height of the band a reply may use in the 'under' layout - also what ChatDock adds to
// --navrya-chat-dock-reserved in that layout, so the dialog's backdrop leaves exactly this room.
export var UNDER_DIALOG_ALLOWANCE_PX = 124;
