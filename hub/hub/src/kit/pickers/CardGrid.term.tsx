// CardGrid in the terminal (the web's CardGrid.tsx): PickCards in rows of cards about 32 columns wide (the web's 256 px),
// one card a line when the pane is narrow. One Tab stop with a cursor: ←/→ move one card, ↑/↓ one row (by where the cards
// are drawn), Home/End go to the ends, a letter jumps to the next card whose name starts with it, Enter or Space picks.
// A click picks the card under it. `focusKey` puts the cursor (and the focus) on that card once, when it is drawn.
// Each card is named for the semantics tree by `textOf` (a grid row); the cards themselves only draw.
import { useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';
import type * as Web from './CardGrid';
import { Box, isPressKey, usePaneSize, useFocusable, type Focusable } from '../../term/prim';
import { mergeRefs, useSem } from '../../term/prim/semantics';
import type { BoxRenderable } from '../../term/prim/otui';
import { PickCardRow } from './pickCardRow';

export type { CardGridProps } from './CardGrid';

/** A card's width in columns (the web's 256 px at 8 px a column) and the gap between cards. */
const CARD_COLS = 32;
const GAP = 1;

function CardRow({ width, name, focus, onPress, children }: { width: number; name: string; focus: Focusable; onPress: () => void; children: ReactNode }) {
  const semRef = useSem({ role: 'row', name, selected: focus.focused }, { focus });
  return <Box boxRef={semRef} width={width} shrink={0} onPress={onPress}>{children}</Box>;
}

export function CardGrid<T>({ label, items, keyOf, textOf, renderCard, onPick, focusKey, empty }: Web.CardGridProps<T>): ReactElement {
  const pane = usePaneSize();
  const per = Math.max(1, Math.floor((pane.cols + GAP) / (CARD_COLS + GAP)));
  const width = per === 1 ? pane.cols : CARD_COLS;
  const keys = useMemo(() => items.map(keyOf), [items, keyOf]);
  const [cursor, setCursor] = useState<string | null>(null);
  const at = Math.max(0, cursor === null ? 0 : keys.indexOf(cursor));
  const go = (i: number) => { const k = keys[Math.max(0, Math.min(keys.length - 1, i))]; if (k !== undefined) setCursor(k); };
  const f = useFocusable({
    disabled: items.length === 0,
    onKey: (k) => {
      if (k.name === 'right') { go(at + 1); return true; }
      if (k.name === 'left') { go(at - 1); return true; }
      if (k.name === 'down') { if (at + per < keys.length) go(at + per); return true; }
      if (k.name === 'up') { if (at - per >= 0) go(at - per); return true; }
      if (k.name === 'home') { go(0); return true; }
      if (k.name === 'end') { go(keys.length - 1); return true; }
      if (isPressKey(k)) { const key = keys[at]; if (key !== undefined) onPick(key); return true; }
      const ch = k.sequence;
      if (!k.ctrl && !k.meta && typeof ch === 'string' && ch.length === 1 && ch > ' ') {
        // The next card after the cursor whose name starts with the letter (React Aria's type-ahead, one letter).
        for (let n = 1; n <= keys.length; n++) {
          const i = (at + n) % keys.length;
          if (textOf(items[i]!).toLowerCase().startsWith(ch.toLowerCase())) { go(i); break; }
        }
        return true;
      }
      return false;
    },
  });
  // focusKey: once per value, as soon as its card is drawn.
  const asked = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (focusKey === undefined || asked.current === focusKey || !keys.includes(focusKey)) return;
    asked.current = focusKey;
    setCursor(focusKey);
    f.focus();
  });
  const semRef = useSem({ role: 'grid', name: label }, { focus: f });
  const ref = useMemo(() => mergeRefs<BoxRenderable>(f.ref, semRef), [f.ref, semRef]);
  if (items.length === 0 && empty !== undefined) return <>{empty}</>;
  return (
    <Box boxRef={ref} dir="row" wrap gapX={GAP} gapY={0} shrink={0}>
      {items.map((item, i) => {
        const key = keys[i]!;
        const here = i === at;
        // A row's focus handle stands for the grid's: focusing it moves the cursor there and focuses the grid, so
        // focus / press / click on a row act on that row (the web's GridList rows each take the focus).
        const proxy: Focusable = { focused: here && f.focused, ref: f.ref, focus: () => { setCursor(key); f.focus(); }, blur: f.blur };
        return (
          <CardRow key={key} width={width} name={textOf(item)} focus={proxy} onPress={() => { setCursor(key); f.focus(); onPick(key); }}>
            <PickCardRow.Provider value={{ hovered: false, pressed: false, focusVisible: here && f.focused }}>
              {renderCard(item)}
            </PickCardRow.Provider>
          </CardRow>
        );
      })}
    </Box>
  );
}
