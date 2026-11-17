// Say: the Activity tab's composer, text only. One message goes to the Bot itself, once, with an Idempotency-Key (useSay). A lost
// answer is "may have been sent": it is never sent again from here; Check again reads it by its key, and only a found message frees it.
// The line under a sent message ("Sent. The Bot is working on it.") stands only while that is true. It goes on the first of:
// a read of the Bot made after the send answered that shows the message's turn over (no turn running, or another turn, and
// nothing queued; a read missing those facts shows nothing); or a thread row that names the message as answered (message_ids).
// While the Bot's own approval waits, a message declines it (the agent does so when a person writes): the composer says so before Send.
// The box is the kit Composer, text only: no files, no Stop here (the Bot's Stop stays in the pane header, where its
// turn is frozen when the confirm opens).
import { Band, Composer, OutcomeBanner, useStrings, type ComposerNote } from '@kit';
import { useEffect, useRef, useState } from 'react';
import { useSay, type BotView, type LogRow, type SayAnswer, type SayCheck } from '../data';
import { TASK_MESSAGE_MAX } from '../logic';
import strings from '../strings.en.json';
import { useTalkSlots } from '../voice/TalkHost';
import { useChatBoxSlot } from './chatBox';
import s from './pane.module.css';

interface Props {
  bot: BotView;
  botKey: string;
  /** The thread's rows as read now; absent while the thread is unread. */
  rows?: readonly LogRow[];
  /** When the Bot (`bot`) was last read, in epoch ms; absent when not known. */
  viewAt?: number;
  /** Talk's "Open voice settings" (TalkBar, voice not ready). */
  onOpenVoiceSettings?: () => void;
}

type Shown = { t: 'answer'; answer: SayAnswer | null } | { t: 'failed'; error: unknown } | { t: 'notSent' } | { t: 'check'; check: Exclude<SayCheck, { t: 'found' }> } | null;

const NO_FILES: readonly never[] = Object.freeze([]);
const noop = () => undefined;

/** Whether a thread row names message `id` as answered. The agent writes message_ids only on the rows that end the turn that
 *  answered them (its reply, its [error], [provider] or [limit] row), so older answers, other turns and helpers' rows
 *  ([stop], [gone]) never count, whenever they reach the page. */
export const answeredIn = (rows: readonly LogRow[] | undefined, id: string): boolean => rows?.some((r) => r.messageIds?.includes(id) === true) ?? false;

export function Say({ bot, botKey, rows, viewAt, onOpenVoiceSettings }: Props) {
  const t = useStrings(strings);
  const say = useSay(botKey);
  const talk = useTalkSlots(bot, botKey, onOpenVoiceSettings ?? noop);
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // The tab's Jump to newest puts the keyboard in this box (ActivityTab), under the newest content.
  useChatBoxSlot(() => inputRef.current?.focus({ preventScroll: true }));
  const [shown, setShown] = useState<Shown>(null);
  const clean = text.trim();
  const tooLong = text.length > TASK_MESSAGE_MAX;
  const locked = say.held || say.sending;
  // The draft stays editable while a message is sending or held (kit Composer), so a finished send clears the box only while it
  // still holds the words that were sent: anything typed since is kept.
  const sentRef = useRef('');
  const clearSent = () => setText((cur) => (cur.trim() === sentRef.current ? '' : cur));
  // When the send answered (a done send or a found message refreshes the Bot's read first, so any read stamped later was asked
  // for after the Bot had the message).
  const sentAt = useRef<number | null>(null);
  const answered = (answer: SayAnswer | null) => {
    sentAt.current = Date.now();
    setShown({ t: 'answer', answer });
  };
  const sentAnswer = shown?.t === 'answer' ? shown.answer : undefined;
  const sentState = sentAnswer === undefined ? null : (sentAnswer?.state ?? 'posted');
  const sentTurn = sentAnswer?.turnId ?? null;
  const sentId = sentAnswer?.messageId ?? null;
  const { turnRunning, turnId, turnUnread } = bot;
  const queued = bot.queued > 0;
  useEffect(() => {
    if (sentState === null) return;
    const at = sentAt.current;
    const readAfter = at !== null && viewAt !== undefined && viewAt > at;
    // A read that did not say whether a turn runs proves nothing (unknown, never finished).
    const turnOver = readAfter && !turnUnread && !queued && (!turnRunning || (sentTurn !== null && turnId !== null && turnId !== sentTurn));
    // Posted or queued alike: the row that ends its own turn names it.
    const rowEnded = sentId !== null && answeredIn(rows, sentId);
    if (turnOver || rowEnded) setShown(null);
  }, [sentState, sentTurn, sentId, rows, viewAt, turnRunning, turnId, turnUnread, queued]);

  const send = async () => {
    if (clean === '' || tooLong || locked) return;
    setShown(null);
    sentRef.current = clean;
    sentAt.current = null;
    const r = await say.send(clean);
    if (r.outcome === 'done') {
      clearSent();
      answered((r.data as SayAnswer | null | undefined) ?? null);
    } else if (r.outcome === 'failed') setShown({ t: 'failed', error: r });
    else if (r.outcome !== 'pending') setShown({ t: 'notSent' });
  };
  const check = async () => {
    const r = await say.check();
    if (r.t === 'found') {
      clearSent();
      // Found later: the thread may already hold its answer, which names it.
      answered(r.answer);
    } else setShown({ t: 'check', check: r });
  };

  // Send stays focusable while it cannot send, and says why (kit ReasonButton).
  const whyNot = locked ? t('say.whyHeld') : tooLong ? t('say.whyLong') : clean === '' ? t('say.whyEmpty') : undefined;
  const answerLine = (a: SayAnswer | null): string => (a?.state === 'queued' ? t('say.queued') : t('say.sent'));
  // Inside the Composer's own layout, right above the box: the decline is said before Send, and a draft over the limit says so.
  const notes: ComposerNote[] = [
    ...(bot.gate ? [{ key: 'declines', text: t(bot.gate.type === 'question' ? 'say.skipsQuestion' : 'say.declines'), warn: true, describes: true }] : []),
    ...(tooLong ? [{ key: 'long', text: t('task.msgTooLong', { max: String(TASK_MESSAGE_MAX) }), warn: true, describes: true }] : []),
    ...talk.notes,
  ];

  return (
    <div className={s.say}>
      {say.held && (
        <OutcomeBanner
          kind="pending" /* noDetails: a lost answer has no error to show; the banner says what is and is not known */
          title={t('say.maybe')}
          known={t('say.maybeKnown')}
          checkLine={t('say.maybeCheck')}
          stopLine={t('say.maybeStop')}
          onCheck={() => void check()}
          checking={say.checking}
          onDismiss={() => void say.stopTracking().then((ok) => ok && setShown(null))}
        />
      )}
      {say.held && shown?.t === 'check' && <Band size="table">{t(`say.check.${shown.check.t}`)}</Band>}
      {shown?.t === 'failed' && <OutcomeBanner kind="failed" title={t('say.failed')} error={shown.error} />}
      {shown?.t === 'notSent' && <Band size="table">{t('say.notSent')}</Band>}
      {shown?.t === 'answer' && !say.held && <Band size="table">{answerLine(shown.answer)}</Band>}
      {talk.band}
      <Composer
        draft={text}
        setDraft={setText}
        inputRef={inputRef}
        placeholder={t('say.label')}
        label={t('say.label')}
        max={TASK_MESSAGE_MAX}
        canSend={whyNot === undefined}
        onSend={() => void send()}
        sendWhy={whyNot}
        sendQuiet={!!bot.gate}
        notes={notes}
        mic={talk.mic}
        talk={talk.talk}
        captions={talk.captions}
        attachments={NO_FILES}
        onRemoveAttachment={noop}
        flash={false}
        // A gate arriving never takes focus from this box: BotPane's keyboardHeld (the shell's typing rule) covers it.
        onTyping={noop}
      />
    </div>
  );
}
