// Dialog, ConfirmDialog, DangerConfirm: the centred modal for a confirm, a typed confirm, or one short decision with at
// most 3 fields (rename, a 2FA code). Use Drawer instead to create or edit an object, Popover for help or a picker.
// Sizes `sm`, `lg`, and `xl` for code or a table only; on phones it keeps its place and width (never a bottom sheet).
//   - Focus on open: the first field when there is one, else Cancel, so a destructive action is never the default; a
//     confirm or a danger dialog opens only on a text field, never on a tick box or a choice.
//   - Enter in a one-line text field presses the primary, except in a danger dialog, which only its own button confirms.
//   - Unknown outcome: a `pending` outcome locks the primary and offers Check again; closing the dialog then moves it to
//     the sticky toast (the shell stays silent while the dialog shows it), and a dialog whose Check again is reading
//     cannot be dismissed.
//   - A disabled primary that says why (`primaryDisabledReason`, ConfirmDialog `confirmDisabledReason`) is the kit
//     Button's soft-disabled state: it stays focusable, never presses, and its reason is its description and tooltip.
//   - The close x in the header makes the same close request as Cancel, so it closes, refuses or keeps a pending
//     outcome exactly as Cancel would; a forced single action (`hideCancel`) has neither.
//   - The header and the footer stay put and only the body between them scrolls, with a hairline under the header while
//     it is scrolled. All dialog text can be selected with the mouse.
// Read by the focus logic below and by tests: `data-dialog-cancel`, `data-dialog-primary`, `data-dialog-close`,
// `data-dialog-body`, `data-dialog-outcome`, and the native `disabled` attribute of the footer buttons (a primary
// disabled with a reason has `aria-disabled` instead).
import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { Dialog as AriaDialog, Heading, Input, Label, Modal, ModalOverlay, TextField as AriaTextField } from 'react-aria-components';
import { Button, IconButton, cx, type ButtonLook, type ChipVariant } from '../controls/Button';
import { Icon } from '../icons';
import type { OutcomeLike } from '../outcome';
import { type CheckFn, Outcome, useCheck, usePendingToast } from '../forms/Outcome';
import { CardScopeReset } from '../layouts/CardEdge';
import { FaqLink, type FaqItem } from '../layouts/Faq';
import { useStrings } from '../strings';
import { OverlayClosedNotice, useCloseOnContextEnd, useFocusReturn, useOverlayStack, useScrollReach } from './shared';
import strings from './strings.en.json';
import s from './Dialog.module.css';
import footRow from './footRow.module.css';

/** A FAQ answer the dialog points at: the kit renders `<FaqLink item={item}>{label}</FaqLink>` after the body. Pressing it inside the
 *  dialog opens the answer in a peek (the dialog stays open); the explanation itself lives in the page's FAQ, not in `body`. */
export interface DialogFaq {
  item: FaqItem;
  label: string;
}

/** A pending outcome's recovery actions: nodes, or a function given the id of the outcome's detail sentence. */
export type OutcomeActions = ReactNode | ((ids: { detailId: string | undefined }) => ReactNode);

export interface DialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** A small mark shown before the visible title (the computer's colour mark). Decoration beside the name: the dialog's
   * accessible name stays the plain `title` string, so the mark must be aria-hidden and carry no text of its own. */
  titleMark?: ReactNode;
  /** The consequence, one or two sentences (put the object name in mono). */
  body?: ReactNode;
  /** Up to 3 fields, or extra content under the body. */
  children?: ReactNode;
  /** `sm` 480 (confirm), `lg` 560 (typed confirm, a decision with fields), `xl` 800 (holds code or a table, and only then:
   * app/conformance.dialogsize.test.ts). */
  size?: 'sm' | 'lg' | 'xl';
  /** `danger` adds the warning mark and styles the primary as destructive. */
  tone?: 'default' | 'danger';
  /** The primary action's label ("Rename", "Restart it"). No label → no primary button. */
  primaryLabel?: string;
  onPrimary?: () => void;
  primaryDisabled?: boolean;
  /** Why the primary cannot act yet ("Name the branch first."). Only read with `primaryDisabled`: the primary is then
   *  soft-disabled as a kit Button with `disabledReason` is (focusable, aria-disabled, no press, the reason its
   *  description and tooltip). While sending or with a `pending` outcome the primary is locked as before, with no reason. */
  primaryDisabledReason?: string;
  /** The primary's tone: the dialog's `tone` when unset (and `default` when `primaryVariant` is set). A danger primary is
   *  the grey plate in the danger ink; with `primaryVariant="primary"` it is marked as the armed confirm (DangerConfirm). */
  primaryTone?: 'default' | 'danger';
  /** Override the primary's variant: `secondary` for a primary that is a Cancel (Files upload while running). For a
   *  destructive primary use `primaryTone="danger"`, never a variant. */
  primaryVariant?: ChipVariant;
  /** `false` when the primary action is a Cancel (Files upload while running): no end glyph, as on every Cancel. */
  primaryChip?: boolean;
  cancelLabel?: string;
  /** One forced action ("Sign in again"): no Cancel. Pair with `isDismissable={false}`. */
  hideCancel?: boolean;
  /** `false`: Esc and the scrim do nothing; only the buttons close it. */
  isDismissable?: boolean;
  /** The action is in flight: buttons and dismissal wait. */
  busy?: boolean;
  /** The last outcome (core). `done` closes the dialog; `pending` locks the primary (C9). */
  outcome?: OutcomeLike;
  /** Rich text in place of the outcome's `message` (a sentence with marks or links). Pass it only with the outcome
   *  kind it was written for: like `message`, it is shown on that outcome's line. */
  outcomeDetail?: ReactNode;
  /** With a `pending` outcome only: the page's recovery actions on the dialog's own outcome, after Check again (a warned
   *  Stop tracking). Its warning sentence goes in `outcomeDetail`; the function form gets that sentence's id, for the
   *  action's aria-describedby. */
  outcomeActions?: OutcomeActions;
  /** With `outcomeActions`: a polite live line after them (what an action did: "Nothing was dismissed"), present and
   *  empty while null so its words are announced when they arrive. */
  outcomeNote?: ReactNode;
  /** Announce the outcome line at once (role alert) whatever its kind, for a reason the person must hear in the dialog
   *  (a `not_sent` one). It only raises: a pending or failed line is an alert already. */
  outcomeAlert?: boolean;
  /** With a `pending` outcome: read the current state back (never resends). A check that returns a promise
   *  is tracked here (the dialog cannot be closed while it reads) unless the page passes `checking`. */
  onCheck?: CheckFn;
  checking?: boolean;
  /** Where focus goes on open. Default: the first field, else Cancel, else the primary. A confirm (alertdialog) or a danger
   *  dialog never opens on its primary, whatever this asks: `cancel` opens on Cancel, anything else on a text field (never a
   *  tick box, a radio or a select), else Cancel; with no such target, on the dialog itself. */
  initialFocus?: 'field' | 'cancel' | 'primary';
  /** Focus target on close when the invoker is gone. Default: the page title. */
  returnFocus?: () => HTMLElement | null | undefined;
  /** Focus target on close that wins over the invoker, as Drawer's: a programmatic target (tabindex="-1"), focused without
   *  a scroll. null: the usual return. */
  closeFocus?: () => HTMLElement | null | undefined;
  /** `alertdialog` for confirms (ConfirmDialog sets it). */
  role?: 'dialog' | 'alertdialog';
  className?: string;
  /** Where the overlay is portalled (default: document.body). The passcode lock screen passes its own host, so its
   *  confirm stays visible and operable while every other body child is hidden and inert. */
  portalContainer?: Element;
  /** The overlay's name, written as `data-hub-overlay` on the open dialog element, so it is present only while the
   *  dialog is open (the layout guard reads it; no two overlays of a page share one). */
  overlayId?: string;
  /** A short link to the page FAQ's answer, after the body (and the consequences of a confirm). */
  faq?: DialogFaq;
  /** More ids of text that describes the dialog, read after the body (ConfirmDialog passes its consequences list). */
  describedBy?: string;
}

/** What a press can land on in a dialog that is a control, not text (a press anywhere else, a label's text included,
 *  is on text and may start a selection). */
const DIALOG_CONTROL =
  'button, a[href], input, textarea, select, [contenteditable]:not([contenteditable="false"]), [tabindex]:not([tabindex="-1"]), [role="button"], [role="link"], [role="checkbox"], [role="switch"], [role="radio"], [role="slider"], [role="menuitem"], [role="option"], [role="tab"], [role="textbox"], [role="combobox"]';

/** Input types a person does not type text into: a tick box, a radio or a button is never the field Enter confirms from,
 *  and never the field a confirm opens on. */
const NOT_TEXT = ['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'hidden', 'image', 'range', 'color'];
const TEXT_INPUT = `input${NOT_TEXT.map((type) => `:not([type="${type}"])`).join('')}`;
const isTextInput = (el: EventTarget): el is HTMLInputElement => el instanceof HTMLInputElement && !NOT_TEXT.includes(el.type);
/** The field focus opens on (and the rescue's): any field in an ordinary dialog, a text field in a confirm or a danger dialog.
 *  Never a control inside an aria-hidden box in the dialog, out of the Tab order (tabindex="-1") or an <input
 *  type="hidden"> (other ways of hiding, such as CSS, are not checked): React Aria's Select with up to 300 options keeps a
 *  <select tabindex="-1"> in an aria-hidden box for forms and autofill (a larger one keeps hidden inputs), and focus
 *  there would be unseen while arrow keys change the choice. That Select's field is its own button
 *  (aria-haspopup="listbox"), which comes first in its markup. */
const fieldIn = (root: HTMLElement, textOnly: boolean) =>
  [...root.querySelectorAll<HTMLElement>(textOnly ? `[data-dialog-body] :is(${TEXT_INPUT}, textarea):not([disabled])` : '[data-dialog-body] :is(input, textarea, select, button[aria-haspopup="listbox"]):not([disabled])')].find(
    // Hidden inside the dialog only: a menu or a listbox opened over the dialog hides the whole dialog meanwhile.
    (el) => el.tabIndex !== -1 && !root.contains(el.closest('[aria-hidden="true"]')) && !(el instanceof HTMLInputElement && el.type === 'hidden'),
  ) ?? null;

export function Dialog({
  isOpen,
  onOpenChange,
  title,
  titleMark,
  body,
  children,
  size = 'sm',
  tone = 'default',
  primaryLabel,
  onPrimary,
  primaryDisabled,
  primaryDisabledReason,
  primaryTone,
  primaryVariant,
  primaryChip,
  cancelLabel,
  hideCancel,
  isDismissable = true,
  busy = false,
  outcome,
  outcomeDetail,
  outcomeActions,
  outcomeNote,
  outcomeAlert,
  onCheck,
  checking,
  initialFocus,
  returnFocus,
  closeFocus,
  role = 'dialog',
  className,
  portalContainer,
  overlayId,
  faq,
  describedBy,
}: DialogProps) {
  const t = useStrings(strings);
  const panel = useRef<HTMLDivElement>(null);
  const bodyId = useId();
  const detailId = useId();
  // The body's scroll box: the header and the footer stay outside it, so scrolling never takes the title, the close x or
  // the buttons out of view. A body that scrolls with nothing focusable inside takes focus, as a Drawer's does.
  const scroller = useRef<HTMLDivElement>(null);
  const scrollReach = useScrollReach(scroller, isOpen);
  const [scrolled, setScrolled] = useState(false);
  useOverlayStack('dialog', isOpen);
  useFocusReturn(isOpen, returnFocus, closeFocus);
  // A confirm or a danger dialog: focus never opens on, or is rescued onto, a tick box, a choice or the action itself. It
  // opens on a text field, else Cancel (only Cancel when initialFocus is 'cancel'), else the dialog; the rescue tries the
  // outcome, the text field, Cancel, else the dialog.
  const guarded = role === 'alertdialog' || tone === 'danger';
  // Every close the dialog itself asks for (Cancel, Esc, the scrim, a context end) goes through here.
  const [closeAsked, setCloseAsked] = useState(false);
  const requestOpen = (open: boolean) => {
    if (!open) setCloseAsked(true);
    onOpenChange(open);
  };
  useCloseOnContextEnd(isOpen, () => requestOpen(false));
  const [checkBusy, check] = useCheck(onCheck, checking);
  // The leave watch outlives the open dialog by one render, so it sees the outcome of the update that
  // closed it (a page may close the dialog in the same update its Check again proved the change). A page
  // that clears its outcome as it closes: when the person closed it (Cancel on a pending delete, then
  // setDel(null)), the pending outcome they last saw still moves to the toast; when the page closed it
  // itself (it acted on a read that answered), there is nothing left to check.
  const [watching, setWatching] = useState(isOpen);
  if (isOpen && !watching) {
    setWatching(true);
    if (closeAsked) setCloseAsked(false);
    // it opens with its body at the top: no hairline left from its last time
    if (scrolled) setScrolled(false);
  }
  const [openOutcome, setOpenOutcome] = useState(outcome);
  if (isOpen && openOutcome !== outcome) setOpenOutcome(outcome);
  useEffect(() => {
    if (!isOpen) setWatching(false);
  }, [isOpen]);
  const watched = isOpen ? outcome : (outcome ?? (closeAsked ? openOutcome : undefined));
  // The toast's Check again is the last one the person saw while the dialog was open, whatever the page
  // passes once it is closed: a page that drops its onCheck as it closes (setDel(null)), or passes a fresh
  // closure over the cleared state (`if (!del) return false`), would otherwise leave a "may have gone through"
  // toast whose Check again can never prove anything. Kept even when undefined, so a reopen for another item
  // never carries the previous item's check.
  const lastCheck = useRef(onCheck);
  useEffect(() => {
    if (isOpen) lastCheck.current = onCheck;
  }, [isOpen, onCheck]);
  const watchedCheck = isOpen ? onCheck : lastCheck.current;

  const done = outcome?.kind === 'done';
  useEffect(() => {
    if (isOpen && done) onOpenChange(false);
  }, [isOpen, done, onOpenChange]);

  // Initial focus, after React Aria's own (which focuses the dialog itself).
  useEffect(() => {
    if (!isOpen) return;
    const id = window.requestAnimationFrame(() => {
      const root = panel.current;
      if (!root) return;
      const field = fieldIn(root, guarded);
      const cancel = root.querySelector<HTMLElement>('[data-dialog-cancel]');
      const primary = root.querySelector<HTMLElement>('[data-dialog-primary]');
      const order = guarded
        ? initialFocus === 'cancel' ? [cancel] : [field, cancel]
        : initialFocus === 'primary' ? [primary] : initialFocus === 'cancel' ? [cancel, primary] : [field, cancel, primary];
      const target = order.find((el) => el && !el.hasAttribute('disabled'));
      if (target) target.focus();
      else if (guarded) root.closest<HTMLElement>('[role="dialog"], [role="alertdialog"]')?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [isOpen, initialFocus, guarded]);

  // Focus never falls to the page while the dialog is open: when the focused
  // control goes away or is disabled (the body swaps to an outcome, a field locks while sending), focus moves
  // to the outcome (so it is read out), else the first field, the primary, Cancel, or the dialog itself. A confirm or a
  // danger dialog tries its text field, then Cancel, never the primary.
  useEffect(() => {
    if (!isOpen) return;
    const root = panel.current;
    if (!root) return;
    const shell = root.closest<HTMLElement>('[role="dialog"], [role="alertdialog"]');
    // A press on the dialog's text (anything but a control) focuses the dialog itself, and a drag from
    // there selects that text. That focus is the person's own, so the rescue leaves it, whatever changes in
    // the dialog meanwhile (a field that validates on blur adds its error, an outcome shows), until focus
    // goes to something else. The rescue's own parking on the dialog (below) is not such a press.
    let textPress = false;
    const onPointerDown = (e: PointerEvent) => {
      textPress = !(e.target instanceof Element && e.target.closest(DIALOG_CONTROL));
    };
    const onFocusIn = (e: FocusEvent) => {
      if (e.target !== shell) textPress = false;
    };
    let frame = 0;
    const rescue = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const active = document.activeElement;
        // The dialog itself counts as nothing focused: the rescue parks focus there while every control is
        // disabled (sending), and moves it on once something usable shows (the outcome first). Unless the
        // person put it there by pressing on the text.
        if (!root.isConnected || (active && active !== document.body && active !== shell) || (active === shell && textPress)) return;
        const usable = (el: HTMLElement | null) => el && !el.hasAttribute('disabled') && el.getAttribute('aria-disabled') !== 'true';
        const primary = root.querySelector<HTMLElement>('[data-dialog-primary]');
        const cancel = root.querySelector<HTMLElement>('[data-dialog-cancel]');
        const order = [root.querySelector<HTMLElement>('[data-dialog-outcome]'), fieldIn(root, guarded), ...(guarded ? [cancel] : [primary, cancel])];
        const next = order.find(usable) ?? shell;
        if (next && next !== active) next.focus();
      });
    };
    const watch = new MutationObserver(rescue);
    watch.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'aria-disabled'] });
    shell?.addEventListener('pointerdown', onPointerDown, true);
    shell?.addEventListener('focusin', onFocusIn);
    root.addEventListener('focusout', rescue);
    return () => {
      window.cancelAnimationFrame(frame);
      watch.disconnect();
      shell?.removeEventListener('pointerdown', onPointerDown, true);
      shell?.removeEventListener('focusin', onFocusIn);
      root.removeEventListener('focusout', rescue);
    };
  }, [isOpen, guarded]);

  const locked = outcome?.kind === 'pending';
  const canPrimary = primaryLabel !== undefined && !locked && !primaryDisabled && !busy;
  const press = () => {
    if (canPrimary) onPrimary?.();
  };
  // Enter in a one-line text field presses the primary; never from a tick box, a radio or any other input that is not
  // text, and never in a danger dialog (only its own button confirms it). No <form> of our own: a field inside its own
  // form (the OTP host) submits that form instead, and nested forms are invalid HTML.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const el = e.target;
    if (e.key !== 'Enter' || e.shiftKey || e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
    // Enter that picks an IME candidate (CJK input) is not a confirm.
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (tone === 'danger' || !isTextInput(el) || el.form !== null) return;
    e.preventDefault();
    press();
  };
  const dismissable = isDismissable && !busy && !checkBusy;
  // Escape refused while the dialog sends or checks, or while the page holds it open on a "may have gone
  // through" outcome: an announced line says why, until it can close.
  const maybe = outcome?.kind === 'pending';
  const refused = !dismissable && (busy || checkBusy || maybe);
  const [escHint, setEscHint] = useState(false);
  if (escHint && !refused) setEscHint(false);
  // Any Escape inside this dialog counts, wherever focus sits: on the dialog itself (the rescue parks it
  // there while sending) or on the page behind; React Aria refuses it (isKeyboardDismissDisabled), this
  // only says why. An Escape inside another dialog stacked on top is that dialog's.
  useEffect(() => {
    if (!isOpen || !refused) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const shell = panel.current?.closest('[role="dialog"], [role="alertdialog"]');
      const inDialog = e.target instanceof Element ? e.target.closest('[role="dialog"], [role="alertdialog"]') : null;
      if (inDialog && inDialog !== shell) return;
      setEscHint(true);
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [isOpen, refused]);
  const pTone = primaryTone ?? (primaryVariant === undefined ? tone : 'default');
  const variant: ChipVariant = primaryVariant ?? (pTone === 'danger' ? 'secondary' : 'primary');
  const primaryLook: ButtonLook = pTone === 'danger' ? { variant, tone: 'danger' } : { variant, ...(primaryChip === false ? { chip: false } : {}) };

  return (
    <>
    {(isOpen || watching) && <LeaveWatch outcome={watched} onCheck={watchedCheck} />}
    <ModalOverlay isOpen={isOpen} onOpenChange={requestOpen} isDismissable={dismissable} isKeyboardDismissDisabled={!dismissable} className={cx(s.scrim, size === 'xl' && s.scrimXl)} UNSTABLE_portalContainer={portalContainer}>
      <Modal className={cx(s.modal, size === 'lg' && s.lg, size === 'xl' && s.xl, className)}>
        <OverlayClosedNotice />
        <AriaDialog className={s.dialog} role={role} data-hub-overlay={overlayId} aria-label={title} aria-describedby={[body ? bodyId : '', describedBy ?? ''].filter(Boolean).join(' ') || undefined} aria-busy={busy || undefined}>
          <CardScopeReset>
            {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- Enter-to-confirm for the fields inside */}
            <div ref={panel} className={s.form} onKeyDown={onKeyDown}>
              <div className={s.head} data-dialog-head="" data-scrolled={scrolled ? '' : undefined}>
                {tone === 'danger' && (
                  <div className={s.mark}>
                    <Icon name="warn" />
                  </div>
                )}
                <div className={s.text}>
                  <Heading slot="title" className={s.title}>
                    {titleMark ? (
                      <>
                        <span className={s.titleMark}>{titleMark}</span>
                        <span className={s.titleText}>{title}</span>
                      </>
                    ) : (
                      title
                    )}
                  </Heading>
                </div>
                {/* Cancel's own request (never onOpenChange directly): idle closes, busy or checking refuses, a pending
                    outcome closes and moves to the sticky toast. Never in the initial focus order. */}
                {!hideCancel && (
                  <IconButton
                    icon="x"
                    label={t('close')}
                    {...(dismissable ? { shortcut: 'Esc' } : {})}
                    className={s.close}
                    isDisabled={busy || checkBusy}
                    onPress={() => requestOpen(false)}
                    data-dialog-close=""
                  />
                )}
              </div>
              {/* The one scroll box: the body text, the fields and the outcome. */}
              <div
                ref={scroller}
                className={s.scroll}
                data-dialog-scroll=""
                onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 0)}
                {...(scrollReach ? { tabIndex: 0 } : {})}
              >
                {body && (
                  <div id={bodyId} className={cx(s.body, tone === 'danger' && s.bodyMarked)}>
                    {body}
                  </div>
                )}
                {faq && (
                  <div className={s.faq} data-dialog-faq="">
                    <FaqLink item={faq.item}>{faq.label}</FaqLink>
                  </div>
                )}
                {children && (
                  <div className={s.extra} data-dialog-body="">
                    {children}
                  </div>
                )}
                {outcome && outcome.kind !== 'done' && (
                  <div className={cx(s.extra, s.outcomeSlot)} data-dialog-outcome="" tabIndex={-1}>
                    <Outcome outcome={outcome} variant="block" {...(outcomeAlert ? { alert: true } : {})} {...(outcomeDetail !== undefined ? { detail: <span id={detailId}>{outcomeDetail}</span> } : {})} {...(check ? { onCheck: check } : {})} checking={checkBusy} />
                    {outcome.kind === 'pending' && outcomeActions && (
                      <>
                        <div className={s.outcomeActions} data-dialog-outcome-actions="">
                          {typeof outcomeActions === 'function' ? outcomeActions({ detailId: outcomeDetail !== undefined ? detailId : undefined }) : outcomeActions}
                        </div>
                        <p className={s.outcomeNote} aria-live="polite" data-dialog-outcome-note="">
                          {outcomeNote}
                        </p>
                      </>
                    )}
                  </div>
                )}
              </div>
              <p className={s.escHint} role="status">
                {escHint ? (checkBusy ? t('checkingHint') : busy ? t('busyHint') : maybe ? t('pendingHint') : '') : ''}
              </p>
              <div className={cx(s.buttons, footRow.row)}>
                {!hideCancel && (
                  <Button chip={false} variant="secondary" isDisabled={busy || checkBusy} onPress={() => requestOpen(false)} data-dialog-cancel="">
                    {cancelLabel ?? t('cancel')}
                  </Button>
                )}
                {primaryLabel !== undefined && (
                  <Button {...primaryLook} busy={busy} isDisabled={locked || primaryDisabled} disabledReason={locked ? undefined : primaryDisabledReason} onPress={press} data-dialog-primary="">
                    {primaryLabel}
                  </Button>
                )}
              </div>
            </div>
          </CardScopeReset>
        </AriaDialog>
      </Modal>
    </ModalOverlay>
    </>
  );
}

/** Mounted while the dialog is open (and for the render that closes it): when it goes with the outcome
 * still `pending`, the outcome moves to the sticky toast with the same Check again; an outcome that left
 * pending first (Check again proved it, a reset) leaves nothing. */
function LeaveWatch({ outcome, onCheck }: { outcome: OutcomeLike | undefined; onCheck: CheckFn | undefined }) {
  usePendingToast(outcome ?? null, onCheck);
  return null;
}

// ── ConfirmDialog / DangerConfirm ───────────────────────────────────────────────────

export interface ConfirmDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** See DialogProps.titleMark. */
  titleMark?: ReactNode;
  body?: ReactNode;
  /** Label of the confirm button, e.g. "Restart". Defaults to "Confirm". */
  confirmLabel?: string;
  tone?: 'default' | 'danger';
  /** Run the action. The dialog stays open while it runs and closes when the outcome is `done`. */
  onConfirm: () => void;
  /** The action is in flight. */
  busy?: boolean;
  /** The last outcome of the action (from core). `pending` locks the confirm button (C9). */
  outcome?: OutcomeLike;
  /** See DialogProps.outcomeAlert. */
  outcomeAlert?: boolean;
  /** See DialogProps.outcomeDetail. */
  outcomeDetail?: ReactNode;
  /** See DialogProps.outcomeActions. */
  outcomeActions?: OutcomeActions;
  /** See DialogProps.outcomeNote. */
  outcomeNote?: ReactNode;
  /** Shown with a `pending` outcome: read the current state back; resolve `true` only when the read proved it. */
  onCheck?: CheckFn;
  checking?: boolean;
  /** Extra content between body and buttons (DangerConfirm uses it). */
  children?: ReactNode;
  /** Disable the confirm button (e.g. until the person typed the name). */
  confirmDisabled?: boolean;
  /** Why the confirm button cannot act yet. Only read with `confirmDisabled`; see DialogProps.primaryDisabledReason. */
  confirmDisabledReason?: string;
  /** DangerConfirm: the armed button turns solid danger; the dialog is the wide (560) size. */
  typed?: boolean;
  /** One forced action: no Cancel (pair with `isDismissable={false}`). */
  hideCancel?: boolean;
  isDismissable?: boolean;
  cancelLabel?: string;
  returnFocus?: () => HTMLElement | null | undefined;
  /** See DialogProps.closeFocus. */
  closeFocus?: () => HTMLElement | null | undefined;
  /** See DialogProps.portalContainer. */
  portalContainer?: Element;
  /** See DialogProps.overlayId (DangerConfirm passes it on too). */
  overlayId?: string;
  /** What will happen, one line each ("Every file on the disk is erased."): a bulleted list under the body, read with it
   *  as the dialog's description. */
  consequences?: readonly string[];
  /** See DialogProps.faq. */
  faq?: DialogFaq;
}

/**
 * A confirm (alertdialog). Cancel takes focus for a plain confirm; the action is never the default.
 * Which confirm:
 * - Delete or end something (a key, a session, a schedule): `tone="danger"`, a plain confirm.
 * - Delete a Bot, a computer or the account: DangerConfirm (type the name). Nothing else asks for typing.
 * - Restart, stop or reset: the default tone; the action is the dialog's one accent primary.
 */
export function ConfirmDialog({ confirmLabel, onConfirm, confirmDisabled, confirmDisabledReason, typed, tone = 'default', consequences, children, ...rest }: ConfirmDialogProps) {
  const t = useStrings(strings);
  const rows = consequences && consequences.length > 0 ? consequences : null;
  const rowsId = useId();
  return (
    <Dialog
      {...rest}
      {...(rows ? { describedBy: rowsId } : {})}
      role="alertdialog"
      tone={tone}
      size={typed ? 'lg' : 'sm'}
      primaryLabel={confirmLabel ?? t('confirm')}
      onPrimary={onConfirm}
      primaryDisabled={confirmDisabled}
      primaryDisabledReason={confirmDisabledReason}
      primaryTone={tone}
      // A danger confirm is marked armed (data-variant dangerSolid) once its typed name matches; a default one is the accent primary.
      primaryVariant={tone === 'danger' && !(typed && !confirmDisabled) ? 'secondary' : 'primary'}
      // A field when the confirm has one (rename, typed name), else Cancel: never the action.
      initialFocus={typed ? 'field' : undefined}
    >
      {/* No children and no consequences: nothing at all, so the dialog draws no empty extra block. */}
      {rows || children ? (
        <>
          {rows && (
            <ul id={rowsId} className={s.consequences}>
              {/* A fixed list, never reordered: its place is its key (two lines may read the same). */}
              {rows.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          )}
          {children}
        </>
      ) : undefined}
    </Dialog>
  );
}

export interface DangerConfirmProps extends Omit<ConfirmDialogProps, 'tone' | 'confirmDisabled' | 'confirmDisabledReason' | 'children' | 'typed'> {
  /** The text the person must type to arm the button (usually the resource's name). */
  confirmText: string;
}

/** A destructive confirm: the button arms only after the person types `confirmText` exactly (spaces around either are
 *  ignored; an empty one never arms). Enter never confirms it: only its button does. */
export function DangerConfirm({ confirmText, consequences, isOpen, ...rest }: DangerConfirmProps) {
  const t = useStrings(strings);
  const want = confirmText.trim();
  const [typed, setTyped] = useState('');
  useEffect(() => {
    if (!isOpen) setTyped('');
  }, [isOpen]);
  return (
    <ConfirmDialog {...rest} isOpen={isOpen} tone="danger" typed consequences={consequences} confirmDisabled={want === '' || typed.trim() !== want}>
      <AriaTextField value={typed} onChange={setTyped} className={s.typeField} autoComplete="off" spellCheck="false">
        <Label className={s.typeLabel}>{t('typeToConfirm', { text: want })}</Label>
        <Input className={s.typeInput} />
      </AriaTextField>
    </ConfirmDialog>
  );
}
