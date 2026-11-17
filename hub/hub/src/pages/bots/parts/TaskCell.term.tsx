// The Work tab's Task cell in the terminal: one line, as a table row is. The web's second line ("Waiting to: …", what
// the task waits on: a Bot needs the user) stays on the title's line: a clock in the mark gutter (never gives way; its
// label is the whole sentence) and a "Waiting" tag after the title whose tip shows the whole sentence on focus or press.
import { Icon, Tag, type Translate } from '@kit';
import { MarkCell } from '../../../kit/data/cells';
import type { Delegate } from '../data';
import { plainLine, scrubSecrets } from '../logic';
import type strings from '../strings.en.json';
import type * as Web from './TaskCell';

function TaskCell({ task, t }: { task: Delegate; t: Translate<typeof strings> }) {
  const waiting = task.waitingOn ? t('work.waitingOn', { what: plainLine(scrubSecrets(task.waitingOn), 140) }) : undefined;
  return (
    <MarkCell
      mark={waiting ? <Icon name="clock" size="sm" label={waiting} /> : undefined}
      after={waiting ? <Tag tone="warn" tip={waiting}>{t('work.waiting')}</Tag> : undefined}
    >
      {plainLine(scrubSecrets(task.title), 80)}
    </MarkCell>
  );
}

export const taskCell: typeof Web.taskCell = (task, t) => <TaskCell task={task} t={t} />;
