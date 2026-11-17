// The one handle between two panes measured in pixels (the list beside a detail, an inspector, the AI rail), and the
// remembered width behind it. kit Splitter (percentages, the board's panes) is a different tool.
import { type KeyboardEvent, type PointerEvent, type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cx } from '../controls/Button';
import { readPaneWidth, writePaneWidth, type PaneRange } from './paneWidth';
import s from './PaneSeparator.module.css';

export type { PaneRange } from './paneWidth';

const STEP = 16;

const readWidth = readPaneWidth;
const writeWidth = writePaneWidth;

/** A pane's width, remembered on this device under `hub.v3.pane.<key>.<kind>`; a stored value outside the range reads as the default. */
export function usePaneWidth(key: string | undefined, kind: string, range: PaneRange): [number, (w: number) => void] {
  const [w, setW] = useState(() => readWidth(key, kind, range));
  useEffect(() => writeWidth(key, kind, w), [key, kind, w]);
  return [w, setW];
}

/** An element's content width while `on` (undefined before it is measured or without ResizeObserver). */
export function useElementWidth(ref: RefObject<HTMLElement | null>, on: boolean): number | undefined {
  const [w, setW] = useState<number>();
  const [el, setEl] = useState<HTMLElement | null>(null);
  // A ref holds no signal: the element can come after the first commit, or be replaced, so each commit looks.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- runs each commit on purpose; the same element is no update, so it settles at once
  useLayoutEffect(() => setEl(on ? ref.current : null));
  useLayoutEffect(() => {
    if (!el || typeof ResizeObserver === 'undefined') return;
    const put = () => setW(el.clientWidth);
    put();
    const ro = new ResizeObserver(put);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);
  return w;
}

export interface PaneSeparatorProps {
  /** The drawn width, which is what keys, a drag and ARIA work from: a stored width wider than the room never makes it lag. */
  value: number;
  range: PaneRange;
  onChange: (w: number) => void;
  /** 1: the pane is on the handle's start side; -1: on its end side. */
  dir: 1 | -1;
  label: string;
  className?: string;
}

/** A focusable window splitter: drag, ←/→ in 16 px steps, Home and End, Enter and double-click reset. */
export function PaneSeparator({ value, range, onChange, dir, label, className }: PaneSeparatorProps) {
  const drag = useRef<{ x: number; w: number } | null>(null);
  const clamp = (w: number) => Math.min(range.max, Math.max(range.min, w));
  const rtl = () => (document.documentElement.dir === 'rtl' ? -1 : 1);
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    drag.current = { x: e.clientX, w: value };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    onChange(clamp(drag.current.w + (e.clientX - drag.current.x) * dir * rtl()));
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    drag.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };
  // A cancelled or lost pointer ends the drag too, or the next move with no button down would still resize.
  const stop = () => {
    drag.current = null;
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const k = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
    if (k !== 0) onChange(clamp(value + k * STEP * dir * rtl()));
    else if (e.key === 'Enter') onChange(range.def);
    else if (e.key === 'Home') onChange(range.min);
    else if (e.key === 'End') onChange(range.max);
    else return;
    e.preventDefault();
  };
  return (
    // A focusable separator is the ARIA window-splitter pattern; jsx-a11y does not know it.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      className={cx(s.handle, className)}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuemin={range.min}
      aria-valuemax={range.max}
      aria-valuenow={Math.round(value)}
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={stop}
      onLostPointerCapture={stop}
      onKeyDown={onKeyDown}
      onDoubleClick={() => onChange(range.def)}
    />
  );
}
