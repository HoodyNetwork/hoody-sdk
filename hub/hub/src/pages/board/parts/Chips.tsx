// Tile chips: one tile at a time. A chip per slot in reading order ("program-N · computer" with
// the live dot, "Empty" for an empty slot), the current one in the selected style; tap switches, long press (500 ms)
// or the menu key opens the tile menu; ＋ at the end adds a tile. On phones the Board menu button starts the row.
// A Board that pages (tiles past a page) also gets the pager: its page count and Previous and Next page, before the ＋.
// A tile header dragged onto a chip swaps the two: the chip under the pointer is drawn as the drop place.
import { IconButton, StripMore, Tag, useStripEdges, cx } from '@kit';
import { useRef, type ReactNode } from 'react';
import { useT } from './text';
import s from './board.module.css';
import type { TileInfo } from './tileInfo';

export const LONG_PRESS_MS = 500;

export interface ChipsPager {
  page: number;
  pages: number;
  onStep: (step: 1 | -1) => void;
}

export interface ChipsProps {
  infos: readonly TileInfo[];
  current: string;
  canAdd: boolean;
  addReason: string;
  onSelect: (slot: string) => void;
  onMenu: (slot: string) => void;
  onAdd: () => void;
  pager?: ChipsPager | null;
  start?: ReactNode;
  end?: ReactNode;
  /** The slot whose chip a tile drag would drop on now, drawn as the drop place. */
  dropTarget?: string | null;
}

/**
 * The tile chip under a point, for a tile drag: its slot, or null over anything else. jsdom and a browser both answer
 * from what is drawn (elementFromPoint), so a chip scrolled away under a still pointer is no longer under it.
 */
export function chipDropAt(x: number, y: number): string | null {
  const el = typeof document.elementFromPoint === 'function' ? document.elementFromPoint(x, y) : null;
  return el?.closest('[data-chip-slot]')?.getAttribute('data-chip-slot') ?? null;
}

export function Chips(p: ChipsProps) {
  const t = useT();
  const { ref, edges, fadeClassName } = useStripEdges<HTMLDivElement>(p.current, '[aria-current="true"]');
  const press = useRef<{ timer: ReturnType<typeof setTimeout>; fired: boolean } | null>(null);
  const down = (slot: string) => {
    const st = { fired: false, timer: setTimeout(() => { st.fired = true; p.onMenu(slot); }, LONG_PRESS_MS) };
    press.current = st;
  };
  const up = () => { if (press.current) clearTimeout(press.current.timer); };
  return (
    <div className={s.chips}>
      {p.start}
      <StripMore side="start" edges={edges} scroller={ref} />
      <div ref={ref} className={cx(s.chipScroller, fadeClassName)} role="toolbar" aria-label={t('chips')}>
        {p.infos.map((i) => (
          <button
            key={i.slot}
            type="button"
            className={cx(s.chipBtn, !i.tile && s.chipEmpty)}
            aria-current={i.slot === p.current ? 'true' : undefined}
            data-chip-slot={i.slot}
            data-drop-target={p.dropTarget === i.slot ? '' : undefined}
            onPointerDown={() => down(i.slot)}
            onPointerUp={up}
            onPointerLeave={up}
            onPointerCancel={up}
            onContextMenu={(e) => { e.preventDefault(); p.onMenu(i.slot); }}
            onKeyDown={(e) => { if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) { e.preventDefault(); p.onMenu(i.slot); } }}
            onClick={() => { if (press.current?.fired) { press.current = null; return; } p.onSelect(i.slot); }}
          >
            {i.tile && <span className={cx(s.dot, i.state === 'live' ? s.dotLoaded : s.dotStopped)} aria-hidden="true" />}
            <span className={s.chipsText}>{i.label}</span>
          </button>
        ))}
      </div>
      <StripMore side="end" edges={edges} scroller={ref} />
      {p.pager && <Tag>{t('pager.count', { page: p.pager.page + 1, pages: p.pager.pages })}</Tag>}
      {p.pager && <IconButton icon="chevron-left" label={t('pager.prev')} isDisabled={p.pager.page <= 0} onPress={() => p.pager?.onStep(-1)} />}
      {p.pager && <IconButton icon="chevron-right" label={t('pager.next')} isDisabled={p.pager.page >= p.pager.pages - 1} onPress={() => p.pager?.onStep(1)} />}
      <IconButton icon="plus" label={p.canAdd ? t('board.addProgram') : p.addReason} onPress={p.onAdd} isDisabled={!p.canAdd} />
      {p.end}
    </div>
  );
}
