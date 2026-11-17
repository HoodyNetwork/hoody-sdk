// Popover, Sheet and Tooltip in the terminal, on prim/Overlay.
//   Popover: the trigger opens it (its onPress is the opener, as React Aria's DialogTrigger gives it one); a framed
//     panel against the trigger, 1 row off, widths sm 35 / md 40 / lg 45 / picker 55 / wide 80 / bell 50 columns,
//     never past the screen; flips above when the room below is short, clamped inside the screen, re-placed on resize.
//     Keys stay in it (Tab cycles, the first control takes the focus); Esc or a press outside closes it; the focus is
//     back on the trigger. `children` as a function gets `close`.
//   Sheet: a full-screen modal: ‹ (close) and the title, the actions, a scrolling body, a footer. Esc closes.
//   Tooltip: shown while the focus is inside the child (focus-within) or the pointer rests on it (no delay: a terminal
//     has no hover intent), above it, flipping below. It takes no keys but Esc: Esc hides it until the focus leaves and
//     comes back (the web's rule). The child keeps its own keys.
// Narrow terminals: no phone sheet or tray. The rule for every overlay is: a Drawer goes full screen when it does not
// fit (Drawer.term); a Popover, Menu or Tooltip stays anchored and is clamped inside the screen.
// Not here: `anchor` (a DOM element ref: the terminal places against the trigger), `phone="sheet"` (see the narrow
// rule), className.
import { focusInk } from '../../term/prim/FocusInk';
import { isValidElement, useState, type ReactNode } from 'react';
import type * as Web from './Popover';
import { useStrings } from '../strings';
import strings from './strings.en.json';
import { Box, Pressable, Scroll, Text } from '../../term/prim';
import { Layer, useAnchor, useFocusWithin, useLayer } from '../../term/prim/Overlay';
import { sideOf, withPress } from './trigger';

export type { PopoverProps, PopoverWidth, SheetProps, TooltipProps } from './Popover';

/** Popover widths in columns (the web's px at 8 px a column). */
const WIDTH: Readonly<Record<Web.PopoverWidth, number>> = { sm: 35, md: 40, lg: 45, picker: 55, wide: 80, browse: 115, bell: 50 };

/** The panel's content, no taller than the room the layer can get: past it the content scrolls, following the focus
 *  (the web panel's `max-height` + `overflow: auto`). Was: the content kept its own height inside the clipped panel, so
 *  the end of a long list (30 realms at 80x24) was cut off and no key reached it. */
function PopBody({ children }: { children: ReactNode }) {
  const room = useLayer()?.room;
  return <Scroll followFocus {...(room !== undefined ? { maxHeight: room } : {})}>{children}</Scroll>;
}

export const Popover: typeof Web.Popover = ({ trigger, label, title, placement = 'bottom start', width = 'md', flush, isOpen, onOpenChange, children }) => {
  const [own, setOwn] = useState(false);
  const open = isOpen ?? own;
  const setOpen = (o: boolean) => {
    if (isOpen === undefined) setOwn(o);
    onOpenChange?.(o);
  };
  const close = () => setOpen(false);
  const anchor = useAnchor();
  const { side, align } = sideOf(placement);
  // A trigger that can give way (a picker field whose name cuts with "…": `hxGivesWay`) lets its anchor shrink with the
  // row, as the web's flex item does; any other trigger (a button) keeps its whole width (ComputerPicker.room.term.test).
  const givesWay = isValidElement(trigger) && (trigger.type as { hxGivesWay?: boolean }).hxGivesWay === true;
  return (
    <>
      <Box boxRef={anchor.ref} dir="row" shrink={givesWay ? 1 : 0} minWidth={givesWay ? 0 : undefined}>{withPress(trigger, () => setOpen(!open))}</Box>
      <Layer
        open={open}
        kind="popover"
        place={{ at: 'anchor', anchor: anchor.rect, side, align, width: WIDTH[width], gap: 0 }}
        frameTitle={title ?? label}
        sem={{ role: 'dialog', name: label }}
        initialFocus="first"
        padX={flush ? 0 : 1}
        onEscape={close}
        onOutside={close}
      >
        <PopBody>{typeof children === 'function' ? children(close) : children}</PopBody>
      </Layer>
    </>
  );
};

export const Sheet: typeof Web.Sheet = ({ isOpen, onOpenChange, title, actions, footer, children }) => {
  const t = useStrings(strings);
  const close = () => onOpenChange(false);
  return (
    <Layer open={isOpen} kind="modal" place={{ at: 'full' }} frame="none" sem={{ role: 'dialog', name: title }} initialFocus="first" padX={1} onEscape={close} onOutside={close}>
      <Box dir="row" gap={1} border={['bottom']} borderColour="line">
        <Pressable dir="row" shrink={0} onPress={close} sem={{ name: t('close') }}>
          {({ focused }) => <Text colour="muted" {...focusInk(focused)}>‹ {t('close')}</Text>}
        </Pressable>
        <Text bold grow={1} truncate>{title}</Text>
        {actions}
      </Box>
      <Scroll followFocus grow={1} shrink={1}>{typeof children === 'function' ? children(close) : children}</Scroll>
      {footer ? <Box dir="row" gap={2} border={['top']} borderColour="line">{footer}</Box> : null}
    </Layer>
  );
};

export const Tooltip: typeof Web.Tooltip = ({ children, content, lines, shortcut, placement = 'top', isDisabled }) => {
  const [hover, setHover] = useState(false);
  const [focusIn, setFocusIn] = useState(false);
  const [muted, setMuted] = useState(false);
  const anchor = useAnchor();
  useFocusWithin(anchor.ref, (inside) => { setFocusIn(inside); if (!inside) setMuted(false); });
  const show = (hover || (focusIn && !muted)) && !isDisabled;
  // More lines under the first, one fact each; empty ones are left out.
  const more = (lines ?? []).filter((line) => line !== '');
  const width = Math.min(40, Math.max(content.length + (shortcut ? shortcut.length + 3 : 0), ...more.map((line) => line.length)) + 4);
  return (
    <>
      <Box boxRef={anchor.ref} dir="row" shrink={0} raw={{ onMouseOver: () => setHover(true), onMouseOut: () => setHover(false) }}>
        {children}
      </Box>
      <Layer open={show} kind="tip" sem={{ role: 'tooltip', name: content }} place={{ at: 'anchor', anchor: anchor.rect, side: placement, align: 'start', width }} padX={1} onEscape={() => { setHover(false); setMuted(true); }}>
        <Box dir="row" gap={2}>
          <Text grow={1}>{content}</Text>
          {shortcut ? <Text colour="muted">{shortcut}</Text> : null}
        </Box>
        {more.map((line, i) => <Text key={i} colour="muted">{line}</Text>)}
      </Layer>
    </>
  );
};
