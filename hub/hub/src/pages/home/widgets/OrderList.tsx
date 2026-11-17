// The Customize list: one row per Home card with its show switch (named by the card alone: the section says what the
// switches do), the up/down buttons and a drag grip. Three ways to
// the same order: drag a row by its grip (pointer, touch included), press the up/down buttons, or Alt+Up/Alt+Down on
// any control of a row. A drop moves the card to its place with moveKeyTo, which reaches the order the buttons reach
// one place at a time. The grip is pointer-only and hidden from assistive tech: the buttons are its keyboard and
// single-pointer equivalent. A cancelled pointer, or a drop back in its own place, moves nothing.
import { Icon, IconButton, Switch, useStrings } from '@kit';
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import homeStrings from '../strings.en.json';
import { dropIndex } from './order';
import strings from './strings.en.json';
import s from './widgets.module.css';

interface Props {
  all: readonly { key: string; title: string }[];
  hiddenKeys: ReadonlySet<string>;
  onToggle: (key: string, show: boolean) => void;
  onMove: (key: string, delta: -1 | 1) => void;
  onMoveTo: (key: string, to: number) => void;
}

interface Drag {
  key: string;
  from: number;
  to: number;
  mids: number[];
  pointer: number;
}

export function OrderList({ all, hiddenKeys, onToggle, onMove, onMoveTo }: Props) {
  const th = useStrings(homeStrings);
  const t = useStrings(strings);
  const list = useRef<HTMLUListElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  // The drag as handlers see it, set together with the state (a second press in the same frame sees the first).

  const rowKeys = (key: string) => (e: { altKey: boolean; key: string; preventDefault: () => void }) => {
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      onMove(key, e.key === 'ArrowUp' ? -1 : 1);
    }
  };

  const start = (key: string, from: number) => (e: ReactPointerEvent<HTMLSpanElement>) => {
    // One drag at a time: a second pointer cannot take over the row being dragged.
    if (e.button !== 0 || !list.current || dragRef.current) return;
    e.preventDefault();
    const rows = Array.from(list.current.children) as HTMLElement[];
    const mids = rows.map((r) => {
      const b = r.getBoundingClientRect();
      return b.top + b.height / 2;
    });
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* an old browser keeps moves on the grip */ }
    const d = { key, from, to: from, mids, pointer: e.pointerId };
    dragRef.current = d;
    setDrag(d);
  };
  const move = (e: ReactPointerEvent<HTMLSpanElement>) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointer) return;
    const to = dropIndex(d.mids, d.from, e.clientY);
    if (to !== d.to) {
      dragRef.current = { ...d, to };
      setDrag(dragRef.current);
    }
  };
  const end = (drop: boolean) => (e: ReactPointerEvent<HTMLSpanElement>) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointer) return;
    dragRef.current = null;
    setDrag(null);
    if (drop && d.to !== d.from) onMoveTo(d.key, d.to);
  };

  const dropMark = (i: number): 'before' | 'after' | undefined => {
    if (!drag || drag.to === drag.from || i !== drag.to) return undefined;
    return drag.to < drag.from ? 'before' : 'after';
  };

  return (
    <ul className={s.list} ref={list} aria-label={t('order.list')}>
      {all.map((w, i) => (
        <li key={w.key} className={s.row} data-key={w.key} data-dragging={drag?.key === w.key || undefined} data-drop={dropMark(i)}>
          <span className={s.grip} aria-hidden="true" data-grip="" onPointerDown={start(w.key, i)} onPointerMove={move} onPointerUp={end(true)} onPointerCancel={end(false)} onLostPointerCapture={end(false)}>
            <Icon name="grip" size="sm" />
          </span>
          <span className={s.rowSwitch}>
            <Switch onKeyDown={rowKeys(w.key)} label={w.title} isSelected={!hiddenKeys.has(w.key)} onChange={(on) => onToggle(w.key, on)} />
          </span>
          <IconButton onKeyDown={rowKeys(w.key)} icon="arrow-up" label={th('customize.up', { title: w.title })} isDisabled={i === 0} onPress={() => onMove(w.key, -1)} />
          <IconButton onKeyDown={rowKeys(w.key)} icon="arrow-down" label={th('customize.down', { title: w.title })} isDisabled={i === all.length - 1} onPress={() => onMove(w.key, 1)} />
        </li>
      ))}
    </ul>
  );
}
