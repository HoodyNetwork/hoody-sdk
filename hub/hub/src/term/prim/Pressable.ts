// Pressable: something a click or Enter/Space activates. It takes the focus on a click.
import { createElement, useContext, useMemo, type ReactElement, type ReactNode } from 'react';
import { Box, type BoxProps } from './Box';
import { isPressKey, useFocusChange, useFocusable, type Focusable, type KeyHandler } from './focus';
import { mergeRefs, useSem } from './semantics';
import { FocusInkCtx, focusInk } from './FocusInk';
import { useHover, type Hover } from './Hover';

export interface PressableProps extends Omit<BoxProps, 'onPress' | 'boxRef' | 'children'> {
  /** A press: `at` is the cell clicked when the mouse pressed it, absent for Enter / Space. */
  onPress?: (at?: { x: number; y: number }) => void;
  disabled?: boolean;
  /** false: reachable by a click or focus(), skipped by Tab (tabIndex -1). */
  tabStop?: boolean;
  /** Called when the focus arrives (true) or leaves (false). */
  onFocusChange?: (focused: boolean) => void;
  /** Receives the focus handle (the compat runtime's element refs focus and blur through it). */
  handle?: { current: Focusable | null };
  /** Keys beyond Enter and Space. */
  onKey?: KeyHandler;
  /** Take the focus when nothing has it (the first control of a screen). */
  autoFocus?: boolean;
  /** The web element's id: FocusControl.focusDomId(id) focuses this control. */
  domId?: string;
  /** With a render function child: while focused the box itself still takes the focus background, so the whole control
   *  is filled, not only the cells its words cover (a raw DOM button drew a ragged fill, one strip per line). */
  focusFill?: boolean;
  /** The box stands on the `hover` ground while the pointer is on the control and it is neither focused nor disabled
   *  (Hover.ts): for a control whose words stand on no plate of their own (a row of a rail, a tab). With plain children
   *  this is also what makes the control take the pointer handlers. */
  hoverFill?: boolean;
  /** `hovered`: the pointer is on this control and it is neither focused nor disabled (Hover.ts): a render function
   *  may draw the `hover` ground under itself, and nothing else. */
  children?: ReactNode | ((state: { focused: boolean; hovered: boolean }) => ReactNode);
  /** Default true for plain children: while focused the box and its words take the focus ink (FocusInk). A render
   *  function child paints its own focus and gets none. */
  focusPaint?: boolean;
}

/** The box's own raw options with the hover handlers; a caller's own onMouseMove / onMouseOut / onMouseOver still runs. */
function withHover(own: BoxProps['raw'], h: Hover['raw']): Record<string, unknown> {
  const chain = (name: 'onMouseMove' | 'onMouseOut' | 'onMouseOver') => {
    const theirs = own?.[name];
    return typeof theirs === 'function' ? (e: unknown) => { h[name](); (theirs as (e: unknown) => void)(e); } : h[name];
  };
  return { ...own, onMouseMove: chain('onMouseMove'), onMouseOut: chain('onMouseOut'), onMouseOver: chain('onMouseOver') };
}

export function Pressable({ onPress, disabled, onKey, autoFocus, handle, tabStop, onFocusChange, sem, children, focusPaint, focusFill, hoverFill, domId, ...box }: PressableProps): ReactElement {
  const f = useFocusable({
    disabled,
    auto: autoFocus,
    tabStop,
    domId,
    onKey: (k) => {
      // A key a pressable takes never also reaches an engine field that still holds engine focus.
      if (isPressKey(k)) { k.preventDefault?.(); onPress?.(); return true; }
      if (onKey?.(k) === true) { k.preventDefault?.(); return true; }
      return false;
    },
  });
  if (handle) handle.current = f;
  useFocusChange(f.focused, onFocusChange);
  const semRef = useSem(sem, { role: 'button', disabled, focus: f });
  const ref = useMemo(() => mergeRefs(f.ref, semRef), [f.ref, semRef]);
  // The focus ink this control is already inside: passed on unchanged while it is not the focused one.
  const outerInk = useContext(FocusInkCtx);
  const paint = f.focused && typeof children !== 'function' && focusPaint !== false;
  const ink = focusInk(paint);
  const fill = paint || (f.focused && focusFill === true);
  // Hover is asked by a render function (it draws its own states) or with `hoverFill`; other controls take no pointer
  // handlers.
  const asksHover = typeof children === 'function' || hoverFill === true;
  const hover = useHover(disabled || !asksHover);
  const hovered = hover.hovered && !f.focused;
  return createElement(Box, {
    ...box,
    ...(asksHover && !disabled ? { raw: withHover(box.raw, hover.raw) } : {}),
    boxRef: ref as never,
    // Always a pressable box, so a press on a disabled control is consumed (as the DOM dispatches no click for a
    // disabled button: the row around it does not fire either); it just does nothing.
    onPress: (e) => { if (disabled) return; f.focus(); onPress?.({ x: e.x, y: e.y }); },
    ...(fill ? { bg: focusInk(true).bg ?? box.bg } : hoverFill === true && hovered ? { bg: 'hover' as const } : {}),
    // The provider is there focused or not (only its value changes): present only while focused, it changed the element
    // type at this position and React remounted the children on every focus and blur (their state was reset).
    children: typeof children === 'function' ? children({ focused: f.focused, hovered }) : focusPaint !== false ? createElement(FocusInkCtx.Provider, { value: paint ? ink : outerInk }, children) : children,
  });
}
