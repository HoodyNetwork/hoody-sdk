// TrimDialog: "Remove what follows" on a finished reply. The agent keeps the history THROUGH that reply
// and removes every later message; it cannot be undone. The dialog is the item's own confirm, mounted by the turn menu outside its
// popover so it survives the popover closing.
//
// C9: the trim is sent once. A 200 {status:'ok', outcome:'done'} is the daemon's own correlated result and is done. A 202 pending,
// a lost answer or a 5xx without `trim_failed` is "may have gone through": the attempt is a record keyed by its chat and computer
// (trimAttempts.ts) that outlives the dialog and the menu, and only Check again settles it, by reading the CAPTURED chat's whole
// transcript through the Api that sent the trim. The read proves "done" only when the chat has EXACTLY the kept turns (turn + 1);
// more may still be cut later and fewer is not what was asked, so both stay unknown. A dialog is bound to the chat and reply that
// opened it: another chat or reply, a lost capability or a lost computer closes it and refuses the confirm.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { agent } from '@core';
import { ConfirmDialog, useStrings, type ConversationSource, type FaqItem, type OutcomeLike } from '@kit';
import { NO_BLOCKERS, useBlockedBy, type AttemptBlocker } from './attemptBlockers';
import type { ChatId } from './closeAttempts';
import { trimCap } from './trimGate';
import type { TrimAttempt, TrimAttempts } from './trimAttempts';
import strings from './TrimDialog.strings.en.json';

export interface TrimDialogProps {
  isOpen: boolean;
  /** The dialog was dismissed or ended (the host closes it). */
  onClose: () => void;
  /** The chat and computer this dialog acts on now (null: none), and the finished reply (0-based) it was opened on. */
  chat: (ChatId & { key: string }) | null;
  turn: number;
  calls: agent.SessionApi | null;
  source: ConversationSource;
  /** Why Trim is unavailable now ('' when it is). */
  unavailable: string;
  attempts: TrimAttempts;
  /** The other attempt stores (rename, close, delete) whose unsettled record for this chat holds the trim back: the agent loads and saves the
   *  chat's record in each of them without a shared lock. Any record blocks, whatever its phase (an unknown outcome is not a settled one). */
  blockers?: readonly AttemptBlocker[];
  /** The page's answer to why a change waits (its settle FAQ item) and the link's words: the dialog's FAQ link (its kit faq slot) while the busy
   *  line or this dialog's own unknown outcome shows. A routed parent supplies both; without them there is no link (and no router is needed). */
  faqItem?: FaqItem;
  faqLabel?: string;
  /** A read or the daemon's own result proved the history cut after `turn`. Fired once per attempt, with the full identity the trim
   *  was made for: that is the chat to reload, whatever this dialog is bound to by then. */
  onTrimmed?: (chat: ChatId, turn: number) => void;
  returnFocus: () => HTMLElement | null;
}

type Ui = OutcomeLike & { message?: string };

export function TrimDialog({ isOpen, onClose, chat, turn, calls, source, unavailable, attempts, blockers = NO_BLOCKERS, faqItem, faqLabel, onTrimmed, returnFocus }: TrimDialogProps) {
  const t = useStrings(strings);
  useSyncExternalStore(attempts.subscribe, attempts.version, attempts.version);
  const key = chat?.key ?? null;
  // Re-renders when any blocking record changes.
  const blocked = useBlockedBy(blockers, key);
  // What the dialog was opened on, taken when it opens and kept after it closes; reset in the render that opens it.
  const [wasOpen, setWasOpen] = useState(false);
  const [bound, setBound] = useState<{ key: string | null; turn: number }>({ key: null, turn: -1 });
  const [shown, setShown] = useState<TrimAttempt | null>(null);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) {
      setBound({ key, turn });
      setShown((key ? attempts.get(key) : undefined) ?? null);
    }
  }
  // The latest props, for the code that runs after an await.
  const live = useRef({ source, onTrimmed, chat, calls, bound, turn, blockers });
  live.current = { source, onTrimmed, chat, calls, bound, turn, blockers };

  // A dialog is bound to the chat and reply that opened it. So does the end of the trim it shows end it.
  useEffect(() => {
    if (isOpen && (bound.key !== key || bound.turn !== turn || unavailable !== '' || shown?.phase === 'done')) onClose();
  }, [isOpen, bound, key, turn, unavailable, shown?.phase, onClose]);

  const held = key ? attempts.get(key) : undefined;
  const busy = shown?.phase === 'sending';
  const failureWords = (f: TrimAttempt['failure']) => (f === 'busy' ? t('trim.busy') : f === 'cannot' ? t('trim.cannot') : f === 'gone' ? t('trim.gone') : f === 'failed' ? t('trim.failed') : t('trim.refused'));
  const out: Ui | undefined = shown?.phase === 'unknown' ? { kind: 'pending' }
    : shown?.phase === 'failed' ? { kind: 'failed', message: failureWords(shown.failure) }
      : undefined;

  const confirm = () => {
    // Read now, not from the render that drew the button: the chat, the reply, the capability and the computer may have changed.
    const { source: now, chat: c, calls: api, bound: b, turn: tn, blockers: bl } = live.current;
    if (!c || !api || b.key !== c.key || b.turn !== tn || !trimCap(now, tn).ok || attempts.get(c.key) || bl.some((x) => x.get(c.key) !== undefined)) return;
    const a: TrimAttempt = { key: c.key, chat: { computer: c.computer, realm: c.realm, sid: c.sid, target: c.target }, turn: tn, calls: api, phase: 'sending' };
    attempts.set(a);
    setShown(a);
    void a.calls.trim(a.chat.sid, a.turn, a.chat.realm).then((r) => {
      const res = agent.trimOf(r);
      if (res.k === 'done') { attempts.end(a, 'done'); live.current.onTrimmed?.(a.chat, a.turn); return; }
      if (res.k === 'unknown') { attempts.lost(a); return; } // stays recorded and locked: Check again, never sent again
      if (res.k === 'notLive') { attempts.end(a, 'failed', 'gone'); return; }
      if (res.k === 'failed') { attempts.end(a, 'failed', 'failed'); return; }
      attempts.end(a, 'failed', res.code === 'turn_in_flight' ? 'busy' : res.code === 'delegated_session' ? 'cannot' : 'refused');
    });
  };
  // Check again for ONE attempt: reads the CAPTURED chat's whole transcript through the Api that sent the trim. True only when the
  // chat has exactly the kept turns. Bound to the attempt object itself (identity checked after the await), so a callback an older
  // dialog handed out (a sticky toast) never reads another chat, and a second read that lost the race changes nothing.
  const checkOf = (a: TrimAttempt) => async (): Promise<boolean> => {
    if (attempts.get(a.key) !== a) return false;
    const read = agent.turnsOf(await a.calls.turns(a.chat.sid, a.chat.realm), a.chat.sid, a.chat.realm);
    if (attempts.get(a.key) !== a) return false;
    if (read.k === 'count' && read.n === a.turn + 1) { attempts.end(a, 'done'); live.current.onTrimmed?.(a.chat, a.turn); return true; }
    return false; // more may still be cut, fewer is not what was asked, an unreadable chat says nothing: still unknown
  };

  return (
    <ConfirmDialog
      overlayId="ai-turn-trim"
      isOpen={isOpen}
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={t('trim.title')}
      body={blocked ? `${t('trim.body')} ${t('trim.blocked')}` : t('trim.body')}
      confirmLabel={t('trim.go')}
      tone="danger"
      busy={busy}
      outcome={out}
      onCheck={shown ? checkOf(shown) : undefined}
      // `blocked === true`: the page-anatomy rule reads a bare name in this unknown prop as possible text; a comparison is data.
      confirmDisabled={unavailable !== '' || held !== undefined || blocked === true}
      onConfirm={confirm}
      returnFocus={returnFocus}
      faq={(blocked || shown?.phase === 'unknown') && faqItem && faqLabel ? { item: faqItem, label: faqLabel } : undefined}
    />
  );
}
