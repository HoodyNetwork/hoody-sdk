// DeleteDialog: "Delete chat" in the open chat's menu and in a list row's menu, one component. A hard
// delete closes the chat on its computer and removes its record and history for good. The dialog says that in one line (the
// longer explanation belongs in the page FAQ once the kit has one).
//
// C9: the delete is sent once. A lost answer is "may have gone through": the attempt is a record keyed by the chat's attemptKey
// (deleteAttempts.ts) that outlives the dialog and the menu; only Check again can settle it, by reading the CAPTURED chat through
// the Api that sent it. Only a 200 {status:'ok', hard:true} is "deleted". A read after a lost answer that finds the chat means it
// was not deleted; one that cannot find it says only that (a 404 is missing OR hidden from this caller, the gateway does not tell
// them apart), so it is never worded as "deleted". A 404 on the delete itself is "could not be found for you, nothing was
// deleted". 409 session_live ("still open somewhere else") is definite and is never retried by itself: the person closes the chat
// there and presses Delete again. Every end settled by a 404 tells the host (`onDeleted(chat, 'not_found')`) so the list refreshes.
// A dialog is bound to the chat that opened it: another chat, a lost capability or a lost computer closes it and refuses the confirm.
// A Rename, Close or Trim of the same chat that has not settled (sending, or an unknown answer waiting for Check again) blocks Delete: the
// host passes those records' stores as `blockers`, one line says why, and the confirm refuses at press time too. The reverse holds
// too: RenameDialog, CloseDialog and TrimDialog take the other stores, the delete store included, as their blockers (attemptBlockers.ts).
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { agent } from '@core';
import { ConfirmDialog, useStrings, type FaqItem, type OutcomeLike } from '@kit';
import { type ChatId } from './closeAttempts';
import { type DeleteAttempt, type DeleteAttempts } from './deleteAttempts';
import { NO_BLOCKERS, useBlockedBy, type AttemptBlocker } from './attemptBlockers';

import strings from './ConvMenu.strings.en.json';

/** What the host is told once per attempt: 'deleted' (the agent said so), or 'not_found' (the chat could not be found for this
 *  caller: refresh the list, claim nothing). */
export type DeletedHow = 'deleted' | 'not_found';

export interface DeleteDialogProps {
  isOpen: boolean;
  /** The dialog was dismissed or ended (the host closes it). */
  onClose: () => void;
  /** The chat and computer this menu acts on now (null: none). */
  chat: (ChatId & { key: string }) | null;
  calls: agent.SessionApi | null;
  /** Whether Delete is allowed right now, asked when Delete is pressed. The open chat's menu passes its own `source.can('delete').ok`
   *  (the one rule, never re-derived here); a list row has no source and passes the check that its list context still holds. */
  allowed: () => boolean;
  /** Why Delete is unavailable now ('' when it is). */
  unavailable: string;
  attempts: DeleteAttempts;
  /** The rename, close and trim records of the same chat: while one holds an unsettled record for it, Delete waits. */
  blockers?: readonly AttemptBlocker[];
  /** The page's answer to why a change waits (its settle FAQ item) and the link's words: the dialog's FAQ link (its kit faq slot) while the busy
   *  line or this dialog's own unknown outcome shows. A routed parent supplies both; without them there is no link (and no router is needed). */
  faqItem?: FaqItem;
  faqLabel?: string;
  /** Fired once per attempt with the full identity (computer, realm, session, target) the attempt was made for: act on that chat only. */
  onDeleted?: (chat: ChatId, how: DeletedHow) => void;
  returnFocus: () => HTMLElement | null;
}

type Ui = OutcomeLike & { message?: string };

export function DeleteDialog({ isOpen, onClose, chat, calls, allowed, unavailable, attempts, blockers = NO_BLOCKERS, faqItem, faqLabel, onDeleted, returnFocus }: DeleteDialogProps) {
  const t = useStrings(strings);
  useSyncExternalStore(attempts.subscribe, attempts.version, attempts.version);
  const key = chat?.key ?? null;
  // Re-renders when any blocking record changes.
  const blocked = useBlockedBy(blockers, key);
  // The dialog's chat key, taken when it opens and kept after it closes. The attempt it shows (null: a fresh one) is the
  // record's own object. Both are reset in the render that opens the dialog, so no effect ever sees the last dialog's end.
  const [wasOpen, setWasOpen] = useState(false);
  const [boundKey, setBoundKey] = useState<string | null>(null);
  const [shown, setShown] = useState<DeleteAttempt | null>(null);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setBoundKey(key);
      setShown((key ? attempts.get(key) : undefined) ?? null);
    }
  }
  // The latest props, for the code that runs after an await.
  const live = useRef({ allowed, onDeleted, chat, calls, boundKey, blockers });
  live.current = { allowed, onDeleted, chat, calls, boundKey, blockers };

  // A dialog is bound to the chat that opened it: another chat, a lost capability or a lost computer closes it. So does the end
  // of the delete it shows.
  useEffect(() => {
    if (isOpen && (boundKey !== key || unavailable !== '' || shown?.phase === 'done')) onClose();
  }, [isOpen, boundKey, key, unavailable, shown?.phase, onClose]);

  const held = key ? attempts.get(key) : undefined;
  const busy = shown?.phase === 'sending';
  const gone = shown?.phase === 'failed' && (shown.failure === 'missing' || shown.failure === 'absent');
  const failText = shown?.failure === 'live' ? t('delete.live') : shown?.failure === 'missing' ? t('delete.missing') : shown?.failure === 'absent' ? t('delete.absent')
    : shown?.failure === 'there' ? t('delete.there') : t('delete.refused');
  const out: Ui | undefined = shown?.phase === 'unknown' ? { kind: 'pending' } : shown?.phase === 'failed' ? { kind: 'failed', message: failText } : undefined;

  const confirm = () => {
    // Read now, not from the render that drew the button: the chat, the capability and the computer may have changed.
    const { allowed: ok, chat: c, calls: api } = live.current;
    if (!c || !api || live.current.boundKey !== c.key || !ok() || attempts.get(c.key) || live.current.blockers.some((b) => b.get(c.key) !== undefined)) return;
    const a: DeleteAttempt = { key: c.key, chat: { computer: c.computer, realm: c.realm, sid: c.sid, target: c.target }, sid: c.sid, realm: c.realm, calls: api, phase: 'sending' };
    attempts.set(a);
    setShown(a);
    void a.calls.delete(a.sid, a.realm).then((r) => {
      const res = agent.deleteOf(r);
      if (res.k === 'unknown') { attempts.lost(a); return; } // stays recorded and locked: Check again, never sent again
      if (attempts.get(a.key) !== a) return;
      if (res.k === 'done') { attempts.end(a, 'done'); live.current.onDeleted?.(a.chat, 'deleted'); return; }
      if (res.k === 'live') { attempts.end(a, 'failed', 'live'); return; }
      if (res.k === 'notFound') { attempts.end(a, 'failed', 'missing'); live.current.onDeleted?.(a.chat, 'not_found'); return; }
      attempts.end(a, 'failed', 'refused');
    });
  };
  // Reads the CAPTURED chat through the Api that sent the delete and settles ITS attempt by what the read says. Bound to the
  // attempt object itself (identity checked after the await), so a callback an older dialog handed out (a sticky toast) never
  // reads another chat, and a second read that lost the race changes nothing. Never true: a read cannot prove "deleted".
  const checkOf = (a: DeleteAttempt) => async (): Promise<boolean> => {
    if (attempts.get(a.key) !== a) return false; // already settled by another read
    const read = agent.presentOf(await a.calls.read(a.sid, a.realm), a.sid);
    if (attempts.get(a.key) !== a) return false;
    if (read === 'there') attempts.end(a, 'failed', 'there');
    else if (read === 'absent') { attempts.end(a, 'failed', 'absent'); live.current.onDeleted?.(a.chat, 'not_found'); }
    else attempts.lost(a); // the read could not say: still unknown
    return false;
  };

  return (
    <ConfirmDialog
      overlayId="ai-chat-delete"
      isOpen={isOpen}
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={t('delete.title')}
      body={blocked && !shown ? `${t('delete.body')} ${t('delete.busy')}` : t('delete.body')}
      tone="danger"
      confirmLabel={t('delete.go')}
      busy={busy}
      outcome={out}
      onCheck={shown ? checkOf(shown) : undefined}
      confirmDisabled={unavailable !== '' || held !== undefined || gone || blocked}
      onConfirm={confirm}
      returnFocus={returnFocus}
      faq={((blocked && !shown) || shown?.phase === 'unknown') && faqItem && faqLabel ? { item: faqItem, label: faqLabel } : undefined}
    />
  );
}
