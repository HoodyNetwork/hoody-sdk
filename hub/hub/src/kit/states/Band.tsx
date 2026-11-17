// Bands: one sentence about the whole page or the whole
// table, with at most two actions. Never blue: neutral for information, tinted only
// for warning and danger, and `accent` (the soft accent) for an announcement that is neither. Notices: the same look, a 1 px frame and a 3 px bar at the start,
// for a sentence that stays on the page with no actions and no live role. Both read one tone map (Band.module.css).
// An attached band is about one field: it sits under that field in the table look,
// the field names it as its description, and the field's border takes its tone.
import { type ReactElement, type ReactNode, cloneElement, useId } from 'react';
import { IconButton, cx } from '../controls/Button';
import { Icon, type IconName } from '../icons';
import { OUTCOME_ICON } from '../outcome';
import { useStrings } from '../strings';
import { Heading } from '../layouts/anatomy/Heading';
import { ErrorDetails, errorSentenceNode, pendingFacts, useErrorInfo } from './ErrorDetails';
import type { ErrorWordsOptions } from './errorWords';
import stateStrings from './strings.en.json';
import kitStrings from '../strings.en.json';
import s from './Band.module.css';

export type BandTone = 'neutral' | 'accent' | 'warn' | 'danger';

export interface BandProps {
  tone?: BandTone;
  /**
   * `page` (40 px): full content width at the top of the content area, above the page header
   * (offline, stale, account suspended, a recover notice). `table` (36 px): between the toolbar and
   * the table ("Showing what we read at 12:03 · Try again"), or above an editor.
   */
  size?: 'page' | 'table';
  /** Defaults per tone: info, warn, error. */
  icon?: IconName;
  /** The sentence. Keep it to one line at 1440; it wraps rather than cuts on a phone. Without it, an `error`'s
   *  mapped sentence. */
  children?: ReactNode;
  /** One or two actions: TextButtons, or a small Button for the one that resolves it. */
  actions?: ReactNode;
  /** Only for bands that are safe to hide (never for a recover or an unknown outcome). */
  onDismiss?: () => void;
  /** The rejection behind a warn/danger band (core): a Details button shows its facts with "Copy details for
   *  support". A page's own sentence (children) wins over the mapped one, except under facts that say pending. */
  error?: unknown;
  errorWords?: ErrorWordsOptions;
  /** Under facts that say pending (C9): the read-back actions ("Check again") shown instead of `actions`, which may
   *  send again. Without it a pending band offers none. */
  pendingActions?: ReactNode;
  /** One row of a stack inside a table's frame (`toolbarNote`): no frame of its own, a hairline below, the icon in the
   *  rail's lead column and every line of text on its text edge. */
  flush?: boolean;
  /** The one field this band is about (a risky port, a rule that locks you out): the band is drawn under it in the
   *  `table` look and polite, the field takes the band as its description (aria-describedby, after its own) and its
   *  border takes the band's tone until the field is invalid. Give it one end link at most (`actions`). With nothing to
   *  say (no children, actions, error or onDismiss) it draws the field alone: keep the Band mounted and pass its sentence only while
   *  it applies, so the field never remounts while the person types. */
  attach?: ReactElement<{ 'aria-describedby'?: string }>;
  /** Laid over the top edge of a frame or canvas tile (a slow frame, a held change): full width at the top of the nearest
   *  positioned ancestor, above its content, so the page needs no wrapper. The card colour is painted under the band's
   *  fill (the warn and danger fills are see-through), so what the band lies over never shows through its words.
   *  Ignored with `attach`. */
  over?: boolean;
  /** A held change (kit HeldBand): the band is the page's pending outcome and carries its mark (data-outcome="pending"),
   *  so the shell's own "may have gone through" toast stays away while it shows. */
  held?: boolean;
  className?: string;
}

const ICON: Record<BandTone, IconName> = { neutral: 'info', accent: 'info', warn: 'warn', danger: 'error' };

/** A notice's level: calm for information (the Band's neutral), warn for a warning. */
export type NoticeLevel = 'calm' | 'warn';

export interface NoticeProps {
  level?: NoticeLevel;
  /** Defaults per level: info, warn. `null` draws none. */
  icon?: IconName | null;
  /** The small chip that sits in a row of text (a "did not answer" beside its Try again); a block otherwise. */
  inline?: boolean;
  /** `measure`: no wider than a line of reading text (a guide's warning beside its paragraphs). */
  width?: 'measure';
  /** Structured content (a heading and a list, a few paragraphs) in the notice frame: the body is a block, the icon
   *  sits at the top start. Never with `inline`. */
  block?: boolean;
  /** The block notice's title: drawn as a kit Heading (one level below its context) at the top of the body, and the
   *  notice becomes a group named by it. */
  title?: string;
  children: ReactNode;
  className?: string;
}

/** A sentence that stays on the page in the notice look: no actions, no close, no live role (a Band is for a state
 * that comes and goes). */
export function Notice({ level = 'calm', icon, inline = false, width, block = false, title, children, className }: NoticeProps) {
  const titleId = useId();
  const name = icon === null ? null : (icon ?? (level === 'warn' ? 'warn' : 'info'));
  const mark = name && <Icon name={name} size="sm" className={s.icon} />;
  const look = cx(s.notice, level === 'warn' && s.warn, width === 'measure' && s.measure, className);
  if (block && !inline) {
    // A titled notice is a group named by its heading (a landmark is the archetypes' alone), never a live region.
    return (
      <div className={cx(look, s.block)} data-notice={level} role={title ? 'group' : undefined} aria-labelledby={title ? titleId : undefined}>
        {mark}
        <div className={s.text}>
          {title && <Heading id={titleId}>{title}</Heading>}
          {children}
        </div>
      </div>
    );
  }
  const Tag = inline ? 'span' : 'p';
  return (
    <Tag className={cx(look, inline && s.inline)} data-notice={level}>
      {mark}
      <span className={s.text}>{children}</span>
    </Tag>
  );
}

export function Band({ tone: given = 'neutral', size: givenSize = 'page', icon, children, actions: givenActions, onDismiss, error, errorWords, pendingActions, flush, attach, over, held = false, className }: BandProps) {
  const t = useStrings(kitStrings);
  const id = useId();
  const size = attach ? 'table' : givenSize;
  const ts = useStrings(stateStrings);
  const info = useErrorInfo(error);
  // C9: facts saying pending make the band the pending note (pendingFacts): the warn tint and the pending clock, the C9
  // sentence instead of the page's (written for a failure), only read-back actions, and no close (a band about an
  // unknown outcome is never hidden).
  const pending = pendingFacts(info);
  const tone: BandTone = pending ? 'warn' : given;
  const text = (pending ? undefined : children) ?? (info ? errorSentenceNode(info, errorWords, ts) : null);
  const actions = pending ? pendingActions : givenActions;
  const mark = <Icon name={pending ? OUTCOME_ICON.pending : (icon ?? ICON[tone])} size="sm" className={s.icon} />;
  const band = (
    <div
      id={attach ? id : undefined}
      className={cx(s.band, s[tone], s[size], flush && s.flush, attach && s.attach, over && !attach && s.over, attach ? undefined : className)}
      data-band-flush={flush ? '' : undefined}
      data-band-over={over && !attach ? '' : undefined}
      // Attached, the band describes its field (read when the field takes focus), so it never interrupts the typing.
      role={attach || tone === 'neutral' || tone === 'accent' ? 'status' : 'alert'}
      data-outcome={pending || held ? 'pending' : undefined}
    >
      {!flush && mark}
      {/* Flush: the icon rides the words, so it stays on their first line wherever the row centres them. */}
      <span className={s.text}>
        {flush && mark}
        {text}
      </span>
      {(actions || info) && (
        <span className={s.actions}>
          {actions}
          {info && <ErrorDetails error={info} mode="button" />}
        </span>
      )}
      {onDismiss && !pending && <IconButton size="sm" icon="x" onPress={onDismiss} label={t('action.close')} className={s.close} />}
    </div>
  );
  if (!attach) return band;
  // Nothing to say (no sentence, action, rejection or close): the field alone, naming no band. The wrap stays, so a warning
  // that comes and goes with what is typed never remounts the field under the person's cursor.
  const quiet = text == null && actions == null && !info && !(onDismiss && !pending);
  const own = attach.props['aria-describedby'];
  return (
    <div className={cx(s.attachWrap, !quiet && tone === 'warn' && s.attachWarn, !quiet && tone === 'danger' && s.attachDanger, className)} data-band-attach={quiet ? undefined : tone}>
      {quiet ? attach : cloneElement(attach, { 'aria-describedby': own ? `${own} ${id}` : id })}
      {quiet ? null : band}
    </div>
  );
}
