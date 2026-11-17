// Loading, empty, error and outcome states in the terminal. Same decisions as the web (States.tsx): the same C9 rules
// through errorDetails.pure (pending facts take over the surface), the same default words, the same slots. What differs
// is the drawing: an icon is its glyph (icons.glyphs.ts), a card is a bordered box, a skeleton is static bars (no
// animation: an idle terminal app must stay idle), a dismiss that needs a warning asks in the kit's ConfirmDialog, as on the web.
import { Children, Fragment, isValidElement, useEffect, useRef, useState, type ReactNode } from 'react';
import type * as Web from './States';
import { Button } from '../controls/Button';
import { ConfirmDialog } from '../overlays/Dialog';
import { useRevealInDialog } from '../overlays/termReveal';
import { TextButton } from '../controls/Link';
import { Icon, type IconName } from '../icons';
import { ICON_GLYPHS } from '../icons.glyphs';
import { OUTCOME_ICON, type OutcomeKind } from '../outcome';
import { useStrings } from '../strings';
import kitStrings from '../strings.en.json';
import { Box, Text, useBoxSize, type Colour } from '../../term/prim';
import { cellWidth } from '@term/prim';
import { ErrorDetails } from './ErrorDetails';
import { useTermSize } from '../layouts/termParts';
import { KIND_OUTCOME, errorSentence, pendingFacts, shownKind, useErrorInfo } from './errorDetails.pure';
import { useEmptyPlace, useInRail } from './emptyScope';
import stateStrings from './strings.en.json';

export type { SkeletonProps, EmptyStateProps, ErrorStateProps, OutcomeBannerProps, SkeletonTableCell } from './States';
export { EmptyPlace, EmptyRail } from './emptyScope';
export { Spinner } from './Spinner';

/** The web shows a skeleton only after 150 ms (fast answers never flash one); one timer, not a loop. */
const SKELETON_DELAY_MS = 150;
// The web's bar widths (40-70 %, varied per row, the same every render).
const WIDTHS = [62, 48, 70, 55, 41, 66, 52, 58, 45, 68] as const;
const widthAt = (i: number): number => WIDTHS[i % WIDTHS.length] ?? 55;
const bar = (cols: number, pct: number): string => '▁'.repeat(Math.max(3, Math.round((cols * pct) / 100)));

export const Skeleton: typeof Web.Skeleton = ({ rows = 6, variant = 'rows', columns = 4, immediate }) => {
  const t = useStrings(kitStrings);
  const [shown, setShown] = useState(immediate === true);
  useEffect(() => {
    if (shown) return;
    const id = setTimeout(() => setShown(true), SKELETON_DELAY_MS);
    return () => clearTimeout(id);
  }, [shown]);
  const { height } = useTermSize();
  // The web sizes every bar as a percent of the skeleton's own box (title 40 %, rows 40-70 %, table cells across the
  // full width): the box is measured, and nothing but the words is drawn until it has a width.
  // No width of its own (the web's skeleton is a block: it fills a column, but beside a title in a row, a header's meta,
  // it is only as wide as its contents, and its percent bars come to nothing there): no 100 %, so a row keeps it to its
  // words, and a box no wider than the words draws no bars ("Plans & Billing  Loading…" on one line, not a full-width
  // bar on rows of its own).
  const [box, onSize] = useBoxSize();
  const words = t('state.loading');
  const room = (box?.width ?? 0) > cellWidth(words) ? (box?.width ?? 0) : 0;
  // Never taller than the screen can show; never a screenful of bars on a short terminal.
  const n = Math.max(1, Math.min(variant === 'widget' ? Math.min(rows, 3) : rows, Math.max(2, height - 10)));
  // The same measured box before and after the delay (a placeholder of another shape kept its width, so no size change
  // was ever reported and the bars never came).
  if (!shown) return <Box height={1} onSize={onSize} />;
  const head = variant === 'detail' || variant === 'widget';
  // Table cells as the web's .skCell (first flex 2, the rest flex 1, gap sp-4 = 2 cells): each cell's bar is its percent.
  const cols = Math.max(1, columns);
  const unit = Math.max(0, room - 2 * (cols - 1)) / (cols + 1);
  const cellW = (c: number): number => Math.floor(unit * (c === 0 ? 2 : 1));
  const cell = (c: number, pct: number): string => bar(cellW(c), pct).slice(0, Math.max(0, cellW(c))).padEnd(cellW(c));
  return (
    <Box dir="column" shrink={0} onSize={onSize} sem={{ role: 'status' }}>
      {/* The words a screen reader hears on the web, shown: a terminal has no live region, and a bare bar says nothing. */}
      <Text colour="faint">{words}</Text>
      {room > 0 && head && <Text colour="line" truncate>{bar(room, variant === 'widget' ? 32 : 40)}{variant === 'detail' ? `  ${bar(8, 100)}` : ''}</Text>}
      {room > 0 && Array.from({ length: n }, (_, i) => (
        <Text key={i} colour="line" truncate>
          {variant === 'table'
            ? Array.from({ length: cols }, (_, c) => cell(c, widthAt(i * 3 + c * 7))).join('  ').trimEnd()
            : bar(room, widthAt(i))}
        </Text>
      ))}
    </Box>
  );
};

const slot = (n: ReactNode, colour: Colour = 'muted'): ReactNode => {
  if (n === undefined || n === null || n === false || n === '') return null;
  if (typeof n === 'string' || typeof n === 'number') return <Text colour={colour}>{n}</Text>;
  const kids = Array.isArray(n) ? n : isValidElement(n) && n.type === Fragment ? Children.toArray((n.props as { children?: ReactNode }).children) : null;
  if (!kids || !kids.some((k) => typeof k === 'string' && k.trim() !== '')) return n;
  return (
    // The gap is between pieces on a line only: a wrapped piece starts the very next line.
    <Box dir="row" wrap gapX={1} gapY={0}>
      {kids.filter((k) => !(typeof k === 'string' && k.trim() === '')).map((k, i) => (typeof k === 'string' || typeof k === 'number' ? <Text key={i} colour={colour}>{String(k).trim()}</Text> : k))}
    </Box>
  );
};

/** The web's loading rows inside a column table's `<table>`, hidden from readers (aria-hidden): a terminal table has no
 *  `<tbody>` to fill, and DataTable.term draws its own loading state, so nothing is drawn. */
export const TableSkeletonBody: typeof Web.TableSkeletonBody = () => <></>;

/** The web's reader-only "Loading…" beside a skeleton a caller draws itself. A terminal has no live region, so the words
 *  are shown, as Skeleton shows them above. */
export const LoadingNote: typeof Web.LoadingNote = () => {
  const t = useStrings(kitStrings);
  return <Box shrink={0} sem={{ role: 'status' }}><Text colour="faint">{t('state.loading')}</Text></Box>;
};

/** An empty state's icon is decoration beside its title (the web hides it from readers): a symbol is drawn, but an
 *  icon with only a stand-in word is not ("lock You don't have access to this" read as a sentence). */
const emptyMark = (icon: IconName): ReactNode => (ICON_GLYPHS[icon].kind === 'glyph' ? <Icon name={icon} tone="muted" /> : null);

/** The web's `.emptyBody { max-width: 48ch }`, in cells. */
const EMPTY_BODY_MAX = 48;

export const EmptyState: typeof Web.EmptyState = ({ icon = 'sparkle', title, body, action, secondary, hint, size: asked, place }) => {
  const rail = useInRail();
  const near = useEmptyPlace();
  const size = asked ?? (rail ? 'sm' : 'md');
  if (size === 'compact') {
    return (
      <Box dir="row" gap={1} shrink={0} wrap>
        {emptyMark(icon)}
        <Text colour="muted">{title}</Text>
        {action && <><Text colour="faint">·</Text>{action}</>}
      </Box>
    );
  }
  const at = place ?? near;
  const card = rail ? asked === 'md' : size === 'md' || at === 'frame';
  return (
    <Box dir="column" gap={size === 'md' ? 1 : 0} shrink={0} padX={card ? 1 : 0} border={card} borderColour="line"
      alignSelf={card && at !== 'frame' ? 'center' : 'stretch'} maxWidth={card && at !== 'frame' ? 72 : undefined}>
      <Box dir="row" gap={1}>
        {emptyMark(icon)}
        <Text bold colour="ink">{title}</Text>
      </Box>
      {/* The web caps .emptyBody at 48ch (States.module.css); a sm state in a wide pane reads as one long line without it. */}
      {size === 'sm' && slot(body) ? <Box dir="column" maxWidth={EMPTY_BODY_MAX}>{slot(body)}</Box> : slot(body)}
      {(action || secondary) && <Box dir="row" gap={2} wrap>{action}{secondary}</Box>}
      {slot(hint, 'faint')}
    </Box>
  );
};

export const ErrorState: typeof Web.ErrorState = ({ title, body, onRetry, retrying, secondary, pendingSecondary, size = 'md', error, errorWords }) => {
  const t = useStrings(kitStrings);
  const ts = useStrings(stateStrings);
  const info = useErrorInfo(error);
  const pending = pendingFacts(info);
  const extra = pending ? pendingSecondary : secondary;
  const own = pending ? { title: t('outcome.pending.title'), body: undefined } : { title, body };
  const mapped = info && (pending || body !== null) ? errorSentence(info, errorWords, ts) : undefined;
  const text = own.body !== undefined ? own.body : (mapped ?? (own.title === undefined ? t('state.errorBody') : null));
  const retry = pending ? undefined : onRetry;
  const icon = pending ? OUTCOME_ICON.pending : 'warn';
  const tone: Colour = pending ? 'warn' : 'danger';
  if (size === 'compact') {
    return (
      // The web's one line (.compact: icon, text, "·", the actions, gap sp-2). The words wrap in their own column (a
      // wrapping row put "Try again" after the sentence, a blank gap row, then "Details" alone); the actions stay
      // together on the first line, one cell apart. Never wider than its container (maxWidth): as a piece of a wrapping
      // row (Billing's header meta) it was as wide as its sentence, so the words and "Try again" ran past the edge.
      <Box dir="row" gap={1} shrink={0} maxWidth="100%" sem={{ role: 'alert' }}>
        <Text colour={tone} bold shrink={0}><Icon name={icon} /></Text>
        <Box dir="column" grow={1} shrink={1}>
          <Text colour={pending ? 'ink' : 'danger'}>
            {own.title ?? ts('state.compactError')}
            {mapped ? <Text colour="muted">{' ' + mapped}</Text> : null}
          </Text>
        </Box>
        {(retry || extra || info) && (
          <Box dir="row" gap={1} shrink={0}>
            {retry && <><Text colour="faint">·</Text><TextButton onPress={retry} isDisabled={retrying}>{t('action.retry')}</TextButton></>}
            {extra}
            {info && <ErrorDetails error={info} mode="button" />}
          </Box>
        )}
      </Box>
    );
  }
  return (
    // md is the web's centred block (.empty .error .md), as EmptyState's: centred in its area, at most 72 cells, no
    // border (the error card has none); sm stays a plain column, as EmptyState sm.
    <Box dir="column" gap={size === 'md' ? 1 : 0} shrink={0} sem={{ role: 'alert' }}
      alignSelf={size === 'md' ? 'center' : 'stretch'} maxWidth={size === 'md' ? 72 : undefined}>
      <Box dir="row" gap={1}>
        <Text colour={tone} bold><Icon name={icon} /></Text>
        <Text bold colour={pending ? 'ink' : 'danger'}>{own.title ?? t('state.errorTitle')}</Text>
      </Box>
      {text !== null && slot(text)}
      {(retry || extra) && (
        <Box dir="row" gap={2} wrap>
          {retry && <Button onPress={retry} busy={retrying}>{t('action.retry')}</Button>}
          {extra}
        </Box>
      )}
      {info && <ErrorDetails error={info} />}
    </Box>
  );
};

const OUTCOME_TONE: Record<OutcomeKind, Colour> = { done: 'ok', pending: 'warn', failed: 'danger', not_sent: 'blueText', stale: 'blueText' };

export const OutcomeBanner: typeof Web.OutcomeBanner = ({ kind: given, title: givenTitle, body: givenBody, known, checkLine, result, stopLine, onCheck, checking, onDismiss, dismissWarned, actions: givenActions, error, errorWords }) => {
  const t = useStrings(kitStrings);
  const ts = useStrings(stateStrings);
  const [asking, setAsking] = useState(false);
  // In a dialog whose body scrolls, a note that appears below the fold is brought into view (termReveal.ts).
  const self = useRef<unknown>(null);
  useRevealInDialog(self);
  const info = useErrorInfo(given !== 'done' ? error : undefined, KIND_OUTCOME[given]);
  const kind = shownKind(given, info);
  const promoted = kind !== given;
  const title = promoted ? undefined : givenTitle;
  const body = promoted ? undefined : givenBody;
  const actions = promoted ? undefined : givenActions;
  const hasActions = actions !== undefined && actions !== null && actions !== false;
  const warn = kind === 'pending' && !!onDismiss && !(dismissWarned && !promoted);
  const defaults: Record<OutcomeKind, { title: string; body?: string }> = {
    done: { title: t('outcome.done.title') },
    pending: { title: t('outcome.pending.title'), body: t('outcome.pending.body') },
    failed: { title: t('outcome.failed.title') },
    not_sent: { title: t('outcome.notSent.title') },
    stale: { title: t('outcome.stale.title'), body: t('outcome.stale.body') },
  };
  const d = defaults[kind];
  const mapped = info && kind !== 'pending' && kind !== 'done' ? errorSentence(info, errorWords, ts) : undefined;
  const shown = (l: ReactNode) => l !== undefined && l !== null && l !== '' && l !== false;
  const lines = promoted ? [] : [known, checkLine].filter(shown);
  const after = promoted ? [] : [stopLine].filter(shown);
  // What the last Check again found: its own status region under checkLine, mounted empty while `result` is null (the
  // web's rule); a promoted banner drops it with the lines.
  const resultSlot = !promoted && result !== undefined;
  const text = lines.length + after.length > 0 ? null : body !== undefined ? body : (mapped ?? (title === undefined || kind === 'pending' ? d.body : undefined));
  const tone = OUTCOME_TONE[kind];
  return (
    // maxWidth: never wider than its parent. In a row (a setting row's value cell, flex-end and wrapping) a banner that does
    // not shrink would overflow the cell's start edge; the web's banner shrinks to the cell and wraps its words (AI default
    // model, 80x24, failed-default layout-cut). shrink 0 stays for a column parent (never squashed in height).
    <Box dir="column" border={['left']} borderColour={tone} padX={1} shrink={0} maxWidth="100%" boxRef={self as never /* contract-any: engine node type */} sem={{ role: kind === 'failed' || kind === 'pending' ? 'alert' : 'status' }}>
      <Box dir="row" gap={1}>
        <Text colour={tone} bold><Icon name={OUTCOME_ICON[kind]} /></Text>
        <Box dir="column" grow={1} shrink={1}>
          <Text bold colour="ink">{title ?? d.title}</Text>
          {text !== null && text !== undefined && slot(text, 'ink')}
          {lines.map((l, i) => <Box key={i}>{slot(l, 'ink')}</Box>)}
          {resultSlot && <Box sem={{ role: 'status' }}>{slot(result, 'ink')}</Box>}
          {after.map((l, i) => <Box key={`a${i}`}>{slot(l, 'ink')}</Box>)}
          {info && <ErrorDetails error={info} />}
        </Box>
      </Box>
      {((kind === 'pending' && onCheck) || onDismiss || hasActions) && (
          <Box dir="row" gap={2} wrap pad={{ left: 2 }}>
            {kind === 'pending' && onCheck && <Button size="sm" onPress={onCheck} busy={checking}>{t('outcome.pending.check')}</Button>}
            {hasActions && actions}
            {onDismiss && <Button size="sm" variant="ghost" onPress={warn ? () => setAsking(true) : onDismiss}>{kind === 'pending' ? ts('err.stopTracking') : ts('err.hide')}</Button>}
          </Box>
      )}
      {warn && (
        // The web's "Stop tracking it?" confirm: the same kit dialog (an overlay over the page, focus kept inside).
        <ConfirmDialog
          isOpen={asking}
          onOpenChange={setAsking}
          title={ts('outcome.pending.dismissTitle')}
          body={ts('outcome.pending.dismissBody')}
          confirmLabel={ts('outcome.pending.dismissConfirm')}
          onConfirm={() => { setAsking(false); onDismiss?.(); }}
        />
      )}
    </Box>
  );
};
// A dialog whose action is off draws a `failed` one of these first (kit/overlays/Dialog.term.tsx, `liftBlocking`).
(OutcomeBanner as { hxOutcomeNote?: boolean }).hxOutcomeNote = true;
