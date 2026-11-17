// A page's content region in the terminal: the box the kit's container questions read (the web's `content` container,
// CONTENT_CONTAINER). It is a measured pane (prim PaneSize), so useContentNarrow / useContainerNarrow inside it answer
// from its width, not the terminal's. Width only: the region is as tall as its content, so a height on the viewport
// (the AI tab's `100dvh` chat frame, jsx/dom DomVh) is read from the pane around it, which follows the terminal.
import type * as Web from './ContentRegion';
import { PaneSize } from '../../term/prim';

export const ContentRegion: typeof Web.ContentRegion = ({ children }) => <PaneSize dir="column" grow={1} minWidth={0} widthOnly>{children}</PaneSize>;
