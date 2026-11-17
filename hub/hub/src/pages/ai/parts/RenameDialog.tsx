// RenameDialog: "Rename" for one chat, shared by the open chat's menu (ConvMenu) and a chat list row (RowChat).
// Rename (C9): sent once. The agent's answer carries the stored title, which the caller hears, never the typed text; an answer
// without one stays unknown. A lost answer is "may have gone through": the attempt is a record keyed by its chat and computer
// (renameAttempts.ts) that outlives the dialog and the menu; reopening restores it locked, and only Check again can settle it,
// by reading the CAPTURED chat through the Api that sent it (each Check again is bound to its own attempt object, so an older
// toast never reads another chat), true only when the stored title is the one that was sent. When no read can prove it (a clear
// of a live chat comes back with a new automatic title), the person may stop tracking it, warned, which ends only that record
// and sends nothing; Rename is then offered again. What the dialog shows (busy,
// pending, failed, closed) is derived from that record, which is published, so a dialog mounted again while the request is out
// follows it to its end. A dialog is bound to the chat that opened it: another chat, a lost capability or a lost computer closes
// it and refuses the confirm. A chat that is gone, or a refusal, is a definite failure.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { agent } from '@core';
import { ConfirmDialog, TextButton, TextField, useStrings, type FaqItem, type OutcomeLike } from '@kit';
import type { ChatId } from './closeAttempts';
import type { RenameAttempt, RenameAttempts } from './renameAttempts';
import { NO_BLOCKERS, useBlockedBy, type AttemptBlocker } from './attemptBlockers';
import strings from './ConvMenu.strings.en.json';

export interface RenameDialogProps {
  isOpen: boolean;
  /** The dialog was dismissed or ended (the host closes it). */
  onClose: () => void;
  /** The chat and computer this dialog acts on now (null: none). */
  chat: (ChatId & { key: string }) | null;
  calls: agent.SessionApi | null;
  /** Whether Rename is allowed right now, asked when Rename is pressed. The open chat's menu passes its own `source.can('rename').ok`
   *  (the one rule, never re-derived here); a list row has no source and passes `() => true`: the agent is the judge of that chat. */
  allowed: () => boolean;
  /** Why Rename is unavailable now ('' when it is). */
  unavailable: string;
  /** The title shown now: the field starts with it, and the same text is not a rename. */
  current: string;
  /** What the field starts with instead of `current` when the dialog opens (a typed "/rename words"); an unsettled
   *  attempt's own name still wins. '' starts it empty (the automatic title). */
  seed?: string;
  attempts: RenameAttempts;
  /** The delete, trim and close records of the same chat: while one holds an unsettled one (sending, or unknown), Rename waits. */
  blockers?: readonly AttemptBlocker[];
  /** The page's answer to why a change waits (its settle FAQ item) and the link's words: the dialog's FAQ link (its kit faq slot) while the busy
   *  line or this dialog's own unknown outcome shows. A routed parent supplies both; without them there is no link (and no router is needed). */
  faqItem?: FaqItem;
  faqLabel?: string;
  /** The agent stored this title (null: it cleared it, the automatic one shows). `chat` is the full identity (computer, realm,
   *  session, target) the rename was made for: it may no longer be the chat this dialog is bound to. Fired once per attempt. */
  onRenamed?: (name: string | null, chat: ChatId) => void;
  returnFocus: () => HTMLElement | null;
}

type Ui = OutcomeLike & { message?: string };
const NAME_MAX = 200;

export function RenameDialog({ isOpen, onClose, chat, calls, allowed, unavailable, current, seed, attempts, blockers = NO_BLOCKERS, faqItem, faqLabel, onRenamed, returnFocus }: RenameDialogProps) {
  const t = useStrings(strings);
  useSyncExternalStore(attempts.subscribe, attempts.version, attempts.version);
  const key = chat?.key ?? null;
  const blocked = useBlockedBy(blockers, key);
  // The dialog's chat key, the field and the attempt it shows (null: a fresh one; the record's own object), taken in the render
  // that opens the dialog and kept after it closes, so no effect ever sees the last dialog's end.
  const [wasOpen, setWasOpen] = useState(false);
  const [boundKey, setBoundKey] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [shown, setShown] = useState<RenameAttempt | null>(null);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      const a = key ? attempts.get(key) : undefined;
      setBoundKey(key);
      setName(a ? a.name : seed ?? current);
      setShown(a ?? null);
    }
  }
  // The latest props, for the code that runs after an await.
  const live = useRef({ allowed, onRenamed, chat, calls, boundKey, blockers });
  live.current = { allowed, onRenamed, chat, calls, boundKey, blockers };

  const attempt = name.trim();
  // A rename that is out or unknown for this chat: nothing but Check again is offered for it.
  const held = key ? attempts.get(key) : undefined;
  const busy = shown?.phase === 'sending';
  const out: Ui | undefined = shown?.phase === 'unknown' ? { kind: 'pending' }
    : shown?.phase === 'failed' ? { kind: 'failed', message: shown.failure === 'gone' ? t('rename.gone') : shown.failure === 'bad' ? t('rename.bad') : t('rename.refused') }
      : undefined;

  // A dialog is bound to the chat that opened it: another chat, a lost capability or a lost computer closes it. So does the
  // end of the rename it shows (proved by the attempt's own owner, or by a Check again).
  useEffect(() => {
    if (isOpen && (boundKey !== key || unavailable !== '' || shown?.phase === 'done')) onClose();
  }, [isOpen, boundKey, key, unavailable, shown?.phase, onClose]);

  const confirm = () => {
    // Read now, not from the render that drew the button: the chat, the capability and the computer may have changed.
    const { allowed: ok, chat: c, calls: api } = live.current;
    if (!c || !api || live.current.boundKey !== c.key || !ok() || attempts.get(c.key) || live.current.blockers.some((b) => b.get(c.key) !== undefined)) return;
    const a: RenameAttempt = { key: c.key, chat: { computer: c.computer, realm: c.realm, sid: c.sid, target: c.target }, sid: c.sid, realm: c.realm, calls: api, name: attempt, phase: 'sending' };
    attempts.set(a);
    setShown(a);
    void a.calls.rename(a.sid, a.name, a.realm).then((r) => {
      const res = agent.renameOf(r);
      if (res.k === 'done') {
        attempts.end(a, 'done');
        live.current.onRenamed?.(res.name === '' ? null : res.name, a.chat);
        return;
      }
      if (res.k === 'unknown') { attempts.lost(a); return; } // stays recorded and locked: Check again, never sent again
      attempts.end(a, 'failed', res.k === 'gone' ? 'gone' : res.status === 400 || res.status === 422 ? 'bad' : 'refused');
    });
  };
  // Check again for ONE attempt: true only when the CAPTURED chat, read through the Api that sent the rename, carries the title
  // that was sent as a person's title: a title the agent made itself (name_auto) proves nothing, not even one with the same
  // words, and after a clear only an unnamed chat does (a generated title may predate a clear that has not arrived yet).
  // Bound to the attempt object itself, so a callback an older dialog handed out (a sticky toast) never reads another chat.
  const checkOf = (a: RenameAttempt) => async (): Promise<boolean> => {
    if (a.phase !== 'unknown' || attempts.get(a.key) !== a) return false;
    const stored = agent.sessionTitleOf(await a.calls.read(a.sid, a.realm), a.sid);
    const landed = stored !== null && stored.name === a.name && !stored.auto;
    if (!landed || attempts.get(a.key) !== a) return false;
    attempts.end(a, 'done');
    live.current.onRenamed?.(a.name === '' ? null : a.name, a.chat);
    return true;
  };
  // Stop tracking ONE attempt, the person's warned choice: the record ends as neither done nor failed, nothing is sent, and the
  // field keeps the name that was sent. Bound to the attempt object, so it never ends a later rename of the chat.
  const stopTracking = (a: RenameAttempt) => () => {
    if (attempts.drop(a)) setShown(null);
  };
  const unsure = shown?.phase === 'unknown' ? shown : null;

  return (
    <ConfirmDialog
      overlayId="ai-chat-rename"
      isOpen={isOpen}
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={t('rename.title')}
      confirmLabel={t('rename.go')}
      busy={busy}
      outcome={out}
      onCheck={shown ? checkOf(shown) : undefined}
      // The warning is the outcome's line and describes Stop tracking, so it is heard however focus reaches the button.
      outcomeDetail={unsure ? t('rename.dismissWarn') : undefined}
      outcomeActions={unsure ? ({ detailId }) => <TextButton aria-describedby={detailId} onPress={stopTracking(unsure)}>{t('rename.dismiss')}</TextButton> : undefined}
      confirmDisabled={unavailable !== '' || held !== undefined || blocked || attempt === current}
      onConfirm={confirm}
      returnFocus={returnFocus}
      faq={(blocked || shown?.phase === 'unknown') && faqItem && faqLabel ? { item: faqItem, label: faqLabel } : undefined}
    >
      {/* The dialog opens on the name to type, on the web and in a terminal (a terminal confirm opens on a field only when
          the field asks for it, else on Cancel); never on the field while it is off. */}
      {/* eslint-disable-next-line jsx-a11y/no-autofocus -- the one field this dialog is for; the web dialog focuses it too */}
      <TextField label={t('rename.label')} value={name} onChange={(v) => setName(v.slice(0, NAME_MAX))} description={unavailable || (blocked ? t('rename.busy') : t('rename.help'))} isDisabled={busy || held !== undefined} autoFocus={!busy && held === undefined} />
    </ConfirmDialog>
  );
}
