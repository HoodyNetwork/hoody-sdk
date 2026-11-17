// PickCard: a card you press to pick one thing from a set (a program from the
// library). The whole card is one press and holds nothing else you can press: a mark, the title with a tag at its end,
// a line in ink, a muted note of two lines at most, and a mono line. Standalone it is one button; inside a CardGrid
// the grid row owns the press and the focus, and the card only draws (one interactive owner either way).
import { useContext, useId, useLayoutEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import { PickCardRow } from './pickCardRow';
import { Button as AriaButton, Text } from 'react-aria-components';
import { cx } from '../controls/Button';
import { Icon, type IconName } from '../icons';
import { CardEdge, useCardCut } from '../layouts/CardEdge';
import s from './PickCard.module.css';

export { PickCardRow, type PickCardRowState } from './pickCardRow';

export interface PickCardProps {
  /** The name of the thing picked. One line, cut with an ellipsis when long. */
  title: string;
  /** The mark before everything else: a `Monogram size="lg"` (36 px). Decorative: the title names the thing. */
  mark?: ReactNode;
  /** A short tag at the end of the title's line (the program's kind: "Web page", "API", "Terminal"). Words, never a
   * colour alone. */
  end?: ReactNode;
  /** A decorative mark after the end tag (`external` when a press opens another place). The end words say it; the
   * mark is hidden from the accessible name. */
  endIcon?: IconName;
  /** What it is, in ink (a tagline). Text only: nothing in a card may be pressable. */
  line?: string;
  /** Why you might pick it, muted, two lines at most. Text only. */
  note?: string;
  /** The facts line in mono (`owner/repo · stack · licence`). Text only. */
  meta?: string;
  /** The same facts as separate parts (the terminal and the card's description read `meta`): drawn on ONE line, each
   *  part whole or left out when the card is too narrow, never wrapped and never a lone separator. */
  metaParts?: readonly string[] | undefined;
  /** "You were here": the words that say this is the card you opened last. Given, the card draws an ink frame and the
   * selection bar and adds the words to its mono line, so the state is never told by the frame alone. */
  here?: string;
  /** The card is the current choice of its set: the ink frame and the selection bar, and `aria-pressed` on a standalone
   * card. Use `here` instead when the card is only where the person was last. */
  isSelected?: boolean;
  /** The card cannot be picked now. It stays focusable and a press does nothing; say why in `disabledReason`. Standalone
   * cards only: in a CardGrid the grid owns the press. */
  isDisabled?: boolean;
  /** Why the card cannot be picked, shown on its mono line and read with its description. */
  disabledReason?: string;
  /** What a press does. Required outside a CardGrid; inside one the grid's `onPick` is the press and this is ignored. */
  onPress?: () => void;
  /** The standalone card's button, so a page can return focus to it (a drawer opened from the card). Unused in a
   * CardGrid: the grid row holds the focus. */
  ref?: Ref<HTMLButtonElement>;
  className?: string;
}

/** A pressable card: mark, title and end tag, line, note, mono line; hover, focus and "you were here" states; the cut
 * corner when it is the outermost card. Its accessible name is the title, end tag and line; the note, the mono line
 * and the "you were here" words describe it. */
/** What a card must never hold: a second control (the card, or its grid row, is the one press and the one focus). */
const PRESSABLE =
  'a[href], area[href], button, input, select, textarea, summary, iframe, embed, object, audio[controls], video[controls], [tabindex], [contenteditable], [role="button"], [role="link"], [role="checkbox"], [role="switch"]';

function refusal(title: string, inner: Element) {
  return new Error(`hub PickCard: "${title}" holds a <${inner.tagName.toLowerCase()}> you can press or focus; a card is one press`);
}

export function PickCard({ title, mark, end, endIcon, line, note, meta, metaParts, here, isSelected, isDisabled, disabledReason, onPress, ref, className }: PickCardProps) {
  const row = useContext(PickCardRow);
  // line, note and meta are text; mark and end are nodes (a Monogram, a StatusPill), so in development a card that
  // draws anything pressable inside it (a removable Tag, a link, a tip) is refused, whatever value carried it in.
  const self = useRef<HTMLElement | null>(null);
  const mine = (el: HTMLElement | null) => {
    self.current = el;
    if (row) return;
    // Hand the standalone card's button to the page as well.
    if (typeof ref === 'function') ref(el as HTMLButtonElement | null);
    else if (ref) (ref as { current: HTMLButtonElement | null }).current = el as HTMLButtonElement | null;
  };
  useLayoutEffect(() => {
    if (!import.meta.env.DEV) return;
    const inner = self.current?.querySelector(PRESSABLE);
    if (inner) throw refusal(title, inner);
  });
  // A piece inside mark or end can mount a control later on its own, without this card rendering again: in development
  // a watch on the card's subtree sees it and the refusal goes through React (a state update that throws), as above.
  const titleNow = useRef(title);
  titleNow.current = title;
  const [, refuse] = useState<null>(null);
  const grid = row !== null;
  useLayoutEffect(() => {
    const el = self.current;
    if (!import.meta.env.DEV || !el || typeof MutationObserver === 'undefined') return;
    const watch = new MutationObserver(() => {
      const inner = el.querySelector(PRESSABLE);
      if (inner)
        refuse(() => {
          throw refusal(titleNow.current, inner);
        });
    });
    watch.observe(el, { subtree: true, childList: true, attributes: true, attributeFilter: ['href', 'tabindex', 'contenteditable', 'role', 'controls'] });
    return () => watch.disconnect();
  }, [grid]);
  const cut = useCardCut();
  const id = useId();
  const ids = { title: `${id}t`, end: `${id}e`, line: `${id}l`, note: `${id}n`, meta: `${id}m` };
  const named = [ids.title, end !== undefined && ids.end, line !== undefined && ids.line].filter(Boolean).join(' ');
  // The words the mono line ends with: why the card is off, else that it is the one opened last.
  const tail = isDisabled && disabledReason ? disabledReason : here;
  const described = [note !== undefined && ids.note, (meta !== undefined || tail) && ids.meta].filter(Boolean).join(' ') || undefined;
  const body = (
    <>
      <CardEdge ring />
      {mark !== undefined && <span className={s.mark}>{mark}</span>}
      <span className={s.top}>
        <span id={ids.title} className={s.title}>
          {title}
        </span>
        {end !== undefined && (
          <span id={ids.end} className={s.end}>
            {end}
          </span>
        )}
        {endIcon && (
          <span className={s.endIcon} aria-hidden="true" data-pick-end-icon="">
            <Icon name={endIcon} size="sm" />
          </span>
        )}
      </span>
      {line !== undefined && (
        <span id={ids.line} className={s.line}>
          {line}
        </span>
      )}
      {note !== undefined && (
        <span id={ids.note} className={s.note}>
          {note}
        </span>
      )}
      {(meta !== undefined || tail) && (
        <span id={ids.meta} className={cx(s.meta, metaParts && s.metaLine)}>
          {metaParts ? metaParts.map((part, i) => <span key={i} className={s.metaPart}>{part}</span>) : meta}
          {!metaParts && meta !== undefined && tail && <span aria-hidden="true"> · </span>}
          {tail && (
            <span className={cx(s.hereWords, metaParts && s.metaPart, metaParts && s.metaFirst)} data-here-words={tail === here ? '' : undefined} data-off-words={tail === here ? undefined : ''}>
              {tail}
            </span>
          )}
        </span>
      )}
    </>
  );
  const look = cx(s.card, mark === undefined && s.noMark, (here || isSelected) && s.here, isDisabled && s.off, className);
  if (row) {
    // In a grid the row is the button: the card draws its states and the row's text value names it. React Aria adds the
    // row's description slot to that name, so the "you were here" words go there (read with the name when the row
    // has focus); the note and mono line stay in the cell, read in browse mode.
    return (
      <div
        ref={mine}
        className={look}
        {...cut}
        data-card-ring=""
        data-pick-card=""
        data-here={here ? '' : undefined}
        data-selected={isSelected ? '' : undefined}
        data-hovered={row.hovered || undefined}
        data-pressed={row.pressed || undefined}
        data-focus-visible={row.focusVisible || undefined}
      >
        {body}
        {here && (
          <Text slot="description" className={s.srDesc}>
            {here}
          </Text>
        )}
      </div>
    );
  }
  if (import.meta.env.DEV && !onPress) throw new Error('hub PickCard: a card outside a CardGrid needs onPress');
  return (
    <AriaButton
      ref={mine}
      className={look}
      {...cut}
      data-card-ring=""
      data-pick-card=""
      data-here={here ? '' : undefined}
      data-selected={isSelected ? '' : undefined}
      // Soft-disabled: still focusable, so the reason can be reached; the press is dropped here.
      aria-disabled={isDisabled || undefined}
      aria-pressed={isSelected === undefined ? undefined : isSelected}
      onPress={isDisabled ? undefined : onPress}
      aria-labelledby={named}
      aria-describedby={described}
    >
      {body}
    </AriaButton>
  );
}
