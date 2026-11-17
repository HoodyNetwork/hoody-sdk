// The detail parts' small wrappers that only carry a class of parts.module.css (or none): a part that draws them through
// here imports no stylesheet and holds no raw element of its own, so the terminal draws it with PartBits.term.tsx.
import type { ReactNode } from 'react';
import s from './parts.module.css';

/** A part's sections, one under the other (.stack). */
export function PartStack({ children }: { children: ReactNode }) {
  return <div className={s.stack}>{children}</div>;
}

/** A value's pieces side by side: words with a link, an icon with a name (.idRow). */
export function IdRow({ children }: { children: ReactNode }) {
  return <span className={s.idRow}>{children}</span>;
}

/** A short machine value in the mono face (.mono). */
export function Mono({ children }: { children: ReactNode }) {
  return <code className={s.mono}>{children}</code>;
}

/** One sentence: a line of its own in a stack, part of the running text inside a band. */
export function Line({ children }: { children: ReactNode }) {
  return <span>{children}</span>;
}

/** The size upgrade link on a row of its own, at the start (.ovUpgrade). */
export function UpgradeRow({ children }: { children: ReactNode }) {
  return <div className={s.ovUpgrade}>{children}</div>;
}

/** The class that gives a text button its touch height on a coarse pointer (.touch). */
export const touchClass = s.touch;
