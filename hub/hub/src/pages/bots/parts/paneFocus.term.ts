// The bot pane's keyboard rules in the terminal: there is no document. The terminal's focus system (term/prim focus)
// moves the keyboard itself, so the pane never takes it: the keyboard always counts as held, focus never as lost, and
// there is no ⋯ or details element to look up. Document focus watching is a no-op.
import type * as Web from './paneFocus';

export const hiddenByPage: typeof Web.hiddenByPage = () => false;
export const overlayOpen: typeof Web.overlayOpen = () => false;
export const keyboardHeld: typeof Web.keyboardHeld = () => true;
export const focusLost: typeof Web.focusLost = () => false;
export const moreTrigger: typeof Web.moreTrigger = () => null;
export const openerNow: typeof Web.openerNow = () => null;
export const holdsFocus: typeof Web.holdsFocus = () => false;
export const detailsPanel: typeof Web.detailsPanel = () => null;
export const detailsToggle: typeof Web.detailsToggle = () => null;
export const onDocumentFocus: typeof Web.onDocumentFocus = () => () => {};
