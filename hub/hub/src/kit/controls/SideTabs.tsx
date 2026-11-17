// SideTabs: a vertical pick list at the start of a framed block, its picked row opening into the panel beside it (the
// "plate rail": Guide Connect's ways in). Use it when a short list of named choices each shows its own panel next to
// the list; use `Tabs` for a horizontal strip over panels, `SegmentedControl` for a choice that owns no panel. Rows are
// flat (one rule between rows, no plate frame or cut); the picked row takes the panel's colour, a 4 px bar at its
// start, and covers the rail's line so it joins the panel. The rail draws its own fill and end line; the caller draws
// the frame around rail and panel and the panel itself (`--hx-plate-bg`).
//
// Each row is a toggle button (aria-pressed) in a named group, reachable by Tab. Arrow keys (Up/Left, Down/Right),
// Home and End pick the previous, next, first or last row and move focus to it; in a right-to-left page Left and
// Right swap. Picking changes nothing but `value` through `onChange`.
import { type KeyboardEvent, useRef } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { cx } from './Button';
import s from './SideTabs.module.css';

export interface SideTabItem<K extends string = string> {
  id: K;
  /** A resolved string. */
  label: string;
}

export interface SideTabsProps<K extends string = string> {
  items: readonly SideTabItem<K>[];
  value: K;
  onChange: (id: K) => void;
  /** The group's accessible name (a resolved string). */
  label: string;
  className?: string;
}

export function SideTabs<K extends string>({ items, value, onChange, label, className }: SideTabsProps<K>) {
  const list = useRef<HTMLDivElement>(null);

  const onKeyDown = (e: Pick<KeyboardEvent, 'key' | 'preventDefault'>) => {
    const rtl = list.current ? getComputedStyle(list.current).direction === 'rtl' : false;
    const back = e.key === 'ArrowUp' || e.key === (rtl ? 'ArrowRight' : 'ArrowLeft');
    const forward = e.key === 'ArrowDown' || e.key === (rtl ? 'ArrowLeft' : 'ArrowRight');
    const i = items.findIndex((it) => it.id === value);
    let next: number;
    if (forward) next = Math.min(i + 1, items.length - 1);
    else if (back) next = Math.max(i - 1, 0);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = items.length - 1;
    else return;
    e.preventDefault();
    const target = items[next];
    if (!target) return;
    if (target.id !== value) onChange(target.id);
    list.current?.querySelectorAll<HTMLElement>('[data-side-tab]')[next]?.focus();
  };

  return (
    <div className={cx(s.rail, className)} role="group" aria-label={label} ref={list}>
      {items.map((it) => (
        <AriaButton
          key={it.id}
          className={s.row}
          data-side-tab={it.id}
          aria-pressed={it.id === value}
          data-picked={it.id === value ? '' : undefined}
          onKeyDown={onKeyDown}
          onPress={() => onChange(it.id)}
        >
          {it.label}
        </AriaButton>
      ))}
    </div>
  );
}
