// StepList: the "how" of one step in a drawer or a section, as numbered one-line actions grouped by where they happen.
// Use Track instead for the stateful steps of a whole setup (a StepList sits in a Track step's body), SystemSteps when
// the one step differs per system. For panels: the Guide's prose step lists are that page's own.
// Text the person types or pastes is a CodeLine (kit/data/Ids) inside the row; a button in someone else's app is bold.
import { useId, type ReactNode } from 'react';
import { ExtLink } from '../controls/Link';
import { cx } from '../controls/Button';
import { stepNumber, useStepTextWarning } from './StepList.pure';
import s from './StepList.module.css';

export interface StepListItem {
  /** A stable key when rows are added or removed. */
  id?: string;
  /** The action, one line, verb first, 70 characters at most ("Send /setprivacy to @BotFather"). */
  text: ReactNode;
  /** A consequence on a second, small, muted line ("Your bot then reads every message in groups"). */
  note?: ReactNode;
  /** A control at the row's end, when the row asks for something in the Hub (a field, a switch, a button). */
  act?: ReactNode;
}

export interface StepListGroup {
  /** Where the rows happen, shown in mono caps ("In Telegram", "Back here"). Leave it out for a list with one place. */
  where?: string;
  /** The place, when it can be opened: its link sits at the end of the label rule ("Open @BotFather"). */
  open?: { label: string; url: string };
  items: readonly StepListItem[];
}

export interface StepListProps {
  /** The list's accessible name ("How to turn privacy off"). */
  label: string;
  groups: readonly StepListGroup[];
  className?: string;
}

export { readableText, stepNumber, STEP_TEXT_MAX } from './StepList.pure';

/** Numbered one-line actions, verb first, in groups under a mono-caps label naming where they happen ("In Telegram",
 * "Back here"); the numbers run on across groups (01, 02 | 03). A row may carry a second, muted line for its
 * consequence and a control at its end (under 600 px of the list's own width the control drops under the text); a
 * group's place, when it can be opened, has its link at the end of the label rule. Use Track instead when the steps
 * have states and one is open at a time, SystemSteps when the step differs per system. */
export function StepList({ label, groups, className }: StepListProps) {
  const base = useId();
  useStepTextWarning(label, groups);
  let n = 0;
  return (
    <div className={cx(s.stepList, className)} role="group" aria-label={label}>
      {groups.map((g, gi) => {
        const whereId = `${base}-w${gi}`;
        const first = n + 1;
        n += g.items.length;
        return (
          <div key={g.where ?? gi} className={s.group}>
            {(g.where || g.open) && (
              <div className={s.where}>
                {g.where && (
                  <span id={whereId} className={s.whereLabel}>
                    {g.where}
                  </span>
                )}
                <span className={s.rule} aria-hidden="true" />
                {g.open && (
                  <ExtLink url={g.open.url} look="nav" className={s.open}>
                    {g.open.label}
                  </ExtLink>
                )}
              </div>
            )}
            {/* The visible numbers replace the markers; `start` keeps the list's own count running across groups. */}
            <ol className={s.items} start={first} {...(g.where ? { 'aria-labelledby': whereId } : {})}>
              {g.items.map((it, i) => (
                <li key={it.id ?? i} className={cx(s.item, it.act != null && s.withAct)}>
                  <span className={s.num}>{stepNumber(first + i)}</span>
                  <span className={s.body}>
                    <span className={s.text}>{it.text}</span>
                    {it.note != null && <span className={s.note}>{it.note}</span>}
                  </span>
                  {it.act != null && <span className={s.act}>{it.act}</span>}
                </li>
              ))}
            </ol>
          </div>
        );
      })}
    </div>
  );
}
