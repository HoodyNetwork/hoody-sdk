// ProblemList: a code check's diagnostics (a script's check errors). One list; each row a tone icon, the line number in a
// fixed mono column and the message. With `onJump` a row that has a line is one press that moves the editor there.
// Use ItemList instead for rows that are not diagnostics (titles, meta, row actions).
import type { Ref } from 'react';
import { Button as AriaButton } from 'react-aria-components';
import { SR_ONLY } from '../controls/SrOnly';
import { Icon } from '../icons';
import { useStrings } from '../strings';
import strings from './ProblemList.strings.en.json';
import s from './ProblemList.module.css';

/** One diagnostic: where it is (null: the whole file) and what it says. */
export interface Problem {
  /** A stable key; the line and message when absent. */
  id?: string;
  line?: number | null;
  message: string;
  /** danger (default): the check fails on it; warn: worth knowing, nothing fails. */
  tone?: 'danger' | 'warn';
}

export interface ProblemListProps {
  /** The list's accessible name ("Problems"). */
  label: string;
  problems: readonly Problem[];
  /** Moves the editor to the line: makes every row that has a line a press. */
  onJump?: (line: number) => void;
  /** The first row as a focus target (tabIndex -1: by script only, never a Tab stop), for a page that moves focus to the
   *  problems when a check finds them. */
  firstRef?: Ref<HTMLLIElement>;
}

/** A code check's diagnostics, line-numbered, each row optionally a jump to its line. Draws nothing for none. */
export function ProblemList({ label, problems, onJump, firstRef }: ProblemListProps) {
  const t = useStrings(strings);
  if (problems.length === 0) return null;
  return (
    <ul className={s.list} aria-label={label}>
      {problems.map((p, i) => {
        const tone = p.tone ?? 'danger';
        const line = typeof p.line === 'number' ? p.line : null;
        const lineWords = line === null ? '' : `${t('problem.line', { line: String(line) })} `;
        // The number is drawn in its column; the words "Line n" are what a screen reader hears.
        const body = (
          <>
            <Icon name={tone === 'warn' ? 'warn' : 'error'} size="sm" tone={tone} className={s.icon} />
            <span className={s.line} aria-hidden="true">
              {line ?? ''}
            </span>
            {line !== null && <span className={SR_ONLY}>{lineWords}</span>}
            <span className={s.message} dir="auto">
              {p.message}
            </span>
          </>
        );
        return (
          <li
            key={p.id ?? `${line ?? ''}:${p.message}:${i}`}
            className={s.row}
            data-tone={tone}
            {...(i === 0 && firstRef ? { ref: firstRef, tabIndex: -1 } : {})}
          >
            {onJump && line !== null ? (
              <AriaButton className={s.jump} onPress={() => onJump(line)}>
                {body}
              </AriaButton>
            ) : (
              <span className={s.still}>{body}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
