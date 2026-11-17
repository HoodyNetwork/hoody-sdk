// The page header's summary line: the counts sentence (its parts already joined with " · "), then each link (Computers,
// Programs) after its own " · ". Its own part so the terminal (SummaryLine.term.tsx) can keep every separator with the
// part after it: there a wrapping line must never end on a dot. The web does the same: each link is one unbreakable part
// that starts with a no-break space, which no line may break before, so a wrapped line starts with the dot and never ends
// on one.
import { Fragment, type ReactNode } from 'react';
import s from './SummaryLine.module.css';

export interface SummaryLineProps {
  lead: string;
  /** `text`: the words the node draws, for the terminal's line packing (the web does not read it). */
  after: readonly { key: string; node: ReactNode; text: string }[];
}

export function SummaryLine({ lead, after }: SummaryLineProps) {
  return (
    <>
      {lead}
      {after.map((a) => (
        <Fragment key={a.key}>
          {' ·'}
          <span className={s.part}>
            {'\u00a0'}
            {a.node}
          </span>
        </Fragment>
      ))}
    </>
  );
}
