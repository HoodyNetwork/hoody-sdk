// Which computer: a computer's own colour as a small rounded square. Next to a computer, round = its state,
// square = which computer. Decorative: the computer's name always sits beside it.
import type { CSSProperties } from 'react';
import { computerColor } from '@core';
import { cx } from '../controls/Button';
import s from './ComputerMark.module.css';

export interface ComputerMarkProps {
  /** The computer's colour as the API or a list gives it. The mark normalises it itself; anything that is not a hex
   * colour draws nothing. */
  color: string | null | undefined;
  /** sm = 10 px (lists, menus, pickers), md = 12 px (a title line). */
  size?: 'sm' | 'md';
  className?: string;
}

/** The computer's colour mark, or nothing when it has no valid colour. */
export function ComputerMark({ color, size = 'sm', className }: ComputerMarkProps) {
  const c = computerColor({ color: color ?? undefined });
  if (!c) return null;
  return <span className={cx(s.mark, size === 'md' && s.md, className)} aria-hidden="true" data-computer-color={c} style={{ ['--computer' as string]: c } as CSSProperties} />;
}
