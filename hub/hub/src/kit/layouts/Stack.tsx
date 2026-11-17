// Stack and Row: spacing between children on the token scale, so pages never write margins. For a whole page use an
// archetype (TablePage, DetailPage, SettingsPage, …) or PageFrame; `padding="page"` is for the rare page that is neither.
import type { ReactNode } from 'react';
import { cx } from '../controls/Button';
import s from './Stack.module.css';

type Gap = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface StackProps {
  gap?: Gap;
  /** Inner padding: 'page' matches the page gutters. */
  padding?: 'none' | 'sm' | 'md' | 'page';
  align?: 'start' | 'center' | 'end' | 'stretch';
  className?: string;
  children: ReactNode;
}

export function Stack({ gap = 4, padding = 'none', align = 'stretch', className, children }: StackProps) {
  return <div className={cx(s.stack, s[`g${gap}`], s[`p_${padding}`], s[`a_${align}`], className)}>{children}</div>;
}

export interface RowProps extends StackProps {
  justify?: 'start' | 'center' | 'end' | 'between';
  wrap?: boolean;
}

export function Row({ gap = 2, padding = 'none', align = 'center', justify = 'start', wrap, className, children }: RowProps) {
  return (
    <div className={cx(s.row, s[`g${gap}`], s[`p_${padding}`], s[`a_${align}`], s[`j_${justify}`], wrap && s.wrap, className)}>
      {children}
    </div>
  );
}
