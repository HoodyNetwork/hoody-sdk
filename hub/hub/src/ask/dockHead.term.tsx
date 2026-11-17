// dockHead.term: the dock header's frame in cells, a rule below it. The target chip first, Recent, New and Close at the
// row's end; a terminal button shows its label as words, so where the dock is too narrow for all of them on one row the
// end group moves to the next row and wraps there (nothing is cut or hidden).
// The running count follows the Recent button as "N" (a cell has no corner to put a badge on).
import { cloneElement, isValidElement, type ReactNode } from 'react';
import type * as Web from './dockHead';
import { Box, Text } from '../term/prim';
import { useAskDockFrame } from '../term/shell/askDockFrame';

// `confirm` (the New-conversation question in place of the controls): the web widens the row's start padding (16 px);
// here the question starts one cell further in, so it reads as a different row from the controls it replaced.
const HeadRow: Web.DockHeadParts['HeadRow'] = ({ confirm, children }) => (
  <Box dir="row" wrap align="center" shrink={0} gapX={1} padX={1} border={['bottom']} borderColour="line">
    {confirm ? <Text> </Text> : null}
    {children}
  </Box>
);
const HeadText: Web.DockHeadParts['HeadText'] = ({ children }) => (
  <Box grow={1} shrink={1} minWidth={0}><Text truncate>{children as ReactNode}</Text></Box>
);
const HeadEnd: Web.DockHeadParts['HeadEnd'] = ({ children }) => (
  <>
    <Box grow={1} shrink={1} />
    <Box dir="row" wrap align="center" shrink={1} gapX={1}>{children}</Box>
  </>
);
// As a Popover trigger it is handed the opener as onPress (overlays/trigger.ts withPress): it goes on to the button inside.
const CountWrap: Web.DockHeadParts['CountWrap'] = (props) => {
  const { count, children } = props;
  const opener = (props as { onPress?: (e: unknown) => void }).onPress;
  const button = opener && isValidElement<{ onPress?: (e: unknown) => void }>(children)
    ? cloneElement(children, { onPress: (e: unknown) => { children.props.onPress?.(e); opener(e); } })
    : children;
  return <Box dir="row" align="center" shrink={0}>{button}{count != null && <Text colour="acc" bold>{String(count)}</Text>}</Box>;
};

export type { DockHeadParts } from './dockHead';
export const termHead: typeof Web.termHead = { HeadRow, HeadText, HeadEnd, CountWrap };

/** The dock is the full-screen sheet (below the pane's width): it covers the page, so a link followed in it closes it. */
export const useTermSheet: typeof Web.useTermSheet = () => useAskDockFrame()?.mode === 'sheet';
