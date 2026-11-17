// Loading, empty, error and outcome states: Skeleton, EmptyState, ErrorState and OutcomeBanner. Every async surface
// shows exactly one of these instead of a blank area.
// Which one: EmptyState for nothing to show yet (the fixed cases are in Recipes.tsx; a computer that did not answer is
// UnreachableState, never an empty state); ErrorState for a read that failed; OutcomeBanner for the result of a send
// about a whole section. Use the Outcome line (forms) where the action's button was, Band for a state of the whole
// page or table, and HeldBand for a held change a page tracks.
import { type ReactNode, useState } from 'react';
import { Button, cx } from '../controls/Button';
import { SR_ONLY } from '../controls/SrOnly';
import { TextButton } from '../controls/Link';
import { Icon, type IconName } from '../icons';
import { useInStrictSection } from '../layouts/anatomy/Heading';
import { CardEdge, useCardCut } from '../layouts/CardEdge';
import { ConfirmDialog } from '../overlays/Dialog';
import { OUTCOME_ICON, type OutcomeKind } from '../outcome';
import { ErrorDetails, KIND_OUTCOME, errorSentenceNode, pendingFacts, shownKind, useErrorInfo } from './ErrorDetails';
import type { ErrorWordsOptions } from './errorWords';
import { useStrings } from '../strings';
import kitStrings from '../strings.en.json';
import stateStrings from './strings.en.json';
import { useEmptyPlace, useInRail, type EmptyPlaceKind } from './emptyScope';
import s from './States.module.css';

export interface SkeletonProps {
  /** Number of placeholder rows. */
  rows?: number;
  /** The real layout it stands in for (a skeleton mirrors the page). */
  variant?: 'rows' | 'table' | 'card' | 'text' | 'detail' | 'widget';
  /** Columns of a `table` skeleton (default 4). */
  columns?: number;
  /** Show it at once instead of after 150 ms (fast answers never flash a skeleton). */
  immediate?: boolean;
  className?: string;
}

// Block widths, 40-70 % and varied per row but the same on every render (no flicker, stable shots).
const WIDTHS = [62, 48, 70, 55, 41, 66, 52, 58, 45, 68] as const;
const widthAt = (i: number) => WIDTHS[i % WIDTHS.length] ?? 55;

/** Placeholder shapes while data loads (announced once as "Loading…"). */
export function Skeleton({ rows = 6, variant = 'rows', columns = 4, immediate, className }: SkeletonProps) {
  const t = useStrings(kitStrings);
  const lines = Array.from({ length: variant === 'widget' ? Math.min(rows, 3) : rows }, (_, i) => i);
  const cols = Array.from({ length: Math.max(1, columns) }, (_, i) => i);
  return (
    <div
      className={cx(s.skeleton, s[`sk_${variant}`], !immediate && s.delayed, className)}
      data-skeleton=""
      role="status"
      aria-live="polite"
    >
      <span className={SR_ONLY}>{t('state.loading')}</span>
      {(variant === 'detail' || variant === 'widget') && (
        <div className={s.skHead} aria-hidden="true">
          <div className={cx(s.bar, s.barTitle)} />
          {variant === 'detail' && <div className={cx(s.bar, s.barPill)} />}
        </div>
      )}
      {lines.map((i) => (
        <div key={i} className={s.skRow} aria-hidden="true">
          {variant === 'table' ? (
            cols.map((c) => (
              <div key={c} className={s.skCell}>
                <div className={s.bar} style={{ width: `${widthAt(i * 3 + c * 7)}%` }} />
              </div>
            ))
          ) : (
            <div className={s.bar} style={{ width: `${widthAt(i)}%` }} />
          )}
        </div>
      ))}
    </div>
  );
}

/** One cell of a `TableSkeletonBody` row: the table's own cell class, where its line sits, or no line (a check or
 *  actions cell). */
export interface SkeletonTableCell {
  className?: string;
  align?: 'start' | 'end' | 'center';
  bar?: boolean;
}

/**
 * A column table's loading rows, drawn inside the table's own `<table>` after its header: one line per declared column,
 * in that column's cell, so the loading table already has the shape of the loaded one. Hidden from readers (pair it
 * with `LoadingNote`); shown after 150 ms, as Skeleton.
 */
export function TableSkeletonBody({ rows = 8, cells, rowClassName }: { rows?: number; cells: readonly SkeletonTableCell[]; rowClassName?: string }) {
  return (
    <tbody className={s.delayed} data-skeleton="" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <tr key={i} className={rowClassName}>
          {cells.map((c, ci) => (
            <td key={ci} className={c.className}>
              {c.bar !== false && (
                <div
                  className={cx(s.bar, c.align === 'end' && s.barEnd, c.align === 'center' && s.barCenter)}
                  style={{ width: `${widthAt(i * 3 + ci * 7)}%` }}
                />
              )}
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

/** "Loading…" for readers only, announced once: the words of a skeleton a caller draws itself. */
export function LoadingNote() {
  const t = useStrings(kitStrings);
  return (
    <span role="status" aria-live="polite" className={SR_ONLY}>
      {t('state.loading')}
    </span>
  );
}

export interface EmptyStateProps {
  icon?: IconName;
  /** What the place is for ("Your computers live here"); in `compact`, the one sentence. */
  title: string;
  /** One sentence on what you get or need. Not shown in `compact`. */
  body?: ReactNode;
  /** The one primary action (a kit Button; a TextButton in `compact`). */
  action?: ReactNode;
  /** Optional secondary link, usually the Guide topic ("How computers work"). */
  secondary?: ReactNode;
  /** Optional keyboard hint under the actions (<Shortcut keys="n" /> plus words). */
  hint?: ReactNode;
  /**
   * `md`: a page or pane (icon tile, display title). `sm`: inside a panel or table.
   * `compact`: one line plus one action, for widgets and small regions.
   */
  size?: 'sm' | 'md' | 'compact';
  /** Where an `md` card sits; by default the nearest EmptyPlace's, else `center`. */
  place?: EmptyPlaceKind;
  // Without `size`, a rail's empty state is `sm` and plain (EmptyRail); elsewhere `md`.
  className?: string;
}

// The type, the contexts and their providers live in emptyScope.tsx (the overlays' reset ends them without a cycle).
export { EmptyPlace, EmptyRail, type EmptyPlaceKind } from './emptyScope';

export function EmptyState({ icon = 'sparkle', title, body, action, secondary, hint, size: asked, place, className }: EmptyStateProps) {
  const rail = useInRail();
  const size = asked ?? (rail ? 'sm' : 'md');
  // Inside a strict section the title is not a heading: the section's own title is.
  const Title = useInStrictSection() ? 'p' : 'h2';
  const near = useEmptyPlace();
  const cut = useCardCut();
  if (size === 'compact') {
    return (
      <p className={cx(s.compact, className)}>
        <Icon name={icon} size="sm" className={s.compactIcon} />
        <span className={s.compactText}>{title}</span>
        {action && (
          <>
            <span className={s.compactSep} aria-hidden="true">
              ·
            </span>
            {action}
          </>
        )}
      </p>
    );
  }
  // The md empty state is a card with the Hub's slanted corner (CardEdge draws its line), and so is any empty state that
  // takes a list's table frame's place; an sm one elsewhere sits inside a panel and stays plain. Inside a card
  // (CardScope) it is never a card of its own: the card around it is the frame.
  const at = place ?? near;
  const inCard = !('data-card-cut' in cut);
  // In a rail only an explicit md is a card (the rail's own list frame is not a page's).
  const card = !inCard && (rail ? asked === 'md' : size === 'md' || at === 'frame');
  return (
    <div className={cx(s.empty, s[size], card && s.card, card && at === 'frame' && s.frame, className)} {...(card ? { ...cut, 'data-empty-place': at } : {})}>
      {card && <CardEdge />}
      <div className={s.emptyIcon}>
        <Icon name={icon} size="lg" />
      </div>
      <Title className={s.emptyTitle}>{title}</Title>
      {body && <p className={s.emptyBody}>{body}</p>}
      {(action || secondary) && (
        <div className={s.emptyActions}>
          {action}
          {secondary}
        </div>
      )}
      {hint && <p className={s.emptyHint}>{hint}</p>}
    </div>
  );
}

export interface ErrorStateProps {
  /** What failed, in plain words ("Couldn't read your computers"). */
  title?: string;
  /** What to try. Not shown in `compact` (an `error`'s mapped sentence is, after the title). Defaults to the generic wording only when `title` is not
   *  given either; `null` shows none. */
  body?: ReactNode;
  onRetry?: () => void;
  retrying?: boolean;
  /** When retrying won't help: a link to status or the Guide. Not shown under facts that say pending. */
  secondary?: ReactNode;
  /** Under facts that say pending (C9): a read-back ("Check again") shown instead of `secondary`. */
  pendingSecondary?: ReactNode;
  /** `compact`: "Couldn't load Bots · Try again" on one line, for widgets and small regions. */
  size?: 'sm' | 'md' | 'compact';
  /** The rejection (core): the body defaults to its mapped sentence, and a Details fold shows its facts with
   *  "Copy details for support". */
  error?: unknown;
  /** For `error`: a program URL's gateway answer reads "still starting"; a page's own sentence for one code. */
  errorWords?: ErrorWordsOptions;
  className?: string;
}

export function ErrorState({ title, body, onRetry, retrying, secondary, pendingSecondary, size = 'md', error, errorWords, className }: ErrorStateProps) {
  const t = useStrings(kitStrings);
  const ts = useStrings(stateStrings);
  const info = useErrorInfo(error);
  const Title = useInStrictSection() ? 'p' : 'h2';
  // C9: facts saying pending make the whole state the pending one (pendingFacts): the pending title, icon and
  // guidance, and nothing to send again: neither Try again nor the page's `secondary` (it may hold a resend), only
  // `pendingSecondary` (a read-back). The page's title and body were written for a failure.
  const pending = pendingFacts(info);
  const extra = pending ? pendingSecondary : secondary;
  const own = pending ? { title: t('outcome.pending.title'), body: undefined } : { title, body };
  // The generic body goes only with the generic title: a page's own title is never followed by a
  // line that may contradict it. An error's mapped sentence says why, so it fits any title.
  // `body={null}`: no body at all.
  const mapped = info && (pending || body !== null) ? errorSentenceNode(info, errorWords, ts) : undefined;
  const text = own.body !== undefined ? own.body : (mapped ?? (own.title === undefined ? t('state.errorBody') : null));
  const retry = pending ? undefined : onRetry;
  const icon: IconName = pending ? OUTCOME_ICON.pending : OUTCOME_ICON.failed;
  if (size === 'compact') {
    return (
      <p className={cx(s.compact, !pending && s.compactError, className)} role="alert" data-outcome={pending ? 'pending' : undefined}>
        <Icon name={icon} size="sm" className={s.compactIcon} />
        <span className={s.compactText}>
          {own.title ?? ts('state.compactError')}
          {mapped && <span className={s.compactDetail}>{mapped}</span>}
        </span>
        {retry && (
          <>
            <span className={s.compactSep} aria-hidden="true">
              ·
            </span>
            <TextButton onPress={retry} isDisabled={retrying}>
              {t('action.retry')}
            </TextButton>
          </>
        )}
        {extra}
        {info && <ErrorDetails error={info} mode="button" />}
      </p>
    );
  }
  return (
    <div className={cx(s.empty, !pending && s.error, s[size], className)} role="alert" data-outcome={pending ? 'pending' : undefined}>
      <div className={cx(s.emptyIcon, !pending && s.errorIcon)}>
        <Icon name={icon} size="lg" />
      </div>
      <Title className={s.emptyTitle}>{own.title ?? t('state.errorTitle')}</Title>
      {text !== null && <p className={s.emptyBody}>{text}</p>}
      {(retry || extra) && (
        <div className={s.emptyActions}>
          {retry && (
            <Button icon="reload" onPress={retry} busy={retrying}>
              {t('action.retry')}
            </Button>
          )}
          {extra}
        </div>
      )}
      {info && <ErrorDetails error={info} className={s.errorDetails} />}
    </div>
  );
}

export interface OutcomeBannerProps {
  kind: OutcomeKind;
  /** Override the title (resolved string). */
  title?: string;
  /** Detail text. Defaults to the kit wording for `stale` only when `title` is not given either, and for
   *  `pending` always (its C9 guidance); `null` shows none. */
  body?: ReactNode;
  /** The fixed shape of a "may have gone through" banner. Each line shows on its own, in this order, in
   *  place of `body`: what we know; what Check again reads; what Stop tracking does. Pass `checkLine` and `stopLine`
   *  only while that button is offered (on the banner or beside it). Pages pass the lines; they never join them. */
  known?: ReactNode;
  checkLine?: ReactNode;
  /** What the last Check again found, on its own line under `checkLine` (which stays: it says what the button does).
   *  A status region, so a new result is read aloud. Pass `null` until there is a result: the region is mounted empty
   *  first, so the first result is announced too. Not given: no region. A promoted banner drops it with the lines. */
  result?: ReactNode;
  stopLine?: ReactNode;
  /** For `pending`: read back the authoritative state (never resend). */
  onCheck?: () => void;
  checking?: boolean;
  /** Close the banner. On `pending` it usually forgets a change that may have gone through (its hold is lifted,
   *  so the next press is a fresh send): the kit asks "Stop tracking this?" first. */
  onDismiss?: () => void;
  /** The page asks before `onDismiss` itself, in its own words: the kit adds no second warning. */
  dismissWarned?: boolean;
  /** One recovery action that is neither Check again nor Stop tracking: "Send the same
   *  request again" (it keeps the request's key: never a fresh send), "Sign in again". Drawn before the close, so a
   *  drawer's footer keeps only Cancel and its primary. Written for the banner's own kind: a banner that facts turn
   *  pending drops it, as it drops the page's title and lines. */
  actions?: ReactNode;
  /** The rejection (core): the body defaults to its mapped sentence (not on `pending`, whose C9 guidance
   *  stays), and a Details fold shows its facts with "Copy details for support". */
  error?: unknown;
  errorWords?: ErrorWordsOptions;
  className?: string;
}


/**
 * The one outcome banner. `pending` is the C9 "this may have gone through" state: it offers a
 * read-back, never a resend.
 */
export function OutcomeBanner({
  kind: given,
  title: givenTitle,
  body: givenBody,
  known,
  checkLine,
  result,
  stopLine,
  onCheck,
  checking,
  onDismiss,
  dismissWarned,
  actions: givenActions,
  error,
  errorWords,
  className,
}: OutcomeBannerProps) {
  const t = useStrings(kitStrings);
  const ts = useStrings(stateStrings);
  const [asking, setAsking] = useState(false);
  // The banner's kind is the page's C9 decision: Details follow it. A done banner has no error to show.
  const info = useErrorInfo(given !== 'done' ? error : undefined, KIND_OUTCOME[given]);
  // Facts saying pending under another kind make the whole banner pending (title, words, Check again, the close and
  // its warning): the page's title and sentence were written for the other kind, and its own warning too.
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
  // A default body goes only with the default title, except a pending outcome's: its "don't send it
  // again, check first" is C9 guidance true under any title. `body={null}`: no body at all.
  const mapped = info && kind !== 'pending' && kind !== 'done' ? errorSentenceNode(info, errorWords, ts) : undefined;
  // The page's lines were written for its own kind, like its title and body: a promoted banner drops them.
  const shown = (l: ReactNode) => l !== undefined && l !== null && l !== '' && l !== false;
  const lines = promoted ? [] : [known, checkLine].filter(shown);
  const after = promoted ? [] : [stopLine].filter(shown);
  const resultSlot = !promoted && result !== undefined;
  const text = lines.length + after.length > 0 ? null : body !== undefined ? body : (mapped ?? (title === undefined || kind === 'pending' ? d.body : undefined));
  return (
    <div
      className={cx(s.outcome, s[`o_${kind}`], className)}
      data-outcome={kind}
      role={kind === 'failed' || kind === 'pending' ? 'alert' : 'status'}
    >
      {/* The banner is the container; below 480 px its actions (Check again, the close) take their own row under
          the text, so the C9 sentence keeps the full width. */}
      <div className={s.outcomeInner}>
        <Icon name={OUTCOME_ICON[kind]} className={s.outcomeIcon} />
        <div className={s.outcomeText}>
          <strong className={s.outcomeTitle}>{title ?? d.title}</strong>
          {text && <span className={s.outcomeBody}>{text}</span>}
          {lines.map((l, i) => (
            <span key={i} className={s.outcomeBody}>
              {l}
            </span>
          ))}
          {resultSlot && (
            <span className={s.outcomeBody} role="status" data-outcome-result="">
              {result}
            </span>
          )}
          {after.map((l, i) => (
            <span key={`a${i}`} className={s.outcomeBody}>
              {l}
            </span>
          ))}
          {info && <ErrorDetails error={info} className={s.outcomeDetails} />}
        </div>
        {((kind === 'pending' && onCheck) || onDismiss || hasActions) && (
          <div className={s.outcomeActions}>
            {kind === 'pending' && onCheck && (
              <Button size="sm" onPress={onCheck} busy={checking}>
                {t('outcome.pending.check')}
              </Button>
            )}
            {hasActions && <span className={s.outcomeRecover} data-outcome-actions="">{actions}</span>}
            {/* The close says what it does: a pending change is forgotten (Stop tracking, after the warning when the
                kit gives it), drawn as HeldBand draws it; any other note is only hidden. */}
            {onDismiss && (
              <span className={s.outcomeClose}>
                {kind === 'pending' ? (
                  <Button size="sm" variant="ghost" onPress={warn ? () => setAsking(true) : onDismiss}>
                    {ts('err.stopTracking')}
                  </Button>
                ) : (
                  <TextButton onPress={onDismiss}>{ts('err.hide')}</TextButton>
                )}
              </span>
            )}
          </div>
        )}
      </div>
      {warn && (
        <ConfirmDialog
          isOpen={asking}
          onOpenChange={setAsking}
          title={ts('outcome.pending.dismissTitle')}
          body={ts('outcome.pending.dismissBody')}
          confirmLabel={ts('outcome.pending.dismissConfirm')}
          onConfirm={() => {
            setAsking(false);
            onDismiss?.();
          }}
        />
      )}
    </div>
  );
}

// Spinner is its own module, so the kit Button draws it without importing States (which imports Button).
export { Spinner } from './Spinner';
