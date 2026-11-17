// Detail header, the line under the name: server · project · Current computer. The "·" between items and the rule that
// no line starts or ends with one are CSS (parts.module.css .headLine / .headItem).
import type { ReactNode } from 'react';
import s from './parts.module.css';

export function HeadLine({ children }: { children: ReactNode }) {
  return <span className={s.headLine}>{children}</span>;
}

export function HeadItem({ children }: { children: ReactNode }) {
  return <span className={s.headItem}>{children}</span>;
}
