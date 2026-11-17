// Section menus in the terminal (SettingsPage's menu, the Guide's index): a column of items on a rail. The current
// item carries the bar mark '▌' and bold text (the web's 3 px ink bar), so it reads in mono; the focused one is on
// the focus plate (focusInk). An item calls onClick, as the web button and link do; an item with href then navigates, unless the handler
// called preventDefault (a web link then stays put: the Guide's index jumps itself and keeps its query in the URL).
import type { ReactNode } from 'react';
import type * as Web from './SectionMenu';
import { useGoTerm } from '../../term/app/nav';
import { Box, Pressable, Text } from '../../term/prim';
import { pressEvent, type TermEvent } from '../../term/jsx/element';
import { focusInk } from '@term/kit';

export type { SectionMenuItemProps } from './SectionMenu';

/** What a web onClick handler receives here: the compat runtime's own keyboard click (pressEvent, detail 0), so a
 *  handler reading preventDefault, button or detail sees what a raw <button> or <a> press gives it. */
const click = (): TermEvent => pressEvent(null);

export const SectionMenuList: typeof Web.SectionMenuList = ({ children }) => (
  <Box dir="column" border={['left']} borderColour="line" shrink={0}>{children}</Box>
);

export const SectionMenuItem: typeof Web.SectionMenuItem = (p) => {
  const go = useGoTerm();
  // Every prop is read by name (never through a cast of the whole props object), so the contract and its mutants see
  // exactly which ones this item honours: current, children, href, onClick, aria-current, aria-label and (a button's) disabled.
  const { current, children, href, onClick } = p;
  // aria-current's own token when the caller names one ('page' for a link to the shown screen), as the web reads it.
  const ariaCurrent = p['aria-current'];
  // The accessible name: aria-label when the caller gives one (an item whose children are not plain text), else the text.
  const label = p['aria-label'];
  const name = typeof label === 'string' && label !== '' ? label : typeof children === 'string' ? children : undefined;
  const currentState = typeof ariaCurrent === 'string' && ariaCurrent !== 'true' && ariaCurrent !== 'false' ? ariaCurrent : true;
  const disabled = p.href === undefined && p.disabled === true;
  const press = (): void => {
    if (disabled) return;
    const e = click();
    onClick?.(e as never); // contract-any: a terminal press has no DOM MouseEvent; the compat click stands in
    if (typeof href === 'string' && !e.defaultPrevented) go(href);
  };
  return (
    <Pressable dir="row" disabled={disabled} hoverFill onPress={press}
      sem={{ role: typeof href === 'string' ? 'link' : 'button', ...(name !== undefined ? { name } : {}), ...(current ? { current: currentState } : {}) }}>
      {({ focused }) => (
        <>
          <Text shrink={0} colour={disabled ? 'faint' : current ? 'ink' : 'muted'} bold={current} {...focusInk(focused)}>{current ? '▌' : ' '}</Text>
          {/* A label wider than the menu wraps under itself (two lines at most), never cut mid-word. */}
          <Text maxLines={2} shrink={1} colour={disabled ? 'faint' : current ? 'ink' : 'muted'} bold={current} {...focusInk(focused)}>{children as ReactNode}{' '}</Text>
        </>
      )}
    </Pressable>
  );
};
