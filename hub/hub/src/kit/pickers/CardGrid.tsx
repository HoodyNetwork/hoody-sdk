// CardGrid: PickCards in a grid that is one Tab stop. Arrow keys move between
// cards (up and down by where the cards are drawn), Home and End go to the ends, typing a letter jumps to a card whose
// name starts with it, Enter or Space picks. A React Aria GridList with the grid layout; each row owns the press and
// the focus, and the PickCard inside it only draws.
import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { GridList, GridListItem } from 'react-aria-components';
import { cx } from '../controls/Button';
import { PickCardRow } from './PickCard';
import s from './CardGrid.module.css';

export interface CardGridProps<T> {
  /** The grid's name for a screen reader ("Programs in Start here"). */
  label: string;
  items: readonly T[];
  /** A key for each item, unique in the grid. */
  keyOf: (item: T) => string;
  /** A card's name for a screen reader and for type-ahead: the name first (a letter jumps to it), then what a person
   * needs to tell it apart ("Uptime Kuma, Web page, Uptime monitor with a status page"). */
  textOf: (item: T) => string;
  /** The card for an item: a PickCard (its onPress is not used; `onPick` is the press). */
  renderCard: (item: T) => ReactNode;
  /** Called with the key of the card picked by a press, Enter or Space. */
  onPick: (key: string) => void;
  /** A key to give focus to (the card you came back from): focused once, as soon as its card is drawn; nothing while it
   * is not in the grid, and later renders with the same key do not take focus again. */
  focusKey?: string;
  /** Shown when there are no items (a kit empty or no-match state). */
  empty?: ReactNode;
  className?: string;
}

/** A grid of PickCards with one Tab stop, arrow keys, Home and End, and type-ahead. Columns fill the width at about
 * 256 px each; a narrow container (a phone) gets one card per line. */
export function CardGrid<T>({ label, items, keyOf, textOf, renderCard, onPick, focusKey, empty, className }: CardGridProps<T>) {
  const rows = useMemo(() => items.map((item) => ({ key: keyOf(item), item })), [items, keyOf]);
  // One request per focusKey value: the card it names takes focus once, when it is drawn, so a key whose card arrives
  // later (a filter, a load) is focused then, and later renders with the same key move nothing.
  const asked = useMemo(() => ({ key: focusKey }), [focusKey]);
  const done = useRef<object | null>(null);
  const settle = useCallback(() => {
    done.current = asked;
  }, [asked]);
  return (
    <GridList
      aria-label={label}
      layout="grid"
      items={rows}
      dependencies={[renderCard, textOf, asked, settle]}
      onAction={(key) => onPick(String(key))}
      renderEmptyState={empty === undefined ? undefined : () => empty}
      className={cx(s.grid, className)}
    >
      {({ key, item }) => (
        <GridListItem id={key} textValue={textOf(item)} className={s.row} data-card-key={key}>
          {({ isHovered, isPressed, isFocusVisible }) => (
            <PickCardRow.Provider value={{ hovered: isHovered, pressed: isPressed, focusVisible: isFocusVisible }}>
              {renderCard(item)}
              {asked.key === key && done.current !== asked && <FocusRow onFocused={settle} />}
            </PickCardRow.Provider>
          )}
        </GridListItem>
      )}
    </GridList>
  );
}

/** Drawn inside the row that should take focus: focuses that row once it is in the document (React Aria draws a
 * collection's rows a commit after its items change, so the grid itself cannot focus a card that has just arrived).
 * A card that arrives late never takes the focus from a control the person moved to meanwhile (the search field):
 * it is focused only while the focus is on nothing (the page body) or already in the grid; else the request ends. */
function FocusRow({ onFocused }: { onFocused: () => void }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const row = ref.current?.closest<HTMLElement>('[data-card-key]');
    if (!row) return;
    const at = document.activeElement;
    if (!at || at === document.body || row.closest('[role="grid"]')?.contains(at)) row.focus();
    onFocused();
  }, [onFocused]);
  return <span ref={ref} hidden />;
}
