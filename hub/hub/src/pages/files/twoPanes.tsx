// Two Files panes side by side with the kit Splitter between them (view.tsx draws it when both fit). Its own module
// so the terminal draws the split with its own sibling (twoPanes.term.tsx): the share lives in an inline style here,
// which the terminal Hub does not read.
import { Splitter, useStrings } from '@kit';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { watchPaneRoom } from './paneRoom.web';
import { splitBounds } from './twoPanes.pure';
import s from './files.module.css';
import strings from './strings.en.json';

/** Two panes side by side. The grid draws the same share the splitter announces: the share is held inside the
 *  bounds the panes' measured room allows, so a pane is never squeezed below PANE_MIN by the split and a step the
 *  grid cannot show is never announced. */
export function TwoPanes({ a, b }: { a: ReactNode; b: ReactNode }) {
  const t = useStrings(strings);
  const slotA = useRef<HTMLDivElement>(null);
  const slotB = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState(0);
  const [split, setSplit] = useState(50);
  useEffect(() => {
    const el = grid.current;
    if (!el) return;
    return watchPaneRoom(el, () => setRoom((slotA.current?.clientWidth ?? 0) + (slotB.current?.clientWidth ?? 0)));
  }, []);
  const [lo, hi] = splitBounds(room);
  const value = Math.min(hi, Math.max(lo, split));
  return (
    <div ref={grid} className={s.panes} style={{ gridTemplateColumns: `minmax(0, ${value}fr) auto minmax(0, ${100 - value}fr)` }}>
      <div ref={slotA} id="files-pane-a" className={s.paneSlot}>{a}</div>
      <Splitter
        orientation="vertical"
        value={value}
        min={lo}
        max={hi}
        label={t('split.label')}
        controls="files-pane-a"
        onStep={(d) => setSplit(Math.min(hi, Math.max(lo, value + d)))}
        onEqualise={() => setSplit(50)}
      />
      <div ref={slotB} id="files-pane-b" className={s.paneSlot}>{b}</div>
    </div>
  );
}
