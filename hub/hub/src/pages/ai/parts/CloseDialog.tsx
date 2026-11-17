// CloseDialog: "Close" in the chat's menu. Closing tears the chat down on its computer (a
// running turn is cancelled, a waiting approval ends) and ends its loops; the chat stays in the list and opens again. The loops
// sentence comes from a read made when the dialog opens: a count when the agent's page is complete and consistent, "if it has
// any" when it could not be read, nothing only when zero is proven. Confirm waits for that read, so the warning is always shown.
//
// C9: the close is sent once. A lost answer is "may have gone through": the attempt is a record keyed by its chat and computer
// (closeAttempts.ts) that outlives the dialog and the menu; only Check again can settle it, by reading the CAPTURED chat through
// the Api that sent it. The route's answer ({status:'ok'}) only says the gateway let go of its own connection; it is not proof:
// after it (or after a 404 "not live", which may be a chat closed already) the CAPTURED chat is read back, and "closed" is shown
// only when that read says nothing is attached. A chat still attached ends the attempt as "still open" (another window or client
// holds it; a fact of the read, not a claim about what the close did); a read that cannot say leaves the attempt unknown with
// Check again. A dialog is bound to the chat that opened it: another chat, a lost capability or a lost computer closes it and
// refuses the confirm.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { agent } from '@core';
import { ConfirmDialog, useStrings, type FaqItem, type OutcomeLike } from '@kit';
import { type ChatId, type CloseAttempt, type CloseAttempts } from './closeAttempts';
import { NO_BLOCKERS, useBlockedBy, type AttemptBlocker } from './attemptBlockers';
import strings from './ConvMenu.strings.en.json';

export interface CloseDialogProps {
  isOpen: boolean;
  /** The dialog was dismissed or ended (the host closes it). */
  onClose: () => void;
  /** The chat and computer this menu acts on now (null: none). */
  chat: (ChatId & { key: string }) | null;
  calls: agent.SessionApi | null;
  /** Whether Close is allowed right now, asked when Close is pressed. The open chat's menu passes its own `source.can('close').ok`
   *  (the one rule, never re-derived here); a list row has no source and passes `() => true`: the agent is the judge of that chat. */
  allowed: () => boolean;
  /** Why Close is unavailable now ('' when it is). */
  unavailable: string;
  attempts: CloseAttempts;
  /** The delete, trim and rename records of the same chat: while one holds an unsettled one (sending, or unknown), Close waits. */
  blockers?: readonly AttemptBlocker[];
  /** The page's answer to why a change waits (its settle FAQ item) and the link's words: the dialog's FAQ link (its kit faq slot) while the busy
   *  line or this dialog's own unknown outcome shows. A routed parent supplies both; without them there is no link (and no router is needed). */
  faqItem?: FaqItem;
  faqLabel?: string;
  /** A read proved the chat closed (after the close, or on a Check again). Fired once per attempt, with the full identity (computer,
   *  realm, session, target) the attempt was made for: that is the chat to show as closed, whatever this dialog is bound to by then. */
  onClosed?: (chat: ChatId) => void;
  returnFocus: () => HTMLElement | null;
}

type Loops = { k: 'reading' } | { k: 'count'; n: number } | { k: 'unknown' };
type Ui = OutcomeLike & { message?: string };

export function CloseDialog({ isOpen, onClose, chat, calls, allowed, unavailable, attempts, blockers = NO_BLOCKERS, faqItem, faqLabel, onClosed, returnFocus }: CloseDialogProps) {
  const t = useStrings(strings);
  useSyncExternalStore(attempts.subscribe, attempts.version, attempts.version);
  const key = chat?.key ?? null;
  const blocked = useBlockedBy(blockers, key);
  // The dialog's chat key, taken when it opens and kept after it closes. The attempt it shows (null: a fresh one) is the
  // record's own object. Both are reset in the render that opens the dialog, so no effect ever sees the last dialog's end.
  const [wasOpen, setWasOpen] = useState(false);
  const [boundKey, setBoundKey] = useState<string | null>(null);
  const [shown, setShown] = useState<CloseAttempt | null>(null);
  const [loops, setLoops] = useState<Loops>({ k: 'reading' });
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      const a = key ? attempts.get(key) : undefined;
      setBoundKey(key);
      setShown(a ?? null);
      setLoops(!chat || !calls || a ? { k: 'unknown' } : { k: 'reading' });
    }
  }
  // The latest props, for the code that runs after an await.
  const live = useRef({ allowed, onClosed, chat, calls, boundKey, blockers });
  live.current = { allowed, onClosed, chat, calls, boundKey, blockers };

  // Opening: read the chat's loops for the sentence (a dialog that restores a lost close needs none).
  const sid = chat?.sid, realm = chat?.realm, chatKey = chat?.key;
  useEffect(() => {
    if (!isOpen || !boundKey || !calls || !sid || realm === undefined || chatKey !== boundKey || attempts.get(boundKey)) return;
    let stale = false;
    void calls.loops(sid, realm).then((r) => {
      if (!stale && live.current.boundKey === boundKey) setLoops(agent.loopsOf(r, sid));
    });
    return () => { stale = true; };
  }, [isOpen, boundKey, calls, attempts, sid, realm, chatKey]);

  // A dialog is bound to the chat that opened it: another chat, a lost capability or a lost computer closes it. So does the end
  // of the close it shows (proved by the attempt's own owner, or by a Check again).
  useEffect(() => {
    if (isOpen && (boundKey !== key || unavailable !== '' || shown?.phase === 'done')) onClose();
  }, [isOpen, boundKey, key, unavailable, shown?.phase, onClose]);

  const held = key ? attempts.get(key) : undefined;
  const busy = shown?.phase === 'sending';
  const out: Ui | undefined = shown?.phase === 'unknown' ? { kind: 'pending' }
    : shown?.phase === 'failed' ? { kind: 'failed', message: shown.failure === 'gone' ? t('close.gone') : shown.failure === 'open' ? t('close.open') : t('close.refused') }
      : undefined;

  const confirm = () => {
    // Read now, not from the render that drew the button: the chat, the capability and the computer may have changed.
    const { allowed: ok, chat: c, calls: api } = live.current;
    if (!c || !api || live.current.boundKey !== c.key || !ok() || attempts.get(c.key) || live.current.blockers.some((b) => b.get(c.key) !== undefined) || loops.k === 'reading') return;
    const a: CloseAttempt = { key: c.key, chat: { computer: c.computer, realm: c.realm, sid: c.sid, target: c.target }, sid: c.sid, realm: c.realm, calls: api, phase: 'sending' };
    attempts.set(a);
    setShown(a);
    void a.calls.close(a.sid, a.realm).then((r) => {
      const res = agent.closeOf(r);
      if (res.k === 'unknown') { attempts.lost(a); return; } // stays recorded and locked: Check again, never sent again
      if (res.k === 'refused') { attempts.end(a, 'failed', 'refused'); return; }
      void prove(a); // 'done' and 'notLive' are not proof: read the chat back
    });
  };
  // Reads the CAPTURED chat through the Api that sent the close and settles ITS attempt by what the read proves. True only when
  // the agent says nothing is attached. Bound to the attempt object itself (identity checked after the await), so a callback an
  // older dialog handed out (a sticky toast) never reads another chat, and a second read that lost the race changes nothing.
  const prove = async (a: CloseAttempt): Promise<boolean> => {
    const read = agent.closedOf(await a.calls.read(a.sid, a.realm), a.sid);
    if (attempts.get(a.key) !== a) return false;
    if (read === 'closed') { attempts.end(a, 'done'); live.current.onClosed?.(a.chat); return true; }
    if (read === 'open') attempts.end(a, 'failed', 'open');
    else if (read === 'gone') attempts.end(a, 'failed', 'gone');
    else attempts.lost(a); // the read could not say: still unknown
    return false;
  };
  // Check again for ONE attempt: the same proof read, only from an unknown attempt.
  const checkOf = (a: CloseAttempt) => async (): Promise<boolean> => {
    if (attempts.get(a.key) !== a) return false; // already settled by another read
    return prove(a);
  };

  const loopsLine = loops.k === 'count' ? (loops.n === 0 ? '' : t(loops.n === 1 ? 'close.loops.one' : 'close.loops.other', { count: String(loops.n) }))
    : loops.k === 'unknown' ? t('close.loops.unknown') : t('close.loops.reading');

  return (
    <ConfirmDialog
      overlayId="ai-chat-close"
      isOpen={isOpen}
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={t('close.title')}
      body={[t('close.body'), loopsLine, blocked && !shown ? t('close.busy') : ''].filter(Boolean).join(' ')}
      confirmLabel={t('close.go')}
      busy={busy}
      outcome={out}
      onCheck={shown ? checkOf(shown) : undefined}
      confirmDisabled={unavailable !== '' || held !== undefined || blocked || loops.k === 'reading'}
      onConfirm={confirm}
      returnFocus={returnFocus}
      faq={((blocked && !shown) || shown?.phase === 'unknown') && faqItem && faqLabel ? { item: faqItem, label: faqLabel } : undefined}
    />
  );
}
