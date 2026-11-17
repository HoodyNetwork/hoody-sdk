// portal.term: a terminal page has no DOM element to draw into, so the node draws where it is called (Tools' save bar under
// the editor, a Rules switch's banner under that switch). The same words and buttons, in place.
import type { ReactNode, ReactPortal } from 'react';
import type * as Web from './portal';

// The web signature's container and key are ignored: there is no other element to draw into. The node is returned as
// the portal the caller renders (ReactPortal is one of ReactNode's members, so the narrowing cast is checked).
export const portal: typeof Web.portal = (children: ReactNode): ReactPortal => children as ReactPortal;
