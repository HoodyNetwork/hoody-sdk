// Popover, Sheet and Tooltip.
//   Popover: a non-modal panel anchored to its trigger, for help, a picker or a short list. Use ActionMenu instead for
//     actions, InfoTip for one or two sentences about a label, Dialog for a decision. Never past the screen; as tall
//     as the room on its side of the trigger (React Aria measures it), flips to stay on screen. `phone="sheet"` turns
//     it into a full-screen Sheet below 600 px (pickers, the bell); help popovers stay popovers.
//   Sheet: the phone full-screen surface: a head bar with ‹ (close) and the title, a scrolling body, an optional
//     sticky footer. Use Drawer instead when the surface also exists on a desktop. Like Dialog and Drawer it is counted
//     by the overlay stack, closes on a context end and gives focus back (the page title when its invoker is gone). It
//     sits at the drawer layer, so a Dialog opens over it; one opened while a Dialog is open sits above that Dialog.
//   Tooltip: a control's name or shortcut on hover or keyboard focus, with optional extra lines (one fact each).
//     IconButton has its own; use InfoTip instead for an explanation a touch user must reach.
import { type ReactElement, type ReactNode, type RefObject, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  Dialog as AriaDialog,
  DialogTrigger,
  Heading,
  Modal,
  ModalOverlay,
  Popover as AriaPopover,
  Tooltip as AriaTooltip,
  TooltipTrigger,
} from 'react-aria-components';
import { IconButton, cx } from '../controls/Button';
import { Kbd } from '../controls/Kbd';
import { CardScopeReset } from '../layouts/CardEdge';
import { useStrings } from '../strings';
import { OverlayClosedNotice, openCount, useCloseOnContextEnd, useFocusReturn, useIsPhone, useOverlayStack } from './shared';
import strings from './strings.en.json';
import btn from '../controls/Button.module.css';
import footRow from './footRow.module.css';
import s from './Popover.module.css';

export type PopoverWidth = 'sm' | 'md' | 'lg' | 'picker' | 'wide' | 'browse' | 'bell';

export interface PopoverProps {
  /** The pressable that opens it (a kit Button or IconButton). */
  trigger: ReactElement;
  /** Accessible name of the popover dialog. */
  label: string;
  title?: string;
  placement?: 'bottom start' | 'bottom end' | 'bottom' | 'top' | 'top start' | 'top end' | 'start' | 'end';
  /** sm 280, md 320 (default), lg 360, picker 440, wide 640, browse 920, bell 400; never past the screen. */
  width?: PopoverWidth;
  /** Below 600 px: stay a popover (help) or become a full-screen sheet (pickers, the bell). */
  phone?: 'popover' | 'sheet';
  /** Body without padding (lists that run edge to edge). */
  flush?: boolean;
  /** Controlled open state. */
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Content, or a function getting `close` (a picker closes after a choice). */
  children: ReactNode | ((close: () => void) => ReactNode);
  className?: string;
  /** The element the popover is placed against, in place of the trigger (an empty Board slot's body, while its own Add
   *  hides). The trigger still opens it and gets focus back. Unset: placed against the trigger. Not used for the
   *  phone sheet. */
  anchor?: RefObject<Element | null>;
}

export function Popover({ trigger, label, title, placement = 'bottom start', width = 'md', phone = 'popover', flush, isOpen, onOpenChange, children, className, anchor }: PopoverProps) {
  const isPhone = useIsPhone();
  // Held here when the caller does not control it: the phone sheet needs the open state for the overlay plumbing.
  const [ownOpen, setOwnOpen] = useState(false);
  // While the caller controls it, the held state follows the caller's: a caller that lets go later leaves the popover
  // as it was shown last, never as it was before the caller took over.
  if (isOpen !== undefined && ownOpen !== isOpen) setOwnOpen(isOpen);
  const open = isOpen ?? ownOpen;
  const setOpen = (next: boolean) => {
    if (isOpen === undefined) setOwnOpen(next);
    onOpenChange?.(next);
  };
  const content = (close: () => void) => (typeof children === 'function' ? children(close) : children);
  if (isPhone && phone === 'sheet') {
    return (
      <DialogTrigger isOpen={open} onOpenChange={setOpen}>
        {trigger}
        <SheetFrame title={title ?? label} isOpen={open} onOpenChange={setOpen}>
          {(close) => content(close)}
        </SheetFrame>
      </DialogTrigger>
    );
  }
  return (
    <DialogTrigger isOpen={open} onOpenChange={setOpen}>
      {trigger}
      <AriaPopover placement={placement} offset={8} className={cx(s.popover, s[width], className)} {...(anchor ? { triggerRef: anchor } : {})}>
        <AriaDialog className={cx(s.dialog, flush && s.flush)} aria-label={label}>
          {({ close }) => (
            <>
              {title && (
                <Heading slot="title" className={s.title}>
                  {title}
                </Heading>
              )}
              <CardScopeReset>{content(close)}</CardScopeReset>
            </>
          )}
        </AriaDialog>
      </AriaPopover>
    </DialogTrigger>
  );
}

// ── Sheet ───────────────────────────────────────────────────────────────────────────

export interface SheetProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Header actions right of the title. */
  actions?: ReactNode;
  /** Sticky footer (actions within thumb reach). */
  footer?: ReactNode;
  /** The overlay's name: `data-hub-overlay` on the open sheet's dialog element (see DialogProps.overlayId). */
  overlayId?: string;
  children: ReactNode | ((close: () => void) => ReactNode);
}

/** A full-screen phone sheet (context switcher, Filters, pickers). Esc and ‹ close it. */
export function Sheet({ isOpen, onOpenChange, title, actions, footer, overlayId, children }: SheetProps) {
  return (
    <SheetFrame title={title} actions={actions} footer={footer} overlayId={overlayId} isOpen={isOpen} onOpenChange={onOpenChange}>
      {children}
    </SheetFrame>
  );
}

interface SheetFrameProps {
  title: string;
  actions?: ReactNode;
  footer?: ReactNode;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  overlayId?: string;
  children: ReactNode | ((close: () => void) => ReactNode);
}

function SheetFrame({ title, actions, footer, overlayId, isOpen, onOpenChange, children }: SheetFrameProps) {
  const t = useStrings(strings);
  useOverlayStack('sheet', isOpen);
  useFocusReturn(isOpen);
  useCloseOnContextEnd(isOpen, () => onOpenChange(false));
  // Judged once as it opens: a sheet opened while a Dialog is open is drawn above it (the Dialog's layer). A Dialog
  // that opens in the same commit registers itself in an effect, after this render, so the count is read again once
  // that commit's effects have all run. A Dialog opened later is drawn above the sheet and changes nothing here.
  const openedOver = useRef(false);
  const was = useRef(false);
  if (isOpen && !was.current) openedOver.current = openCount('dialog') > 0;
  was.current = isOpen;
  const [foundLate, setFoundLate] = useState(false);
  useEffect(() => {
    if (!isOpen) {
      setFoundLate(false);
      return;
    }
    let alive = true;
    queueMicrotask(() => {
      if (alive && openCount('dialog') > 0) setFoundLate(true);
    });
    return () => {
      alive = false;
    };
  }, [isOpen]);
  const overDialog = openedOver.current || foundLate;
  return (
    <ModalOverlay isOpen={isOpen} onOpenChange={onOpenChange} isDismissable className={s.sheetScrim} data-over-dialog={overDialog ? '' : undefined}>
      <Modal className={s.sheet}>
        <OverlayClosedNotice />
        <AriaDialog className={s.sheetDialog} data-hub-overlay={overlayId} aria-label={title}>
          {({ close }) => (
            // The whole sheet is the new surface: its actions and footer as well as its body.
            <CardScopeReset>
              <header className={s.sheetHead}>
                <IconButton icon="arrow-left" label={t('close')} shortcut="Esc" onPress={close} />
                <Heading slot="title" className={s.sheetTitle}>
                  {title}
                </Heading>
                {actions}
              </header>
              <div className={s.sheetBody}>{typeof children === 'function' ? children(close) : children}</div>
              {footer && <footer className={cx(s.sheetFoot, footRow.row)}>{footer}</footer>}
            </CardScopeReset>
          )}
        </AriaDialog>
      </Modal>
    </ModalOverlay>
  );
}

// ── Tooltip ─────────────────────────────────────────────────────────────────────────

export interface TooltipProps {
  /** A focusable React Aria element: a kit Button or Link, or a React Aria Link (a nav row). IconButton already has its
   *  own tooltip. */
  children: ReactElement;
  /** The tip's first line: the name, or the one sentence. */
  content: string;
  /** More lines under `content`, one fact each (a place, a state, a count sentence), read top to bottom; empty lines
   *  are left out. The tip then draws as IconButton's stacked tip. */
  lines?: readonly string[];
  shortcut?: string;
  placement?: 'top' | 'bottom' | 'start' | 'end';
  /** The tip does not show; the trigger is left as it is (keep the wrapper mounted so the trigger keeps its element). */
  isDisabled?: boolean;
  /** Names for tests and the shell (`data-hub-…`), set on the tooltip element. */
  [data: `data-${string}`]: string | undefined;
}

export function Tooltip({ children, content, lines, shortcut, placement = 'top', isDisabled, ...data }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const more = (lines ?? []).filter((line) => line !== '');
  // Turned off, the tip forgets that it was open, so turning it back on never shows it again without a new hover or
  // focus.
  useEffect(() => {
    if (isDisabled) setOpen(false);
  }, [isDisabled]);
  // React Aria's open tooltip stops every Escape (a document capture listener), which inside a drawer or dialog would
  // swallow the Escape meant for the overlay (as IconButton's useTooltipEscape): an Escape aimed inside an overlay
  // closes the tooltip first, synchronously, so the overlay closes on the same press.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && e.target instanceof Element && e.target.closest('[role="dialog"], [role="alertdialog"]')) flushSync(() => setOpen(false));
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);
  return (
    <TooltipTrigger delay={400} closeDelay={0} isOpen={open && !isDisabled} onOpenChange={setOpen} isDisabled={isDisabled}>
      {children}
      <AriaTooltip placement={placement} offset={6} className={btn.tooltip} {...data}>
        {more.length > 0 ? (
          <span className={btn.tipStack}>
            <span>{content}</span>
            {more.map((line, i) => (
              <span key={i}>{line}</span>
            ))}
          </span>
        ) : (
          content
        )}
        {shortcut && <Kbd>{shortcut}</Kbd>}
      </AriaTooltip>
    </TooltipTrigger>
  );
}
