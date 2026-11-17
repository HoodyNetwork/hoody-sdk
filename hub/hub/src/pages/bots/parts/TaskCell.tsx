// The Work tab's Task cell: the task's title, and under it what the task waits on ("Waiting to: …", the line that tells
// the user a Bot needs them). A render function the column's cell callback calls with its translator (no component of its
// own, so the cell's text stays in the callback as before); its own module so the terminal sibling (TaskCell.term.tsx)
// can keep it on the title's line (a one-line row would drop a second line). The web DOM is the inline cell's.
import type { Translate } from '@kit';
import type { Delegate } from '../data';
import { plainLine, scrubSecrets } from '../logic';
import type strings from '../strings.en.json';
import s from './pane.module.css';

export function taskCell(task: Delegate, t: Translate<typeof strings>) {
  return (
    <div className={s.taskCell}>
      <span className={s.cellText}>{plainLine(scrubSecrets(task.title), 80)}</span>
      {task.waitingOn && <span className={s.help}>{t('work.waitingOn', { what: plainLine(scrubSecrets(task.waitingOn), 140) })}</span>}
    </div>
  );
}
