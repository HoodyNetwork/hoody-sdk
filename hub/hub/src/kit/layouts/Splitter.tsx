// A focusable pane divider between two panes a page sizes by ratio (Board); a ListDetail pane's width handle is
// PaneSeparator. role="separator" with its
// value, ←/→ (↑/↓ when the panes stack) step 5, Enter and double-click equalise, pointer drag. The
// kit owns the separator's semantics; the page owns the ratio maths (snaps, minimum sizes) and any
// shield over iframes while a drag runs.
import type { KeyboardEvent, PointerEvent } from 'react';
import { useRef } from 'react';
import { cx } from '../controls/Button';
import s from './Splitter.module.css';

export interface SplitterProps {
  /** 'vertical': a vertical line between side-by-side panes; 'horizontal': between stacked panes. */
  orientation: 'vertical' | 'horizontal';
  /** The first pane's share, 0..100. */
  value: number;
  min?: number;
  max?: number;
  /** What it resizes, e.g. "Resize terminal-2 and agent-1". */
  label: string;
  /** The id of the first pane. */
  controls?: string;
  /** A keyboard step, in percentage points (+ grows the first pane). */
  onStep: (delta: number) => void;
  onEqualise: () => void;
  onDragStart?: () => void;
  onDrag?: (clientX: number, clientY: number) => void;
  onDragEnd?: () => void;
  className?: string;
}

const STEP = 5;

export function Splitter({ orientation, value, min = 0, max = 100, label, controls, onStep, onEqualise, onDragStart, onDrag, onDragEnd, className }: SplitterProps) {
  const dragging = useRef<number | null>(null);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const [less, more] = orientation === 'vertical' ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown'];
    if (e.key === less || e.key === more) {
      e.preventDefault();
      onStep(e.key === more ? STEP : -STEP);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      onEqualise();
    }
  };
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || dragging.current !== null) return;
    dragging.current = e.pointerId;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    e.preventDefault();
    onDragStart?.();
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragging.current === e.pointerId) onDrag?.(e.clientX, e.clientY);
  };
  const stop = (e: PointerEvent<HTMLDivElement>) => {
    if (dragging.current !== e.pointerId) return;
    dragging.current = null;
    onDragEnd?.();
  };
  const now = Math.round(value);
  return (
    // A focusable separator is a widget (the WAI-ARIA window splitter); the lint rules see a static role.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- see above
    <div
      role="separator"
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- see above
      tabIndex={0}
      aria-orientation={orientation}
      aria-valuenow={now}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuetext={`${now} %`}
      aria-label={label}
      aria-controls={controls}
      className={cx(s.splitter, s[orientation], className)}
      onKeyDown={onKeyDown}
      onDoubleClick={onEqualise}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stop}
      onPointerCancel={stop}
      onLostPointerCapture={stop}
    />
  );
}
