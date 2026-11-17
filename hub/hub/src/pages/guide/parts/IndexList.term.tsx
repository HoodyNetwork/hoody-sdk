// The Guide's index list in the terminal. The web turns the rail into a strip under 760 px of the page
// (guide.module.css: `@container guide (width < 760px)` sets the menu's `--section-menu-flow: row`); no terminal part
// reads a custom property, so this one follows the same condition: one wrapping row of the items then, the kit's rail
// otherwise. The width is the page pane's (the kit's useContainerNarrow), the one the classes' container conditions are
// judged by, so an open Agent dock or the sidebar turns both at the same width.
import { SectionMenuList, useContainerNarrow } from '@kit';
import { Box } from '@term/prim';
import type * as Web from './IndexList';

export const IndexList: typeof Web.IndexList = ({ children }) => {
  const strip = useContainerNarrow(760);
  return strip ? <Box dir="row" wrap shrink={0}>{children}</Box> : <SectionMenuList>{children}</SectionMenuList>;
};
