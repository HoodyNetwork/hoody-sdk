// The rail that owns its screen edge to edge (the AI tab) in the terminal, on one grid as the web's (RailPane.tsx):
//   lead column: the current bar '▌' (the web's ink bar, readable in mono) and a two-cell icon slot (blank for a
//                decorative icon), so a glyph never lands on the label and every label starts on the same text edge;
//   RailFrame:   a row, the rail at the web's px / 8 cells beside the page; `single` = one slot (the rail and the page
//                take turns, or a conversation's frame places the rail itself), where the rail fills what it is given;
//   RailNav:     one destination per line (strip: wrapped across, two or more a row, the whole screen being the rail);
//   RailSubnav:  the kit's section menu nested under its row; strip: the same links wrapped across (no sideways scroll);
//   RailFoot:    a rule, row 1 where (title, then the note on its own line, never run together) with the end control
//                at its end edge (never a lone control on a row of its own), row 2 the action, then its children.
// The handle (PaneSeparator) is the rail's last column, a real column here: nothing can lie over another cell.
import { createContext, useContext, useRef, type ReactNode } from 'react';
import type * as Web from './RailPane';
import { Box, Pressable, Text } from '../../term/prim';
import type { BoxRenderable } from '../../term/prim/otui';
import { useSticky } from '../../term/jsx/sticky';
import { OwnScroll, useRegionRows } from './scrollOwner';
import { useGoTerm } from '../../term/app/nav';
import { ICON_GLYPHS, iconText } from '../icons.glyphs';
import { Icon } from '../icons';
import { EmptyRail } from '../states/emptyScope';
import { ListPaneContext, type ListPane } from './pane';
import { SectionMenuItem, SectionMenuList } from './SectionMenu';
import { focusInk } from '@term/kit';

export type { RailFrameProps, RailPaneProps, RailNavItem, RailSubnavItem, RailFootProps } from './RailPane';

const RAIL_LIST: ListPane = { presentation: 'list', rail: true, flush: true };
const CELL_PX = 8;
/** The rail's own width in cells when its frame places it beside the page; null = fill the slot given. */
const RailCols = createContext<number | null>(null);
/** The rail is the whole screen (the web's `strip`): its nav draws across. */
const RailStrip = createContext(false);

// The web: the frame is at least the page region's height (`.frame { min-block-size: 100% }`) and the rail is exactly
// that height and sticky at its top (`.rail { position: sticky; block-size: <region> }`); its body takes the height left
// and the list in it scrolls itself (`.body { flex: 1; min-block-size: 0 }`). So head and foot stay on screen whatever
// the list's length, and the page
// beside the rail scrolls in the shell's outlet while the rail stays put. The region's rows come from that outlet
// (useRegionRows); before they are known the frame and the rail take their content's height.
export const RailFrame: typeof Web.RailFrame = ({ width, single, children }) => {
  const rows = useRegionRows();
  return (
    <RailCols.Provider value={single ? null : Math.max(1, Math.round(width / CELL_PX))}>
      <Box dir={single ? 'column' : 'row'} grow={1} shrink={1} minHeight={rows ?? 0} minWidth={0}>{children}</Box>
    </RailCols.Provider>
  );
};

export const RailPane: typeof Web.RailPane = ({ label, head, nav, children, foot, handle, strip }) => {
  const cols = useContext(RailCols);
  const rows = useRegionRows();
  const self = useRef<BoxRenderable | null>(null);
  useSticky(self, rows !== null ? { top: 0 } : undefined);
  return (
    <RailStrip.Provider value={strip === true}>
    <Box boxRef={self} dir="row" minHeight={0} {...(rows !== null ? { height: rows, shrink: 0 } : {})}
      {...(cols !== null ? { width: cols, shrink: 0, grow: 0 } : { grow: 1, shrink: 1, minWidth: 0 })}
      sem={{ role: 'navigation', name: label }}>
      <Box dir="column" grow={1} shrink={1} minWidth={0} minHeight={0}>
        {head ? <Box dir="row" padX={1} shrink={0}>{head}</Box> : null}
        {nav}
        {/* The body takes the height left; the list in it scrolls itself (the web's .body), so it sees no page
            scroll owner (OwnScroll): a kit list fills the body and windows its rows. */}
        {/* padX: the web's --rail-pad on the list (its toolbar, rows and group rows), the inset of head, links and foot. */}
        <Box dir="column" grow={1} shrink={1} minHeight={0} padX={1} clip>
          <OwnScroll>
            <ListPaneContext.Provider value={RAIL_LIST}>
              <EmptyRail>{children}</EmptyRail>
            </ListPaneContext.Provider>
          </OwnScroll>
        </Box>
        {foot}
      </Box>
      {handle ?? null}
    </Box>
    </RailStrip.Provider>
  );
};

/** The lead column: the bar, then the icon's glyph or two blanks. */
function lead(current: boolean, icon: Web.RailNavItem['icon']): string {
  const c = ICON_GLYPHS[icon];
  const g = c && c.kind === 'glyph' ? iconText(c) : '';
  return (current ? '▌' : ' ') + (g ? g + ' ' : '  ');
}

function NavRow({ d }: { d: Web.RailNavItem }) {
  const go = useGoTerm();
  const current = d.current === true;
  return (
    <Pressable dir="row" hoverFill onPress={() => go(d.href)} sem={{ role: 'link', name: d.label, ...(current ? { current: 'page' } : {}) }}>
      {({ focused }) => (
        <Box dir="row" grow={1} minWidth={0}>
          <Text colour={current ? 'ink' : 'muted'} shrink={0} {...focusInk(focused)}>{lead(current, d.icon)}</Text>
          <Text truncate grow={1} colour={current ? 'ink' : 'muted'} bold={current} {...focusInk(focused)}>{d.label}</Text>
          {d.mark ? <Text colour="acc" shrink={0}>{' ●'}</Text> : null}
        </Box>
      )}
    </Pressable>
  );
}

export const RailNav: typeof Web.RailNav = ({ label, items }) => {
  const strip = useContext(RailStrip);
  if (strip) {
    return (
      <Box dir="row" wrap gapX={2} padX={1} shrink={0} sem={{ role: 'list', name: label }}>
        {items.map((d) => (
          <Box key={d.id} dir="column" shrink={0} sem={{ role: 'listitem' }}><NavRow d={d} /></Box>
        ))}
      </Box>
    );
  }
  // padX: the web's .navItem padding-inline (--rail-pad), so the bar and the list under it start on one column.
  return (
    <Box dir="column" padX={1} shrink={0} sem={{ role: 'list', name: label }}>
      {items.map((d) => (
        <Box key={d.id} dir="column" shrink={0} sem={{ role: 'listitem' }}>
          <NavRow d={d} />
          {d.below ? <Box dir="column" padX={1}>{d.below}</Box> : null}
        </Box>
      ))}
    </Box>
  );
};

export const RailSubnav: typeof Web.RailSubnav = ({ label, items, strip }) => {
  const entries = items.map((k) => (
    <SectionMenuItem key={k.id} href={k.href} current={k.current === true} {...(k.current ? { 'aria-current': 'page' as const } : {})}>{k.label}</SectionMenuItem>
  ));
  if (strip) return <Box dir="row" wrap gapX={1} padX={1} shrink={0} sem={{ role: 'list', name: label }}>{entries}</Box>;
  return <Box dir="column" padX={1} shrink={0} sem={{ role: 'list', name: label }}><SectionMenuList>{entries}</SectionMenuList></Box>;
};

export const RailFoot: typeof Web.RailFoot = ({ icon, title, note, action, end, children }) => (
  <Box dir="column" border={['top']} borderColour="line" shrink={0}>
    <Box dir="row" padX={1}>
      <Icon name={icon} />
      <Box dir="column" grow={1} shrink={1} minWidth={0}>
        <Text truncate bold>{title}</Text>
        {note ? <Text truncate colour="muted">{note}</Text> : null}
      </Box>
      {end ? <Box dir="row" shrink={0} align="start">{end}</Box> : null}
    </Box>
    {action ? <Box dir="row" padX={1}>{action}</Box> : null}
    {children}
  </Box>
);

