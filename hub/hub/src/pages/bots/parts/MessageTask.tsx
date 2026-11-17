// "Message a task": words for one of the Bot's running tasks. The agent has no way to reach a task itself, so the words go to the Bot, led
// by the task's name; the Bot passes them on at the task's next step. Sent once (C9): a lost answer reads "may have been sent", and the
// drawer then offers only to look again or to dismiss, never a second send. A message the Bot dropped unposted is not
// delivered: the drawer says so in the voice page's words and the form stays, so a new send is a new message. While the Bot
// waits on its own approval, sending declines it (the agent declines a waiting approval for any message): the drawer says
// so before Send, as the main composer does.
import { Band, Drawer, OutcomeBanner, TextField, useStrings } from '@kit';
import { useEffect, useState } from 'react';
export { openTaskOf } from './MessageTask.pure';
import { useHeldMessageTasks, useMessageTask, type Change, type Delegate, type TaskMessageAnswer } from '../data';
import { TASK_MESSAGE_MAX, plainLine, scrubSecrets, taskMessageText } from '../logic';
import strings from '../strings.en.json';
import { voiceWords } from '../voice/voiceWords';
import { DrawerFooter } from './Bits';
import s from './pane.module.css';

interface Props {
  /** The task the drawer is about; undefined = closed. */
  task: Delegate | undefined;
  onClose: () => void;
  send: Change<TaskMessageAnswer, { sessionId: string; text: string }>;
  /** The Bot waits on its own approval: a message declines it. */
  declines?: boolean;
}

type HostProps = { botKey: string; task: Delegate | undefined; onClose: () => void; reads: ReadonlyArray<{ refetch: () => unknown }>; declines?: boolean };
export function MessageTaskHost(props: HostProps) {
  return <TaskMessage key={props.task?.sessionId ?? ''} {...props} />;
}

function TaskMessage({ botKey, task, onClose, reads, declines }: HostProps) {
  const send = useMessageTask(botKey, task?.sessionId ?? '', reads);
  return <MessageTaskDrawer task={task} onClose={onClose} send={send} declines={declines} />;
}

/** One unresolved message, shown on its own change so Stop tracking frees exactly this task's hold. Nothing when it is not unresolved. */
function PendingMessage({ botKey, sessionId, title }: { botKey: string; sessionId: string; title: string | undefined }) {
  const t = useStrings(strings);
  const send = useMessageTask(botKey, sessionId, []);
  if (send.outcome !== 'pending') return null;
  const name = title ? plainLine(scrubSecrets(title), 80) : t('task.pendingGone');
  return (
    <div className={s.pinned}>
      <OutcomeBanner kind="pending" /* noDetails: an unknown outcome has no rejection to show; the words say what to check */ title={t('task.pendingTitle', { title: name })} body={t('task.msgMaybeBody')} onDismiss={() => send.dismiss()} />
    </div>
  );
}

/**
 * Every message about a task of this Bot that may have been sent and is not settled, wherever the task is now (still listed, finished or
 * gone, after a reload): the Bot's pane keeps them in reach. The task whose form is open shows its own.
 */
export function PendingMessages({ botKey, tasks, openId }: { botKey: string; tasks: readonly Delegate[]; openId: string | undefined }) {
  const ids = useHeldMessageTasks(botKey);
  return (
    <>
      {ids
        .filter((id) => id !== openId)
        .map((id) => (
          <PendingMessage key={id} botKey={botKey} sessionId={id} title={tasks.find((d) => d.sessionId === id)?.title} />
        ))}
    </>
  );
}

export function MessageTaskDrawer({ task, onClose, send, declines = false }: Props) {
  const t = useStrings(strings);
  const [text, setText] = useState('');
  const open = task !== undefined;
  const sessionId = task?.sessionId;
  useEffect(() => {
    if (open) {
      setText('');
      send.reset();
    }
    // A fresh form for each task the drawer opens on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, sessionId]);
  const clean = text.trim();
  const tooLong = text.length > TASK_MESSAGE_MAX;
  // A dropped message was answered, but never reaches the task: it is not sent, and the form stays for a new one.
  const dropped = send.outcome === 'done' && typeof send.data?.dropped === 'string';
  const sent = send.outcome === 'done' && !dropped;
  const close = () => {
    send.reset();
    onClose();
  };
  const title = task ? plainLine(scrubSecrets(task.title), 80) : '';
  return (
    <Drawer overlayId="bots-message-task-drawer" resizeKey="bots-message-task"
      isOpen={open}
      onOpenChange={(o) => !o && close()}
      size="md"
      title={t('task.msgTitle', { title })}
      subtitle={t('task.msgDesc')}
      dirty={clean !== '' && !sent}
      footer={
        <DrawerFooter
          cancelLabel={sent ? t('ui.close') : t('ui.cancel')}
          submitLabel={sent ? t('ui.close') : t('task.msgSend')}
          busy={send.running}
          pending={send.outcome === 'pending'}
          isDisabled={!sent && (clean === '' || tooLong || send.outcome === 'pending')}
          onSubmit={() => {
            if (sent) return close();
            if (task) void send.run({ sessionId: task.sessionId, text: taskMessageText(task, text) });
          }}
          note={
            <>
              {send.outcome === 'pending' && <OutcomeBanner kind="pending" /* noDetails: an unknown outcome has no rejection to show; the words say what to check */ title={t('task.msgMaybe')} body={t('task.msgMaybeBody')} onDismiss={() => send.dismiss()} />}
              {declines && !sent && send.outcome !== 'pending' && <Band tone="warn" size="table" /* noDetails: what a send does, not a rejection */>{t('say.declines')}</Band>}
              {dropped && <OutcomeBanner kind="failed" /* noDetails: the Bot's answer names its reason, and the words say it */ title={voiceWords('textDropped', send.data?.dropped)} />}
              {send.outcome === 'failed' && <OutcomeBanner kind="failed" /* noDetails: the change keeps only the refusal's code and details, not the rejection; the form says plainly that nothing was sent */ title={t('task.msgFailed')} />}
              {sent && <p className={s.help}>{t(send.data?.queued ? 'task.msgQueued' : 'task.msgSent')}</p>}
            </>
          }
        />
      }
    >
      <div className={s.drawerForm}>
        <TextField
          label={t('task.msgLabel')}
          description={t('task.msgHelp')}
          multiline
          rows={5}
          value={text}
          onChange={setText}
          isDisabled={sent || send.outcome === 'pending'}
          errorMessage={tooLong ? t('task.msgTooLong', { max: String(TASK_MESSAGE_MAX) }) : undefined}
        />
      </div>
    </Drawer>
  );
}
