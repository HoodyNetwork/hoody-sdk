// Dialogs in the terminal, on prim/Overlay's modal layer: a double-framed panel centred a fifth down
// (an `xl` one higher), over a dimmed page (a shaded one in mono). Widths: sm 60, lg 70, xl 100 columns (480/560/800 px
// at 8 px a column), never past the screen. The header (warning mark, title, close ×) and the buttons stay put; the body
// between them scrolls.
//
// The web contract kept: Cancel and × are one close request (closes, or refuses while busy or checking; a pending
// outcome closes and moves to the sticky toast through the same LeaveWatch); Esc and a press on the scrim close only when
// dismissable, and a refused Esc says why on the hint line; `done` closes; `pending` locks the primary and shows Check
// again; a disabled primary that says why (primaryDisabledReason) stays a Tab stop, shows its reason while focused and
// never presses; Enter in a one-line text field presses the primary except in a danger dialog (with no primary the field
// keeps it); initial focus is the first field,
// else Cancel, else the primary (initialFocus picks), and a confirm or a danger dialog opens on its typed field, else
// Cancel, never on the action. The close × never takes the initial focus.
//
// Not here (no terminal meaning): returnFocus / closeFocus (focus goes back to the opener by itself: the page never saw a
// key while the dialog was open), portalContainer, className, overlayId, describedBy, text selection (OP-F), the focus
// rescue onto the outcome when the focused control is disabled (Tab moves on from a disabled control).
// Narrow terminals (the rule for every overlay; no phone sheet or tray): a Drawer goes full screen when it does not fit;
// a Popover, Menu, InfoTip or Tooltip stays anchored and is clamped inside the screen; a Dialog is clamped to the width.
import { focusInk } from '../../term/prim/FocusInk';
import { Fragment, cloneElement, isValidElement, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import type * as Web from './Dialog';
import { Button } from '../controls/Button';
import { FaqLink } from '../layouts/Faq';
import { Outcome, useCheck, usePendingToast, type CheckFn } from '../forms/Outcome';
import type { OutcomeLike } from '../outcome';
import { useStrings } from '../strings';
import { useCloseOnContextEnd, useOverlayStack } from './shared';
import strings from './strings.en.json';
import { Box, PaneSize, Pressable, Scroll, Text, TextInput, Spacer } from '../../term/prim';
import { armReveal, useRevealInDialog } from './termReveal';
import { Layer, useLayer } from '../../term/prim/Overlay';
import { isPlain, pieces } from '../layouts/termParts';
import { Dom } from '../../term/jsx/dom';

/** HTML block tags: a body holding one of them stacks its pieces, as block boxes do on the web. */
const BLOCK_TAGS = new Set(['p', 'div', 'ul', 'ol', 'dl', 'pre', 'section', 'blockquote', 'table', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
// A page's `<p>` reaches here as the compat runtime's Dom element (jsx-runtime), its tag in props.
const tagOf = (p: ReactNode): string | null => (isValidElement(p) ? (typeof p.type === 'string' ? p.type : p.type === Dom ? String((p.props as { tag?: unknown }).tag) : null) : null);
const stacks = (body: ReactNode): boolean => pieces(body).some((p) => BLOCK_TAGS.has(tagOf(p) ?? ''));

export type { DialogFaq, DialogProps, ConfirmDialogProps, DangerConfirmProps, OutcomeActions } from './Dialog';

// A dialog whose action is off says why first. A page that blocks its confirm puts a `failed` OutcomeBanner among the
// dialog's children (Account > Remove all local data: a payment on this device has no final answer yet), after the
// body and the list of consequences. At 80x24 that is below the fold of the scrolling body: the action was dim and the
// first screen did not say why. Only in that case (the primary is disabled and such a note is among the children) the
// note is drawn above the body. Nothing else moves: with the action on, or with no such note, the children are drawn
// as given, in the web's order.
type Kids = { children?: ReactNode };
const present = (n: ReactNode): boolean => n !== null && n !== undefined && n !== false && n !== true && n !== '';
const isBlockingNote = (n: ReactNode): boolean =>
  isValidElement(n) && (n.type as { hxOutcomeNote?: unknown } | null)?.hxOutcomeNote === true && (n.props as { kind?: unknown }).kind === 'failed';
/** The one thing inside a wrapper (`<div class=banner><OutcomeBanner/></div>`), else null. */
function onlyChild(el: ReactElement): ReactNode {
  const c = (el.props as Kids).children;
  const all = (Array.isArray(c) ? c : [c]).filter(present);
  return all.length === 1 ? all[0] : null;
}
/** `children` with each blocking note (bare, or alone in one wrapper) taken out into `out`. Every other child keeps
 *  its place and its key (a null stands where a note was), so nothing beside a note is mounted again. Looks through
 *  fragments and lists only: a note deeper in the page's own layout stays where the page put it. */
function liftBlocking(node: ReactNode, out: ReactNode[]): ReactNode {
  if (Array.isArray(node)) return node.map((n) => liftBlocking(n, out));
  if (!isValidElement(node)) return node;
  if (node.type === Fragment) {
    const c = (node.props as Kids).children;
    return Array.isArray(c) ? cloneElement(node, undefined, ...c.map((n) => liftBlocking(n, out))) : cloneElement(node, undefined, liftBlocking(c, out));
  }
  if (isBlockingNote(node) || isBlockingNote(onlyChild(node))) { out.push(node); return null; }
  return node;
}

/** Dialog widths in columns (the web's 480 / 560 / 800 px). */
const DIALOG_COLS = { sm: 60, lg: 70, xl: 100 } as const;

/** The close × of a header: a press or Enter makes the same request as Cancel; never in the initial focus. */
/** The dialog's own outcome: brought into view when it appears below the fold of a scrolling body (termReveal.ts). */
function RevealedBox({ children }: { children: ReactNode }) {
  const self = useRef<unknown>(null);
  useRevealInDialog(self);
  return <Box boxRef={self as never /* contract-any: engine node type */}>{children}</Box>;
}

function CloseX({ disabled, hint, onPress }: { disabled: boolean; hint: boolean; onPress: () => void }) {
  const layer = useLayer();
  return (
    <Pressable dir="row" shrink={0} disabled={disabled || layer?.settled === false} onPress={onPress}>
      {({ focused }) => (
        // The label is the web's accessible name; a terminal shows the mark and, when Esc works, its key.
        <Text colour={disabled ? 'faint' : 'muted'} {...focusInk(focused)}>{hint ? 'Esc ×' : '×'}</Text>
      )}
    </Pressable>
  );
}

function LeaveWatch({ outcome, onCheck }: { outcome: OutcomeLike | undefined; onCheck: CheckFn | undefined }) {
  usePendingToast(outcome ?? null, onCheck);
  return null;
}

export const Dialog: typeof Web.Dialog = ({
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
  role = 'dialog',
  faq,
}) => {
  const t = useStrings(strings);
  useOverlayStack('dialog', isOpen);
  const guarded = role === 'alertdialog' || tone === 'danger';
  const [closeAsked, setCloseAsked] = useState(false);
  const requestOpen = (open: boolean) => {
    if (!open) setCloseAsked(true);
    onOpenChange(open);
  };
  useCloseOnContextEnd(isOpen, () => requestOpen(false));
  const [checkBusy, check] = useCheck(onCheck, checking);
  // The leave watch outlives the open dialog by one render (see the web Dialog): the same state, the same rules.
  const [watching, setWatching] = useState(isOpen);
  if (isOpen && !watching) {
    setWatching(true);
    if (closeAsked) setCloseAsked(false);
  }
  const [openOutcome, setOpenOutcome] = useState(outcome);
  if (isOpen && openOutcome !== outcome) setOpenOutcome(outcome);
  useEffect(() => {
    if (!isOpen) setWatching(false);
  }, [isOpen]);
  const watched = isOpen ? outcome : (outcome ?? (closeAsked ? openOutcome : undefined));
  const lastCheck = useRef(onCheck);
  useEffect(() => {
    if (isOpen) lastCheck.current = onCheck;
  }, [isOpen, onCheck]);
  const watchedCheck = isOpen ? onCheck : lastCheck.current;

  const done = outcome?.kind === 'done';
  useEffect(() => {
    if (isOpen && done) onOpenChange(false);
  }, [isOpen, done, onOpenChange]);

  const locked = outcome?.kind === 'pending';
  const canPrimary = primaryLabel !== undefined && !locked && !primaryDisabled && !busy;
  // The body scroll; once the primary action has fired, a note that appears in the body is brought into view.
  const bodyScroll = useRef<unknown>(null);
  const press = () => {
    if (canPrimary) { armReveal(bodyScroll.current); onPrimary?.(); }
  };
  // The reason a disabled action is off comes first (liftBlocking).
  const blocking: ReactNode[] = [];
  const lifted = primaryLabel !== undefined && primaryDisabled ? liftBlocking(children, blocking) : children;
  const rest = blocking.length > 0 ? lifted : children;
  const dismissable = isDismissable && !busy && !checkBusy;
  const maybe = outcome?.kind === 'pending';
  const refused = !dismissable && (busy || checkBusy || maybe);
  const [escHint, setEscHint] = useState(false);
  if (escHint && !refused) setEscHint(false);
  const onEscape = () => {
    if (dismissable) requestOpen(false);
    else if (refused) setEscHint(true);
  };

  const pTone = primaryTone ?? (primaryVariant === undefined ? tone : 'default');
  const variant: Web.DialogProps['primaryVariant'] = primaryVariant ?? (pTone === 'danger' ? 'secondary' : 'primary');
  // Initial focus: a guarded dialog opens on its typed field (its own autoFocus) or Cancel, never the
  // action; an ordinary one on the first field (Tab from nothing, the × held out), else Cancel, else the primary.
  // A typed confirm names its field (ConfirmDialog `typed`): it opens there even when the page drew the field itself
  // without autoFocus (Files' delete opened on Cancel and swallowed the typed name).
  const want = guarded ? (initialFocus === 'field' ? 'field' : 'cancel') : (initialFocus ?? 'field');
  const cancelFirst = want === 'cancel' && !hideCancel;
  const primaryFirst = want === 'primary' || (want === 'cancel' && hideCancel && !guarded);
  const width = DIALOG_COLS[size];
  const hint = escHint ? (checkBusy ? t('checkingHint') : busy ? t('busyHint') : maybe ? t('pendingHint') : '') : '';

  return (
    <>
      {(isOpen || watching) && <LeaveWatch outcome={watched} onCheck={watchedCheck} />}
      <Layer
        open={isOpen}
        kind="modal"
        place={{ at: 'center', width, top: size === 'xl' ? 'tenth' : 'fifth' }}
        frameColour={tone === 'danger' ? 'danger' : 'lineStrong'}
        sem={{ role, name: title }}
        padX={1}
        initialFocus={want === 'field' ? 'first' : 'none'}
        onEscape={onEscape}
        onOutside={() => { if (dismissable) requestOpen(false); }}
        onKeyFirst={(k, inField) => {
          // Enter in a one-line text field presses the primary; never in a danger dialog (only its button confirms).
          // With no primary the field keeps its Enter, as on the web, where the field's own handler sees it first
          // (Rename realms: Enter in a name field saves that row; taking it here pressed nothing and saved nothing).
          if (k.name !== 'return' || k.shift || k.ctrl || k.meta || !inField || tone === 'danger' || primaryLabel === undefined) return false;
          press();
          return true;
        }}
      >
        {/* Only the body scrolls: the head, rule and buttons never shrink (a squeezed rule drew under the body). */}
        <Box dir="row" gap={1} shrink={0}>
          {tone === 'danger' && <Text colour="danger" bold>!</Text>}
          {titleMark !== undefined && titleMark !== null && <Box dir="row" shrink={0}>{titleMark}</Box>}
          <Text bold grow={1}>{title}</Text>
          {!hideCancel && <CloseX disabled={busy || checkBusy} hint={dismissable} onPress={() => requestOpen(false)} />}
        </Box>
        {/* A top border on a 1-row box: fills the width the panel really got (a counted rule wrapped when the screen
            clamped the panel narrower than its size, 24 dashes on the next row at 80 columns). */}
        <Box height={1} shrink={0} border={['top']} borderColour="line" />
        <PaneSize grow={0} shrink={1}>
        <Scroll followFocus shrink={1} gap={1} scrollRef={bodyScroll as never /* contract-any: engine node type */}>
          {/* A block, as the web's `<div class=body>`: block children (paragraphs) stack; words and inline parts flow on
              one row (a row laid two paragraphs side by side, the second past the box: programs' system confirm).
              Text alone (a string, or a fragment of strings: `{name} {t('once')}`) is ONE Text, so it wraps as one
              sentence (one Text per piece laid the pieces side by side, each wrapping in its own column over the other),
              and it keeps its height in the scrolling body (a Text shrinks by default: it was cut to one line). */}
          {blocking.length > 0 && <Box shrink={0}>{blocking.map((n, i) => <Fragment key={i}>{n}</Fragment>)}</Box>}
          {body !== undefined && body !== null && body !== false && (isPlain(body) ? <Text shrink={0}>{pieces(body).join('')}</Text> : <Box dir={stacks(body) ? 'column' : 'row'}>{body}</Box>)}
          {faq && <Box dir="row"><FaqLink item={faq.item}>{faq.label}</FaqLink></Box>}
          {rest !== undefined && rest !== null && rest !== false && <Box>{rest}</Box>}
          {outcome && outcome.kind !== 'done' && (
            <RevealedBox>
              <Outcome outcome={outcome} variant="block" {...(outcomeAlert ? { alert: true } : {})} {...(outcomeDetail !== undefined ? { detail: outcomeDetail } : {})} {...(check ? { onCheck: check } : {})} checking={checkBusy} />
              {/* The page's recovery actions on a pending outcome, after Check again (the web's order), then its live
                  note. The function form asks for the detail sentence's element id: a terminal has none, and the
                  sentence is read right above the actions. */}
              {outcome.kind === 'pending' && outcomeActions ? (
                <>
                  <Box dir="row" gapX={2} wrap shrink={0}>{typeof outcomeActions === 'function' ? outcomeActions({ detailId: undefined }) : outcomeActions}</Box>
                  {outcomeNote !== undefined && outcomeNote !== null && outcomeNote !== false && outcomeNote !== '' ? (
                    <Box dir="row" shrink={0} sem={{ role: 'status' }}>{typeof outcomeNote === 'string' || typeof outcomeNote === 'number' ? <Text colour="muted">{String(outcomeNote)}</Text> : outcomeNote}</Box>
                  ) : null}
                </>
              ) : null}
            </RevealedBox>
          )}
        </Scroll>
        </PaneSize>
        {hint !== '' && <Text colour="warn" shrink={0}>! {hint}</Text>}
        <Box dir="row" gap={2} pad={{ top: 1 }} shrink={0}>
          <Spacer />
          {!hideCancel && (
            <Button variant="secondary" isDisabled={busy || checkBusy} autoFocus={cancelFirst} onPress={() => requestOpen(false)}>
              {cancelLabel ?? t('cancel')}
            </Button>
          )}
          {primaryLabel !== undefined && (
            <Button variant={variant} {...(pTone === 'danger' ? { tone: 'danger' as const } : {})} busy={busy} isDisabled={locked || primaryDisabled} disabledReason={locked ? undefined : primaryDisabledReason} autoFocus={primaryFirst} onPress={press}>
              {primaryLabel}
            </Button>
          )}
        </Box>
      </Layer>
    </>
  );
};

export const ConfirmDialog: typeof Web.ConfirmDialog = ({ confirmLabel, onConfirm, confirmDisabled, confirmDisabledReason, typed, tone = 'default', consequences, children, ...rest }) => {
  const t = useStrings(strings);
  const rows = consequences && consequences.length > 0 ? consequences : null;
  return (
    <Dialog
      {...rest}
      role="alertdialog"
      tone={tone}
      size={typed ? 'lg' : 'sm'}
      primaryLabel={confirmLabel ?? t('confirm')}
      onPrimary={onConfirm}
      primaryDisabled={confirmDisabled}
      primaryDisabledReason={confirmDisabledReason}
      primaryTone={tone}
      // A danger confirm is outlined until its typed name arms it, then filled; a default one is the accent primary.
      primaryVariant={tone === 'danger' && !(typed && !confirmDisabled) ? 'secondary' : 'primary'}
      initialFocus={typed ? 'field' : undefined}
    >
      {rows || children ? (
        <>
          {rows && (
            <Box>
              {/* A fixed list, never reordered: its place is its key (two lines may read the same). */}
              {rows.map((c, i) => <Text key={i}>• {c}</Text>)}
            </Box>
          )}
          {children}
        </>
      ) : undefined}
    </Dialog>
  );
};

/** DangerConfirm's typed field: label above, the field taking the focus when the dialog opens. The label is also the
 *  field's name (the web's field is labelled by it), so a reader on the field hears what to type. */
function TypeField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }): ReactNode {
  return (
    <Box pad={{ top: 1 }}>
      <Text colour="muted">{label}</Text>
      <Box dir="row" border borderColour="line">
        <TextInput value={value} onChange={onChange} grow={1} autoFocus sem={{ name: label }} />
      </Box>
    </Box>
  );
}

export const DangerConfirm: typeof Web.DangerConfirm = ({ confirmText, consequences, isOpen, ...rest }) => {
  const t = useStrings(strings);
  const want = confirmText.trim();
  const [typed, setTyped] = useState('');
  useEffect(() => {
    if (!isOpen) setTyped('');
  }, [isOpen]);
  return (
    <ConfirmDialog {...rest} isOpen={isOpen} tone="danger" typed consequences={consequences} confirmDisabled={want === '' || typed.trim() !== want}>
      <TypeField label={t('typeToConfirm', { text: want })} value={typed} onChange={setTyped} />
    </ConfirmDialog>
  );
};
